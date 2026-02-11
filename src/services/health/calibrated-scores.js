/**
 * Calibrated Life Scoring Engine
 *
 * Scores are calibrated against a real 0-100 scale where:
 *   100 = "Best of all famous people combined" — the pinnacle of human achievement
 *   95  = Ray Dalio / top role model territory
 *   50  = Comfortable professional doing well
 *   20  = Average American (empirical benchmark)
 *    0  = No data / no engagement
 *
 * The 100% benchmark is a COMPOSITE of the best attributes of top humans:
 *   - Net worth: $200B+ (Musk, Bezos level)
 *   - Health: Olympic-level fitness + longevity habits (Goggins, Attia)
 *   - Career: CEO of trillion-dollar company (Cook, Nadella)
 *   - Family: Strong multi-generational bonds + philanthropy (Gates Foundation)
 *   - Growth: Continuous learner + thought leader (Dalio, Ravikant)
 *   - Impact: Global humanitarian impact (Oprah, Gates)
 *
 * Every score is calculated against this same absolute scale.
 * A $1K portfolio is NOT 40%. It's closer to 1%.
 *
 * Sources: Federal Reserve SCF 2022, CDC, BLS, Forbes
 */

import { getUserAge } from "../research/age-benchmarks.js";

// ── The 100% Benchmark (Composite Best of Humanity) ──────────

const PINNACLE = {
  finance: {
    netWorth: 200_000_000_000,   // $200B (Musk/Bezos)
    portfolio: 50_000_000_000,    // $50B liquid investments
    income: 100_000_000,          // $100M/year
    savingsRate: 80,              // 80% savings rate
  },
  health: {
    sleepScore: 98,      // Perfect Oura sleep
    readinessScore: 98,  // Peak readiness
    activityScore: 98,   // Elite athlete level
    yearsOfLife: 120,    // Theoretical max longevity
  },
  career: {
    companyValue: 3_000_000_000_000, // $3T company (Apple)
    employees: 200_000,
    influence: 100,      // Global influence score
    connections: 30_000, // LinkedIn connections (top tier)
  },
  family: {
    qualityTime: 30,     // Hours/week with family
    relationships: 100,  // Deep relationship score
    philanthropy: 50_000_000_000, // $50B given (Gates)
  },
  growth: {
    booksPerYear: 100,   // Voracious reader (Gates reads 50+)
    skills: 50,          // Mastered disciplines
    mentalModels: 100,   // Intellectual frameworks
  },
  impact: {
    livesImpacted: 1_000_000_000, // Billion-person impact
    socialFollowing: 200_000_000,  // Global reach
    legacy: 100,                   // Lasting change score
  },
};

// ── Famous Person Benchmark Profiles ─────────────────────────

const FAMOUS_PROFILES = {
  "Ray Dalio": {
    finance: { netWorth: 19_000_000_000, portfolio: 10_000_000_000, income: 500_000_000, savingsRate: 70 },
    health: { sleepScore: 75, readinessScore: 70, activityScore: 65, yearsOfLife: 85 },
    career: { companyValue: 150_000_000_000, employees: 1500, influence: 90, connections: 10_000 },
    family: { qualityTime: 15, relationships: 70, philanthropy: 4_000_000_000 },
    growth: { booksPerYear: 50, skills: 40, mentalModels: 95 },
    impact: { livesImpacted: 50_000_000, socialFollowing: 5_000_000, legacy: 85 },
  },
  "Warren Buffett": {
    finance: { netWorth: 130_000_000_000, portfolio: 130_000_000_000, income: 5_000_000_000, savingsRate: 90 },
    health: { sleepScore: 60, readinessScore: 55, activityScore: 40, yearsOfLife: 94 },
    career: { companyValue: 900_000_000_000, employees: 400_000, influence: 95, connections: 5_000 },
    family: { qualityTime: 10, relationships: 60, philanthropy: 50_000_000_000 },
    growth: { booksPerYear: 80, skills: 30, mentalModels: 90 },
    impact: { livesImpacted: 100_000_000, socialFollowing: 3_000_000, legacy: 95 },
  },
  "Elon Musk": {
    finance: { netWorth: 200_000_000_000, portfolio: 5_000_000_000, income: 10_000_000_000, savingsRate: 60 },
    health: { sleepScore: 55, readinessScore: 50, activityScore: 45, yearsOfLife: 75 },
    career: { companyValue: 3_000_000_000_000, employees: 150_000, influence: 98, connections: 5_000 },
    family: { qualityTime: 5, relationships: 40, philanthropy: 200_000_000 },
    growth: { booksPerYear: 30, skills: 45, mentalModels: 85 },
    impact: { livesImpacted: 500_000_000, socialFollowing: 200_000_000, legacy: 90 },
  },
};

// ── Average Person Benchmark (US Median, age-adjusted) ───────

function getAveragePersonProfile(age = 35) {
  // Age-adjusted median American data (Federal Reserve SCF 2022, CDC, BLS)
  const ageGroup = age < 25 ? "18-24" : age < 30 ? "25-29" : age < 35 ? "30-34"
    : age < 40 ? "35-39" : age < 45 ? "40-44" : age < 50 ? "45-49"
    : age < 55 ? "50-54" : age < 60 ? "55-59" : age < 65 ? "60-64" : "65+";

  const netWorthByAge = {
    "18-24": 10800, "25-29": 20540, "30-34": 51500, "35-39": 76300,
    "40-44": 104700, "45-49": 134700, "50-54": 168600, "55-59": 212500,
    "60-64": 266400, "65+": 247600,
  };
  const investmentByAge = {
    "18-24": 1500, "25-29": 10000, "30-34": 35000, "35-39": 60000,
    "40-44": 100000, "45-49": 150000, "50-54": 220000, "55-59": 280000,
    "60-64": 350000, "65+": 400000,
  };
  const incomeByAge = {
    "18-24": 35000, "25-29": 48000, "30-34": 58000, "35-39": 65000,
    "40-44": 72000, "45-49": 78000, "50-54": 80000, "55-59": 76000,
    "60-64": 68000, "65+": 52000,
  };

  return {
    finance: {
      netWorth: netWorthByAge[ageGroup] || 76300,
      portfolio: investmentByAge[ageGroup] || 60000,
      income: incomeByAge[ageGroup] || 65000,
      savingsRate: 5, // 4.6% avg US savings rate
    },
    health: {
      sleepScore: 55, // Avg American gets ~6.5h sleep, poor quality
      readinessScore: 50,
      activityScore: 35, // Only 23% meet exercise guidelines
      yearsOfLife: 78, // US life expectancy
    },
    career: {
      companyValue: 0,
      employees: 0,
      influence: 5,
      connections: 200,
    },
    family: {
      qualityTime: 5, // Most spend <5h/week quality family time
      relationships: 40,
      philanthropy: 500, // Avg annual charitable giving
    },
    growth: {
      booksPerYear: 4, // Average American reads 4 books/year
      skills: 5,
      mentalModels: 10,
    },
    impact: {
      livesImpacted: 50, // Immediate circle
      socialFollowing: 300, // Avg social media following
      legacy: 5,
    },
  };
}

// ── Scoring Functions ────────────────────────────────────────

/**
 * Score a value on a logarithmic scale against the pinnacle.
 * Uses log scale because wealth/impact differences are exponential.
 *
 * @param {number} value - User's value
 * @param {number} pinnacle - The 100% benchmark value
 * @param {number} floor - Minimum meaningful value (below = 0)
 * @returns {number} 0-100 score
 */
function logScore(value, pinnacle, floor = 0) {
  if (!value || value <= floor) return 0;
  if (value >= pinnacle) return 100;

  // Log scale: score = log(value/floor) / log(pinnacle/floor) * 100
  const effectiveFloor = Math.max(floor, 1);
  const logValue = Math.log10(Math.max(value, effectiveFloor));
  const logPinnacle = Math.log10(pinnacle);
  const logFloor = Math.log10(effectiveFloor);

  const score = ((logValue - logFloor) / (logPinnacle - logFloor)) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Score a value on a linear scale (for 0-100 bounded metrics like Oura scores)
 */
function linearScore(value, pinnacle, floor = 0) {
  if (!value || value <= floor) return 0;
  if (value >= pinnacle) return 100;
  return Math.round(((value - floor) / (pinnacle - floor)) * 100);
}

/**
 * Calculate a category score from a profile against the pinnacle
 */
function scoreCategoryFromProfile(profile, category) {
  const pin = PINNACLE[category];
  if (!pin || !profile) return 0;

  const scores = [];

  for (const [key, pinnacleValue] of Object.entries(pin)) {
    const value = profile[key];
    if (value === undefined || value === null) continue;

    // Use log scale for monetary/count values, linear for bounded scores
    const isMonetary = key.includes("Worth") || key.includes("income") ||
      key.includes("portfolio") || key.includes("philanthropy") ||
      key.includes("companyValue") || key.includes("livesImpacted") ||
      key.includes("socialFollowing") || key.includes("employees");
    const isBounded = key.includes("Score") || key.includes("Rate") ||
      key.includes("Time") || key.includes("skills") || key.includes("books") ||
      key.includes("mentalModels") || key.includes("relationships") ||
      key.includes("influence") || key.includes("legacy") ||
      key.includes("connections");

    if (isMonetary) {
      scores.push(logScore(value, pinnacleValue, 100));
    } else if (isBounded) {
      scores.push(linearScore(value, pinnacleValue));
    } else {
      scores.push(linearScore(value, pinnacleValue));
    }
  }

  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// ── Public API ───────────────────────────────────────────────

/**
 * Calculate calibrated scores for ALL three entities.
 *
 * @param {Object} userData - User's actual data
 * @param {string} [roleModelName] - Name of role model (default: "Ray Dalio")
 * @returns {{ user, roleModel, averagePerson, pinnacle }}
 */
export function getCalibratedScores(userData = {}, roleModelName = "Ray Dalio") {
  const userAge = getUserAge() || 35;
  const avgProfile = getAveragePersonProfile(userAge);
  const roleModelProfile = FAMOUS_PROFILES[roleModelName] || FAMOUS_PROFILES["Ray Dalio"];

  // Build user profile from actual data
  const userProfile = buildUserProfile(userData);

  const categories = ["finance", "health", "career", "family", "growth", "impact"];
  const weights = { finance: 0.25, health: 0.25, career: 0.15, family: 0.20, growth: 0.10, impact: 0.05 };

  const result = {
    user: { categories: {}, overall: 0 },
    roleModel: { name: roleModelName, categories: {}, overall: 0 },
    averagePerson: { categories: {}, overall: 0 },
  };

  let userWeightedSum = 0, rmWeightedSum = 0, avgWeightedSum = 0;
  let totalWeight = 0;

  for (const cat of categories) {
    const userScore = scoreCategoryFromProfile(userProfile[cat], cat);
    const rmScore = scoreCategoryFromProfile(roleModelProfile[cat], cat);
    const avgScore = scoreCategoryFromProfile(avgProfile[cat], cat);
    const w = weights[cat] || 0.1;

    result.user.categories[cat] = userScore;
    result.roleModel.categories[cat] = rmScore;
    result.averagePerson.categories[cat] = avgScore;

    userWeightedSum += userScore * w;
    rmWeightedSum += rmScore * w;
    avgWeightedSum += avgScore * w;
    totalWeight += w;
  }

  result.user.overall = Math.round(userWeightedSum / totalWeight);
  result.roleModel.overall = Math.round(rmWeightedSum / totalWeight);
  result.averagePerson.overall = Math.round(avgWeightedSum / totalWeight);

  return result;
}

/**
 * Build a user profile from actual BACKBONE data for calibrated scoring.
 *
 * @param {Object} data - { portfolio, oura, linkedin, goals, family }
 */
function buildUserProfile(data = {}) {
  const { portfolio, oura, linkedin, goals, family } = data;

  const equity = portfolio?.equityRaw ||
    (typeof portfolio?.equity === "string" ? parseFloat(portfolio.equity.replace(/[$,]/g, "")) : portfolio?.equity) || 0;

  const positions = portfolio?.positions?.length || 0;
  const dayPL = portfolio?.dayPL || 0;

  // Rough net worth estimate: portfolio equity + assumed other assets
  // For now just use portfolio value as main financial metric
  const estimatedNetWorth = equity * 2; // Rough: portfolio is ~50% of net worth

  const sleepScore = oura?.sleep?.score || oura?.sleep?.at?.(-1)?.score || 0;
  const readinessScore = oura?.readiness?.score || oura?.readiness?.at?.(-1)?.score || 0;
  const activityScore = oura?.activity?.score || oura?.activity?.at?.(-1)?.score || 0;

  const connections = linkedin?.connections || 0;
  const hasExperience = linkedin?.experience?.length > 0;
  const skills = linkedin?.skills?.length || 0;

  const activeGoals = goals?.filter(g => g.status === "active")?.length || 0;
  const completedGoals = goals?.filter(g => g.status === "completed")?.length || 0;

  return {
    finance: {
      netWorth: estimatedNetWorth,
      portfolio: equity,
      income: 0, // Unknown without explicit input
      savingsRate: 0,
    },
    health: {
      sleepScore,
      readinessScore,
      activityScore,
      yearsOfLife: 80, // Default estimate
    },
    career: {
      companyValue: 0,
      employees: 0,
      influence: Math.min(100, connections / 300),
      connections,
    },
    family: {
      qualityTime: family?.weeklyHours || 5,
      relationships: family?.score || 50,
      philanthropy: 0,
    },
    growth: {
      booksPerYear: completedGoals * 2 + activeGoals, // Proxy
      skills: skills || 5,
      mentalModels: Math.min(100, (activeGoals + completedGoals) * 5),
    },
    impact: {
      livesImpacted: connections, // Rough proxy
      socialFollowing: connections,
      legacy: 5,
    },
  };
}

/**
 * Format calibrated scores for display.
 * Returns a comparison table: User vs Role Model vs Average.
 */
export function formatCalibratedComparison(scores) {
  const { user, roleModel, averagePerson } = scores;

  const categories = ["finance", "health", "career", "family", "growth", "impact"];
  const labels = { finance: "Finance", health: "Health", career: "Career", family: "Family", growth: "Growth", impact: "Impact" };

  const lines = [];
  lines.push(`*Calibrated Life Scores*`);
  lines.push(`─────────────────────`);
  lines.push(`               You    ${roleModel.name.split(" ")[0].padEnd(8)} Avg`);
  lines.push(`*Overall*      ${String(user.overall).padStart(3)}%   ${String(roleModel.overall).padStart(3)}%     ${String(averagePerson.overall).padStart(3)}%`);
  lines.push(``);

  for (const cat of categories) {
    const label = labels[cat].padEnd(10);
    const u = String(user.categories[cat] || 0).padStart(3);
    const r = String(roleModel.categories[cat] || 0).padStart(3);
    const a = String(averagePerson.categories[cat] || 0).padStart(3);
    lines.push(`${label}   ${u}%   ${r}%     ${a}%`);
  }

  lines.push(``);
  lines.push(`_100% = composite pinnacle of human achievement_`);

  return lines.join("\n");
}

/**
 * Get available role model names for comparison.
 */
export function getAvailableRoleModels() {
  return Object.keys(FAMOUS_PROFILES);
}

export default {
  getCalibratedScores,
  formatCalibratedComparison,
  getAvailableRoleModels,
  buildUserProfile,
  PINNACLE,
  FAMOUS_PROFILES,
};
