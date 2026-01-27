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
import { getVerifiedPhone } from "./phone-auth.js";
import { showNotificationTitle, restoreBaseTitle } from "./terminal-resize.js";

/**
 * Notification types
 */
export const NOTIFICATION_TYPE = {
  OUTCOME: "outcome",           // AI completed an outcome/task
  TRADE: "trade",               // Stock/crypto trade executed
  MONEY: "money",               // Financial transaction
  PEOPLE: "people",             // Interaction with someone
  SYSTEM: "system",             // System login/connection
  MORNING_BRIEF: "morning_brief", // Daily briefing
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
  }

  /**
   * Initialize with user ID
   */
  async initialize(userId) {
    this.userId = userId;

    // Get verified phone number
    const phone = getVerifiedPhone(userId);
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

    // Check for duplicates
    const identifier = options.identifier || message.substring(0, 50);
    if (!options.allowDuplicate && this.hasBeenSent(type, identifier)) {
      return { success: false, error: "Already sent", duplicate: true };
    }

    // Check quiet hours (unless urgent)
    if (this.isQuietHours() && options.priority !== NOTIFICATION_PRIORITY.URGENT) {
      return { success: false, error: "Quiet hours", quietHours: true };
    }

    // Format the message with type emoji
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

      const result = await whatsapp.sendMessage(this.phoneNumber, formattedMessage);

      if (result.success) {
        // Mark as sent to prevent duplicates
        this.markAsSent(type, identifier);

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

      return result;

    } catch (error) {
      console.error("[WhatsAppNotifications] Send error:", error.message);
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
    const { symbol, action, quantity, price, total } = trade;
    const actionWord = action === "buy" ? "Bought" : "Sold";

    return this.send(NOTIFICATION_TYPE.TRADE,
      `${actionWord} ${quantity} ${symbol} @ $${price.toFixed(2)}\nTotal: $${total.toFixed(2)}`,
      {
        identifier: `${symbol}_${action}_${Date.now()}`,
        priority: NOTIFICATION_PRIORITY.HIGH,
        metadata: trade
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
   * Send daily morning brief
   */
  async sendMorningBrief(brief) {
    const today = new Date().toISOString().split("T")[0];

    // Only send once per day
    if (this.lastMorningBrief === today) {
      return { success: false, error: "Already sent today", duplicate: true };
    }

    const {
      greeting,
      weather,
      calendar,
      priorities,
      portfolio,
      health
    } = brief;

    let message = `${greeting || "Good morning!"}\n\n`;

    if (weather) {
      message += `🌤️ ${weather}\n\n`;
    }

    if (calendar && calendar.length > 0) {
      message += `📅 Today's Schedule:\n`;
      calendar.slice(0, 3).forEach(event => {
        message += `• ${event.time}: ${event.title}\n`;
      });
      message += "\n";
    }

    if (priorities && priorities.length > 0) {
      message += `🎯 Top Priorities:\n`;
      priorities.slice(0, 3).forEach((p, i) => {
        message += `${i + 1}. ${p}\n`;
      });
      message += "\n";
    }

    if (portfolio) {
      const sign = portfolio.change >= 0 ? "+" : "";
      message += `💼 Portfolio: ${sign}${portfolio.changePercent.toFixed(2)}% (${sign}$${portfolio.change.toFixed(2)})\n`;
    }

    if (health) {
      message += `💤 Sleep: ${health.sleepScore || "N/A"} | ❤️ Readiness: ${health.readiness || "N/A"}\n`;
    }

    message += "\nReply with questions or updates!";

    const result = await this.send(NOTIFICATION_TYPE.MORNING_BRIEF, message, {
      identifier: `morning_${today}`,
      priority: NOTIFICATION_PRIORITY.NORMAL,
      allowDuplicate: false
    });

    if (result.success) {
      this.lastMorningBrief = today;
    }

    return result;
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
      lastMorningBrief: this.lastMorningBrief
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
