/**
 * Message Dedup Guard — Smart Anti-Spam for Outbound WhatsApp
 *
 * Before sending ANY automated message, checks recent conversation history
 * to prevent repeating the same content. Supports:
 *
 *   - Content similarity check (keyword overlap, not just exact match)
 *   - Time-based follow-up rules (don't repeat within X hours unless progressive)
 *   - Daily topic caps (max N messages about same topic per day)
 *   - Firebase + local message log checks
 *
 * Philosophy: Messages should feel like a sharp friend texting you —
 * never robotic, never spammy, never repeating themselves.
 */

import fs from "fs";
import path from "path";
import { getDataDir } from "../paths.js";

const DATA_DIR = getDataDir();
const GUARD_STATE_PATH = path.join(DATA_DIR, "message-guard-state.json");

// ── Config ──────────────────────────────────────────────────────
const MIN_REPEAT_HOURS = 6;         // Don't say the same thing within 6 hours
const MAX_SIMILAR_PER_DAY = 2;      // Max 2 messages on the same topic per day
const MAX_TOTAL_PER_DAY = 12;       // Hard daily cap across all automated messages
const SIMILARITY_THRESHOLD = 0.35;  // 35%+ keyword overlap = "same message"
const MIN_MSG_LENGTH = 15;          // Skip guard for very short messages (acks, etc.)

// Common stop words to exclude from similarity comparison
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "about", "like",
  "through", "after", "over", "between", "out", "up", "down", "and",
  "but", "or", "nor", "not", "so", "yet", "both", "either", "neither",
  "each", "every", "all", "any", "few", "more", "most", "other", "some",
  "such", "no", "only", "own", "same", "than", "too", "very", "just",
  "don", "now", "your", "you", "i", "me", "my", "we", "our", "it",
  "its", "this", "that", "these", "those", "here", "there", "what",
  "which", "who", "when", "where", "how", "hey", "hi", "hello",
]);

// Topic keywords for grouping messages by subject
const TOPIC_PATTERNS = {
  portfolio: /\b(portfolio|stock|ticker|position|equity|p&l|profit|loss|buy|sell|trade|market|share|etf)\b/i,
  health: /\b(sleep|oura|readiness|steps|activity|workout|health|heart rate|hrv|calories|exercise)\b/i,
  goals: /\b(goal|progress|milestone|completed|achieved|working on|task|objective)\b/i,
  morning: /\b(morning|good morning|brief|today|daily|wake|start your day)\b/i,
  evening: /\b(evening|end of day|tonight|wrap up|recap|day's done)\b/i,
  ticker: /\b(AAPL|NVDA|TSLA|MSFT|AMZN|GOOG|META|AMD|PLTR|SPY|QQQ|SH|SQQQ|TLT)\b/,
};

// ── State management ────────────────────────────────────────────

function loadGuardState() {
  try {
    if (fs.existsSync(GUARD_STATE_PATH)) {
      const state = JSON.parse(fs.readFileSync(GUARD_STATE_PATH, "utf-8"));
      // Reset if it's a new day
      const today = new Date().toISOString().split("T")[0];
      if (state.date !== today) {
        return { date: today, messages: [], totalSent: 0 };
      }
      return state;
    }
  } catch {}
  return { date: new Date().toISOString().split("T")[0], messages: [], totalSent: 0 };
}

function saveGuardState(state) {
  try {
    const dir = path.dirname(GUARD_STATE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(GUARD_STATE_PATH, JSON.stringify(state, null, 2));
  } catch {}
}

// ── Similarity engine ───────────────────────────────────────────

/**
 * Extract meaningful keywords from a message (strip stop words, normalize).
 */
function extractKeywords(text) {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[*_~`#\[\](){}|>!]/g, " ") // Strip formatting
      .replace(/\$[\d,.]+/g, "NUM")          // Normalize dollar amounts
      .replace(/\d{1,2}:\d{2}/g, "TIME")     // Normalize times
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

/**
 * Calculate keyword overlap between two messages (Jaccard similarity).
 * Returns 0-1 where 1 = identical keywords, 0 = nothing in common.
 */
function calculateSimilarity(msg1, msg2) {
  const kw1 = extractKeywords(msg1);
  const kw2 = extractKeywords(msg2);

  if (kw1.size === 0 || kw2.size === 0) return 0;

  let overlap = 0;
  for (const w of kw1) {
    if (kw2.has(w)) overlap++;
  }

  // Jaccard: intersection / union
  const union = new Set([...kw1, ...kw2]).size;
  return union > 0 ? overlap / union : 0;
}

/**
 * Detect the topic of a message.
 */
function detectTopic(message) {
  for (const [topic, pattern] of Object.entries(TOPIC_PATTERNS)) {
    if (pattern.test(message)) return topic;
  }
  return "general";
}

// ── Guard check ─────────────────────────────────────────────────

/**
 * Check whether it's OK to send this message.
 *
 * Returns { allowed: true } or { allowed: false, reason: string }.
 *
 * @param {string} message - The message we want to send
 * @param {Object} options
 * @param {string} options.type - Notification type (morning_brief, trade, etc.)
 * @param {boolean} options.isReply - True if this is a reply to user's message (always allowed)
 * @param {boolean} options.isFollowUp - True if this is a deliberate follow-up
 * @param {boolean} options.force - Bypass all checks
 */
export function shouldSendMessage(message, options = {}) {
  // Always allow: replies to user messages, forced sends, very short acks
  if (options.isReply || options.force) {
    return { allowed: true, reason: "reply/forced" };
  }

  if (!message || message.length < MIN_MSG_LENGTH) {
    return { allowed: true, reason: "short message" };
  }

  const state = loadGuardState();

  // 1. Hard daily cap
  if (state.totalSent >= MAX_TOTAL_PER_DAY) {
    return { allowed: false, reason: `Daily cap reached (${MAX_TOTAL_PER_DAY} messages today)` };
  }

  const now = Date.now();
  const topic = detectTopic(message);

  // 2. Check for similar recent messages
  for (const prev of state.messages) {
    const hoursSince = (now - prev.sentAt) / (1000 * 60 * 60);
    const similarity = calculateSimilarity(message, prev.text);

    // High similarity within the time window = blocked
    if (similarity >= SIMILARITY_THRESHOLD && hoursSince < MIN_REPEAT_HOURS) {
      // Exception: follow-ups are OK if explicitly marked
      if (options.isFollowUp) continue;

      return {
        allowed: false,
        reason: `Similar message sent ${hoursSince.toFixed(1)}h ago (${(similarity * 100).toFixed(0)}% overlap). Next OK in ${(MIN_REPEAT_HOURS - hoursSince).toFixed(1)}h`,
        similarity,
        previousMessage: prev.text.slice(0, 80),
      };
    }
  }

  // 3. Topic cap per day
  const topicCount = state.messages.filter(m => m.topic === topic).length;
  if (topicCount >= MAX_SIMILAR_PER_DAY && topic !== "general") {
    return {
      allowed: false,
      reason: `Already sent ${topicCount} "${topic}" messages today (max ${MAX_SIMILAR_PER_DAY})`,
    };
  }

  return { allowed: true, topic };
}

/**
 * Record that a message was sent (call AFTER successful send).
 */
export function recordSentMessage(message, options = {}) {
  const state = loadGuardState();
  state.totalSent++;
  state.messages.push({
    text: message.slice(0, 300), // Store truncated for comparison
    topic: detectTopic(message),
    type: options.type || "system",
    sentAt: Date.now(),
  });

  // Keep only last 30 messages in state (prevent file bloat)
  if (state.messages.length > 30) {
    state.messages = state.messages.slice(-30);
  }

  saveGuardState(state);
}

/**
 * Get today's message stats for debugging/display.
 */
export function getGuardStats() {
  const state = loadGuardState();
  const topicCounts = {};
  for (const m of state.messages) {
    topicCounts[m.topic] = (topicCounts[m.topic] || 0) + 1;
  }
  return {
    date: state.date,
    totalSent: state.totalSent,
    remaining: MAX_TOTAL_PER_DAY - state.totalSent,
    topicCounts,
    lastMessage: state.messages.at(-1) || null,
  };
}

export default { shouldSendMessage, recordSentMessage, getGuardStats };
