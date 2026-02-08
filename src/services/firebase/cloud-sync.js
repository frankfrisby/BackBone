import fetch from "node-fetch";
import fs from "fs";
import path from "path";

/**
 * Cloud Sync Service for BACKBONE
 * Enables phone/mobile connectivity through cloud storage
 * Supports multiple providers: Firebase, AWS S3, or custom endpoint
 */

export const getCloudSyncConfig = () => {
  const provider = process.env.CLOUD_SYNC_PROVIDER || "firebase";
  const apiKey = process.env.CLOUD_SYNC_API_KEY;
  const projectId = process.env.CLOUD_SYNC_PROJECT_ID;
  const userId = process.env.CLOUD_SYNC_USER_ID;
  const endpoint = process.env.CLOUD_SYNC_ENDPOINT;

  return {
    provider,
    apiKey,
    projectId,
    userId,
    endpoint,
    ready: Boolean(apiKey && (projectId || endpoint))
  };
};

/**
 * Build Firebase Realtime Database URL
 */
const getFirebaseUrl = (config, path) => {
  return `https://${config.projectId}-default-rtdb.firebaseio.com/${path}.json?auth=${config.apiKey}`;
};

/**
 * Sync data to cloud
 */
export const syncToCloud = async (config, data) => {
  if (!config.ready) {
    return { success: false, error: "Cloud sync not configured" };
  }

  try {
    const url =
      config.provider === "firebase"
        ? getFirebaseUrl(config, `users/${config.userId}/backbone`)
        : `${config.endpoint}/sync`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(config.provider !== "firebase" && { Authorization: `Bearer ${config.apiKey}` })
      },
      body: JSON.stringify({
        ...data,
        lastSynced: new Date().toISOString(),
        source: "desktop"
      })
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`);
    }

    return { success: true, timestamp: new Date().toISOString() };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Fetch data from cloud (for phone/desktop sync)
 */
export const fetchFromCloud = async (config) => {
  if (!config.ready) {
    return { success: false, error: "Cloud sync not configured", data: null };
  }

  try {
    const url =
      config.provider === "firebase"
        ? getFirebaseUrl(config, `users/${config.userId}/backbone`)
        : `${config.endpoint}/sync`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(config.provider !== "firebase" && { Authorization: `Bearer ${config.apiKey}` })
      }
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data, timestamp: new Date().toISOString() };
  } catch (error) {
    return { success: false, error: error.message, data: null };
  }
};

/**
 * Check for phone input/commands
 */
export const checkPhoneInput = async (config) => {
  if (!config.ready) {
    return { hasInput: false, commands: [] };
  }

  try {
    const url =
      config.provider === "firebase"
        ? getFirebaseUrl(config, `users/${config.userId}/phone_input`)
        : `${config.endpoint}/phone-input`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(config.provider !== "firebase" && { Authorization: `Bearer ${config.apiKey}` })
      }
    });

    if (!response.ok) {
      return { hasInput: false, commands: [] };
    }

    const data = await response.json();
    if (!data) {
      return { hasInput: false, commands: [] };
    }

    // Process and clear phone input
    const commands = Array.isArray(data) ? data : [data];
    if (commands.length > 0) {
      await clearPhoneInput(config);
    }

    return { hasInput: commands.length > 0, commands };
  } catch (error) {
    return { hasInput: false, commands: [], error: error.message };
  }
};

/**
 * Clear phone input after processing
 */
export const clearPhoneInput = async (config) => {
  if (!config.ready) return;

  try {
    const url =
      config.provider === "firebase"
        ? getFirebaseUrl(config, `users/${config.userId}/phone_input`)
        : `${config.endpoint}/phone-input`;

    await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(config.provider !== "firebase" && { Authorization: `Bearer ${config.apiKey}` })
      }
    });
  } catch (error) {
    console.error("Failed to clear phone input:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification/update to phone
 */
export const sendToPhone = async (config, message) => {
  if (!config.ready) {
    return { success: false, error: "Cloud sync not configured" };
  }

  try {
    const url =
      config.provider === "firebase"
        ? getFirebaseUrl(config, `users/${config.userId}/notifications`)
        : `${config.endpoint}/notify`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.provider !== "firebase" && { Authorization: `Bearer ${config.apiKey}` })
      },
      body: JSON.stringify({
        message,
        timestamp: new Date().toISOString(),
        source: "backbone-desktop"
      })
    });

    return { success: response.ok };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Build cloud sync status for display
 */
export const buildCloudSyncStatus = (config) => {
  if (!config.ready) {
    return {
      connected: false,
      provider: null,
      status: "Not configured",
      lastSync: null
    };
  }

  return {
    connected: true,
    provider: config.provider,
    status: "Ready",
    lastSync: null
  };
};

/**
 * Sync state for BACKBONE - call periodically
 */
export const syncBackboneState = async (config, state) => {
  if (!config.ready) return null;

  const syncData = {
    profile: {
      name: state.profile?.name,
      role: state.profile?.role,
      goals: state.profile?.goals
    },
    portfolio: {
      equity: state.portfolio?.equity,
      cash: state.portfolio?.cash,
      dayChange: state.portfolio?.dayChange,
      positions: state.portfolio?.positions?.slice(0, 5)
    },
    topTickers: state.tickers?.slice(0, 10).map((t) => ({
      symbol: t.symbol,
      score: t.score,
      change: t.change
    })),
    health: state.health || null,
    lastActivity: state.lastActivity
  };

  return syncToCloud(config, syncData);
};
