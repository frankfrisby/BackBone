/**
 * Slack Channel Adapter
 *
 * Uses @slack/bolt for Slack workspace integration.
 * Auto-installs if not present.
 *
 * Setup:
 *   1. Go to https://api.slack.com/apps → Create New App
 *   2. Enable Socket Mode + Event Subscriptions (message.im, app_mention)
 *   3. Install to workspace → get Bot Token (xoxb-...) and App Token (xapp-...)
 *   4. Set in config: { botToken: "xoxb-...", appToken: "xapp-..." }
 *
 * Config:
 *   {
 *     botToken: "xoxb-...",
 *     appToken: "xapp-...",     // For Socket Mode (no public URL needed)
 *     ownerId: "U12345678",     // Your Slack user ID
 *     allowFrom: ["U12345678"],
 *     dmPolicy: "owner",
 *     allowedChannels: []        // Empty = DMs only; or ["C12345"] for channels
 *   }
 */

import { ChannelAdapter, CHANNEL_STATUS, DM_POLICY } from "../channel-adapter.js";

const TAG = "[Channel:Slack]";

export class SlackChannel extends ChannelAdapter {
  constructor(config = {}) {
    super({
      channelId: "slack",
      label: "Slack",
      config: {
        dmPolicy: DM_POLICY.OWNER,
        allowedChannels: [],
        ...config,
      },
    });
    this.app = null;
  }

  async start() {
    const { botToken, appToken } = this.config;
    if (!botToken || !appToken) {
      this.setStatus(CHANNEL_STATUS.ERROR, "Missing Slack botToken or appToken");
      throw new Error("Slack requires botToken (xoxb-...) and appToken (xapp-...). See https://api.slack.com/apps");
    }

    this.setStatus(CHANNEL_STATUS.CONNECTING);

    try {
      const { App } = await this._loadBolt();

      this.app = new App({
        token: botToken,
        appToken: appToken,
        socketMode: true,
      });

      // Handle DMs
      this.app.message(async ({ message, say }) => {
        if (message.subtype) return; // Ignore edits, joins, etc.
        if (message.bot_id) return;  // Ignore bot messages

        this._handleInbound(message);
      });

      // Handle @mentions in channels
      this.app.event("app_mention", async ({ event }) => {
        this._handleInbound(event);
      });

      await this.app.start();
      this.setStatus(CHANNEL_STATUS.CONNECTED);
      console.log(`${TAG} Connected via Socket Mode`);
    } catch (err) {
      this.setStatus(CHANNEL_STATUS.ERROR, err.message);
      throw err;
    }
  }

  async stop() {
    if (this.app) {
      try { await this.app.stop(); } catch {}
      this.app = null;
    }
    this.setStatus(CHANNEL_STATUS.DISCONNECTED);
  }

  async sendMessage(recipientId, content, opts = {}) {
    if (!this.app) {
      return { success: false, error: "Slack app not started" };
    }

    try {
      const channelId = opts.chatId || recipientId;
      const result = await this.app.client.chat.postMessage({
        channel: channelId,
        text: content,
        thread_ts: opts.replyTo || undefined,
      });
      return { success: true, messageId: result.ts };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  formatOutbound(text) {
    // Slack uses mrkdwn format
    return text
      .replace(/\*\*(.+?)\*\*/g, "*$1*")    // **bold** → *bold*
      .replace(/__(.+?)__/g, "_$1_")          // __italic__ → _italic_
      .replace(/~~(.+?)~~/g, "~$1~")          // ~~strike~~ → ~strike~
      .replace(/```(\w+)?\n/g, "```\n");       // Remove language hint from code blocks
  }

  get maxMessageLength() {
    return 4000; // Slack max is ~40K but 4K is practical
  }

  // ── Private ───────────────────────────────────────────────────

  _handleInbound(event) {
    const isDM = event.channel_type === "im";

    // Channel filter
    if (!isDM && this.config.allowedChannels?.length > 0) {
      if (!this.config.allowedChannels.includes(event.channel)) return;
    }

    // Strip bot mention
    let content = event.text || "";
    content = content.replace(/<@[A-Z0-9]+>/g, "").trim();

    if (!content) return;

    this.emitMessage({
      userId: event.user,
      displayName: event.user_profile?.display_name || event.user || "Unknown",
      content,
      chatType: isDM ? "dm" : "group",
      chatId: event.channel,
      replyTo: event.thread_ts || null,
      metadata: {
        ts: event.ts,
        teamId: event.team,
        channelType: event.channel_type,
      },
    });
  }

  async _loadBolt() {
    try {
      return await import("@slack/bolt");
    } catch (err) {
      if (err.code !== "ERR_MODULE_NOT_FOUND" && !err.message?.includes("Cannot find")) throw err;

      console.log(`${TAG} Installing @slack/bolt...`);
      const { execSync } = await import("child_process");
      execSync("npm install @slack/bolt --save", { stdio: "pipe", timeout: 60_000 });
      return await import("@slack/bolt");
    }
  }
}

export default SlackChannel;
