import fs from "fs";
import path from "path";

import { getDataDir } from "../paths.js";
import { loadConfig as loadAutoTraderConfig } from "./auto-trader.js";
const DATA_DIR = getDataDir();
const TRADING_STATUS_PATH = path.join(DATA_DIR, "trading-status.json");

// Ensure data directory exists
const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Get current time in Eastern timezone
 */
const getEasternTime = () => {
  const now = new Date();
  const options = {
    timeZone: "America/New_York",
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  };
  const etString = now.toLocaleString('en-US', options);
  const [time] = etString.split(', ');
  const [hours, minutes] = time.split(':').map(Number);

  // Get day of week in ET
  const dayOptions = { timeZone: "America/New_York", weekday: 'short' };
  const dayOfWeek = now.toLocaleString('en-US', dayOptions);

  return { hours, minutes, dayOfWeek };
};

/**
 * Check if current time is within trading hours (9:30am - 4:00pm ET, Mon-Fri)
 * Uses Eastern timezone for all calculations
 */
export const isMarketOpen = (date = new Date()) => {
  const { hours, minutes, dayOfWeek } = getEasternTime();

  // Weekend check
  if (dayOfWeek === 'Sat' || dayOfWeek === 'Sun') return false;

  const timeInMinutes = hours * 60 + minutes;

  // 9:30am = 570 minutes, 4:00pm = 960 minutes (ET)
  const marketOpen = 9 * 60 + 30; // 9:30am ET
  const marketClose = 16 * 60; // 4:00pm ET

  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
};

/**
 * Get next 10-minute interval in Eastern time
 */
export const getNextInterval = (date = new Date()) => {
  const { hours, minutes } = getEasternTime();
  const nextInterval = Math.ceil((minutes + 1) / 10) * 10;

  // Calculate next hour/minute in ET
  let nextHour = hours;
  let nextMinute = nextInterval;

  if (nextInterval >= 60) {
    nextHour = hours + 1;
    nextMinute = 0;
  }

  // Return a mock date object with the ET time for display
  // We only use this for formatting, not actual scheduling
  const next = new Date(date);
  next.setHours(nextHour);
  next.setMinutes(nextMinute);
  next.setSeconds(0);
  next.setMilliseconds(0);

  return next;
};

/**
 * Format time for display (e.g., "10:00am")
 */
export const formatTime = (date) => {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).toLowerCase();
};

/**
 * Format timestamp for trade attempts
 */
export const formatTimestamp = (date) => {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
};

/**
 * Load trading status from disk
 */
export const loadTradingStatus = () => {
  // Enabled/disabled is controlled by the auto-trader config (data/trading-config.json).
  // trading-status.json is used only for lightweight UI history.
  const syncEnabled = (status) => {
    try {
      const cfg = loadAutoTraderConfig();
      if (cfg && typeof cfg.enabled === "boolean") {
        status.enabled = cfg.enabled;
      }
    } catch {
      // ignore
    }
    return status;
  };

  try {
    ensureDataDir();
    if (fs.existsSync(TRADING_STATUS_PATH)) {
      const data = JSON.parse(fs.readFileSync(TRADING_STATUS_PATH, "utf-8"));
      return syncEnabled(data);
    }
  } catch (error) {
    console.error("Failed to load trading status:", error.message);
  }
  return syncEnabled(getDefaultTradingStatus());
};

/**
 * Save trading status to disk
 */
export const saveTradingStatus = (status) => {
  try {
    ensureDataDir();
    fs.writeFileSync(TRADING_STATUS_PATH, JSON.stringify(status, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save trading status:", error.message);
    return false;
  }
};

/**
 * Get default trading status
 */
export const getDefaultTradingStatus = () => ({
  lastAttempt: null, // { timestamp, success, symbol, action, message }
  tradeHistory: [], // Last 10 trade attempts
  enabled: true
});

/**
 * Record a trade attempt
 */
export const recordTradeAttempt = (attempt) => {
  const status = loadTradingStatus();

  const record = {
    timestamp: new Date().toISOString(),
    success: attempt.success,
    symbol: attempt.symbol || null,
    action: attempt.action || "unknown", // "buy" or "sell"
    message: attempt.message,
    shares: attempt.shares || null,
    price: attempt.price || null
  };

  status.lastAttempt = record;
  status.tradeHistory = [record, ...(status.tradeHistory || [])].slice(0, 10);

  saveTradingStatus(status);
  return status;
};

/**
 * Build trading status display info
 */
export const buildTradingStatusDisplay = (tradingStatus = null) => {
  const status = tradingStatus || loadTradingStatus();
  const now = new Date();
  const marketOpen = isMarketOpen(now);

  let statusText;
  let statusColor;
  let statusIcon;

  if (!status.enabled) {
    statusText = "System paused";
    statusColor = "#f97316"; // Orange
    statusIcon = "◐";
  } else if (marketOpen) {
    const nextTime = getNextInterval(now);
    statusText = `System ready · Next at ${formatTime(nextTime)}`;
    statusColor = "#22c55e"; // Green
    statusIcon = "●";
  } else {
    statusText = "System not trading · Waiting";
    statusColor = "#64748b"; // Gray
    statusIcon = "●";
  }

  // Last attempt info
  let lastAttemptDisplay = null;
  if (status.lastAttempt) {
    const attempt = status.lastAttempt;
    lastAttemptDisplay = {
      success: attempt.success,
      icon: attempt.success ? "✓" : "✗",
      color: attempt.success ? "#22c55e" : "#ef4444",
      timestamp: formatTimestamp(attempt.timestamp),
      message: attempt.message,
      symbol: attempt.symbol,
      action: attempt.action
    };
  }

  return {
    marketOpen,
    statusText,
    statusColor,
    statusIcon,
    lastAttempt: lastAttemptDisplay,
    enabled: status.enabled
  };
};

/**
 * Reset all trading status data
 */
export const resetTradingStatus = () => {
  const defaultStatus = getDefaultTradingStatus();
  saveTradingStatus(defaultStatus);
  return defaultStatus;
};

/**
 * Delete trading status file
 */
export const deleteTradingStatus = () => {
  try {
    if (fs.existsSync(TRADING_STATUS_PATH)) {
      fs.unlinkSync(TRADING_STATUS_PATH);
    }
    return true;
  } catch (error) {
    console.error("Failed to delete trading status:", error.message);
    return false;
  }
};
