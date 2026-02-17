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
import { getFirebaseMessaging, MESSAGE_TYPES as SMS_MESSAGE_TYPES } from "../firebase/firebase-messaging.js";
import { sendPushNotification, PUSH_NOTIFICATION_TYPES } from "../firebase/firebase-push.js";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
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
        results.whatsapp = {
          success: true,
          phoneNumber: waResult.whatsappNumber || null,
          provider: waResult.provider || this.whatsAppService?.activeProvider || "twilio",
          connected: waResult.connected ?? undefined,
          requiresPairing: waResult.requiresPairing ?? undefined
        };
        this.config.enabledChannels.push(CHANNEL.WHATSAPP);

        // Forward WhatsApp events — but DON'T process/respond here.
        // RealtimeMessaging already handles incoming WhatsApp messages via Firestore.
        // Responding here would cause DUPLICATE messages.
        this.whatsAppService.on("message-received", async (data) => {
          // Only emit the event for other listeners (UI, logging).
          // Do NOT call handleIncomingMessage or send a response.
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

  // Create message handler that routes through Claude Code CLI for full tool access
  const messageHandler = async (message) => {
    try {
      const { loadUserSettings } = await import("./user-settings.js");
      const settings = loadUserSettings();

      // ALWAYS route through Claude Code CLI — it has MCP tools, file access,
      // web search, and CLAUDE.md context. The old "evaluate then research" pattern
      // used a bare LLM with zero tool access and couldn't do anything useful.
      const { runClaudeCodeStreaming, getClaudeCodeStatus } = await import("../ai/claude-code-cli.js");
      const cliStatus = await getClaudeCodeStatus();

      if (cliStatus.ready) {
        console.log(`[MessagingGateway] Routing to Claude Code CLI: "${message.content.slice(0, 80)}"`);

        const cliPrompt = `The user sent this message via WhatsApp. Answer concisely (max 3-4 sentences for simple questions, more for complex ones). Use your MCP tools and file access to get real data — never say "I don't have access".

User message: "${message.content}"

IMPORTANT: You have full access to MCP tools (backbone-trading, backbone-brokerage, backbone-life, backbone-health, backbone-google, etc.), file system, and web search. Use them to answer with real data. Keep the response WhatsApp-friendly (no markdown tables, use plain text).`;

        // Collect streamed output
        return await new Promise((resolve, reject) => {
          let fullOutput = "";
          const timeout = setTimeout(() => {
            resolve({
              content: fullOutput || "I'm working on this but it's taking longer than expected. I'll follow up shortly.",
              type: MESSAGE_TYPE.AI,
              metadata: { model: "claude-code-cli", timedOut: true }
            });
          }, 3 * 60 * 1000); // 3 minute timeout

          const stream = runClaudeCodeStreaming(cliPrompt, {
            timeout: 3 * 60 * 1000,
          });

          // Handle both Promise and EventEmitter returns (Agent SDK vs CLI)
          const attachListeners = (emitter) => {
            emitter.on("data", (text) => {
              // Accumulate only the final assistant text, skip tool output lines
              if (text && !text.startsWith("[Tool]") && !text.startsWith("Read(") &&
                  !text.startsWith("Bash(") && !text.startsWith("Glob(") &&
                  !text.startsWith("Grep(") && !text.startsWith("Edit(") &&
                  !text.startsWith("Write(") && !text.startsWith("WebSearch(") &&
                  !text.startsWith("Fetch(")) {
                fullOutput = text; // Claude Code streams full text, last emission is final
              }
            });

            emitter.on("end", (result) => {
              clearTimeout(timeout);
              const finalText = result?.output || result?.text || fullOutput || "Done.";
              resolve({
                content: finalText.slice(0, 4000), // WhatsApp message limit
                type: MESSAGE_TYPE.AI,
                metadata: { model: "claude-code-cli" }
              });
            });

            emitter.on("error", (err) => {
              clearTimeout(timeout);
              console.error("[MessagingGateway] CLI error:", err.error || err.message || err);
              // Fall back to aiBrain if CLI fails
              resolve(fallbackToAiBrain(message, aiBrain));
            });
          };

          // runClaudeCodeStreaming may return a Promise<EventEmitter> or EventEmitter
          if (stream && typeof stream.then === "function") {
            stream.then(attachListeners).catch((err) => {
              clearTimeout(timeout);
              console.error("[MessagingGateway] CLI spawn error:", err.message);
              resolve(fallbackToAiBrain(message, aiBrain));
            });
          } else if (stream && typeof stream.on === "function") {
            attachListeners(stream);
          } else {
            clearTimeout(timeout);
            resolve(fallbackToAiBrain(message, aiBrain));
          }
        });
      }

      // Fallback: Claude Code CLI not available, use aiBrain directly
      console.log("[MessagingGateway] Claude Code CLI not ready, falling back to aiBrain");
      return await fallbackToAiBrain(message, aiBrain);

    } catch (error) {
      console.error("[MessagingGateway] AI processing error:", error.message);
      return {
        content: "I received your message but ran into an issue processing it. Let me try again in a moment.",
        type: MESSAGE_TYPE.SYSTEM,
        error: error.message
      };
    }
  };

  // Fallback handler when Claude Code CLI is not available
  async function fallbackToAiBrain(message, brain) {
    try {
      const response = await brain.chat(message.content, {
        context: { channel: message.channel, from: message.from }
      });
      return {
        content: response.text || response.content || "I processed your message.",
        type: MESSAGE_TYPE.AI,
        metadata: { model: response.model, fallback: true }
      };
    } catch (err) {
      return {
        content: "Sorry, I encountered an error processing your message.",
        type: MESSAGE_TYPE.SYSTEM,
        error: err.message
      };
    }
  }

  await gateway.initialize(userId, messageHandler);

  return gateway;
};

export default MessagingGateway;
