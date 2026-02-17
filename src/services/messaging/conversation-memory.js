/**
 * Conversation Memory — Topic Classification & Knowledge Extraction
 *
 * Two jobs:
 * 1. Classify conversations by topic → append to the right memory file
 * 2. Extract personal facts (names, preferences, life details) → append to profile-notes.md
 *
 * Also keeps a catch-all conversations.md for anything substantive
 * that doesn't match a specific topic — no conversation gets lost.
 */

import fs from "fs";
import path from "path";
import { getMemoryDir, getDataDir } from "../paths.js";

// ── Topic definitions with keyword patterns ──────────────────────

const TOPICS = [
  {
    id: "family",
    file: "family.md",
    keywords: /\b(kid|kids|child|children|daughter|son|wife|husband|spouse|parent|mom|dad|mother|father|baby|toddler|family|sibling|brother|sister|grandma|grandpa|grandmother|grandfather|uncle|aunt|cousin|nephew|niece|daycare|school pickup|bedtime|diaper|pregnant|pregnancy)\b/i,
  },
  {
    id: "health",
    file: "health-notes.md",
    keywords: /\b(sleep|workout|exercise|gym|run|running|oura|readiness|heart rate|hrv|steps|calories|weight|diet|nutrition|supplement|vitamin|meditation|yoga|health|doctor|appointment|sick|medicine|prescription|blood pressure|cholesterol|fasting|protein|cardio|lifting|mental health|anxiety|stress|therapy)\b/i,
  },
  {
    id: "portfolio",
    file: "portfolio-notes.md",
    keywords: /\b(stock|stocks|trade|trading|portfolio|position|equity|market|bull|bear|earnings|dividend|option|options|put|call|buy|sell|ticker|NVDA|AAPL|TSLA|AMZN|GOOG|MSFT|META|AMD|SPY|QQQ|SOXS|ETF|crypto|bitcoin|btc|eth|invest|investment|hedge|recession|inflation|fed|interest rate|bond|yield|alpaca|brokerage)\b/i,
  },
  {
    id: "goals",
    file: "goals.md",
    keywords: /\b(goal|goals|plan|planning|habit|habits|aspiration|milestone|progress|target|objective|resolution|priority|priorities|bucket list|self.improvement|personal growth|challenge|accountability|track|tracking)\b/i,
  },
  {
    id: "career",
    file: "career.md",
    keywords: /\b(job|career|startup|salary|raise|promotion|interview|resume|linkedin|networking|coworker|boss|manager|meeting|presentation|pitch|client|contract|freelance|business|revenue|company|entrepreneur|founder|ceo|cto|engineering|product|launch|hire|hiring|work from home|remote|office)\b/i,
  },
  {
    id: "travel",
    file: "travel.md",
    keywords: /\b(trip|travel|flight|flights|hotel|airbnb|vacation|destination|airport|passport|luggage|itinerary|booking|resort|beach|cruise|road trip|roadtrip|camping|hiking|backpack|visa|international|domestic|japan|europe|asia)\b/i,
  },
];

// ── Personal fact patterns — things to extract about the user ────

const PERSONAL_FACT_PATTERNS = [
  // Names: "my daughter Sarah", "my wife's name is", "my son Jake"
  { pattern: /\bmy\s+(daughter|son|wife|husband|partner|kid|child|mom|dad|brother|sister|friend|boss|coworker)(?:'s name is|,?\s+)([A-Z][a-z]+)/gi, type: "relationship" },
  // Ages: "she's 4", "he's 12 years old", "I'm 35", "my daughter is 7"
  { pattern: /\b(?:i'?m|i am|she'?s|he'?s|they'?re|(?:my\s+\w+\s+is))\s+(\d{1,3})(?:\s+years?\s+old)?\b/gi, type: "age" },
  // Location: "I live in", "we're in", "based in"
  { pattern: /\b(?:i\s+live\s+in|we(?:'re|\s+are)\s+in|based\s+in|from)\s+([A-Z][a-zA-Z\s,]+?)(?:\.|,|\s+and|\s+but|$)/gi, type: "location" },
  // Preferences: "I like", "I love", "I hate", "I prefer", "I always"
  { pattern: /\b(?:i\s+(?:really\s+)?(?:like|love|enjoy|hate|can't stand|prefer|always|never))\s+(.{5,60}?)(?:\.|!|\?|,\s+(?:but|and|so)|$)/gi, type: "preference" },
  // Job: "I work at", "I'm a", "my job is"
  { pattern: /\b(?:i\s+work\s+(?:at|for)|i'?m\s+a(?:n)?\s+|my\s+job\s+is)\s+(.{3,40}?)(?:\.|,|$)/gi, type: "job" },
];

// Minimum message length to consider
const MIN_MESSAGE_LENGTH = 8;

/**
 * Count keyword matches for a topic.
 */
function countMatches(text, pattern) {
  const matches = text.match(new RegExp(pattern.source, "gi"));
  return matches ? matches.length : 0;
}

/**
 * Classify a conversation exchange by topic.
 * Returns best match with 1+ keyword hit (lowered from 2).
 */
export function classifyConversationTopic(userMessage, aiResponse) {
  const combined = `${userMessage || ""} ${aiResponse || ""}`;

  if ((userMessage || "").trim().length < MIN_MESSAGE_LENGTH) {
    return null;
  }

  let bestTopic = null;
  let bestCount = 0;

  for (const topic of TOPICS) {
    const count = countMatches(combined, topic.keywords);
    if (count >= 1 && count > bestCount) {
      bestTopic = topic;
      bestCount = count;
    }
  }

  if (!bestTopic) return null;

  return {
    topicId: bestTopic.id,
    file: bestTopic.file,
    confidence: Math.min(bestCount / 3, 1),
  };
}

/**
 * Extract personal facts from a message (names, ages, preferences, etc.)
 */
export function extractPersonalFacts(text) {
  if (!text || text.length < 10) return [];

  const facts = [];
  for (const { pattern, type } of PERSONAL_FACT_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const value = (match[2] || match[1] || "").trim();
      if (value.length >= 2 && value.length <= 80) {
        facts.push({ type, value, raw: match[0].trim() });
      }
    }
  }
  return facts;
}

/**
 * Process a conversation exchange — classify, extract facts, and persist.
 */
export function processConversationMemory(userMessage, aiResponse, options = {}) {
  try {
    const memoryDir = getMemoryDir();
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }

    const source = options.source || "local";
    const channel = options.channel || "whatsapp";
    const now = options.timestamp ? new Date(options.timestamp) : new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });

    const userSnippet = (userMessage || "").trim().slice(0, 300);
    const aiSnippet = (aiResponse || "").trim().slice(0, 500);

    // Skip trivial messages
    if (userSnippet.length < MIN_MESSAGE_LENGTH) return null;

    // 1. Topic classification → route to specific memory file
    const classification = classifyConversationTopic(userMessage, aiResponse);

    if (classification) {
      const filePath = path.join(memoryDir, classification.file);
      const entry = `\n**${dateStr}** (via ${channel}, ${source})\n> User: ${userSnippet}\n> AI: ${aiSnippet}\n`;

      if (!fs.existsSync(filePath)) {
        const header = `# ${classification.topicId.charAt(0).toUpperCase() + classification.topicId.slice(1)} Notes\n\nConversation memory — auto-captured from WhatsApp and app exchanges.\n`;
        fs.writeFileSync(filePath, header, "utf-8");
      }
      fs.appendFileSync(filePath, entry, "utf-8");
      console.log(`[ConversationMemory] → ${classification.file} (${classification.topicId})`);
    } else {
      // 2. Catch-all: anything substantive (20+ chars) goes to conversations.md
      if (userSnippet.length >= 20) {
        const catchAllPath = path.join(memoryDir, "conversations.md");
        const entry = `\n**${dateStr}** (via ${channel}, ${source})\n> User: ${userSnippet}\n> AI: ${aiSnippet}\n`;

        if (!fs.existsSync(catchAllPath)) {
          fs.writeFileSync(catchAllPath, "# Conversations\n\nGeneral conversation history — topics that didn't match a specific category.\n", "utf-8");
        }
        fs.appendFileSync(catchAllPath, entry, "utf-8");
        console.log(`[ConversationMemory] → conversations.md (no topic match)`);
      }
    }

    // 3. Extract personal facts from the user's message
    const facts = extractPersonalFacts(userMessage);
    if (facts.length > 0) {
      const factsPath = path.join(memoryDir, "profile-notes.md");
      if (!fs.existsSync(factsPath)) {
        fs.writeFileSync(factsPath, "# Profile Notes\n\nPersonal facts extracted from conversations — names, preferences, life details.\n", "utf-8");
      }

      const factsEntry = facts.map(f => `- *${f.type}*: ${f.raw}`).join("\n");
      fs.appendFileSync(factsPath, `\n**${dateStr}** (extracted from ${channel})\n${factsEntry}\n`, "utf-8");
      console.log(`[ConversationMemory] Extracted ${facts.length} personal fact(s)`);
    }

    return classification
      ? { topicId: classification.topicId, file: classification.file, facts: facts.length }
      : { topicId: "general", file: "conversations.md", facts: facts.length };
  } catch (err) {
    console.error("[ConversationMemory] Error:", err.message);
    return null;
  }
}

/**
 * Backfill — process existing messages from the unified message log.
 * Call once to catch up on conversations that happened before this module existed.
 */
export function backfillFromMessageLog() {
  try {
    const logPath = path.join(getDataDir(), "unified-message-log.json");
    if (!fs.existsSync(logPath)) return { processed: 0 };

    const data = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    const messages = data.messages || data;

    let processed = 0;
    // Pair user→assistant messages
    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i];
      const next = messages[i + 1];

      if (msg.role === "user" && next.role === "assistant") {
        const result = processConversationMemory(msg.content, next.content, {
          source: msg.metadata?.source || "local",
          channel: msg.channel || "whatsapp",
          timestamp: msg.timestamp || msg.createdAt,
        });
        if (result) processed++;
        i++; // Skip the assistant message
      }
    }

    console.log(`[ConversationMemory] Backfill complete: ${processed} conversation pairs processed`);
    return { processed };
  } catch (err) {
    console.error("[ConversationMemory] Backfill error:", err.message);
    return { processed: 0, error: err.message };
  }
}

export default { classifyConversationTopic, processConversationMemory, extractPersonalFacts, backfillFromMessageLog };
