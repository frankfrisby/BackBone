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

// Trade execution
app.post("/api/trade", async (req, res) => {
  try {
    const { symbol, action, quantity } = req.body;
    res.json({ ok: true, symbol, action, quantity, status: "submitted" });
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
  const dataPath = path.resolve("data/trades-log.json");
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      return data.portfolio || {
        equity: 0,
        buyingPower: 0,
        dayPL: 0,
        dayPLPercent: 0,
        totalPL: 0,
        totalPLPercent: 0,
      };
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
  const dataPath = path.resolve("data/trades-log.json");
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      return data.positions || [];
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
      if (data.tickers) {
        for (const [symbol, ticker] of Object.entries(data.tickers)) {
          if (ticker.score >= 70) {
            signals.push({ symbol, action: "buy", score: ticker.score, reason: ticker.signal || "High score" });
          } else if (ticker.score <= 30) {
            signals.push({ symbol, action: "sell", score: ticker.score, reason: ticker.signal || "Low score" });
          }
        }
      }
      return signals;
    }
  } catch { /* ignore */ }
  return [];
}

async function handleHealth() {
  const dataPath = path.resolve("data/oura-data.json");
  try {
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, "utf8"));
    }
  } catch { /* ignore */ }
  return { readinessScore: 0, sleepScore: 0, activityScore: 0 };
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

// ── Vapi Voice AI Webhook Routes ────────────────────────────

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

server.listen(PORT, () => {
  console.log(`BACKBONE backend listening on ${PORT}`);
  if (WebSocketServer) {
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  }
});

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
