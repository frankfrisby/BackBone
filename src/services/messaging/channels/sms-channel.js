/**
 * SMS Channel Adapter
 *
 * Uses Twilio for SMS messaging. Piggybacks on existing Twilio config.
 *
 * Config:
 *   {
 *     accountSid: "AC...",
 *     authToken: "...",
 *     fromNumber: "+1...",
 *     ownerId: "+13024422347",     // Owner's phone
 *     dmPolicy: "owner"
 *   }
 */

import { ChannelAdapter, CHANNEL_STATUS, DM_POLICY } from "../channel-adapter.js";

const TAG = "[Channel:SMS]";

export class SMSChannel extends ChannelAdapter {
  constructor(config = {}) {
    super({
      channelId: "sms",
      label: "SMS (Twilio)",
      config: {
        dmPolicy: DM_POLICY.OWNER,
        defaultRecipient: config.ownerId || null,
        ...config,
      },
    });
    this.twilioClient = null;
  }

  async start() {
    const { accountSid, authToken, fromNumber } = this.config;
    if (!accountSid || !authToken || !fromNumber) {
      // Try loading from existing Twilio config
      try {
        const { getTwilioWhatsApp } = await import("../twilio-whatsapp.js");
        const wa = getTwilioWhatsApp();
        if (wa.client) {
          this.twilioClient = wa.client;
          this.config.fromNumber = this.config.fromNumber || wa.twilioNumber;
          this.setStatus(CHANNEL_STATUS.CONNECTED);
          console.log(`${TAG} Connected (reusing Twilio client)`);
          return;
        }
      } catch {}

      this.setStatus(CHANNEL_STATUS.ERROR, "Missing Twilio credentials");
      throw new Error("SMS requires Twilio accountSid, authToken, and fromNumber.");
    }

    this.setStatus(CHANNEL_STATUS.CONNECTING);

    try {
      const twilio = await this._loadTwilio();
      this.twilioClient = twilio.default(accountSid, authToken);
      this.setStatus(CHANNEL_STATUS.CONNECTED);
      console.log(`${TAG} Connected from ${fromNumber}`);
    } catch (err) {
      this.setStatus(CHANNEL_STATUS.ERROR, err.message);
      throw err;
    }
  }

  async stop() {
    this.twilioClient = null;
    this.setStatus(CHANNEL_STATUS.DISCONNECTED);
  }

  async sendMessage(recipientId, content, _opts = {}) {
    if (!this.twilioClient) {
      return { success: false, error: "Twilio client not initialized" };
    }

    try {
      const msg = await this.twilioClient.messages.create({
        body: content,
        from: this.config.fromNumber,
        to: recipientId,
      });
      return { success: true, messageId: msg.sid };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  formatOutbound(text) {
    // SMS is plain text — strip markdown
    return text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/_(.+?)_/g, "$1")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/```[\s\S]*?\n([\s\S]*?)```/g, "$1");
  }

  get maxMessageLength() {
    return 1600; // SMS segments
  }

  async _loadTwilio() {
    try {
      return await import("twilio");
    } catch (err) {
      if (err.code !== "ERR_MODULE_NOT_FOUND" && !err.message?.includes("Cannot find")) throw err;
      console.log(`${TAG} Installing twilio...`);
      const { execSync } = await import("child_process");
      execSync("npm install twilio --save", { stdio: "pipe", timeout: 60_000 });
      return await import("twilio");
    }
  }
}

export default SMSChannel;
