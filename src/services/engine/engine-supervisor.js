/**
 * Engine Supervisor
 *
 * Ensures the autonomous engine runs continuously across sessions.
 * Tracks uptime, detects gaps, auto-restarts on stall, and provides
 * status data for the header UI.
 *
 * Persists state to: data/engine-supervisor.json
 *
 * Key responsibilities:
 * 1. Persist "shouldBeRunning" flag — survives app restarts
 * 2. Track session continuity — detect gaps between sessions
 * 3. Auto-restart on stall — listen to heartbeat events
 * 4. Provide UI status — uptime, last action, gap alerts
 * 5. Continuity log — prove the engine has been running for days
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { getEngineHeartbeat } from "./engine-heartbeat.js";

import { dataFile } from "../paths.js";
const SUPERVISOR_PATH = dataFile("engine-supervisor.json");
const MAX_CONTINUITY_LOG = 500; // Keep last 500 entries
const GAP_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes = gap detected

let instance = null;

class EngineSupervisor extends EventEmitter {
  constructor() {
    super();
    this.data = this._load();
    this.statusInterval = null;
    this.startedAt = null;
    this.engineRef = null; // Reference to autonomous engine
  }

  _load() {
    try {
      if (fs.existsSync(SUPERVISOR_PATH)) {
        return JSON.parse(fs.readFileSync(SUPERVISOR_PATH, "utf-8"));
      }
    } catch {}
    return {
      shouldBeRunning: true,
      firstStarted: null,
      lastSessionStart: null,
      lastSessionEnd: null,
      lastHeartbeat: null,
      totalSessions: 0,
      totalRestarts: 0,
      totalGapsDetected: 0,
      longestUptimeMs: 0,
      currentUptimeStarted: null,
      continuityLog: []
    };
  }

  _save() {
    try {
      const dir = path.dirname(SUPERVISOR_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(SUPERVISOR_PATH, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error("[Supervisor] Save failed:", e.message);
    }
  }

  _log(type, message, details = {}) {
    const entry = {
      time: new Date().toISOString(),
      type,
      message,
      ...details
    };

    this.data.continuityLog.unshift(entry);
    if (this.data.continuityLog.length > MAX_CONTINUITY_LOG) {
      this.data.continuityLog = this.data.continuityLog.slice(0, MAX_CONTINUITY_LOG);
    }
  }

  /**
   * Start supervising — called on app boot
   */
  start(engineRef) {
    this.engineRef = engineRef;
    this.startedAt = Date.now();
    const now = new Date().toISOString();

    // Check for gap since last session
    if (this.data.lastSessionEnd) {
      const lastEnd = new Date(this.data.lastSessionEnd).getTime();
      const gapMs = Date.now() - lastEnd;

      if (gapMs > GAP_THRESHOLD_MS) {
        const gapMin = Math.round(gapMs / 60000);
        const gapHours = Math.round(gapMs / 3600000 * 10) / 10;
        this.data.totalGapsDetected++;
        this._log("gap", `Gap detected: ${gapHours}h since last session`, {
          gapMs,
          gapMinutes: gapMin,
          lastSessionEnd: this.data.lastSessionEnd
        });
        console.log(`[Supervisor] Gap detected: ${gapHours}h since last session end`);
        this.emit("gap-detected", { gapMs, gapMinutes: gapMin });
      } else {
        this._log("resume", "Session resumed (no significant gap)", {
          gapMs,
          lastSessionEnd: this.data.lastSessionEnd
        });
      }
    }

    // Record session start
    if (!this.data.firstStarted) {
      this.data.firstStarted = now;
    }
    this.data.lastSessionStart = now;
    this.data.currentUptimeStarted = now;
    this.data.totalSessions++;
    this.data.shouldBeRunning = true;
    this._log("session-start", `Session #${this.data.totalSessions} started`);
    this._save();

    // Connect to heartbeat for stall detection
    const heartbeat = getEngineHeartbeat();
    heartbeat.on("stalled", (info) => {
      this._handleStall(info);
    });

    // Periodic status update (every 60s) to keep lastHeartbeat fresh
    this.statusInterval = setInterval(() => {
      this.data.lastHeartbeat = new Date().toISOString();
      this._updateUptime();
      this._save();
    }, 60_000);

    console.log(`[Supervisor] Started — session #${this.data.totalSessions}`);
    this.emit("started");
  }

  /**
   * Handle engine stall — auto-restart
   */
  _handleStall(info) {
    console.log(`[Supervisor] Engine stalled (${info.sinceLastBeatMin}min). Auto-restarting...`);
    this.data.totalRestarts++;
    this._log("stall-restart", `Auto-restart after ${info.sinceLastBeatMin}min stall`, {
      sinceLastBeatMin: info.sinceLastBeatMin
    });
    this._save();
    this.emit("restarting", info);

    // The autonomous-engine.js already handles restart via its own stall listener
    // We just log and track it here. If the engine's own restart fails,
    // the heartbeat will detect another stall and we'll log again.
  }

  /**
   * Update longest uptime tracking
   */
  _updateUptime() {
    if (!this.data.currentUptimeStarted) return;
    const uptimeMs = Date.now() - new Date(this.data.currentUptimeStarted).getTime();
    if (uptimeMs > this.data.longestUptimeMs) {
      this.data.longestUptimeMs = uptimeMs;
    }
  }

  /**
   * Stop supervising — called on app shutdown
   */
  stop() {
    const now = new Date().toISOString();
    this.data.lastSessionEnd = now;
    this.data.lastHeartbeat = now;
    this._updateUptime();
    this._log("session-end", `Session ended`);
    this._save();

    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }

    console.log("[Supervisor] Stopped");
  }

  /**
   * Get status for UI header display
   */
  getHeaderStatus() {
    const heartbeat = getEngineHeartbeat();
    const hbStatus = heartbeat.getStatus();
    const now = Date.now();

    // Calculate current uptime
    let uptimeMs = 0;
    if (this.data.currentUptimeStarted) {
      uptimeMs = now - new Date(this.data.currentUptimeStarted).getTime();
    }

    // Format uptime as human-readable
    const uptimeStr = this._formatDuration(uptimeMs);

    // Get last action from heartbeat
    const lastAction = hbStatus.recentActions?.[0];
    const lastActionStr = lastAction
      ? lastAction.action.replace(/^(alive-ping|heartbeat|continuous-check|loop-iteration)$/, "").trim()
      : "";

    // Check if engine is in rest mode
    let restStatus = null;
    if (this.engineRef && typeof this.engineRef.getRestStatus === "function") {
      restStatus = this.engineRef.getRestStatus();
    }

    // Determine status
    let status = "stopped";
    let color = "#ef4444"; // red

    if (restStatus?.resting) {
      status = "resting";
      color = "#3b82f6"; // blue
    } else if (hbStatus.status === "running") {
      status = "running";
      color = "#22c55e"; // green
    } else if (hbStatus.status === "stalled") {
      status = "stalled";
      color = "#f59e0b"; // amber
    } else if (hbStatus.status === "paused") {
      status = "paused";
      color = "#64748b"; // gray
    }

    // Total uptime since first start
    let totalUptimeStr = "";
    if (this.data.firstStarted) {
      const totalMs = now - new Date(this.data.firstStarted).getTime();
      totalUptimeStr = this._formatDuration(totalMs);
    }

    return {
      status,
      color,
      uptimeMs,
      uptimeStr,
      totalUptimeStr,
      totalSessions: this.data.totalSessions,
      totalRestarts: this.data.totalRestarts,
      totalGapsDetected: this.data.totalGapsDetected,
      lastAction: lastActionStr || null,
      sinceLastBeatMin: hbStatus.sinceLastBeatMin,
      hoursWithWork24h: hbStatus.hoursWithWork24h,
      totalWorkLast24h: hbStatus.totalWorkLast24h,
      restStatus
    };
  }

  /**
   * Format milliseconds as human-readable duration
   */
  _formatDuration(ms) {
    if (!ms || ms <= 0) return "0m";

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remH = hours % 24;
      return `${days}d${remH}h`;
    }
    if (hours > 0) {
      const remM = minutes % 60;
      return `${hours}h${remM}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Get full status (for diagnostics / API)
   */
  getFullStatus() {
    return {
      ...this.getHeaderStatus(),
      shouldBeRunning: this.data.shouldBeRunning,
      firstStarted: this.data.firstStarted,
      lastSessionStart: this.data.lastSessionStart,
      lastSessionEnd: this.data.lastSessionEnd,
      longestUptimeMs: this.data.longestUptimeMs,
      longestUptimeStr: this._formatDuration(this.data.longestUptimeMs),
      recentLog: this.data.continuityLog.slice(0, 20)
    };
  }

  /**
   * Get continuity proof — summary of how long engine has been running
   */
  getContinuityProof() {
    const now = Date.now();
    const firstStart = this.data.firstStarted ? new Date(this.data.firstStarted).getTime() : now;
    const totalLifetimeMs = now - firstStart;

    // Count time covered by sessions (approximate from continuity log)
    const sessions = this.data.continuityLog.filter(e => e.type === "session-start").length;
    const gaps = this.data.continuityLog.filter(e => e.type === "gap");
    const totalGapMs = gaps.reduce((sum, g) => sum + (g.gapMs || 0), 0);
    const coveredMs = totalLifetimeMs - totalGapMs;
    const coveragePct = totalLifetimeMs > 0 ? Math.round((coveredMs / totalLifetimeMs) * 100) : 0;

    return {
      firstStarted: this.data.firstStarted,
      totalLifetime: this._formatDuration(totalLifetimeMs),
      totalSessions: this.data.totalSessions,
      totalGaps: this.data.totalGapsDetected,
      totalRestarts: this.data.totalRestarts,
      coveragePercent: coveragePct,
      longestUptime: this._formatDuration(this.data.longestUptimeMs)
    };
  }
}

export const getEngineSupervisor = () => {
  if (!instance) {
    instance = new EngineSupervisor();
  }
  return instance;
};

export default EngineSupervisor;
