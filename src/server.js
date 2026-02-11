import express from "express";
import http from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { getDataDir, getActiveUser } from "./services/paths.js";
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
let autonomousLoop = null;

app.get("/api/engine/status", async (req, res) => {
  try {
    if (!autonomousLoop) {
      res.json({ running: false, status: "not_started" });
      return;
    }
    res.json(autonomousLoop.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/engine/start", async (req, res) => {
  try {
    if (autonomousLoop && autonomousLoop.running) {
      res.json({ ok: false, message: "Engine already running" });
      return;
    }
    const { getAutonomousLoop } = await import("./services/engine/autonomous-loop.js");
    autonomousLoop = await getAutonomousLoop();
    autonomousLoop.start(); // Don't await - runs in background
    res.json({ ok: true, message: "Engine started" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/engine/stop", async (req, res) => {
  try {
    if (!autonomousLoop || !autonomousLoop.running) {
      res.json({ ok: false, message: "Engine not running" });
      return;
    }
    await autonomousLoop.stop();
    res.json({ ok: true, message: "Engine stopped" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/engine/pause", async (req, res) => {
  try {
    if (!autonomousLoop) {
      res.json({ ok: false, message: "Engine not started" });
      return;
    }
    autonomousLoop.pause();
    res.json({ ok: true, message: "Engine paused" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/engine/resume", async (req, res) => {
  try {
    if (!autonomousLoop) {
      res.json({ ok: false, message: "Engine not started" });
      return;
    }
    autonomousLoop.resume();
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

  // Primary path: use Claude Code CLI (leverages Pro/Max subscription, no API key needed)
  try {
    const { runClaudeCodePrompt, getClaudeCodeStatus } = await import("./services/ai/claude-code-cli.js");
    const cliStatus = await getClaudeCodeStatus();

    if (cliStatus.ready) {
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

      const result = await runClaudeCodePrompt(prompt, { timeout: 60000 });
      if (result.success && result.output) {
        chatResult = { role: "assistant", content: result.output.trim(), timestamp: Date.now() };
      } else {
        // If CLI call failed, fall through to API fallback
        console.log("[Server] Claude Code CLI chat failed, trying API fallback:", result.error);
      }
    }
  } catch (cliErr) {
    console.log("[Server] Claude Code CLI unavailable for chat:", cliErr.message);
  }

  // Fallback: use multi-ai (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)
  if (!chatResult) {
    try {
      const { sendMessage: sendAI } = await import("./services/ai/multi-ai.js");

      const context = {
        systemPrompt: `You are BACKBONE, a life optimization AI assistant. You help the user manage their portfolio, health, goals, and daily life. Be concise and actionable. If the user asks about their data (portfolio, health, goals, etc.), provide a brief summary and note that the view has been generated for them. Keep responses under 3 sentences for data queries, longer for analysis or advice.`
      };

      const result = await sendAI(message, context);
      const content = typeof result === "string"
        ? result
        : result?.response || result?.content || "I processed your request.";

      chatResult = { role: "assistant", content, timestamp: Date.now() };
    } catch (err) {
      console.error("AI chat error:", err.message);
      chatResult = {
        role: "assistant",
        content: `I received your request. The AI service is not available right now, but I've loaded the relevant view for you.`,
        timestamp: Date.now(),
      };
    }
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
    const { customPrompt } = req.body || {};
    const result = await vapiService.callUser(customPrompt || undefined);
    res.json({ success: true, callId: result?.id || result, status: "initiated" });
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

    console.log("[WhatsApp Webhook] Received from:", userPhone, "Content:", userMessage?.slice(0, 100));

    // Skip empty messages
    if (!userMessage) {
      res.type("text/xml");
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      return;
    }

    // Send immediate acknowledgment
    res.type("text/xml");
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

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

      // Build the AI prompt — instruct WhatsApp-native formatting
      const prompt = `You are BACKBONE, an executive AI assistant. The user messaged you on WhatsApp.

*User message:* "${userMessage}"

*FORMATTING RULES (CRITICAL):*
Use WhatsApp-native formatting in your response:
- *bold* for emphasis (single asterisks)
- _italic_ for secondary emphasis (underscores)
- ~strikethrough~ for corrections
- \`\`\`code\`\`\` for numbers/data blocks
- Bullet points with - or •
- Keep under 1500 characters
- No markdown headers (##), no [links](url)
- Use emojis sparingly for visual scanning

*USER CONTEXT:*
${JSON.stringify(context, null, 2)}

Respond to the user's question with specific data from the context above. Be concise, actionable, and data-rich. If they ask about markets, mention specific tickers and scores. If about health, cite Oura scores. If about portfolio, cite positions and P&L. If they ask what the engine is doing, mention the last action and next planned task.`;

      // Use Claude Code CLI (Pro/Max subscription) — no API key needed
      let responseText = null;
      try {
        const { runClaudeCodePrompt } = await import("./services/ai/claude-code-cli.js");
        const cliResult = await runClaudeCodePrompt(prompt, { timeout: 90000 });
        if (cliResult.success && cliResult.output) {
          responseText = cliResult.output.trim();
        } else {
          console.log("[WhatsApp Webhook] CLI failed, trying multi-ai fallback:", cliResult.error);
        }
      } catch (cliErr) {
        console.log("[WhatsApp Webhook] CLI unavailable:", cliErr.message);
      }

      // Fallback: try multi-ai (requires API key)
      if (!responseText) {
        try {
          const { sendMessage } = await import("./services/ai/multi-ai.js");
          const aiResponse = await sendMessage(prompt, { format: "text", maxTokens: 1000 });
          if (typeof aiResponse === "string") {
            responseText = aiResponse;
          } else if (aiResponse?.content) {
            responseText = aiResponse.content;
          } else if (aiResponse?.message) {
            responseText = aiResponse.message;
          } else if (aiResponse?.response) {
            responseText = aiResponse.response;
          } else if (aiResponse?.error) {
            console.error("[WhatsApp Webhook] multi-ai error:", aiResponse.error);
          }
        } catch (aiErr) {
          console.error("[WhatsApp Webhook] multi-ai fallback failed:", aiErr.message);
        }
      }

      if (responseText) {
        // Run through WhatsApp formatter as safety net
        const formatted = formatAIResponse(responseText);
        const chunks = chunkMessage(formatted, 1500);

        for (const chunk of chunks) {
          await whatsapp.sendMessage(userPhone, chunk);
        }
        console.log("[WhatsApp Webhook] Sent response to", userPhone, `(${chunks.length} chunks)`);
      } else {
        console.error("[WhatsApp Webhook] No response text. aiResponse:", JSON.stringify(aiResponse)?.slice(0, 300));
        await whatsapp.sendMessage(userPhone, "_Something went wrong generating a response. The AI service may be temporarily unavailable._");
      }
    } catch (aiErr) {
      console.error("[WhatsApp Webhook] AI processing failed:", aiErr.message);
      await whatsapp.sendMessage(userPhone, `Hit a snag processing that: _${aiErr.message.slice(0, 100)}_\nTry again in a moment.`);
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

server.listen(PORT, () => {
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

  // Start WhatsApp message poller (polls Twilio API for incoming messages)
  startWhatsAppPoller();

  // Start proactive WhatsApp scheduler (randomized nudges throughout the day)
  startProactiveScheduler();

  // Kick off macro economic research (yield curve, VIX, credit, soft indicators)
  startMacroResearch();
});

/**
 * Start WhatsApp message poller — polls Twilio for incoming messages.
 * This replaces the need for a public webhook URL.
 */
async function startWhatsAppPoller() {
  try {
    const { getWhatsAppPoller } = await import("./services/messaging/whatsapp-poller.js");
    const poller = getWhatsAppPoller();

    // Set the message handler — uses the same AI processing as the webhook
    poller.setMessageHandler(async (messageData) => {
      const { from, content } = messageData;
      console.log(`[WhatsAppPoller] Processing: "${content?.slice(0, 80)}"`);
      logActivity("system", `WhatsApp message received: "${content?.slice(0, 60)}"`);

      // Load context and generate AI response (same logic as POST /api/whatsapp/webhook)
      const context = poller._loadContext();

      const prompt = `You are BACKBONE, an executive AI assistant. The user messaged you on WhatsApp.

*User message:* "${content}"

*FORMATTING RULES (CRITICAL):*
Use WhatsApp-native formatting in your response:
- *bold* for emphasis (single asterisks)
- _italic_ for secondary emphasis (underscores)
- Bullet points with - or •
- Keep under 1500 characters
- No markdown headers (##), no [links](url)
- Use emojis sparingly for visual scanning

*USER CONTEXT:*
${JSON.stringify(context, null, 2)}

Respond to the user's question with specific data from the context above. Be concise, actionable, and data-rich.`;

      // Use Claude Code CLI (Pro/Max subscription) — no API key needed
      let responseText = null;
      try {
        const { runClaudeCodePrompt } = await import("./services/ai/claude-code-cli.js");
        const cliResult = await runClaudeCodePrompt(prompt, { timeout: 90000 });
        if (cliResult.success && cliResult.output) {
          responseText = cliResult.output.trim();
        } else {
          console.log("[WhatsAppPoller] CLI failed, trying multi-ai fallback:", cliResult.error);
        }
      } catch (cliErr) {
        console.log("[WhatsAppPoller] CLI unavailable:", cliErr.message);
      }

      // Fallback: try multi-ai
      if (!responseText) {
        try {
          const { sendMessage } = await import("./services/ai/multi-ai.js");
          const aiResponse = await sendMessage(prompt, { format: "text", maxTokens: 1000 });
          if (typeof aiResponse === "string") {
            responseText = aiResponse;
          } else if (aiResponse?.content) {
            responseText = aiResponse.content;
          } else if (aiResponse?.message) {
            responseText = aiResponse.message;
          } else if (aiResponse?.response) {
            responseText = aiResponse.response;
          } else if (aiResponse?.error) {
            console.error("[WhatsAppPoller] multi-ai error:", aiResponse.error);
          }
        } catch (aiErr) {
          console.error("[WhatsAppPoller] multi-ai fallback failed:", aiErr.message);
        }
      }

      return responseText || "_Something went wrong generating a response. The AI service may be temporarily unavailable._";
    });

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
