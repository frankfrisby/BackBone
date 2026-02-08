/**
 * ROI Calculator Service
 *
 * Calculates and projects user trajectory with vs without the system.
 * Shows 6-month projections with compounding improvements.
 *
 * Methodology:
 * - WITHOUT system: Natural entropy (-0.5% per month average degradation)
 * - WITH system: Compound improvements based on category
 * - ROI = (With - Without) over time
 */

import fs from "fs";
import path from "path";
import { getGoalTracker } from "../goals/goal-tracker.js";
import { getProgressResearch } from "../research/progress-research.js";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
const ROI_DATA_PATH = path.join(DATA_DIR, "roi-tracking.json");

// Monthly improvement rates WITH the system (compound)
const MONTHLY_IMPROVEMENT_RATES = {
  finance: 0.025,    // 2.5% monthly improvement (30% annual)
  health: 0.03,      // 3% monthly improvement (36% annual)
  career: 0.02,      // 2% monthly improvement (24% annual)
  family: 0.015,     // 1.5% monthly improvement (18% annual)
  growth: 0.04,      // 4% monthly improvement (48% annual - fastest with AI)
  education: 0.03,   // 3% monthly improvement
  default: 0.02      // Default 2%
};

// Monthly decay rates WITHOUT the system (entropy)
const MONTHLY_DECAY_RATES = {
  finance: -0.005,   // -0.5% monthly (habits slip, overspending)
  health: -0.008,    // -0.8% monthly (health deteriorates without focus)
  career: -0.003,    // -0.3% monthly (stagnation)
  family: -0.004,    // -0.4% monthly (relationships need attention)
  growth: -0.01,     // -1% monthly (skills atrophy)
  education: -0.007, // -0.7% monthly (forgetting)
  default: -0.005
};

/**
 * ROI Calculator
 */
class ROICalculator {
  constructor() {
    this.data = this.loadData();
  }

  /**
   * Load stored ROI data
   */
  loadData() {
    try {
      if (fs.existsSync(ROI_DATA_PATH)) {
        return JSON.parse(fs.readFileSync(ROI_DATA_PATH, "utf-8"));
      }
    } catch (e) {}
    return {
      startDate: null,
      startScores: {},
      monthlySnapshots: [],
      projections: {}
    };
  }

  /**
   * Save ROI data
   */
  saveData() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(ROI_DATA_PATH, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error("[ROICalculator] Failed to save data:", e.message);
    }
  }

  /**
   * Initialize tracking for a user
   */
  initializeTracking(currentScores) {
    if (!this.data.startDate) {
      this.data.startDate = new Date().toISOString();
      this.data.startScores = { ...currentScores };
      this.saveData();
    }
  }

  /**
   * Calculate months since start
   */
  getMonthsSinceStart() {
    if (!this.data.startDate) return 0;
    const start = new Date(this.data.startDate);
    const now = new Date();
    return Math.max(0, (now - start) / (1000 * 60 * 60 * 24 * 30));
  }

  /**
   * Get days using the system
   */
  getDaysUsing() {
    if (!this.data.startDate) return 0;
    const start = new Date(this.data.startDate);
    const now = new Date();
    return Math.max(0, Math.floor((now - start) / (1000 * 60 * 60 * 24)));
  }

  /**
   * Project scores over time
   */
  projectScores(currentScore, category, months = 6) {
    const improvementRate = MONTHLY_IMPROVEMENT_RATES[category] || MONTHLY_IMPROVEMENT_RATES.default;
    const decayRate = MONTHLY_DECAY_RATES[category] || MONTHLY_DECAY_RATES.default;

    const withSystem = [];
    const withoutSystem = [];

    let withScore = currentScore;
    let withoutScore = currentScore;

    for (let m = 0; m <= months; m++) {
      withSystem.push({
        month: m,
        score: Math.min(100, Math.round(withScore * 10) / 10)
      });
      withoutSystem.push({
        month: m,
        score: Math.max(0, Math.round(withoutScore * 10) / 10)
      });

      // Compound for next month
      withScore *= (1 + improvementRate);
      withoutScore *= (1 + decayRate);
    }

    return {
      withSystem,
      withoutSystem,
      finalGain: Math.round((withSystem[months].score - withoutSystem[months].score) * 10) / 10,
      percentageGain: Math.round(((withSystem[months].score / withoutSystem[months].score) - 1) * 100)
    };
  }

  /**
   * Get comprehensive 6-month ROI projection
   */
  get6MonthProjection() {
    const progressResearch = getProgressResearch();
    const comparison = progressResearch.getProgressComparison();
    const currentScore = comparison.user.score || 0;
    const breakdown = comparison.user.breakdown || {};

    // Initialize tracking if not done
    this.initializeTracking({ overall: currentScore, ...breakdown });

    const daysUsing = this.getDaysUsing();
    const monthsUsing = this.getMonthsSinceStart();

    // Calculate category projections
    const categoryProjections = {};
    const goalTracker = getGoalTracker();
    const goals = goalTracker.getActive();

    // Group goals by category
    const goalsByCategory = {};
    for (const goal of goals) {
      const cat = goal.category || "growth";
      if (!goalsByCategory[cat]) goalsByCategory[cat] = [];
      goalsByCategory[cat].push(goal);
    }

    // Get unique categories from goals
    const categories = Object.keys(goalsByCategory);
    if (categories.length === 0) {
      categories.push("growth"); // Default
    }

    // Calculate overall projection
    const overallProjection = this.projectScores(currentScore, "default", 6);

    // Calculate per-category projections
    for (const category of categories) {
      const catGoals = goalsByCategory[category] || [];
      const catScore = this.calculateCategoryScore(catGoals, breakdown);
      categoryProjections[category] = {
        currentScore: catScore,
        goalCount: catGoals.length,
        ...this.projectScores(catScore, category, 6)
      };
    }

    // Calculate monetary ROI if finance goals exist
    let monetaryROI = null;
    if (goalsByCategory.finance) {
      monetaryROI = this.calculateMonetaryROI(comparison, 6);
    }

    // Calculate time saved
    const timeSaved = this.calculateTimeSaved(daysUsing, goals.length);

    return {
      // Current state
      currentScore,
      daysUsing,
      monthsUsing: Math.round(monthsUsing * 10) / 10,

      // 6-month projections
      withSystem: overallProjection.withSystem,
      withoutSystem: overallProjection.withoutSystem,
      projectedGain: overallProjection.finalGain,
      percentageGain: overallProjection.percentageGain,

      // Category breakdown
      categoryProjections,

      // Value metrics
      monetaryROI,
      timeSaved,

      // Summary
      summary: this.generateSummary(overallProjection, daysUsing, monetaryROI, timeSaved)
    };
  }

  /**
   * Calculate category score from goals and breakdown
   */
  calculateCategoryScore(goals, breakdown) {
    if (goals.length === 0) return 50;

    // Average progress across goals
    const avgProgress = goals.reduce((sum, g) => sum + (g.progress || 0), 0) / goals.length;
    return Math.round(avgProgress);
  }

  /**
   * Calculate monetary ROI (for finance goals)
   */
  calculateMonetaryROI(comparison, months) {
    // Base on age benchmarks if available
    const ageBenchmark = comparison.avgPerson?.ageBenchmark;
    if (!ageBenchmark) {
      // Estimate based on typical savings rate improvement
      const monthlySavings = 500; // Assume user could save $500/month more with optimization
      const withOptimization = monthlySavings * months * 1.5; // 50% boost from system
      const withoutOptimization = 0; // No extra savings without focus

      return {
        estimated: true,
        withSystem: withOptimization,
        withoutSystem: withoutOptimization,
        gain: withOptimization,
        formatted: {
          withSystem: `$${withOptimization.toLocaleString()}`,
          gain: `+$${withOptimization.toLocaleString()}`
        }
      };
    }

    // Use age benchmarks for more accurate projection
    const currentNetWorth = comparison.user.netWorth || 50000;
    const medianNetWorth = ageBenchmark.netWorth?.median || 50000;

    // Project growth rate with system (toward median, then beyond)
    const monthlyGrowthWith = 0.03; // 3% monthly with active management
    const monthlyGrowthWithout = 0.005; // 0.5% without

    const withSystem = Math.round(currentNetWorth * Math.pow(1 + monthlyGrowthWith, months));
    const withoutSystem = Math.round(currentNetWorth * Math.pow(1 + monthlyGrowthWithout, months));

    return {
      estimated: false,
      withSystem,
      withoutSystem,
      gain: withSystem - withoutSystem,
      formatted: {
        withSystem: `$${withSystem.toLocaleString()}`,
        withoutSystem: `$${withoutSystem.toLocaleString()}`,
        gain: `+$${(withSystem - withoutSystem).toLocaleString()}`
      }
    };
  }

  /**
   * Calculate time saved
   */
  calculateTimeSaved(daysUsing, goalCount) {
    // Estimate time saved through automation and AI assistance
    // Conservative estimate: 15 min/day per goal from decision assistance
    const minutesPerDayPerGoal = 15;
    const dailySaved = Math.min(goalCount * minutesPerDayPerGoal, 120); // Cap at 2 hours
    const totalSaved = dailySaved * daysUsing;

    return {
      dailyMinutes: dailySaved,
      totalMinutes: totalSaved,
      totalHours: Math.round(totalSaved / 60),
      formatted: totalSaved > 60
        ? `${Math.round(totalSaved / 60)}h saved`
        : `${totalSaved}min saved`
    };
  }

  /**
   * Generate ROI summary text
   */
  generateSummary(projection, daysUsing, monetaryROI, timeSaved) {
    const lines = [];

    if (daysUsing < 7) {
      lines.push("Just getting started - ROI compounds over time.");
    } else if (daysUsing < 30) {
      lines.push(`${daysUsing} days in. Building momentum.`);
    } else {
      lines.push(`${daysUsing} days of optimization.`);
    }

    if (projection.finalGain > 20) {
      lines.push(`Projected +${projection.finalGain}% progress in 6 months.`);
    } else if (projection.finalGain > 10) {
      lines.push(`On track for +${projection.finalGain}% gains.`);
    } else {
      lines.push("Steady progress being made.");
    }

    if (monetaryROI && monetaryROI.gain > 1000) {
      lines.push(`Potential ${monetaryROI.formatted.gain} in savings/growth.`);
    }

    if (timeSaved.totalHours > 10) {
      lines.push(`${timeSaved.totalHours}+ hours reclaimed for what matters.`);
    }

    return lines.join(" ");
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const projection = this.get6MonthProjection();

    return {
      // Header stats
      daysUsing: projection.daysUsing,
      currentScore: projection.currentScore,
      projectedScore: projection.withSystem[6]?.score || 0,
      projectedGain: projection.projectedGain,

      // Chart data
      withSystemLine: projection.withSystem,
      withoutSystemLine: projection.withoutSystem,

      // Value metrics
      monetaryGain: projection.monetaryROI?.formatted?.gain || null,
      timeSaved: projection.timeSaved?.formatted || null,

      // Summary
      summary: projection.summary,

      // Colors
      gainColor: projection.projectedGain > 0 ? "#22c55e" : "#ef4444",
      withSystemColor: "#22c55e",
      withoutSystemColor: "#ef4444"
    };
  }

  /**
   * Record monthly snapshot (call periodically)
   */
  recordSnapshot(currentScore) {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const existingIndex = this.data.monthlySnapshots.findIndex(s => s.monthKey === monthKey);
    if (existingIndex >= 0) {
      this.data.monthlySnapshots[existingIndex].score = currentScore;
    } else {
      this.data.monthlySnapshots.push({
        monthKey,
        score: currentScore,
        timestamp: now.toISOString()
      });
    }

    // Keep last 12 months
    if (this.data.monthlySnapshots.length > 12) {
      this.data.monthlySnapshots = this.data.monthlySnapshots.slice(-12);
    }

    this.saveData();
  }
}

// Singleton instance
let instance = null;

export const getROICalculator = () => {
  if (!instance) {
    instance = new ROICalculator();
  }
  return instance;
};

export const get6MonthROI = () => {
  return getROICalculator().get6MonthProjection();
};

export const getROIDisplayData = () => {
  return getROICalculator().getDisplayData();
};

export default ROICalculator;
