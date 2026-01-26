/**
 * Progress Research Service
 *
 * Provides empirically-based progress metrics:
 * - User's actual goal progress from stored data
 * - Research-backed "average person" benchmarks (age-specific)
 * - Public figure achievements based on user's goals
 * - Comparison against top 90% (90th percentile)
 */

import fs from "fs";
import path from "path";
import { getGoalTracker, GOAL_CATEGORY } from "./goal-tracker.js";
import { isOuraConfigured, loadOuraData } from "./oura-service.js";
import { loadAlpacaConfig } from "./alpaca-setup.js";
import { isPlaidConfigured } from "./plaid-service.js";
import { isSignedIn } from "./firebase-auth.js";
import { getUserAge, getAgeBenchmarks, getSimpleBenchmark } from "./age-benchmarks.js";
import {
  getTargetPerson,
  getTargetPersonWithAI,
  findBestMatch,
  initializeAIMatching,
  isAIMatchingInitialized
} from "./person-matcher.js";

const DATA_DIR = path.join(process.cwd(), "data");
const RESEARCH_CACHE_PATH = path.join(DATA_DIR, "progress_research.json");

/**
 * Empirical benchmarks for "average person" goal achievement
 * Sources: Various studies on goal completion rates
 *
 * Key findings:
 * - Only 8% of people achieve their New Year's resolutions (U. of Scranton)
 * - 92% of goals are never achieved (various studies)
 * - Average savings rate in US: 4.6% of income
 * - Median net worth by age 35: ~$35,000
 * - Only 23% of adults meet physical activity guidelines (CDC)
 */
const EMPIRICAL_BENCHMARKS = {
  // Goal completion rates (what % of people actually achieve goals)
  goalCompletionRate: 0.08, // 8% achieve their goals

  // Finance benchmarks (US median data)
  finance: {
    // Median net worth by age (Federal Reserve SCF 2022)
    netWorthByAge: {
      under35: 39000,
      "35-44": 135600,
      "45-54": 247200,
      "55-64": 364500,
      "65-74": 409900
    },
    // Savings rate
    avgSavingsRate: 0.046, // 4.6%
    // % who have $1M+ net worth
    millionaireRate: 0.088, // 8.8% of US households
    // % on track for retirement
    retirementReady: 0.12, // Only 12% are on track

    // Score: Average person is at ~20% of optimal financial health
    avgScore: 20
  },

  // Health benchmarks (CDC, WHO data)
  health: {
    // % meeting physical activity guidelines
    meetsActivityGuidelines: 0.23,
    // % getting recommended sleep (7+ hours)
    adequateSleep: 0.35,
    // % at healthy weight
    healthyWeight: 0.26,
    // % who exercise regularly
    regularExercise: 0.20,

    // Score: Average person is at ~25% of optimal health
    avgScore: 25
  },

  // Career benchmarks
  career: {
    // % satisfied with career
    careerSatisfaction: 0.49,
    // % who feel they're reaching potential
    reachingPotential: 0.20,
    // % with clear career goals
    hasCareerGoals: 0.35,

    // Score: Average person is at ~30% of career potential
    avgScore: 30
  },

  // Education/Growth benchmarks
  education: {
    // % who read regularly (1+ books/month)
    regularReaders: 0.25,
    // % pursuing continuous learning
    continuousLearners: 0.15,
    // % with advanced degrees
    advancedDegrees: 0.13,

    // Score: Average person is at ~25% of growth potential
    avgScore: 25
  },

  // Family benchmarks
  family: {
    // % who rate family relationships as excellent
    excellentRelationships: 0.32,
    // Avg quality time with family per week
    avgQualityTimeHours: 5,
    // % who feel work-life balance is good
    goodWorkLifeBalance: 0.38,

    // Score: Average person is at ~35% of family goal potential
    avgScore: 35
  },

  // Overall average across all categories
  overallAvgScore: 27 // Weighted average
};

/**
 * Public figures database with verified achievements
 * Scores are based on objective metrics in their primary field
 */
const PUBLIC_FIGURES = {
  finance: [
    {
      name: "Warren Buffett",
      score: 99,
      netWorth: 130000000000, // $130B
      achievements: [
        "Built Berkshire from $11.50/share to $500K+",
        "Avg 20% annual returns over 57 years",
        "Pledged 99% of wealth to charity"
      ],
      metric: "Compounded wealth at 20%+ for 57 years",
      source: "Forbes, Berkshire Annual Reports"
    },
    {
      name: "Ray Dalio",
      score: 95,
      netWorth: 19000000000,
      achievements: [
        "Built world's largest hedge fund",
        "Pioneered risk parity investing"
      ],
      metric: "Bridgewater manages $150B+",
      source: "Forbes, Bridgewater"
    },
    {
      name: "Peter Lynch",
      score: 94,
      achievements: [
        "29% avg annual return at Fidelity Magellan",
        "Grew fund from $20M to $14B"
      ],
      metric: "Best performing mutual fund manager 1977-1990",
      source: "Fidelity Historical Records"
    }
  ],

  health: [
    {
      name: "David Goggins",
      score: 98,
      achievements: [
        "Navy SEAL, Army Ranger, Air Force TACP",
        "Multiple ultra-marathon records",
        "Lost 100+ lbs in 3 months for SEAL training"
      ],
      metric: "Completed 60+ ultra-marathons, triathlons",
      source: "Verified race records"
    },
    {
      name: "Rich Roll",
      score: 92,
      achievements: [
        "Transformed health at age 40",
        "Completed 5 Ironmans in 7 days",
        "Plant-based endurance athlete"
      ],
      metric: "Epic5 Challenge completion",
      source: "Race records, Rich Roll Podcast"
    },
    {
      name: "Laird Hamilton",
      score: 90,
      achievements: [
        "Big wave surfing pioneer",
        "Still performing at elite level at 59"
      ],
      metric: "Pioneered tow-in surfing, rode 100ft waves",
      source: "Surfing records"
    }
  ],

  career: [
    {
      name: "Satya Nadella",
      score: 96,
      achievements: [
        "Grew Microsoft market cap from $300B to $3T",
        "Transformed company culture",
        "Led cloud computing dominance"
      ],
      metric: "10x market cap growth as CEO",
      source: "Microsoft financials"
    },
    {
      name: "Jensen Huang",
      score: 97,
      achievements: [
        "Founded NVIDIA, now worth $2T+",
        "Pioneered GPU computing and AI hardware"
      ],
      metric: "Built company from startup to AI leader",
      source: "NVIDIA financials"
    }
  ],

  education: [
    {
      name: "Neil deGrasse Tyson",
      score: 90,
      achievements: [
        "Director of Hayden Planetarium",
        "Made astrophysics accessible to millions",
        "Published 15+ books"
      ],
      metric: "Most followed scientist on social media",
      source: "Public records"
    },
    {
      name: "Sal Khan",
      score: 92,
      achievements: [
        "Built Khan Academy serving 150M+ students",
        "Free education platform globally"
      ],
      metric: "Democratized education worldwide",
      source: "Khan Academy statistics"
    }
  ],

  family: [
    {
      name: "Michelle Obama",
      score: 88,
      achievements: [
        "Maintained strong family amid public life",
        "Raised two daughters in White House",
        "Advocate for family values"
      ],
      metric: "Balanced career with family in highest-pressure environment",
      source: "Public records"
    }
  ],

  growth: [
    {
      name: "Elon Musk",
      score: 97,
      achievements: [
        "Built Tesla, SpaceX, Neuralink, Boring Co",
        "First private company to send humans to space",
        "Revolutionized multiple industries"
      ],
      metric: "Serial company builder across industries",
      source: "Company records"
    },
    {
      name: "Sam Altman",
      score: 93,
      achievements: [
        "Y Combinator president at 28",
        "CEO of OpenAI, launched ChatGPT",
        "Shaping AI industry"
      ],
      metric: "Leading AI revolution",
      source: "Public records"
    }
  ]
};

/**
 * Progress Research Service
 */
class ProgressResearchService {
  constructor() {
    this.cache = this.loadCache();
  }

  loadCache() {
    try {
      if (fs.existsSync(RESEARCH_CACHE_PATH)) {
        return JSON.parse(fs.readFileSync(RESEARCH_CACHE_PATH, "utf-8"));
      }
    } catch (e) {}
    return { userProgress: {}, lastUpdated: null, progressHistory: [] };
  }

  saveCache() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      this.cache.lastUpdated = new Date().toISOString();
      fs.writeFileSync(RESEARCH_CACHE_PATH, JSON.stringify(this.cache, null, 2));
    } catch (e) {
      console.error("Failed to save progress research cache:", e.message);
    }
  }

  /**
   * Record current progress to history (called periodically)
   * Tracks score over time to detect trends
   */
  recordProgressSnapshot(score) {
    if (!this.cache.progressHistory) {
      this.cache.progressHistory = [];
    }

    const now = new Date();
    const dateKey = now.toISOString().split("T")[0]; // YYYY-MM-DD

    // Only record once per day
    const existingToday = this.cache.progressHistory.find(h => h.date === dateKey);
    if (existingToday) {
      existingToday.score = score;
      existingToday.timestamp = now.toISOString();
    } else {
      this.cache.progressHistory.push({
        date: dateKey,
        score,
        timestamp: now.toISOString()
      });
    }

    // Keep last 90 days of history
    if (this.cache.progressHistory.length > 90) {
      this.cache.progressHistory = this.cache.progressHistory.slice(-90);
    }

    this.saveCache();
  }

  /**
   * Get progress trend based on history
   * Returns: "up", "down", or "stable" with change amount
   */
  getProgressTrend() {
    const history = this.cache.progressHistory || [];
    if (history.length < 2) {
      return { trend: "stable", change: 0, previousScore: null };
    }

    // Compare to yesterday (or most recent previous)
    const sortedHistory = [...history].sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    const current = sortedHistory[0];
    const previous = sortedHistory[1];

    if (!current || !previous) {
      return { trend: "stable", change: 0, previousScore: null };
    }

    const change = current.score - previous.score;

    // Only show trend if change is meaningful (at least 0.5%)
    if (Math.abs(change) < 0.5) {
      return { trend: "stable", change: 0, previousScore: previous.score };
    }

    return {
      trend: change > 0 ? "up" : "down",
      change: Math.round(change * 10) / 10,
      previousScore: previous.score
    };
  }

  /**
   * Get progress history for charts/analysis
   */
  getProgressHistory(days = 30) {
    const history = this.cache.progressHistory || [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return history
      .filter(h => new Date(h.timestamp) >= cutoff)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  /**
   * Calculate user's real progress based on their goals and connected data
   * @param {Object} connectedData - Optional data from connected services
   */
  calculateUserProgress(connectedData = {}) {
    const goalTracker = getGoalTracker();
    const goals = goalTracker.getActive();

    const breakdown = {};
    let totalWeight = 0;
    let weightedSum = 0;

    // Weight by category
    const weights = {
      [GOAL_CATEGORY.FINANCE]: 1.0,
      [GOAL_CATEGORY.HEALTH]: 1.0,
      [GOAL_CATEGORY.CAREER]: 1.0,
      [GOAL_CATEGORY.FAMILY]: 1.0,
      [GOAL_CATEGORY.GROWTH]: 0.9,
      [GOAL_CATEGORY.EDUCATION]: 0.9
    };

    // If explicit goals exist, use them
    if (goals.length > 0) {
      for (const goal of goals) {
        const progress = goalTracker.calculateProgress(goal);
        const weight = weights[goal.category] || 1.0;

        if (!breakdown[goal.category]) {
          breakdown[goal.category] = {
            goals: [],
            avgProgress: 0,
            weight
          };
        }

        breakdown[goal.category].goals.push({
          title: goal.title,
          progress: Math.round(progress * 100),
          current: goal.currentValue,
          target: goal.targetValue,
          unit: goal.unit
        });

        weightedSum += progress * weight;
        totalWeight += weight;
      }

      // Calculate category averages
      for (const cat of Object.keys(breakdown)) {
        const catGoals = breakdown[cat].goals;
        breakdown[cat].avgProgress = Math.round(
          catGoals.reduce((sum, g) => sum + g.progress, 0) / catGoals.length
        );
      }
    }

    // Factor in connected data sources even without explicit goals
    // This gives users a baseline score based on what we know about them
    const { ouraHealth, portfolio, linkedInProfile } = connectedData;

    // Health data (Oura) - good health scores contribute to progress
    if (ouraHealth?.connected && ouraHealth?.today) {
      const healthScore = ouraHealth.today.readinessScore || ouraHealth.today.sleepScore || 0;
      if (healthScore > 0) {
        const healthProgress = healthScore / 100; // Oura scores are 0-100
        if (!breakdown[GOAL_CATEGORY.HEALTH]) {
          breakdown[GOAL_CATEGORY.HEALTH] = { inferred: true, avgProgress: Math.round(healthProgress * 100) };
        }
        weightedSum += healthProgress * 0.5; // Lower weight for inferred data
        totalWeight += 0.5;
      }
    }

    // Financial data (Portfolio) - positive returns contribute to progress
    if (portfolio?.connected && portfolio?.equity) {
      // Estimate progress based on portfolio performance
      const dayChangePct = portfolio.dayChangePct || 0;
      // Normalize: +10% day = great (1.0), 0% = neutral (0.5), -10% = poor (0)
      const financialProgress = Math.max(0, Math.min(1, 0.5 + (dayChangePct / 20)));
      if (!breakdown[GOAL_CATEGORY.FINANCE]) {
        breakdown[GOAL_CATEGORY.FINANCE] = { inferred: true, avgProgress: Math.round(financialProgress * 100) };
      }
      weightedSum += financialProgress * 0.5;
      totalWeight += 0.5;
    }

    // Career data (LinkedIn) - having a profile contributes baseline progress
    if (linkedInProfile?.connected) {
      const careerProgress = 0.4; // 40% baseline for having career data
      if (!breakdown[GOAL_CATEGORY.CAREER]) {
        breakdown[GOAL_CATEGORY.CAREER] = { inferred: true, avgProgress: 40 };
      }
      weightedSum += careerProgress * 0.3;
      totalWeight += 0.3;
    }

    // Plaid banking data - having connected accounts shows financial awareness
    if (connectedData.plaid?.connected) {
      const plaidProgress = 0.35; // 35% for having banking connected
      if (!breakdown[GOAL_CATEGORY.FINANCE]) {
        breakdown[GOAL_CATEGORY.FINANCE] = { inferred: true, avgProgress: 35 };
      }
      weightedSum += plaidProgress * 0.4;
      totalWeight += 0.4;
    }

    // Firebase login - baseline for being engaged with the system
    if (connectedData.firebase?.connected) {
      // Being logged in and using the system = 30% baseline engagement
      const engagementProgress = 0.30;
      if (!breakdown.engagement) {
        breakdown.engagement = { inferred: true, avgProgress: 30 };
      }
      weightedSum += engagementProgress * 0.2;
      totalWeight += 0.2;
    }

    // No data at all - but still return hasData true if we have connected sources
    const hasConnectedData = ouraHealth?.connected || portfolio?.connected ||
                             linkedInProfile?.connected || connectedData.plaid?.connected ||
                             connectedData.firebase?.connected;

    if (totalWeight === 0 && !hasConnectedData) {
      return { score: 0, hasGoals: false, hasData: false, breakdown: {} };
    }

    const overallScore = totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 100)
      : 0;

    return {
      score: overallScore,
      hasGoals: goals.length > 0,
      hasData: hasConnectedData || goals.length > 0,
      breakdown,
      goalCount: goals.length
    };
  }

  /**
   * Get average person benchmark for comparison
   */
  getAveragePersonBenchmark(primaryCategory = null) {
    if (primaryCategory && EMPIRICAL_BENCHMARKS[primaryCategory]) {
      return {
        score: EMPIRICAL_BENCHMARKS[primaryCategory].avgScore,
        category: primaryCategory,
        details: EMPIRICAL_BENCHMARKS[primaryCategory],
        source: "US Census, CDC, Federal Reserve data"
      };
    }

    return {
      score: EMPIRICAL_BENCHMARKS.overallAvgScore,
      category: "overall",
      details: {
        goalCompletionRate: EMPIRICAL_BENCHMARKS.goalCompletionRate,
        note: "Only 8% of people achieve their stated goals"
      },
      source: "University of Scranton, various studies"
    };
  }

  /**
   * Get relevant public figure based on user's primary goal category
   */
  getAspirationFigure(primaryCategory = "finance") {
    const figures = PUBLIC_FIGURES[primaryCategory] || PUBLIC_FIGURES.finance;

    // Return the top figure for that category
    const topFigure = figures[0];

    return {
      name: topFigure.name,
      score: topFigure.score,
      achievements: topFigure.achievements,
      metric: topFigure.metric,
      source: topFigure.source,
      category: primaryCategory
    };
  }

  /**
   * Gather connected data from all services
   */
  gatherConnectedData() {
    const connectedData = {};

    // Check Oura health data
    try {
      if (isOuraConfigured()) {
        const ouraData = loadOuraData();
        if (ouraData?.today) {
          connectedData.ouraHealth = {
            connected: true,
            today: ouraData.today
          };
        }
      }
    } catch (e) {}

    // Check Alpaca portfolio
    try {
      const alpacaConfig = loadAlpacaConfig();
      if (alpacaConfig?.apiKey && !alpacaConfig.apiKey.includes("PASTE")) {
        connectedData.portfolio = { connected: true };
      }
    } catch (e) {}

    // Check Plaid banking
    try {
      if (isPlaidConfigured()) {
        connectedData.plaid = { connected: true };
      }
    } catch (e) {}

    // Check Firebase login
    try {
      if (isSignedIn()) {
        connectedData.firebase = { connected: true };
      }
    } catch (e) {}

    return connectedData;
  }

  /**
   * Get complete progress comparison data
   * Now includes age-based benchmarks and improved person matching
   */
  getProgressComparison() {
    // Gather connected data from services
    const connectedData = this.gatherConnectedData();
    const userProgress = this.calculateUserProgress(connectedData);
    const goalTracker = getGoalTracker();
    const goals = goalTracker.getActive();

    // Determine primary category from user's goals
    const primaryCategory = goals.length > 0
      ? goals.sort((a, b) => a.priority - b.priority)[0].category
      : "finance";

    // Get age-based benchmarks (uses new age-benchmarks service)
    const userAge = getUserAge();
    const ageBenchmarks = userAge ? getAgeBenchmarks(userAge) : null;
    const simpleBenchmark = getSimpleBenchmark(primaryCategory, userAge);

    // Get target person from improved person matcher (ONE domain focus)
    let targetPerson;
    try {
      targetPerson = getTargetPerson(connectedData);
    } catch (e) {
      // Fallback to old method
      targetPerson = this.getAspirationFigure(primaryCategory);
    }

    // Use age-based benchmark score if available, otherwise use category benchmark
    const avgPerson = this.getAveragePersonBenchmark(primaryCategory);

    // Record progress snapshot for trend tracking
    if (userProgress.score > 0) {
      this.recordProgressSnapshot(userProgress.score);
    }

    // Get trend data
    const trendData = this.getProgressTrend();

    return {
      user: {
        score: userProgress.score,
        hasGoals: userProgress.hasGoals,
        breakdown: userProgress.breakdown,
        goalCount: userProgress.goalCount,
        age: userAge,
        trend: trendData.trend,
        trendChange: trendData.change,
        previousScore: trendData.previousScore
      },
      avgPerson: {
        score: avgPerson.score,
        source: avgPerson.source,
        note: `Only ${Math.round(EMPIRICAL_BENCHMARKS.goalCompletionRate * 100)}% of people achieve their goals`,
        // Age-specific benchmarks
        ageBenchmark: ageBenchmarks?.available ? {
          netWorth: ageBenchmarks.netWorth,
          income: ageBenchmarks.income,
          investments: ageBenchmarks.investments,
          health: ageBenchmarks.health
        } : null
      },
      top10Percent: ageBenchmarks?.available ? {
        netWorth: ageBenchmarks.netWorth.formatted.top10Percent,
        income: ageBenchmarks.income.formatted.top10Percent,
        investments: ageBenchmarks.investments.formatted.top10Percent,
        label: `Top 10% at age ${userAge}`
      } : null,
      aspiration: {
        name: targetPerson.name,
        score: targetPerson.score,
        metric: targetPerson.metric,
        achievements: targetPerson.achievements,
        domain: targetPerson.domain,
        matchReason: targetPerson.matchReason,
        why_relatable: targetPerson.why_relatable,
        why_aspirational: targetPerson.why_aspirational
      },
      simpleBenchmark,
      analysis: this.generateAnalysis(userProgress.score, avgPerson.score, targetPerson.score)
    };
  }

  /**
   * Generate analysis text
   */
  generateAnalysis(userScore, avgScore, aspirationScore) {
    const vsAvg = userScore - avgScore;
    const vsAspiration = aspirationScore - userScore;

    if (userScore === 0) {
      return "Set goals and track progress to see your score.";
    }

    if (vsAvg > 20) {
      return `You're ${vsAvg}% ahead of average. Top 10% territory.`;
    } else if (vsAvg > 0) {
      return `You're ${vsAvg}% above average. Keep building momentum.`;
    } else if (vsAvg > -10) {
      return `Close to average. Small consistent actions compound.`;
    } else {
      return `${Math.abs(vsAvg)}% to reach average. Focus on one goal at a time.`;
    }
  }

  /**
   * Get progress comparison with AI-powered target person matching
   * Use this for the best possible role model selection
   */
  async getProgressComparisonWithAI() {
    const connectedData = this.gatherConnectedData();
    const userProgress = this.calculateUserProgress(connectedData);
    const goalTracker = getGoalTracker();
    const goals = goalTracker.getActive();

    const primaryCategory = goals.length > 0
      ? goals.sort((a, b) => a.priority - b.priority)[0].category
      : "finance";

    const userAge = getUserAge();
    const ageBenchmarks = userAge ? getAgeBenchmarks(userAge) : null;
    const simpleBenchmark = getSimpleBenchmark(primaryCategory, userAge);

    // Use AI to find the best target person
    let targetPerson;
    try {
      targetPerson = await getTargetPersonWithAI(connectedData);
    } catch (e) {
      console.error("[ProgressResearch] AI matching failed, using algorithm:", e.message);
      targetPerson = getTargetPerson(connectedData);
    }

    const avgPerson = this.getAveragePersonBenchmark(primaryCategory);

    return {
      user: {
        score: userProgress.score,
        hasGoals: userProgress.hasGoals,
        breakdown: userProgress.breakdown,
        goalCount: userProgress.goalCount,
        age: userAge
      },
      avgPerson: {
        score: avgPerson.score,
        source: avgPerson.source,
        note: `Only ${Math.round(EMPIRICAL_BENCHMARKS.goalCompletionRate * 100)}% of people achieve their goals`,
        ageBenchmark: ageBenchmarks?.available ? {
          netWorth: ageBenchmarks.netWorth,
          income: ageBenchmarks.income,
          investments: ageBenchmarks.investments,
          health: ageBenchmarks.health
        } : null
      },
      top10Percent: ageBenchmarks?.available ? {
        netWorth: ageBenchmarks.netWorth.formatted.top10Percent,
        income: ageBenchmarks.income.formatted.top10Percent,
        investments: ageBenchmarks.investments.formatted.top10Percent,
        label: `Top 10% at age ${userAge}`
      } : null,
      aspiration: {
        name: targetPerson.name,
        score: targetPerson.score,
        metric: targetPerson.metric,
        achievements: targetPerson.achievements,
        domain: targetPerson.domain,
        matchReason: targetPerson.matchReason,
        why_relatable: targetPerson.why_relatable,
        why_aspirational: targetPerson.why_aspirational,
        aiSelected: targetPerson.aiSelected
      },
      simpleBenchmark,
      analysis: this.generateAnalysis(userProgress.score, avgPerson.score, targetPerson.score)
    };
  }

  /**
   * Initialize AI-powered matching (call on app startup)
   */
  async initializeAIMatching() {
    const connectedData = this.gatherConnectedData();
    return await initializeAIMatching(connectedData);
  }

  /**
   * Check if AI matching is ready
   */
  isAIMatchingReady() {
    return isAIMatchingInitialized();
  }
}

// Singleton
let instance = null;

export const getProgressResearch = () => {
  if (!instance) {
    instance = new ProgressResearchService();
  }
  return instance;
};

export { EMPIRICAL_BENCHMARKS, PUBLIC_FIGURES };
export default ProgressResearchService;
