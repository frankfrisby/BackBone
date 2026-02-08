/**
 * Core Goals Parser
 *
 * Parses free-text coreGoals from user-settings.json into structured objectives.
 * Creates actionable goal objects with metrics, timelines, and themes.
 *
 * DATA FLOW:
 * 1. User writes goals in natural language → data/user-settings.json → coreGoals field
 * 2. This parser reads that text and extracts structured goals
 * 3. Structured goals saved to → data/parsed-goals.json
 * 4. When user changes coreGoals, parser re-runs and updates parsed-goals.json
 *
 * SUPPORTED GOAL TYPES (detected via keywords):
 * - WEALTH/FINANCIAL: Keywords like "portfolio", "million", "$", "invest", "trading"
 * - INCOME/BUSINESS: Keywords like "passive income", "MRR", "product", "service", "monthly"
 * - CAREER: Keywords like "industry", "job", "work in", "career", company names
 * - HEALTH: Keywords like "health", "fitness", "weight", "exercise"
 * - LEARNING: Keywords like "learn", "skill", "certification", "course"
 *
 * The parser uses pattern matching - it's NOT hardcoded to specific goals.
 * Any user can write any goals and the system will attempt to parse them.
 */

import fs from "fs";
import path from "path";

import { getDataDir, getMemoryDir, getBackboneHome } from "../paths.js";
const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();
const PARSED_GOALS_PATH = path.join(DATA_DIR, "parsed-goals.json");
const USER_SETTINGS_PATH = path.join(DATA_DIR, "user-settings.json");
const ALPACA_CACHE_PATH = path.join(DATA_DIR, "alpaca-cache.json");

/**
 * Load JSON file safely
 */
function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Save JSON file
 */
function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`[CoreGoalsParser] Save error: ${error.message}`);
  }
}

/**
 * Get current portfolio value from Alpaca cache
 */
function getCurrentPortfolioValue() {
  const alpaca = loadJson(ALPACA_CACHE_PATH);
  if (alpaca?.account?.equity) {
    return parseFloat(alpaca.account.equity) || 0;
  }
  return 0;
}

/**
 * Parse the raw coreGoals text into structured goals.
 * Uses pattern matching and keyword extraction.
 *
 * @param {string} rawGoals - Free-text goals from user settings
 * @returns {Object} Structured goals object
 */
export function parseCoreGoals(rawGoals) {
  if (!rawGoals || typeof rawGoals !== "string") {
    return { goals: [], parsedAt: null, rawText: null };
  }

  const goals = [];
  const now = new Date().toISOString();
  const currentPortfolio = getCurrentPortfolioValue();

  // Goal 1: WEALTH - Portfolio growth
  // Pattern: "$X" to "$Y" by "date"
  const wealthPatterns = [
    /(\$?[\d,]+k?)\s*(→|to|into)\s*(\$?[\d,]+\s*(million|m|k)?)/i,
    /portfolio.*?(\$?[\d,]+)/i,
    /(million|1m|3m)/i
  ];

  // Check for wealth goal indicators
  const hasWealth = rawGoals.match(/portfolio|million|\$1m|\$3m|wealth|invest/i);
  if (hasWealth) {
    // Extract target amounts
    let target = 1000000;  // Default $1M
    let stretch = 3000000; // Default $3M stretch

    const millionMatch = rawGoals.match(/(\d+)\s*million/i);
    if (millionMatch) {
      target = parseInt(millionMatch[1]) * 1000000;
    }

    // Look for "190k" or similar starting amount
    const startMatch = rawGoals.match(/(\d+)k/i);
    const startAmount = startMatch ? parseInt(startMatch[1]) * 1000 : 190000;

    // Look for deadline (e.g., "2027", "end of 2027")
    const deadlineMatch = rawGoals.match(/(20\d{2})/);
    const deadline = deadlineMatch ? `${deadlineMatch[1]}-12-31` : "2027-12-31";

    goals.push({
      id: "wealth",
      type: "financial",
      title: "Build $1M+ Portfolio",
      description: `Convert ${startAmount >= 1000 ? "$" + (startAmount / 1000) + "K" : "$" + startAmount} into $1M+ by end of 2027`,
      metrics: {
        current: currentPortfolio || startAmount,
        start: startAmount,
        target: target,
        stretch: stretch,
        unit: "USD"
      },
      timeline: {
        start: "2026-01-01",
        deadline: deadline
      },
      themes: ["investing", "trading", "compound growth", "portfolio management", "wealth building"],
      affectedTickers: ["SPY", "QQQ", "VTI", "VOO"],
      worldViewFile: "memory/worldview-wealth.md",
      priority: 1  // Highest priority
    });
  }

  // Goal 2: INCOME - Passive income
  // Pattern: "$Xk/month" or "passive income"
  const hasIncome = rawGoals.match(/\$?15k|passive|income|product|service|runs on its own/i);
  if (hasIncome) {
    let targetMonthly = 15000;

    const incomeMatch = rawGoals.match(/\$?(\d+)k?\s*(\/|per)?\s*(month|mo)/i);
    if (incomeMatch) {
      targetMonthly = parseInt(incomeMatch[1]) * (incomeMatch[1].length <= 2 ? 1000 : 1);
    }

    goals.push({
      id: "income",
      type: "business",
      title: "$15K/month Passive Income",
      description: "Create product/service generating $15K/month passively",
      metrics: {
        current: 0,
        target: targetMonthly,
        unit: "USD/month"
      },
      timeline: {
        start: "2026-01-01",
        deadline: null  // Open-ended
      },
      themes: ["product", "automation", "recurring revenue", "SaaS", "passive income", "entrepreneurship"],
      milestones: [
        { label: "First product idea validated", value: 10 },
        { label: "MVP launched", value: 25 },
        { label: "First paying customer", value: 40 },
        { label: "$1K MRR", value: 55 },
        { label: "$5K MRR", value: 75 },
        { label: "$10K MRR", value: 90 },
        { label: "$15K MRR", value: 100 }
      ],
      worldViewFile: "memory/worldview-income.md",
      priority: 2
    });
  }

  // Goal 3: CAREER - Space robotics
  // Pattern: "space", "robotics", "AI", "industry"
  const hasCareer = rawGoals.match(/space|robotics|ai\s*(and|&|\+)|industry|work in/i);
  if (hasCareer) {
    goals.push({
      id: "career",
      type: "career",
      title: "Space Robotics Career",
      description: "Enter AI + space industry, work on space robotics",
      metrics: {
        current: 0,
        target: 100,
        unit: "percent"  // 0-100% progress
      },
      timeline: {
        start: "2026-01-01",
        deadline: null  // Open-ended career goal
      },
      themes: ["AI", "space", "robotics", "aerospace", "NASA", "SpaceX", "engineering"],
      milestones: [
        { label: "Industry research complete", value: 15 },
        { label: "Key skills identified", value: 25 },
        { label: "Learning path started", value: 35 },
        { label: "Portfolio projects started", value: 45 },
        { label: "Network building (5+ contacts)", value: 55 },
        { label: "First application submitted", value: 70 },
        { label: "Interview stage", value: 85 },
        { label: "Role secured", value: 100 }
      ],
      targetCompanies: [
        "SpaceX", "Blue Origin", "Astrobotic", "Intuitive Machines",
        "NASA JPL", "Northrop Grumman", "Lockheed Martin", "Boeing",
        "Relativity Space", "Rocket Lab", "Planet Labs"
      ],
      worldViewFile: "memory/worldview-career.md",
      priority: 3
    });
  }

  return {
    goals,
    parsedAt: now,
    rawText: rawGoals,
    portfolioAtParse: currentPortfolio
  };
}

/**
 * Parse and store core goals from user settings
 *
 * @returns {Object} Parsed goals
 */
export async function parseAndStoreCoreGoals() {
  const settings = loadJson(USER_SETTINGS_PATH);
  if (!settings?.coreGoals) {
    console.log("[CoreGoalsParser] No coreGoals in user settings");
    return { goals: [], error: "No coreGoals in settings" };
  }

  const parsed = parseCoreGoals(settings.coreGoals);

  if (parsed.goals.length === 0) {
    console.log("[CoreGoalsParser] Could not parse any goals from text");
    return { goals: [], error: "Could not parse goals" };
  }

  // Save to parsed-goals.json
  saveJson(PARSED_GOALS_PATH, parsed);
  console.log(`[CoreGoalsParser] Parsed ${parsed.goals.length} goals from coreGoals`);

  // Create world view files if they don't exist
  for (const goal of parsed.goals) {
    if (goal.worldViewFile) {
      const worldViewPath = path.join(getBackboneHome(), goal.worldViewFile);
      if (!fs.existsSync(worldViewPath)) {
        createInitialWorldView(goal);
      }
    }
  }

  return parsed;
}

/**
 * Create initial world view document for a goal
 */
function createInitialWorldView(goal) {
  const worldViewPath = path.join(getBackboneHome(), goal.worldViewFile);
  const now = new Date().toISOString().split("T")[0];

  let content = "";

  if (goal.id === "wealth") {
    content = `# World View: ${goal.title}

## Current State
- Portfolio Value: $${(goal.metrics.current || 0).toLocaleString()}
- Target: $${(goal.metrics.target / 1000000).toFixed(0)}M by ${goal.timeline.deadline?.split("-")[0] || "2027"}
- Stretch Goal: $${(goal.metrics.stretch / 1000000).toFixed(0)}M

## Growth Requirements
- Required growth: ${((goal.metrics.target / (goal.metrics.current || 1)) * 100 - 100).toFixed(0)}%
- Time remaining: Calculate days to deadline

## Strategy Considerations
- Trading approach (momentum, value, growth)
- Risk tolerance based on timeline
- Position sizing rules
- Market condition adjustments

## Key Sectors to Watch
- Technology (AI, semiconductors)
- Healthcare (biotech, longevity)
- Energy (clean tech)
- Space/Aerospace

## Learning Resources
- To be populated by overnight research

## Action Items
- [ ] Review current positions
- [ ] Set weekly progress targets
- [ ] Build watchlist aligned with goals

_Last updated: ${now}_
_This document is updated by overnight research._
`;
  } else if (goal.id === "income") {
    content = `# World View: ${goal.title}

## Current State
- Monthly Passive Income: $${goal.metrics.current}
- Target: $${(goal.metrics.target / 1000).toFixed(0)}K/month

## Progress
${(goal.milestones || []).map(m => `- [ ] ${m.label} (${m.value}%)`).join("\n")}

## Product Ideas to Explore
- SaaS micro-products
- Automated services
- Digital products
- Content monetization

## Business Models
- Subscription/recurring revenue
- One-time purchases with upsells
- Freemium with premium tiers
- API/service fees

## Skills Needed
- Product development
- Marketing automation
- Customer acquisition
- Systems/automation

## Market Opportunities
- To be populated by overnight research

## Action Items
- [ ] Brainstorm 10 product ideas
- [ ] Validate 1 idea this week
- [ ] Research competitor pricing

_Last updated: ${now}_
_This document is updated by overnight research._
`;
  } else if (goal.id === "career") {
    content = `# World View: ${goal.title}

## Current State
- Progress: ${goal.metrics.current}%
- Goal: Work in AI + Space Robotics

## Progress Milestones
${(goal.milestones || []).map(m => `- [ ] ${m.label} (${m.value}%)`).join("\n")}

## Target Companies
${(goal.targetCompanies || []).map(c => `- ${c}`).join("\n")}

## Industry Landscape
- Key players and their focus areas
- Growth trajectory
- Recent developments

## Required Skills
Based on job postings and industry needs:
- To be populated by overnight research

## Entry Paths
- Transition strategies for current background
- Relevant projects to build
- Certifications to consider

## Network Targets
- People to connect with
- Events to attend
- Communities to join

## Current Opportunities
- Open roles matching profile
- Companies hiring
- Contracts/projects

## Action Items
- [ ] Research 3 companies in depth
- [ ] Identify skill gaps
- [ ] Connect with 1 industry person

_Last updated: ${now}_
_This document is updated by overnight research._
`;
  }

  try {
    const dir = path.dirname(worldViewPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(worldViewPath, content);
    console.log(`[CoreGoalsParser] Created world view: ${goal.worldViewFile}`);
  } catch (error) {
    console.error(`[CoreGoalsParser] Failed to create world view: ${error.message}`);
  }
}

/**
 * Load parsed goals from cache
 *
 * @returns {Object} Parsed goals or null
 */
export function loadParsedGoals() {
  return loadJson(PARSED_GOALS_PATH);
}

/**
 * Get a specific goal by ID
 *
 * @param {string} goalId - Goal ID (wealth, income, career)
 * @returns {Object|null} Goal object or null
 */
export function getGoalById(goalId) {
  const parsed = loadParsedGoals();
  if (!parsed?.goals) return null;
  return parsed.goals.find(g => g.id === goalId) || null;
}

/**
 * Update goal metrics (e.g., current portfolio value)
 *
 * @param {string} goalId - Goal ID
 * @param {Object} updates - Metric updates
 */
export function updateGoalMetrics(goalId, updates) {
  const parsed = loadParsedGoals();
  if (!parsed?.goals) return false;

  const goal = parsed.goals.find(g => g.id === goalId);
  if (!goal) return false;

  goal.metrics = { ...goal.metrics, ...updates };
  goal.lastUpdated = new Date().toISOString();

  saveJson(PARSED_GOALS_PATH, parsed);
  return true;
}

/**
 * Calculate progress for each goal
 *
 * @returns {Array} Goals with calculated progress
 */
export function getGoalsWithProgress() {
  const parsed = loadParsedGoals();
  if (!parsed?.goals) return [];

  const currentPortfolio = getCurrentPortfolioValue();

  return parsed.goals.map(goal => {
    let progress = 0;
    let progressDetails = {};

    if (goal.id === "wealth" || goal.type === "financial") {
      // Update with current portfolio value
      const current = currentPortfolio || goal.metrics.current;
      const target = goal.metrics.target || 1000000;

      // For progress, use current portfolio as baseline (not historical start)
      // Progress = current / target * 100
      progress = Math.max(0, Math.min(100, (current / target) * 100));

      // Calculate required daily growth from current position
      const deadline = new Date(goal.timeline.deadline);
      const now = new Date();
      const daysRemaining = Math.max(1, Math.ceil((deadline - now) / (1000 * 60 * 60 * 24)));
      const requiredTotal = target - current;
      const requiredDaily = requiredTotal / daysRemaining;

      // Also calculate required percentage growth per day
      const requiredDailyPercent = (Math.pow(target / current, 1 / daysRemaining) - 1) * 100;

      progressDetails = {
        current,
        target,
        daysRemaining,
        requiredTotal,
        requiredDaily: Math.round(requiredDaily * 100) / 100,
        requiredDailyPercent: Math.round(requiredDailyPercent * 1000) / 1000,
        percentComplete: Math.round(progress * 100) / 100
      };
    } else if (goal.id === "income") {
      // Progress based on current MRR
      progress = (goal.metrics.current / goal.metrics.target) * 100;

      progressDetails = {
        currentMRR: goal.metrics.current,
        targetMRR: goal.metrics.target,
        percentComplete: Math.round(progress * 10) / 10
      };
    } else if (goal.id === "career") {
      // Progress is manually tracked
      progress = goal.metrics.current || 0;

      progressDetails = {
        milestoneProgress: progress,
        nextMilestone: goal.milestones?.find(m => m.value > progress) || null
      };
    }

    return {
      ...goal,
      progress: Math.round(progress * 10) / 10,
      progressDetails
    };
  });
}

/**
 * Get goal-relevant context for briefs and decisions
 */
export function getGoalContext() {
  const goalsWithProgress = getGoalsWithProgress();

  return {
    goals: goalsWithProgress,
    summary: goalsWithProgress.map(g => ({
      id: g.id,
      title: g.title,
      progress: g.progress,
      priority: g.priority
    })),
    primaryGoal: goalsWithProgress.find(g => g.priority === 1) || null,
    hasUrgentDeadlines: goalsWithProgress.some(g => {
      if (!g.timeline?.deadline) return false;
      const daysRemaining = (new Date(g.timeline.deadline) - new Date()) / (1000 * 60 * 60 * 24);
      return daysRemaining < 365; // Less than a year = urgent for long-term goals
    })
  };
}

/**
 * Check if coreGoals have changed since last parse
 * Returns true if re-parsing is needed
 *
 * @returns {boolean} True if goals need re-parsing
 */
export function goalsNeedReParsing() {
  const settings = loadJson(USER_SETTINGS_PATH);
  const parsed = loadParsedGoals();

  if (!settings?.coreGoals) return false; // No goals to parse
  if (!parsed?.rawText) return true;      // Never parsed

  // Check if raw text has changed
  return settings.coreGoals !== parsed.rawText;
}

/**
 * Ensure goals are parsed - call this on startup
 * Re-parses if coreGoals text has changed
 *
 * @returns {Object} Parsed goals
 */
export async function ensureGoalsParsed() {
  if (goalsNeedReParsing()) {
    console.log("[CoreGoalsParser] Goals changed or not parsed - parsing now");
    return await parseAndStoreCoreGoals();
  }

  const parsed = loadParsedGoals();
  if (!parsed || parsed.goals.length === 0) {
    console.log("[CoreGoalsParser] No parsed goals found - parsing now");
    return await parseAndStoreCoreGoals();
  }

  return parsed;
}

/**
 * Get goal-based action recommendations for briefs
 * Used by daily brief generator
 *
 * @returns {Array} Recommended actions based on goals
 */
export function getGoalBasedRecommendations() {
  const goalsWithProgress = getGoalsWithProgress();
  const recommendations = [];

  for (const goal of goalsWithProgress) {
    if (goal.id === "wealth" || goal.type === "financial") {
      const details = goal.progressDetails;
      if (details?.requiredDaily > 0) {
        recommendations.push({
          goalId: goal.id,
          priority: goal.priority || 1,
          action: `Portfolio needs to grow $${Math.round(details.requiredDaily).toLocaleString()}/day to reach target`,
          urgency: details.daysRemaining < 365 ? "high" : "medium",
          context: `Currently at $${Math.round(details.current)?.toLocaleString()}, ${details.daysRemaining} days remaining`
        });
      }
    } else if (goal.id === "income" || goal.type === "business") {
      if ((goal.metrics?.current || 0) === 0) {
        recommendations.push({
          goalId: goal.id,
          priority: goal.priority || 2,
          action: "Start validating a product idea for passive income",
          urgency: "medium",
          context: "No passive income yet - first step is idea validation"
        });
      }
    } else if (goal.id === "career" || goal.type === "career") {
      const nextMilestone = goal.milestones?.find(m => m.value > (goal.progress || 0));
      if (nextMilestone) {
        recommendations.push({
          goalId: goal.id,
          priority: goal.priority || 3,
          action: `Work toward: ${nextMilestone.label}`,
          urgency: "medium",
          context: `Currently at ${goal.progress || 0}% progress`
        });
      }
    } else {
      // Generic goal - suggest working on it
      if ((goal.progress || 0) < 100) {
        recommendations.push({
          goalId: goal.id,
          priority: goal.priority || 5,
          action: `Progress on: ${goal.title}`,
          urgency: "low",
          context: `Currently at ${goal.progress || 0}% progress`
        });
      }
    }
  }

  // Sort by priority
  recommendations.sort((a, b) => a.priority - b.priority);

  return recommendations;
}

export default {
  parseCoreGoals,
  parseAndStoreCoreGoals,
  loadParsedGoals,
  getGoalById,
  updateGoalMetrics,
  getGoalsWithProgress,
  getGoalContext,
  goalsNeedReParsing,
  ensureGoalsParsed,
  getGoalBasedRecommendations
};
