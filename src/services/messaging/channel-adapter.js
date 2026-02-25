/**
 * Channel Adapter — Base class for all messaging channels
 *
 * OpenClaw-inspired pattern: every channel implements the same interface.
 * The ChannelRouter normalizes all messages into StandardMessage format
 * before they hit the AI brain.
 *
 * To add a new channel:
 *   1. Extend ChannelAdapter
 *   2. Implement start(), stop(), sendMessage(), formatOutbound()
 *   3. Call this.emitMessage() when an inbound message arrives
 *   4. Register with ChannelRouter via router.registerChannel(adapter)
 */

import { EventEmitter } from "events";

// ── Standard Message Format ─────────────────────────────────────
// Every channel adapter normalizes raw platform messages into this shape.

/**
 * @typedef {Object} StandardMessage
 * @property {string} id           - Unique message ID
 * @property {string} channelId    - Channel source ("whatsapp", "telegram", "discord", etc.)
 * @property {string} userId       - Sender identifier (phone number, username, etc.)
 * @property {string} displayName  - Human-readable sender name
 * @property {string} content      - Message body text
 * @property {number} timestamp    - Unix timestamp (ms)
 * @property {string} chatType     - "dm" | "group"
 * @property {string} [chatId]     - Group/channel ID (for group messages)
 * @property {string} [replyTo]    - ID of message being replied to
 * @property {Object} [media]      - { type, url, mimeType, caption }
 * @property {Object} [metadata]   - Platform-specific extras
 */

// ── DM Policy ───────────────────────────────────────────────────

export const DM_POLICY = {
  OPEN: "open",           // Accept from anyone
  ALLOWLIST: "allowlist",  // Only from allowFrom list
  OWNER: "owner",         // Only from the BACKBONE owner
  DISABLED: "disabled",   // Ignore all DMs
};

// ── Channel Status ──────────────────────────────────────────────

export const CHANNEL_STATUS = {
  IDLE: "idle",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  ERROR: "error",
  PAIRING: "pairing",     // Needs QR scan or token setup
};

// ── Base Adapter ────────────────────────────────────────────────

export class ChannelAdapter extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {string} opts.channelId   - e.g. "whatsapp", "telegram", "discord"
   * @param {string} opts.label       - Human label e.g. "WhatsApp"
   * @param {Object} [opts.config]    - Channel-specific config
   */
  constructor({ channelId, label, config = {} }) {
    super();
    this.channelId = channelId;
    this.label = label;
    this.config = config;
    this.status = CHANNEL_STATUS.IDLE;
    this.lastError = null;
    this.connectedAt = null;
    this.messageCount = { in: 0, out: 0 };
  }

  // ── Lifecycle (must override) ───────────────────────────────

  /** Connect to the platform and start listening for messages */
  async start() {
    throw new Error(`${this.channelId}: start() not implemented`);
  }

  /** Disconnect gracefully */
  async stop() {
    throw new Error(`${this.channelId}: stop() not implemented`);
  }

  // ── Messaging (must override) ───────────────────────────────

  /**
   * Send a message through this channel
   * @param {string} recipientId - Platform-specific recipient
   * @param {string} content     - Message text
   * @param {Object} [opts]      - { media, replyTo, ... }
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendMessage(recipientId, content, opts = {}) {
    throw new Error(`${this.channelId}: sendMessage() not implemented`);
  }

  // ── Formatting (override for platform-specific formatting) ──

  /**
   * Convert markdown/generic text to platform-specific format
   * Default: pass-through. Override for WhatsApp (*bold*), Telegram (HTML), etc.
   */
  formatOutbound(text) {
    return text;
  }

  /**
   * Max message length for this platform. Override per channel.
   */
  get maxMessageLength() {
    return 4096;
  }

  /**
   * Split a long message into platform-appropriate chunks
   */
  chunkMessage(text) {
    const max = this.maxMessageLength;
    if (text.length <= max) return [text];

    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= max) {
        chunks.push(remaining);
        break;
      }
      // Try to break at newline
      let breakAt = remaining.lastIndexOf("\n", max);
      if (breakAt < max * 0.3) breakAt = max; // No good break point
      chunks.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    return chunks;
  }

  // ── Access Control ──────────────────────────────────────────

  /**
   * Check if a message should be processed based on DM policy
   */
  shouldRespond(standardMessage) {
    const policy = this.config.dmPolicy || DM_POLICY.OWNER;

    if (policy === DM_POLICY.DISABLED) return false;
    if (policy === DM_POLICY.OPEN) return true;

    if (policy === DM_POLICY.ALLOWLIST) {
      const allowed = this.config.allowFrom || [];
      return allowed.includes(standardMessage.userId) || allowed.includes("*");
    }

    if (policy === DM_POLICY.OWNER) {
      const ownerId = this.config.ownerId;
      return ownerId && standardMessage.userId === ownerId;
    }

    return false;
  }

  // ── Helpers for subclasses ──────────────────────────────────

  /**
   * Call this from your adapter when an inbound message arrives.
   * This normalizes and emits it for the router.
   */
  emitMessage(standardMessage) {
    standardMessage.channelId = this.channelId;
    standardMessage.timestamp = standardMessage.timestamp || Date.now();
    standardMessage.id = standardMessage.id || `${this.channelId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.messageCount.in++;
    this.emit("message", standardMessage);
  }

  setStatus(status, error = null) {
    this.status = status;
    this.lastError = error;
    if (status === CHANNEL_STATUS.CONNECTED) {
      this.connectedAt = new Date().toISOString();
    }
    this.emit("status-change", { channelId: this.channelId, status, error });
  }

  getStatus() {
    return {
      channelId: this.channelId,
      label: this.label,
      status: this.status,
      lastError: this.lastError,
      connectedAt: this.connectedAt,
      messages: { ...this.messageCount },
    };
  }
}

export default ChannelAdapter;
