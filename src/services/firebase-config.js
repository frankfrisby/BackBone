/**
 * Firebase Remote Configuration Service
 * Fetches SYSTEM-LEVEL app configuration from Firebase Firestore
 *
 * All keys live in Firebase — fetched at runtime, held in memory only.
 * No secrets are written to disk.
 */

import fs from "node:fs";
import path from "node:path";
import { loadFirebaseUser } from "./firebase-auth.js";

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

// In-memory only — no secrets written to disk
let configCache = null;
let lastFetchTime = 0;

// Clean up any legacy disk cache that may contain secrets
const LEGACY_CACHE_PATH = path.join(process.cwd(), "data", ".firebase-remote-config.json");
try {
  if (fs.existsSync(LEGACY_CACHE_PATH)) {
    fs.unlinkSync(LEGACY_CACHE_PATH);
  }
} catch (e) {}

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
    const user = loadFirebaseUser();
    const headers = {};
    if (user?.idToken) {
      headers.Authorization = `Bearer ${user.idToken}`;
    }
    const response = await fetch(url, { headers });

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
 * Generic fetch config helper — memory cache only, no disk writes
 */
const fetchConfigWithFallback = async (configName, envFallback = {}) => {
  // Check memory cache first
  if (configCache?.[configName] && Date.now() - lastFetchTime < CACHE_DURATION) {
    return configCache[configName];
  }

  // Fetch from Firebase (no disk cache)
  const config = await fetchFirestoreDoc("config", configName);

  if (config && Object.keys(config).length > 0) {
    configCache = { ...configCache, [configName]: config };
    lastFetchTime = Date.now();
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
 * Fetch Vapi configuration from Firebase (system-level)
 * Document: config/config_vapi
 * Expected fields: privateKey, publicKey, phoneNumberId, userPhoneNumber
 */
export const fetchVapiConfig = async () => {
  const config = await fetchConfigWithFallback("config_vapi", {
    privateKey: process.env.VAPI_PRIVATE_KEY,
    publicKey: process.env.VAPI_PUBLIC_KEY,
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
  });

  // Handle common field name variations
  if (config) {
    if (config.private_key && !config.privateKey) {
      config.privateKey = config.private_key;
    }
    if (config.public_key && !config.publicKey) {
      config.publicKey = config.public_key;
    }
    if (config.phone_number_id && !config.phoneNumberId) {
      config.phoneNumberId = config.phone_number_id;
    }
    if (config.default_voice_provider && !config.defaultVoiceProvider) {
      config.defaultVoiceProvider = config.default_voice_provider;
    }
    if (config.default_voice_id && !config.defaultVoiceId) {
      config.defaultVoiceId = config.default_voice_id;
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

  // Fetch from Firebase (no disk cache)
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

  configCache = config;
  lastFetchTime = Date.now();
  return config;
};

/**
 * Clear config cache (forces refresh on next fetch)
 */
export const clearConfigCache = () => {
  configCache = null;
  lastFetchTime = 0;
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
  fetchVapiConfig,
  fetchAppConfig,
  clearConfigCache,
  isPlaidConfigured,
  initializeRemoteConfig
};
