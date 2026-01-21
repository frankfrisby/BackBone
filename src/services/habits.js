/**
 * Habits Service
 *
 * Track daily habits and build streaks.
 * Based on James Clear's Atomic Habits principles:
 * - Make it obvious
 * - Make it attractive
 * - Make it easy
 * - Make it satisfying
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const HABITS_PATH = path.join(DATA_DIR, "habits.json");

// Predefined habit categories
export const HABIT_CATEGORIES = {
  health: { icon: "+", color: "#22c55e", name: "Health" },
  fitness: { icon: "▲", color: "#f59e0b", name: "Fitness" },
  learning: { icon: "~", color: "#3b82f6", name: "Learning" },
  productivity: { icon: "^", color: "#8b5cf6", name: "Productivity" },
  mindfulness: { icon: "*", color: "#ec4899", name: "Mindfulness" },
  finance: { icon: "$", color: "#eab308", name: "Finance" },
  social: { icon: "@", color: "#06b6d4", name: "Social" },
  creativity: { icon: "#", color: "#f97316", name: "Creativity" }
};

// Recommended habits based on successful people
export const RECOMMENDED_HABITS = [
  // Morning routine
  { title: "Wake up early (before 6am)", category: "productivity", frequency: "daily", timeOfDay: "morning", source: "Tim Ferriss, Jocko Willink" },
  { title: "Morning sunlight (10 min)", category: "health", frequency: "daily", timeOfDay: "morning", source: "Andrew Huberman" },
  { title: "Cold shower/plunge", category: "health", frequency: "daily", timeOfDay: "morning", source: "Andrew Huberman, Wim Hof" },
  { title: "Meditate (10-20 min)", category: "mindfulness", frequency: "daily", timeOfDay: "morning", source: "Ray Dalio, Tim Ferriss" },
  { title: "Journal (5-minute journal)", category: "mindfulness", frequency: "daily", timeOfDay: "morning", source: "Tim Ferriss" },
  { title: "Delay caffeine 90 min", category: "health", frequency: "daily", timeOfDay: "morning", source: "Andrew Huberman" },

  // Exercise
  { title: "Exercise (30-60 min)", category: "fitness", frequency: "daily", timeOfDay: "morning", source: "Most successful people" },
  { title: "10,000 steps", category: "fitness", frequency: "daily", timeOfDay: "any", source: "General health" },
  { title: "Strength training", category: "fitness", frequency: "3x/week", timeOfDay: "any", source: "Peter Attia" },

  // Learning
  { title: "Read (30 min minimum)", category: "learning", frequency: "daily", timeOfDay: "evening", source: "Warren Buffett, Bill Gates" },
  { title: "Learn something new", category: "learning", frequency: "daily", timeOfDay: "any", source: "James Clear" },
  { title: "Study your craft", category: "learning", frequency: "daily", timeOfDay: "any", source: "Kobe Bryant" },

  // Productivity
  { title: "Deep work session (90 min)", category: "productivity", frequency: "daily", timeOfDay: "morning", source: "Cal Newport" },
  { title: "Review goals", category: "productivity", frequency: "daily", timeOfDay: "morning", source: "Tony Robbins" },
  { title: "Plan tomorrow tonight", category: "productivity", frequency: "daily", timeOfDay: "evening", source: "Multiple sources" },
  { title: "Inbox zero", category: "productivity", frequency: "daily", timeOfDay: "evening", source: "Tim Ferriss" },

  // Finance
  { title: "Track spending", category: "finance", frequency: "daily", timeOfDay: "evening", source: "Ramit Sethi" },
  { title: "Review investments", category: "finance", frequency: "weekly", timeOfDay: "any", source: "Warren Buffett" },

  // Health
  { title: "8 hours sleep", category: "health", frequency: "daily", timeOfDay: "evening", source: "Jeff Bezos, Andrew Huberman" },
  { title: "Drink water (8 glasses)", category: "health", frequency: "daily", timeOfDay: "any", source: "General health" },
  { title: "No phone before bed", category: "health", frequency: "daily", timeOfDay: "evening", source: "Multiple sources" },

  // Social
  { title: "Connect with someone", category: "social", frequency: "daily", timeOfDay: "any", source: "Adam Grant" },
  { title: "Gratitude practice", category: "mindfulness", frequency: "daily", timeOfDay: "evening", source: "Tim Ferriss" }
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
 * Load habits data
 */
export const loadHabits = () => {
  ensureDir();
  try {
    if (fs.existsSync(HABITS_PATH)) {
      return JSON.parse(fs.readFileSync(HABITS_PATH, "utf-8"));
    }
  } catch (err) {
    console.error("[Habits] Error loading habits:", err.message);
  }
  return {
    habits: [],
    completions: {},  // { "habit-id": { "2024-01-20": true, "2024-01-21": true } }
    createdAt: new Date().toISOString(),
    lastUpdated: null
  };
};

/**
 * Save habits data
 */
export const saveHabits = (data) => {
  ensureDir();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(HABITS_PATH, JSON.stringify(data, null, 2));
  return { success: true };
};

/**
 * Add a new habit
 */
export const addHabit = (title, options = {}) => {
  const data = loadHabits();

  const habit = {
    id: `habit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    category: options.category || "productivity",
    frequency: options.frequency || "daily",
    timeOfDay: options.timeOfDay || "any",
    reminderTime: options.reminderTime || null,
    source: options.source || null,
    createdAt: new Date().toISOString(),
    active: true
  };

  data.habits.push(habit);
  data.completions[habit.id] = {};
  saveHabits(data);

  return { success: true, habit };
};

/**
 * Complete a habit for today
 */
export const completeHabit = (habitId, date = null) => {
  const data = loadHabits();
  const dateKey = date || new Date().toISOString().split('T')[0];

  if (!data.completions[habitId]) {
    data.completions[habitId] = {};
  }

  data.completions[habitId][dateKey] = true;
  saveHabits(data);

  // Calculate current streak
  const streak = calculateStreak(habitId, data);

  return { success: true, date: dateKey, streak };
};

/**
 * Uncomplete a habit for today
 */
export const uncompleteHabit = (habitId, date = null) => {
  const data = loadHabits();
  const dateKey = date || new Date().toISOString().split('T')[0];

  if (data.completions[habitId]) {
    delete data.completions[habitId][dateKey];
    saveHabits(data);
  }

  return { success: true, date: dateKey };
};

/**
 * Calculate streak for a habit
 */
export const calculateStreak = (habitId, data = null) => {
  if (!data) data = loadHabits();

  const completions = data.completions[habitId] || {};
  const dates = Object.keys(completions).sort().reverse();

  if (dates.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < dates.length; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateKey = checkDate.toISOString().split('T')[0];

    if (completions[dateKey]) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
};

/**
 * Get today's habits status
 */
export const getTodayHabits = () => {
  const data = loadHabits();
  const today = new Date().toISOString().split('T')[0];

  return data.habits
    .filter(h => h.active)
    .map(habit => ({
      ...habit,
      completed: data.completions[habit.id]?.[today] || false,
      streak: calculateStreak(habit.id, data),
      categoryInfo: HABIT_CATEGORIES[habit.category] || HABIT_CATEGORIES.productivity
    }));
};

/**
 * Get habit statistics
 */
export const getHabitStats = (habitId, days = 30) => {
  const data = loadHabits();
  const habit = data.habits.find(h => h.id === habitId);

  if (!habit) {
    return { success: false, error: "Habit not found" };
  }

  const completions = data.completions[habitId] || {};
  const today = new Date();
  let completedDays = 0;

  for (let i = 0; i < days; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateKey = checkDate.toISOString().split('T')[0];

    if (completions[dateKey]) {
      completedDays++;
    }
  }

  const streak = calculateStreak(habitId, data);
  const completionRate = Math.round((completedDays / days) * 100);

  // Find longest streak
  let longestStreak = 0;
  let currentStreak = 0;
  const allDates = Object.keys(completions).sort();

  for (let i = 0; i < allDates.length; i++) {
    if (i === 0) {
      currentStreak = 1;
    } else {
      const prevDate = new Date(allDates[i - 1]);
      const currDate = new Date(allDates[i]);
      const diffDays = (currDate - prevDate) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        currentStreak++;
      } else {
        currentStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, currentStreak);
  }

  return {
    habit: habit.title,
    currentStreak: streak,
    longestStreak,
    completedDays,
    totalDays: days,
    completionRate,
    lastCompleted: allDates[allDates.length - 1] || null
  };
};

/**
 * Get overall habits summary
 */
export const getHabitsSummary = () => {
  const data = loadHabits();
  const today = new Date().toISOString().split('T')[0];

  const activeHabits = data.habits.filter(h => h.active);
  let completedToday = 0;
  let totalStreak = 0;
  let longestCurrentStreak = 0;

  const byCategory = {};

  for (const habit of activeHabits) {
    const isCompleted = data.completions[habit.id]?.[today] || false;
    const streak = calculateStreak(habit.id, data);

    if (isCompleted) completedToday++;
    totalStreak += streak;
    longestCurrentStreak = Math.max(longestCurrentStreak, streak);

    const cat = habit.category || "productivity";
    if (!byCategory[cat]) {
      byCategory[cat] = { total: 0, completed: 0 };
    }
    byCategory[cat].total++;
    if (isCompleted) byCategory[cat].completed++;
  }

  return {
    totalHabits: activeHabits.length,
    completedToday,
    completionRate: activeHabits.length > 0 ? Math.round((completedToday / activeHabits.length) * 100) : 0,
    averageStreak: activeHabits.length > 0 ? Math.round(totalStreak / activeHabits.length) : 0,
    longestCurrentStreak,
    byCategory
  };
};

/**
 * Remove a habit
 */
export const removeHabit = (habitId) => {
  const data = loadHabits();
  const index = data.habits.findIndex(h => h.id === habitId);

  if (index === -1) {
    return { success: false, error: "Habit not found" };
  }

  data.habits.splice(index, 1);
  delete data.completions[habitId];
  saveHabits(data);

  return { success: true };
};

/**
 * Toggle habit active status
 */
export const toggleHabitActive = (habitId) => {
  const data = loadHabits();
  const habit = data.habits.find(h => h.id === habitId);

  if (!habit) {
    return { success: false, error: "Habit not found" };
  }

  habit.active = !habit.active;
  saveHabits(data);

  return { success: true, active: habit.active };
};

/**
 * Format habits for CLI display
 */
export const formatHabitsDisplay = () => {
  const habits = getTodayHabits();
  const summary = getHabitsSummary();

  let output = "\n═══════════════════════════════════════════\n";
  output += "           DAILY HABITS\n";
  output += `           ${new Date().toLocaleDateString()}\n`;
  output += "═══════════════════════════════════════════\n\n";

  output += `Progress: ${summary.completedToday}/${summary.totalHabits} (${summary.completionRate}%)\n`;
  output += `Average Streak: ${summary.averageStreak} days | Best: ${summary.longestCurrentStreak} days\n\n`;

  // Group by time of day
  const morning = habits.filter(h => h.timeOfDay === "morning");
  const evening = habits.filter(h => h.timeOfDay === "evening");
  const anytime = habits.filter(h => h.timeOfDay === "any");

  const displayHabit = (h) => {
    const status = h.completed ? "✓" : "○";
    const streakDisplay = h.streak > 0 ? ` 🔥${h.streak}` : "";
    return `  ${status} ${h.categoryInfo.icon} ${h.title}${streakDisplay}\n`;
  };

  if (morning.length > 0) {
    output += "MORNING:\n";
    morning.forEach(h => output += displayHabit(h));
    output += "\n";
  }

  if (anytime.length > 0) {
    output += "ANYTIME:\n";
    anytime.forEach(h => output += displayHabit(h));
    output += "\n";
  }

  if (evening.length > 0) {
    output += "EVENING:\n";
    evening.forEach(h => output += displayHabit(h));
    output += "\n";
  }

  output += "═══════════════════════════════════════════\n";
  output += "Commands: /habits add <name> | /habits complete <#>\n";

  return output;
};

/**
 * Initialize default habits from recommendations
 */
export const initializeDefaultHabits = (categories = ["health", "productivity", "learning"]) => {
  const data = loadHabits();

  // Only initialize if no habits exist
  if (data.habits.length > 0) {
    return { success: false, error: "Habits already exist" };
  }

  const selected = RECOMMENDED_HABITS.filter(h => categories.includes(h.category));

  for (const rec of selected.slice(0, 5)) { // Start with 5 habits
    addHabit(rec.title, {
      category: rec.category,
      frequency: rec.frequency,
      timeOfDay: rec.timeOfDay,
      source: rec.source
    });
  }

  return { success: true, count: Math.min(5, selected.length) };
};

export default {
  HABIT_CATEGORIES,
  RECOMMENDED_HABITS,
  loadHabits,
  addHabit,
  completeHabit,
  uncompleteHabit,
  getTodayHabits,
  getHabitStats,
  getHabitsSummary,
  removeHabit,
  formatHabitsDisplay,
  initializeDefaultHabits
};
