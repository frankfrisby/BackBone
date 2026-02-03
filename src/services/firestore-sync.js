/**
 * Firestore Real-time Sync Service
 *
 * Pushes user data to Firebase Firestore:
 * - Top tickers (daily snapshots + real-time)
 * - User profile
 * - Positions
 */

import fs from "fs";
import path from "path";
import { loadFirebaseUser } from "./firebase-auth.js";
import { FIREBASE_CONFIG } from "./firebase-config.js";

const DATA_DIR = path.join(process.cwd(), "data");
const TICKERS_CACHE_PATH = path.join(DATA_DIR, "tickers-cache.json");
const PROFILE_PATH = path.join(process.cwd(), "memory", "profile.md");
const TRADES_LOG_PATH = path.join(DATA_DIR, "trades-log.json");
const GOALS_PATH = path.join(DATA_DIR, "goals.json");
const BACKLOG_PATH = path.join(DATA_DIR, "backlog.json");
const THESIS_PATH = path.join(process.cwd(), "memory", "thesis.md");
const LIFE_SCORES_PATH = path.join(DATA_DIR, "life-scores.json");
const PROJECTS_DIR = path.join(process.cwd(), "projects");

// Firestore REST API base URL
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

/**
 * Convert a JS value to Firestore format
 */
const toFirestoreValue = (value) => {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
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

/**
 * Convert an object to Firestore document format
 */
const toFirestoreDoc = (obj) => {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    fields[key] = toFirestoreValue(value);
  }
  return { fields };
};

/**
 * Get the current user's ID token for authenticated requests
 */
const getIdToken = async () => {
  const user = loadFirebaseUser();
  if (!user?.idToken) {
    throw new Error("Not authenticated - please sign in with /account");
  }
  return user.idToken;
};

/**
 * Get the current user's UID
 */
const getUserId = () => {
  const user = loadFirebaseUser();
  if (!user?.localId) {
    throw new Error("Not authenticated");
  }
  return user.localId;
};

/**
 * Write a document to Firestore
 */
const writeDocument = async (collectionPath, docId, data) => {
  const idToken = await getIdToken();
  const url = `${FIRESTORE_BASE_URL}/${collectionPath}/${docId}?key=${FIREBASE_CONFIG.apiKey}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`
    },
    body: JSON.stringify(toFirestoreDoc(data))
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Firestore write failed: ${response.status} - ${error}`);
  }

  return await response.json();
};

/**
 * Get today's date string for daily snapshots
 */
const getTodayKey = () => {
  const now = new Date();
  return now.toISOString().split("T")[0]; // YYYY-MM-DD
};

/**
 * Load tickers from cache
 */
const loadTickers = () => {
  try {
    if (fs.existsSync(TICKERS_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(TICKERS_CACHE_PATH, "utf-8"));
    }
  } catch (e) {}
  return { tickers: [] };
};

/**
 * Load user profile
 */
const loadProfile = () => {
  try {
    if (fs.existsSync(PROFILE_PATH)) {
      return fs.readFileSync(PROFILE_PATH, "utf-8");
    }
  } catch (e) {}
  return "";
};

/**
 * Load positions/trades
 */
const loadPositions = () => {
  try {
    if (fs.existsSync(TRADES_LOG_PATH)) {
      return JSON.parse(fs.readFileSync(TRADES_LOG_PATH, "utf-8"));
    }
  } catch (e) {}
  return { positions: [], trades: [] };
};

// Track last ticker push to avoid duplicates (4 hour interval)
const TICKER_PUSH_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours
let lastTickerPush = 0;

/**
 * Push top tickers to Firestore (SHARED - not per user)
 * - Stores in tickers/realtime (current state - shared across all users)
 * - Stores in tickers/{date} (daily snapshot - shared)
 * - Only updates every 4 hours to avoid duplicates
 */
export const pushTickers = async (tickers = null, force = false) => {
  // Check if we need to push (4 hour interval)
  const now = Date.now();
  if (!force && lastTickerPush && (now - lastTickerPush) < TICKER_PUSH_INTERVAL) {
    console.log(`[FirestoreSync] Skipping ticker push - last push was ${Math.round((now - lastTickerPush) / 60000)}min ago`);
    return null;
  }

  const data = tickers || loadTickers();
  const topTickers = (data.tickers || [])
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 20)
    .map(t => ({
      symbol: t.symbol,
      name: t.name,
      price: t.price,
      change: t.change,
      changePercent: t.changePercent,
      score: t.score,
      rsi: t.rsi,
      macdTrend: t.macdTrend,
      volume: t.volume
    }));

  const payload = {
    tickers: topTickers,
    updatedAt: new Date().toISOString(),
    count: topTickers.length
  };

  // Push to SHARED collection (not per-user)
  await writeDocument("tickers", "realtime", payload);

  // Push daily snapshot (shared)
  const today = getTodayKey();
  await writeDocument("tickers", today, payload);

  lastTickerPush = now;
  console.log(`[FirestoreSync] Pushed ${topTickers.length} tickers to shared Firestore collection`);
  return payload;
};

/**
 * Push user profile to Firestore
 */
export const pushProfile = async () => {
  const userId = getUserId();
  const profileMd = loadProfile();
  const user = loadFirebaseUser();

  const payload = {
    profileMarkdown: profileMd,
    email: user?.email || "",
    displayName: user?.displayName || "",
    updatedAt: new Date().toISOString()
  };

  await writeDocument("users", userId, payload);
  console.log(`[FirestoreSync] Pushed profile to Firestore`);
  return payload;
};

/**
 * Push positions to Firestore
 */
export const pushPositions = async (positions = null) => {
  const userId = getUserId();
  const data = positions || loadPositions();

  const payload = {
    positions: data.positions || [],
    trades: (data.trades || []).slice(0, 50), // Last 50 trades
    updatedAt: new Date().toISOString()
  };

  await writeDocument(`users/${userId}/portfolio`, "positions", payload);
  console.log(`[FirestoreSync] Pushed ${payload.positions.length} positions to Firestore`);
  return payload;
};

/**
 * Load dashboard data from local files
 */
const loadDashboard = () => {
  const result = { goals: [], backlog: [], thesis: "", projects: [], lifeScores: null };

  try {
    if (fs.existsSync(GOALS_PATH)) {
      const data = JSON.parse(fs.readFileSync(GOALS_PATH, "utf-8"));
      result.goals = (data.goals || []).map(g => ({
        id: g.id,
        title: g.title,
        category: g.category || "",
        progress: g.progress || 0,
        status: g.status || "active",
        urgency: g.urgency || "normal",
        updatedAt: g.updatedAt || g.extractedAt || ""
      }));
    }
  } catch {}

  try {
    if (fs.existsSync(BACKLOG_PATH)) {
      const data = JSON.parse(fs.readFileSync(BACKLOG_PATH, "utf-8"));
      result.backlog = (data.items || [])
        .sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0))
        .slice(0, 30)
        .map(item => ({
          id: item.id,
          title: item.title,
          category: item.category || "",
          impactScore: item.impactScore || 0,
          urgency: item.urgency || "low",
          source: item.source || "",
          createdAt: item.createdAt || ""
        }));
    }
  } catch {}

  try {
    if (fs.existsSync(THESIS_PATH)) {
      result.thesis = fs.readFileSync(THESIS_PATH, "utf-8");
    }
  } catch {}

  try {
    if (fs.existsSync(PROJECTS_DIR)) {
      const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const projectMdPath = path.join(PROJECTS_DIR, dir.name, "PROJECT.md");
        let summary = "";
        let status = "active";
        if (fs.existsSync(projectMdPath)) {
          const content = fs.readFileSync(projectMdPath, "utf-8");
          // Extract first non-header line as summary
          const lines = content.split("\n").filter(l => l.trim() && !l.startsWith("#"));
          summary = (lines[0] || "").substring(0, 200);
          if (content.toLowerCase().includes("status: completed") || content.toLowerCase().includes("## completed")) {
            status = "completed";
          }
        }
        result.projects.push({
          name: dir.name,
          title: dir.name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          summary,
          status
        });
      }
    }
  } catch {}

  try {
    if (fs.existsSync(LIFE_SCORES_PATH)) {
      result.lifeScores = JSON.parse(fs.readFileSync(LIFE_SCORES_PATH, "utf-8"));
    }
  } catch {}

  return result;
};

/**
 * Push dashboard data to Firestore for PWA
 * Syncs goals, backlog, thesis, projects, life scores
 */
export const pushDashboard = async () => {
  const userId = getUserId();
  const data = loadDashboard();

  const payload = {
    goals: data.goals,
    backlog: data.backlog,
    thesis: data.thesis,
    projects: data.projects,
    lifeScores: data.lifeScores,
    goalCount: data.goals.length,
    projectCount: data.projects.length,
    backlogCount: data.backlog.length,
    updatedAt: new Date().toISOString()
  };

  await writeDocument(`users/${userId}/app`, "dashboard", payload);
  console.log(`[FirestoreSync] Pushed dashboard (${payload.goalCount} goals, ${payload.projectCount} projects, ${payload.backlogCount} backlog)`);
  return payload;
};

/**
 * Push all data to Firestore
 */
export const pushAll = async () => {
  const results = {
    tickers: null,
    profile: null,
    positions: null,
    dashboard: null,
    errors: []
  };

  try {
    results.tickers = await pushTickers();
  } catch (e) {
    results.errors.push(`Tickers: ${e.message}`);
  }

  try {
    results.profile = await pushProfile();
  } catch (e) {
    results.errors.push(`Profile: ${e.message}`);
  }

  try {
    results.positions = await pushPositions();
  } catch (e) {
    results.errors.push(`Positions: ${e.message}`);
  }

  try {
    results.dashboard = await pushDashboard();
  } catch (e) {
    results.errors.push(`Dashboard: ${e.message}`);
  }

  return results;
};

/**
 * Start real-time sync (pushes data periodically)
 */
let syncInterval = null;

export const startRealtimeSync = (intervalMs = 60000) => {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  // Push immediately
  pushAll().catch(e => console.error("[FirestoreSync] Initial push failed:", e.message));

  // Then push periodically
  syncInterval = setInterval(() => {
    pushAll().catch(e => console.error("[FirestoreSync] Sync failed:", e.message));
  }, intervalMs);

  console.log(`[FirestoreSync] Real-time sync started (every ${intervalMs / 1000}s)`);
};

export const stopRealtimeSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log("[FirestoreSync] Real-time sync stopped");
  }
};

/**
 * Check if user is authenticated for Firestore
 */
export const isAuthenticated = () => {
  try {
    const user = loadFirebaseUser();
    return Boolean(user?.idToken && user?.localId);
  } catch {
    return false;
  }
};

export default {
  pushTickers,
  pushProfile,
  pushPositions,
  pushDashboard,
  pushAll,
  startRealtimeSync,
  stopRealtimeSync,
  isAuthenticated
};
