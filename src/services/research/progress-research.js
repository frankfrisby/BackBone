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
import { getGoalTracker, GOAL_CATEGORY } from "../goals/goal-tracker.js";
import { isOuraConfigured, loadOuraData } from "../health/oura-service.js";
import { loadAlpacaConfig } from "../setup/alpaca-setup.js";
import { isPlaidConfigured } from "../integrations/plaid-service.js";
import { isSignedIn } from "../firebase/firebase-auth.js";
import { getUserAge, getAgeBenchmarks, getSimpleBenchmark } from "./age-benchmarks.js";
import { getDataDir } from "../paths.js";
import {
  getTargetPerson,
  getTargetPersonWithAI,
  findBestMatch,
  initializeAIMatching,
  isAIMatchingInitialized
} from "./person-matcher.js";

const DATA_DIR = getDataDir();
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
   * Calculate user's real progress based on their goals and connected data.
   *
   * SCORING METHODOLOGY (stable, not volatile):
   * Score represents how well the user is doing across 5 fixed dimensions.
   * Each dimension is scored 0-100 and weighted equally. Dimensions:
   *   1. Goals (25%) - active goal progress + completed goals
   *   2. Finance (25%) - portfolio value vs target, not daily change
   *   3. Health (25%) - 7-day average Oura score, not single day
   *   4. Career (15%) - LinkedIn engagement, career goals
   *   5. Engagement (10%) - connected services, system usage
   *
   * The score is smoothed with previous day's score (EMA) to prevent swings.
   *
   * @param {Object} connectedData - Optional data from connected services
   */
  calculateUserProgress(connectedData = {}) {
    const goalTracker = getGoalTracker();
    const activeGoals = goalTracker.getActive();
    const allGoals = goalTracker.getAll?.() || [];
    const completedGoals = allGoals.filter(g => g.status === "completed");

    const breakdown = {};
    const dimensions = {};

    // === DIMENSION 1: GOALS (25% weight) ===
    const totalGoalCount = activeGoals.length + completedGoals.length;
    let goalsScore = 0;

    if (totalGoalCount > 0) {
      // Active goals: calculate weighted progress
      let goalProgressSum = 0;
      let goalCount = 0;

      for (const goal of activeGoals) {
        const progress = goalTracker.calculateProgress(goal);
        goalProgressSum += Math.min(1, Math.max(0, progress)); // clamp 0-1
        goalCount++;

        const cat = goal.category;
        if (!breakdown[cat]) {
          breakdown[cat] = { goals: [], avgProgress: 0, weight: 1.0 };
        }
        breakdown[cat].goals.push({
          title: goal.title,
          progress: Math.round(Math.min(100, progress * 100)),
          current: goal.currentValue,
          target: goal.targetValue,
          unit: goal.unit,
          status: "active"
        });
      }

      for (const goal of completedGoals) {
        goalProgressSum += 1.0;
        goalCount++;

        const cat = goal.category;
        if (!breakdown[cat]) {
          breakdown[cat] = { goals: [], avgProgress: 0, weight: 1.0 };
        }
        breakdown[cat].goals.push({
          title: goal.title,
          progress: 100,
          current: goal.targetValue,
          target: goal.targetValue,
          unit: goal.unit,
          status: "completed"
        });
      }

      goalsScore = goalCount > 0 ? (goalProgressSum / goalCount) * 100 : 0;

      // Calculate category averages
      for (const cat of Object.keys(breakdown)) {
        const catGoals = breakdown[cat].goals;
        if (catGoals.length > 0) {
          breakdown[cat].avgProgress = Math.round(
            catGoals.reduce((sum, g) => sum + g.progress, 0) / catGoals.length
          );
        }
      }
    } else {
      // No goals set — give 5% baseline for just being here
      goalsScore = 5;
    }
    dimensions.goals = { score: Math.round(goalsScore), weight: 0.25 };

    // === DIMENSION 2: FINANCE (25% weight) ===
    const { ouraHealth, portfolio, linkedInProfile } = connectedData;
    let financeScore = 10; // baseline: having awareness = 10%

    if (portfolio?.connected) {
      financeScore = 20; // Connected to trading = 20% baseline

      if (portfolio?.equity) {
        const equity = portfolio.equity;
        // Score based on portfolio value milestones (not daily swings)
        // $0 = 20%, $1K = 25%, $5K = 35%, $25K = 50%, $100K = 65%, $500K = 80%, $1M = 90%
        if (equity >= 1000000) financeScore = 90;
        else if (equity >= 500000) financeScore = 80;
        else if (equity >= 100000) financeScore = 65;
        else if (equity >= 25000) financeScore = 50;
        else if (equity >= 5000) financeScore = 35;
        else if (equity >= 1000) financeScore = 25;
        else financeScore = 20;
      }
    }

    if (connectedData.plaid?.connected) {
      financeScore = Math.max(financeScore, 25); // Banking connected = at least 25%
    }

    // Boost for finance goals progress
    if (breakdown[GOAL_CATEGORY.FINANCE]) {
      const finGoalAvg = breakdown[GOAL_CATEGORY.FINANCE].avgProgress || 0;
      financeScore = Math.max(financeScore, finGoalAvg);
    }

    dimensions.finance = { score: Math.round(Math.min(100, financeScore)), weight: 0.25 };

    // === DIMENSION 3: HEALTH (25% weight) ===
    let healthScore = 10; // baseline

    if (ouraHealth?.connected) {
      healthScore = 20; // Connected = 20%

      // Use 7-day average if available, not single day score
      if (ouraHealth?.weeklyAvg) {
        // weeklyAvg is 0-100 Oura score
        healthScore = Math.max(20, ouraHealth.weeklyAvg);
      } else if (ouraHealth?.today) {
        // Fallback to today but dampen volatility
        const todayScore = ouraHealth.today.readinessScore || ouraHealth.today.sleepScore || 0;
        // Blend toward 50% to reduce single-day swing (70% today + 30% neutral)
        healthScore = Math.max(20, Math.round(todayScore * 0.7 + 50 * 0.3));
      }
    }

    // Boost for health goals progress
    if (breakdown[GOAL_CATEGORY.HEALTH]) {
      const healthGoalAvg = breakdown[GOAL_CATEGORY.HEALTH].avgProgress || 0;
      healthScore = Math.max(healthScore, healthGoalAvg);
    }

    dimensions.health = { score: Math.round(Math.min(100, healthScore)), weight: 0.25 };

    // === DIMENSION 4: CAREER (15% weight) ===
    let careerScore = 10; // baseline

    if (linkedInProfile?.connected) {
      careerScore = 30; // LinkedIn connected = 30%
    }

    // Boost for career goals progress
    if (breakdown[GOAL_CATEGORY.CAREER]) {
      const careerGoalAvg = breakdown[GOAL_CATEGORY.CAREER].avgProgress || 0;
      careerScore = Math.max(careerScore, careerGoalAvg);
    }

    dimensions.career = { score: Math.round(Math.min(100, careerScore)), weight: 0.15 };

    // === DIMENSION 5: ENGAGEMENT (10% weight) ===
    let engagementScore = 5; // using the system at all = 5%

    if (connectedData.firebase?.connected) engagementScore += 20;
    if (portfolio?.connected) engagementScore += 15;
    if (ouraHealth?.connected) engagementScore += 15;
    if (linkedInProfile?.connected) engagementScore += 15;
    if (connectedData.plaid?.connected) engagementScore += 10;
    if (totalGoalCount > 0) engagementScore += 10;
    if (totalGoalCount >= 3) engagementScore += 10;

    dimensions.engagement = { score: Math.round(Math.min(100, engagementScore)), weight: 0.10 };

    // === CALCULATE FINAL SCORE ===
    let rawScore = 0;
    for (const dim of Object.values(dimensions)) {
      rawScore += dim.score * dim.weight;
    }
    rawScore = Math.round(rawScore);

    // Smooth with EMA — blend 70% current calculation + 30% previous day's score
    // This prevents day-to-day swings greater than ~5-7 points
    const previousScore = this.cache.progressHistory?.length > 0
      ? this.cache.progressHistory[this.cache.progressHistory.length - 1]?.score
      : null;

    const smoothedScore = previousScore != null
      ? Math.round(rawScore * 0.7 + previousScore * 0.3)
      : rawScore;

    // Clamp to 1-99 range (never exactly 0 if using system, never 100 until perfect)
    const hasConnectedData = ouraHealth?.connected || portfolio?.connected ||
                             linkedInProfile?.connected || connectedData.plaid?.connected ||
                             connectedData.firebase?.connected;

    const finalScore = hasConnectedData || totalGoalCount > 0
      ? Math.max(1, Math.min(99, smoothedScore))
      : 0;

    return {
      score: finalScore,
      rawScore,
      hasGoals: totalGoalCount > 0,
      hasData: hasConnectedData || totalGoalCount > 0,
      breakdown,
      dimensions,
      goalCount: totalGoalCount
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

    // Check Oura health data — include 7-day average for stable scoring
    try {
      if (isOuraConfigured()) {
        const ouraData = loadOuraData();
        if (ouraData?.today) {
          // Calculate 7-day average from recent data for stability
          let weeklyAvg = null;
          try {
            const recentScores = (ouraData.latest?.readiness || ouraData.latest?.sleep || [])
              .slice(-7)
              .map(d => d.score)
              .filter(s => s != null && s > 0);
            if (recentScores.length >= 3) {
              weeklyAvg = Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length);
            }
          } catch (e) {}

          connectedData.ouraHealth = {
            connected: true,
            today: ouraData.today,
            weeklyAvg
          };
        }
      }
    } catch (e) {}

    // Check Alpaca portfolio — include equity for milestone-based scoring
    try {
      const alpacaConfig = loadAlpacaConfig();
      if (alpacaConfig?.apiKey && !alpacaConfig.apiKey.includes("PASTE")) {
        let equity = null;
        try {
          const cachePath = path.join(DATA_DIR, "alpaca-cache.json");
          if (fs.existsSync(cachePath)) {
            const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
            equity = cache.portfolio?.equity ? parseFloat(cache.portfolio.equity) : null;
          }
        } catch (e) {}
        connectedData.portfolio = { connected: true, equity };
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
