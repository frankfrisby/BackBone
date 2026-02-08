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
import { loadFirebaseUser } from "../firebase/firebase-auth.js";
import { FIREBASE_CONFIG, FIRESTORE_BASE_URL } from "../firebase/firebase-config.js";
import { getWorkLog } from "../work-log.js";
import { getGoalTracker } from "../goals/goal-tracker.js";
import { getLifeScores } from "../health/life-scores.js";
import { loadOuraData } from "../health/oura-service.js";
import { getWhatsAppNotifications } from "../messaging/whatsapp-notifications.js";
import { sendPush, PUSH_TYPE } from "../messaging/push-notifications.js";
import { getUpcomingEvents } from "../integrations/email-calendar-service.js";
import { generatePortfolioChart, generateTickerScoresChart } from "./chart-generator.js";
import { getGoalsWithProgress, getGoalBasedRecommendations } from "../goals/core-goals-parser.js";

import { getDataDir, getMemoryDir } from "../paths.js";
const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();
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
    const goals = getGoalTracker()?.getActive() || [];
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

/**
 * Build core goals progress section
 * Shows progress toward the user's fundamental goals (wealth, income, career)
 */
function buildCoreGoalsSection() {
  try {
    const goalsWithProgress = getGoalsWithProgress();
    if (!goalsWithProgress || goalsWithProgress.length === 0) return null;

    return goalsWithProgress.map(g => ({
      id: g.id,
      title: g.title,
      type: g.type,
      progress: g.progress,
      progressDetails: g.progressDetails,
      priority: g.priority,
      metrics: g.metrics,
      deadline: g.timeline?.deadline
    }));
  } catch (error) {
    console.error("[DailyBrief] Core goals section error:", error.message);
    return null;
  }
}

/**
 * Build goal-based action recommendations
 */
function buildGoalActions() {
  try {
    return getGoalBasedRecommendations();
  } catch {
    return [];
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
  const coreGoals = buildCoreGoalsSection();
  const goalActions = buildGoalActions();

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

    // NEW: Core goals progress (wealth, income, career)
    coreGoals: coreGoals && coreGoals.length > 0 ? coreGoals : null,
    goalActions: goalActions && goalActions.length > 0 ? goalActions : null,

    // Summary line for notifications
    summary: buildSummaryLine({ health, goals, portfolio, actionItems, worldSnapshot, coreGoals })
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
 * Generate a personalized opening based on health and day context
 */
function generateMorningOpening(brief) {
  const now = new Date();
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const hour = now.getHours();

  // Day-specific context
  const isMonday = now.getDay() === 1;
  const isFriday = now.getDay() === 5;
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  // Health-based personalization
  const sleepScore = brief.health?.sleep?.score;
  const readinessScore = brief.health?.readiness?.score;

  let opening = "";

  if (isWeekend) {
    opening = sleepScore >= 80
      ? `Happy ${dayName}. You're well-rested — a good day to recharge or tackle something ambitious.`
      : `Happy ${dayName}. Take it easy today; your body could use the rest.`;
  } else if (isMonday) {
    opening = readinessScore >= 80
      ? `Good morning. Fresh week, strong start — your readiness is high at ${readinessScore}.`
      : `Good morning. New week ahead. Start steady; your body's still warming up.`;
  } else if (isFriday) {
    opening = `Good morning. Friday's here — one more strong push to close out the week.`;
  } else if (sleepScore && sleepScore >= 85) {
    opening = `Good morning. Excellent sleep last night (${sleepScore}) — you're primed for a focused day.`;
  } else if (sleepScore && sleepScore < 65) {
    opening = `Good morning. Sleep was rough (${sleepScore}). Consider lighter cognitive load today.`;
  } else if (readinessScore && readinessScore >= 85) {
    opening = `Good morning. Your body is ready (${readinessScore}) — great day for challenging work or exercise.`;
  } else {
    opening = `Good morning. Here's what you need to know for ${dayName}.`;
  }

  return opening;
}

/**
 * Generate health narrative with actionable insights
 */
function formatHealthNarrative(health) {
  if (!health) return null;

  const sleep = health.sleep?.score;
  const readiness = health.readiness?.score;
  const hrv = health.hrv;
  const activity = health.activity?.score;

  let narrative = "*YOUR BODY*\n";

  // Sleep insight
  if (sleep) {
    if (sleep >= 85) {
      narrative += `Sleep: ${sleep} — excellent recovery. Deep work sessions will be effective today.\n`;
    } else if (sleep >= 70) {
      narrative += `Sleep: ${sleep} — solid rest. You should feel steady throughout the day.\n`;
    } else if (sleep >= 55) {
      narrative += `Sleep: ${sleep} — below baseline. Prioritize important tasks in the morning.\n`;
    } else {
      narrative += `Sleep: ${sleep} — poor night. Keep today's agenda light if possible.\n`;
    }
  }

  // Readiness insight
  if (readiness) {
    if (readiness >= 85) {
      narrative += `Readiness: ${readiness} — your body is primed for physical or mental challenges.\n`;
    } else if (readiness >= 70) {
      narrative += `Readiness: ${readiness} — good to go for normal activities.\n`;
    } else if (readiness < 60) {
      narrative += `Readiness: ${readiness} — take it easy; recovery mode recommended.\n`;
    }
  }

  // HRV context (if significantly different from baseline)
  if (hrv) {
    narrative += `HRV: ${hrv}ms — `;
    if (hrv >= 50) {
      narrative += "strong autonomic balance.\n";
    } else if (hrv >= 30) {
      narrative += "within normal range.\n";
    } else {
      narrative += "lower than ideal; stress or fatigue likely.\n";
    }
  }

  return narrative;
}

/**
 * Generate market narrative with context
 */
function formatMarketNarrative(worldSnapshot, portfolio) {
  if (!worldSnapshot?.marketSummary) return null;

  const ms = worldSnapshot.marketSummary;
  const avgChange = ms.avgChange || 0;
  const isMarketUp = avgChange >= 0;

  let narrative = "*MARKETS*\n";

  // Market direction with context
  if (Math.abs(avgChange) < 0.3) {
    narrative += `Markets are flat this morning (${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(2)}%) — no strong directional move.`;
  } else if (avgChange >= 1.5) {
    narrative += `Strong rally underway — SPY up ${avgChange.toFixed(2)}%. Risk-on sentiment.`;
  } else if (avgChange <= -1.5) {
    narrative += `Selloff in progress — SPY down ${Math.abs(avgChange).toFixed(2)}%. Consider defensive positioning.`;
  } else if (avgChange >= 0.5) {
    narrative += `Markets trending higher (SPY +${avgChange.toFixed(2)}%) — mild bullish tone.`;
  } else if (avgChange <= -0.5) {
    narrative += `Markets under pressure (SPY ${avgChange.toFixed(2)}%) — cautious positioning warranted.`;
  } else {
    const sign = avgChange >= 0 ? "+" : "";
    narrative += `SPY ${sign}${avgChange.toFixed(2)}% — mixed signals.`;
  }

  // Top movers with context
  if (ms.topGainers?.length > 0) {
    const topGainer = ms.topGainers[0];
    narrative += `\nLeading: ${topGainer.symbol} +${topGainer.change}%`;
    if (ms.topGainers.length > 1) {
      narrative += `, ${ms.topGainers[1].symbol} +${ms.topGainers[1].change}%`;
    }
  }

  if (ms.topLosers?.length > 0) {
    const topLoser = ms.topLosers[0];
    narrative += `\nLagging: ${topLoser.symbol} ${topLoser.change}%`;
  }

  narrative += "\n";
  return narrative;
}

/**
 * Generate portfolio narrative with P&L context
 */
function formatPortfolioNarrative(portfolio) {
  if (!portfolio) return null;

  let narrative = "*PORTFOLIO*\n";

  // Equity and P&L
  if (portfolio.equity) {
    narrative += `Value: $${Number(portfolio.equity).toLocaleString()}`;

    if (portfolio.dayPL != null) {
      const plSign = portfolio.dayPL >= 0 ? "+" : "";
      const plAbs = Math.abs(portfolio.dayPL);

      if (Math.abs(portfolio.dayPLPercent || 0) >= 3) {
        narrative += ` — *${plSign}$${plAbs.toFixed(0)}* significant move`;
      } else if (portfolio.dayPL >= 0) {
        narrative += ` (${plSign}$${plAbs.toFixed(0)} today)`;
      } else {
        narrative += ` (${plSign}$${plAbs.toFixed(0)} today)`;
      }
    }
    narrative += "\n";
  }

  // Positions summary
  if (portfolio.topPositions?.length > 0) {
    narrative += "Holdings: ";
    const positionParts = portfolio.topPositions.slice(0, 3).map(pos => {
      let part = `${pos.symbol}`;
      if (pos.unrealizedPLPercent) {
        const sign = pos.unrealizedPLPercent >= 0 ? "+" : "";
        part += ` (${sign}${pos.unrealizedPLPercent.toFixed(1)}%)`;
      }
      return part;
    });
    narrative += positionParts.join(", ") + "\n";
  }

  // Active signals worth noting
  if (portfolio.signals?.length > 0) {
    const strongSignals = portfolio.signals.filter(s => s.score >= 8);
    if (strongSignals.length > 0) {
      narrative += `Strong signals: ${strongSignals.map(s => `${s.symbol} (${s.score.toFixed(1)})`).join(", ")}\n`;
    }
  }

  return narrative;
}

/**
 * Generate goals narrative with focus on what matters today
 */
function formatGoalsNarrative(goals, actionItems) {
  if (!goals?.goals?.length && !actionItems?.length) return null;

  let narrative = "*TODAY'S FOCUS*\n";

  // Urgent items first
  const urgent = (actionItems || []).filter(a => a.priority === "urgent");
  if (urgent.length > 0) {
    narrative += "⚡ Priority: ";
    narrative += urgent.map(a => a.text).join("; ") + "\n";
  }

  // Active goals with meaningful progress context
  if (goals?.goals?.length > 0) {
    const activeGoals = goals.goals.filter(g => (g.progress || 0) < 100);
    if (activeGoals.length > 0) {
      narrative += "Goals in progress:\n";
      activeGoals.slice(0, 3).forEach(g => {
        const title = (g.title || "Untitled").length > 45
          ? (g.title || "Untitled").slice(0, 45) + "..."
          : (g.title || "Untitled");
        const progress = g.progress || 0;

        if (progress === 0) {
          narrative += `• ${title} — not started\n`;
        } else if (progress >= 75) {
          narrative += `• ${title} — ${progress}%, nearly complete\n`;
        } else {
          narrative += `• ${title} — ${progress}%\n`;
        }
      });
    }
  }

  return narrative;
}

/**
 * Generate calendar narrative
 */
function formatCalendarNarrative(calendar) {
  if (!calendar || calendar.length === 0) return null;

  let narrative = "*SCHEDULE*\n";

  if (calendar.length === 1) {
    const ev = calendar[0];
    narrative += `${ev.time} — ${ev.title}\n`;
  } else {
    calendar.slice(0, 4).forEach(ev => {
      narrative += `${ev.time} — ${ev.title}\n`;
    });
  }

  return narrative;
}

/**
 * Generate news with relevance filtering
 */
function formatNewsNarrative(worldSnapshot) {
  if (!worldSnapshot?.headlines?.length) return null;

  let narrative = "*WORTH KNOWING*\n";

  // Pick the most relevant headlines (max 3)
  worldSnapshot.headlines.slice(0, 3).forEach(h => {
    // Truncate long titles
    const title = h.title.length > 60 ? h.title.slice(0, 60) + "..." : h.title;
    narrative += `• ${title}\n`;
  });

  return narrative;
}

/**
 * Format core goals progress for WhatsApp
 * Shows progress toward wealth, income, career goals
 */
function formatCoreGoalsNarrative(coreGoals, goalActions) {
  if (!coreGoals || coreGoals.length === 0) return null;

  let narrative = "*GOAL PROGRESS*\n";

  for (const goal of coreGoals) {
    const icon = goal.id === "wealth" ? "💰" :
                 goal.id === "income" ? "📦" :
                 goal.id === "career" ? "🚀" : "🎯";

    if (goal.id === "wealth" && goal.progressDetails) {
      const d = goal.progressDetails;
      const currentStr = d.current >= 1000 ? `$${(d.current / 1000).toFixed(1)}K` : `$${Math.round(d.current)}`;
      const targetStr = d.target >= 1000000 ? `$${(d.target / 1000000).toFixed(0)}M` : `$${(d.target / 1000).toFixed(0)}K`;
      narrative += `${icon} ${currentStr} → ${targetStr} (${goal.progress.toFixed(1)}%)\n`;
      if (d.requiredDaily > 0) {
        narrative += `   _Need $${Math.round(d.requiredDaily).toLocaleString()}/day avg_\n`;
      }
    } else if (goal.id === "income") {
      const currentStr = goal.metrics?.current > 0 ? `$${goal.metrics.current.toLocaleString()}` : "$0";
      const targetStr = `$${(goal.metrics?.target / 1000).toFixed(0)}K`;
      narrative += `${icon} ${currentStr}/mo → ${targetStr}/mo (${goal.progress.toFixed(0)}%)\n`;
    } else if (goal.id === "career") {
      narrative += `${icon} ${goal.title}: ${goal.progress.toFixed(0)}%\n`;
      if (goal.progressDetails?.nextMilestone) {
        narrative += `   _Next: ${goal.progressDetails.nextMilestone.label}_\n`;
      }
    } else {
      // Generic goal format
      narrative += `${icon} ${goal.title}: ${goal.progress?.toFixed(0) || 0}%\n`;
    }
  }

  // Add top action if available
  if (goalActions && goalActions.length > 0) {
    const topAction = goalActions[0];
    narrative += `\n_Focus: ${topAction.action}_`;
  }

  return narrative;
}

/**
 * Generate thoughtful closing
 */
function generateMorningClosing(brief) {
  const sleepScore = brief.health?.sleep?.score;
  const readinessScore = brief.health?.readiness?.score;
  const hasUrgent = (brief.actionItems || []).some(a => a.priority === "urgent");
  const marketUp = (brief.worldSnapshot?.marketSummary?.avgChange || 0) >= 0.5;

  if (hasUrgent) {
    return "_Focus on what matters most first._";
  } else if (readinessScore >= 85 && sleepScore >= 80) {
    return "_High energy day — make it count._";
  } else if (sleepScore && sleepScore < 60) {
    return "_Be kind to yourself today._";
  } else if (marketUp) {
    return "_Stay focused. Good luck today._";
  } else {
    return "_Make it a good one._";
  }
}

/**
 * Format a rich morning brief for WhatsApp with bold sections and data.
 * This version is thoughtful, contextual, and well-written.
 */
export function formatMorningWhatsApp(brief) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // Build the message with narrative sections
  let msg = `*BACKBONE*\n_${dateStr}_\n\n`;

  // Opening — personalized based on health and day
  msg += generateMorningOpening(brief) + "\n";

  // Health narrative
  const healthSection = formatHealthNarrative(brief.health);
  if (healthSection) msg += "\n" + healthSection;

  // Calendar — what's on the schedule
  const calendarSection = formatCalendarNarrative(brief.calendar);
  if (calendarSection) msg += "\n" + calendarSection;

  // Core goals progress (wealth, income, career)
  const coreGoalsSection = formatCoreGoalsNarrative(brief.coreGoals, brief.goalActions);
  if (coreGoalsSection) msg += "\n" + coreGoalsSection;

  // Markets narrative
  const marketSection = formatMarketNarrative(brief.worldSnapshot, brief.portfolio);
  if (marketSection) msg += "\n" + marketSection;

  // Portfolio narrative
  const portfolioSection = formatPortfolioNarrative(brief.portfolio);
  if (portfolioSection) msg += "\n" + portfolioSection;

  // Goals and focus (discrete goals/tasks)
  const goalsSection = formatGoalsNarrative(brief.goals, brief.actionItems);
  if (goalsSection) msg += "\n" + goalsSection;

  // News worth knowing
  const newsSection = formatNewsNarrative(brief.worldSnapshot);
  if (newsSection) msg += "\n" + newsSection;

  // Thoughtful closing
  msg += "\n" + generateMorningClosing(brief);

  return msg;
}

/**
 * Generate evening opening based on the day's activity
 */
function generateEveningOpening(brief) {
  const now = new Date();
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const isFriday = now.getDay() === 5;
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  const hadTrades = brief.portfolio?.recentTrades?.length > 0;
  const dayPL = brief.portfolio?.dayPL || 0;
  const activityScore = brief.health?.activity?.score;
  const steps = brief.health?.activity?.steps || 0;

  if (isFriday) {
    return dayPL >= 0
      ? `Week's done. Green close on ${dayName} — enjoy the weekend.`
      : `Week's wrapped. Markets didn't cooperate, but rest up for next week.`;
  }

  if (isWeekend) {
    return `${dayName} evening. Hope you had a good one.`;
  }

  if (hadTrades && dayPL > 50) {
    return `Strong ${dayName}. Portfolio up and moves were made.`;
  } else if (hadTrades && dayPL < -50) {
    return `Tough ${dayName} in the markets. Tomorrow's a new day.`;
  } else if (activityScore && activityScore >= 80) {
    return `Active ${dayName} — ${steps.toLocaleString()} steps. Your body worked today.`;
  } else if (steps >= 8000) {
    return `Good movement today — ${steps.toLocaleString()} steps logged.`;
  } else {
    return `${dayName}'s wrapping up. Here's how it went.`;
  }
}

/**
 * Format day's trades with context
 */
function formatTradesNarrative(portfolio) {
  if (!portfolio?.recentTrades?.length) return null;

  let narrative = "*TRADES*\n";

  const trades = portfolio.recentTrades;
  const totalValue = trades.reduce((sum, t) => sum + (parseFloat(t.price) * parseFloat(t.qty || 0)), 0);

  trades.forEach(t => {
    const side = (t.side || "buy").toUpperCase();
    const value = parseFloat(t.price) * parseFloat(t.qty || 0);
    narrative += `${side} ${t.qty} ${t.symbol} @ $${Number(t.price).toFixed(2)}`;
    if (value >= 100) {
      narrative += ` ($${value.toFixed(0)})`;
    }
    narrative += "\n";
  });

  return narrative;
}

/**
 * Format evening portfolio summary
 */
function formatEveningPortfolioNarrative(portfolio) {
  if (!portfolio) return null;

  let narrative = "*PORTFOLIO*\n";

  if (portfolio.dayPL != null) {
    const plSign = portfolio.dayPL >= 0 ? "+" : "";
    const dayResult = Math.abs(portfolio.dayPL) >= 100
      ? `$${Math.abs(portfolio.dayPL).toFixed(0)}`
      : `$${Math.abs(portfolio.dayPL).toFixed(2)}`;

    if (portfolio.dayPL >= 50) {
      narrative += `Day: ${plSign}${dayResult} — solid gains\n`;
    } else if (portfolio.dayPL <= -50) {
      narrative += `Day: ${plSign}${dayResult} — gave some back\n`;
    } else if (portfolio.dayPL >= 0) {
      narrative += `Day: ${plSign}${dayResult} — held steady\n`;
    } else {
      narrative += `Day: ${plSign}${dayResult} — minor pullback\n`;
    }
  }

  if (portfolio.equity) {
    narrative += `Total: $${Number(portfolio.equity).toLocaleString()}\n`;
  }

  return narrative;
}

/**
 * Format evening activity summary
 */
function formatEveningActivityNarrative(health) {
  if (!health) return null;

  const activity = health.activity;
  const steps = activity?.steps;
  const calories = activity?.calories;
  const activityScore = activity?.score;

  if (!steps && !activityScore) return null;

  let narrative = "*ACTIVITY*\n";

  if (steps) {
    if (steps >= 10000) {
      narrative += `${steps.toLocaleString()} steps — excellent movement\n`;
    } else if (steps >= 7000) {
      narrative += `${steps.toLocaleString()} steps — good day\n`;
    } else if (steps >= 4000) {
      narrative += `${steps.toLocaleString()} steps — moderate activity\n`;
    } else {
      narrative += `${steps.toLocaleString()} steps — light day\n`;
    }
  }

  if (activityScore) {
    narrative += `Activity score: ${activityScore}\n`;
  }

  return narrative;
}

/**
 * Format tomorrow preview
 */
function formatTomorrowPreview() {
  try {
    const tomorrow = getUpcomingEvents(5);
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().split("T")[0];
    const tomorrowDayName = tomorrowDate.toLocaleDateString("en-US", { weekday: "long" });

    const tomorrowEvents = (tomorrow || []).filter(ev => {
      const evDate = new Date(ev.start).toISOString().split("T")[0];
      return evDate === tomorrowStr;
    });

    if (tomorrowEvents.length === 0) return null;

    let narrative = `*${tomorrowDayName.toUpperCase()}*\n`;
    tomorrowEvents.slice(0, 3).forEach(ev => {
      const time = new Date(ev.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const title = (ev.summary || ev.subject || "Event").slice(0, 40);
      narrative += `${time} — ${title}\n`;
    });

    return narrative;
  } catch {
    return null;
  }
}

/**
 * Format ticker watchlist for evening
 */
function formatEveningWatchlist(portfolio) {
  if (!portfolio?.signals?.length) return null;

  const strongSignals = portfolio.signals.filter(s => s.score >= 7.5);
  if (strongSignals.length === 0) return null;

  let narrative = "*WATCHING*\n";
  narrative += strongSignals.map(s => `${s.symbol} (${s.score.toFixed(1)})`).join("  ") + "\n";

  return narrative;
}

/**
 * Generate evening closing
 */
function generateEveningClosing(brief) {
  const sleepScore = brief.health?.sleep?.score;
  const activityScore = brief.health?.activity?.score;
  const dayPL = brief.portfolio?.dayPL || 0;
  const now = new Date();
  const isFriday = now.getDay() === 5;

  if (isFriday) {
    return "_Enjoy the weekend. Recharge well._";
  } else if (activityScore && activityScore >= 85) {
    return "_Active day behind you. Sleep will come easy._";
  } else if (sleepScore && sleepScore < 65) {
    return "_Prioritize sleep tonight._";
  } else if (dayPL >= 100) {
    return "_Good day locked in. Rest up._";
  } else {
    return "_Rest well. Tomorrow's a new opportunity._";
  }
}

/**
 * Format a rich evening brief for WhatsApp.
 * This version is thoughtful and summarizes the day with context.
 */
export function formatEveningWhatsApp(brief) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  let msg = `*BACKBONE*\n_${dateStr} Evening_\n\n`;

  // Opening — contextual based on the day
  msg += generateEveningOpening(brief) + "\n";

  // Trades (if any)
  const tradesSection = formatTradesNarrative(brief.portfolio);
  if (tradesSection) msg += "\n" + tradesSection;

  // Portfolio summary
  const portfolioSection = formatEveningPortfolioNarrative(brief.portfolio);
  if (portfolioSection) msg += "\n" + portfolioSection;

  // Activity summary
  const activitySection = formatEveningActivityNarrative(brief.health);
  if (activitySection) msg += "\n" + activitySection;

  // Tomorrow preview
  const tomorrowSection = formatTomorrowPreview();
  if (tomorrowSection) msg += "\n" + tomorrowSection;

  // Watchlist
  const watchlistSection = formatEveningWatchlist(brief.portfolio);
  if (watchlistSection) msg += "\n" + watchlistSection;

  // Thoughtful closing
  msg += "\n" + generateEveningClosing(brief);

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

    // Try to initialize WhatsApp if not enabled yet
    if (!whatsapp.enabled) {
      const user = loadFirebaseUser();
      if (user?.localId) {
        await whatsapp.initialize(user.localId);
        console.log(`[DailyBrief] WhatsApp initialized for ${type} brief, enabled: ${whatsapp.enabled}`);
      }
    }

    if (!whatsapp.enabled) {
      return { success: false, error: "WhatsApp not enabled — no verified phone" };
    }

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
