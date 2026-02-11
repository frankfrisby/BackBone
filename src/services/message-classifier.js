/**
 * Message Classifier
 *
 * Pattern-based classification of incoming messages as quick or complex.
 * No LLM call needed — instant classification for fast routing.
 *
 * Quick messages: greetings, confirmations, simple questions, gratitude
 * Complex messages: research, trading, goal/health/portfolio actions, calls, web lookups
 */

// Quick patterns — if the ENTIRE message matches, it's quick
const QUICK_EXACT = new Set([
  "hey", "hi", "hello", "sup", "yo", "gm", "gn",
  "yes", "no", "ok", "okay", "sure", "yep", "nah", "nope",
  "thanks", "thank you", "thx", "ty",
  "good", "great", "nice", "cool", "awesome",
  "what's up", "whats up", "how are you"
]);

// Quick patterns — regex for short, simple messages
const QUICK_PATTERNS = [
  /^(hey|hi|hello|yo|sup|gm|gn)\b/i,
  /^(yes|no|ok|okay|sure|yep|nah|nope|yeah|confirmed?)$/i,
  /^(thanks?|thank\s*you|thx|ty|cheers)\b/i,
  /^(good|great|nice|cool|awesome|perfect|👍|🙏|❤️)$/i,
  /^what('?s| is) (up|good|new)\??$/i,
  /^how('?s| is| are) (it going|you|things)\??$/i
];

// Complex patterns — if ANY of these match, it's complex
const COMPLEX_PATTERNS = [
  /\b(buy|sell|trade|short|long|position)\b/i,
  /\b(research|analyze|analy[sz]e|investigate|deep\s*dive|look\s*into)\b/i,
  /\b(create|build|schedule|set\s*up|make|generate|write|draft)\b/i,
  /\b(check|show|review|update)\s+(my\s+)?(portfolio|positions?|stocks?|holdings?)\b/i,
  /\b(check|show|review|update)\s+(my\s+)?(health|sleep|readiness|activity)\b/i,
  /\b(check|show|review|update)\s+(my\s+)?(goals?|progress|tasks?)\b/i,
  /\bcall\s+me\b/i,
  /\b(web\s*search|look\s*up|search\s+for|google|find\s+out)\b/i,
  /\b(run|execute|trigger|start)\b/i,
  /\b(morning\s*brief|daily\s*summary|market\s*update)\b/i,
  /\b(news|headline|what('?s| is) happening)\b/i,
  /\b(email|calendar|meeting|event)\b/i,
  /\b(plan|goal|belief|project)\b/i,
  /\b(thesis|backlog|thinking)\b/i
];

// Pivot patterns — user wants to change direction
const PIVOT_PATTERNS = [
  /\b(pivot|switch)\s+(to|focus|direction)\b/i,
  /\blet'?s\s+(do|work\s+on|focus\s+on|switch\s+to)\b/i,
  /\b(stop|pause|drop)\s+(what|everything|current|this)\b/i,
  /\b(instead|change\s+(of|course|direction|plan))\b/i,
  /\b(forget|abandon|shelve)\s+(that|this|current)\b/i,
  /\bnew\s+priority\b/i,
  /\bmore\s+important\b/i,
];

/**
 * Check if a message is a pivot request (user wants to change direction).
 * @param {string} text
 * @returns {boolean}
 */
export function isPivotRequest(text) {
  if (!text) return false;
  return PIVOT_PATTERNS.some(p => p.test(text));
}

/**
 * Classify a message as quick or complex
 *
 * @param {string} text - The message text
 * @returns {{ type: "quick"|"complex"|"pivot", confidence: number, reason: string }}
 */
export function classifyMessage(text) {
  if (!text || typeof text !== "string") {
    return { type: "quick", confidence: 0.5, reason: "empty message" };
  }

  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Check for pivot requests (user wants to change direction)
  if (isPivotRequest(trimmed)) {
    return { type: "pivot", confidence: 0.9, reason: "pivot/direction change detected" };
  }

  // Very short messages (under 20 chars) that don't match complex patterns → quick
  if (trimmed.length < 20) {
    // Check if short message matches complex patterns first
    for (const pattern of COMPLEX_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { type: "complex", confidence: 0.8, reason: `matches complex pattern: ${pattern.source.slice(0, 40)}` };
      }
    }
    return { type: "quick", confidence: 0.9, reason: "short message" };
  }

  // Exact match for known quick messages
  if (QUICK_EXACT.has(lower)) {
    return { type: "quick", confidence: 1.0, reason: "exact quick match" };
  }

  // Regex match for quick patterns
  for (const pattern of QUICK_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { type: "quick", confidence: 0.95, reason: "quick pattern match" };
    }
  }

  // Check complex patterns
  for (const pattern of COMPLEX_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { type: "complex", confidence: 0.9, reason: `matches complex pattern: ${pattern.source.slice(0, 40)}` };
    }
  }

  // Messages with questions that are longer tend to need more work
  if (trimmed.length > 60 && trimmed.includes("?")) {
    return { type: "complex", confidence: 0.6, reason: "long question" };
  }

  // Default: longer messages are complex, shorter are quick
  if (trimmed.length > 80) {
    return { type: "complex", confidence: 0.5, reason: "long message defaulting to complex" };
  }

  return { type: "quick", confidence: 0.5, reason: "default quick" };
}

export default classifyMessage;
