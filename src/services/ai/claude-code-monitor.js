/**
 * Claude Code Connection Monitor
 *
 * Monitors Claude Code CLI connection status and sends notifications
 * when connection is lost. Shows status in header.
 */

import { EventEmitter } from "events";
import { getClaudeCodeStatus } from "./claude-code-cli.js";
import { hasValidCredentials as hasCodexCredentials } from "./codex-oauth.js";
import { getWhatsAppService } from "../messaging/whatsapp-service.js";
import fs from "fs";
import path from "path";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
const MONITOR_STATE_PATH = path.join(DATA_DIR, "claude-code-monitor-state.json");

// Check interval (every 30 seconds)
const CHECK_INTERVAL_MS = 30_000;

// Don't spam notifications - minimum 5 minutes between notifications
const NOTIFICATION_COOLDOWN_MS = 5 * 60_000;

class ClaudeCodeMonitor extends EventEmitter {
  constructor() {
    super();
    this.isConnected = false;
    this.wasConnected = false;
    this.lastStatus = null;
    this.lastNotificationTime = 0;
    this.checkInterval = null;
    this.statusMessage = null;
    this.state = this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(MONITOR_STATE_PATH)) {
        return JSON.parse(fs.readFileSync(MONITOR_STATE_PATH, "utf-8"));
      }
    } catch (err) {
      console.error("[ClaudeCodeMonitor] Failed to load state:", err.message);
    }
    return {
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      disconnectionCount: 0,
      notificationsSent: 0
    };
  }

  saveState() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(MONITOR_STATE_PATH, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error("[ClaudeCodeMonitor] Failed to save state:", err.message);
    }
  }

  /**
   * Start monitoring Claude Code connection
   */
  async start() {
    console.log("[ClaudeCodeMonitor] Starting connection monitor...");

    // Check immediately
    await this.checkConnection();

    // Set up periodic checks
    this.checkInterval = setInterval(() => {
      this.checkConnection();
    }, CHECK_INTERVAL_MS);

    this.emit("started");
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.emit("stopped");
  }

  /**
   * Check Claude Code connection status
   */
  async checkConnection() {
    try {
      const status = await getClaudeCodeStatus();
      const codexAvailable = !!hasCodexCredentials();
      this.lastStatus = status;

      const wasConnected = this.isConnected;
      this.isConnected = status.ready;

      // Track connection state changes
      if (this.isConnected && !wasConnected) {
        // Just connected
        this.wasConnected = true;
        this.state.lastConnectedAt = new Date().toISOString();
        this.statusMessage = null;
        this.saveState();
        console.log("[ClaudeCodeMonitor] Claude Code connected");
        this.emit("connected", status);
      } else if (!this.isConnected && wasConnected) {
        // Just disconnected - was connected, now not
        this.state.lastDisconnectedAt = new Date().toISOString();
        this.state.disconnectionCount++;
        this.saveState();
        console.log("[ClaudeCodeMonitor] Claude Code disconnected!");

        // Set status message for header
        this.statusMessage = "⚠️ Claude Code disconnected - run 'claude' to reconnect";

        // Send notification if cooldown has passed
        await this.sendDisconnectionNotification();

        this.emit("disconnected", status);
      } else if (!this.isConnected && this.wasConnected) {
        // Still disconnected after having been connected before
        this.statusMessage = "⚠️ Claude Code disconnected - run 'claude' to reconnect";
      } else if (!this.isConnected && !this.wasConnected) {
        // Never been connected
        if (!status.installed) {
          this.statusMessage = codexAvailable
            ? "Claude Code CLI not installed (Codex CLI fallback available)"
            : "Claude Code CLI not installed";
        } else if (!status.loggedIn) {
          this.statusMessage = codexAvailable
            ? "Claude Code not logged in - Codex CLI fallback available"
            : "Claude Code not logged in - run 'claude' to connect";
        }
      }

      this.emit("status-checked", {
        isConnected: this.isConnected,
        wasConnected: this.wasConnected,
        status,
        statusMessage: this.statusMessage
      });

    } catch (err) {
      console.error("[ClaudeCodeMonitor] Check failed:", err.message);
      this.emit("error", err);
    }
  }

  /**
   * Send WhatsApp notification about disconnection
   */
  async sendDisconnectionNotification() {
    const now = Date.now();

    // Check cooldown
    if (now - this.lastNotificationTime < NOTIFICATION_COOLDOWN_MS) {
      console.log("[ClaudeCodeMonitor] Notification cooldown active, skipping");
      return;
    }

    try {
      const whatsapp = getWhatsAppService();

      if (!whatsapp || !whatsapp.initialized) {
        console.log("[ClaudeCodeMonitor] WhatsApp not available for notification");
        return;
      }

      // Get user's phone number from settings
      const userSettingsPath = path.join(DATA_DIR, "user-settings.json");
      let userPhone = null;

      if (fs.existsSync(userSettingsPath)) {
        const settings = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
        userPhone = settings.phoneNumber || settings.phone;
      }

      if (!userPhone) {
        console.log("[ClaudeCodeMonitor] No user phone number configured for notifications");
        return;
      }

      const message = `🔌 BACKBONE Alert: Claude Code CLI has disconnected. Your AI assistant is paused until you reconnect.\n\nTo reconnect:\n1. Open terminal\n2. Run: claude\n3. Complete authentication\n\nTime: ${new Date().toLocaleString()}`;

      const result = await whatsapp.sendTextMessage(userPhone, message);

      if (result.success) {
        this.lastNotificationTime = now;
        this.state.notificationsSent++;
        this.saveState();
        console.log("[ClaudeCodeMonitor] Disconnection notification sent via WhatsApp");
      } else {
        console.error("[ClaudeCodeMonitor] Failed to send notification:", result.error);
      }

    } catch (err) {
      console.error("[ClaudeCodeMonitor] Notification error:", err.message);
    }
  }

  /**
   * Get current status for display
   */
  getDisplayStatus() {
    return {
      isConnected: this.isConnected,
      wasConnected: this.wasConnected,
      statusMessage: this.statusMessage,
      lastStatus: this.lastStatus,
      stats: {
        lastConnectedAt: this.state.lastConnectedAt,
        lastDisconnectedAt: this.state.lastDisconnectedAt,
        disconnectionCount: this.state.disconnectionCount,
        notificationsSent: this.state.notificationsSent
      }
    };
  }

  /**
   * Force check now
   */
  async forceCheck() {
    return await this.checkConnection();
  }
}

// Singleton
let instance = null;

export const getClaudeCodeMonitor = () => {
  if (!instance) {
    instance = new ClaudeCodeMonitor();
  }
  return instance;
};

export default ClaudeCodeMonitor;
