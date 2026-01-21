/**
 * AI-Powered Recommendations Engine
 *
 * Analyzes user data, goals, habits, and patterns to provide
 * personalized recommendations based on successful people's strategies.
 */

import fs from "fs";
import path from "path";
import { loadGoals, getGoalSummary } from "./goal-extractor.js";
import { getTodayHabits, getHabitsSummary, RECOMMENDED_HABITS } from "./habits.js";
import { MENTORS, getMentorsByCategory } from "./mentors.js";

const DATA_DIR = path.join(process.cwd(), "data");
const RECS_PATH = path.join(DATA_DIR, "recommendations.json");
const MEMORY_DIR = path.join(process.cwd(), "memory");

// Recommendation categories
const REC_CATEGORIES = {
  immediate: { priority: 1, label: "Do Today", icon: "!" },
  shortTerm: { priority: 2, label: "This Week", icon: ">" },
  strategic: { priority: 3, label: "Strategic", icon: "*" },
  habit: { priority: 4, label: "Build Habit", icon: "~" },
  learning: { priority: 5, label: "Learn", icon: "?" }
};

// Action templates based on life areas
const ACTION_TEMPLATES = {
  finance: [
    { trigger: "no_budget", rec: "Create a monthly budget using the 50/30/20 rule", mentor: "ramitSethi", category: "immediate" },
    { trigger: "no_investing", rec: "Set up automatic investing - even $100/month compounds", mentor: "warrenBuffett", category: "shortTerm" },
    { trigger: "debt", rec: "List all debts and create a payoff plan (avalanche or snowball)", mentor: "ramitSethi", category: "immediate" },
    { trigger: "low_savings", rec: "Build 6-month emergency fund before aggressive investing", mentor: "warrenBuffett", category: "strategic" },
    { trigger: "no_tracking", rec: "Track every expense for 30 days to find leaks", mentor: "ramitSethi", category: "habit" }
  ],
  health: [
    { trigger: "poor_sleep", rec: "Optimize sleep: same time daily, no screens 1hr before, cool room", mentor: "andrewHuberman", category: "habit" },
    { trigger: "no_exercise", rec: "Start with 10-minute walks daily, build from there", mentor: "peterAttia", category: "immediate" },
    { trigger: "no_morning_routine", rec: "Get morning sunlight within 30 min of waking", mentor: "andrewHuberman", category: "habit" },
    { trigger: "stress", rec: "Add 5-minute meditation or breathing exercises", mentor: "timFerriss", category: "immediate" },
    { trigger: "low_energy", rec: "Delay caffeine 90-120 min after waking for better energy", mentor: "andrewHuberman", category: "habit" }
  ],
  career: [
    { trigger: "stuck", rec: "Document your wins weekly - builds case for promotion", mentor: "timFerriss", category: "habit" },
    { trigger: "no_network", rec: "Reach out to 5 people in your industry this week", mentor: "adamGrant", category: "shortTerm" },
    { trigger: "skill_gap", rec: "Dedicate 1 hour daily to skill development", mentor: "kobeByrant", category: "habit" },
    { trigger: "unclear_goals", rec: "Write down specific career goals with deadlines", mentor: "tonyRobbins", category: "immediate" },
    { trigger: "low_visibility", rec: "Share your work publicly - build your personal brand", mentor: "garyvee", category: "strategic" }
  ],
  startup: [
    { trigger: "no_validation", rec: "Talk to 10 potential customers this week", mentor: "elonMusk", category: "immediate" },
    { trigger: "feature_creep", rec: "Focus on one core feature that solves a real problem", mentor: "elonMusk", category: "strategic" },
    { trigger: "slow_progress", rec: "Work in focused 90-min deep work blocks", mentor: "calNewport", category: "habit" },
    { trigger: "no_metrics", rec: "Define and track your North Star metric", mentor: "elonMusk", category: "immediate" },
    { trigger: "burnout", rec: "Schedule recovery time - sustainable pace wins long-term", mentor: "rayDalio", category: "shortTerm" }
  ],
  learning: [
    { trigger: "no_reading", rec: "Read 30 minutes daily - 15 books/year compounds knowledge", mentor: "warrenBuffett", category: "habit" },
    { trigger: "no_reflection", rec: "Journal for 10 minutes daily on lessons learned", mentor: "rayDalio", category: "habit" },
    { trigger: "passive_learning", rec: "Apply what you learn immediately - teach others", mentor: "feynman", category: "strategic" },
    { trigger: "scattered_focus", rec: "Pick one skill to master deeply before moving on", mentor: "kobeByrant", category: "strategic" }
  ],
  productivity: [
    { trigger: "low_focus", rec: "Block 2 hours each morning for deep work - no meetings", mentor: "calNewport", category: "immediate" },
    { trigger: "overwhelmed", rec: "List top 3 priorities for tomorrow tonight", mentor: "timFerriss", category: "habit" },
    { trigger: "procrastination", rec: "Use the 2-minute rule: if it takes <2 min, do it now", mentor: "jamesClear", category: "habit" },
    { trigger: "no_systems", rec: "Build systems, not goals - design your environment", mentor: "jamesClear", category: "strategic" },
    { trigger: "context_switching", rec: "Batch similar tasks together to reduce switching cost", mentor: "calNewport", category: "shortTerm" }
  ]
};

// Life situation analysis patterns
const SITUATION_PATTERNS = {
  earlyCareer: {
    indicators: ["learning", "entry", "junior", "intern", "graduate"],
    focus: ["skill_building", "networking", "savings_foundation"],
    mentors: ["kobeByrant", "garyvee", "jamesClear"]
  },
  midCareer: {
    indicators: ["senior", "lead", "manager", "experienced"],
    focus: ["leadership", "strategic_thinking", "wealth_building"],
    mentors: ["rayDalio", "warrenBuffett", "tonyRobbins"]
  },
  entrepreneur: {
    indicators: ["startup", "founder", "business", "entrepreneur"],
    focus: ["product_market_fit", "team_building", "fundraising"],
    mentors: ["elonMusk", "steveJobs", "peterThiel"]
  },
  healthFocused: {
    indicators: ["health", "fitness", "weight", "energy", "sleep"],
    focus: ["exercise_routine", "sleep_optimization", "nutrition"],
    mentors: ["andrewHuberman", "peterAttia", "timFerriss"]
  }
};

/**
 * Ensure data directory exists
 */
const ensureDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Load recommendations data
 */
export const loadRecommendations = () => {
  ensureDir();
  try {
    if (fs.existsSync(RECS_PATH)) {
      return JSON.parse(fs.readFileSync(RECS_PATH, "utf-8"));
    }
  } catch (err) {
    console.error("[Recommendations] Error loading:", err.message);
  }
  return {
    recommendations: [],
    actedUpon: [],
    dismissed: [],
    lastGenerated: null,
    userSituation: null
  };
};

/**
 * Save recommendations
 */
export const saveRecommendations = (data) => {
  ensureDir();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(RECS_PATH, JSON.stringify(data, null, 2));
  return { success: true };
};

/**
 * Load user profile data
 */
const loadUserData = () => {
  const data = {
    profile: null,
    goals: [],
    habits: [],
    context: null
  };

  try {
    // Load profile
    const profilePath = path.join(DATA_DIR, "profile.json");
    if (fs.existsSync(profilePath)) {
      data.profile = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
    }

    // Load goals
    const goalsData = loadGoals();
    data.goals = goalsData.goals || [];

    // Load habits
    const habitsPath = path.join(DATA_DIR, "habits.json");
    if (fs.existsSync(habitsPath)) {
      const habitsData = JSON.parse(fs.readFileSync(habitsPath, "utf-8"));
      data.habits = habitsData.habits || [];
    }

    // Load user context from memory
    const contextPath = path.join(MEMORY_DIR, "user-context.md");
    if (fs.existsSync(contextPath)) {
      data.context = fs.readFileSync(contextPath, "utf-8");
    }

    // Load LinkedIn data
    const linkedinPath = path.join(DATA_DIR, "linkedin-profile.json");
    if (fs.existsSync(linkedinPath)) {
      data.linkedin = JSON.parse(fs.readFileSync(linkedinPath, "utf-8"));
    }
  } catch (err) {
    console.error("[Recommendations] Error loading user data:", err.message);
  }

  return data;
};

/**
 * Detect user's current life situation
 */
export const detectUserSituation = (userData) => {
  const situations = [];
  const allText = [
    userData.context || "",
    JSON.stringify(userData.profile || {}),
    JSON.stringify(userData.linkedin || {}),
    userData.goals.map(g => g.title).join(" ")
  ].join(" ").toLowerCase();

  for (const [situation, config] of Object.entries(SITUATION_PATTERNS)) {
    const matchCount = config.indicators.filter(ind => allText.includes(ind)).length;
    if (matchCount > 0) {
      situations.push({
        type: situation,
        confidence: matchCount / config.indicators.length,
        focus: config.focus,
        mentors: config.mentors
      });
    }
  }

  // Sort by confidence
  situations.sort((a, b) => b.confidence - a.confidence);
  return situations;
};

/**
 * Analyze gaps in user's current practices
 */
export const analyzeGaps = (userData) => {
  const gaps = [];
  const habitsSummary = getHabitsSummary();
  const goalsSummary = getGoalSummary();

  // Check habit gaps
  const activeHabits = userData.habits.filter(h => h.active).map(h => h.title.toLowerCase());

  // Morning routine check
  const hasMorningRoutine = activeHabits.some(h =>
    h.includes("morning") || h.includes("wake") || h.includes("sunlight")
  );
  if (!hasMorningRoutine) {
    gaps.push({ area: "health", trigger: "no_morning_routine" });
  }

  // Exercise check
  const hasExercise = activeHabits.some(h =>
    h.includes("exercise") || h.includes("workout") || h.includes("gym") || h.includes("run")
  );
  if (!hasExercise) {
    gaps.push({ area: "health", trigger: "no_exercise" });
  }

  // Reading check
  const hasReading = activeHabits.some(h =>
    h.includes("read") || h.includes("book")
  );
  if (!hasReading) {
    gaps.push({ area: "learning", trigger: "no_reading" });
  }

  // Productivity check
  if (habitsSummary.completionRate < 50) {
    gaps.push({ area: "productivity", trigger: "low_focus" });
  }

  // Goal analysis
  if (goalsSummary.total === 0) {
    gaps.push({ area: "productivity", trigger: "unclear_goals" });
  }

  // Finance gaps
  const hasFinanceGoal = userData.goals.some(g =>
    g.category === "finance" || g.title.toLowerCase().includes("money") ||
    g.title.toLowerCase().includes("save") || g.title.toLowerCase().includes("invest")
  );
  if (!hasFinanceGoal) {
    gaps.push({ area: "finance", trigger: "no_tracking" });
  }

  // Network/Social
  const hasSocialHabit = activeHabits.some(h =>
    h.includes("connect") || h.includes("network") || h.includes("reach out")
  );
  if (!hasSocialHabit) {
    gaps.push({ area: "career", trigger: "no_network" });
  }

  return gaps;
};

/**
 * Generate personalized recommendations
 */
export const generateRecommendations = () => {
  const userData = loadUserData();
  const gaps = analyzeGaps(userData);
  const situations = detectUserSituation(userData);
  const currentRecs = loadRecommendations();

  const newRecommendations = [];
  const existingTexts = new Set([
    ...currentRecs.recommendations.map(r => r.text),
    ...currentRecs.actedUpon.map(r => r.text),
    ...currentRecs.dismissed.map(r => r.text)
  ]);

  // Generate recommendations based on gaps
  for (const gap of gaps) {
    const templates = ACTION_TEMPLATES[gap.area] || [];
    const template = templates.find(t => t.trigger === gap.trigger);

    if (template && !existingTexts.has(template.rec)) {
      const mentor = MENTORS[template.mentor];
      newRecommendations.push({
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text: template.rec,
        area: gap.area,
        category: template.category,
        mentor: mentor ? {
          name: mentor.name,
          role: mentor.role
        } : null,
        trigger: gap.trigger,
        createdAt: new Date().toISOString(),
        priority: REC_CATEGORIES[template.category]?.priority || 3
      });
    }
  }

  // Add situation-based recommendations
  if (situations.length > 0) {
    const primarySituation = situations[0];
    const mentorIds = primarySituation.mentors || [];

    for (const mentorId of mentorIds.slice(0, 2)) {
      const mentor = MENTORS[mentorId];
      if (mentor && mentor.principles) {
        const principle = mentor.principles[Math.floor(Math.random() * mentor.principles.length)];
        const recText = `${mentor.name}: ${principle}`;

        if (!existingTexts.has(recText)) {
          newRecommendations.push({
            id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            text: recText,
            area: primarySituation.focus[0] || "growth",
            category: "strategic",
            mentor: { name: mentor.name, role: mentor.role },
            trigger: "situation_match",
            createdAt: new Date().toISOString(),
            priority: 3
          });
        }
      }
    }
  }

  // Sort by priority
  newRecommendations.sort((a, b) => a.priority - b.priority);

  // Save and return
  currentRecs.recommendations = [
    ...newRecommendations,
    ...currentRecs.recommendations
  ].slice(0, 20); // Keep top 20

  currentRecs.lastGenerated = new Date().toISOString();
  currentRecs.userSituation = situations[0] || null;
  saveRecommendations(currentRecs);

  return {
    success: true,
    new: newRecommendations.length,
    total: currentRecs.recommendations.length,
    recommendations: newRecommendations,
    situation: situations[0] || null
  };
};

/**
 * Get top recommendations
 */
export const getTopRecommendations = (limit = 5) => {
  const data = loadRecommendations();
  return data.recommendations
    .sort((a, b) => a.priority - b.priority)
    .slice(0, limit);
};

/**
 * Mark recommendation as acted upon
 */
export const actOnRecommendation = (recId) => {
  const data = loadRecommendations();
  const index = data.recommendations.findIndex(r => r.id === recId);

  if (index === -1) {
    return { success: false, error: "Recommendation not found" };
  }

  const rec = data.recommendations[index];
  rec.actedAt = new Date().toISOString();
  data.actedUpon.push(rec);
  data.recommendations.splice(index, 1);
  saveRecommendations(data);

  return { success: true, recommendation: rec };
};

/**
 * Dismiss recommendation
 */
export const dismissRecommendation = (recId) => {
  const data = loadRecommendations();
  const index = data.recommendations.findIndex(r => r.id === recId);

  if (index === -1) {
    return { success: false, error: "Recommendation not found" };
  }

  const rec = data.recommendations[index];
  rec.dismissedAt = new Date().toISOString();
  data.dismissed.push(rec);
  data.recommendations.splice(index, 1);
  saveRecommendations(data);

  return { success: true };
};

/**
 * Get recommendation statistics
 */
export const getRecommendationStats = () => {
  const data = loadRecommendations();

  return {
    active: data.recommendations.length,
    actedUpon: data.actedUpon.length,
    dismissed: data.dismissed.length,
    lastGenerated: data.lastGenerated,
    userSituation: data.userSituation,
    byCategory: data.recommendations.reduce((acc, r) => {
      const cat = r.category || "general";
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {}),
    byArea: data.recommendations.reduce((acc, r) => {
      const area = r.area || "general";
      acc[area] = (acc[area] || 0) + 1;
      return acc;
    }, {})
  };
};

/**
 * Get daily focus recommendation
 */
export const getDailyFocus = () => {
  const recs = getTopRecommendations(3);
  const userData = loadUserData();
  const habitsSummary = getHabitsSummary();

  // Find the most impactful immediate action
  const immediateRec = recs.find(r => r.category === "immediate") || recs[0];

  // Get habit focus
  const habits = getTodayHabits();
  const incompleteHabits = habits.filter(h => !h.completed);
  const habitFocus = incompleteHabits[0];

  // Generate focus message
  const focus = {
    recommendation: immediateRec,
    habit: habitFocus,
    habitProgress: habitsSummary.completionRate,
    message: null
  };

  if (immediateRec && habitFocus) {
    focus.message = `Focus today: ${immediateRec.text.slice(0, 50)}... Also: ${habitFocus.title}`;
  } else if (immediateRec) {
    focus.message = `Focus today: ${immediateRec.text}`;
  } else if (habitFocus) {
    focus.message = `Complete your habit: ${habitFocus.title}`;
  } else {
    focus.message = "Great job! Stay consistent with your routines.";
  }

  return focus;
};

/**
 * Format recommendations for CLI display
 */
export const formatRecommendationsDisplay = () => {
  const recs = getTopRecommendations(5);
  const stats = getRecommendationStats();
  const focus = getDailyFocus();

  let output = "\n";
  output += "                 AI RECOMMENDATIONS\n";
  output += "                                                           \n\n";

  // Daily focus
  output += "TODAY'S FOCUS:\n";
  output += `  ${focus.message}\n\n`;

  // Top recommendations
  output += "TOP RECOMMENDATIONS:\n";
  if (recs.length === 0) {
    output += "  No recommendations yet. Use the app more to generate insights.\n";
  } else {
    recs.forEach((rec, i) => {
      const cat = REC_CATEGORIES[rec.category] || REC_CATEGORIES.strategic;
      const mentorStr = rec.mentor ? ` (${rec.mentor.name})` : "";
      output += `  ${cat.icon} ${rec.text.slice(0, 60)}${rec.text.length > 60 ? "..." : ""}${mentorStr}\n`;
      output += `    [${rec.area}] ${cat.label}\n`;
    });
  }

  output += "\n";

  // Stats
  output += "STATS:\n";
  output += `  Active: ${stats.active} | Acted On: ${stats.actedUpon} | Dismissed: ${stats.dismissed}\n`;

  if (stats.userSituation) {
    output += `  Detected Focus: ${stats.userSituation.type} (${Math.round(stats.userSituation.confidence * 100)}% match)\n`;
  }

  output += "\n";
  output += "Commands: /recs refresh | /recs done <#> | /recs dismiss <#>\n";

  return output;
};

export default {
  loadRecommendations,
  generateRecommendations,
  getTopRecommendations,
  actOnRecommendation,
  dismissRecommendation,
  getRecommendationStats,
  getDailyFocus,
  formatRecommendationsDisplay,
  detectUserSituation,
  analyzeGaps
};
