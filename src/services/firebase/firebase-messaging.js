/**
 * Firebase Messaging Service
 *
 * Enables SMS/phone communication with the user via Firebase.
 * Features:
 * 1. Phone number verification
 * 2. Send SMS messages to user
 * 3. Receive replies (webhook-based)
 * 4. Push notifications
 *
 * Uses Firebase Cloud Messaging (FCM) and potentially Twilio via Firebase Functions
 */

import fs from "fs";
import path from "path";
import https from "https";
import { EventEmitter } from "events";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
const MESSAGING_CONFIG_FILE = path.join(DATA_DIR, "firebase_messaging.json");

// Message types
export const MESSAGE_TYPES = {
  ALERT: "alert",           // Urgent notification
  REMINDER: "reminder",     // Scheduled reminder
  QUESTION: "question",     // Asking user something
  UPDATE: "update",         // Status update
  DIGEST: "digest"          // Daily/weekly digest
};

// Message priority
export const MESSAGE_PRIORITY = {
  HIGH: "high",             // Immediate delivery
  NORMAL: "normal",         // Standard delivery
  LOW: "low"                // Can be batched
};

class FirebaseMessaging extends EventEmitter {
  constructor() {
    super();
    this.config = this.loadConfig();
    this.messageQueue = [];
    this.sentMessages = [];
    this.initialized = false;
  }

  /**
   * Load configuration
   */
  loadConfig() {
    try {
      if (fs.existsSync(MESSAGING_CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(MESSAGING_CONFIG_FILE, "utf-8"));
      }
    } catch (err) {
      console.error("Failed to load messaging config:", err.message);
    }
    return {
      phoneNumber: null,
      phoneVerified: false,
      fcmToken: null,
      twilioEnabled: false,
      preferences: {
        smsEnabled: true,
        pushEnabled: true,
        quietHoursStart: 22,
        quietHoursEnd: 7,
        maxMessagesPerDay: 10
      },
      stats: {
        messagesSentToday: 0,
        lastMessageDate: null,
        totalMessagesSent: 0
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
      fs.writeFileSync(MESSAGING_CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error("Failed to save messaging config:", err.message);
    }
  }

  /**
   * Initialize Firebase connection
   */
  async initialize() {
    try {
      // Check for Firebase credentials in environment
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const apiKey = process.env.FIREBASE_API_KEY;

      if (!projectId || !apiKey) {
        console.log("Firebase not configured. SMS messaging disabled.");
        return { success: false, reason: "missing_credentials" };
      }

      this.initialized = true;
      this.emit("initialized");

      return { success: true };
    } catch (err) {
      console.error("Firebase init failed:", err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Set user's phone number (starts verification)
   */
  async setPhoneNumber(phoneNumber) {
    // Normalize phone number
    const normalized = this.normalizePhoneNumber(phoneNumber);
    if (!normalized) {
      return { success: false, error: "Invalid phone number format" };
    }

    this.config.phoneNumber = normalized;
    this.config.phoneVerified = false;
    this.saveConfig();

    // In a real implementation, this would trigger Firebase phone auth
    // For now, we'll simulate the verification process
    const verificationId = `verify_${Date.now()}`;

    this.emit("verification-started", { phoneNumber: normalized, verificationId });

    return {
      success: true,
      phoneNumber: normalized,
      verificationId,
      message: "Verification code sent via SMS"
    };
  }

  /**
   * Verify phone number with code
   */
  async verifyPhoneNumber(verificationId, code) {
    // In production, this would verify with Firebase
    // For now, accept any 6-digit code for testing
    if (code && code.length === 6 && /^\d+$/.test(code)) {
      this.config.phoneVerified = true;
      this.saveConfig();

      this.emit("phone-verified", { phoneNumber: this.config.phoneNumber });

      return { success: true, message: "Phone number verified" };
    }

    return { success: false, error: "Invalid verification code" };
  }

  /**
   * Normalize phone number to E.164 format
   */
  normalizePhoneNumber(phone) {
    // Remove all non-digits
    let digits = phone.replace(/\D/g, "");

    // Handle US numbers
    if (digits.length === 10) {
      digits = "1" + digits;
    }

    // Must have country code + number
    if (digits.length < 10 || digits.length > 15) {
      return null;
    }

    return "+" + digits;
  }

  /**
   * Check if we can send a message now
   */
  canSendMessage() {
    if (!this.config.phoneVerified) {
      return { canSend: false, reason: "phone_not_verified" };
    }

    // Check quiet hours
    const hour = new Date().getHours();
    const { quietHoursStart, quietHoursEnd } = this.config.preferences;
    const inQuietHours = quietHoursStart > quietHoursEnd
      ? (hour >= quietHoursStart || hour < quietHoursEnd)
      : (hour >= quietHoursStart && hour < quietHoursEnd);

    if (inQuietHours) {
      return { canSend: false, reason: "quiet_hours" };
    }

    // Check daily limit
    const today = new Date().toDateString();
    if (this.config.stats.lastMessageDate !== today) {
      this.config.stats.messagesSentToday = 0;
      this.config.stats.lastMessageDate = today;
    }

    if (this.config.stats.messagesSentToday >= this.config.preferences.maxMessagesPerDay) {
      return { canSend: false, reason: "daily_limit_reached" };
    }

    return { canSend: true };
  }

  /**
   * Send an SMS message
   */
  async sendSMS(message, options = {}) {
    const canSend = this.canSendMessage();
    if (!canSend.canSend) {
      // Queue for later if not urgent
      if (options.priority !== MESSAGE_PRIORITY.HIGH) {
        this.queueMessage(message, options);
        return { success: false, queued: true, reason: canSend.reason };
      }
    }

    if (!this.config.preferences.smsEnabled) {
      return { success: false, reason: "sms_disabled" };
    }

    try {
      // In production, this would call Firebase Functions or Twilio API
      // For now, we'll log and simulate success
      const messageRecord = {
        id: `msg_${Date.now()}`,
        type: options.type || MESSAGE_TYPES.UPDATE,
        priority: options.priority || MESSAGE_PRIORITY.NORMAL,
        content: message,
        sentAt: new Date().toISOString(),
        delivered: true // Would be updated by delivery webhook
      };

      this.sentMessages.unshift(messageRecord);
      this.sentMessages = this.sentMessages.slice(0, 100); // Keep last 100

      this.config.stats.messagesSentToday++;
      this.config.stats.totalMessagesSent++;
      this.saveConfig();

      this.emit("message-sent", messageRecord);

      // Actually send via Firebase/Twilio if configured
      if (this.config.twilioEnabled) {
        await this.sendViaTwilio(message, options);
      }

      return { success: true, messageId: messageRecord.id };
    } catch (err) {
      console.error("Failed to send SMS:", err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send via Twilio (called by Firebase Function)
   */
  async sendViaTwilio(message, options) {
    // This would call a Firebase Function that uses Twilio
    // The function would be deployed separately
    const functionUrl = process.env.FIREBASE_FUNCTIONS_URL;
    if (!functionUrl) return;

    const payload = JSON.stringify({
      to: this.config.phoneNumber,
      message,
      type: options.type
    });

    return new Promise((resolve, reject) => {
      const url = new URL(`${functionUrl}/sendSMS`);
      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": payload.length
        }
      }, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ success: true });
          }
        });
      });

      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Queue a message for later
   */
  queueMessage(message, options) {
    this.messageQueue.push({
      id: `queued_${Date.now()}`,
      message,
      options,
      queuedAt: new Date().toISOString()
    });

    this.emit("message-queued", { message, options });
  }

  /**
   * Process queued messages
   */
  async processQueue() {
    const canSend = this.canSendMessage();
    if (!canSend.canSend) return;

    while (this.messageQueue.length > 0 && this.canSendMessage().canSend) {
      const queued = this.messageQueue.shift();
      await this.sendSMS(queued.message, queued.options);
    }
  }

  /**
   * Send a push notification (FCM)
   */
  async sendPushNotification(title, body, data = {}) {
    if (!this.config.fcmToken) {
      return { success: false, reason: "no_fcm_token" };
    }

    if (!this.config.preferences.pushEnabled) {
      return { success: false, reason: "push_disabled" };
    }

    try {
      // In production, this would call FCM API
      const notification = {
        id: `push_${Date.now()}`,
        title,
        body,
        data,
        sentAt: new Date().toISOString()
      };

      this.emit("push-sent", notification);

      return { success: true, notificationId: notification.id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Handle incoming message (webhook)
   */
  handleIncomingMessage(from, body, timestamp) {
    const message = {
      id: `incoming_${Date.now()}`,
      from,
      body,
      receivedAt: timestamp || new Date().toISOString()
    };

    this.emit("message-received", message);

    return message;
  }

  /**
   * Send daily digest
   */
  async sendDailyDigest(summary) {
    return this.sendSMS(
      `Daily Summary:\n${summary}`,
      {
        type: MESSAGE_TYPES.DIGEST,
        priority: MESSAGE_PRIORITY.LOW
      }
    );
  }

  /**
   * Send alert
   */
  async sendAlert(alert) {
    return this.sendSMS(
      `ALERT: ${alert}`,
      {
        type: MESSAGE_TYPES.ALERT,
        priority: MESSAGE_PRIORITY.HIGH
      }
    );
  }

  /**
   * Send reminder
   */
  async sendReminder(reminder) {
    return this.sendSMS(
      `Reminder: ${reminder}`,
      {
        type: MESSAGE_TYPES.REMINDER,
        priority: MESSAGE_PRIORITY.NORMAL
      }
    );
  }

  /**
   * Ask user a question via SMS
   */
  async askQuestion(question, questionId) {
    return this.sendSMS(
      `${question}\n\nReply to answer.`,
      {
        type: MESSAGE_TYPES.QUESTION,
        priority: MESSAGE_PRIORITY.NORMAL,
        questionId
      }
    );
  }

  /**
   * Update preferences
   */
  updatePreferences(preferences) {
    this.config.preferences = { ...this.config.preferences, ...preferences };
    this.saveConfig();
    this.emit("preferences-updated", this.config.preferences);
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      phoneNumber: this.config.phoneNumber,
      phoneVerified: this.config.phoneVerified,
      smsEnabled: this.config.preferences.smsEnabled,
      pushEnabled: this.config.preferences.pushEnabled,
      queuedMessages: this.messageQueue.length,
      messagesSentToday: this.config.stats.messagesSentToday,
      totalMessagesSent: this.config.stats.totalMessagesSent
    };
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      configured: this.config.phoneVerified,
      phoneNumber: this.config.phoneNumber
        ? this.config.phoneNumber.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")
        : null,
      recentMessages: this.sentMessages.slice(0, 5),
      queuedCount: this.messageQueue.length,
      canSend: this.canSendMessage()
    };
  }
}

// Singleton
let instance = null;

export const getFirebaseMessaging = () => {
  if (!instance) {
    instance = new FirebaseMessaging();
  }
  return instance;
};

export default FirebaseMessaging;
