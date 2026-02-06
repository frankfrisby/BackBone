/**
 * Goal Alignment Scorer
 *
 * Scores any action/item by how much it advances the user's core goals.
 * Used by the thinking engine to prioritize backlog items and work.
 *
 * Scoring factors:
 * 1. Theme overlap - Does the item's themes match goal themes?
 * 2. Direct impact - Does this measurably move a metric?
 * 3. Timeline urgency - Closer deadlines = higher priority
 * 4. Goal priority - User's goal priority order
 */

import { loadParsedGoals, getGoalsWithProgress } from "./core-goals-parser.js";

/**
 * Calculate theme overlap between an item and a goal
 *
 * @param {string[]} itemThemes - Themes/keywords from the item
 * @param {string[]} goalThemes - Themes from the goal
 * @returns {number} Overlap score 0-100
 */
function calculateThemeOverlap(itemThemes = [], goalThemes = []) {
  if (!itemThemes.length || !goalThemes.length) return 0;

  const normalizedItemThemes = itemThemes.map(t => t.toLowerCase().trim());
  const normalizedGoalThemes = goalThemes.map(t => t.toLowerCase().trim());

  let matches = 0;
  for (const itemTheme of normalizedItemThemes) {
    for (const goalTheme of normalizedGoalThemes) {
      // Exact match
      if (itemTheme === goalTheme) {
        matches += 2;
        continue;
      }
      // Partial match (one contains the other)
      if (itemTheme.includes(goalTheme) || goalTheme.includes(itemTheme)) {
        matches += 1;
      }
    }
  }

  // Normalize to 0-100 scale
  const maxPossibleMatches = Math.min(itemThemes.length, goalThemes.length) * 2;
  return Math.min(100, (matches / maxPossibleMatches) * 100);
}

/**
 * Calculate timeline urgency score
 * Goals with closer deadlines get higher urgency
 *
 * @param {Object} goal - Goal with timeline
 * @returns {number} Urgency multiplier 1.0-2.0
 */
function calculateTimelineUrgency(goal) {
  if (!goal.timeline?.deadline) return 1.0; // No deadline = normal urgency

  const deadline = new Date(goal.timeline.deadline);
  const now = new Date();
  const daysRemaining = (deadline - now) / (1000 * 60 * 60 * 24);

  if (daysRemaining <= 0) return 2.0;        // Past deadline - max urgency
  if (daysRemaining <= 30) return 1.8;       // Less than a month
  if (daysRemaining <= 90) return 1.5;       // Less than 3 months
  if (daysRemaining <= 180) return 1.3;      // Less than 6 months
  if (daysRemaining <= 365) return 1.2;      // Less than a year
  return 1.0;                                 // More than a year
}

/**
 * Calculate priority multiplier based on goal priority
 *
 * @param {number} priority - Goal priority (1 = highest)
 * @returns {number} Priority multiplier 0.5-1.5
 */
function calculatePriorityMultiplier(priority) {
  switch (priority) {
    case 1: return 1.5;   // Highest priority
    case 2: return 1.2;   // Second priority
    case 3: return 1.0;   // Third priority
    default: return 0.8;  // Lower priorities
  }
}

/**
 * Score an item's alignment with a specific goal
 *
 * @param {Object} item - Item to score (backlog item, task, etc.)
 * @param {Object} goal - Goal to align against
 * @returns {Object} Alignment details
 */
function scoreItemGoalAlignment(item, goal) {
  const itemText = `${item.title || ""} ${item.description || ""}`.toLowerCase();
  const itemThemes = item.themes || item.relatedBeliefs || [];

  // Theme overlap (0-100)
  const themeScore = calculateThemeOverlap(itemThemes, goal.themes || []);

  // Keyword matching in text (0-50 bonus)
  let keywordBonus = 0;
  for (const theme of goal.themes || []) {
    if (itemText.includes(theme.toLowerCase())) {
      keywordBonus += 10;
    }
  }
  keywordBonus = Math.min(50, keywordBonus);

  // Direct impact detection (0-30 bonus)
  let directImpactBonus = 0;
  if (goal.id === "wealth") {
    // Items about trading, investing, portfolio get bonus
    if (itemText.match(/trad(e|ing)|invest|portfolio|stock|market|buy|sell/i)) {
      directImpactBonus = 30;
    }
  } else if (goal.id === "income") {
    // Items about products, revenue, automation get bonus
    if (itemText.match(/product|revenue|income|passive|saas|mrr|customer/i)) {
      directImpactBonus = 30;
    }
  } else if (goal.id === "career") {
    // Items about space, robotics, AI, career get bonus
    if (itemText.match(/space|robot|aerospace|nasa|spacex|career|job|role/i)) {
      directImpactBonus = 30;
    }
  }

  // Timeline urgency multiplier
  const urgencyMultiplier = calculateTimelineUrgency(goal);

  // Priority multiplier
  const priorityMultiplier = calculatePriorityMultiplier(goal.priority);

  // Base score
  const baseScore = themeScore + keywordBonus + directImpactBonus;

  // Final score with multipliers (capped at 100)
  const finalScore = Math.min(100, baseScore * urgencyMultiplier * priorityMultiplier);

  return {
    goalId: goal.id,
    goalTitle: goal.title,
    themeScore,
    keywordBonus,
    directImpactBonus,
    urgencyMultiplier,
    priorityMultiplier,
    baseScore,
    finalScore: Math.round(finalScore * 10) / 10
  };
}

/**
 * Score an item's alignment with ALL core goals
 *
 * @param {Object} item - Item to score
 * @param {Object} parsedGoals - Parsed goals object (optional, will load if not provided)
 * @returns {Object} Full alignment analysis
 */
export function scoreGoalAlignment(item, parsedGoals = null) {
  const goals = parsedGoals || loadParsedGoals();
  if (!goals?.goals || goals.goals.length === 0) {
    return {
      overallScore: 0,
      alignments: [],
      primaryGoal: null,
      reason: "No parsed goals available"
    };
  }

  const alignments = goals.goals.map(goal => scoreItemGoalAlignment(item, goal));

  // Sort by score descending
  alignments.sort((a, b) => b.finalScore - a.finalScore);

  // Overall score = weighted average (primary goal counts more)
  let totalWeight = 0;
  let weightedSum = 0;
  for (const align of alignments) {
    const weight = align.priorityMultiplier;
    weightedSum += align.finalScore * weight;
    totalWeight += weight;
  }
  const overallScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;

  // Determine primary goal this item affects
  const primaryAlignment = alignments[0];
  const primaryGoal = primaryAlignment?.finalScore >= 30 ? primaryAlignment.goalId : null;

  return {
    overallScore,
    alignments,
    primaryGoal,
    primaryGoalTitle: primaryAlignment?.goalTitle,
    affectsGoals: alignments.filter(a => a.finalScore >= 20).map(a => a.goalId),
    reason: primaryGoal
      ? `Aligns with ${primaryAlignment.goalTitle} (${primaryAlignment.finalScore}%)`
      : "Low goal alignment"
  };
}

/**
 * Get which goals an item affects and how
 *
 * @param {Object} item - Item to analyze
 * @returns {Array} Affected goals with impact details
 */
export function getGoalRelevance(item) {
  const result = scoreGoalAlignment(item);
  return result.alignments.filter(a => a.finalScore >= 20);
}

/**
 * Score a ticker/stock by goal alignment
 * Used by trading system to prefer goal-aligned investments
 *
 * @param {string} symbol - Stock symbol
 * @param {Object} tickerData - Ticker data (sector, industry, etc.)
 * @returns {number} Goal alignment boost (-1 to +1)
 */
export function getTickerGoalBoost(symbol, tickerData = {}) {
  const goals = loadParsedGoals();
  if (!goals?.goals) return 0;

  const wealthGoal = goals.goals.find(g => g.id === "wealth");
  const careerGoal = goals.goals.find(g => g.id === "career");

  let boost = 0;

  // Wealth goal - check if ticker is in affected tickers
  if (wealthGoal?.affectedTickers?.includes(symbol)) {
    boost += 0.2;
  }

  // Career goal - space/AI related stocks get a boost
  const spaceSymbols = ["RKLB", "SPCE", "LMT", "NOC", "BA", "RTX", "GD", "ASTS"];
  const aiSymbols = ["NVDA", "AMD", "GOOGL", "MSFT", "META", "TSLA", "AMZN"];

  if (careerGoal) {
    if (spaceSymbols.includes(symbol)) {
      boost += 0.3; // Strong alignment with career goal
    }
    if (aiSymbols.includes(symbol)) {
      boost += 0.2; // AI companies align with career goal
    }
  }

  // Industry-based alignment
  const sector = tickerData.sector?.toLowerCase() || "";
  const industry = tickerData.industry?.toLowerCase() || "";

  if (careerGoal && (sector.includes("aerospace") || industry.includes("space"))) {
    boost += 0.2;
  }

  return Math.min(1, Math.max(-1, boost));
}

/**
 * Calculate combined score for backlog items
 * Used by thinking engine to weight items
 *
 * @param {Object} item - Backlog item
 * @param {number} beliefScore - Score from belief alignment (0-100)
 * @param {Object} parsedGoals - Optional parsed goals
 * @returns {Object} Combined scoring
 */
export function calculateCombinedScore(item, beliefScore = 50, parsedGoals = null) {
  const goalAlignment = scoreGoalAlignment(item, parsedGoals);

  // Weight: 40% beliefs, 60% goals
  const combinedScore = (beliefScore * 0.4) + (goalAlignment.overallScore * 0.6);

  return {
    beliefScore,
    goalScore: goalAlignment.overallScore,
    combinedScore: Math.round(combinedScore * 10) / 10,
    primaryGoal: goalAlignment.primaryGoal,
    affectsGoals: goalAlignment.affectsGoals,
    alignments: goalAlignment.alignments
  };
}

/**
 * Get goal-based action recommendations
 * Used by briefs and daily planning
 *
 * @returns {Array} Recommended actions based on goals
 */
export function getGoalBasedRecommendations() {
  const goalsWithProgress = getGoalsWithProgress();
  const recommendations = [];

  for (const goal of goalsWithProgress) {
    if (goal.id === "wealth") {
      const details = goal.progressDetails;
      if (details?.requiredDaily > 0) {
        recommendations.push({
          goalId: "wealth",
          priority: goal.priority,
          action: `Portfolio needs to grow $${details.requiredDaily.toLocaleString()}/day to reach $1M`,
          urgency: details.daysRemaining < 365 ? "high" : "medium",
          context: `Currently at $${details.current?.toLocaleString()}, ${details.daysRemaining} days remaining`
        });
      }
    } else if (goal.id === "income") {
      if (goal.metrics.current === 0) {
        recommendations.push({
          goalId: "income",
          priority: goal.priority,
          action: "Start validating a product idea for passive income",
          urgency: "medium",
          context: "No passive income yet - first step is idea validation"
        });
      }
    } else if (goal.id === "career") {
      const nextMilestone = goal.milestones?.find(m => m.value > goal.progress);
      if (nextMilestone) {
        recommendations.push({
          goalId: "career",
          priority: goal.priority,
          action: `Work toward: ${nextMilestone.label}`,
          urgency: "medium",
          context: `Currently at ${goal.progress}% progress`
        });
      }
    }
  }

  // Sort by priority
  recommendations.sort((a, b) => a.priority - b.priority);

  return recommendations;
}

/**
 * Goal-aware guardrails
 * Prevent over-optimization and ensure balance
 */
export const GOAL_GUARDRAILS = {
  // Don't sacrifice health for wealth
  healthMinimum: {
    sleepScore: 60,    // Don't push work if sleep < 60
    readinessScore: 50 // Don't push if readiness < 50
  },

  // Balance across goals
  goalBalance: {
    maxFocusOnSingleGoal: 0.7,  // No goal gets > 70% of attention
    minAttentionPerGoal: 0.1    // Every goal gets at least 10%
  },

  // Trading-specific limits (for wealth goal)
  riskLimits: {
    maxPortfolioConcentration: 0.3,  // No single stock > 30%
    maxDailyLoss: 0.05,              // Stop if down 5% in a day
    minHoldPeriod: 3                 // 3-day minimum hold (anti-churn)
  }
};

/**
 * Check if an action passes goal guardrails
 *
 * @param {Object} action - Proposed action
 * @param {Object} context - Current context (health, portfolio, etc.)
 * @returns {Object} { allowed, reason }
 */
export function checkGoalGuardrails(action, context = {}) {
  // Health check
  if (context.health) {
    const sleepScore = context.health.sleep?.score;
    const readinessScore = context.health.readiness?.score;

    if (sleepScore && sleepScore < GOAL_GUARDRAILS.healthMinimum.sleepScore) {
      if (action.type === "intensive_work") {
        return {
          allowed: false,
          reason: `Sleep score ${sleepScore} below minimum ${GOAL_GUARDRAILS.healthMinimum.sleepScore} - prioritize rest`
        };
      }
    }
  }

  // Trading risk check
  if (action.type === "trade" && action.side === "buy") {
    if (context.portfolio) {
      // Check concentration
      const proposedValue = action.quantity * action.price;
      const portfolioValue = context.portfolio.equity || 10000;
      const concentration = proposedValue / portfolioValue;

      if (concentration > GOAL_GUARDRAILS.riskLimits.maxPortfolioConcentration) {
        return {
          allowed: false,
          reason: `Position would be ${(concentration * 100).toFixed(0)}% of portfolio - max is ${GOAL_GUARDRAILS.riskLimits.maxPortfolioConcentration * 100}%`
        };
      }
    }
  }

  return { allowed: true };
}

export default {
  scoreGoalAlignment,
  getGoalRelevance,
  getTickerGoalBoost,
  calculateCombinedScore,
  getGoalBasedRecommendations,
  checkGoalGuardrails,
  GOAL_GUARDRAILS
};
