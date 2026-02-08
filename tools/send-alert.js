/**
 * Tool: Send Alert
 *
 * Send a proactive message/alert to the user via WhatsApp.
 * Use this when you discover something important the user should know.
 *
 * Examples:
 * - Market moving significantly
 * - Extreme buy/sell signal triggered
 * - News affecting user's positions
 * - Goal deadline approaching
 * - Health insight worth noting
 */

import { getWhatsAppNotifications, NOTIFICATION_TYPE, NOTIFICATION_PRIORITY } from "../src/services/messaging/whatsapp-notifications.js";
import { loadFirebaseUser } from "../src/services/firebase/firebase-auth.js";

export const metadata = {
  id: "send-alert",
  name: "Send Alert",
  description: "Send a proactive message to the user via WhatsApp",
  category: "messaging"
};

/**
 * Execute the tool
 * @param {Object} inputs - { message, type, priority, context }
 * @returns {Promise<Object>} Result
 */
export async function execute(inputs) {
  const { message, type = "alert", priority = "normal", context } = inputs;

  if (!message) {
    return { success: false, error: "Message is required" };
  }

  try {
    const whatsapp = getWhatsAppNotifications();

    // Initialize if needed
    if (!whatsapp.enabled) {
      const user = loadFirebaseUser();
      if (user?.localId) {
        await whatsapp.initialize(user.localId);
      }
    }

    if (!whatsapp.enabled) {
      return { success: false, error: "WhatsApp not enabled" };
    }

    // Map type to notification type
    const notificationType = mapType(type);
    const priorityLevel = mapPriority(priority);

    // Format message with context if provided
    let formattedMessage = message;
    if (context) {
      formattedMessage += `\n\n${context}`;
    }

    const result = await whatsapp.send(notificationType, formattedMessage, {
      priority: priorityLevel,
      allowDuplicate: false
    });

    return {
      success: result.success,
      messageId: result.messageId,
      type: notificationType,
      priority: priority,
      error: result.error
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function mapType(type) {
  const typeMap = {
    "alert": NOTIFICATION_TYPE.ALERT,
    "trade": NOTIFICATION_TYPE.TRADE,
    "market": NOTIFICATION_TYPE.ALERT,
    "news": NOTIFICATION_TYPE.ALERT,
    "health": NOTIFICATION_TYPE.REMINDER,
    "goal": NOTIFICATION_TYPE.REMINDER,
    "breakthrough": NOTIFICATION_TYPE.BREAKTHROUGH,
    "reminder": NOTIFICATION_TYPE.REMINDER
  };
  return typeMap[type] || NOTIFICATION_TYPE.ALERT;
}

function mapPriority(priority) {
  const priorityMap = {
    "low": NOTIFICATION_PRIORITY.LOW,
    "normal": NOTIFICATION_PRIORITY.NORMAL,
    "high": NOTIFICATION_PRIORITY.HIGH,
    "urgent": NOTIFICATION_PRIORITY.URGENT
  };
  return priorityMap[priority] || NOTIFICATION_PRIORITY.NORMAL;
}

export default { metadata, execute };
