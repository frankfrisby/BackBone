/**
 * Goals Data Structures and Defaults for BACKBONE
 * Defines goal categories, templates, and utility functions
 */

// Goal categories
export const GOAL_CATEGORIES = {
  FINANCE: "finance",
  HEALTH: "health",
  FAMILY: "family",
  CAREER: "career",
  GROWTH: "growth",
  EDUCATION: "education"
};

// Goal templates for quick creation
export const GOAL_TEMPLATES = {
  // Finance templates
  WEALTH_1M: {
    title: "Build $1M Net Worth",
    category: GOAL_CATEGORIES.FINANCE,
    targetValue: 1000000,
    startValue: 0,
    unit: "USD",
    milestones: [
      { target: 10000, label: "$10K" },
      { target: 50000, label: "$50K" },
      { target: 100000, label: "$100K" },
      { target: 250000, label: "$250K" },
      { target: 500000, label: "$500K" },
      { target: 1000000, label: "$1M" }
    ]
  },
  PASSIVE_INCOME: {
    title: "Passive Income Goal",
    category: GOAL_CATEGORIES.FINANCE,
    targetValue: 10000,
    startValue: 0,
    unit: "$/month",
    milestones: [
      { target: 1000, label: "$1K/mo" },
      { target: 2500, label: "$2.5K/mo" },
      { target: 5000, label: "$5K/mo" },
      { target: 10000, label: "$10K/mo" }
    ]
  },

  // Health templates
  SLEEP_OPTIMIZATION: {
    title: "Optimize Sleep Quality",
    category: GOAL_CATEGORIES.HEALTH,
    targetValue: 90,
    startValue: 0,
    unit: "Sleep Score",
    milestones: [
      { target: 70, label: "Good (70+)" },
      { target: 80, label: "Great (80+)" },
      { target: 85, label: "Excellent (85+)" },
      { target: 90, label: "Optimal (90+)" }
    ]
  },
  FITNESS_STREAK: {
    title: "Consistent Exercise",
    category: GOAL_CATEGORIES.HEALTH,
    targetValue: 365,
    startValue: 0,
    unit: "days",
    milestones: [
      { target: 7, label: "1 Week" },
      { target: 30, label: "1 Month" },
      { target: 90, label: "3 Months" },
      { target: 180, label: "6 Months" },
      { target: 365, label: "1 Year" }
    ]
  },

  // Family templates
  QUALITY_TIME: {
    title: "Weekly Family Time",
    category: GOAL_CATEGORIES.FAMILY,
    targetValue: 20,
    startValue: 0,
    unit: "hours/week",
    milestones: [
      { target: 5, label: "5 hrs/week" },
      { target: 10, label: "10 hrs/week" },
      { target: 15, label: "15 hrs/week" },
      { target: 20, label: "20 hrs/week" }
    ]
  },
  FAMILY_TRIPS: {
    title: "Family Trips This Year",
    category: GOAL_CATEGORIES.FAMILY,
    targetValue: 4,
    startValue: 0,
    unit: "trips",
    milestones: [
      { target: 1, label: "1st Trip" },
      { target: 2, label: "2nd Trip" },
      { target: 3, label: "3rd Trip" },
      { target: 4, label: "4th Trip" }
    ]
  },

  // Career templates
  PROMOTION: {
    title: "Career Advancement",
    category: GOAL_CATEGORIES.CAREER,
    targetValue: 100,
    startValue: 0,
    unit: "% progress",
    milestones: [
      { target: 25, label: "Skills Built" },
      { target: 50, label: "Visibility" },
      { target: 75, label: "Opportunity" },
      { target: 100, label: "Promoted" }
    ]
  },
  NETWORK_GROWTH: {
    title: "Grow Professional Network",
    category: GOAL_CATEGORIES.CAREER,
    targetValue: 500,
    startValue: 0,
    unit: "connections",
    milestones: [
      { target: 100, label: "100 connections" },
      { target: 250, label: "250 connections" },
      { target: 500, label: "500 connections" }
    ]
  },

  // Growth templates
  BOOKS_READ: {
    title: "Books Read This Year",
    category: GOAL_CATEGORIES.GROWTH,
    targetValue: 24,
    startValue: 0,
    unit: "books",
    milestones: [
      { target: 6, label: "6 books" },
      { target: 12, label: "12 books" },
      { target: 18, label: "18 books" },
      { target: 24, label: "24 books" }
    ]
  },
  MEDITATION: {
    title: "Daily Meditation Practice",
    category: GOAL_CATEGORIES.GROWTH,
    targetValue: 365,
    startValue: 0,
    unit: "days",
    milestones: [
      { target: 7, label: "1 Week" },
      { target: 30, label: "1 Month" },
      { target: 100, label: "100 Days" },
      { target: 365, label: "1 Year" }
    ]
  },

  // Education templates
  NEW_SKILL: {
    title: "Learn New Skill",
    category: GOAL_CATEGORIES.EDUCATION,
    targetValue: 100,
    startValue: 0,
    unit: "% mastery",
    milestones: [
      { target: 25, label: "Basics" },
      { target: 50, label: "Intermediate" },
      { target: 75, label: "Advanced" },
      { target: 100, label: "Mastery" }
    ]
  },
  CERTIFICATIONS: {
    title: "Professional Certifications",
    category: GOAL_CATEGORIES.EDUCATION,
    targetValue: 3,
    startValue: 0,
    unit: "certifications",
    milestones: [
      { target: 1, label: "1st Cert" },
      { target: 2, label: "2nd Cert" },
      { target: 3, label: "3rd Cert" }
    ]
  }
};

// Priority levels
export const PRIORITY_LEVELS = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
  SOMEDAY: 5
};

// Default goals for new users
export const DEFAULT_GOALS = [
  {
    ...GOAL_TEMPLATES.WEALTH_1M,
    title: "Turn $1,000 into $1,000,000",
    priority: PRIORITY_LEVELS.CRITICAL,
    startValue: 1000,
    currentValue: 1000
  },
  {
    ...GOAL_TEMPLATES.SLEEP_OPTIMIZATION,
    priority: PRIORITY_LEVELS.HIGH
  },
  {
    ...GOAL_TEMPLATES.QUALITY_TIME,
    priority: PRIORITY_LEVELS.HIGH
  }
];

/**
 * Calculate progress percentage
 */
export const calculateProgress = (current, start, target) => {
  if (target === start) return 0;
  return Math.max(0, Math.min(1, (current - start) / (target - start)));
};

/**
 * Format currency value
 */
export const formatCurrency = (value) => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
};

/**
 * Format goal value with unit
 */
export const formatGoalValue = (value, unit) => {
  if (unit === "USD" || unit === "$/month") {
    return formatCurrency(value);
  }
  return `${value} ${unit}`;
};

/**
 * Get suggested actions for a goal
 */
export const getSuggestedActions = (goal) => {
  const suggestions = [];

  switch (goal.category) {
    case GOAL_CATEGORIES.FINANCE:
      suggestions.push(
        "Research high-growth investment opportunities",
        "Analyze current portfolio allocation",
        "Review expense reduction opportunities",
        "Explore additional income streams"
      );
      break;

    case GOAL_CATEGORIES.HEALTH:
      suggestions.push(
        "Review sleep patterns from Oura",
        "Plan weekly exercise schedule",
        "Analyze nutrition and diet",
        "Schedule health checkup"
      );
      break;

    case GOAL_CATEGORIES.FAMILY:
      suggestions.push(
        "Schedule family dinner this week",
        "Plan weekend activity together",
        "Book a family trip",
        "Create shared family calendar"
      );
      break;

    case GOAL_CATEGORIES.CAREER:
      suggestions.push(
        "Update LinkedIn profile",
        "Connect with industry professionals",
        "Research skill development courses",
        "Prepare for performance review"
      );
      break;

    case GOAL_CATEGORIES.GROWTH:
      suggestions.push(
        "Select next book to read",
        "Schedule daily meditation",
        "Journal progress and reflections",
        "Find accountability partner"
      );
      break;

    case GOAL_CATEGORIES.EDUCATION:
      suggestions.push(
        "Research certification programs",
        "Enroll in online course",
        "Practice new skill daily",
        "Join learning community"
      );
      break;
  }

  return suggestions;
};

export default {
  GOAL_CATEGORIES,
  GOAL_TEMPLATES,
  PRIORITY_LEVELS,
  DEFAULT_GOALS,
  calculateProgress,
  formatCurrency,
  formatGoalValue,
  getSuggestedActions
};
