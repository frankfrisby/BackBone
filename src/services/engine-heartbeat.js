/**
 * Engine Heartbeat Tracker
 *
 * Tracks whether the autonomous engine is actually alive and working.
 * Writes a heartbeat every time work happens, plus periodic "alive" pings.
 *
 * Data stored in: data/engine-heartbeat.json
 *
 * Schema:
 * {
 *   lastBeat: ISO timestamp of last heartbeat,
 *   lastWork: ISO timestamp of last actual work completed,
 *   status: "running" | "stalled" | "paused" | "stopped",
 *   uptimeStarted: ISO timestamp of when engine started,
 *   hourlyLog: [ { hour: "2026-02-07T03:00:00", beats: 12, workItems: 3, errors: 1 } ],
 *   recentActions: [ { time: ISO, action: "string", duration: ms } ]  // last 20
 * }
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const HEARTBEAT_PATH = path.join(process.cwd(), "data", "engine-heartbeat.json");
const STALL_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes without a beat = stalled
const MAX_RECENT_ACTIONS = 30;
const MAX_HOURLY_LOG = 168; // 7 days of hourly data

let instance = null;

class EngineHeartbeat extends EventEmitter {
  constructor() {
    super();
    this.data = this._load();
    this.beatInterval = null;
    this.watchdogInterval = null;
  }

  _load() {
    try {
      if (fs.existsSync(HEARTBEAT_PATH)) {
        return JSON.parse(fs.readFileSync(HEARTBEAT_PATH, "utf-8"));
      }
    } catch {}
    return {
      lastBeat: null,
      lastWork: null,
      status: "stopped",
      uptimeStarted: null,
      hourlyLog: [],
      recentActions: [],
      totalBeats: 0,
      totalWork: 0,
      totalErrors: 0,
      restarts: 0
    };
  }

  _save() {
    try {
      fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify(this.data, null, 2));
    } catch {}
  }

  /**
   * Start heartbeat tracking — call when engine starts
   */
  start() {
    this.data.status = "running";
    this.data.uptimeStarted = new Date().toISOString();
    this.data.lastBeat = new Date().toISOString();
    this._save();

    // Periodic alive ping every 60 seconds
    this.beatInterval = setInterval(() => {
      this.beat("alive-ping");
    }, 60_000);

    // Watchdog checks every 2 minutes if engine is stalled
    this.watchdogInterval = setInterval(() => {
      this._checkStall();
    }, 2 * 60_000);

    console.log("[Heartbeat] Engine heartbeat started");
  }

  /**
   * Stop heartbeat tracking
   */
  stop() {
    this.data.status = "stopped";
    this.data.lastBeat = new Date().toISOString();
    this._save();

    if (this.beatInterval) clearInterval(this.beatInterval);
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    this.beatInterval = null;
    this.watchdogInterval = null;
  }

  /**
   * Record a heartbeat — call this frequently to show the engine is alive
   */
  beat(action = "heartbeat") {
    const now = new Date();
    this.data.lastBeat = now.toISOString();
    this.data.totalBeats++;
    this._incrementHourly("beats");

    if (this.data.status === "stalled") {
      this.data.status = "running";
      console.log("[Heartbeat] Engine recovered from stall");
      this.emit("recovered");
    }

    this._save();
  }

  /**
   * Record actual work being done — call when a goal/task completes
   */
  recordWork(action, durationMs = 0) {
    const now = new Date();
    this.data.lastWork = now.toISOString();
    this.data.lastBeat = now.toISOString();
    this.data.totalWork++;
    this._incrementHourly("workItems");

    // Add to recent actions (keep last N)
    this.data.recentActions.unshift({
      time: now.toISOString(),
      action: (action || "work").slice(0, 100),
      duration: durationMs
    });
    if (this.data.recentActions.length > MAX_RECENT_ACTIONS) {
      this.data.recentActions = this.data.recentActions.slice(0, MAX_RECENT_ACTIONS);
    }

    this._save();
  }

  /**
   * Record an error
   */
  recordError(error) {
    this.data.totalErrors++;
    this._incrementHourly("errors");
    this.data.lastBeat = new Date().toISOString();

    this.data.recentActions.unshift({
      time: new Date().toISOString(),
      action: `ERROR: ${(error || "unknown").slice(0, 80)}`,
      duration: 0
    });
    if (this.data.recentActions.length > MAX_RECENT_ACTIONS) {
      this.data.recentActions = this.data.recentActions.slice(0, MAX_RECENT_ACTIONS);
    }

    this._save();
  }

  /**
   * Record a restart
   */
  recordRestart(reason) {
    this.data.restarts++;
    this.data.status = "running";
    this.data.lastBeat = new Date().toISOString();

    this.data.recentActions.unshift({
      time: new Date().toISOString(),
      action: `RESTART: ${(reason || "watchdog").slice(0, 80)}`,
      duration: 0
    });
    if (this.data.recentActions.length > MAX_RECENT_ACTIONS) {
      this.data.recentActions = this.data.recentActions.slice(0, MAX_RECENT_ACTIONS);
    }

    this._save();
  }

  /**
   * Mark engine as paused
   */
  pause() {
    this.data.status = "paused";
    this.data.lastBeat = new Date().toISOString();
    this._save();
  }

  /**
   * Get current health status
   */
  getStatus() {
    const now = Date.now();
    const lastBeat = this.data.lastBeat ? new Date(this.data.lastBeat).getTime() : 0;
    const lastWork = this.data.lastWork ? new Date(this.data.lastWork).getTime() : 0;
    const sinceLastBeat = lastBeat ? now - lastBeat : Infinity;
    const sinceLastWork = lastWork ? now - lastWork : Infinity;

    const isStalled = this.data.status === "running" && sinceLastBeat > STALL_THRESHOLD_MS;

    // Get last 24 hours of hourly data
    const last24h = this.data.hourlyLog.slice(-24);
    const hoursWithWork = last24h.filter(h => h.workItems > 0).length;
    const totalWorkLast24h = last24h.reduce((sum, h) => sum + (h.workItems || 0), 0);

    return {
      status: isStalled ? "stalled" : this.data.status,
      lastBeat: this.data.lastBeat,
      lastWork: this.data.lastWork,
      sinceLastBeatMin: Math.round(sinceLastBeat / 60000),
      sinceLastWorkMin: Math.round(sinceLastWork / 60000),
      uptimeStarted: this.data.uptimeStarted,
      uptimeMin: this.data.uptimeStarted
        ? Math.round((now - new Date(this.data.uptimeStarted).getTime()) / 60000)
        : 0,
      totalBeats: this.data.totalBeats,
      totalWork: this.data.totalWork,
      totalErrors: this.data.totalErrors,
      restarts: this.data.restarts,
      hoursWithWork24h: hoursWithWork,
      totalWorkLast24h,
      recentActions: this.data.recentActions.slice(0, 10),
      hourlyLog: last24h
    };
  }

  /**
   * Check if engine is stalled and emit event
   */
  _checkStall() {
    if (this.data.status !== "running") return;

    const lastBeat = this.data.lastBeat ? new Date(this.data.lastBeat).getTime() : 0;
    const sinceLastBeat = Date.now() - lastBeat;

    if (sinceLastBeat > STALL_THRESHOLD_MS) {
      this.data.status = "stalled";
      this._save();
      console.log(`[Heartbeat] ENGINE STALLED — no heartbeat for ${Math.round(sinceLastBeat / 60000)} minutes`);
      this.emit("stalled", {
        sinceLastBeatMin: Math.round(sinceLastBeat / 60000),
        lastBeat: this.data.lastBeat
      });
    }
  }

  /**
   * Increment hourly counter
   */
  _incrementHourly(field) {
    const hourKey = new Date().toISOString().slice(0, 13) + ":00:00";
    let current = this.data.hourlyLog[this.data.hourlyLog.length - 1];

    if (!current || current.hour !== hourKey) {
      current = { hour: hourKey, beats: 0, workItems: 0, errors: 0 };
      this.data.hourlyLog.push(current);

      // Trim to max size
      if (this.data.hourlyLog.length > MAX_HOURLY_LOG) {
        this.data.hourlyLog = this.data.hourlyLog.slice(-MAX_HOURLY_LOG);
      }
    }

    current[field] = (current[field] || 0) + 1;
  }
}

export const getEngineHeartbeat = () => {
  if (!instance) {
    instance = new EngineHeartbeat();
  }
  return instance;
};

export default EngineHeartbeat;
