/**
 * Weekly Review Service
 *
 * Structured weekly review process based on best practices from
 * GTD, Atomic Habits, and high-performance frameworks.
 */

import fs from "fs";
import path from "path";
import { loadGoals, getGoalSummary, updateGoalProgress } from "./goal-extractor.js";
import { getHabitsSummary, getTodayHabits } from "./habits.js";
import { getTopRecommendations, generateRecommendations } from "./recommendations-engine.js";

const DATA_DIR = path.join(process.cwd(), "data");
const REVIEWS_PATH = path.join(DATA_DIR, "weekly-reviews.json");
const MEMORY_DIR = path.join(process.cwd(), "memory");

// Review prompts for each area
const REVIEW_PROMPTS = {
  wins: [
    "What went well this week?",
    "What accomplishments am I proud of?",
    "What problems did I solve?",
    "What skills did I develop?"
  ],
  challenges: [
    "What was difficult this week?",
    "What obstacles did I face?",
    "What didn't go as planned?",
    "What caused stress or frustration?"
  ],
  lessons: [
    "What did I learn this week?",
    "What would I do differently?",
    "What insights did I gain?",
    "What patterns did I notice?"
  ],
  gratitude: [
    "What am I grateful for?",
    "Who helped me this week?",
    "What opportunities did I have?",
    "What small moments brought joy?"
  ],
  nextWeek: [
    "What are my top 3 priorities?",
    "What must get done?",
    "What would make this week a success?",
    "What habits will I focus on?"
  ]
};

// Life areas to review
const LIFE_AREAS = [
  { key: "health", name: "Health & Energy", questions: ["How's my energy?", "Am I sleeping well?", "Exercise consistency?"] },
  { key: "work", name: "Work & Career", questions: ["Progress on key projects?", "Learning new skills?", "Relationships with colleagues?"] },
  { key: "finance", name: "Finance", questions: ["On track with budget?", "Savings goals?", "Any unexpected expenses?"] },
  { key: "relationships", name: "Relationships", questions: ["Quality time with loved ones?", "Connections with friends?", "Any conflicts to resolve?"] },
  { key: "growth", name: "Personal Growth", questions: ["Reading/learning?", "Habits maintained?", "Mental wellbeing?"] }
];

/**
 * Ensure data directory exists
 */
const ensureDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Load review history
 */
export const loadReviews = () => {
  ensureDir();
  try {
    if (fs.existsSync(REVIEWS_PATH)) {
      return JSON.parse(fs.readFileSync(REVIEWS_PATH, "utf-8"));
    }
  } catch (err) {
    console.error("[WeeklyReview] Error loading reviews:", err.message);
  }
  return {
    reviews: [],
    lastReview: null,
    streak: 0
  };
};

/**
 * Save reviews
 */
export const saveReviews = (data) => {
  ensureDir();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(REVIEWS_PATH, JSON.stringify(data, null, 2));
  return { success: true };
};

/**
 * Get the current week number
 */
const getWeekNumber = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

/**
 * Check if review is due
 */
export const isReviewDue = () => {
  const reviews = loadReviews();
  if (!reviews.lastReview) return true;

  const lastReviewDate = new Date(reviews.lastReview);
  const lastReviewWeek = getWeekNumber(lastReviewDate);
  const currentWeek = getWeekNumber();
  const currentYear = new Date().getFullYear();
  const lastReviewYear = lastReviewDate.getFullYear();

  // Due if different week or different year
  return currentWeek !== lastReviewWeek || currentYear !== lastReviewYear;
};

/**
 * Generate automatic review data from system data
 */
export const generateAutoReviewData = () => {
  const goalsSummary = getGoalSummary();
  const habitsSummary = getHabitsSummary();
  const habits = getTodayHabits();

  // Calculate this week's data
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  // Goal progress this week
  const goalsData = loadGoals();
  const activeGoals = (goalsData.goals || []).filter(g => g.status === "active");
  const goalsWithProgress = activeGoals.filter(g => (g.progress || 0) > 0);

  // Habit completions
  const habitCompletionRate = habitsSummary.completionRate || 0;
  const bestStreak = habitsSummary.longestCurrentStreak || 0;

  // Find top performing habits
  const topHabits = habits
    .filter(h => h.streak > 0)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 3);

  // Find habits needing attention
  const strugglingHabits = habits
    .filter(h => h.streak === 0 && h.active)
    .slice(0, 3);

  return {
    timestamp: new Date().toISOString(),
    week: getWeekNumber(),
    year: new Date().getFullYear(),
    metrics: {
      goals: {
        total: goalsSummary.total,
        active: goalsSummary.byStatus?.active || 0,
        completed: goalsSummary.byStatus?.completed || 0,
        avgProgress: goalsSummary.avgProgress
      },
      habits: {
        total: habitsSummary.totalHabits,
        completedToday: habitsSummary.completedToday,
        completionRate: habitCompletionRate,
        bestStreak
      }
    },
    highlights: {
      topHabits: topHabits.map(h => ({ title: h.title, streak: h.streak })),
      strugglingHabits: strugglingHabits.map(h => h.title),
      topGoals: goalsSummary.topGoals || []
    },
    generated: true
  };
};

/**
 * Start a new review session
 */
export const startReview = () => {
  const autoData = generateAutoReviewData();
  const recommendations = getTopRecommendations(3);

  return {
    started: true,
    autoData,
    recommendations,
    prompts: REVIEW_PROMPTS,
    lifeAreas: LIFE_AREAS,
    instructions: `
WEEKLY REVIEW - Week ${autoData.week}, ${autoData.year}

This is your structured weekly review. Take 15-30 minutes to reflect.

YOUR METRICS:
- Goals: ${autoData.metrics.goals.active} active, ${autoData.metrics.goals.avgProgress}% avg progress
- Habits: ${autoData.metrics.habits.completionRate}% completion, ${autoData.metrics.habits.bestStreak} day best streak

TOP PERFORMING HABITS:
${autoData.highlights.topHabits.map(h => `  - ${h.title} (${h.streak} day streak)`).join('\n') || '  None yet'}

NEEDS ATTENTION:
${autoData.highlights.strugglingHabits.map(h => `  - ${h}`).join('\n') || '  All habits on track!'}

TOP RECOMMENDATIONS:
${recommendations.map((r, i) => `  ${i + 1}. ${r.text}`).join('\n') || '  Generate recommendations with /recs refresh'}

Use /review save to save your reflections when done.
    `
  };
};

/**
 * Save a completed review
 */
export const saveReview = (reviewData) => {
  const reviews = loadReviews();
  const autoData = generateAutoReviewData();

  const review = {
    id: `review-${Date.now()}`,
    week: autoData.week,
    year: autoData.year,
    completedAt: new Date().toISOString(),
    metrics: autoData.metrics,
    highlights: autoData.highlights,
    reflections: reviewData.reflections || {},
    lifeAreaScores: reviewData.lifeAreaScores || {},
    nextWeekPriorities: reviewData.priorities || [],
    notes: reviewData.notes || ""
  };

  reviews.reviews.unshift(review);
  reviews.lastReview = review.completedAt;

  // Calculate streak
  if (reviews.reviews.length >= 2) {
    const prev = reviews.reviews[1];
    const prevWeek = prev.week;
    const currentWeek = review.week;

    // Check if consecutive weeks
    if (currentWeek - prevWeek === 1 || (prevWeek === 52 && currentWeek === 1)) {
      reviews.streak = (reviews.streak || 0) + 1;
    } else {
      reviews.streak = 1;
    }
  } else {
    reviews.streak = 1;
  }

  saveReviews(reviews);

  // Also save to markdown for memory
  saveReviewToMarkdown(review);

  return {
    success: true,
    review,
    streak: reviews.streak
  };
};

/**
 * Save review to markdown file
 */
const saveReviewToMarkdown = (review) => {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }

  const filename = `weekly-review-${review.year}-w${review.week}.md`;
  const filepath = path.join(MEMORY_DIR, filename);

  let content = `# Weekly Review - Week ${review.week}, ${review.year}\n\n`;
  content += `*Completed: ${new Date(review.completedAt).toLocaleDateString()}*\n\n`;

  content += `## Metrics\n\n`;
  content += `- Goals: ${review.metrics.goals.active} active, ${review.metrics.goals.avgProgress}% avg progress\n`;
  content += `- Habits: ${review.metrics.habits.completionRate}% completion rate\n`;
  content += `- Best Streak: ${review.metrics.habits.bestStreak} days\n\n`;

  if (review.reflections) {
    content += `## Reflections\n\n`;
    for (const [section, text] of Object.entries(review.reflections)) {
      if (text) {
        content += `### ${section.charAt(0).toUpperCase() + section.slice(1)}\n\n`;
        content += `${text}\n\n`;
      }
    }
  }

  if (review.nextWeekPriorities?.length > 0) {
    content += `## Next Week Priorities\n\n`;
    review.nextWeekPriorities.forEach((p, i) => {
      content += `${i + 1}. ${p}\n`;
    });
    content += `\n`;
  }

  if (review.notes) {
    content += `## Notes\n\n${review.notes}\n`;
  }

  fs.writeFileSync(filepath, content);
};

/**
 * Get review history
 */
export const getReviewHistory = (limit = 4) => {
  const reviews = loadReviews();
  return {
    reviews: reviews.reviews.slice(0, limit),
    streak: reviews.streak || 0,
    total: reviews.reviews.length
  };
};

/**
 * Compare current week to previous
 */
export const getWeekOverWeekComparison = () => {
  const reviews = loadReviews();
  if (reviews.reviews.length < 2) {
    return { hasComparison: false };
  }

  const current = reviews.reviews[0];
  const previous = reviews.reviews[1];

  return {
    hasComparison: true,
    habitChange: current.metrics.habits.completionRate - previous.metrics.habits.completionRate,
    goalProgressChange: current.metrics.goals.avgProgress - previous.metrics.goals.avgProgress,
    streakChange: current.metrics.habits.bestStreak - previous.metrics.habits.bestStreak,
    currentWeek: current.week,
    previousWeek: previous.week
  };
};

/**
 * Get review stats
 */
export const getReviewStats = () => {
  const reviews = loadReviews();
  const history = reviews.reviews;

  if (history.length === 0) {
    return {
      totalReviews: 0,
      streak: 0,
      lastReview: null,
      avgHabitCompletion: 0,
      avgGoalProgress: 0
    };
  }

  const avgHabitCompletion = history.reduce((sum, r) => sum + (r.metrics?.habits?.completionRate || 0), 0) / history.length;
  const avgGoalProgress = history.reduce((sum, r) => sum + (r.metrics?.goals?.avgProgress || 0), 0) / history.length;

  return {
    totalReviews: history.length,
    streak: reviews.streak || 0,
    lastReview: reviews.lastReview,
    avgHabitCompletion: Math.round(avgHabitCompletion),
    avgGoalProgress: Math.round(avgGoalProgress),
    isDue: isReviewDue()
  };
};

/**
 * Format review for CLI display
 */
export const formatReviewDisplay = () => {
  const stats = getReviewStats();
  const isDue = isReviewDue();
  const comparison = getWeekOverWeekComparison();

  let output = "\n";
  output += "                WEEKLY REVIEW\n";
  output += "                                                           \n\n";

  // Status
  output += `Review Status: ${isDue ? "DUE NOW" : "Up to date"}\n`;
  output += `Review Streak: ${stats.streak} weeks\n`;
  output += `Total Reviews: ${stats.totalReviews}\n\n`;

  if (stats.lastReview) {
    output += `Last Review: ${new Date(stats.lastReview).toLocaleDateString()}\n\n`;
  }

  // Averages
  if (stats.totalReviews > 0) {
    output += "HISTORICAL AVERAGES:\n";
    output += `  Habit Completion: ${stats.avgHabitCompletion}%\n`;
    output += `  Goal Progress: ${stats.avgGoalProgress}%\n\n`;
  }

  // Week over week
  if (comparison.hasComparison) {
    output += "WEEK OVER WEEK:\n";
    const habitIcon = comparison.habitChange >= 0 ? "+" : "";
    const goalIcon = comparison.goalProgressChange >= 0 ? "+" : "";
    output += `  Habits: ${habitIcon}${comparison.habitChange}%\n`;
    output += `  Goals: ${goalIcon}${comparison.goalProgressChange}%\n\n`;
  }

  output += "Commands:\n";
  output += "  /review start - Begin weekly review\n";
  output += "  /review history - View past reviews\n";
  output += "  /review stats - View review statistics\n";

  return output;
};

export default {
  loadReviews,
  isReviewDue,
  startReview,
  saveReview,
  getReviewHistory,
  getWeekOverWeekComparison,
  getReviewStats,
  formatReviewDisplay,
  generateAutoReviewData
};
