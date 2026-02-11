/**
 * Proactive WhatsApp Scheduler
 *
 * Runs from server.js (survives CLI close). Sends personalized WhatsApp messages
 * at randomized times within configurable windows. Uses Claude Code CLI for
 * AI-generated content and the existing WhatsApp notifications layer for delivery.
 *
 * Jobs:
 *   morning-brief   — daily 07:45-08:45
 *   evening-brief   — daily 19:15-20:15
 *   market-open     — weekdays 09:25-09:50
 *   market-midday   — weekdays 12:00-13:00 (conditional: >3% move)
 *   market-close    — weekdays 16:05-16:45
 *   goal-check      — daily 10:30-11:30 (conditional: stalled/near-due)
 *   project-nudge   — daily 14:00-15:30 (conditional: needs attention)
 *   adhoc-intel     — daily 11:00-17:00 (conditional: AI decides)
 */

import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { getDataDir, getMemoryDir, getProjectsDir } from "../paths.js";

const TAG = "[ProactiveScheduler]";

// ── Job Definitions ─────────────────────────────────────────────

const JOB_DEFS = [
  {
    id: "morning-brief",
    type: "brief",
    windowStart: [7, 45],   // 07:45
    windowEnd: [8, 45],     // 08:45
    weekdaysOnly: false,
    conditional: false,
    description: "Morning brief with health, portfolio, calendar, goals",
  },
  {
    id: "evening-brief",
    type: "brief",
    windowStart: [19, 15],
    windowEnd: [20, 15],
    weekdaysOnly: false,
    conditional: false,
    description: "Evening brief with day summary and next-day preview",
  },
  {
    id: "market-open",
    type: "market",
    windowStart: [9, 25],
    windowEnd: [9, 50],
    weekdaysOnly: true,
    conditional: false,
    description: "Pre-market snapshot and key movers",
  },
  {
    id: "market-midday",
    type: "market",
    windowStart: [12, 0],
    windowEnd: [13, 0],
    weekdaysOnly: true,
    conditional: true,
    description: "Midday market update (only if >3% move in any position)",
  },
  {
    id: "market-close",
    type: "market",
    windowStart: [16, 5],
    windowEnd: [16, 45],
    weekdaysOnly: true,
    conditional: false,
    description: "Market close recap and P&L",
  },
  {
    id: "goal-check",
    type: "goals",
    windowStart: [10, 30],
    windowEnd: [11, 30],
    weekdaysOnly: false,
    conditional: true,
    description: "Nudge about stalled or near-due goals",
  },
  {
    id: "project-nudge",
    type: "projects",
    windowStart: [14, 0],
    windowEnd: [15, 30],
    weekdaysOnly: false,
    conditional: true,
    description: "Remind about projects not touched in 7+ days",
  },
  {
    id: "adhoc-intel",
    type: "adhoc",
    windowStart: [11, 0],
    windowEnd: [17, 0],
    weekdaysOnly: false,
    conditional: true,
    description: "AI decides if anything time-sensitive is worth sharing",
  },
];

// ── Helpers ─────────────────────────────────────────────────────

function minutesFromMidnight(h, m) {
  return h * 60 + m;
}

function randomMinuteInWindow(startHM, endHM) {
  const startMin = minutesFromMidnight(...startHM);
  const endMin = minutesFromMidnight(...endHM);
  const range = endMin - startMin;
  return startMin + Math.floor(Math.random() * range);
}

function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isWeekday() {
  const day = new Date().getDay();
  return day >= 1 && day <= 5;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function readJsonSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function readTextSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {}
  return "";
}

// ── ProactiveScheduler ──────────────────────────────────────────

class ProactiveScheduler extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.tickInterval = null;
    this.jobs = new Map();           // id → { def, targetMinute, firedToday, lastResult }
    this.state = {};                 // persisted state
    this.dailyMessageCount = 0;
    this.maxDailyMessages = 8;
    this.lastStateDate = null;       // track day rollover
    this.cliCooldownUntil = 0;       // timestamp — 10min cooldown after CLI failures
    this.statePath = path.join(getDataDir(), "proactive-scheduler.json");
  }

  // ── Lifecycle ───────────────────────────────────────────────

  start() {
    if (this.running) return;
    this.running = true;

    this._loadState();
    this._rolloverDay();
    this._randomizeTargets();

    // Tick every 60 seconds
    this.tickInterval = setInterval(() => this._tick(), 60_000);
    this.tickInterval.unref();

    console.log(`${TAG} Started — ${this.jobs.size} jobs scheduled`);
    for (const [id, job] of this.jobs) {
      console.log(`${TAG}   ${id} → ${minutesToTime(job.targetMinute)} (${job.def.conditional ? "conditional" : "always"})`);
    }

    this.emit("started");
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    console.log(`${TAG} Stopped`);
    this.emit("stopped");
  }

  getStatus() {
    const jobList = [];
    for (const [id, job] of this.jobs) {
      jobList.push({
        id,
        type: job.def.type,
        targetTime: minutesToTime(job.targetMinute),
        window: `${minutesToTime(minutesFromMidnight(...job.def.windowStart))}-${minutesToTime(minutesFromMidnight(...job.def.windowEnd))}`,
        conditional: job.def.conditional,
        weekdaysOnly: job.def.weekdaysOnly,
        firedToday: job.firedToday,
        lastResult: job.lastResult || null,
      });
    }
    return {
      running: this.running,
      today: todayStr(),
      dailyMessageCount: this.dailyMessageCount,
      maxDailyMessages: this.maxDailyMessages,
      isQuietHours: this._isQuietHours(),
      jobs: jobList,
    };
  }

  // ── Manual trigger (for testing) ────────────────────────────

  async triggerJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return { success: false, error: `Unknown job: ${jobId}` };
    return this._executeJob(job);
  }

  // ── Internal tick ───────────────────────────────────────────

  _tick() {
    // Day rollover check
    if (this.lastStateDate !== todayStr()) {
      this._rolloverDay();
      this._randomizeTargets();
    }

    if (this._isQuietHours()) return;

    const now = nowMinutes();

    for (const [id, job] of this.jobs) {
      if (job.firedToday) continue;
      if (job.def.weekdaysOnly && !isWeekday()) continue;
      if (now < job.targetMinute) continue;

      // Target minute has arrived (or passed) — fire
      this._executeJob(job).catch(err => {
        console.error(`${TAG} Error executing ${id}:`, err.message);
      });
    }
  }

  // ── Execute a job ───────────────────────────────────────────

  async _executeJob(job) {
    const id = job.def.id;
    job.firedToday = true;

    // Check daily cap
    if (this.dailyMessageCount >= this.maxDailyMessages) {
      const result = { success: false, error: "Daily message cap reached", skipped: true };
      job.lastResult = result;
      this._saveState();
      console.log(`${TAG} ${id} — skipped (daily cap ${this.maxDailyMessages})`);
      return result;
    }

    // Check CLI cooldown
    if (Date.now() < this.cliCooldownUntil) {
      const result = { success: false, error: "CLI cooldown active", skipped: true };
      job.lastResult = result;
      this._saveState();
      console.log(`${TAG} ${id} — skipped (CLI cooldown)`);
      return result;
    }

    console.log(`${TAG} Executing: ${id}`);

    try {
      let result;

      switch (job.def.type) {
        case "brief":
          result = await this._executeBrief(job.def);
          break;
        case "market":
          result = await this._executeMarket(job.def);
          break;
        case "goals":
          result = await this._executeGoalCheck(job.def);
          break;
        case "projects":
          result = await this._executeProjectNudge(job.def);
          break;
        case "adhoc":
          result = await this._executeAdhocIntel(job.def);
          break;
        default:
          result = { success: false, error: `Unknown type: ${job.def.type}` };
      }

      job.lastResult = result;

      if (result.success) {
        this.dailyMessageCount++;
        this.emit("job-fired", { jobId: id, type: job.def.type, result });
        console.log(`${TAG} ${id} — sent (${this.dailyMessageCount}/${this.maxDailyMessages} today)`);
      } else if (result.skipped) {
        console.log(`${TAG} ${id} — skipped: ${result.reason || result.error}`);
      } else {
        console.log(`${TAG} ${id} — failed: ${result.error}`);
      }

      this._saveState();
      return result;

    } catch (err) {
      const errorResult = { success: false, error: err.message };
      job.lastResult = errorResult;

      // CLI cooldown on failure
      if (err.message?.includes("Timeout") || err.message?.includes("not installed") || err.message?.includes("not logged in")) {
        this.cliCooldownUntil = Date.now() + 10 * 60 * 1000; // 10 minutes
        console.log(`${TAG} CLI cooldown activated for 10 minutes`);
      }

      this._saveState();
      return errorResult;
    }
  }

  // ── Brief execution (morning/evening) ───────────────────────

  async _executeBrief(def) {
    const type = def.id === "morning-brief" ? "morning" : "evening";
    try {
      const { generateAndDeliverBrief } = await import("../briefs/daily-brief-generator.js");
      const result = await generateAndDeliverBrief(type);
      if (result.duplicate) {
        return { success: false, skipped: true, reason: "Already sent today" };
      }
      return { success: result.success, briefType: type };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── Market execution ────────────────────────────────────────

  async _executeMarket(def) {
    const dataDir = getDataDir();
    const alpacaCache = readJsonSafe(path.join(dataDir, "alpaca-cache.json"));
    const tickersCache = readJsonSafe(path.join(dataDir, "tickers-cache.json"));

    // For midday conditional: check if any position moved >3%
    if (def.id === "market-midday") {
      const positions = alpacaCache?.positions || [];
      const bigMover = positions.find(p => {
        const changePercent = Math.abs(parseFloat(p.unrealized_plpc || p.change_today || 0) * 100);
        return changePercent > 3;
      });
      if (!bigMover) {
        return { success: false, skipped: true, reason: "No position moved >3%" };
      }
    }

    // Build context for Claude
    const portfolio = alpacaCache?.account || {};
    const positions = (alpacaCache?.positions || []).map(p => ({
      symbol: p.symbol,
      qty: p.qty,
      avgEntry: p.avg_entry_price,
      current: p.current_price,
      unrealizedPL: p.unrealized_pl,
      changePct: ((parseFloat(p.unrealized_plpc || 0)) * 100).toFixed(2) + "%",
    }));

    const topTickers = (tickersCache?.tickers || [])
      .sort((a, b) => (b.effectiveScore || b.score || 0) - (a.effectiveScore || a.score || 0))
      .slice(0, 5)
      .map(t => ({ symbol: t.symbol, score: (t.effectiveScore || t.score || 0).toFixed(1), price: t.price }));

    // ── Enhanced context: recession, convictions, recent trades ──
    let recessionInfo = "";
    try {
      const { getRecessionScore, getRecessionLabel } = await import("../trading/recession-score.js");
      const rs = getRecessionScore();
      recessionInfo = `\nRECESSION SCORE: ${rs.score}/10 (${getRecessionLabel(rs.score)})`;
      if (rs.components) {
        const alerts = Object.entries(rs.components)
          .filter(([, v]) => v.score >= 7)
          .map(([k, v]) => `${k}: ${v.score.toFixed(1)}/10`);
        if (alerts.length > 0) recessionInfo += ` — Elevated: ${alerts.join(", ")}`;
      }
    } catch {}

    let convictionsInfo = "";
    try {
      const convictions = readJsonSafe(path.join(dataDir, "research-convictions.json"));
      if (convictions && Array.isArray(convictions) && convictions.length > 0) {
        const active = convictions.filter(c => !c.expired).slice(0, 5);
        if (active.length > 0) {
          convictionsInfo = `\nRESEARCH CONVICTIONS: ${active.map(c => `${c.symbol} (${c.conviction})`).join(", ")}`;
        }
      }
    } catch {}

    let recentTradesInfo = "";
    try {
      const trades = readJsonSafe(path.join(dataDir, "trades-log.json"));
      if (Array.isArray(trades) && trades.length > 0) {
        const recent = trades.slice(-3).map(t =>
          `${t.side} ${t.qty}x ${t.symbol} @ $${t.price}`
        );
        recentTradesInfo = `\nRECENT TRADES: ${recent.join(" | ")}`;
      }
    } catch {}

    const promptLabel = {
      "market-open": "pre-market opening snapshot",
      "market-midday": "midday market alert (significant move detected)",
      "market-close": "end-of-day market recap",
    }[def.id] || "market update";

    const prompt = `Generate a concise WhatsApp ${promptLabel} for the user.

PORTFOLIO:
Equity: $${portfolio.equity || "?"} | Cash: $${portfolio.cash || "?"}
Positions: ${JSON.stringify(positions)}

TOP TICKERS BY SCORE: ${JSON.stringify(topTickers)}
${recessionInfo}${convictionsInfo}${recentTradesInfo}

RULES:
- Use WhatsApp formatting: *bold*, _italic_, bullet points with -
- Keep under 800 characters
- Include key numbers (P&L, % changes)
- Mention recession score if >= 5 (caution+), or convictions if noteworthy
- Be actionable: highlight what needs attention
- No markdown headers, no [links]
- If this is a midday alert, emphasize the big mover
- End with one actionable insight

Return ONLY the message text, nothing else.`;

    return this._generateAndSend(prompt, def.id === "market-midday" ? "alert" : "trade");
  }

  // ── Goal check execution ────────────────────────────────────

  async _executeGoalCheck(def) {
    const goalsPath = path.join(getDataDir(), "goals.json");
    const goals = readJsonSafe(goalsPath);
    if (!goals || !Array.isArray(goals)) {
      return { success: false, skipped: true, reason: "No goals data" };
    }

    const activeGoals = goals.filter(g => g.status === "active" || g.status === "in_progress");
    if (activeGoals.length === 0) {
      return { success: false, skipped: true, reason: "No active goals" };
    }

    const now = Date.now();
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

    // Find stalled goals (3+ days no progress update)
    const stalledGoals = activeGoals.filter(g => {
      const lastUpdate = g.lastUpdated || g.updatedAt || g.createdAt;
      if (!lastUpdate) return true;
      return (now - new Date(lastUpdate).getTime()) > THREE_DAYS;
    });

    // Find near-complete goals (>= 75% progress) — worth a push
    const nearComplete = activeGoals.filter(g => {
      const progress = g.progress || 0;
      return progress >= 75 && progress < 100;
    });

    if (stalledGoals.length === 0 && nearComplete.length === 0) {
      return { success: false, skipped: true, reason: "All goals progressing, none near finish" };
    }

    const stalledSummary = stalledGoals.map(g => ({
      title: g.title,
      category: g.category,
      progress: g.progress || 0,
      daysSinceUpdate: Math.floor((now - new Date(g.lastUpdated || g.updatedAt || g.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
      type: "stalled",
    }));

    const nearCompleteSummary = nearComplete
      .filter(g => !stalledGoals.find(s => s.id === g.id)) // avoid duplicates
      .map(g => ({
        title: g.title,
        category: g.category,
        progress: g.progress || 0,
        type: "near-complete",
      }));

    const allGoals = [...stalledSummary, ...nearCompleteSummary];

    const prompt = `Generate a motivating WhatsApp goal check-in nudge.

GOALS NEEDING ATTENTION:
${JSON.stringify(allGoals, null, 2)}

RULES:
- Use WhatsApp formatting: *bold*, _italic_, bullet points
- Keep under 600 characters
- For "near-complete" goals: celebrate the progress and encourage the final push
- For "stalled" goals: be encouraging, not naggy, suggest one small next step
- Prioritize near-complete goals (they're almost wins!)
- No markdown headers, no [links]

Return ONLY the message text, nothing else.`;

    return this._generateAndSend(prompt, "reminder");
  }

  // ── Project nudge execution ─────────────────────────────────

  async _executeProjectNudge(def) {
    const projectsDir = getProjectsDir();
    if (!fs.existsSync(projectsDir)) {
      return { success: false, skipped: true, reason: "No projects directory" };
    }

    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const staleProjects = [];

    try {
      const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const projectMd = path.join(projectsDir, entry.name, "PROJECT.md");
        if (!fs.existsSync(projectMd)) continue;

        const stat = fs.statSync(projectMd);
        const age = now - stat.mtimeMs;
        if (age > SEVEN_DAYS) {
          // Read first 500 chars for context
          const content = readTextSafe(projectMd).slice(0, 500);
          const titleMatch = content.match(/^#\s+(.+)/m);
          staleProjects.push({
            name: entry.name,
            title: titleMatch ? titleMatch[1] : entry.name,
            daysSinceTouch: Math.floor(age / (24 * 60 * 60 * 1000)),
          });
        }
      }
    } catch {}

    if (staleProjects.length === 0) {
      return { success: false, skipped: true, reason: "No stale projects" };
    }

    // Only nudge top 3 most stale
    staleProjects.sort((a, b) => b.daysSinceTouch - a.daysSinceTouch);
    const top = staleProjects.slice(0, 3);

    const prompt = `Generate a WhatsApp project nudge. These projects haven't been touched recently:

${JSON.stringify(top, null, 2)}

RULES:
- Use WhatsApp formatting: *bold*, _italic_, bullet points
- Keep under 500 characters
- Ask if they should be resumed, archived, or deprioritized
- Be helpful, not guilt-inducing
- No markdown headers, no [links]

Return ONLY the message text, nothing else.`;

    return this._generateAndSend(prompt, "reminder");
  }

  // ── Ad-hoc intelligence ─────────────────────────────────────

  async _executeAdhocIntel(def) {
    const dataDir = getDataDir();
    const memoryDir = getMemoryDir();

    // Gather broad context
    const goals = readJsonSafe(path.join(dataDir, "goals.json")) || [];
    const thesis = readTextSafe(path.join(memoryDir, "thesis.md")).slice(0, 1000);
    const beliefs = readJsonSafe(path.join(dataDir, "core-beliefs.json")) || [];
    const portfolio = readJsonSafe(path.join(dataDir, "alpaca-cache.json"));

    const activeGoals = goals.filter(g => g.status === "active" || g.status === "in_progress").slice(0, 5)
      .map(g => ({ title: g.title, category: g.category, progress: g.progress }));

    const positions = (portfolio?.positions || []).slice(0, 5)
      .map(p => ({ symbol: p.symbol, pl: p.unrealized_pl }));

    const beliefNames = beliefs.map(b => b.name || b.title || b).slice(0, 5);

    const prompt = `You are BACKBONE, a proactive AI assistant. Decide if there's anything time-sensitive or valuable to share with the user RIGHT NOW.

CONTEXT:
- Date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
- Current thesis: ${thesis.slice(0, 300) || "Not set"}
- Active goals: ${JSON.stringify(activeGoals)}
- Portfolio positions: ${JSON.stringify(positions)}
- Core beliefs: ${JSON.stringify(beliefNames)}

DECISION:
If there is something genuinely time-sensitive, actionable, or insightful to share (a deadline approaching, a market event, a connection between goals/beliefs/portfolio), write a concise WhatsApp message.

If there is NOTHING worth interrupting the user for, respond with exactly: SKIP

RULES:
- Only share if it's truly valuable — don't manufacture urgency
- Use WhatsApp formatting: *bold*, _italic_, bullet points
- Keep under 500 characters
- No markdown headers, no [links]

Return ONLY the message text or "SKIP".`;

    const content = await this._generateContent(prompt);
    if (!content || content.trim() === "SKIP") {
      return { success: false, skipped: true, reason: "AI decided nothing worth sharing" };
    }

    return this._sendMessage(content.trim(), "system");
  }

  // ── Content generation via Claude Code CLI ──────────────────

  async _generateContent(prompt) {
    try {
      const { runClaudeCodePrompt } = await import("../ai/claude-code-cli.js");
      const result = await runClaudeCodePrompt(prompt, { timeout: 90_000 });
      if (result.success && result.output) {
        return result.output.trim();
      }
      console.log(`${TAG} CLI returned no output:`, result.error);
      return null;
    } catch (err) {
      console.error(`${TAG} CLI error:`, err.message);
      throw err;
    }
  }

  async _generateAndSend(prompt, notificationType) {
    const content = await this._generateContent(prompt);
    if (!content) {
      return { success: false, error: "No content generated" };
    }
    return this._sendMessage(content, notificationType);
  }

  async _sendMessage(message, notificationType) {
    try {
      const { getWhatsAppNotifications } = await import("./whatsapp-notifications.js");
      const notif = getWhatsAppNotifications();

      // Auto-init if needed
      if (!notif.enabled) {
        await notif.initialize("default");
      }

      const result = await notif.send(notificationType, message, {
        identifier: `proactive_${todayStr()}_${Date.now()}`,
        allowDuplicate: false,
      });

      return { success: result.success, error: result.error || null, messageLength: message.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── State management ────────────────────────────────────────

  _loadState() {
    this.state = readJsonSafe(this.statePath) || {};
  }

  _saveState() {
    const today = todayStr();
    const jobStates = {};
    for (const [id, job] of this.jobs) {
      jobStates[id] = {
        targetMinute: job.targetMinute,
        firedToday: job.firedToday,
        lastResult: job.lastResult,
      };
    }
    this.state = {
      date: today,
      dailyMessageCount: this.dailyMessageCount,
      jobs: jobStates,
      lastSaved: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error(`${TAG} Failed to save state:`, err.message);
    }
  }

  _rolloverDay() {
    const today = todayStr();
    if (this.lastStateDate === today) return;

    this.lastStateDate = today;
    this.dailyMessageCount = 0;

    // Reset all jobs
    for (const [, job] of this.jobs) {
      job.firedToday = false;
      job.lastResult = null;
    }

    // Check if saved state is from today (resume after restart)
    if (this.state.date === today) {
      this.dailyMessageCount = this.state.dailyMessageCount || 0;
      for (const [id, job] of this.jobs) {
        const saved = this.state.jobs?.[id];
        if (saved) {
          job.firedToday = saved.firedToday || false;
          job.lastResult = saved.lastResult || null;
          if (saved.targetMinute != null) {
            job.targetMinute = saved.targetMinute;
          }
        }
      }
      console.log(`${TAG} Resumed state for ${today} (${this.dailyMessageCount} messages sent)`);
    } else {
      console.log(`${TAG} New day: ${today}`);
    }
  }

  _randomizeTargets() {
    // Initialize job entries from definitions
    for (const def of JOB_DEFS) {
      const existing = this.jobs.get(def.id);
      if (existing && existing.targetMinute != null) {
        // Keep existing target if already set (resumed from state)
        continue;
      }
      const targetMinute = randomMinuteInWindow(def.windowStart, def.windowEnd);
      this.jobs.set(def.id, {
        def,
        targetMinute,
        firedToday: false,
        lastResult: null,
      });
    }
  }

  _isQuietHours() {
    const hour = new Date().getHours();
    return hour >= 22 || hour < 7;
  }
}

// ── Singleton ───────────────────────────────────────────────────

let instance = null;

export function getProactiveScheduler() {
  if (!instance) {
    instance = new ProactiveScheduler();
  }
  return instance;
}

export default ProactiveScheduler;
