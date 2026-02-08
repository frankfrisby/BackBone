/**
 * Knowledge Database — SQLite with FTS5 + Vector Search
 *
 * Provides hybrid search (keyword + semantic) across all BACKBONE knowledge:
 * goals, memory, projects, research, conversations, beliefs.
 *
 * Architecture:
 * - documents table: source metadata (file path, type, hash)
 * - chunks table: text segments (~400 tokens with 80 token overlap)
 * - chunks_fts: FTS5 index for BM25 keyword search
 * - vec_chunks: sqlite-vec index for cosine similarity
 * - embedding_cache: SHA-256 hash → embedding (avoids re-computing)
 *
 * Hybrid search uses Reciprocal Rank Fusion (RRF) to combine results.
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDataDir, getMemoryDir, getProjectsDir, dataFile } from "../paths.js";

// Embedding dimensions (configurable per model)
const DEFAULT_DIMS = 768;
const CHUNK_MAX_CHARS = 1600; // ~400 tokens at 4 chars/token
const CHUNK_OVERLAP_CHARS = 320; // ~80 tokens overlap

let _db = null;

/**
 * Get or create the knowledge database
 */
export function getKnowledgeDB() {
  if (_db) return _db;

  const dbPath = dataFile("knowledge.sqlite");
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new Database(dbPath);

  // Load sqlite-vec extension
  sqliteVec.load(_db);

  // Performance settings
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");
  _db.pragma("cache_size = -64000"); // 64MB cache
  _db.pragma("mmap_size = 268435456"); // 256MB mmap

  // Create schema
  initSchema(_db);

  return _db;
}

/**
 * Initialize database schema
 */
function initSchema(db) {
  db.exec(`
    -- Schema version tracking
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Source documents (files, conversations, etc.)
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_path TEXT,
      title TEXT,
      hash TEXT NOT NULL,
      chunk_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(source_type);
    CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(hash);

    -- Text chunks with embeddings
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      hash TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding BLOB,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_type ON chunks(source_type);
    CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(hash);

    -- FTS5 full-text search index
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      text,
      source_type,
      content='chunks',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, text, source_type) VALUES (new.rowid, new.text, new.source_type);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, text, source_type) VALUES('delete', old.rowid, old.text, old.source_type);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, text, source_type) VALUES('delete', old.rowid, old.text, old.source_type);
      INSERT INTO chunks_fts(rowid, text, source_type) VALUES (new.rowid, new.text, new.source_type);
    END;

    -- Embedding cache (avoid re-computing for unchanged content)
    CREATE TABLE IF NOT EXISTS embedding_cache (
      hash TEXT PRIMARY KEY,
      embedding BLOB NOT NULL,
      model TEXT NOT NULL,
      dims INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Create vec0 virtual table for vector search
  // This needs to be done separately as it uses extension syntax
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        chunk_id TEXT PRIMARY KEY,
        embedding float[${DEFAULT_DIMS}]
      );
    `);
  } catch (e) {
    // Table might already exist with different dims
    if (!e.message.includes("already exists")) {
      console.error("Failed to create vec_chunks:", e.message);
    }
  }

  // Set schema version
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '1')").run();
}

/**
 * Split text into overlapping chunks, preserving line boundaries
 */
export function chunkText(content, maxChars = CHUNK_MAX_CHARS, overlapChars = CHUNK_OVERLAP_CHARS) {
  const lines = content.split("\n");
  const chunks = [];
  let current = [];
  let currentChars = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    current.push({ text: line, lineNo: i });
    currentChars += line.length + 1;

    if (currentChars >= maxChars) {
      chunks.push({
        text: current.map(c => c.text).join("\n"),
        startLine: current[0].lineNo,
        endLine: current[current.length - 1].lineNo
      });

      // Keep overlap from the end
      let acc = 0;
      const kept = [];
      for (let j = current.length - 1; j >= 0; j--) {
        acc += current[j].text.length + 1;
        kept.unshift(current[j]);
        if (acc >= overlapChars) break;
      }
      current = kept;
      currentChars = kept.reduce((sum, e) => sum + e.text.length + 1, 0);
    }
  }

  if (current.length > 0) {
    chunks.push({
      text: current.map(c => c.text).join("\n"),
      startLine: current[0].lineNo,
      endLine: current[current.length - 1].lineNo
    });
  }

  return chunks;
}

/**
 * Hash text content for deduplication
 */
export function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Generate a unique chunk ID
 */
function chunkId(documentId, index) {
  return `${documentId}:${index}`;
}

/**
 * Index a document into the knowledge base
 *
 * @param {string} sourceType - 'goal', 'memory', 'project', 'research', 'conversation', 'belief'
 * @param {string} sourcePath - file path or identifier
 * @param {string} content - text content to index
 * @param {string} [title] - optional title
 * @param {Function} [embedFn] - async function(text) => Float32Array (optional)
 */
export async function indexDocument(sourceType, sourcePath, content, title = null, embedFn = null) {
  const db = getKnowledgeDB();
  const contentHash = hashText(content);
  const docId = hashText(`${sourceType}:${sourcePath}`);
  const now = Date.now();

  // Check if document has changed
  const existing = db.prepare("SELECT hash FROM documents WHERE id = ?").get(docId);
  if (existing && existing.hash === contentHash) {
    return { status: "unchanged", docId, chunks: 0 };
  }

  // Split into chunks
  const chunks = chunkText(content);

  // Start transaction
  const indexAll = db.transaction(async () => {
    // Delete old chunks for this document
    const oldChunks = db.prepare("SELECT id FROM chunks WHERE document_id = ?").all(docId);
    for (const old of oldChunks) {
      db.prepare("DELETE FROM vec_chunks WHERE chunk_id = ?").run(old.id);
    }
    db.prepare("DELETE FROM chunks WHERE document_id = ?").run(docId);

    // Upsert document
    db.prepare(`
      INSERT OR REPLACE INTO documents (id, source_type, source_path, title, hash, chunk_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM documents WHERE id = ?), ?), ?)
    `).run(docId, sourceType, sourcePath, title, contentHash, chunks.length, docId, now, now);

    // Insert chunks
    const insertChunk = db.prepare(`
      INSERT INTO chunks (id, document_id, source_type, chunk_index, start_line, end_line, hash, text, embedding, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertVec = db.prepare(`
      INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)
    `);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const cId = chunkId(docId, i);
      const cHash = hashText(chunk.text);

      // Get or compute embedding
      let embeddingBuf = null;
      if (embedFn) {
        // Check cache first
        const cached = db.prepare("SELECT embedding FROM embedding_cache WHERE hash = ?").get(cHash);
        if (cached) {
          embeddingBuf = cached.embedding;
        } else {
          const embedding = await embedFn(chunk.text);
          embeddingBuf = Buffer.from(new Float32Array(embedding).buffer);
          db.prepare(`
            INSERT OR REPLACE INTO embedding_cache (hash, embedding, model, dims, created_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(cHash, embeddingBuf, "default", embedding.length, now);
        }
      }

      insertChunk.run(cId, docId, sourceType, i, chunk.startLine, chunk.endLine, cHash, chunk.text, embeddingBuf, now);

      if (embeddingBuf) {
        insertVec.run(cId, embeddingBuf);
      }
    }
  });

  // Run as sync transaction (embedFn makes it async)
  if (embedFn) {
    // For async embedding, we need to handle differently
    await indexDocumentAsync(db, docId, sourceType, sourcePath, title, contentHash, chunks, embedFn, now);
  } else {
    // Sync path (no embeddings)
    const syncIndex = db.transaction(() => {
      const oldChunks = db.prepare("SELECT id FROM chunks WHERE document_id = ?").all(docId);
      for (const old of oldChunks) {
        db.prepare("DELETE FROM vec_chunks WHERE chunk_id = ?").run(old.id);
      }
      db.prepare("DELETE FROM chunks WHERE document_id = ?").run(docId);

      db.prepare(`
        INSERT OR REPLACE INTO documents (id, source_type, source_path, title, hash, chunk_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM documents WHERE id = ?), ?), ?)
      `).run(docId, sourceType, sourcePath, title, contentHash, chunks.length, docId, now, now);

      const insertChunk = db.prepare(`
        INSERT INTO chunks (id, document_id, source_type, chunk_index, start_line, end_line, hash, text, embedding, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const cId = chunkId(docId, i);
        const cHash = hashText(chunk.text);
        insertChunk.run(cId, docId, sourceType, i, chunk.startLine, chunk.endLine, cHash, chunk.text, null, now);
      }
    });
    syncIndex();
  }

  return { status: existing ? "updated" : "created", docId, chunks: chunks.length };
}

/**
 * Async document indexing with embeddings
 */
async function indexDocumentAsync(db, docId, sourceType, sourcePath, title, contentHash, chunks, embedFn, now) {
  // Delete old data
  const oldChunks = db.prepare("SELECT id FROM chunks WHERE document_id = ?").all(docId);
  for (const old of oldChunks) {
    db.prepare("DELETE FROM vec_chunks WHERE chunk_id = ?").run(old.id);
  }
  db.prepare("DELETE FROM chunks WHERE document_id = ?").run(docId);

  db.prepare(`
    INSERT OR REPLACE INTO documents (id, source_type, source_path, title, hash, chunk_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM documents WHERE id = ?), ?), ?)
  `).run(docId, sourceType, sourcePath, title, contentHash, chunks.length, docId, now, now);

  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, document_id, source_type, chunk_index, start_line, end_line, hash, text, embedding, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertVec = db.prepare(`
    INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)
  `);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const cId = chunkId(docId, i);
    const cHash = hashText(chunk.text);

    // Check embedding cache
    let embeddingBuf = null;
    const cached = db.prepare("SELECT embedding FROM embedding_cache WHERE hash = ?").get(cHash);
    if (cached) {
      embeddingBuf = cached.embedding;
    } else {
      try {
        const embedding = await embedFn(chunk.text);
        embeddingBuf = Buffer.from(new Float32Array(embedding).buffer);
        db.prepare(`
          INSERT OR REPLACE INTO embedding_cache (hash, embedding, model, dims, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(cHash, embeddingBuf, "default", embedding.length, now);
      } catch (e) {
        // Embedding failed, index without vector
        console.warn(`Embedding failed for chunk ${cId}:`, e.message);
      }
    }

    insertChunk.run(cId, docId, sourceType, i, chunk.startLine, chunk.endLine, cHash, chunk.text, embeddingBuf, now);

    if (embeddingBuf) {
      insertVec.run(cId, embeddingBuf);
    }
  }
}

/**
 * Full-text keyword search using FTS5 + BM25
 *
 * @param {string} query - search terms
 * @param {object} options - { limit, sourceType }
 * @returns {Array} results with text, score, source info
 */
export function searchKeyword(query, options = {}) {
  const { limit = 20, sourceType = null } = options;
  const db = getKnowledgeDB();

  // Sanitize FTS5 query (escape special chars)
  const safeQuery = query.replace(/['"]/g, "").replace(/[^\w\s-]/g, " ").trim();
  if (!safeQuery) return [];

  let sql = `
    SELECT
      c.id,
      c.text,
      c.source_type,
      c.document_id,
      c.start_line,
      c.end_line,
      d.source_path,
      d.title,
      rank AS bm25_score
    FROM chunks_fts f
    JOIN chunks c ON c.rowid = f.rowid
    JOIN documents d ON d.id = c.document_id
    WHERE chunks_fts MATCH ?
  `;

  const params = [safeQuery];

  if (sourceType) {
    sql += " AND c.source_type = ?";
    params.push(sourceType);
  }

  sql += " ORDER BY rank LIMIT ?";
  params.push(limit);

  try {
    return db.prepare(sql).all(...params);
  } catch (e) {
    // FTS5 query syntax errors
    console.warn("FTS5 search error:", e.message);
    return [];
  }
}

/**
 * Vector similarity search using sqlite-vec
 *
 * @param {Float32Array|Array} queryEmbedding - query vector
 * @param {object} options - { limit, sourceType }
 * @returns {Array} results with text, distance, source info
 */
export function searchVector(queryEmbedding, options = {}) {
  const { limit = 20, sourceType = null } = options;
  const db = getKnowledgeDB();

  const embedding = queryEmbedding instanceof Float32Array
    ? queryEmbedding
    : new Float32Array(queryEmbedding);

  let results;
  try {
    results = db.prepare(`
      SELECT
        chunk_id,
        distance
      FROM vec_chunks
      WHERE embedding MATCH ?
        AND k = ?
    `).all(Buffer.from(embedding.buffer), limit * 2); // Fetch extra for filtering
  } catch (e) {
    console.warn("Vector search error:", e.message);
    return [];
  }

  if (results.length === 0) return [];

  // Fetch chunk details
  const chunkIds = results.map(r => r.chunk_id);
  const placeholders = chunkIds.map(() => "?").join(",");

  let sql = `
    SELECT
      c.id,
      c.text,
      c.source_type,
      c.document_id,
      c.start_line,
      c.end_line,
      d.source_path,
      d.title
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.id IN (${placeholders})
  `;

  const params = [...chunkIds];

  if (sourceType) {
    sql += " AND c.source_type = ?";
    params.push(sourceType);
  }

  const chunks = db.prepare(sql).all(...params);
  const chunkMap = new Map(chunks.map(c => [c.id, c]));

  // Combine with distances
  return results
    .filter(r => chunkMap.has(r.chunk_id))
    .slice(0, limit)
    .map(r => ({
      ...chunkMap.get(r.chunk_id),
      distance: r.distance,
      similarity: 1 - r.distance // cosine similarity
    }));
}

/**
 * Hybrid search — combines FTS5 keyword + vector similarity
 * Uses Reciprocal Rank Fusion (RRF) for score combination
 *
 * @param {string} query - text query
 * @param {Float32Array|Array|null} queryEmbedding - query vector (optional)
 * @param {object} options
 * @returns {Array} ranked results
 */
export function searchHybrid(query, queryEmbedding = null, options = {}) {
  const {
    limit = 20,
    sourceType = null,
    vectorWeight = 0.7,
    textWeight = 0.3,
    rrfK = 60
  } = options;

  // Get keyword results
  const keywordResults = searchKeyword(query, { limit: limit * 2, sourceType });

  // Get vector results (if embedding provided)
  let vectorResults = [];
  if (queryEmbedding) {
    vectorResults = searchVector(queryEmbedding, { limit: limit * 2, sourceType });
  }

  // If no vector results, return keyword results only
  if (vectorResults.length === 0) {
    return keywordResults.slice(0, limit).map((r, i) => ({
      ...r,
      score: 1.0 / (rrfK + i + 1),
      matchType: "keyword"
    }));
  }

  // If no keyword results, return vector results only
  if (keywordResults.length === 0) {
    return vectorResults.slice(0, limit).map((r, i) => ({
      ...r,
      score: 1.0 / (rrfK + i + 1),
      matchType: "vector"
    }));
  }

  // Reciprocal Rank Fusion
  const scoreMap = new Map();

  // Add keyword results
  keywordResults.forEach((r, rank) => {
    const existing = scoreMap.get(r.id) || { ...r, keywordRank: null, vectorRank: null, rrfScore: 0 };
    existing.keywordRank = rank + 1;
    existing.rrfScore += textWeight * (1.0 / (rrfK + rank + 1));
    scoreMap.set(r.id, existing);
  });

  // Add vector results
  vectorResults.forEach((r, rank) => {
    const existing = scoreMap.get(r.id) || { ...r, keywordRank: null, vectorRank: null, rrfScore: 0 };
    existing.vectorRank = rank + 1;
    existing.rrfScore += vectorWeight * (1.0 / (rrfK + rank + 1));
    existing.similarity = r.similarity;
    existing.distance = r.distance;
    scoreMap.set(r.id, existing);
  });

  // Sort by RRF score
  return Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map(r => ({
      ...r,
      score: r.rrfScore,
      matchType: r.keywordRank && r.vectorRank ? "hybrid" :
                 r.keywordRank ? "keyword" : "vector"
    }));
}

/**
 * Index all BACKBONE knowledge sources
 * Scans memory/, projects/, goals, beliefs, etc.
 *
 * @param {Function} [embedFn] - optional async embedding function
 * @returns {object} indexing stats
 */
export async function indexAllSources(embedFn = null) {
  const stats = { indexed: 0, unchanged: 0, errors: 0, chunks: 0 };

  // 1. Index memory files
  const memoryDir = getMemoryDir();
  if (fs.existsSync(memoryDir)) {
    const files = fs.readdirSync(memoryDir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      try {
        const filePath = path.join(memoryDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const title = file.replace(".md", "").replace(/-/g, " ");
        const result = await indexDocument("memory", filePath, content, title, embedFn);
        if (result.status === "unchanged") stats.unchanged++;
        else { stats.indexed++; stats.chunks += result.chunks; }
      } catch (e) {
        stats.errors++;
      }
    }
  }

  // 2. Index project files
  const projectsDir = getProjectsDir();
  if (fs.existsSync(projectsDir)) {
    try {
      const projects = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());
      for (const proj of projects) {
        const projectMd = path.join(projectsDir, proj.name, "PROJECT.md");
        if (fs.existsSync(projectMd)) {
          try {
            const content = fs.readFileSync(projectMd, "utf-8");
            const result = await indexDocument("project", projectMd, content, proj.name, embedFn);
            if (result.status === "unchanged") stats.unchanged++;
            else { stats.indexed++; stats.chunks += result.chunks; }
          } catch (e) {
            stats.errors++;
          }
        }
      }
    } catch (e) {
      stats.errors++;
    }
  }

  // 3. Index goals
  const goalsFile = dataFile("goals.json");
  if (fs.existsSync(goalsFile)) {
    try {
      const goals = JSON.parse(fs.readFileSync(goalsFile, "utf-8"));
      const goalsArr = Array.isArray(goals) ? goals : goals.goals || [];
      for (const goal of goalsArr) {
        const content = `# ${goal.title}\nCategory: ${goal.category}\nStatus: ${goal.status}\nPriority: ${goal.priority}\n\n${goal.description || ""}\n\nTasks:\n${(goal.tasks || []).map(t => `- ${t}`).join("\n")}`;
        const result = await indexDocument("goal", `goal:${goal.id}`, content, goal.title, embedFn);
        if (result.status === "unchanged") stats.unchanged++;
        else { stats.indexed++; stats.chunks += result.chunks; }
      }
    } catch (e) {
      stats.errors++;
    }
  }

  // 4. Index beliefs
  const beliefsFile = dataFile("core-beliefs.json");
  if (fs.existsSync(beliefsFile)) {
    try {
      const beliefs = JSON.parse(fs.readFileSync(beliefsFile, "utf-8"));
      const beliefsArr = Array.isArray(beliefs) ? beliefs : beliefs.beliefs || [];
      const content = beliefsArr.map(b => `## ${b.name}\n${b.description || ""}`).join("\n\n");
      if (content.trim()) {
        const result = await indexDocument("belief", "core-beliefs", content, "Core Beliefs", embedFn);
        if (result.status === "unchanged") stats.unchanged++;
        else { stats.indexed++; stats.chunks += result.chunks; }
      }
    } catch (e) {
      stats.errors++;
    }
  }

  // 5. Index prediction research evaluations
  const predictionCache = dataFile("prediction-cache.json");
  if (fs.existsSync(predictionCache)) {
    try {
      const cache = JSON.parse(fs.readFileSync(predictionCache, "utf-8"));
      const evaluations = Object.entries(cache)
        .filter(([, v]) => v.evaluation)
        .map(([ticker, v]) => `## ${ticker} (Score: ${v.predictionScore})\n${v.evaluation}`)
        .join("\n\n");
      if (evaluations.trim()) {
        const result = await indexDocument("research", "prediction-evaluations", evaluations, "Ticker Research", embedFn);
        if (result.status === "unchanged") stats.unchanged++;
        else { stats.indexed++; stats.chunks += result.chunks; }
      }
    } catch (e) {
      stats.errors++;
    }
  }

  return stats;
}

/**
 * Get database statistics
 */
export function getDBStats() {
  const db = getKnowledgeDB();

  const docCount = db.prepare("SELECT COUNT(*) as count FROM documents").get().count;
  const chunkCount = db.prepare("SELECT COUNT(*) as count FROM chunks").get().count;
  const vecCount = db.prepare("SELECT COUNT(*) as count FROM vec_chunks").get().count;
  const cacheCount = db.prepare("SELECT COUNT(*) as count FROM embedding_cache").get().count;

  const byType = db.prepare(`
    SELECT source_type, COUNT(*) as doc_count, SUM(chunk_count) as total_chunks
    FROM documents GROUP BY source_type
  `).all();

  // Database file size
  const dbPath = dataFile("knowledge.sqlite");
  let fileSize = 0;
  if (fs.existsSync(dbPath)) {
    fileSize = fs.statSync(dbPath).size;
  }

  return {
    documents: docCount,
    chunks: chunkCount,
    vectors: vecCount,
    cachedEmbeddings: cacheCount,
    byType,
    fileSizeMB: Math.round(fileSize / 1024 / 1024 * 100) / 100
  };
}

/**
 * Delete a document and its chunks from the knowledge base
 */
export function deleteDocument(sourceType, sourcePath) {
  const db = getKnowledgeDB();
  const docId = hashText(`${sourceType}:${sourcePath}`);

  const chunks = db.prepare("SELECT id FROM chunks WHERE document_id = ?").all(docId);
  for (const chunk of chunks) {
    db.prepare("DELETE FROM vec_chunks WHERE chunk_id = ?").run(chunk.id);
  }
  db.prepare("DELETE FROM chunks WHERE document_id = ?").run(docId);
  db.prepare("DELETE FROM documents WHERE id = ?").run(docId);

  return { deleted: chunks.length };
}

/**
 * Close the database connection
 */
export function closeKnowledgeDB() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export default {
  getKnowledgeDB,
  indexDocument,
  indexAllSources,
  searchKeyword,
  searchVector,
  searchHybrid,
  chunkText,
  hashText,
  getDBStats,
  deleteDocument,
  closeKnowledgeDB
};
