/**
 * Telegram Channel Adapter
 *
 * Uses grammY (lightweight Telegram bot framework) for bot-based messaging.
 * Auto-installs grammY if not present.
 *
 * Setup:
 *   1. Talk to @BotFather on Telegram → /newbot → get token
 *   2. Set token in channel config: { token: "123:ABC..." }
 *   3. Message your bot on Telegram to start chatting
 *
 * Config (in channel-router.json or passed to constructor):
 *   {
 *     token: "BOT_TOKEN",
 *     ownerId: "123456789",     // Your Telegram user ID (number as string)
 *     allowFrom: ["123456789"], // Allowed user IDs
 *     dmPolicy: "owner"         // "open" | "allowlist" | "owner" | "disabled"
 *   }
 */

import { ChannelAdapter, CHANNEL_STATUS, DM_POLICY } from "../channel-adapter.js";

const TAG = "[Channel:Telegram]";

export class TelegramChannel extends ChannelAdapter {
  constructor(config = {}) {
    super({
      channelId: "telegram",
      label: "Telegram",
      config: {
        dmPolicy: DM_POLICY.OWNER,
        ...config,
      },
    });
    this.bot = null;
    this.botInfo = null;
  }

  async start() {
    const token = this.config.token;
    if (!token) {
      this.setStatus(CHANNEL_STATUS.ERROR, "No Telegram bot token configured");
      throw new Error("Telegram bot token required. Get one from @BotFather.");
    }

    this.setStatus(CHANNEL_STATUS.CONNECTING);

    try {
      const { Bot } = await this._loadGrammy();

      this.bot = new Bot(token);

      // Handle all text messages
      this.bot.on("message:text", (ctx) => {
        const msg = {
          userId: String(ctx.from.id),
          displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || ctx.from.username || "Unknown",
          content: ctx.message.text,
          chatType: ctx.chat.type === "private" ? "dm" : "group",
          chatId: String(ctx.chat.id),
          replyTo: ctx.message.reply_to_message?.message_id ? String(ctx.message.reply_to_message.message_id) : null,
          metadata: {
            chatType: ctx.chat.type,
            username: ctx.from.username,
            messageId: ctx.message.message_id,
            language: ctx.from.language_code,
          },
        };
        this.emitMessage(msg);
      });

      // Handle photos with captions
      this.bot.on("message:photo", (ctx) => {
        const photo = ctx.message.photo?.at(-1); // Largest size
        this.emitMessage({
          userId: String(ctx.from.id),
          displayName: ctx.from.first_name || ctx.from.username || "Unknown",
          content: ctx.message.caption || "[Photo]",
          chatType: ctx.chat.type === "private" ? "dm" : "group",
          chatId: String(ctx.chat.id),
          media: photo ? { type: "image", fileId: photo.file_id } : null,
          metadata: { messageId: ctx.message.message_id },
        });
      });

      // Handle documents
      this.bot.on("message:document", (ctx) => {
        this.emitMessage({
          userId: String(ctx.from.id),
          displayName: ctx.from.first_name || ctx.from.username || "Unknown",
          content: ctx.message.caption || `[Document: ${ctx.message.document?.file_name || "file"}]`,
          chatType: ctx.chat.type === "private" ? "dm" : "group",
          chatId: String(ctx.chat.id),
          media: { type: "document", fileId: ctx.message.document?.file_id, fileName: ctx.message.document?.file_name },
          metadata: { messageId: ctx.message.message_id },
        });
      });

      // Handle voice messages
      this.bot.on("message:voice", (ctx) => {
        this.emitMessage({
          userId: String(ctx.from.id),
          displayName: ctx.from.first_name || ctx.from.username || "Unknown",
          content: "[Voice message]",
          chatType: ctx.chat.type === "private" ? "dm" : "group",
          chatId: String(ctx.chat.id),
          media: { type: "voice", fileId: ctx.message.voice?.file_id, duration: ctx.message.voice?.duration },
          metadata: { messageId: ctx.message.message_id },
        });
      });

      // Error handling
      this.bot.catch((err) => {
        console.error(`${TAG} Bot error:`, err.message);
        this.lastError = err.message;
      });

      // Start polling (non-blocking)
      this.bot.start({
        onStart: (info) => {
          this.botInfo = info;
          this.setStatus(CHANNEL_STATUS.CONNECTED);
          console.log(`${TAG} Connected as @${info.username} (${info.first_name})`);
        },
      });

      // grammY's start() is non-blocking in polling mode
      // The bot info is available after the first getMe call
      if (!this.botInfo) {
        try {
          this.botInfo = await this.bot.api.getMe();
          this.setStatus(CHANNEL_STATUS.CONNECTED);
          console.log(`${TAG} Connected as @${this.botInfo.username}`);
        } catch (err) {
          this.setStatus(CHANNEL_STATUS.ERROR, err.message);
          throw err;
        }
      }
    } catch (err) {
      this.setStatus(CHANNEL_STATUS.ERROR, err.message);
      throw err;
    }
  }

  async stop() {
    if (this.bot) {
      try {
        await this.bot.stop();
      } catch {}
      this.bot = null;
    }
    this.setStatus(CHANNEL_STATUS.DISCONNECTED);
  }

  async sendMessage(recipientId, content, opts = {}) {
    if (!this.bot) {
      return { success: false, error: "Telegram bot not started" };
    }

    try {
      const chatId = opts.chatId || recipientId;
      const result = await this.bot.api.sendMessage(chatId, content, {
        parse_mode: "HTML",
        reply_to_message_id: opts.replyTo ? Number(opts.replyTo) : undefined,
      });
      return { success: true, messageId: String(result.message_id) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  formatOutbound(text) {
    // Convert markdown to Telegram HTML
    return text
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")          // **bold** → <b>bold</b>
      .replace(/\*(.+?)\*/g, "<b>$1</b>")               // *bold* → <b>bold</b>
      .replace(/__(.+?)__/g, "<i>$1</i>")                // __italic__ → <i>italic</i>
      .replace(/_(.+?)_/g, "<i>$1</i>")                  // _italic_ → <i>italic</i>
      .replace(/~~(.+?)~~/g, "<s>$1</s>")                // ~~strike~~ → <s>strike</s>
      .replace(/`([^`]+)`/g, "<code>$1</code>")          // `code` → <code>code</code>
      .replace(/```[\s\S]*?\n([\s\S]*?)```/g, "<pre>$1</pre>"); // code blocks
  }

  get maxMessageLength() {
    return 4096;
  }

  // ── Private ───────────────────────────────────────────────────

  async _loadGrammy() {
    try {
      return await import("grammy");
    } catch (err) {
      if (err.code !== "ERR_MODULE_NOT_FOUND" && !err.message?.includes("Cannot find")) throw err;

      console.log(`${TAG} Installing grammy...`);
      const { execSync } = await import("child_process");
      execSync("npm install grammy --save", { stdio: "pipe", timeout: 60_000 });
      return await import("grammy");
    }
  }
}

export default TelegramChannel;
