/**
 * Firebase Dashboard Sync Service
 *
 * Pushes snapshot data (portfolio, health, goals, tickers, trading, lifeScores)
 * to Firestore so the web app can display a real-time dashboard.
 *
 * Architecture:
 * - CLI registers data providers for each source
 * - High-frequency sources (portfolio, tickers) sync every 3 min via dirty flag
 * - Low-frequency sources (health, goals, trading, lifeScores) sync immediately with 5s debounce
 * - Config is polled from Firestore every 5 min so web app can toggle widgets
 *
 * Firestore path: users/{userId}/dashboard/{sourceId}
 */

import { loadFirebaseUser } from "./firebase-auth.js";
import { FIREBASE_CONFIG, FIRESTORE_BASE_URL } from "./firebase-config.js";

// ── Firestore Field Converters ──────────────────────────────────

const toFirestoreValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue)
      }
    };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
};

const toFirestoreFields = (obj) => {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    fields[key] = toFirestoreValue(value);
  }
  return fields;
};

const parseFirestoreValue = (value) => {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return parseInt(value.integerValue, 10);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.nullValue !== undefined) return null;
  if (value.mapValue !== undefined) return parseFirestoreFields(value.mapValue.fields);
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values || []).map(parseFirestoreValue);
  }
  return null;
};

const parseFirestoreFields = (fields) => {
  if (!fields) return {};
  const result = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = parseFirestoreValue(value);
  }
  return result;
};

// ── Rate Limiting Config ────────────────────────────────────────

const SYNC_INTERVALS = {
  HIGH_FREQ: 3 * 60 * 1000,    // 3 minutes (portfolio, tickers)
  CONFIG_POLL: 5 * 60 * 1000,  // 5 minutes
  DEBOUNCE: 5 * 1000,          // 5 seconds for immediate sources
};

const HIGH_FREQ_SOURCES = new Set(["portfolio", "tickers"]);

// ── Dashboard Sync Class ────────────────────────────────────────

class DashboardSync {
  constructor() {
    this.userId = null;
    this.authToken = null;
    this.tokenExpiry = 0;
    this.running = false;

    // Data providers: sourceId → () => snapshotData
    this.providers = new Map();

    // Dirty flags for high-freq batched sync
    this.dirtyFlags = new Set();

    // Debounce timers for low-freq immediate sync
    this.debounceTimers = new Map();

    // Intervals
    this.highFreqInterval = null;
    this.configPollInterval = null;

    // Cached config from Firestore
    this.dashboardConfig = null;

    // Last sync times per source
    this.lastSyncTimes = new Map();
  }

  /**
   * Initialize and start sync loops
   */
  async initialize(userId) {
    if (!userId) return;
    this.userId = userId;
    this.running = true;

    console.log("[DashboardSync] Initializing for user:", userId);

    // Start high-frequency batch sync (portfolio + tickers every 3 min)
    this.highFreqInterval = setInterval(() => this._syncDirtySources(), SYNC_INTERVALS.HIGH_FREQ);

    // Start config polling (every 5 min)
    this.configPollInterval = setInterval(() => this.pollConfig(), SYNC_INTERVALS.CONFIG_POLL);

    // Initial config poll
    await this.pollConfig();

    // Initial full sync after short delay
    setTimeout(() => this._syncAllEnabled(), 5000);
  }

  /**
   * Register a data provider function for a source
   */
  registerDataProvider(sourceId, fn) {
    this.providers.set(sourceId, fn);
  }

  /**
   * Push connected sources status to Firestore
   */
  async setConnectedSources(sources) {
    if (!this.running || !this.userId) return;
    try {
      await this._writeSnapshot("connectedSources", {
        ...sources,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("[DashboardSync] Failed to set connected sources:", err.message);
    }
  }

  /**
   * Mark a high-frequency source as dirty (will sync on next 3-min tick)
   */
  markDirty(sourceId) {
    if (!this.running) return;
    this.dirtyFlags.add(sourceId);
  }

  /**
   * Trigger immediate sync for a low-frequency source (debounced 5s)
   */
  triggerImmediateSync(sourceId) {
    if (!this.running) return;

    // Clear existing debounce timer
    const existing = this.debounceTimers.get(sourceId);
    if (existing) clearTimeout(existing);

    // Set new debounce timer
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(sourceId);
      await this._syncSource(sourceId);
    }, SYNC_INTERVALS.DEBOUNCE);

    this.debounceTimers.set(sourceId, timer);
  }

  /**
   * Get the current dashboard config (cached from last poll)
   */
  getConfig() {
    return this.dashboardConfig;
  }

  /**
   * Poll the dashboard config document from Firestore
   */
  async pollConfig() {
    if (!this.running || !this.userId) return null;

    try {
      const token = await this._getValidToken();
      if (!token) return null;

      const url = `${FIRESTORE_BASE_URL}/users/${this.userId}/dashboard/config?key=${FIREBASE_CONFIG.apiKey}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.status === 404) {
        // No config doc yet — use defaults
        this.dashboardConfig = this._getDefaultConfig();
        // Write defaults to Firestore
        await this._writeSnapshot("config", this.dashboardConfig);
        return this.dashboardConfig;
      }

      if (!response.ok) return null;

      const doc = await response.json();
      this.dashboardConfig = parseFirestoreFields(doc.fields);
      return this.dashboardConfig;
    } catch (err) {
      console.error("[DashboardSync] Config poll failed:", err.message);
      return null;
    }
  }

  /**
   * Stop all sync loops and clean up
   */
  stop() {
    this.running = false;

    if (this.highFreqInterval) {
      clearInterval(this.highFreqInterval);
      this.highFreqInterval = null;
    }

    if (this.configPollInterval) {
      clearInterval(this.configPollInterval);
      this.configPollInterval = null;
    }

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    console.log("[DashboardSync] Stopped");
  }

  // ── Private Methods ───────────────────────────────────────────

  /**
   * Get a valid Firebase ID token, refreshing if needed
   * (Reuses pattern from firebase-storage.js)
   */
  async _getValidToken() {
    // If cached token is still valid (with 5min buffer)
    if (this.authToken && Date.now() < this.tokenExpiry - 5 * 60 * 1000) {
      return this.authToken;
    }

    const user = loadFirebaseUser();
    if (!user) return null;

    // Try existing token first
    if (user.idToken) {
      this.authToken = user.idToken;
      // Assume 1 hour lifetime
      this.tokenExpiry = Date.now() + 55 * 60 * 1000;
      return this.authToken;
    }

    // Refresh using refresh token
    if (user.refreshToken) {
      try {
        const res = await fetch(
          `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              grant_type: "refresh_token",
              refresh_token: user.refreshToken
            })
          }
        );
        if (res.ok) {
          const data = await res.json();
          this.authToken = data.id_token;
          this.tokenExpiry = Date.now() + 55 * 60 * 1000;
          return this.authToken;
        }
      } catch { /* ignore */ }
    }

    return null;
  }

  /**
   * Write a snapshot document to Firestore
   */
  async _writeSnapshot(docId, data) {
    const token = await this._getValidToken();
    if (!token) return;

    const url = `${FIRESTORE_BASE_URL}/users/${this.userId}/dashboard/${docId}?key=${FIREBASE_CONFIG.apiKey}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ fields: toFirestoreFields(data) })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Firestore write failed (${docId}): ${response.status} - ${err}`);
    }

    this.lastSyncTimes.set(docId, Date.now());
  }

  /**
   * Sync a single source by calling its provider and writing to Firestore
   */
  async _syncSource(sourceId) {
    const provider = this.providers.get(sourceId);
    if (!provider) return;

    // Check if this source is enabled in config
    if (this.dashboardConfig?.widgets) {
      const enabled = this.dashboardConfig.widgets.some(
        (w) => w.sourceId === sourceId && w.enabled !== false
      );
      if (!enabled) return;
    }

    try {
      const data = await provider();
      if (!data) return;

      await this._writeSnapshot(sourceId, {
        data,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error(`[DashboardSync] Sync failed for ${sourceId}:`, err.message);
    }
  }

  /**
   * Sync all dirty high-frequency sources
   */
  async _syncDirtySources() {
    if (!this.running || this.dirtyFlags.size === 0) return;

    const dirty = [...this.dirtyFlags];
    this.dirtyFlags.clear();

    for (const sourceId of dirty) {
      await this._syncSource(sourceId);
    }
  }

  /**
   * Sync all enabled sources (used on initial startup)
   */
  async _syncAllEnabled() {
    if (!this.running) return;

    for (const sourceId of this.providers.keys()) {
      await this._syncSource(sourceId);
    }
  }

  /**
   * Default dashboard config
   */
  _getDefaultConfig() {
    return {
      widgets: [
        { sourceId: "portfolio", enabled: true, size: "half" },
        { sourceId: "health", enabled: true, size: "half" },
        { sourceId: "goals", enabled: true, size: "half" },
        { sourceId: "tickers", enabled: true, size: "half" },
        { sourceId: "trading", enabled: false, size: "half" },
        { sourceId: "lifeScores", enabled: false, size: "half" },
      ],
      updatedAt: new Date().toISOString()
    };
  }
}

// ── Singleton ───────────────────────────────────────────────────

let instance = null;

export const getDashboardSync = () => {
  if (!instance) {
    instance = new DashboardSync();
  }
  return instance;
};

export default DashboardSync;
