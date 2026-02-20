/**
 * Shared message dedup — prevents double-processing across
 * whatsapp-poller, realtime-messaging, and webhook handler.
 *
 * Any processor calls `claim(key)` before starting work.
 * Returns true if it "won" the claim, false if another processor already claimed it.
 */

const claimed = new Map(); // key → { by, at }
const MAX_SIZE = 500;

/**
 * Try to claim a message for processing.
 * @param {string} key - Message identifier (Twilio SID, Firestore doc ID, or content hash)
 * @param {string} claimedBy - Who's claiming ("poller", "webhook", "realtime")
 * @returns {boolean} true if successfully claimed, false if already claimed
 */
export function claim(key, claimedBy = "unknown") {
  if (claimed.has(key)) return false;
  claimed.set(key, { by: claimedBy, at: Date.now() });
  // Prune old entries
  if (claimed.size > MAX_SIZE) {
    const cutoff = Date.now() - 10 * 60 * 1000; // 10 min
    for (const [k, v] of claimed) {
      if (v.at < cutoff) claimed.delete(k);
    }
  }
  return true;
}

/**
 * Check if a message was already claimed.
 */
export function isClaimed(key) {
  return claimed.has(key);
}
