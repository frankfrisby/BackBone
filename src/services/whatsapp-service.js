/**
 * WhatsApp Business API Integration
 *
 * Enables two-way WhatsApp messaging between users and their AI.
 * Uses Meta's WhatsApp Business Platform (Cloud API).
 *
 * Architecture:
 * 1. User sends WhatsApp message → Meta webhook → Firebase Function
 * 2. Firebase Function writes to Firestore /users/{userId}/messages
 * 3. Local BACKBONE picks up message (via realtime-messaging.js)
 * 4. AI processes and responds to Firestore
 * 5. Firebase Function reads response → sends via WhatsApp API
 *
 * Requirements:
 * - Meta Business account (business.facebook.com)
 * - WhatsApp Business API access
 * - Phone number registered with WhatsApp Business
 * - Webhook URL (Firebase Functions)
 *
 * Setup Steps:
 * 1. Create Meta Business account
 * 2. Create WhatsApp Business App in Meta for Developers
 * 3. Add phone number and get access token
 * 4. Configure webhook to Firebase Function
 * 5. Set WHATSAPP_* environment variables
 */

import fs from "fs";
import path from "path";
import https from "https";
import { EventEmitter } from "events";

const DATA_DIR = path.join(process.cwd(), "data");
const WHATSAPP_CONFIG_PATH = path.join(DATA_DIR, "whatsapp-config.json");

// WhatsApp Cloud API base URL
const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";

/**
 * Message types for WhatsApp
 */
export const WHATSAPP_MESSAGE_TYPE = {
  TEXT: "text",
  TEMPLATE: "template",
  IMAGE: "image",
  DOCUMENT: "document",
  INTERACTIVE: "interactive"
};

/**
 * Template categories (for proactive messages)
 */
export const TEMPLATE_CATEGORY = {
  UTILITY: "utility",         // Account updates, order notifications
  MARKETING: "marketing",     // Promotional messages
  AUTHENTICATION: "authentication" // OTP codes
};

/**
 * WhatsApp Service Class
 */
export class WhatsAppService extends EventEmitter {
  constructor() {
    super();
    this.config = this.loadConfig();
    this.initialized = false;
  }

  /**
   * Load configuration
   */
  loadConfig() {
    try {
      if (fs.existsSync(WHATSAPP_CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(WHATSAPP_CONFIG_PATH, "utf-8"));
      }
    } catch (err) {
      console.error("[WhatsApp] Failed to load config:", err.message);
    }

    return {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || null,
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
      webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "backbone_verify",
      enabled: false,
      registeredUsers: {} // phone -> userId mapping
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
      fs.writeFileSync(WHATSAPP_CONFIG_PATH, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error("[WhatsApp] Failed to save config:", err.message);
    }
  }

  /**
   * Initialize the service
   */
  async initialize(config = {}) {
    // Merge config
    if (config.phoneNumberId) this.config.phoneNumberId = config.phoneNumberId;
    if (config.accessToken) this.config.accessToken = config.accessToken;
    if (config.businessAccountId) this.config.businessAccountId = config.businessAccountId;

    // Check required credentials
    if (!this.config.phoneNumberId || !this.config.accessToken) {
      return {
        success: false,
        error: "WhatsApp credentials not configured",
        setupInstructions: this.getSetupInstructions()
      };
    }

    // Verify credentials by fetching phone number info
    const verifyResult = await this.verifyCredentials();
    if (!verifyResult.success) {
      return verifyResult;
    }

    this.config.enabled = true;
    this.initialized = true;
    this.saveConfig();

    this.emit("initialized");
    return { success: true, phoneNumber: verifyResult.phoneNumber };
  }

  /**
   * Verify WhatsApp credentials
   */
  async verifyCredentials() {
    try {
      const url = `${WHATSAPP_API_URL}/${this.config.phoneNumberId}?access_token=${this.config.accessToken}`;
      const response = await fetch(url);

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || "Invalid credentials"
        };
      }

      const data = await response.json();
      return {
        success: true,
        phoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
        qualityRating: data.quality_rating
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Register a user's phone number
   * Links WhatsApp phone to BACKBONE user ID
   */
  registerUser(phoneNumber, userId) {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    if (!normalized) {
      return { success: false, error: "Invalid phone number" };
    }

    this.config.registeredUsers[normalized] = userId;
    this.saveConfig();

    this.emit("user-registered", { phoneNumber: normalized, userId });
    return { success: true, phoneNumber: normalized };
  }

  /**
   * Get user ID for a phone number
   */
  getUserIdForPhone(phoneNumber) {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    return this.config.registeredUsers[normalized] || null;
  }

  /**
   * Normalize phone number
   */
  normalizePhoneNumber(phone) {
    if (!phone) return null;
    // Remove all non-digits except leading +
    let normalized = phone.replace(/[^\d+]/g, "");
    // Remove leading + for storage
    if (normalized.startsWith("+")) {
      normalized = normalized.substring(1);
    }
    // Must be at least 10 digits
    if (normalized.length < 10) return null;
    return normalized;
  }

  /**
   * Send a text message
   */
  async sendTextMessage(to, message) {
    if (!this.initialized) {
      return { success: false, error: "WhatsApp not initialized" };
    }

    const phoneNumber = this.normalizePhoneNumber(to);
    if (!phoneNumber) {
      return { success: false, error: "Invalid phone number" };
    }

    try {
      const url = `${WHATSAPP_API_URL}/${this.config.phoneNumberId}/messages`;

      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneNumber,
        type: "text",
        text: {
          preview_url: false,
          body: message
        }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error?.message || "Failed to send message"
        };
      }

      this.emit("message-sent", { to: phoneNumber, messageId: data.messages?.[0]?.id });

      return {
        success: true,
        messageId: data.messages?.[0]?.id
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a template message (for proactive messaging)
   * Required when messaging users outside 24-hour window
   */
  async sendTemplateMessage(to, templateName, language = "en", components = []) {
    if (!this.initialized) {
      return { success: false, error: "WhatsApp not initialized" };
    }

    const phoneNumber = this.normalizePhoneNumber(to);
    if (!phoneNumber) {
      return { success: false, error: "Invalid phone number" };
    }

    try {
      const url = `${WHATSAPP_API_URL}/${this.config.phoneNumberId}/messages`;

      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneNumber,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components
        }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error?.message || "Failed to send template"
        };
      }

      return {
        success: true,
        messageId: data.messages?.[0]?.id
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send an interactive message with buttons
   */
  async sendInteractiveMessage(to, body, buttons) {
    if (!this.initialized) {
      return { success: false, error: "WhatsApp not initialized" };
    }

    const phoneNumber = this.normalizePhoneNumber(to);
    if (!phoneNumber) {
      return { success: false, error: "Invalid phone number" };
    }

    try {
      const url = `${WHATSAPP_API_URL}/${this.config.phoneNumberId}/messages`;

      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneNumber,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: body },
          action: {
            buttons: buttons.slice(0, 3).map((btn, i) => ({
              type: "reply",
              reply: {
                id: btn.id || `btn_${i}`,
                title: btn.title.substring(0, 20) // Max 20 chars
              }
            }))
          }
        }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error?.message || "Failed to send interactive message"
        };
      }

      return {
        success: true,
        messageId: data.messages?.[0]?.id
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Mark a message as read
   */
  async markAsRead(messageId) {
    if (!this.initialized) return;

    try {
      const url = `${WHATSAPP_API_URL}/${this.config.phoneNumberId}/messages`;

      await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId
        })
      });
    } catch (error) {
      // Non-critical
    }
  }

  /**
   * Handle incoming webhook from WhatsApp
   * This would be called by a Firebase Function
   */
  handleWebhook(body) {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) return null;

    // Handle incoming messages
    if (value.messages?.[0]) {
      const message = value.messages[0];
      const from = message.from;
      const messageId = message.id;
      const timestamp = message.timestamp;

      let content = null;
      let type = "text";

      if (message.text) {
        content = message.text.body;
        type = "text";
      } else if (message.button) {
        content = message.button.text;
        type = "button_reply";
      } else if (message.interactive) {
        content = message.interactive.button_reply?.title ||
                  message.interactive.list_reply?.title;
        type = "interactive_reply";
      }

      const userId = this.getUserIdForPhone(from);

      this.emit("message-received", {
        from,
        userId,
        messageId,
        content,
        type,
        timestamp,
        raw: message
      });

      return {
        type: "message",
        from,
        userId,
        messageId,
        content,
        messageType: type
      };
    }

    // Handle status updates
    if (value.statuses?.[0]) {
      const status = value.statuses[0];
      this.emit("status-update", status);

      return {
        type: "status",
        messageId: status.id,
        status: status.status,
        recipientId: status.recipient_id
      };
    }

    return null;
  }

  /**
   * Verify webhook (for Meta verification)
   */
  verifyWebhook(mode, token, challenge) {
    if (mode === "subscribe" && token === this.config.webhookVerifyToken) {
      return { verified: true, challenge };
    }
    return { verified: false };
  }

  /**
   * Get setup instructions
   */
  getSetupInstructions() {
    return `
WhatsApp Business API Setup
============================

1. CREATE META BUSINESS ACCOUNT
   - Go to business.facebook.com
   - Create or use existing business account

2. CREATE WHATSAPP BUSINESS APP
   - Go to developers.facebook.com
   - Create new app → select "Business" type
   - Add "WhatsApp" product

3. GET CREDENTIALS
   - In WhatsApp settings, get:
     * Phone Number ID
     * Access Token (generate permanent token)
     * Business Account ID

4. CONFIGURE WEBHOOK (for receiving messages)
   - Deploy Firebase Function (see firebase-functions/whatsapp-webhook.js)
   - In Meta Developer Console → WhatsApp → Configuration:
     * Webhook URL: https://us-central1-backboneai.cloudfunctions.net/whatsappWebhook
     * Verify Token: backbone_verify
     * Subscribe to: messages

5. SET ENVIRONMENT VARIABLES
   Add to your .env file:
   WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
   WHATSAPP_ACCESS_TOKEN=your_access_token
   WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id

6. CREATE MESSAGE TEMPLATES
   In Meta Business Suite → WhatsApp Manager → Message Templates
   Required templates for proactive messaging:
   - backbone_alert: For urgent notifications
   - backbone_reminder: For scheduled reminders
   - backbone_update: For status updates

Cost: ~$0.005-0.08 per conversation (24-hour window)
`;
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      enabled: this.config.enabled,
      phoneNumberId: this.config.phoneNumberId ? "configured" : "not set",
      registeredUsers: Object.keys(this.config.registeredUsers).length,
      hasAccessToken: !!this.config.accessToken
    };
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      configured: this.initialized,
      status: this.initialized ? "Active" : "Not configured",
      registeredUsers: Object.keys(this.config.registeredUsers).length,
      setupRequired: !this.initialized ? this.getSetupInstructions() : null,
      queuedMessages: this.messageQueue?.length || 0,
      scheduledMessages: this.scheduledMessages?.length || 0
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE QUEUE & SCHEDULING PIPELINE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize message queue system
   */
  initializeQueue() {
    if (!this.messageQueue) {
      this.messageQueue = [];          // Queued outgoing messages
      this.scheduledMessages = [];     // Time-scheduled messages
      this.conversationContext = {};   // Per-user conversation context for follow-ups
      this.processingQueue = false;

      // Start queue processor
      this.startQueueProcessor();

      // Start scheduled message checker
      this.startScheduledChecker();
    }
  }

  /**
   * Add message to queue
   * @param {string} to - Phone number
   * @param {string} message - Message text
   * @param {Object} options - Queue options
   * @returns {string} Queue ID
   */
  queueMessage(to, message, options = {}) {
    this.initializeQueue();

    const queueItem = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      to: this.normalizePhoneNumber(to),
      message,
      priority: options.priority || "normal", // high, normal, low
      context: options.context || null,        // Context for follow-up questions
      retries: 0,
      maxRetries: options.maxRetries || 3,
      createdAt: new Date().toISOString(),
      status: "queued"
    };

    // Insert based on priority
    if (queueItem.priority === "high") {
      this.messageQueue.unshift(queueItem);
    } else {
      this.messageQueue.push(queueItem);
    }

    this.emit("message-queued", queueItem);
    return queueItem.id;
  }

  /**
   * Schedule a message for future delivery
   * @param {string} to - Phone number
   * @param {string} message - Message text
   * @param {Date|string} sendAt - When to send
   * @param {Object} options - Schedule options
   * @returns {string} Schedule ID
   */
  scheduleMessage(to, message, sendAt, options = {}) {
    this.initializeQueue();

    const scheduleTime = new Date(sendAt);
    if (isNaN(scheduleTime.getTime())) {
      throw new Error("Invalid schedule time");
    }

    const scheduledItem = {
      id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      to: this.normalizePhoneNumber(to),
      message,
      sendAt: scheduleTime.toISOString(),
      context: options.context || null,
      topic: options.topic || null,          // For grouping related scheduled messages
      followUpContext: options.followUpContext || null, // AI context for handling replies
      status: "scheduled",
      createdAt: new Date().toISOString()
    };

    this.scheduledMessages.push(scheduledItem);
    this.saveScheduledMessages();

    this.emit("message-scheduled", scheduledItem);
    return scheduledItem.id;
  }

  /**
   * Cancel a scheduled message
   */
  cancelScheduledMessage(scheduleId) {
    const index = this.scheduledMessages.findIndex(m => m.id === scheduleId);
    if (index === -1) {
      return { success: false, error: "Scheduled message not found" };
    }

    const cancelled = this.scheduledMessages.splice(index, 1)[0];
    this.saveScheduledMessages();

    this.emit("message-cancelled", cancelled);
    return { success: true, message: cancelled };
  }

  /**
   * Get all scheduled messages
   */
  getScheduledMessages() {
    return [...(this.scheduledMessages || [])];
  }

  /**
   * Get queued messages
   */
  getQueuedMessages() {
    return [...(this.messageQueue || [])];
  }

  /**
   * Start the queue processor
   */
  startQueueProcessor() {
    if (this.queueInterval) return;

    this.queueInterval = setInterval(async () => {
      await this.processQueue();
    }, 1000); // Check every second
  }

  /**
   * Process message queue
   */
  async processQueue() {
    if (this.processingQueue || !this.messageQueue?.length) return;

    this.processingQueue = true;

    try {
      const item = this.messageQueue[0];
      if (!item) {
        this.processingQueue = false;
        return;
      }

      // Attempt to send
      item.status = "sending";
      const result = await this.sendTextMessage(item.to, item.message);

      if (result.success) {
        // Remove from queue
        this.messageQueue.shift();
        item.status = "sent";
        item.sentAt = new Date().toISOString();
        item.messageId = result.messageId;

        this.emit("message-sent", item);

      } else {
        // Handle failure
        item.retries++;
        item.lastError = result.error;

        if (item.retries >= item.maxRetries) {
          // Remove from queue after max retries
          this.messageQueue.shift();
          item.status = "failed";
          this.emit("message-failed", item);
        } else {
          // Move to end of queue for retry
          this.messageQueue.shift();
          this.messageQueue.push(item);
        }
      }
    } catch (error) {
      console.error("[WhatsApp] Queue processing error:", error.message);
    }

    this.processingQueue = false;
  }

  /**
   * Start scheduled message checker
   */
  startScheduledChecker() {
    if (this.scheduledInterval) return;

    this.scheduledInterval = setInterval(() => {
      this.checkScheduledMessages();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Check and process due scheduled messages
   */
  checkScheduledMessages() {
    if (!this.scheduledMessages?.length) return;

    const now = new Date();
    const dueMessages = [];
    const remaining = [];

    for (const msg of this.scheduledMessages) {
      const sendAt = new Date(msg.sendAt);
      if (sendAt <= now) {
        dueMessages.push(msg);
      } else {
        remaining.push(msg);
      }
    }

    this.scheduledMessages = remaining;

    // Queue due messages
    for (const msg of dueMessages) {
      this.queueMessage(msg.to, msg.message, {
        priority: "normal",
        context: msg.context
      });

      // Store follow-up context if provided
      if (msg.followUpContext) {
        this.setConversationContext(msg.to, msg.followUpContext);
      }

      this.emit("scheduled-triggered", msg);
    }

    if (dueMessages.length > 0) {
      this.saveScheduledMessages();
    }
  }

  /**
   * Set conversation context for a user (for follow-up questions)
   */
  setConversationContext(phoneNumber, context) {
    if (!this.conversationContext) this.conversationContext = {};
    const normalized = this.normalizePhoneNumber(phoneNumber);

    this.conversationContext[normalized] = {
      ...context,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Get conversation context for a user
   */
  getConversationContext(phoneNumber) {
    if (!this.conversationContext) return null;
    const normalized = this.normalizePhoneNumber(phoneNumber);
    return this.conversationContext[normalized] || null;
  }

  /**
   * Clear conversation context for a user
   */
  clearConversationContext(phoneNumber) {
    if (!this.conversationContext) return;
    const normalized = this.normalizePhoneNumber(phoneNumber);
    delete this.conversationContext[normalized];
  }

  /**
   * Save scheduled messages to disk
   */
  saveScheduledMessages() {
    try {
      const scheduledPath = path.join(DATA_DIR, "whatsapp-scheduled.json");
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(scheduledPath, JSON.stringify(this.scheduledMessages || [], null, 2));
    } catch (err) {
      console.error("[WhatsApp] Failed to save scheduled messages:", err.message);
    }
  }

  /**
   * Load scheduled messages from disk
   */
  loadScheduledMessages() {
    try {
      const scheduledPath = path.join(DATA_DIR, "whatsapp-scheduled.json");
      if (fs.existsSync(scheduledPath)) {
        this.scheduledMessages = JSON.parse(fs.readFileSync(scheduledPath, "utf-8"));
        return this.scheduledMessages;
      }
    } catch (err) {
      console.error("[WhatsApp] Failed to load scheduled messages:", err.message);
    }
    this.scheduledMessages = [];
    return [];
  }

  /**
   * Stop queue processors
   */
  stopProcessors() {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }
    if (this.scheduledInterval) {
      clearInterval(this.scheduledInterval);
      this.scheduledInterval = null;
    }
  }
}

// Singleton instance
let instance = null;

export const getWhatsAppService = () => {
  if (!instance) {
    instance = new WhatsAppService();
  }
  return instance;
};

export default WhatsAppService;
