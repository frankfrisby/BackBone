/**
 * Vapi Voice AI Phone Call Service
 *
 * Enables outbound phone calls via Vapi with voice persona "Cole".
 * Pre-loads consolidated user context (portfolio, goals, health, beliefs,
 * thesis, calendar, past call history) into the system prompt.
 *
 * Webhook handled by Firebase Cloud Function (no ngrok required):
 *   https://us-central1-backboneai.cloudfunctions.net/vapiWebhook
 *
 * Keys stored in Firebase Firestore: config/config_vapi
 */

import { EventEmitter } from "events";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { fetchVapiConfig } from "./firebase-config.js";
import { loadUserSettings } from "./user-settings.js";
import { getAlpacaConfig } from "./alpaca.js";

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_DIR = path.join(process.cwd(), "memory");
const TRANSCRIPTS_DIR = path.join(DATA_DIR, "call-transcripts");

// Firebase Cloud Function webhook URL — no ngrok needed
const CLOUD_WEBHOOK_URL = "https://us-central1-backboneai.cloudfunctions.net/vapiWebhook";

// Alpaca API helpers — use shared config loader (supports data/alpaca-config.json fallback)
const getAlpacaHeaders = () => {
  const config = getAlpacaConfig();
  return {
    "APCA-API-KEY-ID": config.key,
    "APCA-API-SECRET-KEY": config.secret,
    "Content-Type": "application/json",
  };
};

const getAlpacaBaseUrl = () => getAlpacaConfig().baseUrl;

// Tool definitions sent to Vapi assistant
const VAPI_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "get_portfolio",
      description: "Get LIVE portfolio summary including equity, buying power, and day change. Use this for real-time data beyond what's in your context.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_positions",
      description: "Get LIVE current stock positions with profit and loss. Use this for real-time data beyond what's in your context.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "buy_stock",
      description: "Buy a stock using a market order. Always confirm with the user before executing.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Stock ticker symbol (e.g. AAPL)" },
          qty: { type: "number", description: "Number of shares to buy" },
        },
        required: ["symbol", "qty"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sell_stock",
      description: "Sell a stock using a market order. Always confirm with the user before executing.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Stock ticker symbol (e.g. AAPL)" },
          qty: { type: "number", description: "Number of shares to sell" },
        },
        required: ["symbol", "qty"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_goals",
      description: "Get the user's active goals and their progress",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_health_summary",
      description: "Get health data from Oura ring including sleep, readiness, and activity",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_calendar_events",
      description: "Get today's calendar events",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Draft an email (safety: creates draft only, does not send)",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body text" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_life_scores",
      description: "Get life dimension scores across health, wealth, career, relationships, etc.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "run_task",
      description: "Run a complex task in the background via Claude Code. Use for research, analysis, or multi-step tasks that take time.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "Description of the task to perform" },
        },
        required: ["description"],
      },
    },
  },
];

// ── Consolidated Context Builder ────────────────────────────────

/**
 * Build a comprehensive context string from all local data sources.
 * This gets baked into the system prompt so Cole already knows everything.
 */
async function buildConsolidatedContext() {
  const sections = [];
  const settings = loadUserSettings();

  // User profile
  sections.push("## User Profile");
  sections.push(`Name: ${settings.linkedInName || settings.firebaseUser?.name || "Unknown"}`);
  sections.push(`Email: ${settings.firebaseUser?.email || "Not set"}`);
  if (settings.coreGoals) {
    sections.push(`Core Goals: ${settings.coreGoals}`);
  }

  // Core beliefs
  const beliefs = readJsonSafe("core-beliefs.json");
  if (beliefs?.beliefs?.length > 0) {
    sections.push("\n## Core Beliefs");
    beliefs.beliefs.forEach(b => {
      sections.push(`- ${b.name}: ${b.description}`);
    });
  }

  // Current thesis
  const thesis = readFileSafe(path.join(MEMORY_DIR, "thesis.md"));
  if (thesis) {
    sections.push("\n## Current Thesis & Focus");
    // Trim to keep prompt manageable
    sections.push(thesis.substring(0, 1500));
  }

  // Portfolio — fetch live from Alpaca
  try {
    const baseUrl = getAlpacaBaseUrl();
    const [acctResp, posResp] = await Promise.all([
      fetch(`${baseUrl}/v2/account`, { headers: getAlpacaHeaders() }),
      fetch(`${baseUrl}/v2/positions`, { headers: getAlpacaHeaders() })
    ]);

    if (acctResp.ok) {
      const acct = await acctResp.json();
      sections.push("\n## Portfolio (Live)");
      sections.push(`Equity: $${Number(acct.equity).toLocaleString()}`);
      sections.push(`Buying Power: $${Number(acct.buying_power).toLocaleString()}`);
      sections.push(`Day P/L: $${(Number(acct.equity) - Number(acct.last_equity)).toFixed(2)}`);
    }

    if (posResp.ok) {
      const positions = await posResp.json();
      if (positions.length > 0) {
        sections.push("\nPositions:");
        positions.forEach(p => {
          sections.push(`- ${p.symbol}: ${p.qty} shares, $${Number(p.market_value).toLocaleString()}, P/L ${(Number(p.unrealized_plpc) * 100).toFixed(1)}% ($${Number(p.unrealized_pl).toFixed(2)})`);
        });
      } else {
        sections.push("\nNo open positions.");
      }
    }
  } catch (err) {
    // Fall back to cached data
    const cached = readFileSafe(path.join(MEMORY_DIR, "portfolio.md"));
    if (cached) {
      sections.push("\n## Portfolio (Cached)");
      sections.push(cached.substring(0, 800));
    }
  }

  // Goals
  const goals = readJsonSafe("goals.json");
  if (goals) {
    const goalList = Array.isArray(goals) ? goals : goals.goals || [];
    const active = goalList.filter(g => g.status === "active");
    if (active.length > 0) {
      sections.push("\n## Active Goals");
      active.forEach(g => {
        sections.push(`- ${g.title} (${g.progress || 0}% complete, priority ${g.priority || "N/A"})`);
      });
    }
  }

  // Health
  const healthMd = readFileSafe(path.join(MEMORY_DIR, "health.md"));
  if (healthMd) {
    sections.push("\n## Health");
    sections.push(healthMd.substring(0, 600));
  } else {
    const oura = readJsonSafe("oura-data.json") || readJsonSafe("oura-cache.json");
    if (oura) {
      sections.push("\n## Health");
      if (oura.sleep?.score) sections.push(`Sleep Score: ${oura.sleep.score}`);
      if (oura.readiness?.score) sections.push(`Readiness: ${oura.readiness.score}`);
      if (oura.activity?.score) sections.push(`Activity: ${oura.activity.score}`);
    }
  }

  // Life scores
  const lifeScores = readJsonSafe("life-scores.json");
  if (lifeScores) {
    const dims = lifeScores.dimensions || lifeScores;
    if (typeof dims === "object") {
      sections.push("\n## Life Scores");
      Object.entries(dims).forEach(([k, v]) => {
        if (k !== "updatedAt" && k !== "lastUpdated") {
          sections.push(`- ${k}: ${typeof v === "object" ? v.score || JSON.stringify(v) : v}`);
        }
      });
    }
  }

  // Calendar
  const calPath = path.join(DATA_DIR, "calendar-cache.json");
  if (fs.existsSync(calPath)) {
    try {
      const cal = JSON.parse(fs.readFileSync(calPath, "utf-8"));
      const events = Array.isArray(cal) ? cal : cal.events || [];
      if (events.length > 0) {
        sections.push("\n## Today's Calendar");
        events.slice(0, 5).forEach(e => {
          sections.push(`- ${e.summary || e.title}: ${e.start?.dateTime || e.start || "TBD"}`);
        });
      }
    } catch {}
  }

  // Past call history — load recent transcripts for continuity
  const recentCalls = loadRecentTranscripts(3);
  if (recentCalls.length > 0) {
    sections.push("\n## Recent Call History");
    sections.push("Previous conversations with the user (use for continuity):");
    recentCalls.forEach(call => {
      sections.push(`\n### Call on ${call.date} (${call.duration || "unknown duration"})`);
      if (call.summary) {
        sections.push(`Summary: ${call.summary}`);
      }
      if (call.highlights?.length > 0) {
        call.highlights.forEach(h => sections.push(`- ${h}`));
      }
    });
  }

  return sections.join("\n");
}

/**
 * Build the full system prompt with consolidated context
 */
async function buildSystemPrompt(customPrompt) {
  const context = await buildConsolidatedContext();

  const basePrompt = `You are Cole from BACKBONE. You sound natural and direct — like a sharp friend, not a customer service rep.

OPENING THE CALL:
- Start with just: "Hey, reaching out to Frank."
- Wait for them to confirm who they are before saying anything else.
- If it goes to voicemail, just say: "Hey Frank, it's Cole. Give me a call back when you get a chance." — nothing more.
- NEVER put data, numbers, or details in the opening. Protect information until you know Frank is on the line.

VOICE STYLE:
- No background noise, no hold music vibes. Clean and direct.
- Talk like a real person. Short sentences. No corporate speak.
- Don't say "I'm calling to discuss your portfolio" — just get into it naturally once Frank is confirmed.

CONTEXT (use only AFTER Frank confirms he's on the line):
${context}

BEHAVIORS:
- You have Frank's full context above. Reference it naturally.
- Only use tools for LIVE real-time data or to EXECUTE actions.
- Always confirm before executing trades.
- Speak numbers naturally (e.g., "twelve hundred" not "1,200").
- Reference past calls naturally for continuity.
- Keep it tight. Don't over-explain. Frank knows his own life.`;

  if (customPrompt) {
    return `${basePrompt}\n\nADDITIONAL INSTRUCTIONS FOR THIS CALL:\n${customPrompt}`;
  }

  return basePrompt;
}

// ── Helper functions ──────────────────────────────────────────

function readJsonSafe(filename) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function readFileSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {}
  return null;
}

/**
 * Load recent call transcripts from local storage
 */
function loadRecentTranscripts(count = 3) {
  try {
    if (!fs.existsSync(TRANSCRIPTS_DIR)) return [];

    const files = fs.readdirSync(TRANSCRIPTS_DIR)
      .filter(f => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, count);

    return files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(TRANSCRIPTS_DIR, f), "utf-8"));
        return {
          date: data.date || data.createdAt || f.replace(".json", ""),
          duration: data.duration ? `${Math.round(data.duration / 60)} min` : null,
          summary: data.summary || null,
          highlights: data.highlights || [],
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Save a call transcript locally
 */
function saveTranscriptLocally(callId, transcriptData) {
  try {
    if (!fs.existsSync(TRANSCRIPTS_DIR)) {
      fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
    }

    const filename = `${new Date().toISOString().split("T")[0]}_${callId}.json`;
    const filePath = path.join(TRANSCRIPTS_DIR, filename);

    fs.writeFileSync(filePath, JSON.stringify({
      callId,
      date: new Date().toISOString(),
      ...transcriptData
    }, null, 2));

    return filePath;
  } catch (err) {
    console.error("Failed to save transcript:", err.message);
    return null;
  }
}

// ── VapiService Class ───────────────────────────────────────────

export class VapiService extends EventEmitter {
  constructor() {
    super();
    this.config = null;
    this.client = null;
    this.activeCall = null;
    this.callTranscript = [];
    this.backgroundTasks = new Map();
  }

  /**
   * Initialize the Vapi service — loads config from Firebase
   */
  async initialize() {
    if (this.config) return this;

    this.config = await fetchVapiConfig();
    if (!this.config?.privateKey) {
      throw new Error("Vapi not configured. Create Firestore document config/config_vapi with: privateKey, publicKey, phoneNumberId");
    }

    try {
      const { VapiClient } = await import("@vapi-ai/server-sdk");
      this.client = new VapiClient({ token: this.config.privateKey });
    } catch (err) {
      throw new Error(`Failed to load Vapi SDK. Run: npm install @vapi-ai/server-sdk\n${err.message}`);
    }

    return this;
  }

  /**
   * Get the user's phone number from local settings
   */
  getUserPhoneNumber() {
    const settings = loadUserSettings();
    const number = settings.phoneNumber;
    if (!number) {
      throw new Error("No phone number configured. Set your phone number in user settings or run /connect phone.");
    }
    return number;
  }

  /**
   * Resolve voice settings
   */
  getVoiceConfig() {
    const userSettings = loadUserSettings();
    const userVoice = userSettings.voicePreferences;
    const provider = userVoice?.provider || this.config?.defaultVoiceProvider || "vapi";
    const voiceId = userVoice?.voiceId || this.config?.defaultVoiceId || "Cole";
    return { provider, voiceId };
  }

  /**
   * Start an outbound phone call to the user.
   * Uses Firebase Cloud Function as webhook — no ngrok needed.
   */
  async callUser(customPrompt) {
    await this.initialize();

    const voice = this.getVoiceConfig();
    const systemPrompt = await buildSystemPrompt(customPrompt);

    this.emit("status", { message: `Building context and initiating call (voice: ${voice.voiceId})...` });

    try {
      const call = await this.client.calls.create({
        phoneNumberId: this.config.phoneNumberId,
        customer: {
          number: this.getUserPhoneNumber(),
        },
        assistant: {
          name: `BACKBONE ${voice.voiceId}`,
          voice: {
            provider: voice.provider,
            voiceId: voice.voiceId,
          },
          model: {
            provider: "openai",
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
            ],
            tools: VAPI_TOOL_DEFINITIONS,
          },
          serverUrl: CLOUD_WEBHOOK_URL,
          serverMessages: ["tool-calls", "end-of-call-report", "status-update", "transcript"],
        },
      });

      this.activeCall = {
        id: call.id,
        status: "initiating",
        startedAt: new Date().toISOString(),
      };
      this.callTranscript = [];
      this.backgroundTasks.clear();

      this.emit("call-started", { callId: call.id });
      return call;
    } catch (err) {
      this.emit("call-failed", { error: err.message });
      throw err;
    }
  }

  /**
   * End the active call
   */
  async endCall(callId) {
    const id = callId || this.activeCall?.id;
    if (!id) {
      throw new Error("No active call to end");
    }

    try {
      await this.client.calls.update(id, { status: "ended" });
      this.emit("call-ended", { callId: id, reason: "user-ended" });
    } catch (err) {
      this.emit("call-ended", { callId: id, reason: "already-ended" });
    }

    // Save transcript locally before clearing
    if (this.callTranscript.length > 0) {
      saveTranscriptLocally(id, {
        transcript: this.callTranscript,
        duration: this.activeCall?.startedAt
          ? (Date.now() - new Date(this.activeCall.startedAt).getTime()) / 1000
          : null,
      });
    }

    this.activeCall = null;
  }

  /**
   * Get current call status
   */
  getCallStatus() {
    return {
      active: !!this.activeCall,
      call: this.activeCall,
      transcript: this.callTranscript,
      webhookUrl: CLOUD_WEBHOOK_URL,
      backgroundTasks: Object.fromEntries(
        [...this.backgroundTasks.entries()].map(([id, task]) => [id, {
          description: task.description,
          status: task.status,
          result: task.result?.substring(0, 200),
        }])
      ),
    };
  }

  /**
   * Handle incoming webhook message from Vapi (local fallback)
   */
  handleWebhookMessage(message) {
    const { type } = message.message || message;

    switch (type) {
      case "status-update": {
        const status = message.message?.status || message.status;
        if (this.activeCall) {
          this.activeCall.status = status;
        }
        this.emit("status-update", { status });
        break;
      }

      case "transcript": {
        const transcript = message.message || message;
        this.callTranscript.push({
          role: transcript.role,
          text: transcript.transcript,
          timestamp: new Date().toISOString(),
        });
        this.emit("transcript", {
          role: transcript.role,
          text: transcript.transcript,
        });
        break;
      }

      case "end-of-call-report": {
        const report = message.message || message;
        const callId = this.activeCall?.id || `call_${Date.now()}`;

        // Save transcript locally
        saveTranscriptLocally(callId, {
          transcript: this.callTranscript,
          summary: report.summary,
          duration: report.duration || report.durationSeconds,
          messages: report.messages || report.transcript || [],
        });

        // Log to activity log
        this.logCallToActivity(report);
        this.activeCall = null;
        this.emit("call-ended", {
          reason: "completed",
          duration: report.duration || report.durationSeconds,
          summary: report.summary,
        });
        break;
      }

      case "hang": {
        this.emit("call-error", { error: "Call disconnected unexpectedly" });
        break;
      }
    }
  }

  /**
   * Log completed call to activity log
   */
  logCallToActivity(report) {
    try {
      const logPath = path.join(DATA_DIR, "activity-log.json");
      let log = [];
      if (fs.existsSync(logPath)) {
        log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      }
      log.push({
        type: "vapi-call",
        timestamp: new Date().toISOString(),
        duration: report.duration || report.durationSeconds,
        summary: report.summary || "Voice call completed",
        transcriptLength: this.callTranscript.length,
      });
      fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    } catch {}
  }

  /**
   * Execute a tool call from Vapi webhook (Cole calling functions during conversation)
   */
  async executeToolCall(toolName, params, toolCallId) {
    console.log(`[Vapi] Tool call: ${toolName}`, params);

    try {
      switch (toolName) {
        case "get_portfolio": {
          const res = await fetch(`${getAlpacaBaseUrl()}/v2/account`, { headers: getAlpacaHeaders() });
          if (!res.ok) return { error: `Alpaca API error: ${res.status}` };
          const account = await res.json();
          return {
            equity: account.equity,
            buyingPower: account.buying_power,
            cash: account.cash,
            dayPL: (parseFloat(account.equity) - parseFloat(account.last_equity)).toFixed(2),
          };
        }

        case "get_positions": {
          const res = await fetch(`${getAlpacaBaseUrl()}/v2/positions`, { headers: getAlpacaHeaders() });
          if (!res.ok) return { error: `Alpaca API error: ${res.status}` };
          const positions = await res.json();
          return positions.map(p => ({
            symbol: p.symbol,
            qty: p.qty,
            avgEntry: p.avg_entry_price,
            currentPrice: p.current_price,
            marketValue: p.market_value,
            unrealizedPL: p.unrealized_pl,
            unrealizedPLPercent: p.unrealized_plpc,
          }));
        }

        case "buy_stock": {
          const { symbol, qty } = params;
          if (!symbol || !qty) return { error: "Missing symbol or qty" };
          const res = await fetch(`${getAlpacaBaseUrl()}/v2/orders`, {
            method: "POST",
            headers: getAlpacaHeaders(),
            body: JSON.stringify({ symbol: symbol.toUpperCase(), qty: Number(qty), side: "buy", type: "market", time_in_force: "day" }),
          });
          const order = await res.json();
          if (!res.ok) return { error: order.message || `Order failed: ${res.status}` };
          return { success: true, orderId: order.id, symbol: order.symbol, qty: order.qty, side: "buy", status: order.status };
        }

        case "sell_stock": {
          const { symbol, qty } = params;
          if (!symbol || !qty) return { error: "Missing symbol or qty" };
          const res = await fetch(`${getAlpacaBaseUrl()}/v2/orders`, {
            method: "POST",
            headers: getAlpacaHeaders(),
            body: JSON.stringify({ symbol: symbol.toUpperCase(), qty: Number(qty), side: "sell", type: "market", time_in_force: "day" }),
          });
          const order = await res.json();
          if (!res.ok) return { error: order.message || `Order failed: ${res.status}` };
          return { success: true, orderId: order.id, symbol: order.symbol, qty: order.qty, side: "sell", status: order.status };
        }

        case "get_goals": {
          const goalsPath = path.join(DATA_DIR, "goals.json");
          if (!fs.existsSync(goalsPath)) return { goals: [] };
          const goals = JSON.parse(fs.readFileSync(goalsPath, "utf-8"));
          return Array.isArray(goals) ? goals.filter(g => g.status === "active").slice(0, 10) : [];
        }

        case "get_health_summary": {
          const ouraPath = path.join(DATA_DIR, "oura-data.json");
          if (!fs.existsSync(ouraPath)) return { error: "No health data available" };
          const oura = JSON.parse(fs.readFileSync(ouraPath, "utf-8"));
          const sleep = oura.sleep?.at(-1) || {};
          const readiness = oura.readiness?.at(-1) || {};
          const activity = oura.activity?.at(-1) || {};
          return {
            sleep: { score: sleep.score, duration: sleep.total_sleep_duration, efficiency: sleep.efficiency },
            readiness: { score: readiness.score },
            activity: { score: activity.score, steps: activity.steps, calories: activity.total_calories },
          };
        }

        case "get_calendar_events": {
          try {
            const { getCalendarEvents } = await import("./email.js");
            const events = await getCalendarEvents();
            return events?.slice(0, 10) || [];
          } catch {
            return { error: "Calendar not available" };
          }
        }

        case "web_search": {
          const { query } = params;
          if (!query) return { error: "Missing search query" };
          // Use a simple fetch to search (limited without API key)
          return { note: `Web search for "${query}" - use BACKBONE's web tools for full results`, query };
        }

        case "send_email": {
          const { to, subject, body } = params;
          if (!to || !subject) return { error: "Missing email fields" };
          // Safety: create draft only, don't send
          try {
            const draftsDir = path.join(DATA_DIR, "email-drafts");
            if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });
            const draftPath = path.join(draftsDir, `draft_${Date.now()}.json`);
            fs.writeFileSync(draftPath, JSON.stringify({ to, subject, body, createdAt: new Date().toISOString() }, null, 2));
            return { success: true, message: `Email draft saved. To: ${to}, Subject: ${subject}` };
          } catch (err) {
            return { error: `Failed to save draft: ${err.message}` };
          }
        }

        case "get_life_scores": {
          const scoresPath = path.join(DATA_DIR, "life-scores.json");
          if (!fs.existsSync(scoresPath)) return { error: "No life scores available" };
          return JSON.parse(fs.readFileSync(scoresPath, "utf-8"));
        }

        case "run_task": {
          const { description } = params;
          if (!description) return { error: "Missing task description" };
          const taskId = `task_${Date.now()}`;
          this.backgroundTasks.set(taskId, { description, status: "queued", startedAt: new Date().toISOString(), result: null });
          // Don't block the call — just queue it
          return { taskId, status: "queued", message: `Task "${description}" has been queued for background execution.` };
        }

        default:
          return { error: `Unknown tool: ${toolName}` };
      }
    } catch (err) {
      console.error(`[Vapi] Tool call ${toolName} failed:`, err.message);
      return { error: err.message };
    }
  }

  /**
   * Shutdown — end active call
   */
  async shutdown() {
    if (this.activeCall) {
      try { await this.endCall(); } catch {}
    }
    this.config = null;
    this.client = null;
  }
}

// Singleton instance
let vapiInstance = null;

export const getVapiService = () => {
  if (!vapiInstance) {
    vapiInstance = new VapiService();
  }
  return vapiInstance;
};

export default VapiService;
