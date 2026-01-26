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
        const from = message.from; // Phone number
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
      const message = {
        notification: {
          title: notification.title || "BACKBONE",
          body: notification.body || "You have a new message"
        },
        data: notification.data || {},
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
 * Configure this URL in Twilio Console > Messaging > Settings > WhatsApp Sandbox
 * URL: https://us-central1-YOUR_PROJECT.cloudfunctions.net/twilioWhatsAppWebhook
 *
 * This processes incoming WhatsApp messages and responds with AI
 *
 * Private Mode:
 * - Start message with "private:" or "/private " to hide from app conversation
 * - Private messages are processed but not shown in the main app UI
 * - User can toggle global private mode in settings
 */
exports.twilioWhatsAppWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    // Twilio sends form-urlencoded data
    const from = req.body.From?.replace("whatsapp:", "") || null;
    let messageBody = req.body.Body || "";
    const messageSid = req.body.MessageSid || null;

    console.log(`[Twilio] Message from ${from}: ${messageBody}`);

    if (!messageBody.trim()) {
      // Empty message - send help
      const response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Hi! I'm BACKBONE, your AI assistant. Send me a message and I'll help you with:
- Goals and productivity
- Health insights
- Trading analysis
- Any questions you have

Tip: Start with "private:" to keep messages hidden from the app.</Message>
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

    // Store the incoming message
    const userMessageRef = await db.collection("users").doc(userId).collection("messages").add({
      content: messageBody,
      type: "user",
      channel: "twilio_whatsapp",
      from,
      twilioMessageId: messageSid,
      status: "pending",
      private: hideFromApp,
      showInApp: !hideFromApp,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Generate AI response with context
    let aiResponse = await generateAIResponse(userId, messageBody);

    // Store AI response
    await db.collection("users").doc(userId).collection("messages").add({
      content: aiResponse,
      type: "ai",
      channel: "twilio_whatsapp",
      to: from,
      replyTo: userMessageRef.id,
      private: hideFromApp,
      showInApp: !hideFromApp,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Add privacy indicator if message was private
    if (hideFromApp) {
      aiResponse = "🔒 " + aiResponse;
    }

    // Escape XML characters
    aiResponse = aiResponse
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

    // Return TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${aiResponse}</Message>
</Response>`;

    res.set("Content-Type", "text/xml");
    return res.status(200).send(twiml);

  } catch (error) {
    console.error("[Twilio] Webhook error:", error);

    // Return error message
    const errorResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Sorry, I encountered an error. Please try again.</Message>
</Response>`;
    res.set("Content-Type", "text/xml");
    return res.status(200).send(errorResponse);
  }
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
 * Get user context from Firestore for better AI responses
 */
async function getUserContext(userId) {
  const context = {
    profile: null,
    goals: [],
    recentMessages: []
  };

  try {
    // Get user profile
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      context.profile = {
        name: data.name || data.displayName || null,
        preferences: data.preferences || {},
        privateMode: data.privateMode || false
      };
    }

    // Get user's goals (if stored in Firestore)
    const goalsSnapshot = await db.collection("users").doc(userId)
      .collection("goals")
      .where("status", "==", "active")
      .limit(5)
      .get();

    context.goals = goalsSnapshot.docs.map(doc => ({
      title: doc.data().title,
      category: doc.data().category
    }));

    // Get recent conversation history for context
    const messagesSnapshot = await db.collection("users").doc(userId)
      .collection("messages")
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    context.recentMessages = messagesSnapshot.docs
      .map(doc => ({
        role: doc.data().type === "user" ? "user" : "assistant",
        content: doc.data().content
      }))
      .reverse();

  } catch (error) {
    console.error("[Context] Error fetching user context:", error);
  }

  return context;
}

/**
 * Build system prompt with user context
 */
function buildSystemPrompt(userContext) {
  let prompt = `You are BACKBONE, a helpful AI life assistant. Keep responses concise (under 300 chars) for WhatsApp. Be friendly and actionable.`;

  if (userContext.profile?.name) {
    prompt += `\n\nUser's name: ${userContext.profile.name}`;
  }

  if (userContext.goals.length > 0) {
    const goalsList = userContext.goals.map(g => `- ${g.title}`).join("\n");
    prompt += `\n\nUser's active goals:\n${goalsList}`;
  }

  prompt += `\n\nProvide helpful, personalized responses based on the user's context. If they ask about their goals or progress, reference their specific goals.`;

  return prompt;
}

/**
 * Generate AI response for WhatsApp message
 * Uses OpenAI or Claude API with user context
 */
async function generateAIResponse(userId, message) {
  // Get user context for personalized responses
  const userContext = await getUserContext(userId);

  // Get API keys from Firebase config
  const openaiKey = functions.config().openai?.api_key;
  const claudeKey = functions.config().anthropic?.api_key;

  // Build system prompt with context
  const systemPrompt = buildSystemPrompt(userContext);

  // Build messages array with recent conversation history
  const messages = [];

  // Add recent conversation history (last 6 messages for context)
  if (userContext.recentMessages.length > 0) {
    const recentHistory = userContext.recentMessages.slice(-6);
    messages.push(...recentHistory);
  }

  // Add current message
  messages.push({ role: "user", content: message });

  if (openaiKey) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages
          ],
          max_tokens: 200
        })
      });

      const data = await response.json();
      if (data.choices?.[0]?.message?.content) {
        return data.choices[0].message.content;
      }
    } catch (error) {
      console.error("[AI] OpenAI error:", error);
    }
  }

  if (claudeKey) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": claudeKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 200,
          system: systemPrompt,
          messages: messages
        })
      });

      const data = await response.json();
      if (data.content?.[0]?.text) {
        return data.content[0].text;
      }
    } catch (error) {
      console.error("[AI] Claude error:", error);
    }
  }

  // Fallback response if no AI configured
  return `I received your message: "${message.slice(0, 50)}..."\n\nTo enable AI responses, configure OpenAI or Claude API keys in Firebase.`;
}

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
