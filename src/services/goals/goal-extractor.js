/**
 * Goal Extractor Service
 *
 * Automatically extracts goals from user conversations
 * and saves them to the goals system.
 */

import fs from "fs";
import path from "path";

import { getDataDir, getMemoryDir } from "../paths.js";
const DATA_DIR = getDataDir();
const GOALS_PATH = path.join(DATA_DIR, "goals.json");
const MEMORY_DIR = getMemoryDir();
const GOALS_MEMORY_PATH = path.join(MEMORY_DIR, "goals.md");

// Goal categories
const GOAL_CATEGORIES = {
  finance: ["money", "save", "invest", "income", "salary", "debt", "pay off", "budget", "wealth", "rich", "million", "retire"],
  health: ["health", "exercise", "workout", "gym", "weight", "sleep", "diet", "eat", "run", "fitness", "lose", "gain"],
  career: ["job", "career", "work", "promotion", "raise", "business", "startup", "company", "hire", "quit", "interview"],
  education: ["learn", "study", "course", "degree", "school", "college", "read", "book", "skill", "certificate"],
  family: ["family", "kids", "children", "spouse", "wife", "husband", "parent", "relationship", "friend", "marry"],
  growth: ["goal", "improve", "better", "habit", "routine", "productivity", "meditat", "focus", "discipline"]
};

// Intent indicators that suggest goals
const GOAL_INDICATORS = [
  "i want to",
  "i need to",
  "i should",
  "i will",
  "i'm going to",
  "i plan to",
  "my goal is",
  "i aim to",
  "i'd like to",
  "i hope to",
  "trying to",
  "working on",
  "planning to",
  "want to",
  "need to",
  "gotta",
  "have to"
];

// Time frame indicators
const TIME_FRAMES = {
  "this week": { days: 7, urgency: "high" },
  "this month": { days: 30, urgency: "medium" },
  "this year": { days: 365, urgency: "low" },
  "by end of": { days: null, urgency: "medium" },
  "before": { days: null, urgency: "medium" },
  "in a": { days: null, urgency: "low" },
  "soon": { days: 14, urgency: "medium" },
  "tomorrow": { days: 1, urgency: "high" },
  "today": { days: 0, urgency: "high" }
};

/**
 * Ensure directories exist
 */
const ensureDirs = () => {
  [DATA_DIR, MEMORY_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

/**
 * Load existing goals
 */
export const loadGoals = () => {
  ensureDirs();
  try {
    if (fs.existsSync(GOALS_PATH)) {
      const data = JSON.parse(fs.readFileSync(GOALS_PATH, "utf-8"));
      return Array.isArray(data) ? { goals: data, lastUpdated: null } : data;
    }
  } catch (err) {
    console.error("[GoalExtractor] Error loading goals:", err.message);
  }
  return { goals: [], lastUpdated: null };
};

/**
 * Save goals
 */
export const saveGoals = (goalsData) => {
  ensureDirs();
  goalsData.lastUpdated = new Date().toISOString();
  fs.writeFileSync(GOALS_PATH, JSON.stringify(goalsData, null, 2));

  // Also update markdown file
  updateGoalsMarkdown(goalsData.goals);

  return { success: true, path: GOALS_PATH };
};

/**
 * Update goals markdown file
 */
const updateGoalsMarkdown = (goals) => {
  let content = "# My Goals\n\n";
  content += `*Last updated: ${new Date().toLocaleDateString()}*\n\n`;

  // Group by category
  const byCategory = {};
  for (const goal of goals) {
    const cat = goal.category || "general";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(goal);
  }

  for (const [category, categoryGoals] of Object.entries(byCategory)) {
    content += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
    for (const goal of categoryGoals) {
      const status = goal.status === "completed" ? "✅" : goal.progress > 0.5 ? "🟡" : "⬜";
      const progress = Math.round((goal.progress || 0) * 100);
      content += `- ${status} **${goal.title}** (${progress}%)\n`;
      if (goal.description) {
        content += `  - ${goal.description}\n`;
      }
      if (goal.dueDate) {
        content += `  - Due: ${goal.dueDate}\n`;
      }
    }
    content += "\n";
  }

  fs.writeFileSync(GOALS_MEMORY_PATH, content);
};

/**
 * Detect category from text
 */
const detectCategory = (text) => {
  const lower = text.toLowerCase();

  for (const [category, keywords] of Object.entries(GOAL_CATEGORIES)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category;
      }
    }
  }

  return "growth"; // Default category
};

/**
 * Detect time frame from text
 */
const detectTimeFrame = (text) => {
  const lower = text.toLowerCase();

  for (const [phrase, data] of Object.entries(TIME_FRAMES)) {
    if (lower.includes(phrase)) {
      return data;
    }
  }

  return { days: 90, urgency: "low" }; // Default: 90 days
};

/**
 * Extract goals from a message
 */
export const extractGoalsFromMessage = (message) => {
  const extracted = [];
  const lower = message.toLowerCase();

  // Find sentences with goal indicators
  const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);

  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();

    for (const indicator of GOAL_INDICATORS) {
      if (sentenceLower.includes(indicator)) {
        // Extract the goal part (after the indicator)
        const indicatorIndex = sentenceLower.indexOf(indicator);
        let goalText = sentence.slice(indicatorIndex + indicator.length).trim();

        // Clean up the goal text
        goalText = goalText
          .replace(/^(to|that|if)\s+/i, "")
          .replace(/\s+/g, " ")
          .trim();

        if (goalText.length > 5 && goalText.length < 200) {
          const category = detectCategory(goalText);
          const timeFrame = detectTimeFrame(sentence);

          // Create a proper title (capitalize first letter)
          const title = goalText.charAt(0).toUpperCase() + goalText.slice(1);

          extracted.push({
            id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: title.slice(0, 100), // Limit title length
            description: sentence.trim(),
            category,
            progress: 0,
            status: "active",
            urgency: timeFrame.urgency,
            extractedAt: new Date().toISOString(),
            source: "conversation"
          });

          break; // Only extract one goal per sentence
        }
      }
    }
  }

  return extracted;
};

/**
 * Process message and add new goals
 */
export const processMessageForGoals = (message) => {
  const extracted = extractGoalsFromMessage(message);

  if (extracted.length === 0) {
    return { found: false, goals: [] };
  }

  // Load existing goals
  const goalsData = loadGoals();
  const existingTitles = new Set((goalsData.goals || []).map(g => (g.title || "").toLowerCase()));

  // Filter out duplicates (similar titles)
  const newGoals = extracted.filter(g => {
    const titleLower = (g.title || "").toLowerCase();
    // Check if we already have a similar goal
    for (const existing of existingTitles) {
      // Simple similarity check - if 80% of words match
      const newWords = new Set(titleLower.split(" "));
      const existingWords = new Set(existing.split(" "));
      const intersection = [...newWords].filter(w => existingWords.has(w));
      if (intersection.length / Math.max(newWords.size, existingWords.size) > 0.8) {
        return false; // Too similar
      }
    }
    return true;
  });

  if (newGoals.length > 0) {
    goalsData.goals.push(...newGoals);
    saveGoals(goalsData);
  }

  return {
    found: true,
    goals: newGoals,
    total: extracted.length,
    added: newGoals.length,
    duplicates: extracted.length - newGoals.length
  };
};

/**
 * Get goal summary
 */
export const getGoalSummary = () => {
  const goalsData = loadGoals();
  const goals = goalsData.goals || [];

  const summary = {
    total: goals.length,
    byCategory: {},
    byStatus: {
      active: 0,
      completed: 0,
      paused: 0
    },
    byUrgency: {
      high: 0,
      medium: 0,
      low: 0
    },
    avgProgress: 0,
    topGoals: []
  };

  // Calculate stats
  let totalProgress = 0;
  for (const goal of goals) {
    // By category
    const cat = goal.category || "general";
    if (!summary.byCategory[cat]) {
      summary.byCategory[cat] = { count: 0, avgProgress: 0, totalProgress: 0 };
    }
    summary.byCategory[cat].count++;
    summary.byCategory[cat].totalProgress += goal.progress || 0;

    // By status
    const status = goal.status || "active";
    if (summary.byStatus[status] !== undefined) {
      summary.byStatus[status]++;
    }

    // By urgency
    const urgency = goal.urgency || "low";
    if (summary.byUrgency[urgency] !== undefined) {
      summary.byUrgency[urgency]++;
    }

    totalProgress += goal.progress || 0;
  }

  // Calculate averages
  if (goals.length > 0) {
    summary.avgProgress = Math.round((totalProgress / goals.length) * 100);
  }

  for (const cat of Object.keys(summary.byCategory)) {
    const catData = summary.byCategory[cat];
    catData.avgProgress = Math.round((catData.totalProgress / catData.count) * 100);
    delete catData.totalProgress;
  }

  // Top goals (highest priority incomplete goals)
  summary.topGoals = goals
    .filter(g => g.status !== "completed")
    .sort((a, b) => {
      // Sort by urgency then by progress
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      const urgencyDiff = (urgencyOrder[a.urgency] || 2) - (urgencyOrder[b.urgency] || 2);
      if (urgencyDiff !== 0) return urgencyDiff;
      return (a.progress || 0) - (b.progress || 0);
    })
    .slice(0, 5)
    .map(g => ({
      title: g.title,
      category: g.category,
      progress: Math.round((g.progress || 0) * 100),
      urgency: g.urgency
    }));

  return summary;
};

/**
 * Update goal progress
 */
export const updateGoalProgress = (goalId, progress, status = null) => {
  const goalsData = loadGoals();
  const goal = goalsData.goals.find(g => g.id === goalId);

  if (!goal) {
    return { success: false, error: "Goal not found" };
  }

  goal.progress = Math.min(1, Math.max(0, progress));
  goal.updatedAt = new Date().toISOString();

  if (status) {
    goal.status = status;
  }

  if (goal.progress >= 1 && goal.status !== "completed") {
    goal.status = "completed";
    goal.completedAt = new Date().toISOString();
  }

  saveGoals(goalsData);

  return { success: true, goal };
};

/**
 * Format goals for CLI display
 */
export const formatGoalsDisplay = () => {
  const goalsData = loadGoals();
  const summary = getGoalSummary();

  let output = "\n═══════════════════════════════════════════\n";
  output += "           YOUR GOALS\n";
  output += "═══════════════════════════════════════════\n\n";

  output += `Total Goals: ${summary.total} | Average Progress: ${summary.avgProgress}%\n`;
  output += `Active: ${summary.byStatus.active} | Completed: ${summary.byStatus.completed}\n\n`;

  // Top priority goals
  if (summary.topGoals.length > 0) {
    output += "TOP PRIORITY GOALS:\n";
    summary.topGoals.forEach((goal, i) => {
      const urgencyIcon = goal.urgency === "high" ? "🔴" : goal.urgency === "medium" ? "🟡" : "🟢";
      const progressBar = "█".repeat(Math.floor(goal.progress / 10)) + "░".repeat(10 - Math.floor(goal.progress / 10));
      output += `  ${i + 1}. ${urgencyIcon} ${(goal.title || "Untitled").slice(0, 40)}\n`;
      output += `     [${progressBar}] ${goal.progress}%  (${goal.category})\n`;
    });
    output += "\n";
  }

  // By category
  output += "BY CATEGORY:\n";
  for (const [cat, data] of Object.entries(summary.byCategory)) {
    output += `  ${cat.charAt(0).toUpperCase() + cat.slice(1)}: ${data.count} goals (${data.avgProgress}% avg)\n`;
  }

  output += "\n═══════════════════════════════════════════\n";

  return output;
};

export default {
  loadGoals,
  saveGoals,
  extractGoalsFromMessage,
  processMessageForGoals,
  getGoalSummary,
  updateGoalProgress,
  formatGoalsDisplay
};
