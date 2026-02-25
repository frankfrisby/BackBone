import fs from "fs";
import path from "path";
import { getMemoryDir, getDataDir, dataFile } from "../services/paths.js";
import { section, label, ok, warn, info, theme, symbols } from "./theme.js";

const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","as","is","was","are","were","be","been","being","have","has","had",
  "do","does","did","will","would","shall","should","may","might","must","can",
  "could","about","above","after","again","against","all","am","any","because",
  "before","below","between","both","during","each","few","further","get","got",
  "he","her","here","hers","herself","him","himself","his","how","i","if","into",
  "it","its","itself","just","me","more","most","my","myself","no","nor","not",
  "now","only","other","our","ours","ourselves","out","over","own","same","she",
  "so","some","such","than","that","their","theirs","them","themselves","then",
  "there","these","they","this","those","through","too","under","until","up",
  "very","we","what","when","where","which","while","who","whom","why","you",
  "your","yours","yourself","yourselves","also","been","down","off","once","s",
  "t","d","ll","re","ve","m","don","doesn","didn","won","wouldn","shouldn",
  "couldn","isn","aren","wasn","weren","hasn","haven","hadn"
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
}

function chunkText(text, targetSize = 500) {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let current = "";
  let start = 0;
  let pos = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) { pos += para.length + 2; continue; }

    if (current.length + trimmed.length > targetSize && current.length > 0) {
      chunks.push({ text: current.trim(), start });
      current = "";
      start = pos;
    }
    current += (current ? "\n\n" : "") + trimmed;

    pos += para.length + 2;
  }
  if (current.trim()) {
    chunks.push({ text: current.trim(), start });
  }
  return chunks;
}

function computeTF(tokens) {
  const tf = {};
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1;
  }
  const len = tokens.length || 1;
  for (const t in tf) tf[t] /= len;
  return tf;
}

function buildIndex(memoryDir) {
  const files = fs.readdirSync(memoryDir).filter(f => f.endsWith(".md"));
  const allChunks = [];
  const df = {};

  for (const file of files) {
    const content = fs.readFileSync(path.join(memoryDir, file), "utf-8");
    const raw = chunkText(content);
    for (const c of raw) {
      const tokens = tokenize(c.text);
      if (tokens.length === 0) continue;
      const tf = computeTF(tokens);
      allChunks.push({ file, text: c.text, start: c.start, tf });
      const seen = new Set(tokens);
      for (const t of seen) {
        df[t] = (df[t] || 0) + 1;
      }
    }
  }

  return {
    lastIndexed: new Date().toISOString(),
    fileCount: files.length,
    chunkCount: allChunks.length,
    chunks: allChunks,
    df
  };
}

function searchIndex(index, query, topK = 5) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const totalChunks = index.chunkCount || index.chunks.length || 1;
  const results = [];

  for (const chunk of index.chunks) {
    let score = 0;
    for (const qt of queryTokens) {
      const tf = chunk.tf[qt] || 0;
      const dfVal = index.df[qt] || 0;
      if (tf > 0 && dfVal > 0) {
        const idf = Math.log(totalChunks / dfVal);
        score += tf * idf;
      }
    }
    if (score > 0) {
      results.push({ ...chunk, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return sec + "s ago";
  const min = Math.floor(sec / 60);
  if (min < 60) return min + "m ago";
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs + "h ago";
  const days = Math.floor(hrs / 24);
  return days + "d ago";
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function scoreBar(score, maxScore, width = 20) {
  const ratio = maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
  const filled = Math.round(ratio * width);
  return theme.accent("\u2588".repeat(filled)) + theme.dim("\u2591".repeat(width - filled));
}

function getIndexPath() {
  return dataFile("memory-index.json");
}

function loadIndex() {
  const p = getIndexPath();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function cmdStatus(flags) {
  const index = loadIndex();
  if (flags.json) {
    if (!index) return console.log(JSON.stringify({ indexed: false }));
    return console.log(JSON.stringify({
      indexed: true,
      fileCount: index.fileCount,
      chunkCount: index.chunkCount,
      lastIndexed: index.lastIndexed
    }, null, 2));
  }

  section("Memory Index Status");
  if (!index) {
    warn("No index found. Run: backbone memory index");
    return;
  }
  console.log("  " + label("Files") + "     " + index.fileCount);
  console.log("  " + label("Chunks") + "    " + index.chunkCount);
  console.log("  " + label("Indexed") + "   " + timeAgo(index.lastIndexed));
  console.log();
}

function cmdIndex(flags) {
  const memDir = getMemoryDir();
  if (!fs.existsSync(memDir)) {
    if (flags.json) return console.log(JSON.stringify({ error: "Memory dir not found" }));
    warn("Memory directory not found: " + memDir);
    return;
  }

  const t0 = Date.now();
  const index = buildIndex(memDir);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  fs.writeFileSync(getIndexPath(), JSON.stringify(index, null, 2));

  if (flags.json) {
    return console.log(JSON.stringify({
      fileCount: index.fileCount,
      chunkCount: index.chunkCount,
      elapsed: parseFloat(elapsed)
    }, null, 2));
  }

  section("Memory Index");
  ok("Indexed " + index.fileCount + " files, " + index.chunkCount + " chunks in " + elapsed + "s");
  console.log();
}

function cmdSearch(query, flags) {
  if (!query) {
    if (flags.json) return console.log(JSON.stringify({ error: "No query" }));
    warn("Usage: backbone memory search <query>");
    return;
  }

  let index = loadIndex();
  if (!index) {
    const memDir = getMemoryDir();
    if (!fs.existsSync(memDir)) {
      if (flags.json) return console.log(JSON.stringify({ error: "No memory dir" }));
      warn("No index and no memory directory found.");
      return;
    }
    index = buildIndex(memDir);
    fs.writeFileSync(getIndexPath(), JSON.stringify(index, null, 2));
  }

  const results = searchIndex(index, query);

  if (flags.json) {
    return console.log(JSON.stringify(results.map(r => ({
      file: r.file,
      score: Math.round(r.score * 1000) / 1000,
      preview: r.text.slice(0, 200)
    })), null, 2));
  }

  section("Search: \"" + query + "\"");
  if (results.length === 0) {
    info("No results found.");
    console.log();
    return;
  }

  const maxScore = results[0].score;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const preview = r.text.replace(/\n/g, " ").slice(0, 200);
    const scoreFmt = r.score.toFixed(3);
    console.log("  " + theme.accent((i + 1) + ".") + "  " + theme.info(r.file) + "  " + scoreBar(r.score, maxScore) + " " + theme.dim(scoreFmt));
    console.log("     " + theme.dim(preview));
    console.log();
  }
}

function cmdList(flags) {
  const memDir = getMemoryDir();
  if (!fs.existsSync(memDir)) {
    if (flags.json) return console.log(JSON.stringify({ error: "No memory dir" }));
    warn("Memory directory not found.");
    return;
  }

  const files = fs.readdirSync(memDir)
    .filter(f => f.endsWith(".md"))
    .map(f => {
      const stat = fs.statSync(path.join(memDir, f));
      return { name: f, size: stat.size, modified: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));

  if (flags.json) {
    return console.log(JSON.stringify(files, null, 2));
  }

  section("Memory Files");
  if (files.length === 0) {
    info("No memory files found.");
    return;
  }

  const nameW = Math.max(...files.map(f => f.name.length), 4);
  console.log("  " + theme.dim("File".padEnd(nameW)) + "  " + theme.dim("Size".padStart(10)) + "  " + theme.dim("Modified"));
  console.log("  " + theme.dim("\u2500".repeat(nameW)) + "  " + theme.dim("\u2500".repeat(10)) + "  " + theme.dim("\u2500".repeat(12)));
  for (const f of files) {
    console.log("  " + f.name.padEnd(nameW) + "  " + formatBytes(f.size).padStart(10) + "  " + timeAgo(f.modified));
  }
  console.log();
}

function cmdRead(filename, flags) {
  if (!filename) {
    if (flags.json) return console.log(JSON.stringify({ error: "No filename" }));
    warn("Usage: backbone memory read <filename>");
    return;
  }

  const memDir = getMemoryDir();
  if (!filename.endsWith(".md")) filename += ".md";
  const filePath = path.join(memDir, filename);

  if (!fs.existsSync(filePath)) {
    if (flags.json) return console.log(JSON.stringify({ error: "File not found", file: filename }));
    warn("File not found: " + filename);
    return;
  }

  const content = fs.readFileSync(filePath, "utf-8");

  if (flags.json) {
    return console.log(JSON.stringify({ file: filename, content }, null, 2));
  }

  section(filename);
  console.log(content);
  console.log();
}

export async function runMemory(args) {
  const flags = { json: args.includes("--json") };
  const clean = args.filter(a => !a.startsWith("--"));
  const sub = clean[0] || "status";

  switch (sub) {
    case "status": return cmdStatus(flags);
    case "index":  return cmdIndex(flags);
    case "search": return cmdSearch(clean.slice(1).join(" "), flags);
    case "list":   return cmdList(flags);
    case "read":   return cmdRead(clean[1], flags);
    default:
      warn("Unknown subcommand: " + sub);
      info("Usage: backbone memory [status|index|search|list|read]");
  }
}
