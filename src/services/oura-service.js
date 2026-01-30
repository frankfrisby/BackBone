/**
 * Oura Ring API Service
 * Connects to Oura Ring API v2 to fetch health data
 *
 * API Docs: https://cloud.ouraring.com/v2/docs
 * Personal Access Token: https://cloud.ouraring.com/personal-access-tokens
 */

import fs from "fs";
import path from "path";
import { openUrl } from "./open-url.js";

const OURA_BASE_URL = "https://api.ouraring.com/v2/usercollection";
const OURA_TOKEN_PAGE = "https://cloud.ouraring.com/personal-access-tokens";
const DATA_DIR = path.join(process.cwd(), "data");
const OURA_TOKEN_FILE = path.join(DATA_DIR, "oura-token.json");
const OURA_DATA_FILE = path.join(DATA_DIR, "oura-data.json");
const OURA_SETUP_FILE = path.join(DATA_DIR, "oura-token-setup.txt");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Save Oura token to file
 */
export const saveOuraToken = (token) => {
  const data = {
    token,
    savedAt: new Date().toISOString()
  };
  fs.writeFileSync(OURA_TOKEN_FILE, JSON.stringify(data, null, 2));
  return true;
};

/**
 * Load Oura token from file
 */
export const loadOuraToken = () => {
  try {
    if (fs.existsSync(OURA_TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(OURA_TOKEN_FILE, "utf-8"));
      return data.token;
    }
  } catch (e) {}
  return null;
};

/**
 * Check if Oura is configured
 */
export const isOuraConfigured = () => {
  return !!loadOuraToken();
};

/**
 * Open Oura token page in browser
 */
export const openOuraTokenPage = () => {
  openUrl(OURA_TOKEN_PAGE);
};

/**
 * Create setup file for token entry
 */
export const createOuraSetupFile = () => {
  const content = `OURA RING PERSONAL ACCESS TOKEN SETUP
=====================================

1. The Oura token page should have opened in your browser
2. If not, go to: ${OURA_TOKEN_PAGE}
3. Click "Create New Personal Access Token"
4. Give it a name like "BACKBONE"
5. Copy the token and paste it below (replace the placeholder):

OURA_TOKEN=paste_your_token_here

6. Save this file (Ctrl+S)
7. The token will be automatically detected

Note: Keep your token secret! It provides access to your health data.
`;
  fs.writeFileSync(OURA_SETUP_FILE, content);
  return OURA_SETUP_FILE;
};

/**
 * Open setup file in editor
 */
export const openOuraSetupInEditor = () => {
  const setupFile = OURA_SETUP_FILE;
  if (process.platform === "win32") {
    import("child_process").then(({ exec }) => {
      exec(`notepad "${setupFile}"`);
    });
  } else if (process.platform === "darwin") {
    import("child_process").then(({ exec }) => {
      exec(`open -e "${setupFile}"`);
    });
  } else {
    import("child_process").then(({ exec }) => {
      exec(`xdg-open "${setupFile}"`);
    });
  }
};

/**
 * Read token from setup file
 */
export const readOuraSetupFile = () => {
  try {
    if (fs.existsSync(OURA_SETUP_FILE)) {
      const content = fs.readFileSync(OURA_SETUP_FILE, "utf-8");
      const match = content.match(/OURA_TOKEN=([^\s\n]+)/);
      if (match && match[1] && !match[1].includes("paste_your_token")) {
        return match[1].trim();
      }
    }
  } catch (e) {}
  return null;
};

/**
 * Watch setup file for changes
 */
export const watchOuraSetupFile = (callback) => {
  if (!fs.existsSync(OURA_SETUP_FILE)) {
    createOuraSetupFile();
  }

  const watcher = fs.watch(OURA_SETUP_FILE, (eventType) => {
    if (eventType === "change") {
      const token = readOuraSetupFile();
      if (token) {
        callback(token);
      }
    }
  });

  return watcher;
};

/**
 * Cleanup setup file
 */
export const cleanupOuraSetupFile = () => {
  try {
    if (fs.existsSync(OURA_SETUP_FILE)) {
      fs.unlinkSync(OURA_SETUP_FILE);
    }
  } catch (e) {}
};

/**
 * Validate Oura token by making a test request
 */
export const validateOuraToken = async (token) => {
  try {
    const response = await fetch(`${OURA_BASE_URL}/personal_info`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      return { valid: true, user: data };
    } else if (response.status === 401) {
      return { valid: false, error: "Invalid token" };
    } else {
      return { valid: false, error: `API error: ${response.status}` };
    }
  } catch (err) {
    return { valid: false, error: err.message };
  }
};

/**
 * Fetch data from Oura API
 */
const fetchOuraData = async (endpoint, token, params = {}) => {
  const url = new URL(`${OURA_BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Oura API error: ${response.status}`);
  }

  return response.json();
};

/**
 * Get date range for queries (default: last 7 days)
 */
const getDateRange = (daysBack = 7) => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);

  return {
    start_date: start.toISOString().split("T")[0],
    end_date: end.toISOString().split("T")[0]
  };
};

/**
 * Fetch all health data from Oura
 */
export const fetchAllOuraData = async (daysBack = 7) => {
  const token = loadOuraToken();
  if (!token) {
    throw new Error("Oura token not configured");
  }

  const dateRange = getDateRange(daysBack);

  const [sleep, readiness, activity, heartRate] = await Promise.all([
    fetchOuraData("daily_sleep", token, dateRange).catch(() => ({ data: [] })),
    fetchOuraData("daily_readiness", token, dateRange).catch(() => ({ data: [] })),
    fetchOuraData("daily_activity", token, dateRange).catch(() => ({ data: [] })),
    fetchOuraData("heartrate", token, { ...dateRange }).catch(() => ({ data: [] }))
  ]);

  return {
    sleep: sleep.data || [],
    readiness: readiness.data || [],
    activity: activity.data || [],
    heartRate: heartRate.data || [],
    fetchedAt: new Date().toISOString()
  };
};

/**
 * Fetch today's summary
 */
export const fetchTodaySummary = async () => {
  const token = loadOuraToken();
  if (!token) {
    throw new Error("Oura token not configured");
  }

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const dateRange = { start_date: yesterday, end_date: today };

  const [sleep, readiness, activity] = await Promise.all([
    fetchOuraData("daily_sleep", token, dateRange).catch(() => ({ data: [] })),
    fetchOuraData("daily_readiness", token, dateRange).catch(() => ({ data: [] })),
    fetchOuraData("daily_activity", token, dateRange).catch(() => ({ data: [] }))
  ]);

  // Get most recent entries
  const latestSleep = sleep.data?.[sleep.data.length - 1];
  const latestReadiness = readiness.data?.[readiness.data.length - 1];
  const latestActivity = activity.data?.[activity.data.length - 1];

  return {
    date: today,
    sleep: latestSleep ? {
      score: latestSleep.score,
      totalSleep: latestSleep.total_sleep_duration,
      efficiency: latestSleep.efficiency,
      remSleep: latestSleep.rem_sleep_duration,
      deepSleep: latestSleep.deep_sleep_duration
    } : null,
    readiness: latestReadiness ? {
      score: latestReadiness.score,
      temperatureDeviation: latestReadiness.temperature_deviation,
      hrvBalance: latestReadiness.hrv_balance,
      recoveryIndex: latestReadiness.recovery_index
    } : null,
    activity: latestActivity ? {
      score: latestActivity.score,
      activeCalories: latestActivity.active_calories,
      steps: latestActivity.steps,
      totalCalories: latestActivity.total_calories
    } : null,
    fetchedAt: new Date().toISOString()
  };
};

/**
 * Generate a hash of health data for change detection
 */
const hashHealthData = (data) => {
  // Create a simple hash from the key metrics
  const keyMetrics = {
    sleepScores: (data.sleep || []).map(s => s.score).join(","),
    readinessScores: (data.readiness || []).map(r => r.score).join(","),
    activityScores: (data.activity || []).map(a => a.score).join(","),
    steps: (data.activity || []).map(a => a.steps).join(",")
  };
  return JSON.stringify(keyMetrics);
};

/**
 * Check if health data has changed compared to stored data
 */
export const hasHealthDataChanged = (newData) => {
  try {
    const existingData = loadOuraData();
    if (!existingData?.latest) return true; // No existing data, so it's "changed"

    const oldHash = hashHealthData(existingData.latest);
    const newHash = hashHealthData(newData);

    return oldHash !== newHash;
  } catch (e) {
    return true; // On error, assume changed
  }
};

/**
 * Save Oura data to file
 */
export const saveOuraData = (data, forceUpdate = false) => {
  // Load existing data
  let existingData = { history: [] };
  try {
    if (fs.existsSync(OURA_DATA_FILE)) {
      existingData = JSON.parse(fs.readFileSync(OURA_DATA_FILE, "utf-8"));
    }
  } catch (e) {}

  // Check if data actually changed (unless forced)
  if (!forceUpdate && existingData.latest) {
    const dataChanged = hasHealthDataChanged(data);
    if (!dataChanged) {
      // Update only the lastChecked timestamp, not the data
      existingData.lastChecked = new Date().toISOString();
      fs.writeFileSync(OURA_DATA_FILE, JSON.stringify(existingData, null, 2));
      return { saved: false, reason: "no_change" };
    }
  }

  // Add new data with timestamp
  existingData.latest = data;
  existingData.lastUpdated = new Date().toISOString();
  existingData.lastChecked = new Date().toISOString();

  // Keep history (last 30 entries)
  if (!existingData.history) existingData.history = [];
  existingData.history.push({
    ...data,
    savedAt: new Date().toISOString()
  });
  if (existingData.history.length > 30) {
    existingData.history = existingData.history.slice(-30);
  }

  fs.writeFileSync(OURA_DATA_FILE, JSON.stringify(existingData, null, 2));
  return { saved: true, reason: "data_changed" };
};

/**
 * Load saved Oura data
 */
export const loadOuraData = () => {
  try {
    if (fs.existsSync(OURA_DATA_FILE)) {
      return JSON.parse(fs.readFileSync(OURA_DATA_FILE, "utf-8"));
    }
  } catch (e) {}
  return null;
};

/**
 * Sync Oura data (fetch and save)
 * Only saves if data has changed (prevents duplicate entries)
 */
export const syncOuraData = async (forceUpdate = false) => {
  try {
    if (!isOuraConfigured()) {
      return { success: false, error: "Oura not configured" };
    }
    const data = await fetchAllOuraData(7);
    const saveResult = saveOuraData(data, forceUpdate);
    return { success: true, data, ...saveResult };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/**
 * Get next sync time (every 10 minutes)
 */
export const getNextSyncTime = () => {
  const now = new Date();
  const nextSync = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now
  return nextSync;
};

/**
 * Format duration in seconds to human readable
 */
export const formatDuration = (seconds) => {
  if (!seconds) return "N/A";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

/**
 * Get health summary for display
 */
export const getHealthSummary = () => {
  const data = loadOuraData();
  if (!data?.latest) {
    return null;
  }

  const latest = data.latest;
  const sleepData = latest.sleep?.[latest.sleep.length - 1];
  const readinessData = latest.readiness?.[latest.readiness.length - 1];
  const activityData = latest.activity?.[latest.activity.length - 1];

  return {
    sleep: sleepData ? {
      score: sleepData.score,
      duration: formatDuration(sleepData.total_sleep_duration)
    } : null,
    readiness: readinessData ? {
      score: readinessData.score
    } : null,
    activity: activityData ? {
      score: activityData.score,
      steps: activityData.steps
    } : null,
    lastUpdated: data.lastUpdated
  };
};

export default {
  saveOuraToken,
  loadOuraToken,
  isOuraConfigured,
  openOuraTokenPage,
  createOuraSetupFile,
  openOuraSetupInEditor,
  readOuraSetupFile,
  watchOuraSetupFile,
  cleanupOuraSetupFile,
  validateOuraToken,
  fetchAllOuraData,
  fetchTodaySummary,
  saveOuraData,
  loadOuraData,
  syncOuraData,
  getNextSyncTime,
  formatDuration,
  getHealthSummary,
  hasHealthDataChanged
};
