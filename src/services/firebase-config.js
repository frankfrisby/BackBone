/**
 * Firebase Remote Configuration Service
 * Fetches SYSTEM-LEVEL app configuration from Firebase Firestore
 *
 * System-level keys (stored in Firebase - same for all users):
 *   config/config_plaid -> { clientId, secret, env }
 *   config/config_google -> { clientId, clientSecret }
 *
 * User-level keys (stored locally in .env - unique per user):
 *   - Alpaca (trading account)
 *   - OpenAI (personal API key)
 */

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_CACHE_PATH = path.join(DATA_DIR, ".firebase-remote-config.json");

// Firebase project config (same as firebase-auth.js)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBKLqcnFQwNSKqHXgTBLok3l74ZmNh6_y0",
  projectId: "backboneai"
};

export const FIREBASE_API_KEY = FIREBASE_CONFIG.apiKey;
export const FIREBASE_PROJECT_ID = FIREBASE_CONFIG.projectId;

// Firestore REST API base URL
export const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

// Cache duration (10 minutes) - fetches fresh config periodically
const CACHE_DURATION = 10 * 60 * 1000;

let configCache = null;
let lastFetchTime = 0;

/**
 * Ensure data directory exists
 */
const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Load cached config from disk
 */
const loadCachedConfig = () => {
  try {
    if (fs.existsSync(CONFIG_CACHE_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_CACHE_PATH, "utf-8"));
      if (data.fetchedAt && Date.now() - new Date(data.fetchedAt).getTime() < CACHE_DURATION) {
        return data.config;
      }
    }
  } catch (e) {}
  return null;
};

/**
 * Save config to disk cache
 */
const saveCachedConfig = (config) => {
  try {
    ensureDataDir();
    fs.writeFileSync(CONFIG_CACHE_PATH, JSON.stringify({
      config,
      fetchedAt: new Date().toISOString()
    }, null, 2));
  } catch (e) {}
};

/**
 * Parse Firestore document fields to plain object
 */
const parseFirestoreFields = (fields) => {
  const result = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value.stringValue !== undefined) {
      result[key] = value.stringValue;
    } else if (value.integerValue !== undefined) {
      result[key] = parseInt(value.integerValue, 10);
    } else if (value.booleanValue !== undefined) {
      result[key] = value.booleanValue;
    } else if (value.doubleValue !== undefined) {
      result[key] = value.doubleValue;
    } else if (value.mapValue !== undefined) {
      result[key] = parseFirestoreFields(value.mapValue.fields);
    } else if (value.arrayValue !== undefined) {
      result[key] = (value.arrayValue.values || []).map(v => {
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
        if (v.mapValue !== undefined) return parseFirestoreFields(v.mapValue.fields);
        return v;
      });
    }
  }
  return result;
};

/**
 * Fetch a document from Firestore
 */
const fetchFirestoreDoc = async (collection, docId) => {
  try {
    const url = `${FIRESTORE_BASE_URL}/${collection}/${docId}?key=${FIREBASE_CONFIG.apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      if (response.status === 403) {
        // Permission denied - user needs to update Firestore rules
        return null;
      }
      throw new Error(`Firestore error: ${response.status}`);
    }

    const data = await response.json();
    const parsed = parseFirestoreFields(data.fields);
    return parsed;
  } catch (error) {
    return null;
  }
};

/**
 * Generic fetch config helper
 */
const fetchConfigWithFallback = async (configName, envFallback = {}) => {
  // Check memory cache first
  if (configCache?.[configName] && Date.now() - lastFetchTime < CACHE_DURATION) {
    return configCache[configName];
  }

  // Check disk cache
  const cached = loadCachedConfig();
  if (cached?.[configName]) {
    configCache = cached;
    lastFetchTime = Date.now();
    return cached[configName];
  }

  // Fetch from Firebase
  const config = await fetchFirestoreDoc("config", configName);

  if (config && Object.keys(config).length > 0) {
    // Update cache
    configCache = { ...configCache, [configName]: config };
    lastFetchTime = Date.now();
    saveCachedConfig(configCache);
    return config;
  }

  // Fall back to env variables
  return envFallback;
};

/**
 * Fetch Plaid configuration from Firebase (system-level)
 * Document: config/config_plaid
 * Expected fields: clientId, secret, env
 */
export const fetchPlaidConfig = async () => {
  const config = await fetchConfigWithFallback("config_plaid", {
    clientId: process.env.PLAID_CLIENT_ID,
    secret: process.env.PLAID_SECRET,
    env: process.env.PLAID_ENV || "sandbox"
  });

  // Handle common field name variations
  if (config) {
    if (config.client_id && !config.clientId) {
      config.clientId = config.client_id;
    }
    if (config.clientID && !config.clientId) {
      config.clientId = config.clientID;
    }
  }

  return config;
};

/**
 * Fetch Google OAuth configuration from Firebase (system-level)
 * Document: config/config_google
 */
export const fetchGoogleConfig = async () => {
  return fetchConfigWithFallback("config_google", {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET
  });
};

/**
 * Fetch Twilio configuration from Firebase (system-level)
 * Document: config/config_twilio
 * Expected fields: accountSid, authToken, whatsappNumber
 */
export const fetchTwilioConfig = async () => {
  const config = await fetchConfigWithFallback("config_twilio", {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || "+14155238886"
  });

  // Handle common field name variations
  if (config) {
    if (config.account_sid && !config.accountSid) {
      config.accountSid = config.account_sid;
    }
    if (config.auth_token && !config.authToken) {
      config.authToken = config.auth_token;
    }
    if (config.whatsapp_number && !config.whatsappNumber) {
      config.whatsappNumber = config.whatsapp_number;
    }
  }

  return config;
};

/**
 * Fetch all app configuration from Firebase
 */
export const fetchAppConfig = async () => {
  // Check memory cache first
  if (configCache && Date.now() - lastFetchTime < CACHE_DURATION) {
    return configCache;
  }

  // Check disk cache
  const cached = loadCachedConfig();
  if (cached) {
    configCache = cached;
    lastFetchTime = Date.now();
    return cached;
  }

  // Fetch from Firebase
  const [plaidConfig, appConfig] = await Promise.all([
    fetchFirestoreDoc("config", "plaid"),
    fetchFirestoreDoc("config", "app")
  ]);

  const config = {
    plaid: plaidConfig || {
      clientId: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      env: process.env.PLAID_ENV || "sandbox"
    },
    app: appConfig || {}
  };

  // Update cache
  configCache = config;
  lastFetchTime = Date.now();
  saveCachedConfig(config);

  return config;
};

/**
 * Clear config cache (forces refresh on next fetch)
 */
export const clearConfigCache = () => {
  configCache = null;
  lastFetchTime = 0;
  try {
    if (fs.existsSync(CONFIG_CACHE_PATH)) {
      fs.unlinkSync(CONFIG_CACHE_PATH);
    }
  } catch (e) {}
};

/**
 * Check if Plaid is configured (either in Firebase or .env)
 */
export const isPlaidConfigured = async () => {
  const config = await fetchPlaidConfig();
  return Boolean(
    config?.clientId &&
    config?.secret &&
    !config.clientId.includes("YOUR_") &&
    !config.secret.includes("YOUR_")
  );
};

/**
 * Initialize system-level configs from Firebase on app startup
 * Only fetches Google and Plaid (system-level keys)
 * Alpaca and OpenAI remain user-configured locally
 */
export const initializeRemoteConfig = async () => {
  try {
    const [plaid, google] = await Promise.all([
      fetchPlaidConfig(),
      fetchGoogleConfig()
    ]);

    // Set environment variables from Firebase config (for services that read from env)
    if (plaid?.clientId) process.env.PLAID_CLIENT_ID = plaid.clientId;
    if (plaid?.secret) process.env.PLAID_SECRET = plaid.secret;
    if (plaid?.env) process.env.PLAID_ENV = plaid.env;

    if (google?.clientId) process.env.GOOGLE_CLIENT_ID = google.clientId;
    if (google?.clientSecret) process.env.GOOGLE_CLIENT_SECRET = google.clientSecret;

    return { plaid, google };
  } catch (error) {
    console.error("Failed to initialize remote config:", error.message);
    return null;
  }
};

export default {
  fetchPlaidConfig,
  fetchGoogleConfig,
  fetchTwilioConfig,
  fetchAppConfig,
  clearConfigCache,
  isPlaidConfigured,
  initializeRemoteConfig
};
