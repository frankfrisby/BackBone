/**
 * App Command Handler
 *
 * Processes commands and questions from the mobile app / WhatsApp via Firebase.
 * Provides direct access to BACKBONE capabilities through natural language
 * or slash commands.
 *
 * Command categories:
 *  - Portfolio/Trading: positions, portfolio, buy/sell signals, PnL
 *  - Health: sleep, readiness, activity, health summary
 *  - Goals/Projects: list goals, check progress, create goals
 *  - News/Market: latest news, market summary, research topics
 *  - Calendar: today's events, upcoming schedule
 *  - Email: unread count, recent emails, search
 *  - System: status, thesis, beliefs, life scores
 *  - General: anything else goes to AI brain with full context
 */

import fs from "fs";
import path from "path";

import { getDataDir, getMemoryDir } from "./paths.js";
const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();

/**
 * Command patterns for direct routing (no AI needed)
 * Each pattern maps to a handler that returns a response string.
 */
const COMMAND_PATTERNS = [
  // Slash commands
  { pattern: /^\/portfolio$/i, handler: "portfolio" },
  { pattern: /^\/positions$/i, handler: "portfolio" },
  { pattern: /^\/health$/i, handler: "health" },
  { pattern: /^\/sleep$/i, handler: "sleep" },
  { pattern: /^\/goals$/i, handler: "goals" },
  { pattern: /^\/news$/i, handler: "news" },
  { pattern: /^\/market$/i, handler: "market" },
  { pattern: /^\/thesis$/i, handler: "thesis" },
  { pattern: /^\/status$/i, handler: "status" },
  { pattern: /^\/beliefs$/i, handler: "beliefs" },
  { pattern: /^\/calendar$/i, handler: "calendar" },
  { pattern: /^\/email$/i, handler: "email" },
  { pattern: /^\/scores$/i, handler: "scores" },
  { pattern: /^\/help$/i, handler: "help" },

  // Natural language patterns → direct handlers
  { pattern: /^(how are my|show me my|check my)\s+(stocks?|positions?|portfolio)/i, handler: "portfolio" },
  { pattern: /^(how did I|how was my|check my)\s+sleep/i, handler: "sleep" },
  { pattern: /^(how('?s| is) my|check my)\s+(health|readiness)/i, handler: "health" },
  { pattern: /^(what are|show me|list)\s+(my\s+)?goals/i, handler: "goals" },
  { pattern: /^(what('?s| is) (the|in the))\s+news/i, handler: "news" },
  { pattern: /^(how('?s| is) the|what('?s| is) the)\s+market/i, handler: "market" },
  { pattern: /^(what('?s| is) (my|the|your))\s+(thesis|focus)/i, handler: "thesis" },
  { pattern: /^(what('?s| is) on my|show me my|my)\s+calendar/i, handler: "calendar" },
  { pattern: /^(any|check|do I have)\s+(new\s+)?(email|mail)/i, handler: "email" },
  { pattern: /^(morning\s*brief|daily\s*(summary|update|brief))/i, handler: "morningBrief" },
  { pattern: /^(what|anything)\s+(can you|do you)\s+(do|help)/i, handler: "help" },
];

/**
 * Read a memory file safely
 */
function readMemory(filename) {
  try {
    const filePath = path.join(MEMORY_DIR, filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {}
  return null;
}

/**
 * Read a data file safely
 */
function readData(filename) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

/**
 * Format portfolio data into a concise message
 */
async function handlePortfolio() {
  const portfolio = readMemory("portfolio.md");
  if (portfolio) {
    // Extract key info from markdown
    const lines = portfolio.split("\n").filter(l => l.trim());
    const summary = lines.slice(0, 20).join("\n");
    return summary || "Portfolio data is available but empty. Run a market scan to update.";
  }

  // Try tickers cache
  const cache = readData("tickers-cache.json");
  if (cache?.tickers?.length > 0) {
    const top5 = cache.tickers
      .filter(t => t.score != null)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5);
    let msg = "Top Tickers by Score:\n";
    for (const t of top5) {
      const arrow = t.changePercent >= 0 ? "+" : "";
      msg += `${t.symbol}: $${t.price?.toFixed(2)} (${arrow}${t.changePercent?.toFixed(1)}%) Score: ${t.score?.toFixed(1)}\n`;
    }
    return msg;
  }

  return "No portfolio data available yet. The market scanner needs to run first.";
}

/**
 * Format health/sleep data
 */
async function handleHealth() {
  const health = readMemory("health.md");
  if (health) {
    const lines = health.split("\n").filter(l => l.trim());
    return lines.slice(0, 15).join("\n") || "Health data available but empty.";
  }
  return "No health data available. Connect your Oura ring to get health insights.";
}

async function handleSleep() {
  const health = readMemory("health.md");
  if (health) {
    // Extract sleep-specific section
    const sleepMatch = health.match(/sleep[^]*?(?=\n#|\n---|\Z)/i);
    if (sleepMatch) {
      return sleepMatch[0].substring(0, 500);
    }
    return health.substring(0, 300);
  }

  const oura = readData("oura-data.json");
  if (oura) {
    const root = oura.latest || oura;
    const sleepArr = Array.isArray(root.sleep) ? root.sleep : [];
    const latest = sleepArr.at(-1);
    if (latest) {
      return `Sleep Score: ${latest.score || "N/A"}\nTotal Sleep: ${latest.total_sleep_duration ? Math.round(latest.total_sleep_duration / 3600) + "h" : "N/A"}\nEfficiency: ${latest.contributors?.efficiency || latest.efficiency || "N/A"}%`;
    }
  }
  return "No sleep data available. Connect your Oura ring for sleep tracking.";
}

/**
 * Format goals
 */
async function handleGoals() {
  const goals = readData("goals.json");
  if (!goals || !Array.isArray(goals) || goals.length === 0) {
    return "No active goals. Send me something like 'I want to learn Spanish' to create one.";
  }

  const active = goals.filter(g => g.status === "active" || g.status === "planning");
  if (active.length === 0) {
    return `You have ${goals.length} goals but none are currently active.`;
  }

  let msg = `Active Goals (${active.length}):\n\n`;
  for (const g of active.slice(0, 5)) {
    msg += `${g.title}\n`;
    msg += `  Status: ${g.status} | Progress: ${g.progress || 0}%\n`;
    if (g.category) msg += `  Category: ${g.category}\n`;
    msg += "\n";
  }
  return msg;
}

/**
 * Format news
 */
async function handleNews() {
  try {
    const newsPath = path.join(DATA_DIR, "latest-news.json");
    if (fs.existsSync(newsPath)) {
      const news = JSON.parse(fs.readFileSync(newsPath, "utf-8"));
      const items = news.articles || news.items || news;
      if (Array.isArray(items) && items.length > 0) {
        let msg = "Latest News:\n\n";
        for (const item of items.slice(0, 5)) {
          msg += `${item.title || item.headline}\n`;
          if (item.source) msg += `  - ${item.source}\n`;
          msg += "\n";
        }
        return msg;
      }
    }
  } catch {}

  return "No cached news. I'll fetch the latest for you — check back in a moment.";
}

/**
 * Market summary
 */
async function handleMarket() {
  const tickers = readMemory("tickers.md");
  if (tickers) {
    const lines = tickers.split("\n").filter(l => l.trim());
    return lines.slice(0, 15).join("\n") || "Market data available but empty.";
  }

  const cache = readData("tickers-cache.json");
  if (cache?.tickers) {
    const spy = cache.tickers.find(t => t.symbol === "SPY");
    const spyLine = spy
      ? `SPY: $${spy.price?.toFixed(2)} (${spy.changePercent >= 0 ? "+" : ""}${spy.changePercent?.toFixed(2)}%)`
      : "SPY: N/A";

    return `Market Summary:\n${spyLine}\n\nTotal tickers tracked: ${cache.tickers.length}\nLast update: ${cache.lastUpdate || "unknown"}`;
  }

  return "No market data cached yet. The scanner needs to run.";
}

/**
 * Thesis / current focus
 */
async function handleThesis() {
  const thesis = readMemory("thesis.md");
  if (thesis) {
    return thesis.substring(0, 600);
  }
  return "No thesis generated yet. The thinking engine will create one on its next cycle.";
}

/**
 * System status
 */
async function handleStatus() {
  const profile = readMemory("profile.md");
  const goals = readData("goals.json");
  const beliefs = readData("core-beliefs.json");
  const scores = readData("life-scores.json");

  let msg = "BACKBONE Status:\n\n";
  msg += `Goals: ${goals?.filter(g => g.status === "active")?.length || 0} active\n`;
  msg += `Beliefs: ${beliefs?.length || 0} core beliefs\n`;

  if (scores) {
    msg += "\nLife Scores:\n";
    for (const [dim, score] of Object.entries(scores)) {
      if (typeof score === "number") {
        msg += `  ${dim}: ${score}/10\n`;
      }
    }
  }

  return msg;
}

/**
 * Beliefs
 */
async function handleBeliefs() {
  const beliefs = readData("core-beliefs.json");
  if (!beliefs || beliefs.length === 0) {
    return "No core beliefs set. Tell me what matters most to you.";
  }

  let msg = "Core Beliefs:\n\n";
  for (const b of beliefs) {
    msg += `${b.name}\n`;
    if (b.description) msg += `  ${b.description}\n`;
    msg += "\n";
  }
  return msg;
}

/**
 * Calendar (today's events)
 */
async function handleCalendar() {
  const calPath = path.join(DATA_DIR, "calendar-events.json");
  try {
    if (fs.existsSync(calPath)) {
      const events = JSON.parse(fs.readFileSync(calPath, "utf-8"));
      if (Array.isArray(events) && events.length > 0) {
        let msg = "Today's Calendar:\n\n";
        for (const e of events.slice(0, 5)) {
          msg += `${e.time || e.startTime || ""} ${e.title || e.summary}\n`;
          if (e.location) msg += `  Location: ${e.location}\n`;
        }
        return msg;
      }
    }
  } catch {}
  return "No calendar events found for today.";
}

/**
 * Email summary
 */
async function handleEmail() {
  return "Email: Use the app to check your inbox, or ask me to search for specific emails.";
}

/**
 * Life scores
 */
async function handleScores() {
  const scores = readData("life-scores.json");
  if (!scores) return "No life scores calculated yet.";

  let msg = "Life Dimension Scores:\n\n";
  for (const [dim, data] of Object.entries(scores)) {
    if (typeof data === "number") {
      msg += `${dim}: ${data}/10\n`;
    } else if (data?.score != null) {
      msg += `${dim}: ${data.score}/10\n`;
    }
  }
  return msg;
}

/**
 * Morning brief - combines portfolio + health + goals + calendar
 */
async function handleMorningBrief() {
  const parts = [];

  // Health
  const health = readMemory("health.md");
  if (health) {
    const lines = health.split("\n").filter(l => l.trim()).slice(0, 5);
    parts.push("Health:\n" + lines.join("\n"));
  }

  // Goals
  const goals = readData("goals.json");
  const active = goals?.filter(g => g.status === "active") || [];
  if (active.length > 0) {
    parts.push("Active Goals:\n" + active.slice(0, 3).map(g => `- ${g.title} (${g.progress || 0}%)`).join("\n"));
  }

  // Market
  const cache = readData("tickers-cache.json");
  if (cache?.tickers) {
    const spy = cache.tickers.find(t => t.symbol === "SPY");
    if (spy) {
      parts.push(`Market: SPY $${spy.price?.toFixed(2)} (${spy.changePercent >= 0 ? "+" : ""}${spy.changePercent?.toFixed(2)}%)`);
    }
  }

  if (parts.length === 0) {
    return "Good morning! I don't have enough data for a full brief yet. As I collect more data through the day, the briefs will get richer.";
  }

  return "Morning Brief:\n\n" + parts.join("\n\n");
}

/**
 * Help command
 */
async function handleHelp() {
  return `BACKBONE Commands:

/portfolio — Stock positions & P/L
/health — Health & readiness score
/sleep — Last night's sleep data
/goals — Active goals & progress
/news — Latest news headlines
/market — Market summary & SPY
/thesis — Current AI focus/thesis
/calendar — Today's events
/email — Email summary
/scores — Life dimension scores
/beliefs — Core beliefs
/status — System status

Or just ask me anything naturally:
"How are my stocks?"
"Did I sleep well?"
"What's in the news?"
"Morning brief"`;
}

const HANDLERS = {
  portfolio: handlePortfolio,
  health: handleHealth,
  sleep: handleSleep,
  goals: handleGoals,
  news: handleNews,
  market: handleMarket,
  thesis: handleThesis,
  status: handleStatus,
  beliefs: handleBeliefs,
  calendar: handleCalendar,
  email: handleEmail,
  scores: handleScores,
  morningBrief: handleMorningBrief,
  help: handleHelp,
};

/**
 * Try to match a message to a direct command handler.
 * Returns { matched: true, response } if handled, or { matched: false } if not.
 */
export async function tryDirectCommand(messageText) {
  if (!messageText || typeof messageText !== "string") {
    return { matched: false };
  }

  const trimmed = messageText.trim();

  for (const { pattern, handler } of COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      try {
        const response = await HANDLERS[handler]();
        return { matched: true, handler, response };
      } catch (error) {
        return { matched: true, handler, response: `Error running ${handler}: ${error.message}` };
      }
    }
  }

  return { matched: false };
}

/**
 * Build rich context for AI brain when handling a message
 * Reads memory files to give the AI full awareness.
 */
export function buildMessageContext() {
  const context = {};

  // Read key memory files (summarized)
  const memoryFiles = ["profile.md", "portfolio.md", "health.md", "goals.md", "thesis.md"];
  for (const file of memoryFiles) {
    const content = readMemory(file);
    if (content) {
      const key = file.replace(".md", "");
      // Truncate to keep context manageable
      context[key] = content.substring(0, 500);
    }
  }

  // Active goals summary
  const goals = readData("goals.json");
  if (goals && Array.isArray(goals)) {
    const active = goals.filter(g => g.status === "active");
    context.activeGoals = active.slice(0, 5).map(g => `${g.title} (${g.progress || 0}%)`).join(", ");
  }

  // Beliefs summary
  const beliefs = readData("core-beliefs.json");
  if (beliefs && Array.isArray(beliefs)) {
    context.beliefs = beliefs.map(b => b.name).join(", ");
  }

  return context;
}

/**
 * Build a context-enriched system prompt for the AI brain
 */
export function buildContextualSystemPrompt(channel = "app") {
  const ctx = buildMessageContext();
  const parts = [
    `You are BACKBONE AI, a personal life optimization assistant responding via ${channel}.`,
    "Keep responses concise and actionable. Use bullet points for lists.",
    "You have access to the user's real data:"
  ];

  if (ctx.profile) parts.push(`\nUser Profile:\n${ctx.profile}`);
  if (ctx.portfolio) parts.push(`\nPortfolio:\n${ctx.portfolio}`);
  if (ctx.health) parts.push(`\nHealth:\n${ctx.health}`);
  if (ctx.activeGoals) parts.push(`\nActive Goals: ${ctx.activeGoals}`);
  if (ctx.beliefs) parts.push(`\nCore Beliefs: ${ctx.beliefs}`);
  if (ctx.thesis) parts.push(`\nCurrent Focus:\n${ctx.thesis}`);

  return parts.join("\n");
}

export default { tryDirectCommand, buildMessageContext, buildContextualSystemPrompt };
