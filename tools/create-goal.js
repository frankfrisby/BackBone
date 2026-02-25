/**
 * Tool: Create Goal
 *
 * Create a new goal in goals.json.
 */

import fs from "fs";
import { dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "create-goal",
  name: "Create Goal",
  description: "Create a new trackable goal with category and optional tasks",
  category: "goals"
};

export async function execute(inputs = {}) {
  const { title, category, priority = 3, tasks = [] } = inputs;

  if (!title) return { success: false, error: "title is required" };
  if (!category) return { success: false, error: "category is required" };

  const validCategories = ["health", "finance", "career", "learning", "personal", "social"];
  if (!validCategories.includes(category)) {
    return { success: false, error: `category must be one of: ${validCategories.join(", ")}` };
  }

  try {
    const goalsPath = dataFile("goals.json");
    let goals = [];
    if (fs.existsSync(goalsPath)) {
      goals = JSON.parse(fs.readFileSync(goalsPath, "utf-8"));
      if (!Array.isArray(goals)) goals = goals.goals || [];
    }

    const id = `goal_${category}_${Date.now()}`;
    const newGoal = {
      id,
      title,
      category,
      priority,
      status: "active",
      progress: 0,
      tasks: tasks.map((t, i) => ({ id: `${id}_task_${i}`, title: t, done: false })),
      milestones: [
        { target: 25, label: "Started", achieved: false },
        { target: 50, label: "Halfway", achieved: false },
        { target: 75, label: "Almost there", achieved: false },
        { target: 100, label: "Complete", achieved: false }
      ],
      createdAt: new Date().toISOString()
    };

    goals.push(newGoal);
    fs.writeFileSync(goalsPath, JSON.stringify(goals, null, 2));

    return { success: true, goal: newGoal };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { metadata, execute };
