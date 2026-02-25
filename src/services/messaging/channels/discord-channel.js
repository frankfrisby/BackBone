/**
 * Discord Channel Adapter
 *
 * Uses discord.js for bot-based messaging in servers and DMs.
 * Auto-installs discord.js if not present.
 *
 * Setup:
 *   1. Go to https://discord.com/developers/applications → New Application
 *   2. Bot tab → Add Bot → copy token
 *   3. OAuth2 → URL Generator → scopes: bot → permissions: Send Messages, Read Message History
 *   4. Invite bot to your server with the generated URL
 *   5. Set token in config: { token: "BOT_TOKEN" }
 *
 * Config:
 *   {
 *     token: "BOT_TOKEN",
 *     ownerId: "YOUR_DISCORD_USER_ID",
 *     allowFrom: ["USER_ID_1"],
 *     dmPolicy: "owner",
 *     mentionOnly: true,        // In servers, only respond when @mentioned
 *     allowedChannels: []       // Empty = all channels; or ["channel-id-1", "channel-id-2"]
 *   }
 */

import { ChannelAdapter, CHANNEL_STATUS, DM_POLICY } from "../channel-adapter.js";

const TAG = "[Channel:Discord]";

export class DiscordChannel extends ChannelAdapter {
  constructor(config = {}) {
    super({
      channelId: "discord",
      label: "Discord",
      config: {
        dmPolicy: DM_POLICY.OWNER,
        mentionOnly: true,
        allowedChannels: [],
        ...config,
      },
    });
    this.client = null;
  }

  async start() {
    const token = this.config.token;
    if (!token) {
      this.setStatus(CHANNEL_STATUS.ERROR, "No Discord bot token configured");
      throw new Error("Discord bot token required. Get one from discord.com/developers.");
    }

    this.setStatus(CHANNEL_STATUS.CONNECTING);

    try {
      const { Client, GatewayIntentBits, Partials } = await this._loadDiscordJs();

      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
        partials: [Partials.Channel], // Required for DMs
      });

      this.client.on("ready", () => {
        this.setStatus(CHANNEL_STATUS.CONNECTED);
        console.log(`${TAG} Connected as ${this.client.user.tag} (${this.client.guilds.cache.size} servers)`);
      });

      this.client.on("messageCreate", (message) => {
        this._handleMessage(message);
      });

      this.client.on("error", (err) => {
        console.error(`${TAG} Client error:`, err.message);
        this.lastError = err.message;
      });

      this.client.on("disconnect", () => {
        this.setStatus(CHANNEL_STATUS.DISCONNECTED);
      });

      await this.client.login(token);
    } catch (err) {
      this.setStatus(CHANNEL_STATUS.ERROR, err.message);
      throw err;
    }
  }

  async stop() {
    if (this.client) {
      try { this.client.destroy(); } catch {}
      this.client = null;
    }
    this.setStatus(CHANNEL_STATUS.DISCONNECTED);
  }

  async sendMessage(recipientId, content, opts = {}) {
    if (!this.client) {
      return { success: false, error: "Discord client not started" };
    }

    try {
      // recipientId can be a channel ID or user ID
      let target;

      // Try as channel first
      target = this.client.channels.cache.get(recipientId);

      // Try as user DM
      if (!target) {
        try {
          const user = await this.client.users.fetch(recipientId);
          target = await user.createDM();
        } catch {}
      }

      if (!target || !target.send) {
        return { success: false, error: `Cannot resolve recipient: ${recipientId}` };
      }

      // Discord max is 2000 chars — chunk if needed
      const chunks = this.chunkMessage(content);
      for (const chunk of chunks) {
        await target.send(chunk);
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  formatOutbound(text) {
    // Discord uses standard markdown — pass through mostly
    return text;
  }

  get maxMessageLength() {
    return 2000;
  }

  // ── Private ───────────────────────────────────────────────────

  _handleMessage(message) {
    // Ignore bot messages
    if (message.author.bot) return;

    const isDM = !message.guild;
    const isMentioned = message.mentions?.has(this.client.user);

    // In servers, only respond if mentioned (when mentionOnly is true)
    if (!isDM && this.config.mentionOnly && !isMentioned) return;

    // Channel filter
    if (!isDM && this.config.allowedChannels?.length > 0) {
      if (!this.config.allowedChannels.includes(message.channel.id)) return;
    }

    // Strip bot mention from content
    let content = message.content;
    if (isMentioned && this.client.user) {
      content = content.replace(new RegExp(`<@!?${this.client.user.id}>`, "g"), "").trim();
    }

    if (!content && !message.attachments?.size) return;

    const attachments = [...(message.attachments?.values() || [])];
    const media = attachments.length > 0 ? {
      type: attachments[0].contentType?.startsWith("image") ? "image" : "document",
      url: attachments[0].url,
      fileName: attachments[0].name,
    } : null;

    this.emitMessage({
      userId: message.author.id,
      displayName: message.member?.displayName || message.author.displayName || message.author.username,
      content: content || (media ? `[Attachment: ${media.fileName}]` : ""),
      chatType: isDM ? "dm" : "group",
      chatId: message.channel.id,
      replyTo: message.reference?.messageId || null,
      media,
      metadata: {
        guildId: message.guild?.id,
        guildName: message.guild?.name,
        channelName: message.channel.name,
        username: message.author.username,
        messageId: message.id,
      },
    });
  }

  async _loadDiscordJs() {
    try {
      return await import("discord.js");
    } catch (err) {
      if (err.code !== "ERR_MODULE_NOT_FOUND" && !err.message?.includes("Cannot find")) throw err;

      console.log(`${TAG} Installing discord.js...`);
      const { execSync } = await import("child_process");
      execSync("npm install discord.js --save", { stdio: "pipe", timeout: 60_000 });
      return await import("discord.js");
    }
  }
}

export default DiscordChannel;
