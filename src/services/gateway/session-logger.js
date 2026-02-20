/**
 * Session Logger
 *
 * JSONL-based session persistence. Each session is a file of newline-delimited
 * JSON entries. This gives us:
 *   - Append-only writes (fast, crash-safe)
 *   - Easy replay/resume
 *   - Full transcript history
 *
 * Sessions stored at: ~/.backbone/users/<uid>/data/sessions/<sessionId>.jsonl
 */

import fs from "fs";
import path from "path";
import { getDataDir } from "../paths.js";

const SESSIONS_DIR = path.join(getDataDir(), "sessions");

// Ensure sessions directory exists
try { fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch {}

// ── Session Logger ────────────────────────────────────────────

export class SessionLogger {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    this._stream = null;
  }

  /**
   * Append a message to the session log
   */
  logMessage(role, content, meta = {}) {
    this._append({
      type: "message",
      role,
      content,
      ...meta,
      ts: Date.now(),
    });
  }

  /**
   * Append an event (tool use, error, cancel, etc.)
   */
  logEvent(event, data = {}) {
    this._append({
      type: "event",
      event,
      ...data,
      ts: Date.now(),
    });
  }

  /**
   * Read the full session transcript
   */
  readTranscript() {
    if (!fs.existsSync(this.filePath)) return [];

    const lines = fs.readFileSync(this.filePath, "utf8")
      .split("\n")
      .filter(Boolean);

    return lines.map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    }).filter(Boolean);
  }

  /**
   * Get messages only (filter out events)
   */
  getMessages() {
    return this.readTranscript().filter(e => e.type === "message");
  }

  /**
   * Get the conversation in Claude API format
   */
  getApiMessages() {
    return this.getMessages().map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * Internal: append a JSON line
   */
  _append(entry) {
    try {
      fs.appendFileSync(this.filePath, JSON.stringify(entry) + "\n");
    } catch (err) {
      console.error(`[session-logger] Write failed for ${this.sessionId}:`, err.message);
    }
  }

  /**
   * Close the stream (if using streaming writes)
   */
  close() {
    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }
  }
}

// ── Session Manager ───────────────────────────────────────────

/**
 * List all sessions with metadata
 */
export function listSessions() {
  try {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".jsonl"));
    return files.map(f => {
      const sessionId = f.replace(".jsonl", "");
      const filePath = path.join(SESSIONS_DIR, f);
      const stat = fs.statSync(filePath);

      // Read first and last line for metadata
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n").filter(Boolean);
      let first = null, last = null;
      try { first = JSON.parse(lines[0]); } catch {}
      try { last = JSON.parse(lines[lines.length - 1]); } catch {}

      return {
        sessionId,
        createdAt: first?.ts || stat.birthtimeMs,
        lastActivity: last?.ts || stat.mtimeMs,
        messageCount: lines.filter(l => {
          try { return JSON.parse(l).type === "message"; }
          catch { return false; }
        }).length,
        size: stat.size,
      };
    }).sort((a, b) => b.lastActivity - a.lastActivity);
  } catch {
    return [];
  }
}

/**
 * Delete a session
 */
export function deleteSession(sessionId) {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
  try { fs.unlinkSync(filePath); return true; }
  catch { return false; }
}

/**
 * Prune sessions older than maxAge (ms)
 */
export function pruneSessions(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  const sessions = listSessions();
  let pruned = 0;

  for (const s of sessions) {
    if (s.lastActivity < cutoff) {
      deleteSession(s.sessionId);
      pruned++;
    }
  }

  return pruned;
}

// ── Singleton cache ─────────────────────────────────────────

const _loggers = new Map();

export function getSessionLogger(sessionId) {
  if (!_loggers.has(sessionId)) {
    _loggers.set(sessionId, new SessionLogger(sessionId));
  }
  return _loggers.get(sessionId);
}

export default SessionLogger;
