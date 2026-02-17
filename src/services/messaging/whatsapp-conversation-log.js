/**
 * WhatsApp Conversation Log — Authoritative Record
 *
 * Single source of truth for what was actually sent/received via WhatsApp.
 * Only messages that physically went through WhatsApp are logged here.
 *
 * File: ~/.backbone/users/<uid>/data/whatsapp-conversations.json
 *
 * Also used for send-level dedup: prevents the same message content
 * from being sent within a short window (30 seconds).
 */

import fs from "fs";
import path from "path";
import { getDataDir } from "../paths.js";

const DATA_DIR = getDataDir();
const LOG_PATH = path.join(DATA_DIR, "whatsapp-conversations.json");
const DEDUP_WINDOW_MS = 30 * 1000; // 30 seconds — same content blocked within this window
const MAX_ENTRIES = 500; // Keep last 500 messages

// In-memory recent sends for fast dedup (hash -> timestamp)
const recentSends = new Map();

/**
 * Load conversation log from disk.
 */
function loadLog() {
  try {
    if (fs.existsSync(LOG_PATH)) {
      return JSON.parse(fs.readFileSync(LOG_PATH, "utf-8"));
    }
  } catch {}
  return { messages: [], lastUpdated: null };
}

/**
 * Save conversation log to disk.
 */
function saveLog(log) {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Trim to max entries
    if (log.messages.length > MAX_ENTRIES) {
      log.messages = log.messages.slice(-MAX_ENTRIES);
    }
    log.lastUpdated = new Date().toISOString();
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  } catch (err) {
    console.error("[WALog] Failed to save:", err.message);
  }
}

/**
 * Generate a simple hash of message content for dedup.
 */
function hashContent(text) {
  if (!text) return "";
  // Normalize: lowercase, strip whitespace variations, trim
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * Check if sending this message would be a duplicate.
 * Returns { isDuplicate: boolean, reason?: string }
 */
export function isDuplicateSend(content, mediaUrl) {
  const key = hashContent(content) + (mediaUrl || "");
  const lastSent = recentSends.get(key);

  if (lastSent && (Date.now() - lastSent) < DEDUP_WINDOW_MS) {
    const secsAgo = ((Date.now() - lastSent) / 1000).toFixed(0);
    return {
      isDuplicate: true,
      reason: `Same message sent ${secsAgo}s ago (within ${DEDUP_WINDOW_MS / 1000}s window)`
    };
  }

  // Also check on-disk log for exact content match in last 5 minutes
  const log = loadLog();
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const recentDup = log.messages.find(m =>
    m.direction === "outgoing" &&
    new Date(m.timestamp).getTime() > fiveMinAgo &&
    hashContent(m.content) === hashContent(content) &&
    (mediaUrl ? m.mediaUrl === mediaUrl : true)
  );

  if (recentDup) {
    return {
      isDuplicate: true,
      reason: `Same message already sent at ${recentDup.timestamp}`
    };
  }

  return { isDuplicate: false };
}

/**
 * Log an outgoing message (sent TO the user via WhatsApp).
 */
export function logOutgoing(content, options = {}) {
  const { mediaUrl, type, source } = options;

  // Record in dedup cache
  const key = hashContent(content) + (mediaUrl || "");
  recentSends.set(key, Date.now());

  // Clean old dedup entries (older than 5 min)
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [k, v] of recentSends) {
    if (v < cutoff) recentSends.delete(k);
  }

  const log = loadLog();
  log.messages.push({
    direction: "outgoing",
    content: content?.slice(0, 2000) || "",
    mediaUrl: mediaUrl || null,
    type: type || "text",
    source: source || "unknown", // e.g. "notification", "reply", "follow-up"
    timestamp: new Date().toISOString(),
  });
  saveLog(log);
}

/**
 * Log an incoming message (received FROM the user via WhatsApp).
 */
export function logIncoming(content, options = {}) {
  const { from, mediaUrl } = options;

  const log = loadLog();
  log.messages.push({
    direction: "incoming",
    content: content?.slice(0, 2000) || "",
    from: from || null,
    mediaUrl: mediaUrl || null,
    type: "text",
    timestamp: new Date().toISOString(),
  });
  saveLog(log);
}

/**
 * Get recent conversation (last N messages).
 */
export function getRecentConversation(limit = 20) {
  const log = loadLog();
  return log.messages.slice(-limit);
}

/**
 * Get conversation context for AI prompt building.
 * Returns a formatted string of recent exchanges.
 */
export function getConversationContext(limit = 10) {
  const recent = getRecentConversation(limit);
  if (recent.length === 0) return "No recent WhatsApp conversation.";

  return recent.map(m => {
    const who = m.direction === "incoming" ? "User" : "BACKBONE";
    const time = new Date(m.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `[${time}] ${who}: ${m.content?.slice(0, 200) || "(media)"}`;
  }).join("\n");
}

/**
 * Get full log stats.
 */
export function getLogStats() {
  const log = loadLog();
  const incoming = log.messages.filter(m => m.direction === "incoming").length;
  const outgoing = log.messages.filter(m => m.direction === "outgoing").length;
  const today = new Date().toISOString().split("T")[0];
  const todayMsgs = log.messages.filter(m => m.timestamp?.startsWith(today));

  return {
    total: log.messages.length,
    incoming,
    outgoing,
    todayTotal: todayMsgs.length,
    todayIncoming: todayMsgs.filter(m => m.direction === "incoming").length,
    todayOutgoing: todayMsgs.filter(m => m.direction === "outgoing").length,
    lastMessage: log.messages.at(-1) || null,
    lastUpdated: log.lastUpdated,
  };
}

export default {
  isDuplicateSend,
  logOutgoing,
  logIncoming,
  getRecentConversation,
  getConversationContext,
  getLogStats,
};
