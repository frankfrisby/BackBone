import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

/**
 * Work Log Service for BACKBONE
 * Tracks all system activity with timestamps
 * Replaces mock life-feed with real activity logging
 */

const DATA_DIR = path.join(process.cwd(), "data");
const WORK_LOG_PATH = path.join(DATA_DIR, "work-log.json");

// Log entry types
export const LOG_TYPE = {
  CONNECTION: "connection",
  ACTION: "action",
  RESULT: "result",
  ERROR: "error",
  MILESTONE: "milestone",
  SYSTEM: "system",
  USER: "user",
  AI: "ai"
};

// Log sources
export const LOG_SOURCE = {
  ALPACA: "alpaca",
  LINKEDIN: "linkedin",
  OURA: "oura",
  YAHOO: "yahoo",
  CLAUDE: "claude",
  CLAUDE_CODE: "claude-code",
  SYSTEM: "system",
  USER: "user",
  AUTONOMOUS: "autonomous",
  GOAL: "goal"
};

// Log status
export const LOG_STATUS = {
  SUCCESS: "success",
  PENDING: "pending",
  ERROR: "error",
  INFO: "info"
};

// Status colors for display
export const STATUS_COLORS = {
  [LOG_STATUS.SUCCESS]: "#22c55e",
  [LOG_STATUS.PENDING]: "#eab308",
  [LOG_STATUS.ERROR]: "#ef4444",
  [LOG_STATUS.INFO]: "#3b82f6"
};

// Status icons
export const STATUS_ICONS = {
  [LOG_STATUS.SUCCESS]: "\u25CF", // Filled circle
  [LOG_STATUS.PENDING]: "\u25CB", // Empty circle
  [LOG_STATUS.ERROR]: "\u25D8", // Inverse bullet
  [LOG_STATUS.INFO]: "\u25C6"   // Diamond
};

// Source colors
export const SOURCE_COLORS = {
  [LOG_SOURCE.ALPACA]: "#22c55e",
  [LOG_SOURCE.LINKEDIN]: "#0077b5",
  [LOG_SOURCE.OURA]: "#8b5cf6",
  [LOG_SOURCE.YAHOO]: "#7c3aed",
  [LOG_SOURCE.CLAUDE]: "#d97706",
  [LOG_SOURCE.CLAUDE_CODE]: "#f59e0b",
  [LOG_SOURCE.SYSTEM]: "#64748b",
  [LOG_SOURCE.USER]: "#3b82f6",
  [LOG_SOURCE.AUTONOMOUS]: "#10b981",
  [LOG_SOURCE.GOAL]: "#ec4899"
};

/**
 * Create a work log entry
 */
export const createLogEntry = ({
  type,
  source,
  title,
  details = "",
  status = LOG_STATUS.SUCCESS,
  data = null
}) => ({
  id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  timestamp: new Date().toISOString(),
  type,
  source,
  title,
  details,
  status,
  data
});

/**
 * Format timestamp for display
 */
export const formatTime = (isoString) => {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
};

/**
 * Work Log Service Class
 */
export class WorkLog extends EventEmitter {
  constructor(maxEntries = 100) {
    super();
    this.entries = [];
    this.maxEntries = maxEntries;
    this.load();
  }

  /**
   * Load log from disk
   */
  load() {
    try {
      if (fs.existsSync(WORK_LOG_PATH)) {
        const data = JSON.parse(fs.readFileSync(WORK_LOG_PATH, "utf-8"));
        this.entries = data.entries || [];
      }
    } catch (error) {
      console.error("Failed to load work log:", error.message);
      this.entries = [];
    }
  }

  /**
   * Save log to disk
   */
  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(WORK_LOG_PATH, JSON.stringify({
        entries: this.entries,
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (error) {
      console.error("Failed to save work log:", error.message);
    }
  }

  /**
   * Add a log entry
   */
  log(entry) {
    const logEntry = createLogEntry(entry);
    this.entries.unshift(logEntry);

    // Trim to max
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }

    this.save();
    this.emit("entry", logEntry);
    return logEntry;
  }

  /**
   * Log a connection event
   */
  logConnection(source, title, details = "", status = LOG_STATUS.SUCCESS) {
    return this.log({
      type: LOG_TYPE.CONNECTION,
      source,
      title,
      details,
      status
    });
  }

  /**
   * Log an action event
   */
  logAction(source, title, details = "", status = LOG_STATUS.PENDING) {
    return this.log({
      type: LOG_TYPE.ACTION,
      source,
      title,
      details,
      status
    });
  }

  /**
   * Log a result event
   */
  logResult(source, title, details = "", status = LOG_STATUS.SUCCESS, data = null) {
    return this.log({
      type: LOG_TYPE.RESULT,
      source,
      title,
      details,
      status,
      data
    });
  }

  /**
   * Log an error event
   */
  logError(source, title, details = "") {
    return this.log({
      type: LOG_TYPE.ERROR,
      source,
      title,
      details,
      status: LOG_STATUS.ERROR
    });
  }

  /**
   * Log a milestone event
   */
  logMilestone(source, title, details = "", data = null) {
    return this.log({
      type: LOG_TYPE.MILESTONE,
      source,
      title,
      details,
      status: LOG_STATUS.SUCCESS,
      data
    });
  }

  /**
   * Log system event
   */
  logSystem(title, details = "") {
    return this.log({
      type: LOG_TYPE.SYSTEM,
      source: LOG_SOURCE.SYSTEM,
      title,
      details,
      status: LOG_STATUS.INFO
    });
  }

  /**
   * Log AI event
   */
  logAI(source, title, details = "") {
    return this.log({
      type: LOG_TYPE.AI,
      source,
      title,
      details,
      status: LOG_STATUS.SUCCESS
    });
  }

  /**
   * Get recent entries
   */
  getRecent(limit = 20) {
    return this.entries.slice(0, limit);
  }

  /**
   * Get entries by source
   */
  getBySource(source, limit = 20) {
    return this.entries
      .filter(e => e.source === source)
      .slice(0, limit);
  }

  /**
   * Get entries by type
   */
  getByType(type, limit = 20) {
    return this.entries
      .filter(e => e.type === type)
      .slice(0, limit);
  }

  /**
   * Get display data for UI
   */
  getDisplayData(limit = 15) {
    return this.entries.slice(0, limit).map(entry => ({
      id: entry.id,
      time: formatTime(entry.timestamp),
      source: entry.source,
      title: entry.title,
      status: entry.status,
      color: SOURCE_COLORS[entry.source] || "#64748b",
      icon: STATUS_ICONS[entry.status] || "\u25CB"
    }));
  }

  /**
   * Clear all entries
   */
  clear() {
    this.entries = [];
    this.save();
    this.emit("cleared");
  }

  /**
   * Get connection summary (which services are connected)
   */
  getConnectionSummary() {
    const connectionLogs = this.entries
      .filter(e => e.type === LOG_TYPE.CONNECTION)
      .reduce((acc, e) => {
        if (!acc[e.source] || new Date(e.timestamp) > new Date(acc[e.source].timestamp)) {
          acc[e.source] = e;
        }
        return acc;
      }, {});

    return Object.entries(connectionLogs).map(([source, entry]) => ({
      source,
      connected: entry.status === LOG_STATUS.SUCCESS,
      lastSeen: entry.timestamp,
      details: entry.details
    }));
  }
}

// Singleton instance
let workLogInstance = null;

export const getWorkLog = () => {
  if (!workLogInstance) {
    workLogInstance = new WorkLog();
  }
  return workLogInstance;
};

export default WorkLog;
