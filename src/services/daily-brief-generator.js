/**
 * Daily Brief Generator
 *
 * Generates a rich, structured daily brief and delivers it via:
 * 1. Firestore (for the web app to render interactively)
 * 2. WhatsApp (concise version)
 * 3. Push notification (headline + open app link)
 *
 * The brief includes:
 * - System activity (what BACKBONE worked on overnight)
 * - World snapshot (news, market conditions)
 * - Portfolio status
 * - Health insights
 * - Goal progress
 * - Actionable items
 */

import fs from "fs";
import path from "path";
import { loadFirebaseUser } from "./firebase-auth.js";
import { FIREBASE_CONFIG, FIRESTORE_BASE_URL } from "./firebase-config.js";
import { getWorkLog } from "./work-log.js";
import { getGoalTracker } from "./goal-tracker.js";
import { getLifeScores } from "./life-scores.js";
import { loadOuraData } from "./oura-service.js";
import { getWhatsAppNotifications } from "./whatsapp-notifications.js";
import { sendPush, PUSH_TYPE } from "./push-notifications.js";
import { getUpcomingEvents } from "./email-calendar-service.js";
import { generatePortfolioChart, generateTickerScoresChart } from "./chart-generator.js";

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_DIR = path.join(process.cwd(), "memory");
const BRIEF_STATE_PATH = path.join(DATA_DIR, "daily-brief-state.json");

// ── Firestore helpers ───────────────────────────────────────────

const toFirestoreValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
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

// ── Helper: load JSON safely ────────────────────────────────────

function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch { /* ignore */ }
  return null;
}

function loadText(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch { /* ignore */ }
  return null;
}

// ── Section Generators ──────────────────────────────────────────

/**
 * Build system activity section — what BACKBONE has been doing
 */
function buildSystemActivity() {
  const items = [];

  // Work log entries from last 24 hours
  try {
    const workLog = getWorkLog();
    const recent = workLog.getRecent(30);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recentEntries = recent.filter(e => new Date(e.timestamp).getTime() > cutoff);

    if (recentEntries.length > 0) {
      // Group by source
      const bySource = {};
      recentEntries.forEach(e => {
        const src = e.source || "system";
        if (!bySource[src]) bySource[src] = [];
        bySource[src].push(e);
      });

      for (const [source, entries] of Object.entries(bySource)) {
        const titles = entries.slice(0, 3).map(e => e.title || e.description);
        items.push({
          source,
          count: entries.length,
          highlights: titles,
          status: entries[0]?.status || "completed"
        });
      }
    }
  } catch { /* no work log */ }

  // Thinking engine activity
  const thinkingLog = loadJson(path.join(DATA_DIR, "thinking-log.json"));
  if (thinkingLog?.cycles) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recentCycles = (thinkingLog.cycles || []).filter(c =>
      new Date(c.timestamp || c.completedAt).getTime() > cutoff
    );
    if (recentCycles.length > 0) {
      items.push({
        source: "thinking-engine",
        count: recentCycles.length,
        highlights: [`${recentCycles.length} thinking cycles completed`],
        status: "completed"
      });
    }
  }

  return items;
}

/**
 * Build world snapshot — news and market context
 */
function buildWorldSnapshot() {
  const snapshot = { headlines: [], marketSummary: null };

  // Try to load cached news
  const newsCache = loadJson(path.join(DATA_DIR, "news-cache.json"));
  if (newsCache?.articles) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = newsCache.articles
      .filter(a => new Date(a.publishedAt || a.date).getTime() > cutoff)
      .slice(0, 5);
    snapshot.headlines = recent.map(a => ({
      title: a.title,
      source: a.source?.name || a.source || "News",
      category: a.category || "general",
      relevance: a.relevanceScore || null
    }));
  }

  // Market summary — tickersCache is a flat array or { tickers: [...] }
  const tickersCacheRaw = loadJson(path.join(DATA_DIR, "tickers-cache.json"));
  const tickersForMarket = Array.isArray(tickersCacheRaw) ? tickersCacheRaw : (tickersCacheRaw?.tickers || []);
  if (tickersForMarket.length > 0) {
    const tickers = tickersForMarket;
    const gainers = [...tickers].filter(t => (t.changePercent || 0) > 0).sort((a, b) => b.changePercent - a.changePercent).slice(0, 3);
    const losers = [...tickers].filter(t => (t.changePercent || 0) < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 3);
    const avgChange = tickers.reduce((s, t) => s + (t.changePercent || 0), 0) / tickers.length;

    snapshot.marketSummary = {
      direction: avgChange >= 0 ? "up" : "down",
      avgChange: Math.round(avgChange * 100) / 100,
      topGainers: gainers.map(t => ({ symbol: t.symbol, change: Math.round((t.changePercent || 0) * 100) / 100 })),
      topLosers: losers.map(t => ({ symbol: t.symbol, change: Math.round((t.changePercent || 0) * 100) / 100 })),
      tickerCount: tickers.length
    };
  }

  return snapshot;
}

/**
 * Build portfolio section
 */
function buildPortfolioSection() {
  const tradesLog = loadJson(path.join(DATA_DIR, "trades-log.json"));
  const tickersCache = loadJson(path.join(DATA_DIR, "tickers-cache.json"));
  const alpacaCache = loadJson(path.join(DATA_DIR, "alpaca-cache.json"));

  const section = {
    equity: null,
    dayPL: null,
    dayPLPercent: null,
    topPositions: [],
    recentTrades: [],
    signals: []
  };

  // Try alpaca cache first (written by server.js on live fetch)
  if (alpacaCache?.account) {
    const acct = alpacaCache.account;
    section.equity = parseFloat(acct.equity) || null;
    const lastEquity = parseFloat(acct.last_equity) || section.equity;
    section.dayPL = lastEquity ? Math.round((section.equity - lastEquity) * 100) / 100 : null;
    section.dayPLPercent = lastEquity ? Math.round(((section.equity - lastEquity) / lastEquity) * 10000) / 100 : null;
  }

  // Positions from alpaca cache (filter out zero-value positions like CVRs)
  if (alpacaCache?.positions && Array.isArray(alpacaCache.positions)) {
    section.topPositions = alpacaCache.positions
      .filter(p => parseFloat(p.market_value) > 0)
      .sort((a, b) => Math.abs(parseFloat(b.market_value) || 0) - Math.abs(parseFloat(a.market_value) || 0))
      .slice(0, 5)
      .map(p => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty) || 0,
        marketValue: parseFloat(p.market_value) || 0,
        unrealizedPL: parseFloat(p.unrealized_pl) || 0,
        unrealizedPLPercent: parseFloat(p.unrealized_plpc) ? (parseFloat(p.unrealized_plpc) * 100) : 0
      }));
  }

  // Recent trades (last 24 hours) — tradesLog is an array of trade entries
  if (Array.isArray(tradesLog)) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const seen = new Set();
    section.recentTrades = tradesLog
      .filter(t => new Date(t.timestamp || t.date || t.created_at).getTime() > cutoff)
      .slice(-10)
      .reverse()
      .filter(t => {
        // Deduplicate by symbol+side+qty
        const key = `${t.symbol}_${t.side || t.action}_${t.qty || t.quantity}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5)
      .map(t => ({
        symbol: t.symbol,
        side: t.side || t.action,
        qty: t.qty || t.quantity,
        price: t.price || t.filled_avg_price,
        time: t.timestamp || t.date || t.created_at
      }));
  }

  // Top buy signals — tickersCache is a flat array of ticker objects, score is 0-10
  const tickers = Array.isArray(tickersCache) ? tickersCache : (tickersCache?.tickers || []);
  if (tickers.length > 0) {
    section.signals = tickers
      .filter(t => (t.score || 0) >= 7)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5)
      .map(t => ({ symbol: t.symbol, score: t.score, price: t.price || t.lastPrice }));
  }

  return section;
}

/**
 * Build health section
 */
function buildHealthSection() {
  try {
    const oura = loadOuraData();
    if (!oura) return null;

    // Oura data structure: { latest: { sleep: [...], readiness: [...], activity: [...], heartRate: [...] } }
    const latest = oura.latest || oura;
    const sleepArr = Array.isArray(latest.sleep) ? latest.sleep : [];
    const readinessArr = Array.isArray(latest.readiness) ? latest.readiness : [];
    const activityArr = Array.isArray(latest.activity) ? latest.activity : [];
    const hrArr = Array.isArray(latest.heartRate) ? latest.heartRate : [];

    // Get the most recent entry from each array
    const sleep = sleepArr.at(-1);
    const readiness = readinessArr.at(-1);
    const activity = activityArr.at(-1);
    const hr = hrArr.at(-1);

    return {
      sleep: {
        score: sleep?.score || null,
        duration: sleep?.total_sleep_duration || null,
        efficiency: sleep?.contributors?.efficiency || null
      },
      readiness: {
        score: readiness?.score || null
      },
      activity: {
        score: activity?.score || null,
        steps: activity?.steps || null,
        calories: activity?.total_calories || activity?.active_calories || null
      },
      hrv: hr?.hrv?.avg || null,
      rhr: hr?.resting_heart_rate || null
    };
  } catch {
    return null;
  }
}

/**
 * Build goals section
 */
function buildGoalsSection() {
  try {
    const tracker = getGoalTracker();
    const active = tracker.getActive();
    if (!active || active.length === 0) return null;

    const avgProgress = Math.round(
      active.reduce((s, g) => s + (g.progress || 0), 0) / active.length
    );

    // Find milestones achieved in last 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recentMilestones = [];
    active.forEach(g => {
      (g.milestones || []).forEach(m => {
        if (m.achieved && m.achievedAt && new Date(m.achievedAt).getTime() > cutoff) {
          recentMilestones.push({ goal: g.title, milestone: m.label });
        }
      });
    });

    return {
      totalActive: active.length,
      avgProgress,
      goals: active.slice(0, 6).map(g => ({
        title: g.title,
        category: g.category,
        progress: g.progress || 0,
        status: g.status
      })),
      recentMilestones
    };
  } catch {
    return null;
  }
}

/**
 * Build calendar section
 */
function buildCalendarSection() {
  try {
    const events = getUpcomingEvents(5);
    if (!events || events.length === 0) return null;

    return events.map(ev => ({
      title: (ev.summary || ev.subject || "Event").slice(0, 60),
      time: new Date(ev.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      location: ev.location || null,
      allDay: ev.allDay || false
    }));
  } catch {
    return null;
  }
}

/**
 * Build action items — the "what should I do today" section
 */
function buildActionItems() {
  const actions = [];

  // From goals due soon
  try {
    const goals = getGoalTracker().getActive();
    goals.forEach(g => {
      if (g.dueDate) {
        const daysUntil = (new Date(g.dueDate) - new Date()) / (1000 * 60 * 60 * 24);
        if (daysUntil >= 0 && daysUntil <= 3 && (g.progress || 0) < 100) {
          actions.push({
            type: "goal",
            priority: daysUntil <= 1 ? "urgent" : "important",
            text: `Complete: ${g.title}`,
            detail: `${g.progress || 0}% done, due in ${Math.ceil(daysUntil)} day${Math.ceil(daysUntil) !== 1 ? "s" : ""}`,
            category: g.category
          });
        }
      }
    });
  } catch { /* ignore */ }

  // From health data (Oura structure: { latest: { sleep: [...], readiness: [...] } })
  try {
    const oura = loadOuraData();
    if (oura) {
      const latest = oura.latest || oura;
      const sleepArr = Array.isArray(latest.sleep) ? latest.sleep : [];
      const readinessArr = Array.isArray(latest.readiness) ? latest.readiness : [];
      const sleepScore = sleepArr.at(-1)?.score;
      const readinessScore = readinessArr.at(-1)?.score;

      if (sleepScore && sleepScore < 65) {
        actions.push({
          type: "health",
          priority: "important",
          text: "Prioritize rest today",
          detail: `Sleep score was ${sleepScore} — consider an earlier bedtime`,
          category: "health"
        });
      }
      if (readinessScore && readinessScore >= 85) {
        actions.push({
          type: "health",
          priority: "useful",
          text: "Great day for a workout",
          detail: `Readiness score ${readinessScore} — your body is ready for a challenge`,
          category: "health"
        });
      }
    }
  } catch { /* ignore */ }

  // From thesis/focus
  const thesis = loadText(path.join(MEMORY_DIR, "thesis.md"));
  if (thesis) {
    const lines = thesis.split("\n").filter(l => l.trim());
    const focusLine = lines.find(l =>
      l.toLowerCase().includes("focus") || l.toLowerCase().includes("priority")
    );
    if (focusLine) {
      actions.push({
        type: "focus",
        priority: "useful",
        text: focusLine.replace(/^#+\s*/, "").replace(/\*\*/g, "").slice(0, 80),
        detail: "From your current thesis",
        category: "personal"
      });
    }
  }

  // Sort: urgent > important > useful
  const priorityOrder = { urgent: 0, important: 1, useful: 2 };
  actions.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

  return actions.slice(0, 6);
}

/**
 * Build life scores section
 */
function buildLifeScoresSection() {
  try {
    const scores = getLifeScores();
    const data = scores.getDisplayData();
    if (!data) return null;
    return {
      overall: data.overall || 0,
      categories: data.categories || {}
    };
  } catch {
    return null;
  }
}

// ── Main Generator ──────────────────────────────────────────────

/**
 * Generate the complete daily brief as structured data
 */
export function generateDailyBrief() {
  const now = new Date();
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const hour = now.getHours();

  let timeOfDay = "morning";
  if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
  else if (hour >= 17) timeOfDay = "evening";

  const systemActivity = buildSystemActivity();
  const worldSnapshot = buildWorldSnapshot();
  const portfolio = buildPortfolioSection();
  const health = buildHealthSection();
  const goals = buildGoalsSection();
  const calendar = buildCalendarSection();
  const actionItems = buildActionItems();
  const lifeScores = buildLifeScoresSection();

  // Determine brief "mood" based on data
  let mood = "neutral";
  if (health?.sleep?.score >= 80 && (portfolio?.dayPLPercent || 0) >= 0) mood = "positive";
  else if (health?.sleep?.score < 60 || (portfolio?.dayPLPercent || 0) < -2) mood = "cautious";

  // Count sections with data
  const sectionsWithData = [
    systemActivity.length > 0,
    worldSnapshot.headlines.length > 0 || worldSnapshot.marketSummary,
    portfolio.equity || portfolio.topPositions.length > 0,
    health,
    goals,
    calendar,
    actionItems.length > 0,
    lifeScores
  ].filter(Boolean).length;

  // Build greeting
  const greetings = {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening"
  };
  const greeting = `${greetings[timeOfDay]}! Here's your ${dayName} brief.`;

  const brief = {
    id: `brief_${now.toISOString().split("T")[0]}`,
    generatedAt: now.toISOString(),
    date: now.toISOString().split("T")[0],
    dayName,
    dateStr,
    timeOfDay,
    greeting,
    mood,
    sectionsWithData,

    // Sections — each can be null if no data
    systemActivity: systemActivity.length > 0 ? systemActivity : null,
    worldSnapshot: (worldSnapshot.headlines.length > 0 || worldSnapshot.marketSummary) ? worldSnapshot : null,
    portfolio: (portfolio.equity || portfolio.topPositions.length > 0 || portfolio.signals.length > 0) ? portfolio : null,
    health,
    goals,
    calendar: calendar && calendar.length > 0 ? calendar : null,
    actionItems: actionItems.length > 0 ? actionItems : null,
    lifeScores,

    // Summary line for notifications
    summary: buildSummaryLine({ health, goals, portfolio, actionItems, worldSnapshot })
  };

  return brief;
}

/**
 * Build a concise summary line for push notifications
 */
function buildSummaryLine({ health, goals, portfolio, actionItems, worldSnapshot }) {
  const parts = [];

  if (health?.sleep?.score) parts.push(`Sleep ${health.sleep.score}`);
  if (health?.readiness?.score) parts.push(`Ready ${health.readiness.score}`);
  if (goals?.avgProgress) parts.push(`Goals ${goals.avgProgress}%`);
  if (worldSnapshot?.marketSummary?.avgChange) {
    const sign = worldSnapshot.marketSummary.avgChange >= 0 ? "+" : "";
    parts.push(`Markets ${sign}${worldSnapshot.marketSummary.avgChange}%`);
  }
  if (actionItems?.length > 0) {
    const urgent = actionItems.filter(a => a.priority === "urgent").length;
    if (urgent > 0) parts.push(`${urgent} urgent`);
  }

  return parts.join(" | ") || "Your daily overview is ready";
}

// ── Rich WhatsApp Formatters ─────────────────────────────────────

/**
 * Format a rich morning brief for WhatsApp with bold sections and data.
 */
export function formatMorningWhatsApp(brief) {
  const now = new Date();
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  let msg = `*BACKBONE Morning Brief*\n_${dayName}, ${dateStr}_\n`;

  // Health
  if (brief.health) {
    const parts = [];
    if (brief.health.sleep?.score) parts.push(`Sleep ${brief.health.sleep.score}`);
    if (brief.health.readiness?.score) parts.push(`Readiness ${brief.health.readiness.score}`);
    if (brief.health.hrv) parts.push(`HRV ${brief.health.hrv}ms`);
    if (parts.length > 0) {
      msg += `\n*HEALTH*\n${parts.join(" | ")}\n`;
    }
  }

  // Calendar
  if (brief.calendar && brief.calendar.length > 0) {
    msg += `\n*TODAY'S CALENDAR*\n`;
    brief.calendar.slice(0, 5).forEach(ev => {
      msg += `${ev.time}  ${ev.title}\n`;
    });
  }

  // Markets
  if (brief.worldSnapshot?.marketSummary) {
    const ms = brief.worldSnapshot.marketSummary;
    const sign = (ms.avgChange || 0) >= 0 ? "+" : "";
    msg += `\n*MARKETS*\n`;
    msg += `SPY ${sign}${ms.avgChange || 0}%`;
    if (ms.topGainers?.length > 0) {
      msg += ` | Top: ${ms.topGainers.slice(0, 2).map(t => `${t.symbol} +${t.change}%`).join(", ")}`;
    }
    if (ms.topLosers?.length > 0) {
      msg += `\nBottom: ${ms.topLosers.slice(0, 2).map(t => `${t.symbol} ${t.change}%`).join(", ")}`;
    }
    msg += "\n";
  }

  // Portfolio
  if (brief.portfolio) {
    const p = brief.portfolio;
    msg += `\n*PORTFOLIO*`;
    if (p.equity) msg += ` $${Number(p.equity).toLocaleString()}`;
    msg += "\n";
    if (p.dayPL != null) {
      const plSign = p.dayPL >= 0 ? "+" : "-";
      msg += `Day P&L: ${plSign}$${Math.abs(p.dayPL).toFixed(2)}`;
      if (p.dayPLPercent != null) msg += ` (${p.dayPLPercent >= 0 ? "+" : ""}${p.dayPLPercent.toFixed(1)}%)`;
      msg += "\n";
    }
    if (p.topPositions?.length > 0) {
      msg += `Positions: ${p.topPositions.map(pos => `${pos.symbol} ${pos.qty} shares`).join(", ")}\n`;
    }
    if (p.signals?.length > 0) {
      msg += `Signals: ${p.signals.map(s => `${s.symbol} (${s.score})`).join(" | ")}\n`;
    }
  }

  // Goals (truncate titles for WhatsApp readability)
  if (brief.goals?.goals?.length > 0) {
    msg += `\n*GOALS*\n`;
    brief.goals.goals.slice(0, 4).forEach((g, i) => {
      const title = (g.title || "Untitled").length > 50 ? g.title.slice(0, 50) + "..." : (g.title || "Untitled");
      msg += `${i + 1}. ${title} (${g.progress || 0}%)\n`;
    });
  }

  // News
  if (brief.worldSnapshot?.headlines?.length > 0) {
    msg += `\n*NEWS*\n`;
    brief.worldSnapshot.headlines.slice(0, 3).forEach(h => {
      msg += `- ${h.title} (${h.source})\n`;
    });
  }

  // Action items
  if (brief.actionItems && brief.actionItems.length > 0) {
    msg += `\n*ACTION ITEMS*\n`;
    brief.actionItems.slice(0, 3).forEach(a => {
      msg += `- ${a.text}${a.detail ? ` (${a.detail})` : ""}\n`;
    });
  }

  msg += `\n_Have a productive day._`;
  return msg;
}

/**
 * Format a rich evening brief for WhatsApp.
 */
export function formatEveningWhatsApp(brief) {
  const now = new Date();
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  let msg = `*BACKBONE Evening Brief*\n_${dayName}, ${dateStr}_\n`;

  // Today's trades
  if (brief.portfolio?.recentTrades?.length > 0) {
    msg += `\n*TODAY'S TRADES*\n`;
    brief.portfolio.recentTrades.forEach(t => {
      const side = (t.side || "buy").toUpperCase();
      msg += `${side} ${t.qty} ${t.symbol} @ $${Number(t.price).toFixed(2)}\n`;
    });
  }

  // Portfolio summary
  if (brief.portfolio) {
    const p = brief.portfolio;
    if (p.dayPL != null) {
      const plSign = p.dayPL >= 0 ? "+" : "-";
      msg += `Day P&L: ${plSign}$${Math.abs(p.dayPL).toFixed(2)}`;
      if (p.dayPLPercent != null) msg += ` (${p.dayPLPercent >= 0 ? "+" : ""}${p.dayPLPercent.toFixed(1)}%)`;
      msg += "\n";
    }
    if (p.equity) msg += `Portfolio: $${Number(p.equity).toLocaleString()}\n`;
  }

  // Health / Activity (only show if there's actual data)
  if (brief.health) {
    const parts = [];
    if (brief.health.activity?.steps) parts.push(`Steps: ${Number(brief.health.activity.steps).toLocaleString()}`);
    if (brief.health.activity?.calories) parts.push(`Calories: ${Number(brief.health.activity.calories).toLocaleString()}`);
    if (brief.health.activity?.score) parts.push(`Activity Score: ${brief.health.activity.score}`);
    if (brief.health.sleep?.score) parts.push(`Last Night Sleep: ${brief.health.sleep.score}`);
    if (parts.length > 0) {
      msg += `\n*HEALTH*\n${parts.join("\n")}\n`;
    }
  }

  // Goals progress
  if (brief.goals?.goals?.length > 0) {
    msg += `\n*GOALS PROGRESS*\n`;
    brief.goals.goals.slice(0, 4).forEach(g => {
      const title = g.title.length > 50 ? g.title.slice(0, 50) + "..." : g.title;
      msg += `${title}: ${g.progress}%\n`;
    });
  }

  // System activity (filter out internal status entries)
  if (brief.systemActivity?.length > 0) {
    const meaningfulHighlights = [];
    brief.systemActivity.forEach(item => {
      (item.highlights || []).forEach(h => {
        // Skip internal status messages
        if (!/Claude Code|Claude Engine|Mobile Dashboard|Life Engine|Not Available|Ready|Idle/i.test(h.trim())) {
          meaningfulHighlights.push(h);
        }
      });
    });
    if (meaningfulHighlights.length > 0) {
      msg += `\n*BACKBONE WORKED ON*\n`;
      meaningfulHighlights.slice(0, 5).forEach(h => {
        msg += `- ${h}\n`;
      });
    }
  }

  // Tomorrow's calendar
  try {
    const tomorrow = getUpcomingEvents(5);
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().split("T")[0];
    const tomorrowEvents = (tomorrow || []).filter(ev => {
      const evDate = new Date(ev.start).toISOString().split("T")[0];
      return evDate === tomorrowStr;
    });
    if (tomorrowEvents.length > 0) {
      msg += `\n*TOMORROW*\n`;
      tomorrowEvents.slice(0, 3).forEach(ev => {
        const time = new Date(ev.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        msg += `${time}  ${(ev.summary || ev.subject || "Event").slice(0, 40)}\n`;
      });
    }
  } catch { /* ignore */ }

  // Top ticker scores
  if (brief.portfolio?.signals?.length > 0) {
    msg += `\n*TOP SCORES*\n`;
    msg += brief.portfolio.signals.map(s => `${s.symbol} ${s.score}`).join(" | ") + "\n";
  }

  msg += `\n_Good night. Rest well._`;
  return msg;
}

// ── Delivery ────────────────────────────────────────────────────

/**
 * Push the daily brief to Firestore for the web app
 */
export async function pushBriefToFirestore(brief) {
  const user = loadFirebaseUser();
  if (!user?.idToken || !user?.localId) return { success: false, error: "Not authenticated" };

  try {
    const url = `${FIRESTORE_BASE_URL}/users/${user.localId}/dashboard/brief?key=${FIREBASE_CONFIG.apiKey}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.idToken}`
      },
      body: JSON.stringify({ fields: toFirestoreFields({
        data: brief,
        updatedAt: new Date().toISOString()
      }) })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Firestore write failed: ${response.status} - ${err}`);
    }

    return { success: true };
  } catch (error) {
    console.error("[DailyBrief] Firestore push failed:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send brief via WhatsApp (rich formatted version with optional chart).
 *
 * @param {Object} brief - The generated brief data
 * @param {string} type - "morning" or "evening"
 * @param {string|null} chartUrl - Optional chart image URL
 */
export async function sendBriefToWhatsApp(brief, type = "morning", chartUrl = null) {
  try {
    const whatsapp = getWhatsAppNotifications();
    if (!whatsapp.enabled) return { success: false, error: "WhatsApp not enabled" };

    const options = chartUrl ? { mediaUrl: chartUrl } : {};

    if (type === "evening") {
      const text = formatEveningWhatsApp(brief);
      return whatsapp.sendEveningBrief(text, options);
    } else {
      const text = formatMorningWhatsApp(brief);
      return whatsapp.sendMorningBrief(text, options);
    }
  } catch (error) {
    console.error("[DailyBrief] WhatsApp send failed:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send brief push notification
 */
export async function sendBriefPushNotification(brief) {
  try {
    return await sendPush(null, {
      title: brief.greeting?.split("!")[0] || "Daily Brief",
      body: brief.summary || "Your daily overview is ready",
      type: PUSH_TYPE.MORNING_BRIEF,
      url: "https://backboneai.web.app"
    });
  } catch (error) {
    console.error("[DailyBrief] Push notification failed:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Load brief state with backward compatibility.
 * Old format: { lastSentDate } → treated as morning.
 * New format: { morning: { lastSentDate }, evening: { lastSentDate } }
 */
function loadBriefState() {
  const raw = loadJson(BRIEF_STATE_PATH);
  if (!raw) return { morning: {}, evening: {} };

  // Backward compat: old flat format → morning
  if (raw.lastSentDate && !raw.morning) {
    return {
      morning: { lastSentDate: raw.lastSentDate, sentAt: raw.sentAt },
      evening: {}
    };
  }

  return {
    morning: raw.morning || {},
    evening: raw.evening || {}
  };
}

function saveBriefState(state) {
  try {
    fs.writeFileSync(BRIEF_STATE_PATH, JSON.stringify(state, null, 2));
  } catch { /* ignore */ }
}

/**
 * Generate and deliver the daily brief through all channels.
 *
 * @param {string} type - "morning" or "evening"
 */
export async function generateAndDeliverBrief(type = "morning") {
  const today = new Date().toISOString().split("T")[0];

  // Check if already sent today for this type
  const state = loadBriefState();
  if (state[type]?.lastSentDate === today) {
    console.log(`[DailyBrief] ${type} already sent today, skipping`);
    return { success: false, error: "Already sent today", duplicate: true };
  }

  // Generate the brief
  const brief = generateDailyBrief();
  if (!brief || brief.sectionsWithData < 2) {
    console.log("[DailyBrief] Not enough data to send a brief");
    return { success: false, error: "Insufficient data" };
  }

  console.log(`[DailyBrief] Generated ${type} brief with ${brief.sectionsWithData} sections`);

  // Generate chart (best-effort)
  let chartUrl = null;
  try {
    if (type === "morning") {
      const chartResult = await generatePortfolioChart();
      if (chartResult.success) chartUrl = chartResult.url;
    } else {
      const chartResult = await generateTickerScoresChart();
      if (chartResult.success) chartUrl = chartResult.url;
    }
    if (chartUrl) console.log(`[DailyBrief] Chart generated: ${chartUrl}`);
  } catch (chartErr) {
    console.log(`[DailyBrief] Chart generation skipped: ${chartErr.message}`);
  }

  // Deliver via all channels in parallel
  const [firestoreResult, whatsappResult, pushResult] = await Promise.allSettled([
    pushBriefToFirestore(brief),
    sendBriefToWhatsApp(brief, type, chartUrl),
    sendBriefPushNotification(brief)
  ]);

  // Save state per type
  state[type] = {
    lastSentDate: today,
    sentAt: new Date().toISOString(),
    sectionsWithData: brief.sectionsWithData,
    chartUrl,
    channels: {
      firestore: firestoreResult.status === "fulfilled" && firestoreResult.value?.success,
      whatsapp: whatsappResult.status === "fulfilled" && whatsappResult.value?.success,
      push: pushResult.status === "fulfilled" && pushResult.value?.success
    }
  };
  saveBriefState(state);

  console.log(`[DailyBrief] ${type} delivered — Firestore: ${firestoreResult.status === "fulfilled"}, WhatsApp: ${whatsappResult.status === "fulfilled"}, Push: ${pushResult.status === "fulfilled"}`);

  return {
    success: true,
    brief,
    chartUrl,
    delivery: {
      firestore: firestoreResult.status === "fulfilled" ? firestoreResult.value : { success: false },
      whatsapp: whatsappResult.status === "fulfilled" ? whatsappResult.value : { success: false },
      push: pushResult.status === "fulfilled" ? pushResult.value : { success: false }
    }
  };
}

export default generateAndDeliverBrief;
