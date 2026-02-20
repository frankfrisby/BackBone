import express from "express";
import http from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { getDataDir, getMemoryDir, getActiveUser } from "./services/paths.js";
import {
  createLinkedInAuthRequest,
  exchangeLinkedInCode,
  getLinkedInConfig,
  buildLinkedInProfile,
  fetchLinkedInMessages,
  buildLinkedInSyncPayload,
  saveLinkedInSync,
  loadLinkedInSync
} from "./services/integrations/linkedin.js";

const app = express();
const server = http.createServer(app);
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || "http://localhost:3000/linkedin/callback";

// If the API server was spawned by the CLI, self-terminate when the parent process disappears.
// This prevents "Server already running on port 3000" after closing the CLI window on Windows.
const parentPid = Number.parseInt(process.env.BACKBONE_PARENT_PID || "", 10);
if (Number.isFinite(parentPid) && parentPid > 0) {
  let shuttingDown = false;
  const t = setInterval(() => {
    if (shuttingDown) return;
    try {
      process.kill(parentPid, 0); // check parent existence
    } catch {
      shuttingDown = true;
      try {
        server.close(() => process.exit(0));
      } catch {
        process.exit(0);
      }
    }
  }, 2000);
  t.unref();
}

// Write PID file so the CLI can find and kill us reliably
const DATA_DIR_PID = getDataDir();
const PID_FILE = path.join(DATA_DIR_PID, "server.pid");
try {
  if (!fs.existsSync(DATA_DIR_PID)) fs.mkdirSync(DATA_DIR_PID, { recursive: true });
  fs.writeFileSync(PID_FILE, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
} catch {}

// Clean up PID file on exit
const cleanupPidFile = () => {
  try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch {}
};
process.on("exit", cleanupPidFile);

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For Twilio webhooks (form data)

// ── CORS for web app ────────────────────────────────────────
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// ── Health ───────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ ok: true, status: "healthy", version: "1.0.0" });
});

// ── User Profile ─────────────────────────────────────────────

app.get("/api/user/profile", async (req, res) => {
  const user = getActiveUser();
  let photoURL = user.photoURL || null;

  // Fallback: check firebase-user.json for photo if active-user doesn't have one
  if (!photoURL) {
    try {
      const fbUserPath = path.join(getDataDir(), "firebase-user.json");
      if (fs.existsSync(fbUserPath)) {
        const fbUser = JSON.parse(fs.readFileSync(fbUserPath, "utf-8"));
        photoURL = fbUser.picture || fbUser.photoURL || null;
        if (!user.displayName || user.displayName === "User") {
          user.displayName = fbUser.name || fbUser.displayName || user.displayName;
        }
        if (!user.email) {
          user.email = fbUser.email || user.email;
        }
      }
    } catch {}
  }

  res.json({
    uid: user.uid || "local",
    displayName: user.displayName || "User",
    email: user.email || null,
    photoURL,
  });
});

// ── Dashboard Cache (fast startup) ──────────────────────────

const dashboardCacheFile = path.join(getDataDir(), "dashboard-cache.json");
let dashboardCache = null;
let dashboardCacheAge = 0;

function readJsonSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {}
  return null;
}

function buildDashboardCache() {
  const dataDir = getDataDir();
  const now = Date.now();

  // Only rebuild if cache is older than 10 seconds
  if (dashboardCache && (now - dashboardCacheAge) < 10000) return dashboardCache;

  const alpacaCache = readJsonSafe(path.join(dataDir, "alpaca-cache.json"));
  const tickersCache = readJsonSafe(path.join(dataDir, "tickers-cache.json"));
  const ouraData = readJsonSafe(path.join(dataDir, "oura-data.json"));
  const goals = readJsonSafe(path.join(dataDir, "goals.json"));
  const lifeScores = readJsonSafe(path.join(dataDir, "life-scores.json"));
  const tradesLog = readJsonSafe(path.join(dataDir, "trades-log.json"));
  const predictionCache = readJsonSafe(path.join(dataDir, "prediction-cache.json"));
  const user = getActiveUser();
  let photoURL = user.photoURL || null;
  let displayName = user.displayName || "User";
  let email = user.email || null;

  // Fallback to firebase-user.json for photo
  if (!photoURL) {
    try {
      const fbUserPath = path.join(dataDir, "firebase-user.json");
      if (fs.existsSync(fbUserPath)) {
        const fbUser = JSON.parse(fs.readFileSync(fbUserPath, "utf-8"));
        photoURL = fbUser.picture || fbUser.photoURL || null;
        if (displayName === "User") displayName = fbUser.name || fbUser.displayName || displayName;
        if (!email) email = fbUser.email || email;
      }
    } catch {}
  }

  const goalsList = Array.isArray(goals)
    ? goals
    : Array.isArray(goals?.goals)
    ? goals.goals
    : [];

  // Per-source freshness — file mtime tells when data was last written
  const fileFreshness = (filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        return { updatedAt: stat.mtime.toISOString(), ageSeconds: Math.round((now - stat.mtimeMs) / 1000) };
      }
    } catch {}
    return null;
  };

  dashboardCache = {
    user: {
      uid: user.uid || "local",
      displayName,
      email,
      photoURL,
    },
    portfolio: alpacaCache?.portfolio || null,
    positions: alpacaCache?.positions || [],
    tickers: tickersCache?.tickers?.slice(0, 20) || [],
    health: {
      sleep: ouraData?.latest?.sleep?.at(-1) || null,
      readiness: ouraData?.latest?.readiness?.at(-1) || null,
      activity: ouraData?.latest?.activity?.at(-1) || null,
    },
    goals: goalsList.filter(g => g.status === "active").slice(0, 10),
    lifeScores: lifeScores || null,
    recentTrades: Array.isArray(tradesLog) ? tradesLog.slice(-5) : [],
    predictions: predictionCache ? { totalTickers: Object.keys(predictionCache).length } : null,
    _meta: {
      cachedAt: new Date().toISOString(),
      freshness: {
        portfolio: fileFreshness(path.join(dataDir, "alpaca-cache.json")),
        tickers: fileFreshness(path.join(dataDir, "tickers-cache.json")),
        health: fileFreshness(path.join(dataDir, "oura-data.json")),
        goals: fileFreshness(path.join(dataDir, "goals.json")),
        lifeScores: fileFreshness(path.join(dataDir, "life-scores.json")),
        trades: fileFreshness(path.join(dataDir, "trades-log.json")),
      },
    },
    cachedAt: new Date().toISOString(),
  };

  dashboardCacheAge = now;

  // Also persist to disk for even faster cold starts
  try { fs.writeFileSync(dashboardCacheFile, JSON.stringify(dashboardCache)); } catch {}

  return dashboardCache;
}

app.get("/api/dashboard-cache", (req, res) => {
  const cache = buildDashboardCache();
  res.json(cache);
});

// ── SSE Real-Time Event Stream ───────────────────────────────

const sseClients = new Set();
const lastEventByType = new Map();
const SSE_THROTTLE_MS = 1000; // Max 1 event per type per second

/**
 * Broadcast an event to all connected SSE clients.
 * Called by any handler/service to push real-time updates.
 */
export function broadcastEvent(type, data = {}) {
  const now = Date.now();
  const lastTime = lastEventByType.get(type) || 0;
  if (now - lastTime < SSE_THROTTLE_MS) return; // Throttle
  lastEventByType.set(type, now);

  const event = { type, data, timestamp: new Date().toISOString() };
  const payload = `data: ${JSON.stringify(event)}\n\n`;

  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

app.get("/api/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

  sseClients.add(res);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ── File Watcher for Real-Time Data Updates ──────────────────

const dataDir = getDataDir();
const WATCHED_FILES = {
  "alpaca-cache.json": "portfolio_update",
  "tickers-cache.json": "ticker_update",
  "oura-data.json": "health_update",
  "goals.json": "goals_update",
  "trades-log.json": "trade_update",
  "life-scores.json": "life_scores_update",
  "prediction-cache.json": "prediction_update",
  "engine-supervisor.json": "engine_update",
};

const fileWatchDebounce = new Map();

function startFileWatchers() {
  for (const [filename, eventType] of Object.entries(WATCHED_FILES)) {
    const filePath = path.join(dataDir, filename);
    try {
      if (!fs.existsSync(filePath)) continue;
      fs.watch(filePath, { persistent: false }, (changeType) => {
        if (changeType !== "change") return;
        // Debounce: ignore changes within 500ms of each other
        const now = Date.now();
        const lastChange = fileWatchDebounce.get(filename) || 0;
        if (now - lastChange < 500) return;
        fileWatchDebounce.set(filename, now);

        // Invalidate dashboard cache on any data file change
        dashboardCacheAge = 0;

        // Read the file and broadcast
        try {
          const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
          broadcastEvent(eventType, summarizeFileData(eventType, content));
        } catch {
          broadcastEvent(eventType, { updated: true });
        }
      });
    } catch {
      // File doesn't exist yet, skip
    }
  }
}

function summarizeFileData(eventType, data) {
  switch (eventType) {
    case "portfolio_update": {
      const acct = data.account;
      if (!acct) return { updated: true };
      return {
        equity: parseFloat(acct.equity) || 0,
        buyingPower: parseFloat(acct.buying_power) || 0,
        cash: parseFloat(acct.cash) || 0,
        dayPL: parseFloat(acct.equity) - parseFloat(acct.last_equity || acct.equity),
        positionCount: Array.isArray(data.positions) ? data.positions.length : 0,
        positions: (data.positions || []).slice(0, 10).map(p => ({
          symbol: p.symbol,
          qty: parseFloat(p.qty),
          pl: parseFloat(p.unrealized_pl) || 0,
          price: parseFloat(p.current_price) || 0,
          change: parseFloat(p.change_today) * 100 || 0,
        })),
      };
    }
    case "ticker_update": {
      const tickers = Array.isArray(data.tickers) ? data.tickers : [];
      return {
        count: tickers.length,
        top5: tickers
          .filter(t => t.score != null)
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .slice(0, 5)
          .map(t => ({ symbol: t.symbol, score: t.score, price: t.price, change: t.changePercent })),
      };
    }
    case "health_update": {
      const latest = data.latest || {};
      const sleep = Array.isArray(latest.sleep) ? latest.sleep[latest.sleep.length - 1] : null;
      const readiness = Array.isArray(latest.readiness) ? latest.readiness[latest.readiness.length - 1] : null;
      return {
        sleepScore: sleep?.score || null,
        readinessScore: readiness?.score || null,
      };
    }
    case "trade_update": {
      const trades = Array.isArray(data) ? data : [];
      const latest = trades[trades.length - 1];
      return { totalTrades: trades.length, latest: latest || null };
    }
    case "engine_update":
      return {
        shouldBeRunning: data.shouldBeRunning,
        state: data.state,
        currentTask: data.currentTask,
      };
    default:
      return { updated: true };
  }
}

// Start file watchers after a short delay to let the server boot
setTimeout(startFileWatchers, 2000);

// ── WebSocket Server ─────────────────────────────────────────
let WebSocketServer;
try {
  const wsModule = await import("ws");
  WebSocketServer = wsModule.WebSocketServer;
} catch {
  console.log("ws module not available, WebSocket disabled");
}

if (WebSocketServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    let userId = null;

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // Auth handshake
        if (msg.type === "auth") {
          userId = msg.userId;
          ws.send(JSON.stringify({ type: "auth_ok", userId }));
          return;
        }

        // Ping/pong
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        // Command request
        if (msg.requestId && msg.command) {
          handleWSCommand(msg.command, msg, ws, msg.requestId);
          return;
        }
      } catch (err) {
        ws.send(JSON.stringify({ error: "Invalid message format" }));
      }
    });

    ws.on("close", () => {
      userId = null;
    });
  });

  async function handleWSCommand(command, payload, ws, requestId) {
    try {
      let result;
      switch (command) {
        case "chat":
          result = await handleChat(payload.message || payload.payload?.message);
          break;
        case "portfolio":
          result = await handlePortfolio();
          break;
        case "positions":
          result = await handlePositions();
          break;
        case "signals":
          result = await handleSignals();
          break;
        case "health":
          result = await handleHealth();
          break;
        case "goals":
          result = await handleGoals();
          break;
        case "calendar":
          result = await handleCalendar();
          break;
        case "news":
          result = await handleNews();
          break;
        case "videos":
          result = await handleVideos(payload.query);
          break;
        default:
          result = { error: `Unknown command: ${command}` };
      }
      ws.send(JSON.stringify({ requestId, result }));
    } catch (err) {
      ws.send(JSON.stringify({ requestId, error: err.message }));
    }
  }

  console.log("WebSocket server enabled at /ws");
}

// ── API Endpoints ────────────────────────────────────────────

// Point AI switching (claude ↔ codex)
app.get("/api/point-ai", async (req, res) => {
  const { getSetting } = await import("./services/user-settings.js");
  res.json({ pointAI: getSetting("pointAI") || "claude" });
});
app.post("/api/point-ai", async (req, res) => {
  const { updateSetting, getSetting } = await import("./services/user-settings.js");
  const { pointAI } = req.body;
  if (!["claude", "codex"].includes(pointAI)) {
    return res.status(400).json({ error: "pointAI must be 'claude' or 'codex'" });
  }
  updateSetting("pointAI", pointAI);
  console.log(`[Settings] Point AI switched to: ${pointAI}`);
  res.json({ pointAI, message: `Point AI set to ${pointAI}` });
});

// Chat
app.post("/api/chat", async (req, res) => {
  try {
    const result = await handleChat(req.body.message);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Portfolio
app.get("/api/portfolio", async (req, res) => {
  try {
    const result = await handlePortfolio();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/portfolio", async (req, res) => {
  try {
    const result = await handlePortfolio();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Positions
app.get("/api/positions", async (req, res) => {
  try {
    const result = await handlePositions();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/positions", async (req, res) => {
  try {
    const result = await handlePositions();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Signals
app.get("/api/signals", async (req, res) => {
  try {
    const result = await handleSignals();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/signals", async (req, res) => {
  try {
    const result = await handleSignals();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health
app.get("/api/health", async (req, res) => {
  try {
    const result = await handleHealth();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/health", async (req, res) => {
  try {
    const result = await handleHealth();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Machine Profile (local software/capability discovery)
app.get("/api/machine-profile", async (req, res) => {
  try {
    const { getMachineProfileManager } = await import("./services/machine-profile.js");
    const manager = getMachineProfileManager();
    const profile = await manager.discoverProfile();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/machine-profile/refresh", async (req, res) => {
  try {
    const { getMachineProfileManager } = await import("./services/machine-profile.js");
    const manager = getMachineProfileManager();
    const profile = await manager.discoverProfile({ forceRefresh: true });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/machine-profile/plan", async (req, res) => {
  try {
    const { message, analysis, capabilityIds } = req.body || {};
    const { getMachineProfileManager } = await import("./services/machine-profile.js");
    const manager = getMachineProfileManager();
    const profile = await manager.discoverProfile();
    const plan = manager.planForRequest({
      message: message || "",
      analysis: analysis || null,
      capabilityIds: Array.isArray(capabilityIds) ? capabilityIds : [],
      machineProfile: profile
    });
    res.json({ profile, plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Goals
app.get("/api/goals", async (req, res) => {
  try {
    const result = await handleGoals();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/goals", async (req, res) => {
  try {
    const result = await handleGoals();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Calendar
app.get("/api/calendar", async (req, res) => {
  try {
    const result = await handleCalendar();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/calendar", async (req, res) => {
  try {
    const result = await handleCalendar();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tickers — top scored tickers for dashboard widgets
app.get("/api/tickers", async (req, res) => {
  try {
    const result = await handleTickers();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Market Indicators — SPY change + recession score for ticker bar
app.get("/api/market-indicators", async (req, res) => {
  try {
    const dataDir = getDataDir();

    // SPY data from tickers cache
    let spyChange = null;
    try {
      const cachePath = path.join(dataDir, "tickers-cache.json");
      if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
        const tickers = Array.isArray(cache) ? cache : (cache.tickers || []);
        const spy = tickers.find(t => t.symbol === "SPY");
        if (spy) spyChange = spy.changePercent || 0;
      }
    } catch {}

    // Recession score
    let recession = { score: 5.0 };
    try {
      const { default: getRecessionScore } = await import("./services/trading/recession-score.js");
      recession = getRecessionScore();
    } catch {}

    res.json({ spyChange, recessionScore: recession.score });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Life Scores
app.get("/api/life-scores", async (req, res) => {
  try {
    const result = await handleLifeScores();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trade execution
app.post("/api/trade", async (req, res) => {
  try {
    const { symbol, action, quantity } = req.body || {};
    if (!symbol || !action || !quantity) {
      return res.status(400).json({ error: "Missing symbol, action, or quantity" });
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 100000) {
      return res.status(400).json({ error: "Quantity must be a positive number (max 100000)" });
    }
    if (!["buy", "sell"].includes(action)) {
      return res.status(400).json({ error: "Action must be 'buy' or 'sell'" });
    }
    const { getAlpacaConfig } = await import("./services/trading/alpaca.js");
    const config = getAlpacaConfig();
    if (!config.ready) {
      return res.status(503).json({ error: "Trading not configured" });
    }
    const side = action === "sell" ? "sell" : "buy";
    const orderRes = await fetch(`${config.baseUrl}/v2/orders`, {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID": config.key,
        "APCA-API-SECRET-KEY": config.secret,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        symbol, qty: String(quantity), side, type: "market", time_in_force: "day"
      })
    });
    const order = await orderRes.json();
    if (!orderRes.ok) {
      return res.status(orderRes.status).json({ error: order.message || "Order failed" });
    }
    res.json({ ok: true, orderId: order.id, symbol, side, quantity, status: order.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// News
app.get("/api/news", async (req, res) => {
  try {
    const result = await handleNews();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/news", async (req, res) => {
  try {
    const result = await handleNews();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Videos
app.get("/api/videos", async (req, res) => {
  try {
    const result = await handleVideos(req.query.q);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/videos", async (req, res) => {
  try {
    const result = await handleVideos(req.body.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Autonomous Engine ─────────────────────────────────────────

app.get("/api/engine/status", async (req, res) => {
  try {
    const { getAutonomousEngine } = await import("./services/engine/autonomous-engine.js");
    const engine = getAutonomousEngine();
    res.json({
      running: engine.running,
      ...engine.getDisplayData(),
      handoff: engine.loadHandoff()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/engine/start", async (req, res) => {
  try {
    const { getAutonomousEngine } = await import("./services/engine/autonomous-engine.js");
    const engine = getAutonomousEngine();
    if (engine.running) {
      res.json({ ok: false, message: "Engine already running" });
      return;
    }
    engine.startAutonomousLoop().catch(err => {
      console.error("[Engine] Loop exited:", err.message);
    });
    res.json({ ok: true, message: "Engine started" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/engine/stop", async (req, res) => {
  try {
    const { getAutonomousEngine } = await import("./services/engine/autonomous-engine.js");
    const engine = getAutonomousEngine();
    if (!engine.running) {
      res.json({ ok: false, message: "Engine not running" });
      return;
    }
    engine.stopAutonomousLoop();
    res.json({ ok: true, message: "Engine stopped" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/engine/pause", async (req, res) => {
  try {
    const { getAutonomousEngine } = await import("./services/engine/autonomous-engine.js");
    const engine = getAutonomousEngine();
    if (!engine.running) {
      res.json({ ok: false, message: "Engine not running" });
      return;
    }
    engine.stopAutonomousLoop();
    res.json({ ok: true, message: "Engine paused" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/engine/resume", async (req, res) => {
  try {
    const { getAutonomousEngine } = await import("./services/engine/autonomous-engine.js");
    const engine = getAutonomousEngine();
    if (engine.running) {
      res.json({ ok: false, message: "Engine already running" });
      return;
    }
    engine.startAutonomousLoop().catch(err => {
      console.error("[Engine] Loop exited:", err.message);
    });
    res.json({ ok: true, message: "Engine resumed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Engine supervisor — continuity tracking
app.get("/api/engine/supervisor", async (req, res) => {
  try {
    const { getEngineSupervisor } = await import("./services/engine/engine-supervisor.js");
    const supervisor = getEngineSupervisor();
    res.json(supervisor.getFullStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/engine/continuity", async (req, res) => {
  try {
    const { getEngineSupervisor } = await import("./services/engine/engine-supervisor.js");
    const supervisor = getEngineSupervisor();
    res.json(supervisor.getContinuityProof());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Continuous Improvement Engine ────────────────────────────
let continuousEngine = null;

async function getOrCreateContinuousEngine() {
  if (!continuousEngine) {
    const { getContinuousEngine } = await import("./services/continuous-engine.js");
    continuousEngine = getContinuousEngine();

    // Wire events to SSE broadcast + activity log
    continuousEngine.on("started", () => {
      broadcastEvent("engine", { status: "running", type: "continuous" });
      logActivity("engine", "Continuous engine started");
    });
    continuousEngine.on("stopped", () => {
      broadcastEvent("engine", { status: "stopped", type: "continuous" });
      logActivity("engine", "Continuous engine stopped");
    });
    continuousEngine.on("paused", () => {
      broadcastEvent("engine", { status: "paused", type: "continuous" });
    });
    continuousEngine.on("resumed", () => {
      broadcastEvent("engine", { status: "running", type: "continuous" });
    });
    continuousEngine.on("resting", ({ durationMs }) => {
      broadcastEvent("engine", { status: "resting", restMs: durationMs, type: "continuous" });
    });
    continuousEngine.on("plan", (action) => {
      broadcastEvent("engine", { status: "working", action: action.label, strategy: action.strategy, type: "continuous" });
      logActivity("engine", `Planning: ${action.label} (${action.strategy})`);
    });
    continuousEngine.on("cycle-complete", (cycleData) => {
      const { action, reward, cycleCount, delta, handoff } = cycleData;
      broadcastEvent("engine", { status: "cycle_done", action: action.label, reward, cycleCount, type: "continuous" });
      logActivity("engine", `Cycle ${cycleCount}: ${action.label} → reward ${reward.toFixed(3)}`);

      // Send meaningful cycle summaries to WhatsApp (skip low-impact cycles)
      if (Math.abs(reward) > 0.02) {
        sendCycleToWhatsApp(cycleData).catch(() => {});
      }
    });
    continuousEngine.on("error", ({ error }) => {
      logActivity("engine", `Error: ${error}`);
    });
  }
  return continuousEngine;
}

app.get("/api/engine/continuous", async (req, res) => {
  try {
    const engine = await getOrCreateContinuousEngine();
    res.json(engine.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/engine/continuous/start", async (req, res) => {
  try {
    const engine = await getOrCreateContinuousEngine();
    const result = await engine.start();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/engine/continuous/stop", async (req, res) => {
  try {
    const engine = await getOrCreateContinuousEngine();
    engine.stop();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/engine/continuous/pause", async (req, res) => {
  try {
    const engine = await getOrCreateContinuousEngine();
    engine.pause();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/engine/continuous/resume", async (req, res) => {
  try {
    const engine = await getOrCreateContinuousEngine();
    engine.resume();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/engine/continuous/nudge", async (req, res) => {
  try {
    const { action } = req.body;
    const engine = await getOrCreateContinuousEngine();
    engine.nudge(action);
    res.json({ ok: true, message: `Nudged to: ${action}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Firebase Context Sync API ─────────────────────────────────

app.get("/api/context-sync/status", async (req, res) => {
  try {
    const { getFirebaseContextSync } = await import("./services/firebase/firebase-context-sync.js");
    const sync = getFirebaseContextSync();
    res.json(sync.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/context-sync/trigger", async (req, res) => {
  try {
    const { getFirebaseContextSync } = await import("./services/firebase/firebase-context-sync.js");
    const sync = getFirebaseContextSync();
    const success = await sync.syncAll();
    res.json({ ok: success, message: success ? "Context synced" : "Debounced or failed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Parallel Agents API ──────────────────────────────────────

app.get("/api/agents/status", async (req, res) => {
  try {
    const { getParallelAgentsManager } = await import("./services/ai/parallel-agents.js");
    const manager = getParallelAgentsManager();
    res.json(manager.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/agents/history", async (req, res) => {
  try {
    const { getParallelAgentsManager } = await import("./services/ai/parallel-agents.js");
    const manager = getParallelAgentsManager();
    res.json(manager.getHistory());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/agents/output/:agentId", async (req, res) => {
  try {
    const { getParallelAgentsManager } = await import("./services/ai/parallel-agents.js");
    const manager = getParallelAgentsManager();
    const output = manager.getAgentOutput(req.params.agentId);
    if (!output) return res.status(404).json({ error: "Agent not found" });
    res.json(output);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/agents/run", async (req, res) => {
  try {
    const { tasks, timeout, model } = req.body;
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: "Provide an array of tasks: [{ name, task }]" });
    }
    const { getParallelAgentsManager } = await import("./services/ai/parallel-agents.js");
    const manager = getParallelAgentsManager();

    // Wire SSE broadcasts
    manager.removeAllListeners("agent-progress");
    manager.on("agent-progress", (event) => broadcastEvent("agents", event));
    manager.on("session-completed", (event) => broadcastEvent("agents", { type: "session-completed", ...event }));

    // Start async — respond immediately with session ID
    const sessionPromise = manager.runParallel(tasks, { timeout, model });
    // Wait just a moment for validation errors
    await new Promise(r => setTimeout(r, 200));

    const status = manager.getStatus();
    if (!status.active && status.state !== "running") {
      // Probably failed validation
      const result = await sessionPromise;
      return res.json(result);
    }

    res.json({ success: true, sessionId: status.sessionId, agents: status.agents.map(a => ({ id: a.id, name: a.name, state: a.state })) });

    // Let the session complete in background
    sessionPromise.catch(err => console.error("[ParallelAgents] Session error:", err.message));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/agents/stop", async (req, res) => {
  try {
    const { getParallelAgentsManager } = await import("./services/ai/parallel-agents.js");
    const manager = getParallelAgentsManager();
    const result = manager.stopAll();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/agents/stop/:agentId", async (req, res) => {
  try {
    const { getParallelAgentsManager } = await import("./services/ai/parallel-agents.js");
    const manager = getParallelAgentsManager();
    const result = manager.stopAgent(req.params.agentId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WhatsApp Integration Helpers ─────────────────────────────

/**
 * Send engine cycle summary to WhatsApp (only meaningful cycles)
 */
async function sendCycleToWhatsApp(cycleData) {
  try {
    const { getWhatsAppNotifications } = await import("./services/messaging/whatsapp-notifications.js");
    const { formatCycleSummary } = await import("./services/messaging/whatsapp-formatter.js");
    const notifications = getWhatsAppNotifications();
    if (!notifications.enabled) {
      try { await notifications.initialize("default"); } catch {}
    }
    if (!notifications.enabled) return;

    const message = formatCycleSummary(cycleData);
    await notifications.send("system", message, {
      identifier: `cycle_${cycleData.cycleCount}`,
      allowDuplicate: false,
    });
  } catch (err) {
    console.log("[Server] WhatsApp cycle notification failed:", err.message);
  }
}

/**
 * Mirror a chat response to WhatsApp (when user types in BACKBONE message box)
 */
async function sendChatResponseToWhatsApp(responseContent) {
  try {
    const { getWhatsAppNotifications } = await import("./services/messaging/whatsapp-notifications.js");
    const { formatAIResponse, chunkMessage } = await import("./services/messaging/whatsapp-formatter.js");
    const { getTwilioWhatsApp } = await import("./services/messaging/twilio-whatsapp.js");

    const notifications = getWhatsAppNotifications();
    if (!notifications.enabled) {
      try { await notifications.initialize("default"); } catch {}
    }
    if (!notifications.enabled || !notifications.phoneNumber) return;

    const whatsapp = getTwilioWhatsApp();
    if (!whatsapp.initialized) {
      const initResult = await whatsapp.initialize();
      if (!initResult.success) return;
    }

    const formatted = formatAIResponse(responseContent);
    const chunks = chunkMessage(formatted);

    for (const chunk of chunks) {
      await whatsapp.sendMessage(notifications.phoneNumber, chunk);
    }
  } catch (err) {
    console.log("[Server] WhatsApp chat mirror failed:", err.message);
  }
}

// Push notification token registration
app.post("/api/register-push", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: "Missing FCM token" });
      return;
    }
    // Store token in data directory
    const tokensPath = path.join(dataDir, "fcm-tokens.json");
    let tokens = [];
    try {
      if (fs.existsSync(tokensPath)) {
        const parsed = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
        tokens = Array.isArray(parsed) ? parsed : [];
      }
    } catch { /* ignore */ }
    if (!tokens.includes(token)) {
      tokens.push(token);
      fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
    }
    res.json({ ok: true, registered: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Handler Functions ────────────────────────────────────────

async function handleChat(message) {
  if (!message) return { role: "assistant", content: "No message provided.", timestamp: Date.now() };

  let chatResult = null;
  let agenticError = null;

  // Primary path: use agentic executor (Claude -> Codex fallback on rate limits)
  try {
    const { executeAgenticTask, getAgenticCapabilities } = await import("./services/ai/multi-ai.js");
    const capabilities = await getAgenticCapabilities();

    if (capabilities.available) {
      // Load context files for the prompt
      let contextSnippet = "";
      try {
        const goalsPath = path.join(dataDir, "goals.json");
        const cachePath = path.join(dataDir, "alpaca-cache.json");
        if (fs.existsSync(goalsPath)) {
          const goals = JSON.parse(fs.readFileSync(goalsPath, "utf8"));
          const active = (Array.isArray(goals) ? goals : goals.goals || []).filter(g => g.status === "active").slice(0, 5);
          if (active.length) contextSnippet += `\nActive goals: ${active.map(g => g.title).join(", ")}`;
        }
        if (fs.existsSync(cachePath)) {
          const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
          if (cache.account?.equity) contextSnippet += `\nPortfolio equity: $${parseFloat(cache.account.equity).toFixed(2)}`;
        }
      } catch { /* context loading is best-effort */ }

      const prompt = `You are BACKBONE, a life optimization AI assistant. You help the user manage their portfolio, health, goals, and daily life. Be concise and actionable. Keep responses under 3 sentences for data queries, longer for analysis or advice.${contextSnippet}\n\nUser: ${message}`;

      const result = await executeAgenticTask(prompt, process.cwd(), null, {
        alwaysTryClaude: true
      });
      if (result.success && result.output) {
        chatResult = { role: "assistant", content: result.output.trim(), timestamp: Date.now() };
      } else {
        agenticError = result.error || "Agentic CLI returned no output";
        console.log("[Server] Agentic chat failed:", agenticError);
      }
    } else {
      agenticError = "No CLI agent tools available (Claude/Codex CLI)";
    }
  } catch (cliErr) {
    agenticError = cliErr.message || "Agentic CLI unavailable";
    console.log("[Server] Agentic tools unavailable for chat:", agenticError);
  }

  // CLI-only behavior: do not fall back to API chat path.
  if (!chatResult) {
    chatResult = {
      role: "assistant",
      content: `Agentic CLI is unavailable right now (${agenticError || "unknown error"}). Start Claude/Codex CLI and try again.`,
      timestamp: Date.now(),
    };
  }

  // Mirror the response to WhatsApp (async, non-blocking)
  if (chatResult?.content) {
    sendChatResponseToWhatsApp(chatResult.content).catch(() => {});
  }

  return chatResult;
}

async function handlePortfolio() {
  // Try live Alpaca data first
  try {
    const { getAlpacaConfig, fetchAccount } = await import("./services/trading/alpaca.js");
    const config = getAlpacaConfig();
    if (config.ready) {
      const account = await fetchAccount(config);
      if (account && account.equity) {
        const equity = parseFloat(account.equity) || 0;
        const lastEquity = parseFloat(account.last_equity) || equity;
        const dayPL = equity - lastEquity;
        const dayPLPercent = lastEquity > 0 ? (dayPL / lastEquity) * 100 : 0;
        // Cache for brief generator
        try {
          const cachePath = path.join(dataDir, "alpaca-cache.json");
          const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
          cache.account = account;
          cache.updatedAt = new Date().toISOString();
          fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
        } catch { /* ignore cache write failure */ }
        return {
          equity,
          buyingPower: parseFloat(account.buying_power) || 0,
          cash: parseFloat(account.cash) || 0,
          dayPL: Math.round(dayPL * 100) / 100,
          dayPLPercent: Math.round(dayPLPercent * 100) / 100,
          totalPL: Math.round((equity - (parseFloat(account.deposits || 0))) * 100) / 100,
          totalPLPercent: 0,
          status: account.status,
          source: "live"
        };
      }
    }
  } catch (e) {
    console.log("[Server] Alpaca portfolio fetch failed, using cache:", e.message);
  }

  // Fallback to cached data
  const dataPath = path.join(dataDir, "trades-log.json");
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      if (data.portfolio) return data.portfolio;
    }
  } catch { /* ignore */ }
  return {
    equity: 0,
    buyingPower: 0,
    dayPL: 0,
    dayPLPercent: 0,
    totalPL: 0,
    totalPLPercent: 0,
  };
}

async function handlePositions() {
  // Try live Alpaca positions first
  try {
    const { getAlpacaConfig, fetchPositions } = await import("./services/trading/alpaca.js");
    const config = getAlpacaConfig();
    if (config.ready) {
      const positions = await fetchPositions(config);
      if (Array.isArray(positions)) {
        // Cache for brief generator
        try {
          const cachePath = path.join(dataDir, "alpaca-cache.json");
          const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
          cache.positions = positions;
          cache.positionsUpdatedAt = new Date().toISOString();
          fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
        } catch { /* ignore cache write failure */ }
        return positions.map(p => ({
          symbol: p.symbol,
          qty: parseFloat(p.qty) || 0,
          avgEntry: parseFloat(p.avg_entry_price) || 0,
          currentPrice: parseFloat(p.current_price) || 0,
          marketValue: parseFloat(p.market_value) || 0,
          unrealizedPL: parseFloat(p.unrealized_pl) || 0,
          unrealizedPLPercent: parseFloat(p.unrealized_plpc) * 100 || 0,
          changeToday: parseFloat(p.change_today) * 100 || 0,
          side: p.side,
          source: "live"
        }));
      }
    }
  } catch (e) {
    console.log("[Server] Alpaca positions fetch failed, using cache:", e.message);
  }

  // Fallback to cached data
  const dataPath = path.join(dataDir, "trades-log.json");
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      if (data.positions) return data.positions;
    }
  } catch { /* ignore */ }
  return [];
}

async function handleSignals() {
  const dataPath = path.join(dataDir, "tickers-cache.json");
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      const signals = [];
      const tickers = Array.isArray(data.tickers) ? data.tickers : Object.values(data.tickers || {});
      for (const ticker of tickers) {
        if (!ticker || !ticker.symbol) continue;
        const score = ticker.score || 0;
        if (score >= 7) {
          signals.push({
            symbol: ticker.symbol,
            action: "buy",
            score,
            price: ticker.price || null,
            changePercent: ticker.changePercent || null,
            reason: ticker.signal || (score >= 9 ? "Extreme buy" : "Strong buy")
          });
        } else if (score <= 3) {
          signals.push({
            symbol: ticker.symbol,
            action: "sell",
            score,
            price: ticker.price || null,
            changePercent: ticker.changePercent || null,
            reason: ticker.signal || (score <= 1 ? "Extreme sell" : "Weak sell")
          });
        }
      }
      // Sort by score descending for buys, ascending for sells
      signals.sort((a, b) => b.score - a.score);
      return signals.slice(0, 20);
    }
  } catch { /* ignore */ }
  return [];
}

async function handleHealth() {
  const dataPath = path.join(dataDir, "oura-data.json");
  try {
    if (fs.existsSync(dataPath)) {
      const raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));

      // Extract the latest scores
      const getLatest = (arr) => {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return arr[arr.length - 1];
      };

      // Prefer raw.latest (most recent fetch), fallback to last history entry
      const latest = raw.latest || (raw.history ? raw.history[raw.history.length - 1] : raw) || {};

      const latestSleep = getLatest(latest.sleep);
      const latestReadiness = getLatest(latest.readiness);
      const latestActivity = getLatest(latest.activity);
      const latestHR = getLatest(latest.heartRate);

      return {
        sleep: {
          score: latestSleep?.score || null,
          contributors: latestSleep?.contributors || null,
          day: latestSleep?.day || null
        },
        readiness: {
          score: latestReadiness?.score || null,
          contributors: latestReadiness?.contributors || null,
          day: latestReadiness?.day || null
        },
        activity: {
          score: latestActivity?.score || null,
          steps: latestActivity?.steps || null,
          calories: latestActivity?.total_calories || latestActivity?.calories || null,
          day: latestActivity?.day || null
        },
        heartRate: latestHR ? {
          bpm: latestHR.bpm || null,
          source: latestHR.source || null
        } : null,
        hrv: latestReadiness?.contributors?.hrv_balance || null,
        rhr: latestReadiness?.contributors?.resting_heart_rate || null,
        lastUpdated: latest.fetchedAt || latest.savedAt || null
      };
    }
  } catch { /* ignore */ }
  return { sleep: null, readiness: null, activity: null, heartRate: null };
}

async function handleTickers() {
  const dataPath = path.join(dataDir, "tickers-cache.json");
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      const tickers = Array.isArray(data.tickers) ? data.tickers : [];
      // Return top 20 by score, with key fields
      return tickers
        .filter(t => t.score != null)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 20)
        .map(t => ({
          symbol: t.symbol,
          name: t.name || null,
          score: t.score,
          price: t.price || null,
          change: t.change || null,
          changePercent: t.changePercent || null,
          volume: t.volume || null
        }));
    }
  } catch { /* ignore */ }
  return [];
}

async function handleLifeScores() {
  const dataPath = path.join(dataDir, "life-scores.json");
  try {
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, "utf8"));
    }
  } catch { /* ignore */ }
  return {};
}

async function handleGoals() {
  const dataPath = path.join(dataDir, "goals.json");
  const parsedGoalsPath = path.join(dataDir, "parsed-goals.json");

  try {
    // Load goals
    let goals = [];
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      goals = Array.isArray(data) ? data : data.goals || [];
    }

    // Load core goals (parsed)
    let coreGoals = [];
    if (fs.existsSync(parsedGoalsPath)) {
      const parsed = JSON.parse(fs.readFileSync(parsedGoalsPath, "utf8"));
      coreGoals = parsed.goals || [];
    }

    // Load projects and group by goal
    const { getProjectManager } = await import("./services/projects/project-manager.js");
    const pm = getProjectManager();
    const projectsByGoal = pm.getProjectsByGoal();

    // Compute progress % from currentValue/startValue/targetValue and attach projects
    const goalsWithProjects = goals.map(goal => {
      let progress = goal.progress;
      if (progress == null && goal.targetValue != null && goal.startValue != null) {
        const range = goal.targetValue - goal.startValue;
        if (range > 0) {
          progress = Math.min(100, Math.max(0, Math.round(((goal.currentValue || goal.startValue) - goal.startValue) / range * 100)));
        } else {
          progress = goal.status === "completed" ? 100 : 0;
        }
      }
      // Fallback: check milestones
      if (progress == null && Array.isArray(goal.milestones) && goal.milestones.length > 0) {
        const achieved = goal.milestones.filter(m => m.achieved).length;
        progress = Math.round((achieved / goal.milestones.length) * 100);
      }
      if (progress == null) progress = goal.status === "completed" ? 100 : 0;

      return {
        ...goal,
        progress,
        projects: projectsByGoal[goal.id] || projectsByGoal[goal.title] || []
      };
    });

    // Attach projects to core goals and calculate overall completion
    const coreGoalsWithProjects = coreGoals.map(goal => {
      const projects = projectsByGoal[goal.id] || projectsByGoal[goal.title] || [];
      const avgCompletion = projects.length > 0
        ? Math.round(projects.reduce((sum, p) => sum + p.completion, 0) / projects.length)
        : 0;
      return {
        ...goal,
        completion: avgCompletion,
        projects
      };
    });

    return {
      goals: goalsWithProjects,
      coreGoals: coreGoalsWithProjects,
      unassigned: projectsByGoal["unassigned"] || []
    };
  } catch (err) {
    console.error("handleGoals error:", err);
    return { goals: [], coreGoals: [], unassigned: [] };
  }
}

async function handleCalendar() {
  try {
    const { getEmailCalendarService } = await import("./services/integrations/email-calendar-service.js");
    const service = getEmailCalendarService();
    const events = await service.getUpcomingEvents(7);
    return events || [];
  } catch {
    return [];
  }
}

async function handleNews() {
  // Try to read cached news first
  const cachePath = path.join(dataDir, "news-cache.json");
  try {
    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      const articles = cached.articles || cached.news || [];
      if (articles.length > 0) {
        return { articles };
      }
    }
  } catch { /* ignore */ }

  // If no cache, try fetching fresh news
  try {
    const { fetchAndAnalyzeNews } = await import("./services/research/news-service.js");
    const result = await fetchAndAnalyzeNews();
    return { articles: result?.articles || result?.news || [] };
  } catch {
    return { articles: [] };
  }
}

async function handleVideos(query) {
  try {
    const { searchYouTube } = await import("./services/integrations/youtube-service.js");
    // Default search based on user interests if no query
    const searchQuery = query || "AI technology investing 2026";
    const videos = await searchYouTube(searchQuery, 10);
    return { videos: videos || [] };
  } catch {
    return { videos: [] };
  }
}

// ── LinkedIn Routes ──────────────────────────────────────────

app.get("/linkedin/auth", (req, res) => {
  const config = getLinkedInConfig();
  if (!config.clientId || !config.clientSecret) {
    res.status(400).json({ error: "Missing LinkedIn client credentials." });
    return;
  }
  const url = createLinkedInAuthRequest(config, REDIRECT_URI);
  res.redirect(url);
});

app.get("/linkedin/callback", async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;
  if (error) {
    res.status(400).json({ error, errorDescription });
    return;
  }
  if (!code || !state) {
    res.status(400).json({ error: "Missing OAuth code/state." });
    return;
  }
  try {
    const config = getLinkedInConfig();
    await exchangeLinkedInCode(config, code, state, REDIRECT_URI);
    res.json({ ok: true, status: "LinkedIn connected" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const syncLinkedIn = async () => {
  const config = getLinkedInConfig();
  if (!config.ready) {
    return { ok: false, error: "LinkedIn not configured." };
  }
  const [profile, messages] = await Promise.all([
    buildLinkedInProfile(config),
    fetchLinkedInMessages(config)
  ]);
  const payload = buildLinkedInSyncPayload(profile, messages);
  saveLinkedInSync(payload);
  return { ok: true, payload };
};

app.post("/linkedin/sync", async (req, res) => {
  try {
    const result = await syncLinkedIn();
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/linkedin/profile", (req, res) => {
  const sync = loadLinkedInSync();
  if (!sync) {
    res.status(404).json({ error: "No LinkedIn sync data found." });
    return;
  }
  res.json(sync);
});

// ── LinkedIn Agent Routes ────────────────────────────────────

app.get("/api/linkedin/agent/status", async (req, res) => {
  try {
    const { getLinkedInAgent } = await import("./services/integrations/linkedin-agent.js");
    const agent = getLinkedInAgent();
    res.json(agent.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/linkedin/agent/run", async (req, res) => {
  try {
    const { getLinkedInAgent } = await import("./services/integrations/linkedin-agent.js");
    const agent = getLinkedInAgent();
    const result = await agent.run();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/linkedin/agent/reset", async (req, res) => {
  try {
    const { getLinkedInAgent } = await import("./services/integrations/linkedin-agent.js");
    const agent = getLinkedInAgent();
    res.json(agent.resetCooldowns());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Vapi Voice AI Routes ─────────────────────────────────────

app.post("/api/vapi/call", async (req, res) => {
  try {
    const { getVapiService } = await import("./services/messaging/vapi-service.js");
    const vapiService = getVapiService();
    await vapiService.initialize();
    const { customPrompt, targetNumber } = req.body || {};
    const result = await vapiService.callUser(customPrompt || undefined, { targetNumber: targetNumber || null });
    res.json({
      success: true,
      callId: result?.id || result,
      targetNumber: targetNumber || null,
      status: "initiated"
    });
  } catch (err) {
    console.error("Vapi call error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/vapi/end", async (req, res) => {
  try {
    const { getVapiService } = await import("./services/messaging/vapi-service.js");
    const vapiService = getVapiService();
    const { callId } = req.body || {};
    await vapiService.endCall(callId || undefined);
    res.json({ success: true, status: "ended" });
  } catch (err) {
    console.error("Vapi end error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/vapi/webhook", async (req, res) => {
  try {
    const { getVapiService } = await import("./services/messaging/vapi-service.js");
    const vapiService = getVapiService();
    const message = req.body;
    const messageType = message?.message?.type || message?.type;

    if (messageType === "tool-calls") {
      const toolCallList = message.message?.toolCallList || message.toolCallList || [];
      const results = [];

      for (const toolCall of toolCallList) {
        const { id: toolCallId, function: fn } = toolCall;
        const toolName = fn?.name || toolCall.name;
        let params = {};
        try {
          params = typeof fn?.arguments === "string" ? JSON.parse(fn.arguments) : (fn?.arguments || {});
        } catch {
          params = {};
        }

        const result = await vapiService.executeToolCall(toolName, params, toolCallId);
        results.push({
          toolCallId,
          result: typeof result === "string" ? result : JSON.stringify(result),
        });
      }

      res.json({ results });
      return;
    }

    vapiService.handleWebhookMessage(message);
    res.json({ ok: true });
  } catch (err) {
    console.error("Vapi webhook error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/vapi/status", async (req, res) => {
  try {
    const { getVapiService } = await import("./services/messaging/vapi-service.js");
    const vapiService = getVapiService();
    res.json(vapiService.getCallStatus());
  } catch (err) {
    res.json({ active: false, error: err.message });
  }
});

// ── WhatsApp Poller Status ────────────────────────────────────
app.get("/api/whatsapp/poller", async (req, res) => {
  try {
    const { getWhatsAppPoller } = await import("./services/messaging/whatsapp-poller.js");
    res.json(getWhatsAppPoller().getStatus());
  } catch (err) {
    res.json({ running: false, error: err.message });
  }
});

app.post("/api/whatsapp/poller/start", async (req, res) => {
  try {
    await startWhatsAppPoller();
    const { getWhatsAppPoller } = await import("./services/messaging/whatsapp-poller.js");
    res.json({ success: true, ...getWhatsAppPoller().getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/realtime/status", async (req, res) => {
  try {
    const { getRealtimeMessaging } = await import("./services/messaging/realtime-messaging.js");
    res.json(getRealtimeMessaging().getStatus());
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.get("/api/whatsapp/status", async (req, res) => {
  try {
    const { getTwilioWhatsApp } = await import("./services/messaging/twilio-whatsapp.js");
    const { loadUserSettings } = await import("./services/user-settings.js");
    const wa = getTwilioWhatsApp();
    const autoPair = String(req.query?.autoPair || "").toLowerCase();
    const shouldAutoPair = autoPair === "1" || autoPair === "true" || autoPair === "yes";
    const testTwilio = String(req.query?.testTwilio || "").toLowerCase();
    const shouldTestTwilio = testTwilio === "1" || testTwilio === "true" || testTwilio === "yes";

    const normalizeUsPhone = (raw) => {
      const normalized = String(raw || "").replace(/[^\d+]/g, "");
      if (!normalized) return null;
      const usNormalized = normalized.startsWith("+")
        ? normalized
        : normalized.length === 10
          ? `+1${normalized}`
          : normalized.length === 11 && normalized.startsWith("1")
            ? `+${normalized}`
            : normalized;
      return /^\+1\d{10}$/.test(usNormalized) ? usNormalized : null;
    };

    if (!wa.initialized) {
      await wa.initialize();
    }

    let pairing = null;
    if (shouldAutoPair) {
      const statusNow = wa.getStatus?.();
      const connected = Boolean(statusNow?.providers?.baileys?.connected);
      if (!connected) {
        const requestedPhone = req.query?.phone || null;
        const settingsPhone = loadUserSettings()?.phoneNumber || null;
        const phone = normalizeUsPhone(requestedPhone) || normalizeUsPhone(settingsPhone);
        if (phone) {
          pairing = await wa.requestPairingCode(phone, { maxAttempts: 4, resetOnLoggedOut: true, freshAuth: false });
        } else {
          pairing = {
            success: false,
            error: "US phone number required for Baileys pairing (+1XXXXXXXXXX)."
          };
        }
      }
    }

    let twilio = null;
    if (shouldTestTwilio) {
      twilio = await wa.testTwilioConnection();
    }

    const status = wa.getStatus();
    res.json({
      ...status,
      pairing,
      twilio
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/whatsapp/baileys/pairing-code", async (req, res) => {
  try {
    const phoneNumber = req.body?.phoneNumber || req.body?.phone || null;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: "phoneNumber is required" });
    }
    const normalized = String(phoneNumber).replace(/[^\d+]/g, "");
    const usNormalized = normalized.startsWith("+")
      ? normalized
      : normalized.length === 10
        ? `+1${normalized}`
        : normalized.length === 11 && normalized.startsWith("1")
          ? `+${normalized}`
          : normalized;
    if (!/^\+1\d{10}$/.test(usNormalized)) {
      return res.status(400).json({
        success: false,
        error: "US phone number required for Baileys pairing (+1XXXXXXXXXX)."
      });
    }

    const { getTwilioWhatsApp } = await import("./services/messaging/twilio-whatsapp.js");
    const wa = getTwilioWhatsApp();
    if (!wa.initialized) {
      await wa.initialize({ providerPreference: "baileys" });
    }
    const result = await wa.requestPairingCode(usNormalized, { maxAttempts: 4, resetOnLoggedOut: true, freshAuth: false });
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/whatsapp/twilio/test", async (req, res) => {
  try {
    const { getTwilioWhatsApp } = await import("./services/messaging/twilio-whatsapp.js");
    const wa = getTwilioWhatsApp();
    const payload = req.body || {};
    const overrides = {};
    if (payload.accountSid) overrides.accountSid = String(payload.accountSid).trim();
    if (payload.authToken) overrides.authToken = String(payload.authToken).trim();
    if (payload.whatsappNumber) overrides.whatsappNumber = String(payload.whatsappNumber).trim();

    const result = await wa.testTwilioConnection(overrides);
    const status = wa.getStatus?.();
    const response = {
      ...result,
      twilio: status?.providers?.twilio || null
    };
    if (!result?.success) {
      return res.status(400).json(response);
    }
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/whatsapp/provider", async (req, res) => {
  try {
    const provider = String(req.body?.provider || "").toLowerCase();
    if (provider !== "baileys" && provider !== "twilio") {
      return res.status(400).json({
        success: false,
        error: "provider must be 'baileys' or 'twilio'"
      });
    }

    const { getTwilioWhatsApp } = await import("./services/messaging/twilio-whatsapp.js");
    const wa = getTwilioWhatsApp();
    const result = wa.setProviderPreference(provider);
    const status = wa.getStatus?.();
    res.json({
      ...result,
      status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Proactive Scheduler Status & Trigger ──────────────────────

app.get("/api/proactive/status", async (req, res) => {
  try {
    const { getProactiveScheduler } = await import("./services/messaging/proactive-scheduler.js");
    res.json(getProactiveScheduler().getStatus());
  } catch (err) {
    res.json({ running: false, error: err.message });
  }
});

app.post("/api/proactive/trigger", async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: "jobId required" });
    const { getProactiveScheduler } = await import("./services/messaging/proactive-scheduler.js");
    const result = await getProactiveScheduler().triggerJob(jobId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Email Digest API ──────────────────────────────────────────
app.get("/api/email-digest/status", async (req, res) => {
  try {
    const { getDigestStatus } = await import("./services/messaging/email-digest.js");
    res.json(getDigestStatus());
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.post("/api/email-digest/trigger", async (req, res) => {
  try {
    const { runEmailDigest } = await import("./services/messaging/email-digest.js");
    const result = await runEmailDigest({ sendWhatsApp: true, topN: 5 });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WhatsApp Webhook (Twilio) ─────────────────────────────────
app.post("/api/whatsapp/webhook", async (req, res) => {
  try {
    const { getTwilioWhatsApp } = await import("./services/messaging/twilio-whatsapp.js");
    const { formatAIResponse, chunkMessage, formatPortfolioUpdate, formatHealthUpdate, formatGoalsSummary } = await import("./services/messaging/whatsapp-formatter.js");
    const whatsapp = getTwilioWhatsApp();

    // Initialize if needed
    if (!whatsapp.initialized) {
      await whatsapp.initialize();
    }

    // Handle incoming message from Twilio (form-urlencoded data)
    const messageData = whatsapp.handleWebhook(req.body);
    const userPhone = messageData.from;
    const userMessage = messageData.content?.trim();
    const messageSid = req.body?.MessageSid || req.body?.SmsSid || null;

    // Check for reply context (user swiped to reply to a message)
    let repliedToContext = null;
    const repliedSid = req.body?.OriginalRepliedMessageSid || null;
    if (repliedSid) {
      try {
        const repliedMsg = await whatsapp.fetchMessage(repliedSid);
        if (repliedMsg?.body) {
          repliedToContext = {
            sid: repliedSid,
            body: repliedMsg.body.slice(0, 500),
            from: repliedMsg.from,
          };
          console.log(`[WhatsApp Webhook] Reply to: "${repliedMsg.body.slice(0, 60)}"`);
        }
      } catch {}
    }

    console.log("[WhatsApp Webhook] Received from:", userPhone, "Content:", userMessage?.slice(0, 100));

    // Global dedup — prevent poller/realtime from also processing this message
    try {
      const { claim, claimByContent } = await import("./services/messaging/message-dedup.js");
      const idClaimed = messageSid ? claim(messageSid, "webhook") : true;
      const contentClaimed = claimByContent(userMessage, "webhook");
      if (!idClaimed || !contentClaimed) {
        console.log("[WhatsApp Webhook] Already claimed by another processor, skipping");
        res.type("text/xml");
        res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        return;
      }
    } catch {}

    // Skip empty messages
    if (!userMessage) {
      res.type("text/xml");
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      return;
    }

    // Send immediate acknowledgment
    res.type("text/xml");
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

    // Start progress reporter — sends typing indicator + task-aware heartbeats
    const { createProgressReporter } = await import("./services/messaging/whatsapp-progress.js");
    const progress = createProgressReporter(userPhone, userMessage, { messageSid });
    await progress.start();

    // Try deterministic action execution first (step-by-step progress + clear completion report)
    try {
      const { processWhatsAppActionRequest } = await import("./services/messaging/whatsapp-actions.js");
      const actionFlow = await processWhatsAppActionRequest({
        message: userMessage,
        from: userPhone,
        sendProgress: async (progressText) => {
          await progress.sendUpdate(progressText);
        }
      });

      if (actionFlow?.handled) {
        progress.stop();
        const formatted = formatAIResponse(actionFlow.response || "Action processed.");
        const chunks = chunkMessage(formatted, 1500);
        for (const chunk of chunks) {
          await whatsapp.sendMessage(userPhone, chunk);
        }
        console.log("[WhatsApp Webhook] Action flow handled request for", userPhone);
        return;
      }
    } catch (actionErr) {
      console.log("[WhatsApp Webhook] Action flow fallback:", actionErr.message);
    }

    // Process the request with full context
    try {
      // Load comprehensive user context
      const whatsAppDataDir = getDataDir();
      let context = {};

      // Portfolio
      try {
        const alpaca = JSON.parse(fs.readFileSync(path.join(whatsAppDataDir, "alpaca-cache.json"), "utf-8"));
        context.portfolio = {
          equity: alpaca.account?.equity,
          cash: alpaca.account?.cash,
          buying_power: alpaca.account?.buying_power,
          positions: alpaca.positions?.filter(p => !p.symbol.includes("CVR")).map(p => ({
            symbol: p.symbol,
            qty: p.qty,
            value: p.market_value,
            pl: p.unrealized_pl,
            plPercent: p.unrealized_plpc
          }))
        };
      } catch {}

      // Life scores
      try {
        context.lifeScores = JSON.parse(fs.readFileSync(path.join(whatsAppDataDir, "life-scores.json"), "utf-8"));
      } catch {}

      // Top/bottom tickers
      try {
        const tickers = JSON.parse(fs.readFileSync(path.join(whatsAppDataDir, "tickers-cache.json"), "utf-8"));
        const arr = tickers.tickers || tickers;
        context.topTickers = arr.slice(0, 5).map(t => ({
          symbol: t.symbol, score: t.score?.toFixed(1), change: t.changePercent
        }));
        // Also include bottom 3 for sell signals
        context.bottomTickers = arr.slice(-3).map(t => ({
          symbol: t.symbol, score: t.score?.toFixed(1), change: t.changePercent
        }));
      } catch {}

      // Health
      try {
        const oura = JSON.parse(fs.readFileSync(path.join(whatsAppDataDir, "oura-data.json"), "utf-8"));
        const latest = oura.latest || oura.history?.[oura.history.length - 1];
        context.health = {
          sleep: latest?.sleep?.at(-1)?.score,
          readiness: latest?.readiness?.at(-1)?.score,
          activity: latest?.activity?.at(-1)?.score
        };
      } catch {}

      // Active goals
      try {
        const goalsRaw = JSON.parse(fs.readFileSync(path.join(whatsAppDataDir, "goals.json"), "utf-8"));
        const goals = Array.isArray(goalsRaw) ? goalsRaw : goalsRaw.goals || [];
        context.goals = goals.filter(g => g.status === "active").slice(0, 5).map(g => ({
          title: g.title, progress: g.progress || 0, category: g.category
        }));
      } catch {}

      // Engine state (handoff from continuous engine)
      try {
        const handoffPath = path.join(whatsAppDataDir, "engine-handoff.json");
        if (fs.existsSync(handoffPath)) {
          const handoff = JSON.parse(fs.readFileSync(handoffPath, "utf-8"));
          context.engineLastAction = handoff.fromAction;
          context.engineNextTask = handoff.nextTask;
        }
      } catch {}

      // Recent trades
      try {
        const trades = JSON.parse(fs.readFileSync(path.join(whatsAppDataDir, "trades-log.json"), "utf-8"));
        if (Array.isArray(trades)) {
          context.recentTrades = trades.slice(-3).map(t => ({
            symbol: t.symbol, action: t.side || t.action, qty: t.qty, price: t.price, time: t.timestamp
          }));
        }
      } catch {}

      // ── Conversation history (last 30 messages) ──
      let conversationHistory = "(first message — no prior history)";
      try {
        const { getUnifiedMessageLog, MESSAGE_CHANNEL } = await import("./services/messaging/unified-message-log.js");
        const messageLog = getUnifiedMessageLog();
        // Log incoming message
        messageLog.addUserMessage(userMessage, MESSAGE_CHANNEL.WHATSAPP, { from: userPhone });

        // Check if this answers a pending question from BACKBONE
        try {
          const { matchResponseToQuestion, markQuestionAnswered } = await import("./services/messaging/proactive-outreach.js");
          const pendingQ = matchResponseToQuestion(userMessage);
          if (pendingQ) {
            markQuestionAnswered(pendingQ.id, userMessage);
            console.log(`[WhatsApp Webhook] Matched response to question ${pendingQ.id}`);
          }
        } catch {}

        const recent = messageLog.getMessagesForAI(36);
        if (recent.length > 0) {
          conversationHistory = recent.slice(-30)
            .map(m => `${m.role === "user" ? "User" : "BACKBONE"}: ${m.content}`)
            .join("\n");
        }
      } catch (e) { console.log("[WhatsApp Webhook] Message log error:", e.message); }

      // ── Knowledge-db search for relevant context ──
      try {
        const { searchKeyword } = await import("./services/memory/knowledge-db.js");
        const results = searchKeyword(userMessage, { limit: 5 });
        if (results && results.length > 0) {
          context.knowledgeSearch = results.map(r => ({
            source: r.source_path || r.title || "unknown",
            text: (r.text || "").slice(0, 300)
          }));
        }
      } catch { /* knowledge-db may not be initialized */ }

      // ── Memory files for deeper context ──
      try {
        const memDir = getMemoryDir();
        const memFiles = [
          { key: "profile", file: "profile.md", max: 500 },
          { key: "thesis", file: "thesis.md", max: 400 },
          { key: "portfolio", file: "portfolio.md", max: 400 },
          { key: "health", file: "health.md", max: 300 },
          { key: "goals", file: "goals.md", max: 300 },
        ];
        const memContext = {};
        for (const { key, file, max } of memFiles) {
          try {
            const fp = path.join(memDir, file);
            if (fs.existsSync(fp)) {
              const raw = fs.readFileSync(fp, "utf-8").trim();
              if (raw.length > 0) memContext[key] = raw.length > max ? raw.slice(0, max) + "..." : raw;
            }
          } catch {}
        }
        if (Object.keys(memContext).length > 0) context.memoryNotes = memContext;
      } catch {}

      // Build reply context section if user swiped to reply
      let replySection = "";
      if (repliedToContext?.body) {
        replySection = `
*REPLYING TO THIS MESSAGE:*
"${repliedToContext.body.slice(0, 500)}"

The user swiped to reply to the message above. Their response "${userMessage}" is specifically about that message. Answer in context of what they're replying to.
`;
      }

      // Get user's first name for warm responses
      let userName = "there";
      try {
        const settingsPath = path.join(whatsAppDataDir, "user-settings.json");
        if (fs.existsSync(settingsPath)) {
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          userName = settings.firstName || settings.linkedInName?.split(" ")[0] || settings.firebaseUser?.displayName?.split(" ")[0] || settings.name?.split(" ")[0] || "there";
        }
      } catch {}

      // Build the AI prompt with full context
      const prompt = `You are BACKBONE — ${userName}'s personal AI on WhatsApp. You're a capable, warm friend who DOES things, not a chatbot that explains limitations.

*CORE RULE — ALWAYS DO, NEVER REFUSE:*
- If the user asks you to create, build, research, analyze, or do ANYTHING — say "on it" and DO IT.
- NEVER say "I can't", "I'm not able to", "as an AI I don't have access to". You have full access to files, web, tools, APIs.
- If something requires a tool you don't have, BUILD the tool. If it needs research, DO the research.
- If a task will take time, tell ${userName} roughly how long and what steps you're taking.

*PERSONALITY:*
- Address ${userName} by name sometimes. Be warm, not robotic.
- Brief by default. 2-4 sentences unless detail is needed.
- "Hey ${userName}, done — here's what I found" not "I have completed the comprehensive analysis..."
- If it's a big ask: "on it ${userName}, working through that now. might take a few min"
- Real talk. No corporate speak. No hedging. No disclaimers.

*FORMATTING (WhatsApp):*
- *bold* for emphasis, _italic_ for tone
- Keep messages under 800 chars
- No markdown headers, no [links](url) — paste URLs raw
- Emojis fine but chill

*CONVERSATION HISTORY:*
${conversationHistory}
${replySection}
*Current message:* "${userMessage}"

*USER DATA:*
${JSON.stringify(context, null, 2)}

Be contextual. Be warm. Be useful. DO things, don't explain why you can't.`;

      // Use agentic executor (Claude -> Codex fallback on rate limits)
      let responseText = null;
      let agenticError = null;
      try {
        const { executeAgenticTask, getAgenticCapabilities } = await import("./services/ai/multi-ai.js");
        const capabilities = await getAgenticCapabilities();
        if (capabilities.available) {
          const agentResult = await executeAgenticTask(prompt, process.cwd(), null, {
            alwaysTryClaude: true,
            forceTool: "claude",
            claudeTimeoutMs: 120000
          });
          if (agentResult.success && agentResult.output) {
            responseText = agentResult.output.trim();
          } else {
            agenticError = agentResult.error || "Agentic CLI returned no output";
            console.log("[WhatsApp Webhook] Agentic execution failed:", agenticError);
          }
        } else {
          agenticError = "No CLI agent tools available (Claude/Codex CLI)";
          console.log("[WhatsApp Webhook] No agentic tools available");
        }
      } catch (cliErr) {
        agenticError = cliErr.message || "Agentic CLI unavailable";
        console.log("[WhatsApp Webhook] Agentic execution unavailable:", agenticError);
      }

      progress.stop();

      if (responseText) {
        // Run through WhatsApp formatter as safety net
        const formatted = formatAIResponse(responseText);
        const chunks = chunkMessage(formatted, 1500);

        for (const chunk of chunks) {
          await whatsapp.sendMessage(userPhone, chunk);
        }

        // Log assistant response for conversation continuity
        try {
          const { getUnifiedMessageLog, MESSAGE_CHANNEL } = await import("./services/messaging/unified-message-log.js");
          getUnifiedMessageLog().addAssistantMessage(formatted, MESSAGE_CHANNEL.WHATSAPP);
        } catch {}

        console.log("[WhatsApp Webhook] Sent response to", userPhone, `(${chunks.length} chunks)`);
      } else {
        console.error("[WhatsApp Webhook] No response text from agentic CLI:", agenticError);
        await whatsapp.sendMessage(userPhone, "🦴 ran into a snag processing that. try again in a sec?");
      }
    } catch (aiErr) {
      progress.stop();
      console.error("[WhatsApp Webhook] AI processing failed:", aiErr.message);
      await whatsapp.sendMessage(userPhone, "🦴 something went wrong on my end. try again?");
    }
  } catch (err) {
    console.error("[WhatsApp Webhook] Error:", err.message);
    res.type("text/xml");
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

// ── Start Server ─────────────────────────────────────────────

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[Server] Port ${PORT} is already in use. Exiting.`);
    process.exit(1);
  }
  console.error("[Server] Startup error:", err.message);
});

// ── Activity Log (broadcast engine/system activity) ──────────

const MAX_ACTIVITY_LOG = 200;
const activityLog = [];

export function logActivity(category, message, data = null) {
  const entry = {
    id: crypto.randomUUID(),
    category, // trade, research, engine, health, goal, system
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  activityLog.push(entry);
  if (activityLog.length > MAX_ACTIVITY_LOG) activityLog.shift();
  broadcastEvent("activity", entry);
}

app.get("/api/activity", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, MAX_ACTIVITY_LOG);
  res.json(activityLog.slice(-limit));
});

// Send a desktop notification via the SSE-connected PWA clients
app.post("/api/notify", (req, res) => {
  const { title, body, type } = req.body || {};
  if (!body) return res.status(400).json({ error: "Missing body" });
  broadcastEvent("notification", { title: title || "BACKBONE", body, type: type || "system" });
  logActivity(type || "system", body);
  res.json({ ok: true, sent: sseClients.size });
});

// ── Serve Static Web App (PWA) ──────────────────────────────

import { fileURLToPath } from "url";
const __dirname_server = import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));
const webAppOutDir = path.resolve(__dirname_server, "../apps/web/out");
if (fs.existsSync(webAppOutDir)) {
  // Ensure correct content-type + no-store for PWA metadata (prevents cached 404s + stale SW).
  app.get("/app/manifest.json", (req, res) => {
    res.setHeader("Content-Type", "application/manifest+json");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(webAppOutDir, "manifest.json"));
  });
  // Root-level alias for older builds that referenced /manifest.json
  app.get("/manifest.json", (req, res) => {
    res.setHeader("Content-Type", "application/manifest+json");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(webAppOutDir, "manifest.json"));
  });
  app.get("/app/sw.js", (req, res) => {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(webAppOutDir, "sw.js"));
  });

  app.use("/app", express.static(webAppOutDir));
  // Prefer PWA entry when visiting root
  app.get("/", (req, res) => {
    res.redirect("/app/");
  });
  // SPA fallback
  app.get("/app/*", (req, res) => {
    res.sendFile(path.join(webAppOutDir, "index.html"));
  });
} else {
  console.log(`[PWA] Missing static export at ${webAppOutDir}. Run 'npm run webapp:build' to enable the PWA at /app/.`);
}

// ── Start Server ─────────────────────────────────────────────

server.listen(PORT, async () => {
  console.log(`BACKBONE backend listening on ${PORT}`);
  if (WebSocketServer) {
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  }
  console.log(`SSE stream at http://localhost:${PORT}/api/stream`);
  console.log(`Activity log at http://localhost:${PORT}/api/activity`);

  // Auto-launch desktop PWA only when explicitly enabled
  if (process.env.BACKBONE_AUTO_BROWSER === "1") {
    launchDesktopPWA();
  }

  // Migrate legacy credentials to encrypted vault (idempotent, runs once)
  try {
    const { migrateCredentialsToVault } = await import("./services/credential-vault-migration.js");
    const result = await migrateCredentialsToVault();
    if (result.migrated.length > 0) {
      console.log(`[Vault] Migrated ${result.migrated.length} credentials: ${result.migrated.join(", ")}`);
    }
  } catch (e) {
    console.warn("[Vault] Migration skipped:", e.message);
  }

  // Start WhatsApp message poller (polls Twilio API for incoming messages)
  startWhatsAppPoller();

  // Start proactive WhatsApp scheduler (randomized nudges throughout the day)
  startProactiveScheduler();

  // Kick off macro economic research (yield curve, VIX, credit, soft indicators)
  startMacroResearch();

  // Ensure all projects have an images/ folder for captured screenshots/charts
  try {
    const { ensureAllProjectImageDirs } = await import("./services/projects/project-images.js");
    const { created } = ensureAllProjectImageDirs();
    if (created.length > 0) {
      console.log(`[Server] Created images/ dirs for ${created.length} projects`);
    }
  } catch {}

  // Initialize realtime-messaging (Firebase Firestore polling + presence)
  // This MUST happen before pending tasks and conversation sync
  await initializeRealtimeMessaging();

  // Check for pending tasks queued while we were offline
  startPendingTaskProcessor();

  // Sync Firebase conversations into local memory (catch up on cloud AI chats)
  syncFirebaseConversationsOnStartup();

  // Initialize Firebase context sync (syncs user data to Firestore for cloud AI)
  startFirebaseContextSync();

  // Auto-start the autonomous engine (continuous loop, no manual start needed)
  startAutonomousEngine();
});

/**
 * Start WhatsApp message poller — polls Twilio for incoming messages.
 * This replaces the need for a public webhook URL.
 */
async function startWhatsAppPoller() {
  try {
    const { getWhatsAppPoller } = await import("./services/messaging/whatsapp-poller.js");
    const { getUnifiedMessageLog, MESSAGE_CHANNEL } = await import("./services/messaging/unified-message-log.js");
    const poller = getWhatsAppPoller();
    const messageLog = getUnifiedMessageLog();

    // Set the message handler — routes through unified intake pipeline
    poller.setMessageHandler(async (messageData) => {
      const { from, content, hasMedia, mediaList, startTyping, stopTyping } = messageData;
      console.log(`[WhatsAppPoller] Processing: "${content?.slice(0, 80)}"${hasMedia ? " [+media]" : ""}`);
      logActivity("system", `WhatsApp message received: "${content?.slice(0, 60)}"${hasMedia ? " [+image]" : ""}`);

      // Get user's first name for warm responses
      let userName = "there";
      try {
        const settingsPath = path.join(getDataDir(), "user-settings.json");
        if (fs.existsSync(settingsPath)) {
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          userName = settings.firstName || settings.linkedInName?.split(" ")[0] || settings.firebaseUser?.displayName?.split(" ")[0] || settings.name?.split(" ")[0] || "there";
        }
      } catch {}

      // ── IMMEDIATE RESPONSE: Reply within 1-2 seconds ──────
      const immediateReplyPromise = (async () => {
        try {
          const { getClaudeConfig } = await import("./services/ai/claude.js");
          const config = getClaudeConfig();
          if (config.ready) {
            const Anthropic = (await import("@anthropic-ai/sdk")).default;
            const client = new Anthropic({ apiKey: config.apiKey });
            const resp = await client.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 150,
              system: `You're BACKBONE, texting ${userName || "the user"} on WhatsApp. Respond in 1-2 casual sentences. Use their name sometimes. If they're asking you to do something, say you're on it (e.g. "on it ${userName || ""}"). If it's a question you can answer, answer briefly. Text like a warm, capable friend. Never say you can't do something.`,
              messages: [{ role: "user", content }]
            });
            const text = resp.content?.filter(b => b.type === "text").map(b => b.text).join("").trim();
            if (text) {
              const { getTwilioWhatsApp } = await import("./services/messaging/twilio-whatsapp.js");
              const { formatAIResponse } = await import("./services/messaging/whatsapp-formatter.js");
              const wa = getTwilioWhatsApp();
              if (wa.initialized) await wa.sendMessage(from, formatAIResponse(text));
              messageLog.addAssistantMessage(text, MESSAGE_CHANNEL.WHATSAPP);
              // Restart typing indicator after sending message
              if (startTyping) await startTyping();
              return text;
            }
          }
        } catch {}
        // Fallback: no API key — send canned ack
        try {
          const { getTwilioWhatsApp } = await import("./services/messaging/twilio-whatsapp.js");
          const wa = getTwilioWhatsApp();
          if (wa.initialized) await wa.sendMessage(from, "got it, one sec...");
          // Restart typing indicator after sending message
          if (startTyping) await startTyping();
        } catch {}
        return null;
      })();

      // ── Log incoming message to unified history ──────────────
      messageLog.addUserMessage(content, MESSAGE_CHANNEL.WHATSAPP, { from });

      // ── Check for action flows (calendar, etc.) first ───────
      try {
        const { processWhatsAppActionRequest } = await import("./services/messaging/whatsapp-actions.js");
        const actionFlow = await processWhatsAppActionRequest({
          message: content,
          from,
          alreadyLoggedUserMessage: true,
          sendProgress: async (progressText) => {
            const { getTwilioWhatsApp } = await import("./services/messaging/twilio-whatsapp.js");
            const wa = getTwilioWhatsApp();
            if (wa.initialized) {
              await wa.sendMessage(from, `_${progressText}_`);
            }
          }
        });

        if (actionFlow?.handled) {
          return actionFlow.response;
        }
      } catch (actionErr) {
        console.log("[WhatsAppPoller] Action flow fallback:", actionErr.message);
      }

      // ── Check if this is a response to a pending question ──
      try {
        const { matchResponseToQuestion, markQuestionAnswered } = await import("./services/messaging/proactive-outreach.js");
        const pendingQ = matchResponseToQuestion(content);
        if (pendingQ) {
          markQuestionAnswered(pendingQ.id, content);
          console.log(`[WhatsAppPoller] Matched response to question ${pendingQ.id}: "${pendingQ.question?.slice(0, 60)}"`);
        }
      } catch {}

      // ── Process media (images) if present ──────────────────
      let imageContext = "";
      if (hasMedia && mediaList?.length > 0) {
        try {
          const { processWhatsAppImage } = await import("./services/messaging/whatsapp-image-handler.js");
          const { getTwilioWhatsApp } = await import("./services/messaging/twilio-whatsapp.js");
          const wa = getTwilioWhatsApp();
          const twilioConfig = { accountSid: wa.config?.accountSid, authToken: wa.config?.authToken };

          for (const media of mediaList.slice(0, 3)) {
            try {
              const result = await processWhatsAppImage(
                { mediaUrl: media.mediaUrl, contentType: media.contentType },
                twilioConfig
              );
              console.log(`[WhatsAppPoller] Image processed: ${result.localPath}`);
              let imageDescription = "";
              try {
                const { describeImageWithVision } = await import("./services/messaging/whatsapp-image-handler.js");
                imageDescription = await describeImageWithVision(result.buffer, result.contentType);
              } catch {}
              if (imageDescription) {
                imageContext += `\n[The user sent an image. Image description: ${imageDescription}. Saved at ${result.localPath}]`;
              } else {
                imageContext += `\n[The user sent an image saved at ${result.localPath}. Use the Read tool to view this image file and describe what you see.]`;
              }
            } catch (imgErr) {
              console.error("[WhatsAppPoller] Image processing error:", imgErr.message);
            }
          }
        } catch (importErr) {
          console.error("[WhatsAppPoller] Image handler import error:", importErr.message);
        }
      }

      // ── Detect and fetch URLs in the message ─────────────────
      let urlContext = "";
      try {
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
        const urls = content.match(urlRegex);
        if (urls && urls.length > 0) {
          for (const url of urls.slice(0, 2)) {
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 8000);
              const resp = await fetch(url, {
                signal: controller.signal,
                headers: { "User-Agent": "Mozilla/5.0 (compatible; BACKBONE/1.0)" }
              });
              clearTimeout(timeout);
              if (resp.ok) {
                const ct = resp.headers.get("content-type") || "";
                if (ct.includes("text/html") || ct.includes("text/plain") || ct.includes("application/json")) {
                  let text = await resp.text();
                  // Strip HTML tags for a rough text extraction
                  if (ct.includes("html")) {
                    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                      .replace(/<[^>]+>/g, " ")
                      .replace(/\s{2,}/g, " ")
                      .trim();
                  }
                  if (text.length > 3000) text = text.slice(0, 3000) + "...";
                  urlContext += `\n[URL content from ${url}]:\n${text}\n[/URL content]`;
                  console.log(`[WhatsAppPoller] Fetched URL: ${url} (${text.length} chars)`);
                } else if (ct.includes("image")) {
                  urlContext += `\n[URL ${url} is an image (${ct})]`;
                }
              }
            } catch (urlErr) {
              console.log(`[WhatsAppPoller] URL fetch failed for ${url}: ${urlErr.message}`);
            }
          }
        }
      } catch {}

      // Combine extra context
      const extraContext = [imageContext, urlContext].filter(Boolean).join("\n");

      // ── Route through unified intake pipeline ──────────────
      const { process: intakeProcess } = await import("./services/intake.js");
      const intakeResult = await intakeProcess({
        source: "whatsapp",
        content: extraContext ? `${content}\n${extraContext}` : content,
        from,
        mediaList,
        replyFn: async (text) => {
          messageLog.addAssistantMessage(text, MESSAGE_CHANNEL.WHATSAPP);
        }
      });

      // If intake handled it (quick_answer, task, follow_up, command with response), return that
      if (intakeResult.response && !intakeResult.passthrough) {
        const finalResponse = intakeResult.response;

        // Process calendar action tags
        let processedResponse = finalResponse;
        try {
          if (processedResponse.includes("[CALENDAR_ADD]") || processedResponse.includes("[CALENDAR_DELETE]")) {
            const { processCalendarActions } = await import("./services/messaging/calendar-actions.js");
            const { cleanText, actions } = await processCalendarActions(processedResponse);
            processedResponse = cleanText;
            if (actions.length > 0) {
              console.log(`[WhatsAppPoller] Executed ${actions.length} calendar action(s)`);
            }
          }
        } catch (calErr) {
          processedResponse = processedResponse.replace(/\[CALENDAR_(ADD|DELETE)\].*/gi, "").replace(/\n{3,}/g, "\n\n").trim();
        }

        // Split multi-message responses
        const messages = processedResponse.split(/---MSG---/i).map(m => m.trim()).filter(Boolean);

        // Save conversation memory in background
        import("./services/messaging/conversation-memory.js").then(({ processConversationMemory }) => {
          processConversationMemory(content, processedResponse, { source: "local", channel: "whatsapp" });
        }).catch(() => {});

        messageLog.addAssistantMessage(messages[0], MESSAGE_CHANNEL.WHATSAPP);

        // Send follow-up messages with delays
        if (messages.length > 1) {
          (async () => {
            const { getTwilioWhatsApp } = await import("./services/messaging/twilio-whatsapp.js");
            const { formatAIResponse } = await import("./services/messaging/whatsapp-formatter.js");
            const wa = getTwilioWhatsApp();
            if (!wa.initialized) return;
            for (let i = 1; i < messages.length; i++) {
              await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
              const formatted = formatAIResponse(messages[i]);
              await wa.sendMessage(from, formatted);
              messageLog.addAssistantMessage(messages[i], MESSAGE_CHANNEL.WHATSAPP);
            }
          })().catch(err => console.error("[WhatsAppPoller] Follow-up send error:", err.message));
        }

        return messages[0];
      }

      // ── Passthrough: full agentic conversation (conversation type or fallback) ──
      // Load context for full AI prompt
      const { loadGoalsAndProjects, loadProjectFindings } = await import("./services/messaging/whatsapp-auto-work.js");
      const { goals: goalsForContext, projects: projectsForContext } = loadGoalsAndProjects();

      let projectFindings = "";
      try {
        const { classifyWorkIntent } = await import("./services/messaging/whatsapp-auto-work.js");
        const workIntent = classifyWorkIntent(content, goalsForContext, projectsForContext);
        if (workIntent?.match?.id) {
          const findings = loadProjectFindings(workIntent.match.id);
          if (findings) {
            projectFindings = `\n\n*EXISTING PROJECT FINDINGS (use this data in your response!):*\n${JSON.stringify(findings, null, 2).slice(0, 2000)}`;
          }
        }
      } catch {}

      let priorityContext = "";
      try {
        const { getTopPriorities } = await import("./services/messaging/work-priority.js");
        const priorities = getTopPriorities(5);
        if (priorities.length > 0) {
          priorityContext = `\n\n*USER'S CURRENT PRIORITIES (what they've been asking about):*\n${priorities.map((p, i) => `${i + 1}. ${p.title} (${p.type}, mentioned ${p.mentions}x${p.findings ? ", findings ready" : ""})`).join("\n")}`;
        }
      } catch {}

      const recentMessages = messageLog.getMessagesForAI(36);
      const conversationHistory = recentMessages
        .slice(-30)
        .map(m => `${m.role === "user" ? "User" : "BACKBONE"}: ${m.content}`)
        .join("\n");

      const context = poller._loadContext();

      let calendarContext = "";
      try {
        const todayEvents = await new Promise((resolve) => {
          import("../mcp/google-mail-calendar-server.js").then(mod => {
            if (mod.getTodayEvents) return mod.getTodayEvents().then(resolve);
            resolve({ events: [] });
          }).catch(() => resolve({ events: [] }));
        });
        const upcomingEvents = await new Promise((resolve) => {
          import("../mcp/google-mail-calendar-server.js").then(mod => {
            if (mod.getUpcomingEvents) return mod.getUpcomingEvents(7, 20).then(resolve);
            resolve({ events: [] });
          }).catch(() => resolve({ events: [] }));
        });
        const allEvents = [...(todayEvents?.events || []), ...(upcomingEvents?.events || [])];
        const seen = new Set();
        const unique = allEvents.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
        if (unique.length > 0) {
          calendarContext = `\n\n*CALENDAR (next 7 days):*\n${unique.slice(0, 15).map(e => {
            const start = e.start ? new Date(e.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "TBD";
            return `- ${e.title || e.summary} — ${start}${e.location ? " @ " + e.location : ""}`;
          }).join("\n")}`;
        } else {
          calendarContext = "\n\n*CALENDAR:* No events scheduled for the next 7 days.";
        }
      } catch {}

      const prompt = `You are BACKBONE — texting the user on WhatsApp. You're like a guy 3 years out of college who's really good with tech and helps manage stuff. You text like a normal person. Short. Casual. Real.

CONVERSATION:
${conversationHistory || "(first message)"}

Message: "${content}"
${extraContext ? `\nMEDIA/CONTEXT:${extraContext}\n` : ""}
DATA:
${JSON.stringify(context, null, 2)}
${projectFindings}
${priorityContext}
${calendarContext}

HOW TO TALK:
- Text like a real person. Short sentences. No fluff.
- "yo that report's done — check it out" NOT "I have completed the comprehensive analysis report for you"
- 2-4 sentences max unless they asked for detail
- Use data when you have it. Give real numbers, not "your portfolio is doing well"
- Drop links raw when you have them. No markdown link syntax.
- If it's a big topic, break into 2-3 separate messages with ---MSG--- between them
- If you need to do more work: "lemme look into that, I'll hit you back"
- Don't explain what you are or what you can do. Just do it or answer.
- WhatsApp formatting only: *bold*, _italic_, bullets with -
- No headers, no numbered lists unless it makes sense
- Emojis fine but chill — one or two max

CALENDAR:
If they want to add/delete events:
- ADD: [CALENDAR_ADD] title | YYYY-MM-DDTHH:MM | YYYY-MM-DDTHH:MM | location
- DELETE: [CALENDAR_DELETE] event title or keyword
Put these at the END of your message. Ask if details are missing.

Don't force multiple messages if one short one works.`;

      // ── Wait for the immediate reply we fired at the top ──
      const immediateReply = await immediateReplyPromise;

      // ── Determine if deeper work is needed beyond the immediate reply ──
      const hasUrl = /https?:\/\/[^\s]+/i.test(content);
      const needsDeepWork = hasUrl || /search|look up|find out|research|buy|sell|trade|create|schedule|send|email|check the|what'?s (happening|going on)|latest news|analyze|report|compare|deep dive|make me|build me|generate/i.test(content);

      let finalResponse = null;

      // If simple chat and we already sent an immediate reply — we're done
      if (!needsDeepWork && immediateReply) {
        return immediateReply;
      }

      // ── Deep work: use CLI to actually do things ──
      {
        const taskPrompt = needsDeepWork
          ? `You are BACKBONE, an autonomous AI agent. The user sent this request via WhatsApp:

"${content}"
${extraContext ? `\nAdditional context:\n${extraContext}` : ""}
${conversationHistory ? `\nRecent conversation:\n${conversationHistory}` : ""}

${immediateReply ? `You already told the user: "${immediateReply}"\nNow DO the actual work.` : ""}

INSTRUCTIONS:
1. Actually DO what the user is asking. You have full access to the filesystem, web, CLI tools, and MCP servers.
2. If they ask to create something (video, document, code, file) — create it. Use the tools on this machine.
3. If they ask to research something — do the research using web search, file reads, APIs.
4. If they ask to check/analyze something — run the analysis and provide real results.
5. You know this user well (see context below). Just go do it autonomously. Make reasonable assumptions.
6. After completing the work, write a SHORT casual summary of what you did and any results/links.
   - Talk like a normal person texting. Not corporate. Not AI-sounding.
   - Example: "aight done — made a 3 min video script and saved it to projects/ai-video/. want me to generate the voiceover too?"
7. Keep the summary under 4 sentences unless the results need more detail.
${JSON.stringify(context, null, 2) !== "{}" ? `\nUser context:\n${JSON.stringify(context, null, 2)}` : ""}`

          : `You are BACKBONE, the user's AI assistant. Respond to this WhatsApp message casually and helpfully.

Conversation:
${conversationHistory || "(first message)"}

Message: "${content}"
${extraContext ? `\nContext:\n${extraContext}` : ""}

Data: ${JSON.stringify(context, null, 2)}
${calendarContext}

Keep it short (2-4 sentences). Text like a real person. Use data when you have it.`;

        // Stream progress updates to WhatsApp during long work
        let lastProgressAt = Date.now();
        let progressCount = 0;
        const onProgress = needsDeepWork ? (event) => {
          if (!event?.text || progressCount >= 3) return;
          const now = Date.now();
          if (now - lastProgressAt < 15000) return;
          const text = event.text || "";
          const toolMatch = text.match(/^\[Tool\] (\w+):/);
          if (toolMatch) {
            const updates = { WebSearch: "searching the web...", WebFetch: "pulling that page up...", Write: "writing something up...", Bash: "running something..." };
            const msg = updates[toolMatch[1]];
            if (msg) {
              lastProgressAt = now;
              progressCount++;
              import("./services/messaging/twilio-whatsapp.js").then(({ getTwilioWhatsApp }) => {
                const wa = getTwilioWhatsApp();
                if (wa.initialized) {
                  wa.sendMessage(from, `_${msg}_`).then(() => {
                    if (startTyping) startTyping();  // Restart typing after progress message
                  }).catch(() => {});
                }
              }).catch(() => {});
            }
          }
        } : null;

        try {
          const { executeAgenticTask, getAgenticCapabilities } = await import("./services/ai/multi-ai.js");
          const capabilities = await getAgenticCapabilities();
          if (capabilities.available) {
            const agentResult = await executeAgenticTask(taskPrompt, process.cwd(), onProgress, {
              alwaysTryClaude: true,
              forceTool: "claude",
              claudeTimeoutMs: needsDeepWork ? 180000 : 60000
            });
            if (agentResult.success && agentResult.output) {
              finalResponse = agentResult.output.trim();
            }
          }
        } catch (cliErr) {
          console.log(`[WhatsAppPoller] CLI failed: ${cliErr.message}`);
        }
      }

      if (!finalResponse && immediateReply) {
        // Already sent an immediate reply, CLI failed — send error follow-up
        finalResponse = "ran into a snag on that one. wanna try again or give me more details?";
      } else if (!finalResponse) {
        finalResponse = "hmm hit a wall on that. try again in a sec?";
      }

      // Process calendar action tags
      try {
        if (finalResponse.includes("[CALENDAR_ADD]") || finalResponse.includes("[CALENDAR_DELETE]")) {
          const { processCalendarActions } = await import("./services/messaging/calendar-actions.js");
          const { cleanText, actions } = await processCalendarActions(finalResponse);
          finalResponse = cleanText;
          if (actions.length > 0) {
            console.log(`[WhatsAppPoller] Executed ${actions.length} calendar action(s)`);
          }
        }
      } catch (calErr) {
        finalResponse = finalResponse.replace(/\[CALENDAR_(ADD|DELETE)\].*/gi, "").replace(/\n{3,}/g, "\n\n").trim();
      }

      const messages = finalResponse.split(/---MSG---/i).map(m => m.trim()).filter(Boolean);

      // Save conversation memory in background
      import("./services/messaging/conversation-memory.js").then(({ processConversationMemory }) => {
        processConversationMemory(content, finalResponse, { source: "local", channel: "whatsapp" });
      }).catch(() => {});

      messageLog.addAssistantMessage(messages[0], MESSAGE_CHANNEL.WHATSAPP);

      if (messages.length > 1) {
        (async () => {
          const { getTwilioWhatsApp } = await import("./services/messaging/twilio-whatsapp.js");
          const { formatAIResponse } = await import("./services/messaging/whatsapp-formatter.js");
          const wa = getTwilioWhatsApp();
          if (!wa.initialized) return;
          for (let i = 1; i < messages.length; i++) {
            await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
            const formatted = formatAIResponse(messages[i]);
            await wa.sendMessage(from, formatted);
            messageLog.addAssistantMessage(messages[i], MESSAGE_CHANNEL.WHATSAPP);
          }
        })().catch(err => console.error("[WhatsAppPoller] Follow-up send error:", err.message));
      }

      return messages[0];
    });

    // Event-driven ingress for Baileys (no Twilio polling/webhook needed).
    try {
      const { getTwilioWhatsApp } = await import("./services/messaging/twilio-whatsapp.js");
      const waService = getTwilioWhatsApp();
      if (!waService.initialized) {
        await waService.initialize();
      }

      const seenBaileysMessageIds = new Set();
      waService.on("message-received", async (data) => {
        if (!data || data.provider !== "baileys") return;

        const messageId = data.messageId || `baileys_${Date.now()}`;
        if (seenBaileysMessageIds.has(messageId)) return;
        seenBaileysMessageIds.add(messageId);
        if (seenBaileysMessageIds.size > 1000) {
          const first = seenBaileysMessageIds.values().next().value;
          if (first) seenBaileysMessageIds.delete(first);
        }

        try {
          // Show "typing..." in WhatsApp immediately while work is running.
          if (data.from) {
            try {
              await waService.sendTypingIndicator({
                provider: "baileys",
                to: data.from,
                durationMs: 5000
              });
            } catch {}
          }

          const responseText = await poller.messageHandler?.({
            from: data.from,
            content: data.content,
            messageId,
            timestamp: data.timestamp || new Date().toISOString(),
            channel: "whatsapp",
            hasMedia: Boolean(data.hasMedia),
            mediaList: data.mediaList || [],
            repliedToContext: data.repliedToContext || null,
          });

          if (responseText && data.from) {
            await poller._sendResponse(data.from, responseText);
          }
        } catch (err) {
          console.error("[WhatsApp:Baileys] Message handling error:", err.message);
        }
      });
    } catch (baileysErr) {
      console.log("[Server] Baileys event ingress not active:", baileysErr.message);
    }

    await poller.start();
  } catch (err) {
    console.log("[Server] WhatsApp poller not started:", err.message);
  }
}

/**
 * Start the proactive WhatsApp scheduler — sends personalized nudges
 * at randomized times throughout the day (briefs, market, goals, projects).
 */
async function startProactiveScheduler() {
  try {
    const { getProactiveScheduler } = await import("./services/messaging/proactive-scheduler.js");
    const scheduler = getProactiveScheduler();

    scheduler.on("job-fired", ({ jobId, type, result }) => {
      logActivity("system", `Proactive ${type}: ${jobId}`, { jobId, type, result });
      broadcastEvent("proactive-job", { jobId, type, result });
    });

    scheduler.start();
    console.log("[Server] Proactive scheduler started");
  } catch (err) {
    console.log("[Server] Proactive scheduler not started:", err.message);
  }
}

/**
 * Start macro economic research — fetches yield curve, VIX, credit spreads,
 * consumer sentiment, etc. for the recession score engine.
 * Runs once on boot, then refreshes every 4 hours.
 */
async function startMacroResearch() {
  try {
    const { runMacroResearch, needsRefresh } = await import("./services/trading/macro-research.js");

    // Initial fetch (only if stale or missing)
    if (needsRefresh()) {
      console.log("[Server] Running initial macro research...");
      await runMacroResearch();
      console.log("[Server] Macro research complete");
    } else {
      console.log("[Server] Macro data is fresh, skipping initial fetch");
    }

    // Refresh every 4 hours
    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    const interval = setInterval(async () => {
      try {
        console.log("[Server] Scheduled macro research refresh...");
        await runMacroResearch({ forceRefresh: true });
      } catch (err) {
        console.error("[Server] Macro research refresh failed:", err.message);
      }
    }, FOUR_HOURS);
    interval.unref();
  } catch (err) {
    console.log("[Server] Macro research not started:", err.message);
  }
}

/**
 * Initialize realtime-messaging with the Firebase user ID.
 * This enables: Firestore message polling, presence reporting (so the cloud
 * function knows we're online), pending task processing, and conversation sync.
 */
async function initializeRealtimeMessaging() {
  try {
    const { loadFirebaseUser } = await import("./services/firebase/firebase-auth.js");
    const user = loadFirebaseUser();

    const { getRealtimeMessaging } = await import("./services/messaging/realtime-messaging.js");
    const messaging = getRealtimeMessaging();

    // Use Firebase user if available, otherwise fall back to saved userId from previous session
    const userId = user?.localId || messaging.userId;
    if (!userId) {
      console.log("[RealtimeMessaging] No Firebase user and no saved userId — skipping initialization");
      return;
    }

    // Initialize with user ID (sets presence to online)
    await messaging.initialize(userId, user?.idToken || null);
    console.log(`[RealtimeMessaging] Initialized for user ${userId.slice(0, 8)}...`);

    // Set message handler — only handles NON-WhatsApp messages (dashboard/app)
    // WhatsApp messages are handled by the poller — this prevents double responses
    messaging.setMessageHandler(async (message) => {
      const content = message.content || "";
      const isWhatsApp = message.channel?.includes("whatsapp") ||
                         message.source?.includes("whatsapp") ||
                         message.channel === "twilio_whatsapp";
      if (isWhatsApp) {
        console.log(`[RealtimeMessaging] Skipping WhatsApp message (poller handles it): "${content.slice(0, 60)}"`);
        return { content: "", type: "system", skip: true };
      }
      console.log(`[RealtimeMessaging] Handling app message: "${content.slice(0, 80)}"`);

      try {
        // Try WhatsApp action flow first (calendar, trades, etc.)
        const { processWhatsAppActionRequest } = await import("./services/messaging/whatsapp-actions.js");
        const actionFlow = await processWhatsAppActionRequest({
          message: content,
          from: message.from || "firestore",
          alreadyLoggedUserMessage: true,
        });
        if (actionFlow?.handled) {
          return { content: actionFlow.response, type: "ai" };
        }
      } catch {}

      // Build context and process with agentic executor
      const { getUnifiedMessageLog } = await import("./services/messaging/unified-message-log.js");
      const messageLog = getUnifiedMessageLog();
      const recentMessages = messageLog.getMessagesForAI(36);
      const conversationHistory = recentMessages
        .slice(-30)
        .map(m => `${m.role === "user" ? "User" : "BACKBONE"}: ${m.content}`)
        .join("\n");

      // Load brokerage/financial context
      let financialContext = "";
      try {
        const brokeragePath = path.join(getDataDir(), "brokerage-portfolio.json");
        if (fs.existsSync(brokeragePath)) {
          const bp = JSON.parse(fs.readFileSync(brokeragePath, "utf-8"));
          financialContext = `\n*FINANCIAL DATA (from Empower, synced ${bp.lastSync}):*\nNet worth: $${bp.totalNetWorth?.toLocaleString() || "?"}\nHoldings: ${bp.holdingCount || 0} positions\nAccounts: ${bp.accountCount || 0}\n`;
          if (bp.holdings?.length > 0) {
            financialContext += `Top holdings: ${bp.holdings.slice(0, 10).map(h => `${h.name} $${h.value}`).join(", ")}\n`;
          }
        }
      } catch {}

      // Load Alpaca trading context
      let tradingContext = "";
      try {
        const alpacaPath = path.join(getDataDir(), "alpaca-cache.json");
        if (fs.existsSync(alpacaPath)) {
          const ac = JSON.parse(fs.readFileSync(alpacaPath, "utf-8"));
          tradingContext = `\n*TRADING (Alpaca):*\nEquity: $${ac.account?.equity || "?"}, Cash: $${ac.account?.cash || "?"}\n`;
        }
      } catch {}

      const prompt = `You are BACKBONE — texting the user. You're like a sharp tech-savvy friend. Short, casual, real.

CONVERSATION:
${conversationHistory || "(first message)"}

Message: "${content}"
${financialContext}${tradingContext}

Keep it brief — 2-4 sentences. Use real data when you have it. Talk like a normal person texting.
Address the user's actual question FIRST. Don't pivot to other topics.`;

      try {
        const { executeAgenticTask, getAgenticCapabilities } = await import("./services/ai/multi-ai.js");
        const capabilities = await getAgenticCapabilities();
        if (capabilities.available) {
          const result = await executeAgenticTask(prompt, process.cwd(), null, { alwaysTryClaude: true });
          if (result.success && result.output) {
            const response = result.output.trim();
            messageLog.addAssistantMessage(response, "whatsapp");
            return { content: response, type: "ai" };
          }
        }
      } catch (err) {
        console.log("[RealtimeMessaging] Agentic execution failed:", err.message);
      }

      // Fallback
      const fallback = "Got it — let me work on that and get back to you shortly.";
      messageLog.addAssistantMessage(fallback, "whatsapp");
      return { content: fallback, type: "ai" };
    });

    // Start listening for incoming Firestore messages
    await messaging.startListening();
    console.log("[RealtimeMessaging] Firestore polling started (presence: online)");
  } catch (err) {
    console.log("[RealtimeMessaging] Init failed:", err.message);
  }
}

/**
 * Sync Firebase conversations into local memory files on startup.
 * Catches up on any conversations that happened while BACKBONE was offline
 * so the knowledge base stays current.
 */
async function syncFirebaseConversationsOnStartup() {
  try {
    const { getRealtimeMessaging } = await import("./services/messaging/realtime-messaging.js");
    const messaging = getRealtimeMessaging();
    if (!messaging.userId) {
      console.log("[ConversationSync] No userId — skipping Firebase conversation sync");
      return;
    }

    const result = await messaging.syncFirebaseConversations(100);
    if (result.processed > 0) {
      console.log(`[ConversationSync] Synced ${result.processed} conversation(s) from Firebase`);
      if (result.themes?.length > 0) {
        console.log(`[ConversationSync] Recurring themes: ${result.themes.join(", ")}`);
      }
    }
  } catch (err) {
    console.log("[ConversationSync] Firebase conversation sync skipped:", err.message);
  }
}

/**
 * Process pending tasks that were queued by the cloud function while
 * the local server was offline. Checks Firestore for tasks, processes them
 * with Claude AI, and sends follow-up WhatsApp messages with findings.
 *
 * Flow: User messages while offline → Cloud function queues pendingTask →
 *       Server comes online → This processor picks it up → Does real work →
 *       Sends follow-up WhatsApp with results + images
 */
async function startPendingTaskProcessor() {
  try {
    const { getRealtimeMessaging } = await import("./services/messaging/realtime-messaging.js");
    const messaging = getRealtimeMessaging();
    if (!messaging.userId) {
      console.log("[PendingTasks] No userId — skipping pending task check");
      return;
    }

    // Check for pending tasks in Firestore
    const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/backboneai/databases/(default)/documents`;
    const url = `${FIRESTORE_BASE}/users/${messaging.userId}/pendingTasks?key=AIzaSyBKLqcnFQwNSKqHXgTBLok3l74ZmNh6_y0&pageSize=10`;

    const resp = await messaging.fetchWithAuth(url);
    if (!resp.ok) return;

    const data = await resp.json();
    const docs = data.documents || [];
    const pending = [];

    for (const doc of docs) {
      const fields = {};
      for (const [key, val] of Object.entries(doc.fields || {})) {
        if (val.stringValue !== undefined) fields[key] = val.stringValue;
        else if (val.booleanValue !== undefined) fields[key] = val.booleanValue;
        else if (val.integerValue !== undefined) fields[key] = parseInt(val.integerValue, 10);
        else if (val.timestampValue !== undefined) fields[key] = val.timestampValue;
      }
      if (fields.status === "pending" && fields.type === "whatsapp_followup") {
        pending.push({ id: doc.name, fields });
      }
    }

    if (pending.length === 0) {
      console.log("[PendingTasks] No pending tasks from cloud");
      return;
    }

    console.log(`[PendingTasks] Found ${pending.length} pending task(s) from cloud — processing`);

    for (const task of pending) {
      try {
        // Mark as processing in Firestore
        await messaging.fetchWithAuth(`${task.id}?updateMask.fieldPaths=status&key=AIzaSyBKLqcnFQwNSKqHXgTBLok3l74ZmNh6_y0`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { status: { stringValue: "processing" } } })
        });

        const msg = task.fields.originalMessage;
        const userName = task.fields.userName || "bud";
        console.log(`[PendingTasks] Processing: "${msg?.slice(0, 80)}"`);

        // Use agentic executor to do real work on this (Claude -> Codex fallback on rate limits)
        const { executeAgenticTask, getAgenticCapabilities } = await import("./services/ai/multi-ai.js");
        const prompt = `The user (${userName}) sent this WhatsApp message while the system was offline.
An initial quick response was already sent: "${task.fields.aiQuickResponse?.slice(0, 200) || "acknowledged"}"

Now you need to do the REAL work. Research this properly, check the user's data, and provide a thorough follow-up.

User's message: "${msg}"

${task.fields.conversationContext ? `Recent conversation context:\n${task.fields.conversationContext}` : ""}

INSTRUCTIONS:
- Give a thorough, actionable response based on real data
- Use WhatsApp formatting: *bold*, _italic_, bullet points
- Keep under 1500 chars
- Be conversational — this is a follow-up, so start naturally like "Hey, circling back on that..." or "Alright, dug into it —"
- Don't repeat what the quick response said
- Include specific numbers, data, or findings`;

        let result = { success: false, output: "", error: "No agentic tools available." };
        const capabilities = await getAgenticCapabilities();
        if (capabilities.available) {
          result = await executeAgenticTask(prompt, process.cwd(), null);
        }

        if (result.success && result.output?.trim()) {
          // Send follow-up via WhatsApp
          const { getWhatsAppNotifications } = await import("./services/messaging/whatsapp-notifications.js");
          const notif = getWhatsAppNotifications();
          if (!notif.enabled) await notif.initialize("default");

          await notif.send("system", result.output.trim(), {
            identifier: `followup_${Date.now()}`,
            allowDuplicate: true
          });

          console.log(`[PendingTasks] Follow-up sent for: "${msg?.slice(0, 40)}"`);
        }

        // Mark as completed
        await messaging.fetchWithAuth(`${task.id}?updateMask.fieldPaths=status&updateMask.fieldPaths=completedAt&key=AIzaSyBKLqcnFQwNSKqHXgTBLok3l74ZmNh6_y0`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: {
            status: { stringValue: "completed" },
            completedAt: { timestampValue: new Date().toISOString() }
          }})
        });

      } catch (taskErr) {
        console.error(`[PendingTasks] Error processing task:`, taskErr.message);
        // Mark as failed
        try {
          await messaging.fetchWithAuth(`${task.id}?updateMask.fieldPaths=status&updateMask.fieldPaths=error&key=AIzaSyBKLqcnFQwNSKqHXgTBLok3l74ZmNh6_y0`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fields: {
              status: { stringValue: "failed" },
              error: { stringValue: taskErr.message }
            }})
          });
        } catch {}
      }
    }
  } catch (err) {
    console.log("[PendingTasks] Processor not started:", err.message);
  }
}

/**
 * Initialize Firebase context sync — syncs user data to Firestore for cloud AI.
 * The proactive scheduler handles 4x/day scheduled syncs.
 * This does the initial sync on startup + provides on-change triggers.
 */
async function startFirebaseContextSync() {
  try {
    const { getFirebaseContextSync } = await import("./services/firebase/firebase-context-sync.js");
    const { loadFirebaseUser } = await import("./services/firebase/firebase-auth.js");
    const user = loadFirebaseUser();
    // Fall back to RealtimeMessaging's saved userId if no firebase-user.json
    let userId = user?.localId || user?.uid;
    if (!userId) {
      try {
        const { getRealtimeMessaging } = await import("./services/messaging/realtime-messaging.js");
        userId = getRealtimeMessaging().userId;
      } catch {}
    }
    if (!userId) {
      console.log("[ContextSync] No Firebase user — skipping");
      return;
    }

    const sync = getFirebaseContextSync();
    sync.initialize(userId);

    // Immediate sync on startup — ensures Firebase always has fresh data
    // Force first sync (bypass debounce since this is boot)
    sync.lastSyncTime = 0;
    sync.syncAll().then(ok => {
      if (ok) console.log("[ContextSync] Initial sync complete — Firebase has user data");
      else console.log("[ContextSync] Initial sync returned false (no data or auth issue)");
    }).catch(err => {
      console.error("[ContextSync] Initial sync failed:", err.message);
    });

    console.log("[ContextSync] Initialized — syncing now + 4x/day via proactive scheduler");
  } catch (err) {
    console.log("[ContextSync] Not started:", err.message);
  }
}

/**
 * Auto-start the autonomous engine on server boot.
 * Runs as a continuous loop — work, rest, repeat — until CLI is closed.
 * Replaces the old manual POST /api/engine/start pattern.
 */
async function startAutonomousEngine() {
  try {
    const { getAutonomousEngine } = await import("./services/engine/autonomous-engine.js");
    const engine = getAutonomousEngine();

    if (engine.running) {
      console.log("[Engine] Already running");
      return;
    }

    // ── Wire core services so the engine can work autonomously ──────────
    try {
      const { getGoalManager } = await import("./services/goals/goal-manager.js");
      const goalManager = getGoalManager();
      await goalManager.initialize();
      engine.goalManager = goalManager;

      // Wire AI brain for goal generation when no goals exist
      let aiBrain = null;
      try {
        const { getAIBrain } = await import("./services/ai/ai-brain.js");
        aiBrain = getAIBrain();
        engine.setAIBrain(aiBrain);
      } catch {}

      // Register context providers — these feed user data into Claude's prompt
      const memDir = getMemoryDir();
      const dataDir = getDataDir();

      engine.registerContextProvider("beliefs", async () => {
        try {
          const p = path.join(dataDir, "core-beliefs.json");
          if (fs.existsSync(p)) {
            const data = JSON.parse(fs.readFileSync(p, "utf-8"));
            return data.beliefs || data;
          }
        } catch {}
        return [];
      });

      engine.registerContextProvider("goals", async () => {
        try { return goalManager.getActiveGoals(); } catch {}
        return [];
      });

      // User identity — who is this person, their family, personal details
      engine.registerContextProvider("profile", async () => {
        try {
          const files = ["profile.md", "profile-general.md", "profile-work.md"];
          const parts = [];
          for (const f of files) {
            const fp = path.join(memDir, f);
            if (fs.existsSync(fp)) {
              const content = fs.readFileSync(fp, "utf-8");
              if (content.length > 20) parts.push(content.slice(0, 500));
            }
          }
          return parts.join("\n") || "";
        } catch {}
        return "";
      });

      engine.registerContextProvider("family", async () => {
        try {
          const fp = path.join(memDir, "family.md");
          if (fs.existsSync(fp)) return fs.readFileSync(fp, "utf-8").slice(0, 800);
        } catch {}
        return "";
      });

      engine.registerContextProvider("portfolio", async () => {
        try {
          const p = path.join(memDir, "portfolio.md");
          if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8").slice(0, 1000);
        } catch {}
        return "";
      });

      engine.registerContextProvider("health", async () => {
        try {
          const p = path.join(memDir, "health.md");
          if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8").slice(0, 500);
        } catch {}
        return "";
      });

      engine.registerContextProvider("conversations", async () => {
        try {
          const files = ["conversations.md", "career.md", "travel.md", "profile-notes.md"];
          const snippets = [];
          for (const f of files) {
            const fp = path.join(memDir, f);
            if (fs.existsSync(fp)) {
              const content = fs.readFileSync(fp, "utf-8");
              if (content.length > 50) snippets.push(`[${f}] ${content.slice(-500)}`);
            }
          }
          return snippets.join("\n---\n").slice(0, 2000);
        } catch {}
        return "";
      });

      engine.registerContextProvider("thesis", async () => {
        try {
          const p = path.join(memDir, "thesis.md");
          if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8").slice(0, 800);
        } catch {}
        return "";
      });

      // Wire same context into AI brain so goal generation has user data
      if (aiBrain) {
        aiBrain.registerContextProvider("profile", async () => {
          try {
            const p = path.join(memDir, "profile.md");
            if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8").slice(0, 800);
          } catch {}
          return "";
        });
        aiBrain.registerContextProvider("beliefs", async () => {
          try {
            const p = path.join(dataDir, "core-beliefs.json");
            if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
          } catch {}
          return {};
        });
        aiBrain.registerContextProvider("conversations", async () => {
          try {
            const files = ["family.md", "conversations.md", "career.md", "travel.md", "profile-notes.md"];
            const snippets = [];
            for (const f of files) {
              const fp = path.join(memDir, f);
              if (fs.existsSync(fp)) {
                const content = fs.readFileSync(fp, "utf-8");
                if (content.length > 50) snippets.push(`[${f}] ${content.slice(-300)}`);
              }
            }
            return snippets.join("\n").slice(0, 1500);
          } catch {}
          return "";
        });
        aiBrain.registerContextProvider("portfolio", async () => {
          try {
            const p = path.join(memDir, "portfolio.md");
            if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8").slice(0, 600);
          } catch {}
          return "";
        });
        aiBrain.registerContextProvider("health", async () => {
          try {
            const p = path.join(memDir, "health.md");
            if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8").slice(0, 400);
          } catch {}
          return "";
        });
      }

      console.log("[Engine] Context providers wired: beliefs, goals, portfolio, health, conversations, thesis");
    } catch (ctxErr) {
      console.log("[Engine] Context provider setup partial:", ctxErr.message);
    }

    // Wire engine events to SSE broadcast + activity log
    engine.on("rest-start", ({ restUntil, reason }) => {
      broadcastEvent("engine", { status: "resting", restUntil, reason });
    });
    engine.on("rest-countdown", ({ remainingMin, reason }) => {
      broadcastEvent("engine", { status: "resting", remainingMin, reason });
    });
    engine.on("rest-end", () => {
      broadcastEvent("engine", { status: "working" });
    });
    engine.on("rest-extended", ({ restUntil, reason }) => {
      broadcastEvent("engine", { status: "resting", restUntil, reason, extended: true });
    });
    engine.on("goal-completed", (goal) => {
      logActivity("engine", `Goal completed: ${goal.title}`);
      broadcastEvent("engine", { status: "goal_completed", goal: goal.title });
    });
    engine.on("claude-start", ({ goal }) => {
      broadcastEvent("engine", { status: "executing", goal: goal?.title });
    });

    // Start the continuous autonomous loop (non-blocking)
    console.log("[Engine] Auto-starting autonomous engine...");
    engine.startAutonomousLoop().catch(err => {
      console.error("[Engine] Loop exited:", err.message);
    });

    logActivity("engine", "Autonomous engine auto-started on server boot");
  } catch (err) {
    console.log("[Engine] Auto-start skipped:", err.message);
  }
}

async function launchDesktopPWA() {
  // Small delay to ensure server is ready
  await new Promise(r => setTimeout(r, 5000));
  const url = `http://localhost:${PORT}/app`;
  try {
    const { spawn, exec: execCb } = await import("child_process");
    const platform = process.platform;
    let launched = false;

    if (platform === "win32") {
      // On Windows, use a VBScript wrapper to launch minimized (window style 7)
      const chromePaths = [
        (process.env.LOCALAPPDATA || "") + "\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      ];
      let browserExe = null;
      for (const p of chromePaths) {
        if (fs.existsSync(p)) { browserExe = p; break; }
      }
      if (browserExe) {
        const vbs = `CreateObject("WScript.Shell").Run """${browserExe}"" --app=""${url}""", 7, False`;
        const vbsPath = path.join(process.env.TEMP || ".", "bb_pwa_launch.vbs");
        fs.writeFileSync(vbsPath, vbs);
        const child = spawn("wscript", [vbsPath], { detached: true, stdio: "ignore", windowsHide: true });
        child.unref();
        // Clean up VBS file after a delay
        setTimeout(() => { try { fs.unlinkSync(vbsPath); } catch {} }, 5000);
        launched = true;
      }
    } else if (platform === "darwin") {
      const child = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        [`--app=${url}`], { detached: true, stdio: "ignore" });
      child.unref();
      launched = true;
    } else {
      execCb(`google-chrome --app="${url}" 2>/dev/null || chromium-browser --app="${url}" 2>/dev/null || xdg-open "${url}"`, () => {});
      launched = true;
    }

    if (launched) {
      console.log(`[PWA] Desktop app launched minimized at ${url}`);
      logActivity("system", "Desktop PWA launched (minimized)", { url, mode: "standalone" });
    }
  } catch (err) {
    console.log("[PWA] Auto-launch skipped:", err.message);
  }
}

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n[Server] ${signal} received, shutting down...`);
  server.close(() => {
    console.log("[Server] HTTP server closed");
    process.exit(0);
  });
  // Force exit after 5 seconds if connections don't close
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ── LinkedIn Scheduler ───────────────────────────────────────

const scheduleWeeklySync = async () => {
  const { default: cron } = await import("node-cron");
  cron.schedule("0 9 * * 1", () => {
    syncLinkedIn().catch((error) => {
      console.error("LinkedIn weekly sync failed:", error.message);
    });
  });
};

scheduleWeeklySync().catch((error) => {
  console.error("LinkedIn scheduler failed:", error.message);
});
