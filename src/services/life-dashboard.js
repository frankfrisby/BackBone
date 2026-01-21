/**
 * Life Dashboard Service
 *
 * Provides a comprehensive overview of all life metrics at a glance.
 * Aggregates data from goals, habits, health, finance, and more.
 */

import fs from "fs";
import path from "path";
import { getGoalSummary, loadGoals } from "./goal-extractor.js";
import { getHabitsSummary, getTodayHabits } from "./habits.js";
import { getTopRecommendations, getDailyFocus } from "./recommendations-engine.js";
import { isReviewDue, getReviewStats } from "./weekly-review.js";

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_DIR = path.join(process.cwd(), "memory");

// Life score categories and their weights
const LIFE_CATEGORIES = {
  health: { weight: 0.2, icon: "+", name: "Health" },
  wealth: { weight: 0.15, icon: "$", name: "Wealth" },
  career: { weight: 0.15, icon: "^", name: "Career" },
  relationships: { weight: 0.15, icon: "@", name: "Relationships" },
  growth: { weight: 0.15, icon: "*", name: "Growth" },
  habits: { weight: 0.1, icon: "~", name: "Habits" },
  goals: { weight: 0.1, icon: ">", name: "Goals" }
};

/**
 * Calculate health score from available data
 */
const calculateHealthScore = () => {
  let score = 50; // Base score
  const factors = [];

  try {
    // Check Oura data
    const ouraPath = path.join(DATA_DIR, "oura-health.json");
    if (fs.existsSync(ouraPath)) {
      const ouraData = JSON.parse(fs.readFileSync(ouraPath, "utf-8"));
      if (ouraData.sleep?.score) {
        const sleepScore = ouraData.sleep.score;
        score = sleepScore;
        factors.push({ name: "Sleep", value: sleepScore });
      }
      if (ouraData.readiness?.score) {
        score = Math.round((score + ouraData.readiness.score) / 2);
        factors.push({ name: "Readiness", value: ouraData.readiness.score });
      }
    }

    // Check health-related habits
    const habits = getTodayHabits();
    const healthHabits = habits.filter(h => h.category === "health" || h.category === "fitness");
    if (healthHabits.length > 0) {
      const healthHabitCompletion = healthHabits.filter(h => h.completed).length / healthHabits.length;
      score = Math.round(score * 0.7 + healthHabitCompletion * 100 * 0.3);
      factors.push({ name: "Health Habits", value: Math.round(healthHabitCompletion * 100) });
    }
  } catch (err) {
    // Continue with base score
  }

  return { score, factors };
};

/**
 * Calculate wealth score from available data
 */
const calculateWealthScore = () => {
  let score = 50;
  const factors = [];

  try {
    // Check portfolio data
    const portfolioPath = path.join(DATA_DIR, "portfolio.json");
    if (fs.existsSync(portfolioPath)) {
      const portfolio = JSON.parse(fs.readFileSync(portfolioPath, "utf-8"));
      if (portfolio.totalValue) {
        // Score based on having investments
        score = 60;
        factors.push({ name: "Portfolio", value: "Active" });

        if (portfolio.dailyPL) {
          const plPercent = (portfolio.dailyPL / portfolio.totalValue) * 100;
          if (plPercent > 0) score = Math.min(90, score + 10);
          factors.push({ name: "Daily P/L", value: `${plPercent > 0 ? "+" : ""}${plPercent.toFixed(2)}%` });
        }
      }
    }

    // Check finance goals progress
    const goals = loadGoals().goals || [];
    const financeGoals = goals.filter(g => g.category === "finance");
    if (financeGoals.length > 0) {
      const avgProgress = financeGoals.reduce((sum, g) => sum + (g.progress || 0), 0) / financeGoals.length;
      score = Math.round(score * 0.6 + avgProgress * 100 * 0.4);
      factors.push({ name: "Finance Goals", value: `${Math.round(avgProgress * 100)}%` });
    }
  } catch (err) {
    // Continue with base score
  }

  return { score, factors };
};

/**
 * Calculate career score
 */
const calculateCareerScore = () => {
  let score = 50;
  const factors = [];

  try {
    // Check LinkedIn data
    const linkedinPath = path.join(DATA_DIR, "linkedin-profile.json");
    if (fs.existsSync(linkedinPath)) {
      const linkedin = JSON.parse(fs.readFileSync(linkedinPath, "utf-8"));
      if (linkedin.name) {
        score = 60;
        factors.push({ name: "LinkedIn", value: "Connected" });
      }
    }

    // Check career goals
    const goals = loadGoals().goals || [];
    const careerGoals = goals.filter(g => g.category === "career");
    if (careerGoals.length > 0) {
      const avgProgress = careerGoals.reduce((sum, g) => sum + (g.progress || 0), 0) / careerGoals.length;
      score = Math.round(score * 0.6 + avgProgress * 100 * 0.4);
      factors.push({ name: "Career Goals", value: `${Math.round(avgProgress * 100)}%` });
    }

    // Check productivity habits
    const habits = getTodayHabits();
    const workHabits = habits.filter(h => h.category === "productivity");
    if (workHabits.length > 0) {
      const workHabitCompletion = workHabits.filter(h => h.completed).length / workHabits.length;
      score = Math.round(score * 0.8 + workHabitCompletion * 100 * 0.2);
    }
  } catch (err) {
    // Continue with base score
  }

  return { score, factors };
};

/**
 * Calculate relationships score
 */
const calculateRelationshipsScore = () => {
  let score = 50;
  const factors = [];

  try {
    // Check social/family goals
    const goals = loadGoals().goals || [];
    const socialGoals = goals.filter(g => g.category === "family" || g.title.toLowerCase().includes("relationship"));
    if (socialGoals.length > 0) {
      const avgProgress = socialGoals.reduce((sum, g) => sum + (g.progress || 0), 0) / socialGoals.length;
      score = Math.round(50 + avgProgress * 50);
      factors.push({ name: "Social Goals", value: `${Math.round(avgProgress * 100)}%` });
    }

    // Check social habits
    const habits = getTodayHabits();
    const socialHabits = habits.filter(h => h.category === "social" || h.title.toLowerCase().includes("connect"));
    if (socialHabits.length > 0) {
      const completionRate = socialHabits.filter(h => h.completed).length / socialHabits.length;
      score = Math.round(score * 0.7 + completionRate * 100 * 0.3);
      factors.push({ name: "Social Habits", value: `${Math.round(completionRate * 100)}%` });
    }
  } catch (err) {
    // Continue with base score
  }

  return { score, factors };
};

/**
 * Calculate personal growth score
 */
const calculateGrowthScore = () => {
  let score = 50;
  const factors = [];

  try {
    // Check learning habits
    const habits = getTodayHabits();
    const learningHabits = habits.filter(h => h.category === "learning" || h.title.toLowerCase().includes("read"));
    if (learningHabits.length > 0) {
      const completionRate = learningHabits.filter(h => h.completed).length / learningHabits.length;
      score = Math.round(50 + completionRate * 50);
      factors.push({ name: "Learning", value: `${Math.round(completionRate * 100)}%` });
    }

    // Check growth/education goals
    const goals = loadGoals().goals || [];
    const growthGoals = goals.filter(g => g.category === "growth" || g.category === "education");
    if (growthGoals.length > 0) {
      const avgProgress = growthGoals.reduce((sum, g) => sum + (g.progress || 0), 0) / growthGoals.length;
      score = Math.round(score * 0.6 + avgProgress * 100 * 0.4);
      factors.push({ name: "Growth Goals", value: `${Math.round(avgProgress * 100)}%` });
    }

    // Check mindfulness habits
    const mindfulHabits = habits.filter(h => h.category === "mindfulness");
    if (mindfulHabits.length > 0) {
      const completionRate = mindfulHabits.filter(h => h.completed).length / mindfulHabits.length;
      factors.push({ name: "Mindfulness", value: `${Math.round(completionRate * 100)}%` });
    }
  } catch (err) {
    // Continue with base score
  }

  return { score, factors };
};

/**
 * Get comprehensive life dashboard data
 */
export const getLifeDashboard = () => {
  const goalsSummary = getGoalSummary();
  const habitsSummary = getHabitsSummary();
  const reviewStats = getReviewStats();
  const dailyFocus = getDailyFocus();

  // Calculate category scores
  const categories = {
    health: calculateHealthScore(),
    wealth: calculateWealthScore(),
    career: calculateCareerScore(),
    relationships: calculateRelationshipsScore(),
    growth: calculateGrowthScore(),
    habits: {
      score: habitsSummary.completionRate || 0,
      factors: [
        { name: "Today", value: `${habitsSummary.completedToday}/${habitsSummary.totalHabits}` },
        { name: "Avg Streak", value: `${habitsSummary.averageStreak} days` }
      ]
    },
    goals: {
      score: goalsSummary.avgProgress || 0,
      factors: [
        { name: "Active", value: goalsSummary.byStatus?.active || 0 },
        { name: "Completed", value: goalsSummary.byStatus?.completed || 0 }
      ]
    }
  };

  // Calculate overall life score
  let overallScore = 0;
  for (const [key, config] of Object.entries(LIFE_CATEGORIES)) {
    const catData = categories[key];
    overallScore += (catData?.score || 50) * config.weight;
  }
  overallScore = Math.round(overallScore);

  // Get today's stats
  const today = new Date().toISOString().split('T')[0];
  const todayHabits = getTodayHabits();

  // Get top recommendations
  const recommendations = getTopRecommendations(3);

  return {
    overallScore,
    categories,
    today: {
      date: today,
      dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
      habitsCompleted: habitsSummary.completedToday,
      habitsTotal: habitsSummary.totalHabits,
      habitRate: habitsSummary.completionRate
    },
    reviewStatus: {
      isDue: reviewStats.isDue,
      streak: reviewStats.streak,
      lastReview: reviewStats.lastReview
    },
    focus: dailyFocus,
    recommendations: recommendations.map(r => ({
      text: r.text.slice(0, 50) + (r.text.length > 50 ? "..." : ""),
      area: r.area,
      mentor: r.mentor?.name
    })),
    goals: {
      total: goalsSummary.total,
      active: goalsSummary.byStatus?.active || 0,
      avgProgress: goalsSummary.avgProgress,
      topGoals: goalsSummary.topGoals?.slice(0, 3) || []
    },
    alerts: []
  };
};

/**
 * Generate alerts based on dashboard data
 */
export const generateAlerts = (dashboard) => {
  const alerts = [];

  // Review due alert
  if (dashboard.reviewStatus.isDue) {
    alerts.push({
      type: "info",
      message: "Weekly review is due! Use /review start",
      priority: 1
    });
  }

  // Low habit completion
  if (dashboard.today.habitRate < 30 && new Date().getHours() > 18) {
    alerts.push({
      type: "warning",
      message: `Only ${dashboard.today.habitRate}% habits done today`,
      priority: 2
    });
  }

  // Low overall score
  if (dashboard.overallScore < 40) {
    alerts.push({
      type: "attention",
      message: "Life score below 40% - focus on basics",
      priority: 1
    });
  }

  // Category-specific alerts
  for (const [key, config] of Object.entries(LIFE_CATEGORIES)) {
    const catData = dashboard.categories[key];
    if (catData?.score < 30) {
      alerts.push({
        type: "warning",
        message: `${config.name} score low (${catData.score}%)`,
        priority: 3
      });
    }
  }

  return alerts.sort((a, b) => a.priority - b.priority);
};

/**
 * Format dashboard for CLI display
 */
export const formatDashboardDisplay = () => {
  const dashboard = getLifeDashboard();
  const alerts = generateAlerts(dashboard);

  let output = "\n";
  output += "            LIFE DASHBOARD\n";
  output += `            ${dashboard.today.dayOfWeek}, ${new Date().toLocaleDateString()}\n`;
  output += "                                                           \n\n";

  // Overall score with visual bar
  const scoreBar = "█".repeat(Math.floor(dashboard.overallScore / 10)) +
                   "░".repeat(10 - Math.floor(dashboard.overallScore / 10));
  output += `LIFE SCORE: [${scoreBar}] ${dashboard.overallScore}%\n\n`;

  // Today's focus
  if (dashboard.focus?.message) {
    output += `TODAY: ${dashboard.focus.message}\n\n`;
  }

  // Category scores
  output += "LIFE AREAS:\n";
  for (const [key, config] of Object.entries(LIFE_CATEGORIES)) {
    const catData = dashboard.categories[key];
    const score = catData?.score || 50;
    const miniBar = "█".repeat(Math.floor(score / 20)) + "░".repeat(5 - Math.floor(score / 20));
    output += `  ${config.icon} ${config.name.padEnd(14)} [${miniBar}] ${score}%\n`;
  }
  output += "\n";

  // Today's progress
  output += "TODAY'S PROGRESS:\n";
  output += `  Habits: ${dashboard.today.habitsCompleted}/${dashboard.today.habitsTotal} (${dashboard.today.habitRate}%)\n`;

  // Goals overview
  output += `  Goals: ${dashboard.goals.active} active, ${dashboard.goals.avgProgress}% avg progress\n\n`;

  // Alerts
  if (alerts.length > 0) {
    output += "ALERTS:\n";
    alerts.slice(0, 3).forEach(alert => {
      const icon = alert.type === "warning" ? "!" : alert.type === "attention" ? "*" : ">";
      output += `  ${icon} ${alert.message}\n`;
    });
    output += "\n";
  }

  // Top recommendations
  if (dashboard.recommendations.length > 0) {
    output += "TOP RECOMMENDATIONS:\n";
    dashboard.recommendations.forEach((rec, i) => {
      output += `  ${i + 1}. ${rec.text}\n`;
    });
    output += "\n";
  }

  // Review status
  output += `Review Status: ${dashboard.reviewStatus.isDue ? "Due Now" : "Up to date"} | Streak: ${dashboard.reviewStatus.streak} weeks\n`;

  output += "\nCommands: /habits | /goals | /recs | /review | /insights\n";

  return output;
};

/**
 * Get quick dashboard summary (for status bar)
 */
export const getQuickDashboard = () => {
  const dashboard = getLifeDashboard();

  return {
    score: dashboard.overallScore,
    habits: `${dashboard.today.habitsCompleted}/${dashboard.today.habitsTotal}`,
    reviewDue: dashboard.reviewStatus.isDue,
    topAlert: generateAlerts(dashboard)[0]?.message || null
  };
};

export default {
  getLifeDashboard,
  generateAlerts,
  formatDashboardDisplay,
  getQuickDashboard
};
