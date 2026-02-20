/**
 * Shared message dedup — prevents double-processing across
 * whatsapp-poller, realtime-messaging, and webhook handler.
 *
 * Any processor calls `claim(key)` before starting work.
 * Returns true if it "won" the claim, false if another processor already claimed it.
 *
 * Also supports content-based dedup via claimByContent() for cases where
 * different systems use different IDs for the same message.
 */

const claimed = new Map(); // key → { by, at }
const contentClaimed = new Map(); // contentHash → { by, at }
const MAX_SIZE = 500;

function prune(map) {
  if (map.size > MAX_SIZE) {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [k, v] of map) {
      if (v.at < cutoff) map.delete(k);
    }
  }
}

/**
 * Try to claim a message for processing by ID.
 * @param {string} key - Message identifier (Twilio SID, Firestore doc ID)
 * @param {string} claimedBy - Who's claiming ("poller", "webhook", "realtime")
 * @returns {boolean} true if successfully claimed, false if already claimed
 */
export function claim(key, claimedBy = "unknown") {
  if (!key) return true; // No key = can't dedup, allow through
  if (claimed.has(key)) return false;
  claimed.set(key, { by: claimedBy, at: Date.now() });
  prune(claimed);
  return true;
}

/**
 * Also claim by message content — catches cases where same message
 * arrives via different systems with different IDs.
 * @param {string} content - The message text
 * @param {string} claimedBy
 * @returns {boolean} true if successfully claimed
 */
export function claimByContent(content, claimedBy = "unknown") {
  if (!content || content.length < 3) return true;
  // Hash: first 50 chars + length (fast, good enough for short messages)
  const hash = `${content.trim().slice(0, 50).toLowerCase()}:${content.length}`;
  if (contentClaimed.has(hash)) {
    const prev = contentClaimed.get(hash);
    // Only block if claimed within last 60s (same message arriving via different paths)
    if (Date.now() - prev.at < 60000) return false;
  }
  contentClaimed.set(hash, { by: claimedBy, at: Date.now() });
  prune(contentClaimed);
  return true;
}

/**
 * Check if a message was already claimed.
 */
export function isClaimed(key) {
  return claimed.has(key);
}
