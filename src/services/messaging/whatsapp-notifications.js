/**
 * WhatsApp Notifications Service
 *
 * Sends proactive notifications to the user's WhatsApp for key events:
 * - Outcomes completed (sent only once)
 * - Trades executed
 * - Money transactions
 * - People interactions
 * - System connections/logins
 * - Daily morning briefs
 * - Breakthroughs and achievements
 *
 * Integrates with:
 * - Twilio WhatsApp for message delivery
 * - Unified Message Log for tracking
 * - Phone Auth for verified phone number
 */

import { EventEmitter } from "events";
import { getTwilioWhatsApp } from "./twilio-whatsapp.js";
import { getUnifiedMessageLog, MESSAGE_CHANNEL } from "./unified-message-log.js";
import { getVerifiedPhone } from "../firebase/phone-auth.js";
import { showNotificationTitle, restoreBaseTitle } from "../ui/terminal-resize.js";
import { sendPush, sendMorningBriefPush, sendTradeAlertPush, getPushStatus, PUSH_TYPE } from "./push-notifications.js";
import { formatTradeNotification, formatBriefForWhatsApp } from "./whatsapp-formatter.js";
import { shouldSendMessage, recordSentMessage } from "./message-dedup-guard.js";

/**
 * Notification types
 */
export const NOTIFICATION_TYPE = {
  OUTCOME: "outcome",           // AI completed an outcome/task
  TRADE: "trade",               // Stock/crypto trade executed
  MONEY: "money",               // Financial transaction
  PEOPLE: "people",             // Interaction with someone
  SYSTEM: "system",             // System login/connection
  MORNING_BRIEF: "morning_brief", // Daily morning briefing
  EVENING_BRIEF: "evening_brief", // Daily evening briefing
  BREAKTHROUGH: "breakthrough", // Achievement/milestone
  REMINDER: "reminder",         // General reminder
  ALERT: "alert"                // Important alert
};

/**
 * Notification priority
 */
export const NOTIFICATION_PRIORITY = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  URGENT: 4
};

/**
 * WhatsApp Notifications Service
 */
class WhatsAppNotifications extends EventEmitter {
  constructor() {
    super();
    this.userId = null;
    this.phoneNumber = null;
    this.enabled = false;
    this.sentNotifications = new Set(); // Track sent notifications to avoid duplicates
    this.quietHoursStart = 22; // 10 PM
    this.quietHoursEnd = 7;    // 7 AM
    this.respectQuietHours = true;
    this.lastMorningBrief = null;
    this.lastEveningBrief = null;
  }

  /**
   * Initialize with user ID
   */
  async initialize(userId) {
    this.userId = userId;

    // First try local phone verification
    let phone = getVerifiedPhone(userId);

    // Try user-settings.json (most reliable — same path as working MCP server)
    if (!phone) {
      try {
        const { loadUserSettings } = await import("../user-settings.js");
        const settings = loadUserSettings();
        phone = settings?.phoneNumber || settings?.phone || null;
        if (phone) console.log(`[WhatsAppNotifications] Got phone from user-settings`);
      } catch {}
    }

    // Try Firestore (set by WhatsApp webhook)
    if (!phone) {
      try {
        const { getRealtimeMessaging } = await import("./realtime-messaging.js");
        const messaging = getRealtimeMessaging();
        if (messaging.userId === userId || !messaging.userId) {
          if (!messaging.userId) await messaging.initialize(userId);
          const userDoc = await messaging.getUserDocument();
          if (userDoc?.whatsappPhone) {
            phone = userDoc.whatsappPhone;
            console.log(`[WhatsAppNotifications] Got phone from Firestore: ${phone}`);
          }
        }
      } catch (err) {
        console.log(`[WhatsAppNotifications] Could not fetch phone from Firestore: ${err.message}`);
      }
    }

    if (phone) {
      this.phoneNumber = phone;
      this.enabled = true;
      console.log(`[WhatsAppNotifications] Initialized for ${phone}`);
    } else {
      console.log("[WhatsAppNotifications] No verified phone - notifications disabled");
      this.enabled = false;
    }

    return { success: true, enabled: this.enabled, phone: this.phoneNumber };
  }

  /**
   * Check if we're in quiet hours
   */
  isQuietHours() {
    if (!this.respectQuietHours) return false;

    const hour = new Date().getHours();
    if (this.quietHoursStart > this.quietHoursEnd) {
      // Quiet hours span midnight (e.g., 22:00 - 07:00)
      return hour >= this.quietHoursStart || hour < this.quietHoursEnd;
    } else {
      return hour >= this.quietHoursStart && hour < this.quietHoursEnd;
    }
  }

  /**
   * Generate a unique notification key to prevent duplicates
   */
  getNotificationKey(type, identifier) {
    const date = new Date().toISOString().split("T")[0]; // Today's date
    return `${type}_${identifier}_${date}`;
  }

  /**
   * Check if a notification has already been sent
   */
  hasBeenSent(type, identifier) {
    const key = this.getNotificationKey(type, identifier);
    return this.sentNotifications.has(key);
  }

  /**
   * Mark notification as sent
   */
  markAsSent(type, identifier) {
    const key = this.getNotificationKey(type, identifier);
    this.sentNotifications.add(key);

    // Clean up old notifications (keep last 1000)
    if (this.sentNotifications.size > 1000) {
      const arr = Array.from(this.sentNotifications);
      this.sentNotifications = new Set(arr.slice(-500));
    }
  }

  /**
   * Send a WhatsApp notification
   * @param {string} type - Notification type
   * @param {string} message - Message content
   * @param {Object} options - Additional options
   */
  async send(type, message, options = {}) {
    if (!this.enabled || !this.phoneNumber) {
      return { success: false, error: "Notifications not enabled" };
    }

    // Check for duplicates (identifier-based)
    const identifier = options.identifier || message.substring(0, 50);
    if (!options.allowDuplicate && this.hasBeenSent(type, identifier)) {
      return { success: false, error: "Already sent", duplicate: true };
    }

    // Smart content dedup — checks message similarity against recent history
    // Skips for replies to user and forced sends
    if (!options.isReply && !options.allowDuplicate) {
      const guardCheck = shouldSendMessage(message, {
        type,
        isReply: options.isReply || false,
        isFollowUp: options.isFollowUp || false,
        force: options.force || false,
      });
      if (!guardCheck.allowed) {
        console.log(`[WhatsAppNotifications] Blocked by dedup guard: ${guardCheck.reason}`);
        return { success: false, error: guardCheck.reason, blocked: true };
      }
    }

    // Check quiet hours (unless urgent)
    if (this.isQuietHours() && options.priority !== NOTIFICATION_PRIORITY.URGENT) {
      return { success: false, error: "Quiet hours", quietHours: true };
    }

    // Format the message with type emoji — skip for briefs (they have their own formatting)
    const skipEmoji = type === NOTIFICATION_TYPE.MORNING_BRIEF || type === NOTIFICATION_TYPE.EVENING_BRIEF;
    const formattedMessage = skipEmoji ? message : `${this.getTypeEmoji(type)} ${message}`;

    try {
      const whatsapp = getTwilioWhatsApp();
      if (!whatsapp.initialized) {
        const initResult = await whatsapp.initialize();
        if (!initResult.success) {
          return { success: false, error: "WhatsApp not configured" };
        }
      }

      const result = await whatsapp.sendMessage(this.phoneNumber, formattedMessage);

      if (result.success) {
        // Mark as sent to prevent duplicates
        this.markAsSent(type, identifier);

        // Record in smart dedup guard (content-based tracking)
        try { recordSentMessage(message, { type }); } catch {}

        // Log to unified message log
        const messageLog = getUnifiedMessageLog();
        messageLog.addMessage("assistant", message, {
          channel: MESSAGE_CHANNEL.PROACTIVE,
          metadata: { type, notificationType: type, ...options.metadata }
        });

        // Show in terminal title briefly
        showNotificationTitle(type, message.substring(0, 30), 5000);

        this.emit("notification-sent", { type, message, messageId: result.messageId });
      }

      // Also send via push notification
      try {
        await sendPush(null, {
          title: "BACKBONE",
          body: message.substring(0, 200),
          type: options.pushType || PUSH_TYPE.SYSTEM_ALERT
        });
      } catch (pushErr) {
        // Push is best-effort, don't fail the whole notification
      }

      return result;

    } catch (error) {
      console.error("[WhatsAppNotifications] Send error:", error.message);

      // Fallback: try push even if WhatsApp failed
      try {
        await sendPush(null, {
          title: "BACKBONE",
          body: message.substring(0, 200),
          type: options.pushType || PUSH_TYPE.SYSTEM_ALERT
        });
      } catch (pushErr) {
        // Best-effort
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Get emoji for notification type
   */
  getTypeEmoji(type) {
    const emojis = {
      [NOTIFICATION_TYPE.OUTCOME]: "✅",
      [NOTIFICATION_TYPE.TRADE]: "📈",
      [NOTIFICATION_TYPE.MONEY]: "💰",
      [NOTIFICATION_TYPE.PEOPLE]: "👥",
      [NOTIFICATION_TYPE.SYSTEM]: "🔗",
      [NOTIFICATION_TYPE.MORNING_BRIEF]: "☀️",
      [NOTIFICATION_TYPE.BREAKTHROUGH]: "🎯",
      [NOTIFICATION_TYPE.REMINDER]: "⏰",
      [NOTIFICATION_TYPE.ALERT]: "⚠️"
    };
    return emojis[type] || "📬";
  }

  // ==================== Specific Notification Methods ====================

  /**
   * Notify about a completed outcome (sent only once per outcome)
   */
  async notifyOutcome(outcomeId, title, details) {
    return this.send(NOTIFICATION_TYPE.OUTCOME,
      `Completed: ${title}\n\n${details}`,
      { identifier: outcomeId, metadata: { outcomeId } }
    );
  }

  /**
   * Notify about a trade execution
   */
  async notifyTrade(trade) {
    // Also send as push notification
    try {
      await sendTradeAlertPush(trade);
    } catch (pushErr) {
      // Best-effort
    }

    return this.send(NOTIFICATION_TYPE.TRADE,
      formatTradeNotification(trade),
      {
        identifier: `${trade.symbol}_${trade.action}_${Date.now()}`,
        priority: NOTIFICATION_PRIORITY.HIGH,
        metadata: trade,
        pushType: PUSH_TYPE.TRADE_ALERT
      }
    );
  }

  /**
   * Notify about a money transaction
   */
  async notifyMoneyTransaction(transaction) {
    const { type, amount, description, account } = transaction;
    const sign = type === "credit" || type === "deposit" ? "+" : "-";

    return this.send(NOTIFICATION_TYPE.MONEY,
      `${description}\n${sign}$${Math.abs(amount).toFixed(2)}${account ? ` (${account})` : ""}`,
      {
        identifier: `money_${Date.now()}`,
        priority: NOTIFICATION_PRIORITY.NORMAL,
        metadata: transaction
      }
    );
  }

  /**
   * Notify about interaction with a person
   */
  async notifyPeopleInteraction(interaction) {
    const { person, action, details } = interaction;

    return this.send(NOTIFICATION_TYPE.PEOPLE,
      `${action} with ${person}\n${details || ""}`,
      {
        identifier: `people_${person}_${Date.now()}`,
        metadata: interaction
      }
    );
  }

  /**
   * Notify about system connection/login
   */
  async notifySystemConnection(system, status, details) {
    const statusWord = status === "connected" ? "Connected to" : "Disconnected from";

    return this.send(NOTIFICATION_TYPE.SYSTEM,
      `${statusWord} ${system}${details ? `\n${details}` : ""}`,
      {
        identifier: `system_${system}_${status}`,
        metadata: { system, status, details }
      }
    );
  }

  /**
   * Send daily morning brief via WhatsApp.
   *
   * Accepts either:
   * - A string (new rich format from daily-brief-generator)
   * - An object with { greeting, health, calendar, ... } (legacy format)
   *
   * @param {string|Object} briefOrText - Pre-formatted text or legacy brief object
   * @param {Object} [options] - { mediaUrl } for chart image attachment
   */
  async sendMorningBrief(briefOrText, options = {}) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // Only send once per day
    if (this.lastMorningBrief === today) {
      return { success: false, error: "Already sent today", duplicate: true };
    }

    // Use the WhatsApp formatter for beautiful output
    const message = formatBriefForWhatsApp(briefOrText);

    // Send with or without media
    let result;
    if (options.mediaUrl) {
      result = await this._sendWithMedia(NOTIFICATION_TYPE.MORNING_BRIEF, message, options.mediaUrl, {
        identifier: `morning_${today}`,
        priority: NOTIFICATION_PRIORITY.NORMAL,
        allowDuplicate: false,
        pushType: PUSH_TYPE.MORNING_BRIEF
      });
    } else {
      result = await this.send(NOTIFICATION_TYPE.MORNING_BRIEF, message, {
        identifier: `morning_${today}`,
        priority: NOTIFICATION_PRIORITY.NORMAL,
        allowDuplicate: false,
        pushType: PUSH_TYPE.MORNING_BRIEF
      });
    }

    // Also send as push notification
    try {
      const pushBrief = typeof briefOrText === "object" ? briefOrText : { greeting: message.substring(0, 100) };
      await sendMorningBriefPush(pushBrief);
    } catch (pushErr) {
      // Best-effort
    }

    if (result.success) {
      this.lastMorningBrief = today;
    }

    return result;
  }

  /**
   * Send evening brief via WhatsApp.
   *
   * @param {string} messageText - Pre-formatted rich text
   * @param {Object} [options] - { mediaUrl } for chart image attachment
   */
  async sendEveningBrief(messageText, options = {}) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    if (this.lastEveningBrief === today) {
      return { success: false, error: "Already sent today", duplicate: true };
    }

    let result;
    if (options.mediaUrl) {
      result = await this._sendWithMedia(NOTIFICATION_TYPE.EVENING_BRIEF, messageText, options.mediaUrl, {
        identifier: `evening_${today}`,
        priority: NOTIFICATION_PRIORITY.NORMAL,
        allowDuplicate: false
      });
    } else {
      result = await this.send(NOTIFICATION_TYPE.EVENING_BRIEF, messageText, {
        identifier: `evening_${today}`,
        priority: NOTIFICATION_PRIORITY.NORMAL,
        allowDuplicate: false
      });
    }

    if (result.success) {
      this.lastEveningBrief = today;
    }

    return result;
  }

  /**
   * Internal: send a notification with a media attachment (image/chart).
   */
  async _sendWithMedia(type, message, mediaUrl, options = {}) {
    if (!this.enabled || !this.phoneNumber) {
      return { success: false, error: "Notifications not enabled" };
    }

    const identifier = options.identifier || message.substring(0, 50);
    if (!options.allowDuplicate && this.hasBeenSent(type, identifier)) {
      return { success: false, error: "Already sent", duplicate: true };
    }

    if (this.isQuietHours() && options.priority !== NOTIFICATION_PRIORITY.URGENT) {
      return { success: false, error: "Quiet hours", quietHours: true };
    }

    const emoji = this.getTypeEmoji(type);
    const formattedMessage = `${emoji} ${message}`;

    try {
      const whatsapp = getTwilioWhatsApp();
      if (!whatsapp.initialized) {
        const initResult = await whatsapp.initialize();
        if (!initResult.success) {
          return { success: false, error: "WhatsApp not configured" };
        }
      }

      const result = await whatsapp.sendMediaMessage(this.phoneNumber, formattedMessage, mediaUrl);

      if (result.success) {
        this.markAsSent(type, identifier);

        const messageLog = getUnifiedMessageLog();
        messageLog.addMessage("assistant", message, {
          channel: MESSAGE_CHANNEL.PROACTIVE,
          metadata: { type, notificationType: type, mediaUrl, ...options.metadata }
        });

        showNotificationTitle(type, message.substring(0, 30), 5000);
        this.emit("notification-sent", { type, message, messageId: result.messageId, mediaUrl });
      }

      return result;
    } catch (error) {
      console.error("[WhatsAppNotifications] Media send error:", error.message);
      // Fallback: try without media
      return this.send(type, message, options);
    }
  }

  /**
   * Notify about a breakthrough or achievement
   */
  async notifyBreakthrough(achievement) {
    const { title, description, impact } = achievement;

    return this.send(NOTIFICATION_TYPE.BREAKTHROUGH,
      `${title}\n\n${description}${impact ? `\n\nImpact: ${impact}` : ""}`,
      {
        identifier: `breakthrough_${title.substring(0, 20)}`,
        priority: NOTIFICATION_PRIORITY.HIGH,
        metadata: achievement
      }
    );
  }

  /**
   * Send an alert (bypasses quiet hours if urgent)
   */
  async sendAlert(message, urgent = false) {
    return this.send(NOTIFICATION_TYPE.ALERT, message, {
      identifier: `alert_${Date.now()}`,
      priority: urgent ? NOTIFICATION_PRIORITY.URGENT : NOTIFICATION_PRIORITY.HIGH,
      metadata: { urgent }
    });
  }

  /**
   * Send AI response to user's WhatsApp
   * Called when AI completes processing a message
   */
  async sendAIResponse(response, originalChannel) {
    // Only send via WhatsApp if the original message was from WhatsApp
    // or if explicitly requested
    if (originalChannel !== MESSAGE_CHANNEL.WHATSAPP) {
      return { success: false, error: "Not a WhatsApp conversation" };
    }

    if (!this.enabled || !this.phoneNumber) {
      return { success: false, error: "WhatsApp not enabled" };
    }

    try {
      const whatsapp = getTwilioWhatsApp();
      if (!whatsapp.initialized) {
        await whatsapp.initialize();
      }

      const result = await whatsapp.sendMessage(this.phoneNumber, response);

      if (result.success) {
        // Log to unified message log
        const messageLog = getUnifiedMessageLog();
        messageLog.addMessage("assistant", response, {
          channel: MESSAGE_CHANNEL.WHATSAPP,
          metadata: { sentToWhatsApp: true }
        });

        this.emit("response-sent", { response, messageId: result.messageId });
      }

      return result;

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get notification status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      phoneNumber: this.phoneNumber,
      sentCount: this.sentNotifications.size,
      isQuietHours: this.isQuietHours(),
      quietHoursStart: this.quietHoursStart,
      quietHoursEnd: this.quietHoursEnd,
      lastMorningBrief: this.lastMorningBrief,
      lastEveningBrief: this.lastEveningBrief
    };
  }

  /**
   * Configure quiet hours
   */
  setQuietHours(start, end, enabled = true) {
    this.quietHoursStart = start;
    this.quietHoursEnd = end;
    this.respectQuietHours = enabled;
  }
}

// Singleton instance
let instance = null;

export const getWhatsAppNotifications = () => {
  if (!instance) {
    instance = new WhatsAppNotifications();
  }
  return instance;
};

export default WhatsAppNotifications;
