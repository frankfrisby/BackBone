/**
 * WhatsApp Channel Adapter
 *
 * Wraps existing Baileys + Twilio WhatsApp services into the
 * OpenClaw-style ChannelAdapter interface.
 */

import { ChannelAdapter, CHANNEL_STATUS, DM_POLICY } from "../channel-adapter.js";

const TAG = "[Channel:WhatsApp]";

export class WhatsAppChannel extends ChannelAdapter {
  constructor(config = {}) {
    super({
      channelId: "whatsapp",
      label: "WhatsApp",
      config: {
        dmPolicy: DM_POLICY.OWNER,
        ownerId: config.ownerPhone || null,
        defaultRecipient: config.ownerPhone || null,
        preferBaileys: config.preferBaileys !== false,
        ...config,
      },
    });
    this.waService = null;
    this.baileys = null;
  }

  async start() {
    this.setStatus(CHANNEL_STATUS.CONNECTING);

    try {
      // Load existing Twilio WhatsApp service (which manages Baileys internally)
      const { getTwilioWhatsApp } = await import("../twilio-whatsapp.js");
      this.waService = getTwilioWhatsApp();
      const result = await this.waService.initialize();

      // Get reference to Baileys instance
      if (this.waService.baileys) {
        this.baileys = this.waService.baileys;
      }

      // Wire inbound messages from Baileys
      if (this.baileys) {
        this.baileys.on("message-received", (data) => {
          this._handleInbound(data);
        });

        this.baileys.on("connected", () => {
          this.setStatus(CHANNEL_STATUS.CONNECTED);
        });

        this.baileys.on("disconnected", ({ code, requiresPairing }) => {
          if (requiresPairing) {
            this.setStatus(CHANNEL_STATUS.PAIRING, "Scan QR to re-link WhatsApp");
          } else {
            this.setStatus(CHANNEL_STATUS.DISCONNECTED, `Code: ${code}`);
          }
        });
      }

      // Wire Twilio/generic events
      this.waService.on("message-received", (data) => {
        // Avoid duplicates if Baileys already handled it
        if (this.baileys && this.baileys.connected) return;
        this._handleInbound(data);
      });

      if (result.connected) {
        this.setStatus(CHANNEL_STATUS.CONNECTED);
      } else if (result.requiresPairing) {
        this.setStatus(CHANNEL_STATUS.PAIRING, "Needs QR pairing");
      } else {
        this.setStatus(CHANNEL_STATUS.CONNECTING);
      }

      console.log(`${TAG} Started (provider: ${result.provider || "unknown"}, connected: ${result.connected})`);
      return result;
    } catch (err) {
      this.setStatus(CHANNEL_STATUS.ERROR, err.message);
      console.error(`${TAG} Start failed:`, err.message);
      throw err;
    }
  }

  async stop() {
    if (this.baileys) {
      try { this.baileys.removeAllListeners(); } catch {}
    }
    this.setStatus(CHANNEL_STATUS.DISCONNECTED);
  }

  async sendMessage(recipientId, content, opts = {}) {
    if (!this.waService) {
      return { success: false, error: "WhatsApp not initialized" };
    }

    try {
      const formatted = this.formatOutbound(content);
      const result = await this.waService.sendMessage(recipientId, formatted);
      return { success: true, messageId: result?.messageId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  formatOutbound(text) {
    try {
      // Use existing WhatsApp formatter
      const { markdownToWhatsApp } = require("../whatsapp-formatter.js");
      if (markdownToWhatsApp) return markdownToWhatsApp(text);
    } catch {}
    return text;
  }

  get maxMessageLength() {
    return 4096;
  }

  // ── Private ───────────────────────────────────────────────────

  _handleInbound(data) {
    const msg = {
      userId: data.from || data.sender || data.phone || "unknown",
      displayName: data.pushName || data.profileName || data.from || "Unknown",
      content: data.message || data.body || data.text || "",
      chatType: (data.isGroup || data.remoteJid?.endsWith("@g.us")) ? "group" : "dm",
      chatId: data.remoteJid || data.chatId || null,
      media: data.media || null,
      metadata: {
        provider: data.provider || "baileys",
        remoteJid: data.remoteJid,
        messageType: data.messageType,
        raw: data,
      },
    };

    this.emitMessage(msg);
  }
}

export default WhatsAppChannel;
