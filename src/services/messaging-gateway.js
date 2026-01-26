/**
 * Messaging Gateway
 *
 * Unified interface for all messaging channels:
 * - Firebase Real-time (primary - for mobile/web app)
 * - WhatsApp Business API
 * - SMS (via Twilio/Firebase)
 * - Push Notifications (FCM)
 *
 * This service routes messages to/from the AI Brain through
 * the appropriate channel based on user preferences.
 *
 * Architecture for 100+ Users:
 * ┌─────────────────────────────────────────────────────────┐
 * │                    MESSAGING GATEWAY                     │
 * │                                                          │
 * │   Channels:          User sends message via any channel  │
 * │   ┌──────────┐      ┌──────────┐      ┌──────────┐      │
 * │   │ Firebase │      │ WhatsApp │      │   SMS    │      │
 * │   │ Realtime │      │   API    │      │ (Twilio) │      │
 * │   └────┬─────┘      └────┬─────┘      └────┬─────┘      │
 * │        │                 │                  │            │
 * │        └────────────────┼──────────────────┘            │
 * │                         ▼                                │
 * │              ┌─────────────────┐                        │
 * │              │   AI BRAIN      │                        │
 * │              │  (processes &   │                        │
 * │              │   responds)     │                        │
 * │              └────────┬────────┘                        │
 * │                       │                                  │
 * │        ┌──────────────┼──────────────┐                  │
 * │        ▼              ▼              ▼                  │
 * │   ┌──────────┐  ┌──────────┐  ┌──────────┐             │
 * │   │ Firebase │  │ WhatsApp │  │   Push   │             │
 * │   │ Response │  │ Response │  │  Notif   │             │
 * │   └──────────┘  └──────────┘  └──────────┘             │
 * └─────────────────────────────────────────────────────────┘
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { getRealtimeMessaging, MESSAGE_TYPE, MESSAGE_STATUS } from "./realtime-messaging.js";
import { getTwilioWhatsApp } from "./twilio-whatsapp.js";
import { getFirebaseMessaging, MESSAGE_TYPES as SMS_MESSAGE_TYPES } from "./firebase-messaging.js";
import { sendPushNotification, PUSH_NOTIFICATION_TYPES } from "./firebase-push.js";

const DATA_DIR = path.join(process.cwd(), "data");
const GATEWAY_CONFIG_PATH = path.join(DATA_DIR, "messaging-gateway.json");

/**
 * Messaging channels
 */
export const CHANNEL = {
  FIREBASE: "firebase",       // Firebase Realtime (mobile/web app)
  WHATSAPP: "whatsapp",       // WhatsApp Business
  SMS: "sms",                 // SMS via Twilio
  PUSH: "push"                // Push notifications only
};

/**
 * User preference for primary channel
 */
export const DEFAULT_CHANNEL_PRIORITY = [
  CHANNEL.FIREBASE,   // Best for app users
  CHANNEL.WHATSAPP,   // Good for non-app users
  CHANNEL.SMS,        // Fallback
  CHANNEL.PUSH        // Notification only
];

/**
 * Messaging Gateway Class
 */
export class MessagingGateway extends EventEmitter {
  constructor() {
    super();
    this.config = this.loadConfig();
    this.realtimeMessaging = null;
    this.whatsAppService = null;
    this.firebaseMessaging = null;
    this.messageHandler = null;
    this.initialized = false;
  }

  /**
   * Load configuration
   */
  loadConfig() {
    try {
      if (fs.existsSync(GATEWAY_CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(GATEWAY_CONFIG_PATH, "utf-8"));
      }
    } catch (err) {
      console.error("[MessagingGateway] Failed to load config:", err.message);
    }

    return {
      userId: null,
      enabledChannels: [CHANNEL.FIREBASE, CHANNEL.PUSH],
      channelPriority: DEFAULT_CHANNEL_PRIORITY,
      userPreferences: {
        preferredChannel: CHANNEL.FIREBASE,
        quietHoursEnabled: true,
        quietHoursStart: 22,
        quietHoursEnd: 7
      }
    };
  }

  /**
   * Save configuration
   */
  saveConfig() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(GATEWAY_CONFIG_PATH, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error("[MessagingGateway] Failed to save config:", err.message);
    }
  }

  /**
   * Initialize the gateway
   * @param {string} userId - User's Firebase ID
   * @param {Function} messageHandler - Async function to process messages: (message) => response
   */
  async initialize(userId, messageHandler) {
    if (!userId) {
      return { success: false, error: "User ID is required" };
    }

    this.config.userId = userId;
    this.messageHandler = messageHandler;

    const results = {
      firebase: null,
      whatsapp: null,
      sms: null
    };

    // Initialize Firebase Realtime Messaging (primary)
    try {
      this.realtimeMessaging = getRealtimeMessaging();
      await this.realtimeMessaging.initialize(userId);

      // Set up message handler
      this.realtimeMessaging.setMessageHandler(async (message) => {
        return this.handleIncomingMessage(message, CHANNEL.FIREBASE);
      });

      // Start listening
      await this.realtimeMessaging.startListening();

      // Forward events
      this.realtimeMessaging.on("message-received", (data) => {
        this.emit("message-received", { channel: CHANNEL.FIREBASE, ...data });
      });
      this.realtimeMessaging.on("message-sent", (data) => {
        this.emit("message-sent", { channel: CHANNEL.FIREBASE, ...data });
      });

      results.firebase = { success: true };
      this.config.enabledChannels.push(CHANNEL.FIREBASE);
    } catch (err) {
      results.firebase = { success: false, error: err.message };
    }

    // Initialize WhatsApp via Twilio (if configured)
    try {
      this.whatsAppService = getTwilioWhatsApp();
      const waResult = await this.whatsAppService.initialize();

      if (waResult.success) {
        results.whatsapp = { success: true, phoneNumber: waResult.whatsappNumber, provider: "Twilio" };
        this.config.enabledChannels.push(CHANNEL.WHATSAPP);

        // Forward events
        this.whatsAppService.on("message-received", async (data) => {
          const response = await this.handleIncomingMessage({
            content: data.content,
            from: data.from,
            type: MESSAGE_TYPE.USER
          }, CHANNEL.WHATSAPP);

          // Send response via WhatsApp
          if (response?.content) {
            await this.whatsAppService.sendMessage(data.from, response.content);
          }

          this.emit("message-received", { channel: CHANNEL.WHATSAPP, ...data });
        });
      } else {
        results.whatsapp = waResult;
      }
    } catch (err) {
      results.whatsapp = { success: false, error: err.message };
    }

    // Initialize SMS/Firebase Messaging
    try {
      this.firebaseMessaging = getFirebaseMessaging();
      const smsResult = await this.firebaseMessaging.initialize();

      if (smsResult.success) {
        results.sms = { success: true };
        this.config.enabledChannels.push(CHANNEL.SMS);

        // Forward events
        this.firebaseMessaging.on("message-received", async (data) => {
          const response = await this.handleIncomingMessage({
            content: data.body,
            from: data.from,
            type: MESSAGE_TYPE.USER
          }, CHANNEL.SMS);

          // Send response via SMS
          if (response?.content) {
            await this.firebaseMessaging.sendSMS(response.content);
          }

          this.emit("message-received", { channel: CHANNEL.SMS, ...data });
        });
      } else {
        results.sms = smsResult;
      }
    } catch (err) {
      results.sms = { success: false, error: err.message };
    }

    // Push is always "available" (just needs FCM token)
    this.config.enabledChannels.push(CHANNEL.PUSH);

    // Remove duplicates
    this.config.enabledChannels = [...new Set(this.config.enabledChannels)];

    this.initialized = true;
    this.saveConfig();

    this.emit("initialized", results);

    return {
      success: true,
      channels: results,
      enabledChannels: this.config.enabledChannels
    };
  }

  /**
   * Handle incoming message from any channel
   */
  async handleIncomingMessage(message, channel) {
    this.emit("processing", { message, channel });

    try {
      if (!this.messageHandler) {
        return {
          content: "Message received but no AI handler configured.",
          type: MESSAGE_TYPE.SYSTEM
        };
      }

      // Add channel info to message
      const enrichedMessage = {
        ...message,
        channel,
        receivedAt: new Date().toISOString()
      };

      // Process with AI
      const response = await this.messageHandler(enrichedMessage);

      this.emit("processed", { message, channel, response });

      return response;
    } catch (error) {
      console.error(`[MessagingGateway] Error processing message:`, error.message);
      this.emit("error", { message, channel, error: error.message });

      return {
        content: "Sorry, I encountered an error processing your message.",
        type: MESSAGE_TYPE.SYSTEM,
        error: error.message
      };
    }
  }

  /**
   * Send a message via the best available channel
   */
  async sendMessage(content, options = {}) {
    const channel = options.channel || this.getBestChannel();

    switch (channel) {
      case CHANNEL.FIREBASE:
        return this.sendViaFirebase(content, options);
      case CHANNEL.WHATSAPP:
        return this.sendViaWhatsApp(content, options);
      case CHANNEL.SMS:
        return this.sendViaSMS(content, options);
      case CHANNEL.PUSH:
        return this.sendViaPush(content, options);
      default:
        return { success: false, error: `Unknown channel: ${channel}` };
    }
  }

  /**
   * Send via Firebase Realtime
   */
  async sendViaFirebase(content, options = {}) {
    if (!this.realtimeMessaging) {
      return { success: false, error: "Firebase not initialized" };
    }

    return this.realtimeMessaging.sendMessage(content, options);
  }

  /**
   * Send via WhatsApp (Twilio)
   */
  async sendViaWhatsApp(content, options = {}) {
    if (!this.whatsAppService?.initialized) {
      return { success: false, error: "WhatsApp not configured" };
    }

    const phoneNumber = options.to || this.config.userPhone;
    if (!phoneNumber) {
      return { success: false, error: "No phone number for WhatsApp" };
    }

    // Check if we need to use template (outside 24-hour window)
    if (options.useTemplate && options.templateSid) {
      return this.whatsAppService.sendTemplateMessage(
        phoneNumber,
        options.templateSid,
        options.variables || {}
      );
    }

    // Check if we have media to send
    if (options.mediaUrl) {
      return this.whatsAppService.sendMediaMessage(phoneNumber, content, options.mediaUrl);
    }

    return this.whatsAppService.sendMessage(phoneNumber, content);
  }

  /**
   * Send via SMS
   */
  async sendViaSMS(content, options = {}) {
    if (!this.firebaseMessaging) {
      return { success: false, error: "SMS not configured" };
    }

    return this.firebaseMessaging.sendSMS(content, {
      type: options.type || SMS_MESSAGE_TYPES.UPDATE,
      priority: options.priority || "normal"
    });
  }

  /**
   * Send via Push notification
   */
  async sendViaPush(content, options = {}) {
    const title = options.title || "BACKBONE";
    return sendPushNotification(
      options.notificationType || PUSH_NOTIFICATION_TYPES.SYSTEM_ALERT,
      {
        title,
        message: content,
        ...options.data
      }
    );
  }

  /**
   * Get the best available channel
   */
  getBestChannel() {
    // Check user preference first
    const preferred = this.config.userPreferences.preferredChannel;
    if (this.isChannelAvailable(preferred)) {
      return preferred;
    }

    // Fall back to priority list
    for (const channel of this.config.channelPriority) {
      if (this.isChannelAvailable(channel)) {
        return channel;
      }
    }

    return CHANNEL.PUSH; // Always available as last resort
  }

  /**
   * Check if a channel is available
   */
  isChannelAvailable(channel) {
    switch (channel) {
      case CHANNEL.FIREBASE:
        return this.realtimeMessaging?.listening;
      case CHANNEL.WHATSAPP:
        return this.whatsAppService?.initialized;
      case CHANNEL.SMS:
        return this.firebaseMessaging?.initialized;
      case CHANNEL.PUSH:
        return true; // Always available
      default:
        return false;
    }
  }

  /**
   * Ask user a question with multiple channel fallback
   */
  async askUser(question, options = {}) {
    const channel = options.channel || this.getBestChannel();

    // Send via primary channel
    const result = await this.sendMessage(question, {
      ...options,
      channel,
      type: MESSAGE_TYPE.QUESTION
    });

    // Also send push notification if not the primary channel
    if (channel !== CHANNEL.PUSH && options.sendPush !== false) {
      await this.sendViaPush(question, {
        title: options.pushTitle || "Question from BACKBONE",
        notificationType: PUSH_NOTIFICATION_TYPES.GOAL_REMINDER
      });
    }

    return result;
  }

  /**
   * Send an alert via all enabled channels
   */
  async sendAlert(alert, options = {}) {
    const results = {};

    // Send via all enabled channels for critical alerts
    for (const channel of this.config.enabledChannels) {
      try {
        results[channel] = await this.sendMessage(alert, {
          ...options,
          channel,
          type: MESSAGE_TYPE.ACTION,
          priority: "high"
        });
      } catch (err) {
        results[channel] = { success: false, error: err.message };
      }
    }

    return results;
  }

  /**
   * Update user preferences
   */
  updatePreferences(preferences) {
    this.config.userPreferences = {
      ...this.config.userPreferences,
      ...preferences
    };
    this.saveConfig();
    this.emit("preferences-updated", this.config.userPreferences);
  }

  /**
   * Set user's phone number for WhatsApp/SMS
   */
  async setUserPhone(phoneNumber) {
    this.config.userPhone = phoneNumber;
    this.saveConfig();

    // Register with WhatsApp if available
    if (this.whatsAppService?.initialized) {
      this.whatsAppService.registerUser(phoneNumber, this.config.userId);
    }

    // Set for SMS
    if (this.firebaseMessaging) {
      await this.firebaseMessaging.setPhoneNumber(phoneNumber);
    }

    return { success: true };
  }

  /**
   * Stop all listeners
   */
  async stop() {
    if (this.realtimeMessaging) {
      await this.realtimeMessaging.stopListening();
    }

    this.emit("stopped");
  }

  /**
   * Get status of all channels
   */
  getStatus() {
    return {
      initialized: this.initialized,
      userId: this.config.userId,
      enabledChannels: this.config.enabledChannels,
      channels: {
        firebase: this.realtimeMessaging?.getStatus() || { initialized: false },
        whatsapp: this.whatsAppService?.getStatus() || { initialized: false },
        sms: this.firebaseMessaging?.getStatus() || { initialized: false },
        push: { initialized: true, configured: true }
      },
      preferences: this.config.userPreferences
    };
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      active: this.initialized,
      channels: this.config.enabledChannels.map(ch => ({
        name: ch,
        active: this.isChannelAvailable(ch)
      })),
      preferredChannel: this.config.userPreferences.preferredChannel,
      userPhone: this.config.userPhone ? "configured" : "not set"
    };
  }
}

// Singleton instance
let instance = null;

export const getMessagingGateway = () => {
  if (!instance) {
    instance = new MessagingGateway();
  }
  return instance;
};

/**
 * Quick setup function
 * Connect messaging to AI Brain with sophisticated response handling
 *
 * Response Strategy:
 * 1. If AI can confidently answer - respond directly
 * 2. If AI is uncertain - acknowledge and create a priority goal to research
 * 3. After research completes, send follow-up with results, docs, URLs, or actions taken
 */
export const setupMessaging = async (userId, aiBrain) => {
  const gateway = getMessagingGateway();

  // Create sophisticated message handler
  const messageHandler = async (message) => {
    try {
      const { loadUserSettings } = await import("./user-settings.js");
      const settings = loadUserSettings();
      const appName = settings.appName || "Backbone";

      // First, evaluate if we can confidently answer
      const evaluationPrompt = `Evaluate if you can confidently answer this question based on what you currently know.
Question: "${message.content}"

Respond with JSON only:
{
  "canAnswer": true/false,
  "confidence": 0-100,
  "answer": "your answer if confident" or null,
  "researchNeeded": "what needs to be researched" or null,
  "category": "question/request/action/info"
}`;

      const evaluation = await aiBrain.chat(evaluationPrompt, {
        context: { channel: message.channel, from: message.from, format: "json" }
      });

      let evalResult;
      try {
        const jsonMatch = (evaluation.text || evaluation.content || "").match(/\{[\s\S]*\}/);
        evalResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { canAnswer: false, confidence: 0 };
      } catch (e) {
        evalResult = { canAnswer: false, confidence: 0 };
      }

      // High confidence - respond directly
      if (evalResult.canAnswer && evalResult.confidence >= 70) {
        return {
          content: evalResult.answer || evaluation.text || "I processed your message.",
          type: MESSAGE_TYPE.AI,
          metadata: {
            model: evaluation.model,
            tokens: evaluation.tokens,
            confidence: evalResult.confidence
          }
        };
      }

      // Low confidence - create goal and acknowledge
      const { getGoalManager, GOAL_PRIORITY } = await import("./goal-manager.js");
      const goalManager = getGoalManager();

      // Create a priority research goal
      const researchGoal = {
        title: `Research: ${message.content.slice(0, 50)}${message.content.length > 50 ? "..." : ""}`,
        description: `User asked via WhatsApp: "${message.content}"\n\nResearch needed: ${evalResult.researchNeeded || "Find accurate information to answer this question"}`,
        priority: GOAL_PRIORITY.URGENT,
        category: "research",
        source: "whatsapp",
        originalMessage: message.content,
        userId: userId,
        notifyOnComplete: true,
        notifyChannel: message.channel || "whatsapp"
      };

      await goalManager.addGoal(researchGoal, true); // Set as current goal

      // Send acknowledgment
      const acknowledgment = evalResult.researchNeeded
        ? `I don't have all the information on "${message.content.slice(0, 40)}..." yet, but I'm on it now. I'll research this and get back to you with what I find, including any relevant documents, links, or actions I take.`
        : `Good question! Let me look into that for you. I'll do some research and get back to you shortly with a thorough answer.`;

      // Set up goal completion listener to send follow-up
      const onGoalComplete = async ({ goal, summary }) => {
        if (goal.originalMessage === message.content && goal.notifyOnComplete) {
          try {
            const { getWhatsAppService } = await import("./whatsapp-service.js");
            const whatsapp = getWhatsAppService();

            if (whatsapp && whatsapp.initialized && settings.phoneNumber) {
              // Build detailed follow-up message
              let followUp = `${appName}: I've completed my research on your question.\n\n`;
              followUp += summary || `Regarding: "${message.content.slice(0, 50)}..."`;

              // Add any actions taken
              const actionHistory = goalManager.actionHistory || [];
              const recentActions = actionHistory.filter(a =>
                a.timestamp && new Date(a.timestamp) > new Date(goal.createdAt)
              ).slice(0, 3);

              if (recentActions.length > 0) {
                followUp += "\n\nActions taken:";
                for (const action of recentActions) {
                  followUp += `\n• ${action.action?.action || action.type || "Action"}: ${action.result?.summary || "completed"}`;
                }
              }

              await whatsapp.sendTextMessage(settings.phoneNumber, followUp);
            }
          } catch (err) {
            console.error("[MessagingGateway] Failed to send follow-up:", err.message);
          }
        }
      };

      goalManager.once("goal-completed", onGoalComplete);

      return {
        content: acknowledgment,
        type: MESSAGE_TYPE.AI,
        metadata: {
          model: evaluation.model,
          pendingResearch: true,
          goalCreated: researchGoal.title,
          confidence: evalResult.confidence
        }
      };

    } catch (error) {
      console.error("[MessagingGateway] AI processing error:", error.message);
      return {
        content: "I received your message but ran into an issue processing it. Let me try again in a moment.",
        type: MESSAGE_TYPE.SYSTEM,
        error: error.message
      };
    }
  };

  await gateway.initialize(userId, messageHandler);

  return gateway;
};

export default MessagingGateway;
