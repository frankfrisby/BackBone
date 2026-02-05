/**
 * Firebase Push Notification Service
 *
 * Sends push notifications to mobile devices for:
 * - Trading alerts (buys/sells executed)
 * - Price alerts (significant movements)
 * - Daily summaries
 * - Goal reminders
 * - System alerts
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "firebase-config.json");
const TOKENS_PATH = path.join(DATA_DIR, "push-tokens.json");
const LOG_PATH = path.join(DATA_DIR, "push-log.json");

// Lazy load firebase-admin
let firebaseAdmin = null;
const getFirebaseAdmin = async () => {
  if (firebaseAdmin === null) {
    try {
      const module = await import("firebase-admin");
      firebaseAdmin = module.default || module;
    } catch (err) {
      console.log("[Firebase] firebase-admin not installed. Run: npm install firebase-admin");
      firebaseAdmin = false;
    }
  }
  return firebaseAdmin;
};

/**
 * Notification types
 */
export const PUSH_NOTIFICATION_TYPES = {
  TRADE_EXECUTED: "trade_executed",
  PRICE_ALERT: "price_alert",
  BUY_SIGNAL: "buy_signal",
  SELL_SIGNAL: "sell_signal",
  DAILY_SUMMARY: "daily_summary",
  GOAL_REMINDER: "goal_reminder",
  MARKET_OPEN: "market_open",
  MARKET_CLOSE: "market_close",
  SYSTEM_ALERT: "system_alert"
};

/**
 * Priority levels
 */
export const PRIORITY = {
  HIGH: "high",
  NORMAL: "normal"
};

/**
 * Ensure data directory exists
 */
const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Load Firebase configuration
 */
export const loadFirebaseConfig = () => {
  try {
    ensureDataDir();
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch (error) {
    console.error("[Firebase] Error loading config:", error.message);
  }
  return {
    initialized: false,
    serviceAccountPath: null,
    projectId: null,
    enabled: false
  };
};

/**
 * Save Firebase configuration
 */
export const saveFirebaseConfig = (config) => {
  try {
    ensureDataDir();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error("[Firebase] Error saving config:", error.message);
    return false;
  }
};

/**
 * Initialize Firebase Admin SDK
 */
let firebaseApp = null;
export const initializeFirebase = async (serviceAccountPath = null) => {
  const admin = await getFirebaseAdmin();
  if (!admin) {
    return { success: false, error: "firebase-admin not installed" };
  }

  if (firebaseApp) {
    return { success: true, message: "Already initialized" };
  }

  const config = loadFirebaseConfig();
  const credPath = serviceAccountPath || config.serviceAccountPath || process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!credPath) {
    return {
      success: false,
      error: "Firebase service account not configured. Set FIREBASE_SERVICE_ACCOUNT in .env or call initializeFirebase with path"
    };
  }

  try {
    let credential;
    if (typeof credPath === "string" && fs.existsSync(credPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf-8"));
      credential = admin.credential.cert(serviceAccount);
    } else if (typeof credPath === "object") {
      credential = admin.credential.cert(credPath);
    } else {
      return { success: false, error: "Invalid service account path" };
    }

    firebaseApp = admin.initializeApp({
      credential: credential
    });

    // Save configuration
    saveFirebaseConfig({
      ...config,
      initialized: true,
      serviceAccountPath: typeof credPath === "string" ? credPath : "inline",
      enabled: true
    });

    console.log("[Firebase] Initialized successfully");
    return { success: true };
  } catch (error) {
    console.error("[Firebase] Initialization failed:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Load registered device tokens
 */
export const loadDeviceTokens = () => {
  try {
    ensureDataDir();
    if (fs.existsSync(TOKENS_PATH)) {
      return JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
    }
  } catch (error) {
    console.error("[Firebase] Error loading tokens:", error.message);
  }
  return { tokens: [], lastUpdated: null };
};

/**
 * Save device tokens
 */
const saveDeviceTokens = (data) => {
  try {
    ensureDataDir();
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error("[Firebase] Error saving tokens:", error.message);
    return false;
  }
};

/**
 * Register a device token for push notifications
 */
export const registerDeviceToken = (token, deviceInfo = {}) => {
  const data = loadDeviceTokens();

  // Check if token already exists
  const existingIndex = data.tokens.findIndex(t => t.token === token);

  const tokenEntry = {
    token,
    deviceName: deviceInfo.name || "Unknown Device",
    platform: deviceInfo.platform || "unknown",
    registeredAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    enabled: true
  };

  if (existingIndex >= 0) {
    // Update existing token
    data.tokens[existingIndex] = {
      ...data.tokens[existingIndex],
      ...tokenEntry,
      registeredAt: data.tokens[existingIndex].registeredAt
    };
  } else {
    // Add new token
    data.tokens.push(tokenEntry);
  }

  saveDeviceTokens(data);
  console.log(`[Firebase] Device registered: ${deviceInfo.name || token.substring(0, 20)}...`);
  return { success: true, tokenCount: data.tokens.length };
};

/**
 * Unregister a device token
 */
export const unregisterDeviceToken = (token) => {
  const data = loadDeviceTokens();
  const initialCount = data.tokens.length;
  data.tokens = data.tokens.filter(t => t.token !== token);

  if (data.tokens.length < initialCount) {
    saveDeviceTokens(data);
    console.log("[Firebase] Device unregistered");
    return { success: true };
  }
  return { success: false, error: "Token not found" };
};

/**
 * Load push notification log
 */
const loadPushLog = () => {
  try {
    if (fs.existsSync(LOG_PATH)) {
      return JSON.parse(fs.readFileSync(LOG_PATH, "utf-8"));
    }
  } catch (error) {
    console.error("[Firebase] Error loading log:", error.message);
  }
  return { notifications: [], stats: { total: 0, success: 0, failed: 0 } };
};

/**
 * Save push notification log
 */
const savePushLog = (log) => {
  try {
    ensureDataDir();
    // Keep only last 500 notifications
    if (log.notifications.length > 500) {
      log.notifications = log.notifications.slice(-500);
    }
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  } catch (error) {
    console.error("[Firebase] Error saving log:", error.message);
  }
};

/**
 * Send push notification to all registered devices
 */
export const sendPushNotification = async (type, payload = {}) => {
  const admin = await getFirebaseAdmin();
  if (!admin) {
    return { success: false, error: "firebase-admin not installed" };
  }

  const config = loadFirebaseConfig();
  if (!config.enabled || !config.initialized) {
    // Initialize if service account is available
    const initResult = await initializeFirebase();
    if (!initResult.success) {
      return initResult;
    }
  }

  const tokensData = loadDeviceTokens();
  const enabledTokens = tokensData.tokens.filter(t => t.enabled).map(t => t.token);

  if (enabledTokens.length === 0) {
    return { success: false, error: "No registered devices" };
  }

  // Build notification based on type
  const notification = buildNotification(type, payload);

  try {
    const message = {
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: {
        type,
        ...notification.data,
        timestamp: new Date().toISOString()
      },
      android: {
        priority: notification.priority === PRIORITY.HIGH ? "high" : "normal",
        notification: {
          icon: "ic_notification",
          color: notification.color || "#f59e0b",
          sound: notification.sound || "default"
        }
      },
      apns: {
        payload: {
          aps: {
            sound: notification.sound || "default",
            badge: notification.badge || 1
          }
        }
      },
      tokens: enabledTokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // Log the notification
    const log = loadPushLog();
    log.notifications.push({
      type,
      title: notification.title,
      body: notification.body,
      timestamp: new Date().toISOString(),
      successCount: response.successCount,
      failureCount: response.failureCount
    });
    log.stats.total++;
    log.stats.success += response.successCount;
    log.stats.failed += response.failureCount;
    savePushLog(log);

    // Handle failed tokens (remove invalid ones)
    if (response.failureCount > 0 && Array.isArray(response.responses)) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error?.code === "messaging/registration-token-not-registered") {
          failedTokens.push(enabledTokens[idx]);
        }
      });

      if (failedTokens.length > 0) {
        const data = loadDeviceTokens();
        data.tokens = data.tokens.filter(t => !failedTokens.includes(t.token));
        saveDeviceTokens(data);
        console.log(`[Firebase] Removed ${failedTokens.length} invalid tokens`);
      }
    }

    console.log(`[Firebase] Push sent: ${notification.title} (${response.successCount}/${enabledTokens.length} delivered)`);
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount
    };

  } catch (error) {
    console.error("[Firebase] Send failed:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Build notification content based on type
 */
const buildNotification = (type, payload) => {
  const notifications = {
    [PUSH_NOTIFICATION_TYPES.TRADE_EXECUTED]: {
      title: `Trade Executed: ${payload.action || ""}`,
      body: `${payload.symbol} - ${payload.shares} shares @ $${payload.price}`,
      color: payload.action === "BUY" ? "#22c55e" : "#ef4444",
      priority: PRIORITY.HIGH,
      data: { symbol: payload.symbol, action: payload.action }
    },

    [PUSH_NOTIFICATION_TYPES.PRICE_ALERT]: {
      title: `Price Alert: ${payload.symbol}`,
      body: `${payload.symbol} ${payload.direction || "moved"} ${payload.percent}% to $${payload.price}`,
      color: payload.direction === "up" ? "#22c55e" : "#ef4444",
      priority: PRIORITY.HIGH,
      data: { symbol: payload.symbol }
    },

    [PUSH_NOTIFICATION_TYPES.BUY_SIGNAL]: {
      title: "Buy Signal Detected",
      body: `${payload.symbol} score: ${payload.score}/10 - ${payload.reason || "Strong buy conditions"}`,
      color: "#22c55e",
      priority: PRIORITY.HIGH,
      data: { symbol: payload.symbol, score: String(payload.score) }
    },

    [PUSH_NOTIFICATION_TYPES.SELL_SIGNAL]: {
      title: "Sell Signal Detected",
      body: `${payload.symbol} score: ${payload.score}/10 - ${payload.reason || "Consider selling"}`,
      color: "#ef4444",
      priority: PRIORITY.HIGH,
      data: { symbol: payload.symbol, score: String(payload.score) }
    },

    [PUSH_NOTIFICATION_TYPES.DAILY_SUMMARY]: {
      title: "Daily Summary",
      body: payload.summary || `Portfolio: ${payload.portfolioChange || "0%"} | Top: ${payload.topTicker || "N/A"}`,
      color: "#f59e0b",
      priority: PRIORITY.NORMAL,
      data: {}
    },

    [PUSH_NOTIFICATION_TYPES.GOAL_REMINDER]: {
      title: "Goal Reminder",
      body: payload.message || payload.goal || "Check your progress today",
      color: "#8b5cf6",
      priority: PRIORITY.NORMAL,
      data: { goalId: payload.goalId }
    },

    [PUSH_NOTIFICATION_TYPES.MARKET_OPEN]: {
      title: "Market Open",
      body: payload.message || "US markets are now open for trading",
      color: "#22c55e",
      priority: PRIORITY.NORMAL,
      data: {}
    },

    [PUSH_NOTIFICATION_TYPES.MARKET_CLOSE]: {
      title: "Market Closed",
      body: payload.summary || "US markets are now closed",
      color: "#f59e0b",
      priority: PRIORITY.NORMAL,
      data: {}
    },

    [PUSH_NOTIFICATION_TYPES.SYSTEM_ALERT]: {
      title: payload.title || "System Alert",
      body: payload.message || "Check BACKBONE for updates",
      color: "#f59e0b",
      priority: payload.urgent ? PRIORITY.HIGH : PRIORITY.NORMAL,
      data: {}
    }
  };

  return notifications[type] || {
    title: "BACKBONE",
    body: payload.message || "You have a new notification",
    color: "#f59e0b",
    priority: PRIORITY.NORMAL,
    data: {}
  };
};

/**
 * Send trading alert
 */
export const sendTradeAlert = async (action, symbol, shares, price) => {
  return sendPushNotification(PUSH_NOTIFICATION_TYPES.TRADE_EXECUTED, {
    action,
    symbol,
    shares,
    price: price.toFixed(2)
  });
};

/**
 * Send buy signal alert
 */
export const sendBuySignalAlert = async (symbol, score, reason) => {
  return sendPushNotification(PUSH_NOTIFICATION_TYPES.BUY_SIGNAL, {
    symbol,
    score,
    reason
  });
};

/**
 * Send sell signal alert
 */
export const sendSellSignalAlert = async (symbol, score, reason) => {
  return sendPushNotification(PUSH_NOTIFICATION_TYPES.SELL_SIGNAL, {
    symbol,
    score,
    reason
  });
};

/**
 * Send daily summary
 */
export const sendDailySummary = async (summary) => {
  return sendPushNotification(PUSH_NOTIFICATION_TYPES.DAILY_SUMMARY, summary);
};

/**
 * Send goal reminder
 */
export const sendGoalReminder = async (goal, message) => {
  return sendPushNotification(PUSH_NOTIFICATION_TYPES.GOAL_REMINDER, {
    goal,
    message
  });
};

/**
 * Get push notification status
 */
export const getPushStatus = () => {
  const config = loadFirebaseConfig();
  const tokens = loadDeviceTokens();
  const log = loadPushLog();

  return {
    configured: config.initialized && config.enabled,
    deviceCount: tokens.tokens.filter(t => t.enabled).length,
    totalDevices: tokens.tokens.length,
    devices: tokens.tokens.map(t => ({
      name: t.deviceName,
      platform: t.platform,
      lastActive: t.lastActive,
      enabled: t.enabled
    })),
    stats: log.stats,
    recentNotifications: log.notifications.slice(-10).reverse()
  };
};

/**
 * Generate device registration token (for mobile app)
 * Returns instructions for mobile app integration
 */
export const getRegistrationInstructions = () => {
  return {
    instructions: `
To enable push notifications on your mobile device:

1. Install the BACKBONE mobile companion app (or use the web API)
2. In the app, get your device token from Firebase
3. Register the token using the /register-push command:
   /register-push <your-token> <device-name>

Or use the API endpoint:
POST /api/push/register
{
  "token": "your-firebase-token",
  "deviceInfo": {
    "name": "My iPhone",
    "platform": "ios"
  }
}

To test notifications:
/test-push

To view push status:
/push-status
    `.trim(),
    apiEndpoints: {
      register: "POST /api/push/register",
      unregister: "POST /api/push/unregister",
      test: "POST /api/push/test",
      status: "GET /api/push/status"
    }
  };
};

export default {
  PUSH_NOTIFICATION_TYPES,
  PRIORITY,
  initializeFirebase,
  loadFirebaseConfig,
  saveFirebaseConfig,
  registerDeviceToken,
  unregisterDeviceToken,
  sendPushNotification,
  sendTradeAlert,
  sendBuySignalAlert,
  sendSellSignalAlert,
  sendDailySummary,
  sendGoalReminder,
  getPushStatus,
  getRegistrationInstructions
};
