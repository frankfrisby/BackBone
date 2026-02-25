/**
 * Channel Router — Central message hub (OpenClaw-inspired)
 *
 * All channel adapters register here. Inbound messages from any channel
 * flow through a single pipeline:
 *
 *   Channel Adapter → normalize → access check → AI brain → format → reply
 *
 * The router owns:
 *   - Channel lifecycle (start/stop all)
 *   - Inbound message dispatch to AI
 *   - Outbound message routing (reply via originating channel, or broadcast)
 *   - Session tracking per channel+user
 *   - Health monitoring
 */

import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { getDataDir } from "../paths.js";
import { CHANNEL_STATUS, DM_POLICY } from "./channel-adapter.js";

const TAG = "[ChannelRouter]";
const CONFIG_FILE = path.join(getDataDir(), "channel-router.json");

export class ChannelRouter extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, import('./channel-adapter.js').ChannelAdapter>} */
    this.channels = new Map();
    /** @type {Function|null} - async (standardMessage) => string */
    this.aiHandler = null;
    this.started = false;
    this.config = this._loadConfig();
  }

  // ── Configuration ─────────────────────────────────────────────

  _loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      }
    } catch {}
    return {
      enabledChannels: ["whatsapp"],
      channelPriority: ["whatsapp", "telegram", "discord", "slack", "sms", "email"],
      defaultChannel: "whatsapp",
    };
  }

  _saveConfig() {
    try {
      const dir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error(`${TAG} Failed to save config:`, err.message);
    }
  }

  // ── Channel Registration ──────────────────────────────────────

  /**
   * Register a channel adapter
   * @param {import('./channel-adapter.js').ChannelAdapter} adapter
   */
  registerChannel(adapter) {
    const id = adapter.channelId;
    if (this.channels.has(id)) {
      console.warn(`${TAG} Channel '${id}' already registered, replacing`);
      this.channels.get(id).removeAllListeners();
    }
    this.channels.set(id, adapter);

    // Wire inbound messages
    adapter.on("message", (msg) => this._onMessage(msg));

    // Wire status changes
    adapter.on("status-change", (status) => {
      this.emit("channel-status", status);
      console.log(`${TAG} ${status.channelId}: ${status.status}${status.error ? ` (${status.error})` : ""}`);
    });

    console.log(`${TAG} Registered channel: ${adapter.label} (${id})`);
  }

  /**
   * Set the AI handler that processes inbound messages
   * @param {Function} handler - async (standardMessage) => { content: string, ... }
   */
  setAIHandler(handler) {
    this.aiHandler = handler;
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  /**
   * Start all enabled channels
   */
  async startAll() {
    const enabled = this.config.enabledChannels || [];
    const results = {};

    for (const [id, adapter] of this.channels) {
      if (!enabled.includes(id)) {
        console.log(`${TAG} Skipping disabled channel: ${id}`);
        results[id] = { started: false, reason: "disabled" };
        continue;
      }

      try {
        await adapter.start();
        results[id] = { started: true, status: adapter.status };
        console.log(`${TAG} Started: ${adapter.label}`);
      } catch (err) {
        results[id] = { started: false, error: err.message };
        console.error(`${TAG} Failed to start ${id}:`, err.message);
      }
    }

    this.started = true;
    this.emit("started", results);
    return results;
  }

  /**
   * Stop all channels
   */
  async stopAll() {
    for (const [id, adapter] of this.channels) {
      try {
        await adapter.stop();
      } catch (err) {
        console.error(`${TAG} Error stopping ${id}:`, err.message);
      }
    }
    this.started = false;
    this.emit("stopped");
  }

  /**
   * Restart a specific channel
   */
  async restartChannel(channelId) {
    const adapter = this.channels.get(channelId);
    if (!adapter) return { success: false, error: `Unknown channel: ${channelId}` };

    try {
      await adapter.stop();
      await adapter.start();
      return { success: true, status: adapter.status };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── Inbound Message Pipeline ──────────────────────────────────

  async _onMessage(msg) {
    const adapter = this.channels.get(msg.channelId);

    // Access control
    if (adapter && !adapter.shouldRespond(msg)) {
      console.log(`${TAG} Blocked by DM policy: ${msg.channelId}/${msg.userId}`);
      return;
    }

    // Emit for external listeners (unified message log, dashboard, etc.)
    this.emit("message-received", msg);

    // Route to AI handler
    if (!this.aiHandler) {
      console.warn(`${TAG} No AI handler set, message dropped from ${msg.channelId}`);
      return;
    }

    try {
      this.emit("processing", { channelId: msg.channelId, userId: msg.userId });

      const response = await this.aiHandler(msg);

      if (response && response.content) {
        // Reply via the same channel the message came from
        await this.sendMessage(msg.channelId, msg.userId, response.content, {
          replyTo: msg.id,
          chatId: msg.chatId,
        });
      }

      this.emit("processed", { channelId: msg.channelId, userId: msg.userId, response });
    } catch (err) {
      console.error(`${TAG} AI handler error (${msg.channelId}):`, err.message);
      this.emit("error", { channelId: msg.channelId, error: err.message });
    }
  }

  // ── Outbound Messaging ────────────────────────────────────────

  /**
   * Send a message via a specific channel
   */
  async sendMessage(channelId, recipientId, content, opts = {}) {
    const adapter = this.channels.get(channelId);
    if (!adapter) {
      return { success: false, error: `Channel '${channelId}' not registered` };
    }

    if (adapter.status !== CHANNEL_STATUS.CONNECTED) {
      // Try fallback channel
      const fallback = this._getFallbackChannel(channelId);
      if (fallback) {
        console.log(`${TAG} ${channelId} not connected, falling back to ${fallback.channelId}`);
        return this.sendMessage(fallback.channelId, recipientId, content, opts);
      }
      return { success: false, error: `Channel '${channelId}' not connected (${adapter.status})` };
    }

    // Format for the target platform
    const formatted = adapter.formatOutbound(content);

    // Chunk if needed
    const chunks = adapter.chunkMessage(formatted);

    const results = [];
    for (const chunk of chunks) {
      const result = await adapter.sendMessage(recipientId, chunk, opts);
      results.push(result);
      adapter.messageCount.out++;
      if (!result.success) break;
    }

    const allOk = results.every((r) => r.success);
    if (allOk) {
      this.emit("message-sent", { channelId, recipientId, chunks: results.length });
    }

    return { success: allOk, results };
  }

  /**
   * Broadcast a message to all connected channels (e.g. alerts)
   */
  async broadcast(content, opts = {}) {
    const results = {};
    for (const [id, adapter] of this.channels) {
      if (adapter.status !== CHANNEL_STATUS.CONNECTED) continue;
      const recipientId = adapter.config.ownerId || adapter.config.defaultRecipient;
      if (!recipientId) continue;
      results[id] = await this.sendMessage(id, recipientId, content, opts);
    }
    return results;
  }

  /**
   * Send via the best available channel (priority order)
   */
  async sendBestChannel(recipientId, content, opts = {}) {
    const priority = this.config.channelPriority || [];
    for (const channelId of priority) {
      const adapter = this.channels.get(channelId);
      if (adapter && adapter.status === CHANNEL_STATUS.CONNECTED) {
        return this.sendMessage(channelId, recipientId, content, opts);
      }
    }
    return { success: false, error: "No connected channels available" };
  }

  // ── Status & Health ───────────────────────────────────────────

  getStatus() {
    const channels = {};
    for (const [id, adapter] of this.channels) {
      channels[id] = adapter.getStatus();
    }
    return {
      started: this.started,
      channelCount: this.channels.size,
      connectedCount: [...this.channels.values()].filter((a) => a.status === CHANNEL_STATUS.CONNECTED).length,
      channels,
      config: this.config,
    };
  }

  getChannel(channelId) {
    return this.channels.get(channelId);
  }

  listChannels() {
    return [...this.channels.entries()].map(([id, adapter]) => ({
      id,
      label: adapter.label,
      status: adapter.status,
      enabled: (this.config.enabledChannels || []).includes(id),
    }));
  }

  enableChannel(channelId) {
    if (!this.config.enabledChannels) this.config.enabledChannels = [];
    if (!this.config.enabledChannels.includes(channelId)) {
      this.config.enabledChannels.push(channelId);
      this._saveConfig();
    }
  }

  disableChannel(channelId) {
    this.config.enabledChannels = (this.config.enabledChannels || []).filter((c) => c !== channelId);
    this._saveConfig();
    const adapter = this.channels.get(channelId);
    if (adapter) adapter.stop().catch(() => {});
  }

  // ── Private ───────────────────────────────────────────────────

  _getFallbackChannel(excludeId) {
    const priority = this.config.channelPriority || [];
    for (const id of priority) {
      if (id === excludeId) continue;
      const adapter = this.channels.get(id);
      if (adapter && adapter.status === CHANNEL_STATUS.CONNECTED) return adapter;
    }
    return null;
  }
}

// ── Singleton ───────────────────────────────────────────────────

let _instance = null;

export function getChannelRouter() {
  if (!_instance) _instance = new ChannelRouter();
  return _instance;
}

export default ChannelRouter;
