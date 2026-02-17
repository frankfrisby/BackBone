/**
 * Firebase Functions for BACKBONE Messaging
 *
 * Deploy these functions to Firebase to enable:
 * 1. WhatsApp webhook handling
 * 2. Push notification sending
 * 3. Message routing between channels
 *
 * Deployment:
 *   cd firebase-functions
 *   npm install
 *   firebase deploy --only functions
 *
 * Required environment variables (firebase functions:config:set):
 *   whatsapp.phone_number_id
 *   whatsapp.access_token
 *   whatsapp.webhook_verify_token
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();
const WHATSAPP_HISTORY_WINDOW = 30;
const WHATSAPP_COMPRESSED_HISTORY_WINDOW = 30;
const TWILIO_CONFIG_COLLECTION = "config";
const TWILIO_CONFIG_DOC_ID = "config_twilio";

/**
 * Single source of truth for Twilio credentials.
 * DO NOT change this path unless you intentionally migrate all Twilio flows.
 */
const getTwilioConfigFromFirestore = async () => {
  try {
    const doc = await db.collection(TWILIO_CONFIG_COLLECTION).doc(TWILIO_CONFIG_DOC_ID).get();
    if (!doc.exists) return null;
    return doc.data() || null;
  } catch (err) {
    console.warn("[Twilio] Could not fetch config/config_twilio:", err.message);
    return null;
  }
};

// ── OpenAI helper (lazy init from Firestore config) ──
let _openaiClient = null;
const getOpenAI = async () => {
  if (_openaiClient) return _openaiClient;
  try {
    const doc = await db.collection("config").doc("config_openai").get();
    if (doc.exists && doc.data().apiKey) {
      const { OpenAI } = require("openai");
      _openaiClient = new OpenAI({ apiKey: doc.data().apiKey });
      return _openaiClient;
    }
  } catch {}
  return null;
};

/**
 * Load last N messages from Firestore for a user's conversation history.
 * Returns array of { role: "user"|"assistant", content: string }
 */
const getConversationHistory = async (userId, limit = WHATSAPP_HISTORY_WINDOW) => {
  try {
    const snap = await db.collection("users").doc(userId)
      .collection("messages")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    if (snap.empty) return [];
    const msgs = [];
    snap.docs.reverse().forEach(doc => {
      const d = doc.data();
      if (!d.content) return;
      msgs.push({
        role: d.type === "user" ? "user" : "assistant",
        content: d.content
      });
    });
    return msgs;
  } catch (err) {
    console.warn("[getConversationHistory]", err.message);
    return [];
  }
};

/**
 * Load user context from Firestore synced data.
 * Tries comprehensive userContext doc first (synced by BACKBONE 4x/day),
 * then falls back to individual docs for backward compat.
 * Returns a compact string for the AI prompt.
 */
const loadUserContext = async (userId) => {
  // Try comprehensive context doc first (synced by BACKBONE)
  try {
    const ctxDoc = await db.collection("users").doc(userId)
      .collection("syncedData").doc("userContext").get();

    if (ctxDoc.exists) {
      const ctx = ctxDoc.data();
      const parts = [];

      // Portfolio
      if (ctx.portfolio) {
        const p = ctx.portfolio;
        parts.push(`PORTFOLIO: $${p.equity || "?"} equity, $${p.dayPL >= 0 ? "+" : ""}${p.dayPL || 0} today, ${p.positionCount || 0} positions`);
        if (p.topPositions) parts.push(`Positions: ${p.topPositions}`);
        if (p.analysis) parts.push(`Portfolio analysis: ${p.analysis.slice(0, 500)}`);
      }

      // Health
      if (ctx.health) {
        const h = ctx.health;
        const scores = [];
        if (h.sleepScore) scores.push(`Sleep:${h.sleepScore}`);
        if (h.readiness) scores.push(`Readiness:${h.readiness}`);
        if (h.activity) scores.push(`Activity:${h.activity}`);
        if (h.steps) scores.push(`Steps:${h.steps}`);
        if (scores.length) parts.push(`HEALTH: ${scores.join(", ")}`);
        if (h.analysis) parts.push(`Health notes: ${h.analysis.slice(0, 300)}`);
      }

      // Goals
      if (ctx.goals) {
        parts.push(`ACTIVE GOALS (${ctx.goals.count || 0}): ${ctx.goals.active || "none"}`);
      }

      // Projects
      if (ctx.projects) {
        parts.push(`PROJECTS: ${ctx.projects.slice(0, 400)}`);
      }

      // Thesis / current focus
      if (ctx.thesis) {
        parts.push(`CURRENT FOCUS: ${ctx.thesis.slice(0, 400)}`);
      }

      // Beliefs
      if (ctx.beliefs) {
        parts.push(`CORE BELIEFS: ${ctx.beliefs}`);
      }

      // Brokerage / Empower (net worth, accounts, holdings)
      if (ctx.brokerage) {
        const b = ctx.brokerage;
        const brokerageParts = [];
        if (b.netWorth) brokerageParts.push(`Net Worth: $${Number(b.netWorth).toLocaleString()}`);
        if (b.connectedBrokerages) brokerageParts.push(`Connected: ${b.connectedBrokerages}`);
        if (b.accountCount) brokerageParts.push(`${b.accountCount} accounts`);
        if (b.holdingCount) brokerageParts.push(`${b.holdingCount} holdings`);
        if (brokerageParts.length) parts.push(`BROKERAGE/NET WORTH: ${brokerageParts.join(", ")}`);
        if (b.accounts) parts.push(`Accounts: ${b.accounts.slice(0, 600)}`);
        if (b.topHoldings) parts.push(`Top holdings: ${b.topHoldings.slice(0, 400)}`);
        if (b.lastSync) parts.push(`Brokerage last sync: ${b.lastSync}`);
      }

      // Recent work
      if (ctx.recentWork) {
        parts.push(`RECENT BACKBONE WORK: ${ctx.recentWork.slice(0, 300)}`);
      }

      // Profile preferences
      if (ctx.profile?.preferences) {
        parts.push(`PROFILE: ${ctx.profile.preferences.slice(0, 200)}`);
      }

      if (ctx.syncedAt) {
        const age = Math.round((Date.now() - new Date(ctx.syncedAt).getTime()) / (60 * 60 * 1000));
        parts.push(`(Data freshness: ${age}h ago)`);
      }

      if (parts.length > 0) return parts.join("\n");
    }
  } catch (err) {
    console.warn("[loadUserContext] Comprehensive doc failed:", err.message);
  }

  // Fallback: read individual docs (backward compat)
  const parts = [];
  try {
    const portfolioDoc = await db.collection("users").doc(userId)
      .collection("syncedData").doc("portfolio").get();
    if (portfolioDoc.exists) {
      const p = portfolioDoc.data();
      parts.push(`Portfolio: $${p.equity || "?"} equity, ${(p.positions || []).length} positions`);
      if (p.positions?.length > 0) {
        const top = p.positions.slice(0, 5).map(pos =>
          `${pos.symbol} ${pos.qty}sh $${pos.market_value || "?"}`
        ).join(", ");
        parts.push(`Top positions: ${top}`);
      }
    }
  } catch {}
  try {
    const healthDoc = await db.collection("users").doc(userId)
      .collection("syncedData").doc("health").get();
    if (healthDoc.exists) {
      const h = healthDoc.data();
      const scores = [];
      if (h.sleepScore) scores.push(`Sleep:${h.sleepScore}`);
      if (h.readiness) scores.push(`Readiness:${h.readiness}`);
      if (h.activity) scores.push(`Activity:${h.activity}`);
      if (scores.length) parts.push(`Health: ${scores.join(", ")}`);
    }
  } catch {}
  try {
    const goalsDoc = await db.collection("users").doc(userId)
      .collection("syncedData").doc("goals").get();
    if (goalsDoc.exists) {
      const goals = goalsDoc.data().goals || [];
      const active = goals.filter(g => g.status === "active").slice(0, 5);
      if (active.length) {
        parts.push(`Active goals: ${active.map(g => `${g.title} (${g.progress || 0}%)`).join(", ")}`);
      }
    }
  } catch {}
  return parts.length > 0 ? parts.join("\n") : null;
};

/**
 * Generate a compressed conversation summary for the server to use as context.
 * This way the server knows "philadelphia" = "trip planning to Philadelphia".
 */
const compressConversation = (messages) => {
  if (!messages || messages.length === 0) return null;
  // Take the last N messages and compress to role: content pairs
  const recent = messages.slice(-WHATSAPP_COMPRESSED_HISTORY_WINDOW);
  return recent.map(m =>
    `${m.role === "user" ? "User" : "AI"}: ${m.content.slice(0, 200)}`
  ).join("\n");
};

const truncateText = (value, max = 120) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
};

const buildCloudFallbackResponse = (messageBody, history = [], userName = "") => {
  const namePrefix = userName ? `${userName}, g` : "G";
  const current = truncateText(messageBody, 80) || "that";
  // Sound natural — like the same assistant, not a different system
  const responses = [
    `${namePrefix}ot it — working on "${current}" now. I'll circle back with the full answer in a few.`,
    `${namePrefix}ive me a moment on that. I'm pulling up everything I need and I'll get back to you shortly.`,
    `${namePrefix}ood question. Let me dig into that properly and follow up — don't want to give you a half-baked answer.`,
  ];
  // Pick one based on message length for variety
  return responses[messageBody.length % responses.length];
};

const normalizePhone = (value) => {
  if (!value) return null;
  const digits = String(value).replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `1${digits}`;
  return digits;
};

const parseTwilioBody = (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  const raw = req.rawBody ? req.rawBody.toString("utf8") : String(req.body || "");
  return Object.fromEntries(new URLSearchParams(raw));
};

// WhatsApp config from environment
const WHATSAPP_CONFIG = {
  phoneNumberId: functions.config().whatsapp?.phone_number_id,
  accessToken: functions.config().whatsapp?.access_token,
  webhookVerifyToken: functions.config().whatsapp?.webhook_verify_token || "backbone_verify"
};

/**
 * WhatsApp Webhook - Verification (GET)
 * Called by Meta to verify webhook endpoint
 */
exports.whatsappWebhook = functions.https.onRequest(async (req, res) => {
  // Handle verification
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === WHATSAPP_CONFIG.webhookVerifyToken) {
      console.log("WhatsApp webhook verified");
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Verification failed");
  }

  // Handle incoming messages (POST)
  if (req.method === "POST") {
    try {
      const body = req.body;

      // Extract message data
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value) {
        return res.status(200).send("OK");
      }

      // Process incoming messages
      if (value.messages?.[0]) {
        const message = value.messages[0];
        const from = normalizePhone(message.from); // Phone number
        if (!from) {
          return res.status(200).send("OK");
        }
        const messageId = message.id;

        let content = null;
        let messageType = "text";

        if (message.text) {
          content = message.text.body;
        } else if (message.button) {
          content = message.button.text;
          messageType = "button_reply";
        } else if (message.interactive) {
          content = message.interactive.button_reply?.title ||
                    message.interactive.list_reply?.title;
          messageType = "interactive_reply";
        }

        if (content) {
          // Find user by phone number
          const userSnapshot = await db.collection("users")
            .where("whatsappPhone", "==", from)
            .limit(1)
            .get();

          let userId = null;
          if (!userSnapshot.empty) {
            userId = userSnapshot.docs[0].id;
            if (userSnapshot.size > 1) {
              console.warn(`[WhatsApp] Multiple users found for ${from}. Using first match ${userId}.`);
            }
          } else {
            // Create temporary user document for new WhatsApp users
            const newUserRef = await db.collection("users").add({
              whatsappPhone: from,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              source: "whatsapp"
            });
            userId = newUserRef.id;
          }

          // Write message to user's inbox
          await db.collection("users").doc(userId).collection("messages").add({
            content,
            type: "user",
            status: "pending",
            from,
            whatsappMessageId: messageId,
            messageType,
            channel: "whatsapp",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          console.log(`WhatsApp message from ${from} saved for user ${userId}`);
        }
      }

      return res.status(200).send("OK");
    } catch (error) {
      console.error("WhatsApp webhook error:", error);
      return res.status(200).send("OK"); // Always return 200 to prevent retries
    }
  }

  return res.status(405).send("Method not allowed");
});

/**
 * Firestore Trigger: Send WhatsApp response when AI responds
 * Watches for new AI messages and sends them via WhatsApp
 */
exports.sendWhatsAppResponse = functions.firestore
  .document("users/{userId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const userId = context.params.userId;

    // Only process AI responses
    if (message.type !== "ai" || message.channel === "whatsapp_sent") {
      return null;
    }

    // Check if user has WhatsApp enabled
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.whatsappPhone) {
      return null;
    }

    // Send via WhatsApp
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${WHATSAPP_CONFIG.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${WHATSAPP_CONFIG.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: userData.whatsappPhone,
            type: "text",
            text: { body: message.content }
          })
        }
      );

      const result = await response.json();

      // Mark as sent
      await snap.ref.update({
        whatsappSent: true,
        whatsappMessageId: result.messages?.[0]?.id,
        sentAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`WhatsApp response sent to ${userData.whatsappPhone}`);
    } catch (error) {
      console.error("Failed to send WhatsApp response:", error);
      await snap.ref.update({
        whatsappError: error.message
      });
    }

    return null;
  });

/**
 * Firestore Trigger: Send push notification for new messages
 */
exports.sendPushNotification = functions.firestore
  .document("users/{userId}/notifications/{notificationId}")
  .onCreate(async (snap, context) => {
    const notification = snap.data();
    const userId = context.params.userId;

    if (notification.sent) {
      return null;
    }

    // Get user's FCM tokens
    const tokensSnapshot = await db.collection("users").doc(userId)
      .collection("fcmTokens").get();

    if (tokensSnapshot.empty) {
      return null;
    }

    const tokens = tokensSnapshot.docs.map(doc => doc.data().token);

    // Send notification
    try {
      const notifTitle = notification.title || "BACKBONE";
      const notifBody = notification.body || "You have a new message";
      const notifIcon = notification.icon || "https://backboneai.web.app/icons/icon-192.png";
      const notifImage = notification.image || undefined;
      const clickUrl = notification.data?.url || "https://backboneai.web.app";

      // Ensure all data values are strings (FCM requirement)
      const dataPayload = {};
      if (notification.data) {
        for (const [k, v] of Object.entries(notification.data)) {
          dataPayload[k] = String(v);
        }
      }
      dataPayload.timestamp = new Date().toISOString();

      const message = {
        notification: {
          title: notifTitle,
          body: notifBody,
          ...(notifImage ? { imageUrl: notifImage } : {})
        },
        data: dataPayload,
        android: {
          priority: "high",
          notification: {
            icon: "ic_notification",
            color: "#f97316",
            sound: "default",
            clickAction: clickUrl,
            ...(notifImage ? { imageUrl: notifImage } : {})
          }
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
              "mutable-content": 1
            }
          },
          fcmOptions: {
            image: notifImage || undefined
          }
        },
        webpush: {
          notification: {
            title: notifTitle,
            body: notifBody,
            icon: notifIcon,
            ...(notifImage ? { image: notifImage } : {}),
            badge: notifIcon,
            data: { url: clickUrl }
          },
          fcmOptions: {
            link: clickUrl
          }
        },
        tokens
      };

      const response = await messaging.sendEachForMulticast(message);

      // Update notification as sent
      await snap.ref.update({
        sent: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
        sentAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Remove invalid tokens
      if (response.failureCount > 0) {
        const invalidTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error?.code === "messaging/registration-token-not-registered") {
            invalidTokens.push(tokens[idx]);
          }
        });

        for (const token of invalidTokens) {
          const tokenDoc = await db.collection("users").doc(userId)
            .collection("fcmTokens").where("token", "==", token).get();
          tokenDoc.forEach(doc => doc.ref.delete());
        }
      }

      console.log(`Push notification sent: ${response.successCount}/${tokens.length}`);
    } catch (error) {
      console.error("Failed to send push notification:", error);
      await snap.ref.update({
        error: error.message
      });
    }

    return null;
  });

/**
 * HTTP Function: Register FCM token
 */
exports.registerFcmToken = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
  }

  const { token, deviceInfo } = data;
  const userId = context.auth.uid;

  if (!token) {
    throw new functions.https.HttpsError("invalid-argument", "Token is required");
  }

  await db.collection("users").doc(userId).collection("fcmTokens").doc(token).set({
    token,
    deviceInfo: deviceInfo || {},
    registeredAt: admin.firestore.FieldValue.serverTimestamp(),
    lastActive: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true };
});

/**
 * HTTP Function: Register WhatsApp number
 */
exports.registerWhatsApp = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
  }

  const { phoneNumber } = data;
  const userId = context.auth.uid;

  if (!phoneNumber) {
    throw new functions.https.HttpsError("invalid-argument", "Phone number is required");
  }

  // Normalize phone number
  let normalized = phoneNumber.replace(/[^\d]/g, "");
  if (normalized.length === 10) {
    normalized = "1" + normalized; // Add US country code
  }

  // Check if number already registered
  const existing = await db.collection("users")
    .where("whatsappPhone", "==", normalized)
    .get();

  if (!existing.empty && existing.docs[0].id !== userId) {
    throw new functions.https.HttpsError("already-exists", "Phone number already registered");
  }

  await db.collection("users").doc(userId).update({
    whatsappPhone: normalized,
    whatsappRegisteredAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true, phoneNumber: normalized };
});

/**
 * Twilio WhatsApp Webhook
 * Routes incoming WhatsApp messages to the user's local BACKBONE instance.
 *
 * Flow:
 * 1. User sends WhatsApp message → Twilio → This webhook
 * 2. Webhook saves message to Firestore under user's messages collection
 * 3. User's local BACKBONE app polls Firestore, picks up message
 * 4. Local app processes with user's own API keys
 * 5. Local app saves response to Firestore
 * 6. sendTwilioResponse trigger sends response back to WhatsApp
 *
 * No API keys needed in Firebase - all AI processing happens locally.
 */
exports.twilioWhatsAppWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const body = parseTwilioBody(req);
    // Twilio sends form-urlencoded data
    const fromRaw = body.From?.replace("whatsapp:", "") || null;
    const from = normalizePhone(fromRaw);
    let messageBody = body.Body || "";
    const messageSid = body.MessageSid || null;
    const profileName = body.ProfileName || "";  // WhatsApp display name from Twilio

    if (!from) {
      console.warn("[Twilio] Missing sender number");
      res.set("Content-Type", "text/xml");
      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    console.log(`[Twilio] Message from ${from}: ${messageBody}`);

    // Fetch Twilio config from Firestore (single source of truth).
    const twilioConfig = await getTwilioConfigFromFirestore() || {};

    const sandboxJoinWords = twilioConfig.sandboxJoinWords || "join <your-sandbox-word>";
    const whatsappNumber = twilioConfig.whatsappNumber || "+14155238886";

    if (!messageBody.trim()) {
      // Empty message - send help with join instructions
      const response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>🦴 *BACKBONE*

Hey! Just send me a message and I'll get right on it. Finances, goals, health, research — whatever you need.</Message>
</Response>`;
      res.set("Content-Type", "text/xml");
      return res.status(200).send(response);
    }

    // Check for private mode prefix
    let isPrivate = false;
    const privatePrefixes = ["private:", "/private ", "🔒", "🔐"];
    for (const prefix of privatePrefixes) {
      if (messageBody.toLowerCase().startsWith(prefix)) {
        isPrivate = true;
        messageBody = messageBody.slice(prefix.length).trim();
        break;
      }
    }

    // Find or create user by phone
    let userId = null;
    let userPrivateMode = false;
    const userSnapshot = await db.collection("users")
      .where("whatsappPhone", "==", from)
      .limit(1)
      .get();

    if (!userSnapshot.empty) {
      userId = userSnapshot.docs[0].id;
      userPrivateMode = userSnapshot.docs[0].data().privateMode || false;
      if (userSnapshot.size > 1) {
        console.warn(`[Twilio] Multiple users found for ${from}. Using first match ${userId}.`);
      }
    } else {
      // Create new user for this phone
      const newUserRef = await db.collection("users").add({
        whatsappPhone: from,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: "twilio_whatsapp",
        privateMode: false
      });
      userId = newUserRef.id;
    }

    // Combine message-level and user-level private mode
    const hideFromApp = isPrivate || userPrivateMode;

    // ── Parse media (images) from Twilio ──────────────────────
    const numMedia = parseInt(body.NumMedia || "0", 10);
    let hasMedia = false;
    let mediaUrls = [];
    let mediaType = null;
    let imageBase64 = null;
    let imageContentType = null;

    if (numMedia > 0 && body.MediaUrl0) {
      hasMedia = true;
      mediaType = body.MediaContentType0 || "image/jpeg";

      // Download image from Twilio (requires Basic auth)
      try {
        const twilioAuth = Buffer.from(
          `${twilioConfig.accountSid || ""}:${twilioConfig.authToken || ""}`
        ).toString("base64");

        const mediaResponse = await fetch(body.MediaUrl0, {
          headers: { Authorization: `Basic ${twilioAuth}` },
          redirect: "follow",
        });

        if (mediaResponse.ok) {
          const arrayBuf = await mediaResponse.arrayBuffer();
          const imageBuffer = Buffer.from(arrayBuf);
          imageBase64 = imageBuffer.toString("base64");
          imageContentType = mediaType;

          // Upload to Firebase Storage
          const ext = mediaType.includes("png") ? "png" : mediaType.includes("gif") ? "gif" : "jpg";
          const storagePath = `backbone/whatsapp-images/${userId}/whatsapp-${Date.now()}.${ext}`;
          const bucket = admin.storage().bucket();
          const file = bucket.file(storagePath);
          await file.save(imageBuffer, { contentType: mediaType, metadata: { from, userId } });

          // Generate signed URL (7-day expiry)
          const [signedUrl] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
          });
          mediaUrls.push(signedUrl);

          console.log(`[Twilio] Image uploaded to Storage: ${storagePath}`);
        } else {
          console.warn(`[Twilio] Media download failed: ${mediaResponse.status}`);
        }
      } catch (mediaErr) {
        console.warn("[Twilio] Media processing error:", mediaErr.message);
      }
    }

    // Load conversation history BEFORE saving (so the compressed context is accurate)
    const prevHistory = await getConversationHistory(userId, WHATSAPP_HISTORY_WINDOW);
    const conversationContext = compressConversation(prevHistory);

    // Store the incoming message - local BACKBONE will pick this up
    // Include compressed conversation context so the server knows what the user is talking about
    const messageDoc = {
      content: messageBody || (hasMedia ? "[Image sent]" : ""),
      type: "user",
      channel: "twilio_whatsapp",
      from,
      twilioMessageId: messageSid,
      status: "pending",
      private: hideFromApp,
      showInApp: !hideFromApp,
      needsResponse: true,
      conversationContext: conversationContext || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Add media fields if image was sent
    if (hasMedia) {
      messageDoc.hasMedia = true;
      messageDoc.mediaUrls = mediaUrls;
      messageDoc.mediaType = mediaType;
    }

    await db.collection("users").doc(userId).collection("messages").add(messageDoc);

    console.log(`[Twilio] Message saved for user ${userId}, awaiting local BACKBONE response`);

    // Check if the local BACKBONE app is online (active within last 5 minutes)
    // The local app sends a presence heartbeat every 2 minutes.
    // We use a 5-minute window to account for brief network hiccups.
    let appIsOnline = false;
    try {
      const presenceDoc = await db.collection("users").doc(userId)
        .collection("presence").doc("status").get();

      if (presenceDoc.exists) {
        const presence = presenceDoc.data();
        const lastSeen = presence.lastSeen ? new Date(presence.lastSeen).getTime() : 0;
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

        if ((presence.status === "online" || presence.status === "busy") && lastSeen > fiveMinutesAgo) {
          appIsOnline = true;
        }

        console.log(`[Twilio] Presence check: status=${presence.status}, lastSeen=${Math.round((Date.now() - lastSeen) / 1000)}s ago, online=${appIsOnline}`);
      } else {
        console.log("[Twilio] No presence document found — assuming offline");
      }
    } catch (err) {
      console.warn("[Twilio] Could not check presence:", err.message);
    }

    // Always send typing indicator first
    if (messageSid && twilioConfig.accountSid && twilioConfig.authToken) {
      try {
        const typingAuth = Buffer.from(`${twilioConfig.accountSid}:${twilioConfig.authToken}`).toString("base64");
        await fetch("https://messaging.twilio.com/v2/Indicators/Typing.json", {
          method: "POST",
          headers: {
            "Authorization": `Basic ${typingAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            messageId: messageSid,
            channel: "whatsapp",
          }),
        });
      } catch (typingErr) {
        console.warn("[Twilio] Typing indicator failed:", typingErr.message);
      }
    }

    // If app is online, return empty TwiML — local BACKBONE will respond with full context
    if (appIsOnline) {
      console.log(`[Twilio] App is online — deferring to local BACKBONE`);
      res.set("Content-Type", "text/xml");
      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // ── App is OFFLINE: Use OpenAI to give a response from what it knows ──
    // Also queue a pending task so the local server can follow up when it comes back.
    console.log(`[Twilio] App is offline — generating AI response for user ${userId}`);

    // Get user's name for personalization
    let userName = "";
    try {
      if (!userSnapshot.empty) {
        const userData = userSnapshot.docs[0].data();
        userName = userData.displayName || userData.name || profileName || "";
      } else {
        userName = profileName || "";
      }
      if (userName.includes(" ")) userName = userName.split(" ")[0];
    } catch {}

    // Load conversation history and user context
    const history = await getConversationHistory(userId, WHATSAPP_HISTORY_WINDOW);
    const userContext = await loadUserContext(userId);

    let aiResponse = null;
    const openai = await getOpenAI();

    if (openai) {
      try {
        const systemPrompt = `You are BACKBONE — ${userName ? userName + "'s" : "a user's"} personal AI assistant. You know them from their synced data below. Be direct, helpful, and conversational.

${userContext ? `WHAT YOU KNOW:\n${userContext}\n` : ""}
RULES:
- Address their question FIRST. Be concise. WhatsApp format (*bold*, _italic_, •).
- Under 1200 chars. If you have the data, give a real answer with specifics.
- If you don't have the data for something, say "Let me check on that" or "I'll pull that up" — the backend will follow up.
- NEVER say "I don't have access" or "I can't check." Never mention cloud/local mode or system internals.
- Sound like a sharp friend, not a bot.`;

        const messages = [{ role: "system", content: systemPrompt }];
        for (const msg of history.slice(-15)) {
          messages.push({ role: msg.role, content: msg.content });
        }

        if (hasMedia && imageBase64 && imageContentType) {
          messages.push({ role: "user", content: [
            { type: "text", text: messageBody || "What do you see in this image?" },
            { type: "image_url", image_url: { url: `data:${imageContentType};base64,${imageBase64}` } },
          ] });
        } else {
          messages.push({ role: "user", content: messageBody });
        }

        const completion = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages,
          max_tokens: 2400,
        });

        const rawResponse = completion.choices?.[0]?.message?.content;
        if (rawResponse) {
          aiResponse = rawResponse
            .replace(/^🦴\s*\*?BACKBONE\*?\s*\n*/i, "")
            .replace(/\n*_—\s*\d{1,2}:\d{2}\s*(AM|PM)_\s*$/i, "")
            .split(/---MSG---/i)[0]
            .trim();

          // Save to Firestore for conversation continuity
          await db.collection("users").doc(userId).collection("messages").add({
            content: aiResponse,
            type: "ai",
            channel: "twilio_whatsapp",
            source: "cloud_openai",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      } catch (aiErr) {
        console.error("[Twilio] OpenAI error:", aiErr.message);
      }
    }

    // Fallback if OpenAI failed
    if (!aiResponse) {
      aiResponse = buildCloudFallbackResponse(messageBody, history, userName);
    }

    // Queue pending task for local follow-up when BACKBONE comes back online
    try {
      await db.collection("users").doc(userId).collection("pendingTasks").add({
        type: "whatsapp_followup",
        originalMessage: messageBody,
        from,
        status: "pending",
        userName: userName || null,
        conversationContext: conversationContext || null,
        aiQuickResponse: aiResponse,
        requiresFollowUp: true,
        hasMedia: hasMedia || false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (taskErr) {
      console.warn("[Twilio] Could not queue pending task:", taskErr.message);
    }

    // Send the OpenAI response via TwiML
    const safeResponse = aiResponse
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${safeResponse}</Message>
</Response>`;

    res.set("Content-Type", "text/xml");
    return res.status(200).send(twiml);

  } catch (error) {
    console.error("[Twilio] Webhook error:", error);

    const errorResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>🦴 *BACKBONE*

Hey, something glitched on my end. Give me a sec and try again.</Message>
</Response>`;
    res.set("Content-Type", "text/xml");
    return res.status(200).send(errorResponse);
  }
});

/**
 * Firestore Trigger: Send Twilio WhatsApp response when local BACKBONE responds
 *
 * When the local BACKBONE app writes an AI response to Firestore,
 * this trigger sends it to the user via Twilio WhatsApp API.
 *
 * Twilio credentials are read only from Firestore config/config_twilio.
 */
exports.sendTwilioResponse = functions.firestore
  .document("users/{userId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const userId = context.params.userId;

    // Only process AI responses from local BACKBONE for WhatsApp
    if (message.type !== "ai") {
      return null;
    }

    // Check if this is a response that needs to go to WhatsApp
    if (!message.sendToWhatsApp && message.channel !== "twilio_whatsapp_response") {
      return null;
    }

    // Get user data including phone number
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.whatsappPhone) {
      console.log(`[Twilio] No WhatsApp phone for user ${userId}`);
      return null;
    }

    // Single source of truth: Firestore config/config_twilio.
    const twilioConfig = await getTwilioConfigFromFirestore();
    const twilioAccountSid = twilioConfig?.accountSid || null;
    const twilioAuthToken = twilioConfig?.authToken || null;
    const twilioWhatsAppNumber = twilioConfig?.whatsappNumber || "+14155238886";

    if (!twilioAccountSid || !twilioAuthToken) {
      console.error("[Twilio] Missing credentials in Firestore config/config_twilio");
      return null;
    }

    try {
      // Send via Twilio REST API
      const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64");

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            From: `whatsapp:${twilioWhatsAppNumber}`,
            To: `whatsapp:${userData.whatsappPhone}`,
            Body: message.content
          })
        }
      );

      const result = await response.json();

      if (response.ok) {
        // Mark as sent
        await snap.ref.update({
          twilioSent: true,
          twilioMessageSid: result.sid,
          sentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`[Twilio] Response sent to ${userData.whatsappPhone}`);
      } else {
        console.error("[Twilio] Send failed:", result);
        await snap.ref.update({
          twilioError: result.message || "Failed to send"
        });
      }

    } catch (error) {
      console.error("[Twilio] Error sending response:", error);
      await snap.ref.update({
        twilioError: error.message
      });
    }

    return null;
  });

/**
 * HTTP Function: Toggle private mode for user
 */
exports.togglePrivateMode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
  }

  const userId = context.auth.uid;
  const { enabled } = data;

  await db.collection("users").doc(userId).update({
    privateMode: enabled === true,
    privateModeUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true, privateMode: enabled === true };
});

/**
 * Scheduled Function: Clean up old messages (optional)
 * Runs daily to remove messages older than 30 days
 */
exports.cleanupOldMessages = functions.pubsub.schedule("0 3 * * *").onRun(async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const usersSnapshot = await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const messagesSnapshot = await userDoc.ref.collection("messages")
      .where("createdAt", "<", thirtyDaysAgo)
      .get();

    const batch = db.batch();
    messagesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }

  console.log("Cleaned up old messages");
  return null;
});

// ══════════════════════════════════════════════════════════════════
// Vapi Voice AI Webhook — Permanent server URL for phone calls
// Set this as your Server URL on your Vapi phone number:
//   https://us-central1-backboneai.cloudfunctions.net/vapiWebhook
// ══════════════════════════════════════════════════════════════════

/**
 * Helper: Read Alpaca config from Firestore
 */
const getAlpacaConfig = async () => {
  try {
    const doc = await db.collection("config").doc("config_alpaca").get();
    if (doc.exists) return doc.data();
  } catch {}
  return null;
};

/**
 * Helper: Call Alpaca API
 */
const alpacaFetch = async (path, method = "GET", body = null) => {
  const config = await getAlpacaConfig();
  if (!config?.apiKey || !config?.apiSecret) {
    return { error: "Alpaca not configured in Firestore config/config_alpaca" };
  }
  const baseUrl = config.mode === "live"
    ? "https://api.alpaca.markets"
    : "https://paper-api.alpaca.markets";

  const opts = {
    method,
    headers: {
      "APCA-API-KEY-ID": config.apiKey,
      "APCA-API-SECRET-KEY": config.apiSecret,
      "Content-Type": "application/json"
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(`${baseUrl}${path}`, opts);
  if (!resp.ok) {
    const err = await resp.text();
    return { error: `Alpaca ${resp.status}: ${err}` };
  }
  return await resp.json();
};

/**
 * Execute a Vapi tool call
 */
const executeVapiTool = async (toolName, params, userId) => {
  switch (toolName) {
    case "get_portfolio": {
      const acct = await alpacaFetch("/v2/account");
      if (acct.error) return acct.error;
      return `Portfolio: Equity $${Number(acct.equity).toLocaleString()}, Buying Power $${Number(acct.buying_power).toLocaleString()}, Day Change $${(Number(acct.equity) - Number(acct.last_equity)).toFixed(2)}`;
    }

    case "get_positions": {
      const positions = await alpacaFetch("/v2/positions");
      if (positions.error) return positions.error;
      if (!Array.isArray(positions) || positions.length === 0) return "No open positions.";
      return positions.map(p =>
        `${p.symbol}: ${p.qty} shares, $${Number(p.market_value).toLocaleString()}, P&L ${(Number(p.unrealized_plpc) * 100).toFixed(1)}%`
      ).join("; ");
    }

    case "buy_stock": {
      const order = await alpacaFetch("/v2/orders", "POST", {
        symbol: params.symbol?.toUpperCase(),
        qty: String(params.qty),
        side: "buy",
        type: "market",
        time_in_force: "day"
      });
      if (order.error) return `Trade failed: ${order.error}`;
      return `BUY order placed: ${params.qty} shares of ${params.symbol?.toUpperCase()}, order ID ${order.id}`;
    }

    case "sell_stock": {
      const order = await alpacaFetch("/v2/orders", "POST", {
        symbol: params.symbol?.toUpperCase(),
        qty: String(params.qty),
        side: "sell",
        type: "market",
        time_in_force: "day"
      });
      if (order.error) return `Trade failed: ${order.error}`;
      return `SELL order placed: ${params.qty} shares of ${params.symbol?.toUpperCase()}, order ID ${order.id}`;
    }

    case "get_goals": {
      if (!userId) return "No user context available.";
      try {
        const goalsSnap = await db.collection("users").doc(userId)
          .collection("syncedData").doc("goals").get();
        if (goalsSnap.exists) {
          const data = goalsSnap.data();
          const goals = data.goals || [];
          const active = goals.filter(g => g.status === "active");
          if (active.length === 0) return "No active goals.";
          return active.map(g => `${g.title} (${g.progress || 0}% complete)`).join("; ");
        }
      } catch {}
      return "Goals data not available in cloud. Check the context I was given at call start.";
    }

    case "get_health_summary": {
      if (!userId) return "No user context available.";
      try {
        const healthSnap = await db.collection("users").doc(userId)
          .collection("syncedData").doc("health").get();
        if (healthSnap.exists) {
          const data = healthSnap.data();
          const parts = [];
          if (data.sleepScore) parts.push(`Sleep: ${data.sleepScore}`);
          if (data.readiness) parts.push(`Readiness: ${data.readiness}`);
          if (data.activity) parts.push(`Activity: ${data.activity}`);
          if (parts.length > 0) return parts.join(", ");
        }
      } catch {}
      return "Health data not available in cloud. Check the context I was given at call start.";
    }

    case "get_life_scores": {
      if (!userId) return "No user context available.";
      try {
        const scoresSnap = await db.collection("users").doc(userId)
          .collection("syncedData").doc("lifeScores").get();
        if (scoresSnap.exists) {
          const data = scoresSnap.data();
          return Object.entries(data)
            .filter(([k]) => k !== "updatedAt")
            .map(([k, v]) => `${k}: ${typeof v === "object" ? v.score || JSON.stringify(v) : v}`)
            .join(", ");
        }
      } catch {}
      return "Life scores not available in cloud. Check the context I was given at call start.";
    }

    case "web_search": {
      return `Web search is not available from the cloud function. I'll use the context I already have, or suggest the user check BACKBONE terminal for: "${params.query}"`;
    }

    case "send_email": {
      // Save draft to Firestore for safety
      if (!userId) return "Cannot save draft without user context.";
      await db.collection("users").doc(userId).collection("emailDrafts").add({
        to: params.to,
        subject: params.subject,
        body: params.body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: "vapi_call"
      });
      return `Email draft saved. To: ${params.to}, Subject: "${params.subject}". Review and send from BACKBONE.`;
    }

    case "get_calendar_events": {
      return "Calendar events were included in the call context. Ask me about them directly.";
    }

    case "run_task": {
      // Can't run Claude Code from cloud function — log the request
      if (userId) {
        await db.collection("users").doc(userId).collection("pendingTasks").add({
          description: params.description,
          source: "vapi_call",
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      return `I've queued that task for BACKBONE to work on: "${params.description}". It will be processed when your local BACKBONE is running.`;
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
};

/**
 * POST /vapiWebhook — Vapi server messages handler
 *
 * Handles: tool-calls, status-update, transcript, end-of-call-report
 * Set as Server URL on your Vapi phone number in the dashboard.
 */
exports.vapiWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const message = req.body;
    const messageType = message?.message?.type || message?.type;

    // Try to resolve userId from the call's customer phone number
    let userId = null;
    const customerPhone = message?.message?.customer?.number || message?.call?.customer?.number;
    if (customerPhone) {
      // Normalize: strip +, spaces, dashes
      const normalized = customerPhone.replace(/[\s\-\+]/g, "");
      try {
        // Look up by phone number
        const userSnap = await db.collection("users")
          .where("whatsappPhone", "==", normalized)
          .limit(1)
          .get();
        if (!userSnap.empty) {
          userId = userSnap.docs[0].id;
        }
      } catch {}
    }

    // Handle tool-calls
    if (messageType === "tool-calls") {
      const toolCalls = message.message?.toolCalls || [];
      const results = [];

      for (const tc of toolCalls) {
        const toolName = tc.function?.name || tc.name;
        let params;
        try {
          params = typeof tc.function?.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : tc.function?.arguments || {};
        } catch {
          params = {};
        }
        const toolCallId = tc.id;
        const result = await executeVapiTool(toolName, params, userId);

        results.push({
          toolCallId,
          result: typeof result === "string" ? result : JSON.stringify(result)
        });
      }

      return res.json({ results });
    }

    // Handle end-of-call-report — save transcript
    if (messageType === "end-of-call-report") {
      const report = message.message || message;
      const callId = report.call?.id || message.call?.id || `call_${Date.now()}`;

      const transcriptData = {
        callId,
        duration: report.endedReason ? undefined : report.duration || report.durationSeconds,
        endedReason: report.endedReason,
        summary: report.summary,
        transcript: report.transcript || report.messages || [],
        recordingUrl: report.recordingUrl,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        customerPhone: customerPhone || null
      };

      // Save to user's call transcripts if we have a userId
      if (userId) {
        await db.collection("users").doc(userId)
          .collection("callTranscripts").doc(callId).set(transcriptData);
        console.log(`[Vapi] Call transcript saved for user ${userId}, call ${callId}`);
      } else {
        // Save to global collection as fallback
        await db.collection("callTranscripts").doc(callId).set(transcriptData);
        console.log(`[Vapi] Call transcript saved globally, call ${callId}`);
      }
    }

    // Handle transcript messages — accumulate for real-time if needed
    if (messageType === "transcript") {
      // These come in real-time during the call, log for debugging
      const role = message.message?.role || "unknown";
      const text = message.message?.transcript || "";
      console.log(`[Vapi] Transcript (${role}): ${text.substring(0, 100)}`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[Vapi] Webhook error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
