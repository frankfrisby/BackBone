/**
 * Morning Briefing Service
 *
 * Generates a daily morning briefing with useful, actionable information.
 * Only delivers if there's something meaningful to share - never sends empty briefings.
 *
 * Data Sources:
 * - Health (Oura): Sleep quality, readiness, recovery status
 * - Portfolio: Significant stock movements, earnings, trading opportunities
 * - Goals: Active goals, deadlines, progress updates
 * - Calendar: Today's events and meetings
 * - Projects: Active project status, blockers, milestones
 * - Weather: (if available) Weather for the day
 * - Market: Pre-market movers, notable news
 */

import fs from "fs";
import path from "path";
import { getOuraConfig, buildOuraHealthSummary } from "./oura.js";
import { loadGoals } from "./goal-extractor.js";
import { listProjects } from "./projects.js";

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_DIR = path.join(process.cwd(), "memory");

/**
 * Briefing section with priority level
 */
const PRIORITY = {
  URGENT: 1,      // Must see - health alerts, critical deadlines, major market moves
  IMPORTANT: 2,   // Should see - goals due, earnings, significant updates
  USEFUL: 3,      // Nice to have - general updates, tips
  LOW: 4          // Only if nothing else - filler content (we skip these)
};

/**
 * Load JSON file safely
 */
function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch (e) {
    console.error(`[MorningBriefing] Failed to load ${filePath}:`, e.message);
  }
  return null;
}

/**
 * Load markdown file safely
 */
function loadMarkdown(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf8");
    }
  } catch (e) {
    console.error(`[MorningBriefing] Failed to load ${filePath}:`, e.message);
  }
  return null;
}

/**
 * Get health insights from Oura data
 */
function getHealthInsights() {
  const insights = [];
  const ouraData = loadJson(path.join(DATA_DIR, "oura-data.json"));

  if (!ouraData || !ouraData.sleep) {
    return insights;
  }

  const sleep = ouraData.sleep;
  const readiness = ouraData.readiness;

  // Sleep quality alerts
  if (sleep.score !== undefined) {
    if (sleep.score < 60) {
      insights.push({
        priority: PRIORITY.URGENT,
        category: "health",
        icon: "😴",
        title: "Poor Sleep Last Night",
        detail: `Sleep score: ${sleep.score}/100. Consider a lighter day and earlier bedtime tonight.`,
        action: "Take it easy today"
      });
    } else if (sleep.score >= 85) {
      insights.push({
        priority: PRIORITY.USEFUL,
        category: "health",
        icon: "💪",
        title: "Great Sleep!",
        detail: `Sleep score: ${sleep.score}/100. You're well-rested for a productive day.`,
        action: null
      });
    }
  }

  // Readiness score
  if (readiness?.score !== undefined) {
    if (readiness.score < 60) {
      insights.push({
        priority: PRIORITY.IMPORTANT,
        category: "health",
        icon: "⚠️",
        title: "Low Readiness",
        detail: `Readiness: ${readiness.score}/100. Your body needs recovery.`,
        action: "Avoid intense workouts"
      });
    } else if (readiness.score >= 85) {
      insights.push({
        priority: PRIORITY.USEFUL,
        category: "health",
        icon: "🎯",
        title: "High Readiness",
        detail: `Readiness: ${readiness.score}/100. Great day for challenges.`,
        action: null
      });
    }
  }

  // Sleep debt
  if (sleep.deficit && sleep.deficit > 60) {
    insights.push({
      priority: PRIORITY.IMPORTANT,
      category: "health",
      icon: "🛏️",
      title: "Sleep Debt Accumulating",
      detail: `You're ${Math.round(sleep.deficit / 60)} hours behind on sleep this week.`,
      action: "Prioritize rest"
    });
  }

  return insights;
}

/**
 * Get portfolio insights from tickers and trades
 */
function getPortfolioInsights() {
  const insights = [];
  const tickersCache = loadJson(path.join(DATA_DIR, "tickers-cache.json"));
  const tradesLog = loadJson(path.join(DATA_DIR, "trades-log.json"));

  if (!tickersCache?.tickers) {
    return insights;
  }

  const tickers = tickersCache.tickers;

  // Find top scoring opportunities (score >= 8)
  const topOpportunities = tickers
    .filter(t => t.score >= 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (topOpportunities.length > 0) {
    const symbols = topOpportunities.map(t => `${t.symbol} (${t.score.toFixed(1)})`).join(", ");
    insights.push({
      priority: PRIORITY.IMPORTANT,
      category: "portfolio",
      icon: "📈",
      title: "Top Trading Opportunities",
      detail: symbols,
      action: "Review before market open"
    });
  }

  // Find significant movers (>5% change)
  const bigMovers = tickers
    .filter(t => Math.abs(t.changePercent || 0) > 5)
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 3);

  if (bigMovers.length > 0) {
    const moversText = bigMovers.map(t => {
      const sign = t.changePercent >= 0 ? "+" : "";
      return `${t.symbol} ${sign}${t.changePercent.toFixed(1)}%`;
    }).join(", ");
    insights.push({
      priority: PRIORITY.IMPORTANT,
      category: "portfolio",
      icon: "🔥",
      title: "Big Movers",
      detail: moversText,
      action: null
    });
  }

  // Check for stocks near earnings (from earningsDate field)
  const earningsThisWeek = tickers.filter(t => {
    if (!t.earningsDate) return false;
    const earnings = new Date(t.earningsDate);
    const now = new Date();
    const daysUntil = (earnings - now) / (1000 * 60 * 60 * 24);
    return daysUntil >= 0 && daysUntil <= 7;
  });

  if (earningsThisWeek.length > 0) {
    const symbols = earningsThisWeek.slice(0, 5).map(t => t.symbol).join(", ");
    insights.push({
      priority: PRIORITY.IMPORTANT,
      category: "portfolio",
      icon: "📊",
      title: "Earnings This Week",
      detail: symbols,
      action: "Consider position sizing"
    });
  }

  // Check open positions from trades log
  if (tradesLog?.positions?.length > 0) {
    const openPositions = tradesLog.positions.filter(p => p.status === "open");
    const profitableCount = openPositions.filter(p => (p.currentValue || 0) > (p.costBasis || 0)).length;

    if (openPositions.length > 0) {
      insights.push({
        priority: PRIORITY.USEFUL,
        category: "portfolio",
        icon: "💼",
        title: "Open Positions",
        detail: `${openPositions.length} positions (${profitableCount} in profit)`,
        action: null
      });
    }
  }

  return insights;
}

/**
 * Get goal insights
 */
function getGoalInsights() {
  const insights = [];
  const goals = loadJson(path.join(DATA_DIR, "goals.json"));

  if (!goals || !Array.isArray(goals)) {
    return insights;
  }

  const activeGoals = goals.filter(g => g.status === "active");
  const today = new Date();

  // Goals due this week
  const dueThisWeek = activeGoals.filter(g => {
    if (!g.dueDate) return false;
    const due = new Date(g.dueDate);
    const daysUntil = (due - today) / (1000 * 60 * 60 * 24);
    return daysUntil >= 0 && daysUntil <= 7;
  });

  if (dueThisWeek.length > 0) {
    const priority = dueThisWeek.some(g => {
      const due = new Date(g.dueDate);
      return (due - today) / (1000 * 60 * 60 * 24) <= 2;
    }) ? PRIORITY.URGENT : PRIORITY.IMPORTANT;

    insights.push({
      priority,
      category: "goals",
      icon: "🎯",
      title: `${dueThisWeek.length} Goal${dueThisWeek.length > 1 ? "s" : ""} Due This Week`,
      detail: dueThisWeek.slice(0, 3).map(g => g.title).join(", "),
      action: "Focus on completion"
    });
  }

  // Goals with high progress (>75%) - almost done!
  const almostDone = activeGoals.filter(g => (g.progress || 0) >= 75 && (g.progress || 0) < 100);
  if (almostDone.length > 0) {
    insights.push({
      priority: PRIORITY.USEFUL,
      category: "goals",
      icon: "🏁",
      title: "Almost There!",
      detail: `${almostDone.length} goal${almostDone.length > 1 ? "s" : ""} at 75%+ completion`,
      action: "Push to finish"
    });
  }

  // Stalled goals (no progress in 7+ days)
  const stalledGoals = activeGoals.filter(g => {
    if (!g.lastUpdated) return false;
    const lastUpdate = new Date(g.lastUpdated);
    const daysSinceUpdate = (today - lastUpdate) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 7;
  });

  if (stalledGoals.length > 0) {
    insights.push({
      priority: PRIORITY.IMPORTANT,
      category: "goals",
      icon: "⏸️",
      title: "Stalled Goals",
      detail: `${stalledGoals.length} goal${stalledGoals.length > 1 ? "s" : ""} need attention`,
      action: "Unblock or reassess"
    });
  }

  return insights;
}

/**
 * Get project insights
 */
function getProjectInsights() {
  const insights = [];

  try {
    const projects = listProjects();
    if (!projects || projects.length === 0) {
      return insights;
    }

    const activeProjects = projects.filter(p => p.status === "active" || !p.status);

    // Projects with recent activity
    const recentlyActive = activeProjects.filter(p => {
      if (!p.lastModified) return false;
      const lastMod = new Date(p.lastModified);
      const daysSince = (new Date() - lastMod) / (1000 * 60 * 60 * 24);
      return daysSince <= 3;
    });

    if (recentlyActive.length > 0) {
      insights.push({
        priority: PRIORITY.USEFUL,
        category: "projects",
        icon: "📂",
        title: "Active Projects",
        detail: recentlyActive.slice(0, 3).map(p => p.name).join(", "),
        action: null
      });
    }

    // Check for blocked projects (from PROJECT.md status)
    const blockedProjects = activeProjects.filter(p =>
      p.status === "blocked" || (p.blockers && p.blockers.length > 0)
    );

    if (blockedProjects.length > 0) {
      insights.push({
        priority: PRIORITY.IMPORTANT,
        category: "projects",
        icon: "🚧",
        title: "Blocked Projects",
        detail: blockedProjects.slice(0, 2).map(p => p.name).join(", "),
        action: "Resolve blockers"
      });
    }
  } catch (e) {
    // Projects might not be available
  }

  return insights;
}

/**
 * Get calendar insights (from calendar-data.json if available)
 */
function getCalendarInsights() {
  const insights = [];
  const calendarData = loadJson(path.join(DATA_DIR, "calendar-data.json"));

  if (!calendarData?.events) {
    return insights;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Today's events
  const todayEvents = calendarData.events.filter(e => {
    const eventDate = new Date(e.start || e.date);
    return eventDate >= today && eventDate < tomorrow;
  });

  if (todayEvents.length > 0) {
    const eventsSummary = todayEvents.slice(0, 3).map(e => {
      const time = new Date(e.start || e.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `${time} ${e.title || e.summary}`;
    }).join(", ");

    insights.push({
      priority: PRIORITY.IMPORTANT,
      category: "calendar",
      icon: "📅",
      title: `${todayEvents.length} Event${todayEvents.length > 1 ? "s" : ""} Today`,
      detail: eventsSummary,
      action: null
    });
  }

  return insights;
}

/**
 * Get thesis/focus insights from memory
 */
function getThesisInsights() {
  const insights = [];
  const thesis = loadMarkdown(path.join(MEMORY_DIR, "thesis.md"));

  if (thesis && thesis.length > 50) {
    // Extract the main focus from thesis
    const lines = thesis.split("\n").filter(l => l.trim());
    const focusLine = lines.find(l => l.toLowerCase().includes("focus") || l.toLowerCase().includes("priority"));

    if (focusLine) {
      insights.push({
        priority: PRIORITY.USEFUL,
        category: "focus",
        icon: "🎯",
        title: "Current Focus",
        detail: focusLine.replace(/^#+\s*/, "").replace(/\*\*/g, "").slice(0, 80),
        action: null
      });
    }
  }

  return insights;
}

/**
 * Build the morning briefing
 * Returns null if there's nothing useful to share
 */
export function buildMorningBriefing() {
  const allInsights = [
    ...getHealthInsights(),
    ...getPortfolioInsights(),
    ...getGoalInsights(),
    ...getProjectInsights(),
    ...getCalendarInsights(),
    ...getThesisInsights()
  ];

  // Filter out low priority items - we only want useful+ content
  const meaningfulInsights = allInsights.filter(i => i.priority <= PRIORITY.USEFUL);

  // If nothing meaningful, don't send a briefing
  if (meaningfulInsights.length === 0) {
    return null;
  }

  // Sort by priority (urgent first)
  meaningfulInsights.sort((a, b) => a.priority - b.priority);

  // Build the briefing
  const today = new Date();
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = today.toLocaleDateString("en-US", { month: "long", day: "numeric" });

  let briefing = `Good morning! Here's your briefing for ${dayName}, ${dateStr}.\n\n`;

  // Group by category for cleaner presentation
  const categories = {
    health: { title: "HEALTH", items: [] },
    portfolio: { title: "PORTFOLIO", items: [] },
    goals: { title: "GOALS", items: [] },
    projects: { title: "PROJECTS", items: [] },
    calendar: { title: "TODAY", items: [] },
    focus: { title: "FOCUS", items: [] }
  };

  meaningfulInsights.forEach(insight => {
    const cat = categories[insight.category];
    if (cat) {
      cat.items.push(insight);
    }
  });

  // Build sections
  Object.values(categories).forEach(cat => {
    if (cat.items.length === 0) return;

    briefing += `${cat.title}\n`;
    briefing += "─".repeat(40) + "\n";

    cat.items.forEach(item => {
      briefing += `${item.icon} ${item.title}\n`;
      if (item.detail) {
        briefing += `   ${item.detail}\n`;
      }
      if (item.action) {
        briefing += `   → ${item.action}\n`;
      }
    });

    briefing += "\n";
  });

  // Add a motivational closer based on what we found
  const urgentCount = meaningfulInsights.filter(i => i.priority === PRIORITY.URGENT).length;
  if (urgentCount > 0) {
    briefing += `⚡ ${urgentCount} urgent item${urgentCount > 1 ? "s" : ""} need${urgentCount === 1 ? "s" : ""} your attention today.\n`;
  } else {
    briefing += "Have a productive day!\n";
  }

  return {
    content: briefing,
    insights: meaningfulInsights,
    urgentCount,
    totalCount: meaningfulInsights.length,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Check if a briefing should be sent
 * Only returns true if there's useful information
 */
export function shouldSendBriefing() {
  const briefing = buildMorningBriefing();
  return briefing !== null && briefing.totalCount > 0;
}

/**
 * Get a summary line for the briefing (for notifications)
 */
export function getBriefingSummary() {
  const briefing = buildMorningBriefing();
  if (!briefing) {
    return null;
  }

  const parts = [];
  if (briefing.urgentCount > 0) {
    parts.push(`${briefing.urgentCount} urgent`);
  }
  parts.push(`${briefing.totalCount} updates`);

  return parts.join(", ");
}

export default buildMorningBriefing;
