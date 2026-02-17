/**
 * Firebase Context Sync Service
 *
 * Syncs rich user context to Firestore so the cloud function (System 1 / "waiter")
 * can give intelligent WhatsApp responses when BACKBONE (System 2 / "cook") is offline.
 *
 * Writes to: users/{userId}/syncedData/userContext  (comprehensive doc)
 *            users/{userId}/syncedData/portfolio     (backward compat)
 *            users/{userId}/syncedData/health        (backward compat)
 *            users/{userId}/syncedData/goals         (backward compat)
 *            users/{userId}/syncedData/lifeScores    (backward compat)
 *
 * Schedule: 4x/day (7AM, 12PM, 4PM, 9PM) + on-change triggers
 * Debounce: Min 5 min between syncs
 */

import fs from "fs";
import path from "path";
import { getDataDir, getMemoryDir, getProjectsDir } from "../paths.js";
import { loadFirebaseUser } from "./firebase-auth.js";
import { FIREBASE_CONFIG, FIRESTORE_BASE_URL } from "./firebase-config.js";

const TAG = "[ContextSync]";
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes debounce

// ── Firestore Field Converters (reused from dashboard-sync) ──────

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

// ── Auth Token ─────────────────────────────────────────────────────

let _authToken = null;
let _tokenExpiry = 0;

const getValidToken = async () => {
  if (_authToken && Date.now() < _tokenExpiry) return _authToken;

  try {
    const user = loadFirebaseUser();
    if (user?.stsTokenManager?.accessToken) {
      _authToken = user.stsTokenManager.accessToken;
      _tokenExpiry = Date.now() + 55 * 60 * 1000;
      return _authToken;
    }
    if (user?.idToken) {
      _authToken = user.idToken;
      _tokenExpiry = Date.now() + 55 * 60 * 1000;
      return _authToken;
    }
  } catch {}

  return null;
};

// ── Firestore Write ──────────────────────────────────────────────

const writeToFirestore = async (userId, docPath, data) => {
  const token = await getValidToken();
  if (!token) {
    console.warn(`${TAG} No auth token — skipping sync`);
    return false;
  }

  const url = `${FIRESTORE_BASE_URL}/users/${userId}/${docPath}?key=${FIREBASE_CONFIG.apiKey}`;
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
    throw new Error(`Firestore write failed (${docPath}): ${response.status} - ${err}`);
  }
  return true;
};

// ── Data Collectors ──────────────────────────────────────────────

const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();
const PROJECTS_DIR = getProjectsDir();

const readJsonSafe = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
};

const readFileSafe = (filePath, maxChars = 2000) => {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return content.slice(0, maxChars);
    }
  } catch {}
  return null;
};

/** Collect portfolio data */
const collectPortfolio = () => {
  const cache = readJsonSafe(path.join(DATA_DIR, "alpaca-cache.json"));
  if (!cache) return null;

  const positions = (cache.positions || []).map(p => ({
    symbol: p.symbol,
    qty: Number(p.qty),
    market_value: Number(p.market_value || 0),
    unrealized_pl: Number(p.unrealized_pl || 0),
    unrealized_plpc: Number(p.unrealized_plpc || 0),
    current_price: Number(p.current_price || 0)
  }));

  // Load analysis notes if available
  const portfolioNotes = readFileSafe(path.join(MEMORY_DIR, "portfolio-notes.md"), 1500);
  const portfolioMd = readFileSafe(path.join(MEMORY_DIR, "portfolio.md"), 1000);

  return {
    equity: Number(cache.account?.equity || 0),
    buyingPower: Number(cache.account?.buying_power || 0),
    dayPL: Number(cache.account?.equity || 0) - Number(cache.account?.last_equity || 0),
    positions,
    positionCount: positions.length,
    analysis: portfolioNotes || portfolioMd || null,
    updatedAt: cache.updatedAt || new Date().toISOString()
  };
};

/** Collect health data */
const collectHealth = () => {
  const oura = readJsonSafe(path.join(DATA_DIR, "oura-data.json"));
  if (!oura?.latest) return null;

  const sleep = oura.latest.sleep?.at(-1);
  const readiness = oura.latest.readiness?.at(-1);
  const activity = oura.latest.activity?.at(-1);
  const healthNotes = readFileSafe(path.join(MEMORY_DIR, "health-notes.md"), 1000);

  return {
    sleepScore: sleep?.score || null,
    sleepDuration: sleep?.total_sleep_duration ? Math.round(sleep.total_sleep_duration / 3600) : null,
    readiness: readiness?.score || null,
    activity: activity?.score || null,
    steps: activity?.steps || null,
    analysis: healthNotes || null,
    updatedAt: new Date().toISOString()
  };
};

/** Collect goals */
const collectGoals = () => {
  const goals = readJsonSafe(path.join(DATA_DIR, "goals.json"));
  if (!goals) return null;

  const goalsList = Array.isArray(goals) ? goals : (goals.goals || []);
  const active = goalsList.filter(g => g.status === "active").map(g => ({
    id: g.id,
    title: g.title,
    category: g.category,
    priority: g.priority,
    progress: g.progress || 0,
    tasks: (g.tasks || []).map(t => ({
      title: t.title || t,
      status: t.status || "pending"
    })).slice(0, 10)
  }));

  return {
    goals: active,
    totalActive: active.length,
    updatedAt: new Date().toISOString()
  };
};

/** Collect projects */
const collectProjects = () => {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) return null;

    const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .slice(0, 15);

    const projects = [];
    for (const dir of dirs) {
      const projectFile = path.join(PROJECTS_DIR, dir.name, "PROJECT.md");
      const content = readFileSafe(projectFile, 500);
      if (content) {
        // Extract first line as title, next few lines as description
        const lines = content.split("\n").filter(l => l.trim());
        const title = lines[0]?.replace(/^#+\s*/, "") || dir.name;
        const description = lines.slice(1, 4).join(" ").slice(0, 200);
        projects.push({
          name: dir.name,
          title,
          description,
        });
      }
    }

    return projects.length > 0 ? projects : null;
  } catch {
    return null;
  }
};

/** Collect thesis / current focus */
const collectThesis = () => {
  return readFileSafe(path.join(MEMORY_DIR, "thesis.md"), 1500);
};

/** Collect profile */
const collectProfile = () => {
  const settings = readJsonSafe(path.join(DATA_DIR, "user-settings.json"));
  const profileMd = readFileSafe(path.join(MEMORY_DIR, "profile.md"), 1000);

  return {
    name: settings?.displayName || settings?.name || null,
    phone: settings?.phoneNumber || null,
    preferences: profileMd || null,
    updatedAt: new Date().toISOString()
  };
};

/** Collect recent work / activity log */
const collectRecentWork = () => {
  const log = readJsonSafe(path.join(DATA_DIR, "activity-log.json"));
  if (!log) return null;

  const entries = Array.isArray(log) ? log : (log.entries || []);
  return entries.slice(-10).map(e => ({
    type: e.type || e.category,
    message: (e.message || e.description || "").slice(0, 150),
    timestamp: e.timestamp || e.createdAt
  }));
};

/** Collect life scores */
const collectLifeScores = () => {
  const scores = readJsonSafe(path.join(DATA_DIR, "life-scores.json"));
  if (!scores) return null;

  // Flatten scores for Firestore
  const flat = {};
  for (const [key, val] of Object.entries(scores)) {
    if (key === "updatedAt" || key === "lastSync") continue;
    flat[key] = typeof val === "object" ? (val.score ?? val.value ?? JSON.stringify(val)) : val;
  }
  flat.updatedAt = scores.updatedAt || new Date().toISOString();
  return flat;
};

/** Collect brokerage / Empower data (net worth, accounts, holdings) */
const collectBrokerage = () => {
  const brokerage = readJsonSafe(path.join(DATA_DIR, "brokerage-portfolio.json"));
  if (!brokerage) return null;

  return {
    totalNetWorth: brokerage.totalNetWorth || null,
    connectedBrokerages: (brokerage.connectedBrokerages || []).map(b => b.label || b.name),
    accountCount: (brokerage.accounts || []).length,
    accounts: (brokerage.accounts || []).slice(0, 15).map(a => ({
      name: a.name || a.accountName,
      type: a.type || a.accountType,
      balance: a.balance || a.value || 0
    })),
    topHoldings: (brokerage.holdings || []).slice(0, 15).map(h => ({
      name: h.name || h.ticker,
      value: h.value || 0,
      shares: h.shares || 0,
      brokerage: h.brokerage || null
    })),
    holdingCount: brokerage.holdingCount || 0,
    lastSync: brokerage.lastSync || null
  };
};

/** Collect beliefs */
const collectBeliefs = () => {
  const beliefs = readJsonSafe(path.join(DATA_DIR, "core-beliefs.json"));
  if (!beliefs) return null;

  const list = Array.isArray(beliefs) ? beliefs : (beliefs.beliefs || []);
  return list.map(b => ({
    name: b.name || b.title,
    description: (b.description || "").slice(0, 200)
  })).slice(0, 10);
};

// ── Context Sync Class ──────────────────────────────────────────

class FirebaseContextSync {
  constructor() {
    this.userId = null;
    this.lastSyncTime = 0;
    this.syncCount = 0;
    this.running = false;
  }

  /**
   * Initialize with the user's Firebase UID
   */
  initialize(userId) {
    if (!userId) return;
    this.userId = userId;
    this.running = true;
    console.log(`${TAG} Initialized for user: ${userId}`);
  }

  /**
   * Full sync — collects all user data and writes to Firestore
   */
  async syncAll() {
    if (!this.running || !this.userId) return false;

    // Debounce: skip if synced recently
    const elapsed = Date.now() - this.lastSyncTime;
    if (elapsed < MIN_SYNC_INTERVAL_MS) {
      console.log(`${TAG} Debounced — last sync ${Math.round(elapsed / 1000)}s ago`);
      return false;
    }

    console.log(`${TAG} Starting full context sync...`);
    const startTime = Date.now();

    try {
      // Collect all data
      const portfolio = collectPortfolio();
      const health = collectHealth();
      const goals = collectGoals();
      const projects = collectProjects();
      const thesis = collectThesis();
      const profile = collectProfile();
      const recentWork = collectRecentWork();
      const lifeScores = collectLifeScores();
      const beliefs = collectBeliefs();
      const brokerage = collectBrokerage();

      // Build comprehensive context document
      const userContext = {
        // Core data
        portfolio: portfolio ? {
          equity: portfolio.equity,
          buyingPower: portfolio.buyingPower,
          dayPL: portfolio.dayPL,
          positionCount: portfolio.positionCount,
          topPositions: (portfolio.positions || []).slice(0, 8).map(p =>
            `${p.symbol}: ${p.qty}sh $${p.market_value.toFixed(0)} (${(p.unrealized_plpc * 100).toFixed(1)}%)`
          ).join(", "),
          analysis: (portfolio.analysis || "").slice(0, 800)
        } : null,

        health: health || null,

        goals: goals ? {
          active: (goals.goals || []).map(g =>
            `${g.title} (${g.category}, ${g.progress}% done)`
          ).join("; "),
          count: goals.totalActive
        } : null,

        projects: projects ? projects.map(p =>
          `${p.title}: ${p.description}`
        ).join("; ").slice(0, 800) : null,

        thesis: thesis ? thesis.slice(0, 800) : null,

        profile: profile || null,

        recentWork: recentWork ? recentWork.map(e =>
          `[${e.type}] ${e.message}`
        ).join("; ").slice(0, 600) : null,

        beliefs: beliefs ? beliefs.map(b => b.name).join(", ") : null,

        brokerage: brokerage ? {
          netWorth: brokerage.totalNetWorth,
          connectedBrokerages: brokerage.connectedBrokerages.join(", "),
          accountCount: brokerage.accountCount,
          accounts: brokerage.accounts.map(a =>
            `${a.name} (${a.type}): $${Number(a.balance).toLocaleString()}`
          ).join("; ").slice(0, 800),
          topHoldings: brokerage.topHoldings.map(h =>
            `${h.name}: $${Number(h.value).toLocaleString()}`
          ).join(", ").slice(0, 600),
          holdingCount: brokerage.holdingCount,
          lastSync: brokerage.lastSync
        } : null,

        // Meta
        syncedAt: new Date().toISOString(),
        syncCount: ++this.syncCount,
        backboneVersion: "1.0.0"
      };

      // Write comprehensive doc
      await writeToFirestore(this.userId, "syncedData/userContext", userContext);

      // Write individual docs for backward compatibility
      const writes = [];

      if (portfolio) {
        writes.push(writeToFirestore(this.userId, "syncedData/portfolio", {
          equity: portfolio.equity,
          buyingPower: portfolio.buyingPower,
          positions: portfolio.positions.slice(0, 10),
          updatedAt: portfolio.updatedAt
        }));
      }

      if (health) {
        writes.push(writeToFirestore(this.userId, "syncedData/health", health));
      }

      if (goals) {
        writes.push(writeToFirestore(this.userId, "syncedData/goals", goals));
      }

      if (lifeScores) {
        writes.push(writeToFirestore(this.userId, "syncedData/lifeScores", lifeScores));
      }

      if (brokerage) {
        writes.push(writeToFirestore(this.userId, "syncedData/brokerage", brokerage));
      }

      await Promise.allSettled(writes);

      this.lastSyncTime = Date.now();
      const duration = Date.now() - startTime;
      console.log(`${TAG} Sync complete in ${duration}ms (${this.syncCount} total syncs)`);
      return true;

    } catch (err) {
      console.error(`${TAG} Sync failed:`, err.message);
      return false;
    }
  }

  /**
   * Trigger sync (debounced) — call from on-change events
   */
  triggerSync(reason = "on-change") {
    if (!this.running || !this.userId) return;

    const elapsed = Date.now() - this.lastSyncTime;
    if (elapsed < MIN_SYNC_INTERVAL_MS) {
      return; // Silently skip — too recent
    }

    console.log(`${TAG} Triggered: ${reason}`);
    // Run async, don't block caller
    this.syncAll().catch(err => {
      console.error(`${TAG} Triggered sync failed:`, err.message);
    });
  }

  /**
   * Get status for API/display
   */
  getStatus() {
    return {
      running: this.running,
      userId: this.userId,
      lastSyncTime: this.lastSyncTime ? new Date(this.lastSyncTime).toISOString() : null,
      syncCount: this.syncCount,
      minutesSinceSync: this.lastSyncTime
        ? Math.round((Date.now() - this.lastSyncTime) / 60000)
        : null
    };
  }

  stop() {
    this.running = false;
  }
}

// ── Singleton ───────────────────────────────────────────────────

let instance = null;

export function getFirebaseContextSync() {
  if (!instance) {
    instance = new FirebaseContextSync();
  }
  return instance;
}

export default FirebaseContextSync;
