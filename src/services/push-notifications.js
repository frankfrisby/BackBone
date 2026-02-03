/**
 * Unified Push Notification Service
 *
 * Sends push notifications via Firestore writes that trigger
 * the sendPushNotification Cloud Function.
 *
 * Flow:
 *   sendPush() → writes to Firestore users/{userId}/notifications/{id}
 *   → Cloud Function trigger → FCM → user's device
 *
 * Uses the same Firestore REST API pattern as firestore-sync.js.
 */

import { loadFirebaseUser } from "./firebase-auth.js";
import { FIREBASE_CONFIG } from "./firebase-config.js";

const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

/**
 * Notification types
 */
export const PUSH_TYPE = {
  MORNING_BRIEF: "MORNING_BRIEF",
  TRADE_ALERT: "TRADE_ALERT",
  GOAL_UPDATE: "GOAL_UPDATE",
  CONTENT_LINK: "CONTENT_LINK",
  STORAGE_FILE: "STORAGE_FILE",
  SYSTEM_ALERT: "SYSTEM_ALERT"
};

// ── Firestore helpers (same pattern as firestore-sync.js) ─────

const toFirestoreValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
};

const toFirestoreDoc = (obj) => {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    fields[key] = toFirestoreValue(value);
  }
  return { fields };
};

const getAuth = () => {
  const user = loadFirebaseUser();
  if (!user?.idToken || !user?.localId) {
    return null;
  }
  return { idToken: user.idToken, userId: user.localId };
};

/**
 * Write a notification document to Firestore
 * This triggers the sendPushNotification Cloud Function
 */
const writeNotification = async (userId, idToken, data) => {
  // Use POST to auto-generate document ID
  const url = `${FIRESTORE_BASE_URL}/users/${userId}/notifications?key=${FIREBASE_CONFIG.apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`
    },
    body: JSON.stringify(toFirestoreDoc(data))
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Firestore write failed: ${response.status} - ${error}`);
  }

  return await response.json();
};

// ── Public API ────────────────────────────────────────────────

/**
 * Send a push notification
 * @param {string} userId - Firebase user ID (optional, uses current user if not provided)
 * @param {Object} opts - Notification options
 * @param {string} opts.title - Notification title
 * @param {string} opts.body - Notification body text
 * @param {string} [opts.url] - Click action URL (website, YouTube, Storage file)
 * @param {string} [opts.image] - Rich notification image URL
 * @param {string} [opts.type] - Notification type (PUSH_TYPE)
 * @param {string} [opts.icon] - Custom icon URL
 */
export async function sendPush(userId, { title, body, url, image, type, icon } = {}) {
  const auth = getAuth();
  if (!auth) {
    return { success: false, error: "Not authenticated" };
  }

  const targetUserId = userId || auth.userId;

  const notificationData = {
    title: title || "BACKBONE",
    body: body || "You have a new notification",
    sent: false,
    createdAt: new Date().toISOString(),
    data: {
      type: type || PUSH_TYPE.SYSTEM_ALERT,
      ...(url ? { url } : {}),
    }
  };

  // Add icon (defaults to PWA icon)
  if (icon) {
    notificationData.icon = icon;
  }

  // Add image for rich notifications
  if (image) {
    notificationData.image = image;
  }

  try {
    await writeNotification(targetUserId, auth.idToken, notificationData);
    return { success: true };
  } catch (error) {
    console.error("[Push] Send failed:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send morning briefing as push notification
 */
export async function sendMorningBriefPush(briefing) {
  const { greeting, priorities, portfolio, health } = briefing;

  let body = greeting || "Good morning!";

  if (health?.sleepScore) {
    body += ` | Sleep ${health.sleepScore}`;
  }
  if (health?.readiness) {
    body += ` | Readiness ${health.readiness}`;
  }

  if (priorities?.length > 0) {
    body += "\n" + priorities.slice(0, 3).map((p, i) => `${i + 1}. ${p}`).join("\n");
  }

  if (portfolio?.topMovers?.length > 0) {
    body += "\n" + portfolio.topMovers.slice(0, 3).join(" | ");
  }

  return sendPush(null, {
    title: "Good Morning",
    body,
    type: PUSH_TYPE.MORNING_BRIEF,
    url: "https://backboneai.web.app"
  });
}

/**
 * Send trade alert as push notification
 */
export async function sendTradeAlertPush(trade) {
  const { symbol, action, quantity, price, total } = trade;
  const actionWord = action === "buy" ? "Bought" : "Sold";

  return sendPush(null, {
    title: `Trade: ${actionWord} ${symbol}`,
    body: `${quantity} shares @ $${price?.toFixed?.(2) || price}${total ? ` — Total: $${total.toFixed(2)}` : ""}`,
    type: PUSH_TYPE.TRADE_ALERT
  });
}

/**
 * Send content link push notification (website, YouTube, article)
 */
export async function sendContentPush(title, url, image) {
  return sendPush(null, {
    title: title || "New Content",
    body: url,
    url,
    image,
    type: PUSH_TYPE.CONTENT_LINK
  });
}

/**
 * Send goal update push notification
 */
export async function sendGoalUpdatePush(goalTitle, progress, message) {
  return sendPush(null, {
    title: `Goal: ${goalTitle}`,
    body: message || `Progress: ${progress}%`,
    type: PUSH_TYPE.GOAL_UPDATE,
    url: "https://backboneai.web.app"
  });
}

/**
 * Send Storage file link push notification
 */
export async function sendStorageFilePush(title, fileUrl) {
  return sendPush(null, {
    title: title || "File Ready",
    body: "Tap to open file",
    url: fileUrl,
    type: PUSH_TYPE.STORAGE_FILE
  });
}

/**
 * Check if user has FCM tokens registered
 */
export async function getPushStatus() {
  const auth = getAuth();
  if (!auth) {
    return { registered: false, error: "Not authenticated" };
  }

  try {
    const url = `${FIRESTORE_BASE_URL}/users/${auth.userId}/fcmTokens?key=${FIREBASE_CONFIG.apiKey}`;
    const response = await fetch(url, {
      headers: { "Authorization": `Bearer ${auth.idToken}` }
    });

    if (!response.ok) {
      return { registered: false, tokenCount: 0 };
    }

    const data = await response.json();
    const documents = data.documents || [];

    return {
      registered: documents.length > 0,
      tokenCount: documents.length,
      tokens: documents.map(doc => {
        const name = doc.name?.split("/").pop() || "unknown";
        return { id: name };
      })
    };
  } catch (error) {
    return { registered: false, tokenCount: 0, error: error.message };
  }
}

export default {
  PUSH_TYPE,
  sendPush,
  sendMorningBriefPush,
  sendTradeAlertPush,
  sendContentPush,
  sendGoalUpdatePush,
  sendStorageFilePush,
  getPushStatus
};
