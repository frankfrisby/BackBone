/**
 * Response Router
 *
 * Selects the best output channel based on content + context,
 * then delivers the response through that channel.
 *
 * Channels:
 *  - whatsapp: Standard reply via WhatsApp (< 1600 chars, or chunked)
 *  - vapi: Phone call via Vapi AI voice
 *  - push: Push notification only
 *
 * Routing rules:
 *  | Condition                                | Channel           |
 *  |------------------------------------------|-------------------|
 *  | User said "call me"                      | Vapi phone call   |
 *  | Urgent/critical alert (not quiet hours)  | Vapi phone call   |
 *  | Urgent alert during quiet hours          | Push notification  |
 *  | Proactive notification during quiet hrs  | Push only          |
 *  | Standard reply (< 1600 chars)            | WhatsApp           |
 *  | Long reply (> 1600 chars)                | WhatsApp chunked + push |
 */

import { getWhatsAppNotifications, NOTIFICATION_PRIORITY } from "./messaging/whatsapp-notifications.js";
import { sendPush } from "./messaging/push-notifications.js";
import { MESSAGE_CHANNEL, getUnifiedMessageLog } from "./messaging/unified-message-log.js";

export const CHANNEL = {
  WHATSAPP: "whatsapp",
  VAPI: "vapi",
  PUSH: "push"
};

const WHATSAPP_CHAR_LIMIT = 1600;

/**
 * Check if the user is requesting a phone call
 */
function wantsPhoneCall(userMessage) {
  if (!userMessage) return false;
  return /\bcall\s+me\b/i.test(userMessage);
}

/**
 * Check if content is urgent/critical
 */
function isUrgent(context) {
  if (!context) return false;
  if (context.priority === NOTIFICATION_PRIORITY.URGENT) return true;
  if (context.isProactive && context.notificationType === "urgent") return true;
  return false;
}

/**
 * Check if we're in quiet hours
 */
function isQuietHours() {
  const whatsapp = getWhatsAppNotifications();
  return whatsapp.isQuietHours();
}

/**
 * Select the best channel for a response
 *
 * @param {string} responseContent - The response text
 * @param {Object} context - Message context
 * @param {string} [context.userMessage] - Original user message
 * @param {boolean} [context.isProactive] - Whether this is a proactive notification
 * @param {string} [context.notificationType] - Notification type for proactive messages
 * @param {number} [context.priority] - Priority level
 * @returns {{ channel: string, reason: string, chunks?: string[] }}
 */
export function selectChannel(responseContent, context = {}) {
  const quiet = isQuietHours();

  // User explicitly asked for a call
  if (wantsPhoneCall(context.userMessage)) {
    return { channel: CHANNEL.VAPI, reason: "user requested call" };
  }

  // Urgent alert
  if (isUrgent(context)) {
    if (!quiet) {
      return { channel: CHANNEL.VAPI, reason: "urgent alert, not quiet hours" };
    }
    return { channel: CHANNEL.PUSH, reason: "urgent alert during quiet hours" };
  }

  // Proactive notification during quiet hours → push only
  if (context.isProactive && quiet) {
    return { channel: CHANNEL.PUSH, reason: "proactive during quiet hours" };
  }

  // Standard reply — check length
  if (responseContent && responseContent.length > WHATSAPP_CHAR_LIMIT) {
    const chunks = chunkMessage(responseContent, WHATSAPP_CHAR_LIMIT);
    return { channel: CHANNEL.WHATSAPP, reason: "long reply, chunked", chunks };
  }

  return { channel: CHANNEL.WHATSAPP, reason: "standard reply" };
}

/**
 * Route a response to the selected channel
 *
 * @param {string} content - Response content
 * @param {string} channel - Target channel (CHANNEL.WHATSAPP | CHANNEL.VAPI | CHANNEL.PUSH)
 * @param {Object} context - Routing context
 * @param {string[]} [context.chunks] - Pre-chunked messages for WhatsApp
 * @param {string} [context.vapiPrompt] - Custom prompt for Vapi call
 * @param {string} [context.userId] - Firebase user ID
 * @returns {Promise<{ success: boolean, channel: string, error?: string }>}
 */
export async function routeResponse(content, channel, context = {}) {
  try {
    switch (channel) {
      case CHANNEL.VAPI:
        return await routeVapi(content, context);

      case CHANNEL.PUSH:
        return await routePush(content, context);

      case CHANNEL.WHATSAPP:
      default:
        return await routeWhatsApp(content, context);
    }
  } catch (error) {
    console.error(`[ResponseRouter] Error routing to ${channel}:`, error.message);
    // Fallback: try WhatsApp if Vapi failed
    if (channel === CHANNEL.VAPI) {
      console.log("[ResponseRouter] Vapi failed, falling back to WhatsApp");
      try {
        return await routeWhatsApp(content, context);
      } catch (fallbackErr) {
        return { success: false, channel, error: `${error.message} (fallback also failed: ${fallbackErr.message})` };
      }
    }
    return { success: false, channel, error: error.message };
  }
}

/**
 * Send via WhatsApp (with chunking for long messages)
 */
async function routeWhatsApp(content, context) {
  const whatsapp = getWhatsAppNotifications();
  const chunks = context.chunks || [content];

  let lastResult = { success: false };
  for (const chunk of chunks) {
    lastResult = await whatsapp.sendAIResponse(chunk, MESSAGE_CHANNEL.WHATSAPP);
    if (!lastResult.success) break;
  }

  // Also send push for long messages
  if (chunks.length > 1) {
    try {
      await sendPush(context.userId || null, {
        title: "BACKBONE",
        body: content.substring(0, 200) + "...",
        type: "message"
      });
    } catch {}
  }

  return { success: lastResult.success, channel: CHANNEL.WHATSAPP, error: lastResult.error };
}

/**
 * Initiate a Vapi phone call
 */
async function routeVapi(content, context) {
  try {
    const { getVapiService } = await import("./messaging/vapi-service.js");
    const vapi = getVapiService();

    const prompt = context.vapiPrompt ||
      `You are calling the user to share this information. Be concise and conversational:\n\n${content}`;

    const result = await vapi.callUser(prompt);
    return { success: !!result, channel: CHANNEL.VAPI };
  } catch (error) {
    throw new Error(`Vapi call failed: ${error.message}`);
  }
}

/**
 * Send push notification only
 */
async function routePush(content, context) {
  const result = await sendPush(context.userId || null, {
    title: context.pushTitle || "BACKBONE",
    body: content.substring(0, 300),
    type: context.pushType || "notification"
  });
  return { success: result.success !== false, channel: CHANNEL.PUSH, error: result.error };
}

/**
 * Split a long message into WhatsApp-friendly chunks
 * Splits on paragraph boundaries where possible, falls back to sentence/word boundaries
 */
function chunkMessage(text, maxLen = WHATSAPP_CHAR_LIMIT) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try to split at paragraph boundary
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);

    // Fall back to line break
    if (splitAt < maxLen * 0.3) {
      splitAt = remaining.lastIndexOf("\n", maxLen);
    }

    // Fall back to sentence boundary
    if (splitAt < maxLen * 0.3) {
      splitAt = remaining.lastIndexOf(". ", maxLen);
      if (splitAt > 0) splitAt += 1; // include the period
    }

    // Fall back to space
    if (splitAt < maxLen * 0.3) {
      splitAt = remaining.lastIndexOf(" ", maxLen);
    }

    // Worst case: hard cut
    if (splitAt < maxLen * 0.3) {
      splitAt = maxLen;
    }

    chunks.push(remaining.substring(0, splitAt).trim());
    remaining = remaining.substring(splitAt).trim();
  }

  return chunks;
}

export { chunkMessage };
export default { selectChannel, routeResponse, CHANNEL };
