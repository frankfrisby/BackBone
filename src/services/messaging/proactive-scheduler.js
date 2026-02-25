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
  {
    id: "intel-sweep-early",
    type: "intel-sweep",
    windowStart: [6, 15],
    windowEnd: [6, 45],
    weekdaysOnly: false,
    conditional: false,
    description: "Early intel sweep — overnight news, pre-market prep before morning brief",
  },
  {
    id: "intel-sweep-morning",
    type: "intel-sweep",
    windowStart: [8, 30],
    windowEnd: [9, 15],
    weekdaysOnly: false,
    conditional: false,
    description: "Morning intel sweep — news on portfolio, tickers, goals, beliefs",
  },
  {
    id: "intel-sweep-midday",
    type: "intel-sweep",
    windowStart: [12, 30],
    windowEnd: [13, 30],
    weekdaysOnly: false,
    conditional: false,
    description: "Midday intel sweep — market moves, goal-relevant developments",
  },
  {
    id: "intel-sweep-evening",
    type: "intel-sweep",
    windowStart: [17, 30],
    windowEnd: [18, 30],
    weekdaysOnly: false,
    conditional: false,
    description: "Evening intel sweep — after-hours news, next-day prep",
  },
  {
    id: "context-sync-morning",
    type: "context-sync",
    windowStart: [7, 0],
    windowEnd: [7, 15],
    weekdaysOnly: false,
    conditional: false,
    description: "Sync user context to Firebase for cloud AI",
  },
  {
    id: "context-sync-midday",
    type: "context-sync",
    windowStart: [12, 0],
    windowEnd: [12, 15],
    weekdaysOnly: false,
    conditional: false,
    description: "Sync user context to Firebase for cloud AI",
  },
  {
    id: "context-sync-afternoon",
    type: "context-sync",
    windowStart: [16, 0],
    windowEnd: [16, 15],
    weekdaysOnly: false,
    conditional: false,
    description: "Sync user context to Firebase for cloud AI",
  },
  {
    id: "context-sync-evening",
    type: "context-sync",
    windowStart: [21, 0],
    windowEnd: [21, 15],
    weekdaysOnly: false,
    conditional: false,
    description: "Sync user context to Firebase for cloud AI",
  },
  {
    id: "brokerage-sync-morning",
    type: "brokerage",
    windowStart: [6, 0],
    windowEnd: [6, 15],
    weekdaysOnly: false,
    conditional: false,
    description: "Morning brokerage data sync (Empower, Robinhood, Fidelity)",
  },
  {
    id: "brokerage-sync-afternoon",
    type: "brokerage",
    windowStart: [16, 30],
    windowEnd: [16, 45],
    weekdaysOnly: false,
    conditional: false,
    description: "Afternoon brokerage data sync (Empower, Robinhood, Fidelity)",
  },
  {
    id: "email-digest-morning",
    type: "email",
    windowStart: [7, 0],
    windowEnd: [7, 30],
    weekdaysOnly: false,
    conditional: false,
    description: "Morning email digest — top useful emails",
  },
  {
    id: "email-digest-midday",
    type: "email",
    windowStart: [12, 0],
    windowEnd: [12, 30],
    weekdaysOnly: false,
    conditional: false,
    description: "Midday email digest — top useful emails",
  },
  {
    id: "email-digest-evening",
    type: "email",
    windowStart: [17, 0],
    windowEnd: [17, 30],
    weekdaysOnly: false,
    conditional: false,
    description: "Evening email digest — top useful emails",
  },
  {
    id: "claude-update",
    type: "claude-update",
    windowStart: [3, 0],
    windowEnd: [4, 0],
    weekdaysOnly: false,
    conditional: false,
    description: "Daily Claude Code CLI update check",
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

  async triggerJob(jobId, opts = {}) {
    const job = this.jobs.get(jobId);
    if (!job) return { success: false, error: `Unknown job: ${jobId}` };
    return this._executeJob(job, opts);
  }

  _isCollectorModeEnabled() {
    const raw = String(process.env.BACKBONE_PROACTIVE_COLLECTOR_MODE || "1").trim().toLowerCase();
    return !["0", "false", "off", "no"].includes(raw);
  }

  _isCollectorOnlyType(type) {
    return ["brief", "market", "goals", "projects", "adhoc", "email"].includes(String(type || "").trim());
  }

  _buildCollectorOnlyResult(def) {
    return {
      success: true,
      collectorOnly: true,
      deferred: true,
      type: def?.type || "unknown",
      reason: "collector-mode",
    };
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

  async _executeJob(job, opts = {}) {
    const id = job.def.id;
    job.firedToday = true;
    const forceCollectorMode = typeof opts.forceCollectorMode === "boolean" ? opts.forceCollectorMode : null;
    const collectorOnly = forceCollectorMode === true ||
      (forceCollectorMode !== false && this._isCollectorModeEnabled() && this._isCollectorOnlyType(job.def.type));

    // Check daily cap
    if (!collectorOnly && this.dailyMessageCount >= this.maxDailyMessages) {
      const result = { success: false, error: "Daily message cap reached", skipped: true };
      job.lastResult = result;
      this._saveState();
      console.log(`${TAG} ${id} - skipped (daily cap ${this.maxDailyMessages})`);
      return result;
    }

    // Check CLI cooldown
    if (!collectorOnly && Date.now() < this.cliCooldownUntil) {
      const result = { success: false, error: "CLI cooldown active", skipped: true };
      job.lastResult = result;
      this._saveState();
      console.log(`${TAG} ${id} - skipped (CLI cooldown)`);
      return result;
    }

    console.log(`${TAG} Executing: ${id}${collectorOnly ? " (collector-only)" : ""}`);

    try {
      let result;

      if (collectorOnly) {
        result = this._buildCollectorOnlyResult(job.def);
      } else {
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
          case "email":
            result = await this._executeEmailDigest(job.def);
            break;
          case "context-sync":
            result = await this._executeContextSync(job.def);
            break;
          case "brokerage":
            result = await this._executeBrokerageSync(job.def);
            break;
          case "intel-sweep":
            result = await this._executeIntelSweep(job.def);
            break;
          case "claude-update":
            result = await this._executeClaudeUpdate(job.def);
            break;
          default:
            result = { success: false, error: `Unknown type: ${job.def.type}` };
        }
      }

      job.lastResult = result;

      if (result.success) {
        // Silent jobs don't send chat messages — don't count against daily cap
        if (!collectorOnly && job.def.type !== "context-sync" && job.def.type !== "brokerage" && job.def.type !== "intel-sweep" && job.def.type !== "claude-update") {
          this.dailyMessageCount++;
        }
        this.emit("job-fired", { jobId: id, type: job.def.type, result });
        const actionLabel = collectorOnly ? "collected" : (job.def.type === "context-sync" || job.def.type === "brokerage" || job.def.type === "intel-sweep" || job.def.type === "claude-update" ? "synced" : "sent");
        console.log(`${TAG} ${id} - ${actionLabel} (${this.dailyMessageCount}/${this.maxDailyMessages} today)`);
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

    // SPY price — always include for market context
    let spyInfo = "";
    try {
      const tickers = tickersCache?.tickers || [];
      const spy = tickers.find(t => t.symbol === "SPY");
      if (spy) {
        const sign = (spy.changePercent || 0) >= 0 ? "+" : "";
        spyInfo = `\nSPY: $${Number(spy.price || spy.lastPrice).toFixed(2)} (${sign}${(spy.changePercent || 0).toFixed(2)}%)`;
      }
    } catch {}

    // News headlines for world context
    let newsInfo = "";
    try {
      const newsCache = readJsonSafe(path.join(dataDir, "news-cache.json"));
      if (newsCache?.articles?.length > 0) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const recent = newsCache.articles
          .filter(a => new Date(a.publishedAt || a.date).getTime() > cutoff)
          .slice(0, 3)
          .map(a => a.title);
        if (recent.length > 0) {
          newsInfo = `\nTODAY'S NEWS:\n${recent.map(t => `- ${t}`).join("\n")}`;
        }
      }
    } catch {}

    const promptLabel = {
      "market-open": "pre-market opening snapshot",
      "market-midday": "midday market alert (significant move detected)",
      "market-close": "end-of-day market recap",
    }[def.id] || "market update";

    // Load prediction research for top pick reasoning
    let predictionInfo = "";
    try {
      const predictions = readJsonSafe(path.join(dataDir, "prediction-cache.json"));
      if (predictions?.predictions && topTickers.length > 0) {
        const insights = topTickers.slice(0, 4).map(t => {
          const pred = predictions.predictions[t.symbol];
          if (pred?.analysis) {
            const reason = pred.analysis.split(/[.!]/).filter(s => s.trim().length > 10).slice(0, 1).join("").trim();
            return `${t.symbol} (${t.score}): ${reason}`;
          }
          return `${t.symbol} (${t.score})`;
        });
        predictionInfo = `\nTOP PICKS WITH REASONING:\n${insights.join("\n")}`;
      }
    } catch {}

    const prompt = `Generate a concise WhatsApp ${promptLabel} for the user.

MARKET CONTEXT:${spyInfo}
${recessionInfo}
${newsInfo}

PORTFOLIO:
Equity: $${portfolio.equity || "?"} | Cash: $${portfolio.cash || "?"}
Positions: ${JSON.stringify(positions)}

TOP TICKERS BY SCORE: ${JSON.stringify(topTickers)}
${predictionInfo}
${convictionsInfo}${recentTradesInfo}

TONE: You're a sharp friend who manages their money. Not a financial newsletter.
Write like you'd text a friend about their portfolio — concise, real, no fluff.

RULES:
- Use WhatsApp formatting: *bold*, _italic_
- Keep under 1000 characters
- Always mention SPY price and direction up front for market context
- Always mention recession score (e.g. "recession risk 3.2/10 — low")
- Include 1-2 relevant news headlines if they affect the market or portfolio
- Include actual numbers (P&L, %, $)
- If market-open: lead with SPY + recession, then portfolio, then top 2-3 picks worth watching with one-line reasoning
- If midday alert: what moved, why, and whether to act
- If market-close: how the day went, SPY close, recession context, any moves for tomorrow
- Don't start with "Good morning" or greetings
- Don't end with "let me know" or "happy trading" type filler
- One concrete insight or action at the end

Return ONLY the message text, nothing else.`;

    return this._generateAndSend(prompt, def.id === "market-midday" ? "alert" : "trade");
  }

  // ── Goal check execution ────────────────────────────────────

  async _executeGoalCheck(def) {
    const goalsPath = path.join(getDataDir(), "goals.json");
    const goalsRaw = readJsonSafe(goalsPath);
    const goals = Array.isArray(goalsRaw) ? goalsRaw : (goalsRaw?.goals || []);
    if (goals.length === 0) {
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

    const prompt = `Write a short WhatsApp nudge about the user's goals.

GOALS NEEDING ATTENTION:
${JSON.stringify(allGoals, null, 2)}

TONE: You're a friend who cares about their progress, not a productivity app.
Write like you'd text a friend — casual, real, no motivational poster vibes.

RULES:
- WhatsApp formatting: *bold*, _italic_
- Under 500 characters
- Near-complete goals: acknowledge the work done, one push left
- Stalled goals: mention it honestly, suggest one tiny next step
- Don't be preachy or use exclamation marks excessively
- No "You've got this!" or "Keep going!" type filler

Return ONLY the message text.`;

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
    const goalsRaw = readJsonSafe(path.join(dataDir, "goals.json")) || [];
    const goals = Array.isArray(goalsRaw) ? goalsRaw : (goalsRaw?.goals || []);
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

  // ── Email Digest execution ─────────────────────────────────

  async _executeEmailDigest(def) {
    try {
      const { runEmailDigest } = await import("./email-digest.js");
      const result = await runEmailDigest({ sendWhatsApp: true, topN: 5 });
      if (result.success && result.emails?.length > 0) {
        return { success: true, message: `Email digest: ${result.emails.length} emails surfaced` };
      }
      return { success: false, skipped: true, reason: result.reason || "No important emails" };
    } catch (err) {
      console.error(`${TAG} Email digest error:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // ── Context sync to Firebase ────────────────────────────────

  async _executeContextSync(_def) {
    try {
      const { getFirebaseContextSync } = await import("../firebase/firebase-context-sync.js");
      const sync = getFirebaseContextSync();
      // Initialize with user ID from Firebase user file if not already set
      if (!sync.userId) {
        const { loadFirebaseUser } = await import("../firebase/firebase-auth.js");
        const user = loadFirebaseUser();
        if (user?.localId || user?.uid) {
          sync.initialize(user.localId || user.uid);
        }
      }
      const success = await sync.syncAll();
      if (success) {
        return { success: true, message: "Context synced to Firebase" };
      }
      return { success: false, skipped: true, reason: "Debounced or no data" };
    } catch (err) {
      console.error(`${TAG} Context sync error:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // ── Brokerage sync execution ────────────────────────────────

  async _executeBrokerageSync(_def) {
    try {
      const { syncAllBrokerages, getSyncStatus } = await import("../brokerages/brokerage-sync.js");
      const { getBrokerageStatuses } = await import("../brokerages/brokerage-auth.js");

      const statuses = getBrokerageStatuses();
      const anyConnected = Object.values(statuses).some(s => s.connected);
      if (!anyConnected) {
        return { success: false, skipped: true, reason: "No brokerages connected" };
      }

      // Build a notify function that sends via WhatsApp
      let notifyFn = null;
      try {
        const { getWhatsAppNotifications } = await import("./whatsapp-notifications.js");
        const notif = getWhatsAppNotifications();
        if (notif.enabled) {
          notifyFn = (msg) => notif.send("system", msg);
        }
      } catch {}

      const result = await syncAllBrokerages({ notify: notifyFn });

      if (result.success) {
        return { success: true, message: result.message };
      }
      return { success: false, error: result.message };
    } catch (err) {
      console.error(`${TAG} Brokerage sync error:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // ── Intel Sweep execution (silent — no messages) ────────────

  async _executeIntelSweep(def) {
    try {
      const { runIntelSweep } = await import("../engine/intel-sweep.js");
      const result = await runIntelSweep();

      if (result.skipped) {
        return { success: false, skipped: true, reason: "No topics to search" };
      }

      // Signal the engine that new intel is available
      if (result.success && result.findingsCount > 0) {
        try {
          const { getAutonomousEngine } = await import("../engine/autonomous-engine.js");
          const engine = getAutonomousEngine();
          if (engine) engine.signalChange("intel-sweep");
        } catch {}
      }

      return result;
    } catch (err) {
      console.error(`${TAG} Intel sweep error:`, err.message);
      return { success: false, error: err.message };
    }
  }

  async _executeClaudeUpdate(_def) {
    try {
      const { execSync } = await import("child_process");
      const output = execSync("claude update", {
        timeout: 120_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      console.log(`${TAG} Claude update output: ${(output || "").trim()}`);
      return { success: true, output: (output || "").trim() };
    } catch (err) {
      // Exit code 0 with stderr is normal (e.g. "already up to date")
      const stderr = err.stderr ? err.stderr.trim() : "";
      const stdout = err.stdout ? err.stdout.trim() : "";
      if (err.status === 0 || stdout.includes("up to date") || stderr.includes("up to date")) {
        console.log(`${TAG} Claude already up to date`);
        return { success: true, output: stdout || stderr || "Already up to date" };
      }
      console.error(`${TAG} Claude update error:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // ── Content generation via Claude Code CLI ──────────────────

  async _generateContent(prompt) {
    try {
      const { runClaudeCodePrompt } = await import("../ai/claude-code-cli.js");
      const result = await runClaudeCodePrompt(prompt, { timeout: 180_000 });
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
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
