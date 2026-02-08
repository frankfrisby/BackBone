/**
 * Age-Based Benchmarks Service
 *
 * Provides empirical data comparing user to:
 * - Average person at their age (median)
 * - Top 90th percentile in the USA
 *
 * Data sources: Federal Reserve SCF, CDC, Bureau of Labor Statistics
 */

import { loadUserSettings } from "../user-settings.js";

/**
 * Net Worth by Age (US Data - Federal Reserve SCF 2022)
 * Median and 90th percentile by age group
 */
const NET_WORTH_BY_AGE = {
  // Age group: { median, p90 (90th percentile) }
  "18-24": { median: 10800, p90: 74000 },
  "25-29": { median: 20540, p90: 150000 },
  "30-34": { median: 51500, p90: 280000 },
  "35-39": { median: 76300, p90: 500000 },
  "40-44": { median: 104700, p90: 750000 },
  "45-49": { median: 134700, p90: 1000000 },
  "50-54": { median: 168600, p90: 1400000 },
  "55-59": { median: 212500, p90: 1800000 },
  "60-64": { median: 266400, p90: 2200000 },
  "65-69": { median: 281600, p90: 2500000 },
  "70-74": { median: 259900, p90: 2300000 },
  "75+": { median: 213700, p90: 1900000 }
};

/**
 * Savings Rate by Age (% of income saved)
 * Bureau of Labor Statistics, Consumer Expenditure Survey
 */
const SAVINGS_RATE_BY_AGE = {
  "18-24": { median: 3, p90: 15 },
  "25-29": { median: 5, p90: 20 },
  "30-34": { median: 7, p90: 25 },
  "35-39": { median: 8, p90: 28 },
  "40-44": { median: 9, p90: 30 },
  "45-49": { median: 10, p90: 32 },
  "50-54": { median: 12, p90: 35 },
  "55-59": { median: 15, p90: 40 },
  "60-64": { median: 18, p90: 45 },
  "65+": { median: 20, p90: 50 }
};

/**
 * Investment Portfolio Value by Age
 * Including 401k, IRA, brokerage accounts
 */
const INVESTMENT_BY_AGE = {
  "18-24": { median: 1500, p90: 15000 },
  "25-29": { median: 10000, p90: 60000 },
  "30-34": { median: 35000, p90: 150000 },
  "35-39": { median: 60000, p90: 300000 },
  "40-44": { median: 100000, p90: 500000 },
  "45-49": { median: 150000, p90: 750000 },
  "50-54": { median: 220000, p90: 1000000 },
  "55-59": { median: 280000, p90: 1300000 },
  "60-64": { median: 350000, p90: 1600000 },
  "65+": { median: 400000, p90: 1800000 }
};

/**
 * Health Metrics by Age (CDC Data)
 * Percentage meeting health guidelines
 */
const HEALTH_BY_AGE = {
  "18-24": {
    meetsExerciseGuidelines: { median: 35, p90: 90 },
    healthyBMI: { median: 45, p90: 95 },
    adequateSleep: { median: 40, p90: 95 },
    lowStress: { median: 30, p90: 80 }
  },
  "25-34": {
    meetsExerciseGuidelines: { median: 30, p90: 85 },
    healthyBMI: { median: 38, p90: 90 },
    adequateSleep: { median: 35, p90: 90 },
    lowStress: { median: 28, p90: 75 }
  },
  "35-44": {
    meetsExerciseGuidelines: { median: 25, p90: 80 },
    healthyBMI: { median: 32, p90: 85 },
    adequateSleep: { median: 32, p90: 88 },
    lowStress: { median: 25, p90: 70 }
  },
  "45-54": {
    meetsExerciseGuidelines: { median: 22, p90: 75 },
    healthyBMI: { median: 28, p90: 80 },
    adequateSleep: { median: 30, p90: 85 },
    lowStress: { median: 28, p90: 72 }
  },
  "55-64": {
    meetsExerciseGuidelines: { median: 20, p90: 70 },
    healthyBMI: { median: 25, p90: 75 },
    adequateSleep: { median: 35, p90: 88 },
    lowStress: { median: 35, p90: 78 }
  },
  "65+": {
    meetsExerciseGuidelines: { median: 18, p90: 65 },
    healthyBMI: { median: 28, p90: 78 },
    adequateSleep: { median: 40, p90: 90 },
    lowStress: { median: 45, p90: 85 }
  }
};

/**
 * Income by Age (US Census Bureau, BLS)
 */
const INCOME_BY_AGE = {
  "18-24": { median: 35000, p90: 65000 },
  "25-29": { median: 48000, p90: 95000 },
  "30-34": { median: 58000, p90: 120000 },
  "35-39": { median: 65000, p90: 150000 },
  "40-44": { median: 72000, p90: 175000 },
  "45-49": { median: 78000, p90: 200000 },
  "50-54": { median: 80000, p90: 220000 },
  "55-59": { median: 76000, p90: 210000 },
  "60-64": { median: 68000, p90: 190000 },
  "65+": { median: 52000, p90: 150000 }
};

/**
 * Get age group from exact age
 */
const getAgeGroup = (age, benchmarkType = "netWorth") => {
  if (!age) return null;

  // Different benchmarks have slightly different age groupings
  if (benchmarkType === "health") {
    if (age < 25) return "18-24";
    if (age < 35) return "25-34";
    if (age < 45) return "35-44";
    if (age < 55) return "45-54";
    if (age < 65) return "55-64";
    return "65+";
  }

  if (benchmarkType === "savings" || benchmarkType === "income") {
    if (age < 25) return "18-24";
    if (age < 30) return "25-29";
    if (age < 35) return "30-34";
    if (age < 40) return "35-39";
    if (age < 45) return "40-44";
    if (age < 50) return "45-49";
    if (age < 55) return "50-54";
    if (age < 60) return "55-59";
    if (age < 65) return "60-64";
    return "65+";
  }

  // Default (net worth, investments)
  if (age < 25) return "18-24";
  if (age < 30) return "25-29";
  if (age < 35) return "30-34";
  if (age < 40) return "35-39";
  if (age < 45) return "40-44";
  if (age < 50) return "45-49";
  if (age < 55) return "50-54";
  if (age < 60) return "55-59";
  if (age < 65) return "60-64";
  if (age < 70) return "65-69";
  if (age < 75) return "70-74";
  return "75+";
};

/**
 * Calculate user's percentile given their value and benchmark data
 */
const calculatePercentile = (userValue, median, p90) => {
  if (userValue <= 0) return 0;
  if (userValue >= p90) return 90 + (10 * (userValue - p90) / p90);
  if (userValue >= median) {
    // Linear interpolation between median (50th) and p90 (90th)
    return 50 + (40 * (userValue - median) / (p90 - median));
  }
  // Below median - linear interpolation from 0 to 50
  return Math.max(0, 50 * (userValue / median));
};

/**
 * Format currency for display
 */
const formatCurrency = (value) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

/**
 * Get user's age from settings or calculate from birth year
 */
export const getUserAge = () => {
  const settings = loadUserSettings();
  const profile = settings.userProfile || {};

  if (profile.age) return profile.age;
  if (profile.birthYear) {
    const currentYear = new Date().getFullYear();
    return currentYear - profile.birthYear;
  }
  return null;
};

/**
 * Get comprehensive age-based benchmarks for user
 */
export const getAgeBenchmarks = (userAge = null, userData = {}) => {
  const age = userAge || getUserAge();

  if (!age) {
    return {
      available: false,
      message: "Set your age in settings to see benchmarks"
    };
  }

  const netWorthGroup = getAgeGroup(age, "netWorth");
  const savingsGroup = getAgeGroup(age, "savings");
  const healthGroup = getAgeGroup(age, "health");
  const incomeGroup = getAgeGroup(age, "income");

  const netWorthData = NET_WORTH_BY_AGE[netWorthGroup];
  const savingsData = SAVINGS_RATE_BY_AGE[savingsGroup];
  const investmentData = INVESTMENT_BY_AGE[netWorthGroup];
  const healthData = HEALTH_BY_AGE[healthGroup];
  const incomeData = INCOME_BY_AGE[incomeGroup];

  const benchmarks = {
    available: true,
    age,
    ageGroup: netWorthGroup,

    // Net Worth benchmarks
    netWorth: {
      average: netWorthData.median,
      top10Percent: netWorthData.p90,
      userValue: userData.netWorth || null,
      userPercentile: userData.netWorth
        ? Math.round(calculatePercentile(userData.netWorth, netWorthData.median, netWorthData.p90))
        : null,
      formatted: {
        average: formatCurrency(netWorthData.median),
        top10Percent: formatCurrency(netWorthData.p90)
      }
    },

    // Savings Rate benchmarks
    savingsRate: {
      average: savingsData.median,
      top10Percent: savingsData.p90,
      userValue: userData.savingsRate || null,
      userPercentile: userData.savingsRate
        ? Math.round(calculatePercentile(userData.savingsRate, savingsData.median, savingsData.p90))
        : null,
      formatted: {
        average: `${savingsData.median}%`,
        top10Percent: `${savingsData.p90}%`
      }
    },

    // Investment Portfolio benchmarks
    investments: {
      average: investmentData.median,
      top10Percent: investmentData.p90,
      userValue: userData.investments || null,
      userPercentile: userData.investments
        ? Math.round(calculatePercentile(userData.investments, investmentData.median, investmentData.p90))
        : null,
      formatted: {
        average: formatCurrency(investmentData.median),
        top10Percent: formatCurrency(investmentData.p90)
      }
    },

    // Income benchmarks
    income: {
      average: incomeData.median,
      top10Percent: incomeData.p90,
      userValue: userData.income || null,
      userPercentile: userData.income
        ? Math.round(calculatePercentile(userData.income, incomeData.median, incomeData.p90))
        : null,
      formatted: {
        average: formatCurrency(incomeData.median),
        top10Percent: formatCurrency(incomeData.p90)
      }
    },

    // Health benchmarks
    health: {
      exercise: {
        average: healthData.meetsExerciseGuidelines.median,
        top10Percent: healthData.meetsExerciseGuidelines.p90,
        description: "% meeting CDC exercise guidelines"
      },
      bmi: {
        average: healthData.healthyBMI.median,
        top10Percent: healthData.healthyBMI.p90,
        description: "% with healthy BMI"
      },
      sleep: {
        average: healthData.adequateSleep.median,
        top10Percent: healthData.adequateSleep.p90,
        description: "% getting 7+ hours sleep"
      },
      stress: {
        average: healthData.lowStress.median,
        top10Percent: healthData.lowStress.p90,
        description: "% with low stress levels"
      }
    },

    // Summary
    summary: {
      netWorthToReachAverage: Math.max(0, netWorthData.median - (userData.netWorth || 0)),
      netWorthToReachTop10: Math.max(0, netWorthData.p90 - (userData.netWorth || 0)),
      yearsToTop10AtSavings: userData.annualSavings
        ? Math.ceil((netWorthData.p90 - (userData.netWorth || 0)) / userData.annualSavings)
        : null
    }
  };

  return benchmarks;
};

/**
 * Get simple benchmark comparison for progress display
 */
export const getSimpleBenchmark = (category = "finance", userAge = null) => {
  const age = userAge || getUserAge() || 35; // Default to 35 if no age

  const netWorthGroup = getAgeGroup(age, "netWorth");
  const netWorthData = NET_WORTH_BY_AGE[netWorthGroup];
  const incomeGroup = getAgeGroup(age, "income");
  const incomeData = INCOME_BY_AGE[incomeGroup];

  if (category === "finance") {
    return {
      label: `Age ${age} Benchmark`,
      average: {
        value: netWorthData.median,
        label: `Average: ${formatCurrency(netWorthData.median)}`
      },
      top10: {
        value: netWorthData.p90,
        label: `Top 10%: ${formatCurrency(netWorthData.p90)}`
      }
    };
  }

  if (category === "health") {
    const healthGroup = getAgeGroup(age, "health");
    const healthData = HEALTH_BY_AGE[healthGroup];
    return {
      label: `Age ${age} Benchmark`,
      average: {
        value: healthData.meetsExerciseGuidelines.median,
        label: `Average: ${healthData.meetsExerciseGuidelines.median}% fit`
      },
      top10: {
        value: healthData.meetsExerciseGuidelines.p90,
        label: `Top 10%: ${healthData.meetsExerciseGuidelines.p90}% fit`
      }
    };
  }

  // Default - income-based
  return {
    label: `Age ${age} Benchmark`,
    average: {
      value: incomeData.median,
      label: `Average: ${formatCurrency(incomeData.median)}/yr`
    },
    top10: {
      value: incomeData.p90,
      label: `Top 10%: ${formatCurrency(incomeData.p90)}/yr`
    }
  };
};

/**
 * Calculate overall score comparing user to benchmarks
 * Returns 0-100 where 50 = average, 90 = top 10%
 */
export const calculateBenchmarkScore = (userData = {}, userAge = null) => {
  const age = userAge || getUserAge();
  if (!age) return null;

  const benchmarks = getAgeBenchmarks(age, userData);
  if (!benchmarks.available) return null;

  const scores = [];

  if (benchmarks.netWorth.userPercentile !== null) {
    scores.push(benchmarks.netWorth.userPercentile);
  }
  if (benchmarks.savingsRate.userPercentile !== null) {
    scores.push(benchmarks.savingsRate.userPercentile);
  }
  if (benchmarks.investments.userPercentile !== null) {
    scores.push(benchmarks.investments.userPercentile);
  }
  if (benchmarks.income.userPercentile !== null) {
    scores.push(benchmarks.income.userPercentile);
  }

  if (scores.length === 0) return null;

  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
};

export {
  NET_WORTH_BY_AGE,
  SAVINGS_RATE_BY_AGE,
  INVESTMENT_BY_AGE,
  HEALTH_BY_AGE,
  INCOME_BY_AGE
};

export default {
  getUserAge,
  getAgeBenchmarks,
  getSimpleBenchmark,
  calculateBenchmarkScore
};
