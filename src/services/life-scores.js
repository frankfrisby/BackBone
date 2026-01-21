import { EventEmitter } from "events";
import fs from "fs";
import path from "path";

/**
 * Life Scores Service for BACKBONE
 * Calculates overall achievement scores for each area of life
 */

const DATA_DIR = path.join(process.cwd(), "data");
const SCORES_PATH = path.join(DATA_DIR, "life-scores.json");

// Life categories
export const LIFE_CATEGORIES = {
  FINANCE: "finance",
  HEALTH: "health",
  FAMILY: "family",
  CAREER: "career",
  GROWTH: "growth",
  EDUCATION: "education"
};

// Score weights for overall calculation
const CATEGORY_WEIGHTS = {
  [LIFE_CATEGORIES.FINANCE]: 0.25,
  [LIFE_CATEGORIES.HEALTH]: 0.25,
  [LIFE_CATEGORIES.FAMILY]: 0.20,
  [LIFE_CATEGORIES.CAREER]: 0.15,
  [LIFE_CATEGORIES.GROWTH]: 0.10,
  [LIFE_CATEGORIES.EDUCATION]: 0.05
};

// Category colors
export const CATEGORY_COLORS = {
  [LIFE_CATEGORIES.FINANCE]: "#eab308",
  [LIFE_CATEGORIES.HEALTH]: "#22c55e",
  [LIFE_CATEGORIES.FAMILY]: "#ec4899",
  [LIFE_CATEGORIES.CAREER]: "#8b5cf6",
  [LIFE_CATEGORIES.GROWTH]: "#3b82f6",
  [LIFE_CATEGORIES.EDUCATION]: "#06b6d4"
};

// Category icons
export const CATEGORY_ICONS = {
  [LIFE_CATEGORIES.FINANCE]: "$",
  [LIFE_CATEGORIES.HEALTH]: "\u2665",
  [LIFE_CATEGORIES.FAMILY]: "\u263A",
  [LIFE_CATEGORIES.CAREER]: "\u2605",
  [LIFE_CATEGORIES.GROWTH]: "\u2191",
  [LIFE_CATEGORIES.EDUCATION]: "\u2302"
};

/**
 * Get default scores structure
 */
const getDefaultScores = () => ({
  overall: 0,
  categories: {
    [LIFE_CATEGORIES.FINANCE]: { score: 0, trend: "stable", lastUpdated: null },
    [LIFE_CATEGORIES.HEALTH]: { score: 0, trend: "stable", lastUpdated: null },
    [LIFE_CATEGORIES.FAMILY]: { score: 0, trend: "stable", lastUpdated: null },
    [LIFE_CATEGORIES.CAREER]: { score: 0, trend: "stable", lastUpdated: null },
    [LIFE_CATEGORIES.GROWTH]: { score: 0, trend: "stable", lastUpdated: null },
    [LIFE_CATEGORIES.EDUCATION]: { score: 0, trend: "stable", lastUpdated: null }
  },
  history: [],
  lastUpdated: null
});

/**
 * Life Scores Service Class
 */
export class LifeScores extends EventEmitter {
  constructor() {
    super();
    this.scores = getDefaultScores();
    this.load();
  }

  /**
   * Load scores from disk
   */
  load() {
    try {
      if (fs.existsSync(SCORES_PATH)) {
        const data = JSON.parse(fs.readFileSync(SCORES_PATH, "utf-8"));
        this.scores = { ...getDefaultScores(), ...data };
      }
    } catch (error) {
      console.error("Failed to load life scores:", error.message);
    }
  }

  /**
   * Save scores to disk
   */
  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(SCORES_PATH, JSON.stringify(this.scores, null, 2));
    } catch (error) {
      console.error("Failed to save life scores:", error.message);
    }
  }

  /**
   * Update category score
   */
  updateCategoryScore(category, score, data = {}) {
    if (!this.scores.categories[category]) return;

    const oldScore = this.scores.categories[category].score;
    const newScore = Math.max(0, Math.min(100, score));

    // Determine trend
    let trend = "stable";
    if (newScore > oldScore + 2) trend = "up";
    else if (newScore < oldScore - 2) trend = "down";

    this.scores.categories[category] = {
      score: newScore,
      trend,
      lastUpdated: new Date().toISOString(),
      ...data
    };

    this.recalculateOverall();
    this.save();

    this.emit("score-updated", { category, oldScore, newScore, trend });
  }

  /**
   * Recalculate overall score
   */
  recalculateOverall() {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [category, weight] of Object.entries(CATEGORY_WEIGHTS)) {
      const categoryData = this.scores.categories[category];
      if (categoryData && categoryData.score > 0) {
        weightedSum += categoryData.score * weight;
        totalWeight += weight;
      }
    }

    const oldOverall = this.scores.overall;
    this.scores.overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    this.scores.lastUpdated = new Date().toISOString();

    // Add to history
    this.scores.history.unshift({
      timestamp: new Date().toISOString(),
      overall: this.scores.overall,
      categories: { ...this.scores.categories }
    });
    this.scores.history = this.scores.history.slice(0, 100);

    if (this.scores.overall !== oldOverall) {
      this.emit("overall-changed", { oldScore: oldOverall, newScore: this.scores.overall });
    }
  }

  /**
   * Calculate finance score from portfolio data
   */
  calculateFinanceScore(portfolio, goals) {
    if (!portfolio) return 0;

    let score = 0;

    // Base score from having a portfolio
    score += 20;

    // Progress toward wealth goal
    const wealthGoal = goals?.find(g => g.category === LIFE_CATEGORIES.FINANCE);
    if (wealthGoal) {
      const progress = (portfolio.equity - wealthGoal.startValue) /
                       (wealthGoal.targetValue - wealthGoal.startValue);
      score += Math.min(40, progress * 40);
    }

    // Positive P/L bonus
    if (portfolio.dayPL > 0) score += 10;
    if (portfolio.totalPL > 0) score += 20;

    // Diversification bonus (number of positions)
    if (portfolio.positions?.length >= 3) score += 5;
    if (portfolio.positions?.length >= 5) score += 5;

    return Math.min(100, Math.round(score));
  }

  /**
   * Calculate health score from Oura data
   */
  calculateHealthScore(ouraData) {
    if (!ouraData) return 0;

    let score = 0;

    // Sleep score contribution
    if (ouraData.sleep?.score) {
      score += ouraData.sleep.score * 0.4;
    }

    // Readiness score contribution
    if (ouraData.readiness?.score) {
      score += ouraData.readiness.score * 0.3;
    }

    // Activity score contribution
    if (ouraData.activity?.score) {
      score += ouraData.activity.score * 0.3;
    }

    return Math.round(score);
  }

  /**
   * Calculate family score (manual/estimated)
   */
  calculateFamilyScore(familyData = {}) {
    let score = 50; // Base score

    // Hours spent with family
    if (familyData.weeklyHours) {
      score = Math.min(100, familyData.weeklyHours * 5);
    }

    // Activities planned
    if (familyData.activitiesThisMonth) {
      score += familyData.activitiesThisMonth * 5;
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Calculate career score from LinkedIn and work data
   */
  calculateCareerScore(linkedinData, workData = {}) {
    let score = 0;

    // LinkedIn profile completeness
    if (linkedinData) {
      score += 30;
      if (linkedinData.headline) score += 10;
      if (linkedinData.experience?.length > 0) score += 10;
      if (linkedinData.skills?.length >= 5) score += 10;
      if (linkedinData.connections >= 100) score += 10;
      if (linkedinData.connections >= 500) score += 10;
    }

    // Work productivity
    if (workData.tasksCompleted) {
      score += Math.min(20, workData.tasksCompleted * 2);
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Sync all scores from data sources
   */
  syncAllScores(data = {}) {
    const { portfolio, goals, oura, linkedin, family, work, education, growth } = data;

    // Finance
    if (portfolio) {
      const financeScore = this.calculateFinanceScore(portfolio, goals);
      this.updateCategoryScore(LIFE_CATEGORIES.FINANCE, financeScore, {
        equity: portfolio.equity,
        dayPL: portfolio.dayPL
      });
    }

    // Health
    if (oura) {
      const healthScore = this.calculateHealthScore(oura);
      this.updateCategoryScore(LIFE_CATEGORIES.HEALTH, healthScore, {
        sleepScore: oura.sleep?.score,
        readinessScore: oura.readiness?.score
      });
    }

    // Family
    if (family) {
      const familyScore = this.calculateFamilyScore(family);
      this.updateCategoryScore(LIFE_CATEGORIES.FAMILY, familyScore);
    }

    // Career
    if (linkedin) {
      const careerScore = this.calculateCareerScore(linkedin, work);
      this.updateCategoryScore(LIFE_CATEGORIES.CAREER, careerScore, {
        connections: linkedin.connections
      });
    }

    // Education
    if (education) {
      this.updateCategoryScore(LIFE_CATEGORIES.EDUCATION, education.score || 50);
    }

    // Growth
    if (growth) {
      this.updateCategoryScore(LIFE_CATEGORIES.GROWTH, growth.score || 50);
    }

    return this.getDisplayData();
  }

  /**
   * Get display data for UI
   * Only returns categories with actual data (score > 0 and lastUpdated not null)
   */
  getDisplayData() {
    const categories = Object.entries(this.scores.categories)
      .filter(([category, data]) => data.score > 0 && data.lastUpdated !== null)
      .map(([category, data]) => ({
        category,
        name: category.charAt(0).toUpperCase() + category.slice(1),
        score: data.score,
        trend: data.trend,
        color: CATEGORY_COLORS[category],
        icon: CATEGORY_ICONS[category],
        weight: CATEGORY_WEIGHTS[category],
        lastUpdated: data.lastUpdated
      }));

    // Sort by weight (importance)
    categories.sort((a, b) => b.weight - a.weight);

    // Only calculate overall from categories with actual data
    const hasData = categories.length > 0;

    return {
      overall: hasData ? this.scores.overall : 0,
      overallGrade: hasData ? this.getGrade(this.scores.overall) : "--",
      categories,
      lastUpdated: this.scores.lastUpdated,
      trend: hasData ? this.getOverallTrend() : "stable"
    };
  }

  /**
   * Get letter grade from score
   */
  getGrade(score) {
    if (score >= 90) return "A+";
    if (score >= 85) return "A";
    if (score >= 80) return "A-";
    if (score >= 75) return "B+";
    if (score >= 70) return "B";
    if (score >= 65) return "B-";
    if (score >= 60) return "C+";
    if (score >= 55) return "C";
    if (score >= 50) return "C-";
    if (score >= 45) return "D+";
    if (score >= 40) return "D";
    return "F";
  }

  /**
   * Get overall trend from history
   */
  getOverallTrend() {
    if (this.scores.history.length < 2) return "stable";

    const recent = this.scores.history.slice(0, 5);
    const avgRecent = recent.reduce((sum, h) => sum + h.overall, 0) / recent.length;

    const older = this.scores.history.slice(5, 10);
    if (older.length === 0) return "stable";

    const avgOlder = older.reduce((sum, h) => sum + h.overall, 0) / older.length;

    if (avgRecent > avgOlder + 2) return "up";
    if (avgRecent < avgOlder - 2) return "down";
    return "stable";
  }

  /**
   * Get category details
   */
  getCategoryDetails(category) {
    const data = this.scores.categories[category];
    if (!data) return null;

    return {
      category,
      name: category.charAt(0).toUpperCase() + category.slice(1),
      score: data.score,
      grade: this.getGrade(data.score),
      trend: data.trend,
      color: CATEGORY_COLORS[category],
      icon: CATEGORY_ICONS[category],
      weight: CATEGORY_WEIGHTS[category],
      contribution: Math.round(data.score * CATEGORY_WEIGHTS[category]),
      lastUpdated: data.lastUpdated,
      ...data
    };
  }

  /**
   * Get score history for charting
   */
  getHistory(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.scores.history.filter(h =>
      new Date(h.timestamp) > cutoff
    );
  }

  /**
   * Reset all scores
   */
  reset() {
    this.scores = getDefaultScores();
    this.save();
    this.emit("reset");
  }
}

// Singleton instance
let scoresInstance = null;

export const getLifeScores = () => {
  if (!scoresInstance) {
    scoresInstance = new LifeScores();
  }
  return scoresInstance;
};

export default LifeScores;
