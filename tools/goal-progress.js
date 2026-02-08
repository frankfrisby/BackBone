/**
 * Tool: Goal Progress
 *
 * Get progress on active goals.
 */

import fs from "fs";
import path from "path";
import { dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "goal-progress",
  name: "Goal Progress",
  description: "Get progress on active goals",
  category: "goals"
};

/**
 * Execute the tool
 * @param {Object} inputs - { category }
 * @returns {Promise<Object>} Result
 */
export async function execute(inputs = {}) {
  try {
    const goalsPath = dataFile("goals.json");

    if (!fs.existsSync(goalsPath)) {
      return { success: false, error: "No goals data available" };
    }

    const goalsData = JSON.parse(fs.readFileSync(goalsPath, "utf-8"));
    let goals = goalsData.goals || goalsData || [];

    // Filter by status and optionally category
    let activeGoals = goals.filter(g => g.status === "active" || g.status === "in_progress");

    if (inputs.category) {
      activeGoals = activeGoals.filter(g => g.category === inputs.category);
    }

    // Calculate stats
    const totalProgress = activeGoals.reduce((sum, g) => sum + (g.progress || 0), 0);
    const avgProgress = activeGoals.length > 0 ? totalProgress / activeGoals.length : 0;

    // Find completed goals
    const completedGoals = goals.filter(g => g.status === "completed");

    return {
      success: true,
      stats: {
        activeCount: activeGoals.length,
        completedCount: completedGoals.length,
        avgProgress: Math.round(avgProgress) + "%",
        totalGoals: goals.length
      },
      activeGoals: activeGoals.map(g => ({
        id: g.id,
        title: g.title,
        category: g.category,
        progress: g.progress || 0,
        status: g.status,
        priority: g.priority,
        dueDate: g.dueDate || null
      })),
      recentCompleted: completedGoals.slice(-3).map(g => ({
        title: g.title,
        category: g.category,
        completedAt: g.completedAt
      })),
      summary: activeGoals.length > 0
        ? `${activeGoals.length} active goals at ${Math.round(avgProgress)}% average progress`
        : "No active goals"
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { metadata, execute };
