/**
 * BACKBONE WhatsApp MCP Server
 *
 * Provides tools for sending WhatsApp messages via Twilio.
 * Allows Claude Code to proactively message the user and
 * check notification/messaging status.
 *
 * Uses:
 * - TwilioWhatsAppService for message delivery
 * - WhatsAppNotifications for structured notifications
 * - Phone number from user-settings.json or phone-auth
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Tool definitions
const TOOLS = [
  {
    name: "send_whatsapp",
    description:
      "Send a WhatsApp message to the user. Uses Twilio for delivery. The user's phone number is auto-resolved from settings.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The message text to send",
        },
        to: {
          type: "string",
          description:
            "Optional phone number override (E.164 format like +15551234567). If omitted, sends to the user's registered phone.",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "send_whatsapp_notification",
    description:
      "Send a typed notification via WhatsApp (trade alert, morning brief, achievement, reminder, alert). Includes emoji formatting and duplicate prevention.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "outcome",
            "trade",
            "money",
            "people",
            "system",
            "morning_brief",
            "evening_brief",
            "breakthrough",
            "reminder",
            "alert",
          ],
          description: "Notification type (determines emoji and formatting)",
        },
        message: {
          type: "string",
          description: "Notification message text",
        },
        urgent: {
          type: "boolean",
          description:
            "If true, bypasses quiet hours. Default false.",
        },
      },
      required: ["type", "message"],
    },
  },
  {
    name: "send_whatsapp_media",
    description:
      "Send a WhatsApp message with an image or document attachment (e.g., chart image, PDF).",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Caption/body text for the media message",
        },
        mediaUrl: {
          type: "string",
          description:
            "Public URL of the image or document to attach",
        },
        to: {
          type: "string",
          description:
            "Optional phone number override. If omitted, sends to user's registered phone.",
        },
      },
      required: ["message", "mediaUrl"],
    },
  },
  {
    name: "get_whatsapp_status",
    description:
      "Get WhatsApp messaging status: initialized, credentials, registered users, quiet hours, notification counts.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "schedule_whatsapp",
    description:
      "Schedule a WhatsApp message for future delivery. Useful for reminders and timed check-ins.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Message text to send",
        },
        sendAt: {
          type: "string",
          description:
            "ISO 8601 datetime for when to send (e.g., '2026-02-08T09:00:00')",
        },
        to: {
          type: "string",
          description:
            "Optional phone number override. If omitted, sends to user's registered phone.",
        },
        topic: {
          type: "string",
          description:
            "Optional topic label for grouping related scheduled messages",
        },
      },
      required: ["message", "sendAt"],
    },
  },
  {
    name: "get_scheduled_messages",
    description:
      "List all scheduled WhatsApp messages that haven't been sent yet.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "cancel_scheduled_message",
    description: "Cancel a previously scheduled WhatsApp message by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        scheduleId: {
          type: "string",
          description: "The schedule ID returned by schedule_whatsapp",
        },
      },
      required: ["scheduleId"],
    },
  },
];

// Create server
const server = new Server(
  {
    name: "backbone-whatsapp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Resolve the user's phone number from settings or phone-auth.
 */
async function resolveUserPhone() {
  // Try user-settings.json first
  try {
    const { loadUserSettings } = await import(
      "../services/user-settings.js"
    );
    const settings = loadUserSettings();
    if (settings.phoneNumber) return settings.phoneNumber;
    if (settings.phone) return settings.phone;
  } catch {}

  // Try phone-auth verified phone
  try {
    const { getVerifiedPhone, loadFirebaseUser } = await import(
      "../services/firebase/phone-auth.js"
    );
    const { loadFirebaseUser: loadUser } = await import(
      "../services/firebase/firebase-auth.js"
    );
    const user = loadUser();
    if (user?.localId) {
      const phone = getVerifiedPhone(user.localId);
      if (phone) return phone;
    }
  } catch {}

  return null;
}

/**
 * Get or initialize the Twilio WhatsApp service.
 */
async function getWhatsApp() {
  const { getTwilioWhatsApp } = await import(
    "../services/messaging/twilio-whatsapp.js"
  );
  const wa = getTwilioWhatsApp();
  if (!wa.initialized) {
    const result = await wa.initialize();
    if (!result.success) {
      throw new Error(result.error || "WhatsApp not configured");
    }
  }
  return wa;
}

/**
 * Get or initialize the WhatsApp notifications service.
 */
async function getNotifications() {
  const { getWhatsAppNotifications } = await import(
    "../services/messaging/whatsapp-notifications.js"
  );
  const notif = getWhatsAppNotifications();
  if (!notif.enabled) {
    // Try initializing with firebase user
    try {
      const { loadFirebaseUser } = await import(
        "../services/firebase/firebase-auth.js"
      );
      const user = loadFirebaseUser();
      if (user?.localId) {
        await notif.initialize(user.localId);
      }
    } catch {}
  }
  return notif;
}

/**
 * Get the WhatsApp direct service (Meta API — for scheduling).
 */
async function getWhatsAppDirect() {
  const { getWhatsAppService } = await import(
    "../services/messaging/whatsapp-service.js"
  );
  return getWhatsAppService();
}

// ── Handle tool calls ────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;

  switch (name) {
    // ── Send a plain WhatsApp message ───────────────────────────
    case "send_whatsapp": {
      try {
        const wa = await getWhatsApp();
        const phone = args.to || (await resolveUserPhone());
        if (!phone) {
          result = {
            success: false,
            error:
              "No phone number found. Set one in user settings or provide the 'to' parameter.",
          };
          break;
        }
        // Format for beautiful WhatsApp rendering
        const { formatAIResponse, chunkMessage } = await import(
          "../services/messaging/whatsapp-formatter.js"
        );
        const formatted = formatAIResponse(args.message);
        const chunks = chunkMessage(formatted, 1500);

        // Send each chunk
        let sendResult;
        for (const chunk of chunks) {
          sendResult = await wa.sendMessage(phone, chunk);
        }
        result = sendResult;
      } catch (err) {
        result = { success: false, error: err.message };
      }
      break;
    }

    // ── Send a typed notification ───────────────────────────────
    case "send_whatsapp_notification": {
      try {
        const notif = await getNotifications();
        if (!notif.enabled) {
          result = {
            success: false,
            error:
              "WhatsApp notifications not enabled. Configure Twilio credentials in Firebase Firestore (config/config_twilio).",
          };
          break;
        }
        const priority = args.urgent ? 4 : 2; // URGENT=4, NORMAL=2
        const sendResult = await notif.send(args.type, args.message, {
          priority,
        });
        result = sendResult;
      } catch (err) {
        result = { success: false, error: err.message };
      }
      break;
    }

    // ── Send a message with media ───────────────────────────────
    case "send_whatsapp_media": {
      try {
        const wa = await getWhatsApp();
        const phone = args.to || (await resolveUserPhone());
        if (!phone) {
          result = {
            success: false,
            error: "No phone number found.",
          };
          break;
        }
        const sendResult = await wa.sendMediaMessage(
          phone,
          args.message,
          args.mediaUrl
        );
        result = sendResult;
      } catch (err) {
        result = { success: false, error: err.message };
      }
      break;
    }

    // ── Get status ──────────────────────────────────────────────
    case "get_whatsapp_status": {
      try {
        const { getTwilioWhatsApp } = await import(
          "../services/messaging/twilio-whatsapp.js"
        );
        const wa = getTwilioWhatsApp();
        const twilioStatus = wa.getStatus();

        const { getWhatsAppNotifications } = await import(
          "../services/messaging/whatsapp-notifications.js"
        );
        const notif = getWhatsAppNotifications();
        const notifStatus = notif.getStatus();

        const phone = await resolveUserPhone();

        result = {
          twilio: twilioStatus,
          notifications: notifStatus,
          userPhone: phone ? `${phone.slice(0, 4)}***${phone.slice(-4)}` : "not set",
        };
      } catch (err) {
        result = { error: err.message };
      }
      break;
    }

    // ── Schedule a message ──────────────────────────────────────
    case "schedule_whatsapp": {
      try {
        const waDirect = await getWhatsAppDirect();
        const phone = args.to || (await resolveUserPhone());
        if (!phone) {
          result = {
            success: false,
            error: "No phone number found.",
          };
          break;
        }
        const scheduleId = waDirect.scheduleMessage(
          phone,
          args.message,
          args.sendAt,
          { topic: args.topic }
        );
        result = {
          success: true,
          scheduleId,
          sendAt: args.sendAt,
          message: `Message scheduled for ${args.sendAt}`,
        };
      } catch (err) {
        result = { success: false, error: err.message };
      }
      break;
    }

    // ── List scheduled messages ─────────────────────────────────
    case "get_scheduled_messages": {
      try {
        const waDirect = await getWhatsAppDirect();
        const scheduled = waDirect.getScheduledMessages();
        result = {
          count: scheduled.length,
          messages: scheduled,
        };
      } catch (err) {
        result = { error: err.message };
      }
      break;
    }

    // ── Cancel a scheduled message ──────────────────────────────
    case "cancel_scheduled_message": {
      try {
        const waDirect = await getWhatsAppDirect();
        result = waDirect.cancelScheduledMessage(args.scheduleId);
      } catch (err) {
        result = { success: false, error: err.message };
      }
      break;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE WhatsApp MCP Server running");
}

main().catch(console.error);
