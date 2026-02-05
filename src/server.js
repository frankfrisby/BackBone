import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import {
  createLinkedInAuthRequest,
  exchangeLinkedInCode,
  getLinkedInConfig,
  buildLinkedInProfile,
  fetchLinkedInMessages,
  buildLinkedInSyncPayload,
  saveLinkedInSync,
  loadLinkedInSync
} from "./services/linkedin.js";

const app = express();
const server = http.createServer(app);
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || "http://localhost:3000/linkedin/callback";

app.use(express.json());

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
    const { getAlpacaConfig } = await import("./services/alpaca.js");
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

// Push notification token registration
app.post("/api/register-push", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: "Missing FCM token" });
      return;
    }
    // Store token in data directory
    const tokensPath = path.resolve("data/fcm-tokens.json");
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

  try {
    const { sendMessage: sendAI } = await import("./services/multi-ai.js");

    // Build context from available data
    const context = {
      systemPrompt: `You are BACKBONE, a life optimization AI assistant. You help the user manage their portfolio, health, goals, and daily life. Be concise and actionable. If the user asks about their data (portfolio, health, goals, etc.), provide a brief summary and note that the view has been generated for them. Keep responses under 3 sentences for data queries, longer for analysis or advice.`
    };

    const result = await sendAI(message, context);
    const content = typeof result === "string"
      ? result
      : result?.response || result?.content || "I processed your request.";

    return { role: "assistant", content, timestamp: Date.now() };
  } catch (err) {
    console.error("AI chat error:", err.message);
    // Fallback to basic response if AI service unavailable
    return {
      role: "assistant",
      content: `I received your request. The AI service is not available right now, but I've loaded the relevant view for you.`,
      timestamp: Date.now(),
    };
  }
}

async function handlePortfolio() {
  // Try live Alpaca data first
  try {
    const { getAlpacaConfig, fetchAccount } = await import("./services/alpaca.js");
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
          const cachePath = path.resolve("data/alpaca-cache.json");
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
  const dataPath = path.resolve("data/trades-log.json");
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
    const { getAlpacaConfig, fetchPositions } = await import("./services/alpaca.js");
    const config = getAlpacaConfig();
    if (config.ready) {
      const positions = await fetchPositions(config);
      if (Array.isArray(positions)) {
        // Cache for brief generator
        try {
          const cachePath = path.resolve("data/alpaca-cache.json");
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
  const dataPath = path.resolve("data/trades-log.json");
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      if (data.positions) return data.positions;
    }
  } catch { /* ignore */ }
  return [];
}

async function handleSignals() {
  const dataPath = path.resolve("data/tickers-cache.json");
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
  const dataPath = path.resolve("data/oura-data.json");
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
  const dataPath = path.resolve("data/tickers-cache.json");
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
  const dataPath = path.resolve("data/life-scores.json");
  try {
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, "utf8"));
    }
  } catch { /* ignore */ }
  return {};
}

async function handleGoals() {
  const dataPath = path.resolve("data/goals.json");
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      return Array.isArray(data) ? data : data.goals || [];
    }
  } catch { /* ignore */ }
  return [];
}

async function handleCalendar() {
  try {
    const { getEmailCalendarService } = await import("./services/email-calendar-service.js");
    const service = getEmailCalendarService();
    const events = await service.getUpcomingEvents(7);
    return events || [];
  } catch {
    return [];
  }
}

async function handleNews() {
  // Try to read cached news first
  const cachePath = path.resolve("data/news-cache.json");
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
    const { fetchAndAnalyzeNews } = await import("./services/news-service.js");
    const result = await fetchAndAnalyzeNews();
    return { articles: result?.articles || result?.news || [] };
  } catch {
    return { articles: [] };
  }
}

async function handleVideos(query) {
  try {
    const { searchYouTube } = await import("./services/youtube-service.js");
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

// ── Vapi Voice AI Routes ─────────────────────────────────────

app.post("/api/vapi/call", async (req, res) => {
  try {
    const { getVapiService } = await import("./services/vapi-service.js");
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
    const { getVapiService } = await import("./services/vapi-service.js");
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
    const { getVapiService } = await import("./services/vapi-service.js");
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
    const { getVapiService } = await import("./services/vapi-service.js");
    const vapiService = getVapiService();
    res.json(vapiService.getCallStatus());
  } catch (err) {
    res.json({ active: false, error: err.message });
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

server.listen(PORT, () => {
  console.log(`BACKBONE backend listening on ${PORT}`);
  if (WebSocketServer) {
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  }
});

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
