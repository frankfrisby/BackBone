import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

/**
 * Goal Tracker Service for BACKBONE
 * Manages life goals and progress tracking
 * Goals are user-created or graduated from the backlog via the thinking engine.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const GOALS_PATH = path.join(DATA_DIR, "goals.json");

// Goal categories
export const GOAL_CATEGORY = {
  FINANCE: "finance",
  HEALTH: "health",
  FAMILY: "family",
  CAREER: "career",
  GROWTH: "growth",
  EDUCATION: "education"
};

// Goal status
export const GOAL_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  ABANDONED: "abandoned"
};

// Category colors
export const CATEGORY_COLORS = {
  [GOAL_CATEGORY.FINANCE]: "#eab308",
  [GOAL_CATEGORY.HEALTH]: "#22c55e",
  [GOAL_CATEGORY.FAMILY]: "#ec4899",
  [GOAL_CATEGORY.CAREER]: "#8b5cf6",
  [GOAL_CATEGORY.GROWTH]: "#3b82f6",
  [GOAL_CATEGORY.EDUCATION]: "#06b6d4"
};

// Category icons
export const CATEGORY_ICONS = {
  [GOAL_CATEGORY.FINANCE]: "$",
  [GOAL_CATEGORY.HEALTH]: "\u2665", // Heart
  [GOAL_CATEGORY.FAMILY]: "\u263A", // Smiley
  [GOAL_CATEGORY.CAREER]: "\u2605", // Star
  [GOAL_CATEGORY.GROWTH]: "\u2191", // Up arrow
  [GOAL_CATEGORY.EDUCATION]: "\u2302" // House/graduation
};


/**
 * Goal Tracker Class
 */
export class GoalTracker extends EventEmitter {
  constructor() {
    super();
    this.goals = [];
    this.load();
  }

  /**
   * Load goals from disk
   * Returns empty array if no goals — user creates their own or they graduate from the backlog
   */
  load() {
    try {
      if (fs.existsSync(GOALS_PATH)) {
        const data = JSON.parse(fs.readFileSync(GOALS_PATH, "utf-8"));
        this.goals = data.goals || [];
      } else {
        this.goals = [];
      }
    } catch (error) {
      console.error("Failed to load goals:", error.message);
      this.goals = [];
    }
  }

  /**
   * Save goals to disk
   */
  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(GOALS_PATH, JSON.stringify({
        goals: this.goals,
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (error) {
      console.error("Failed to save goals:", error.message);
    }
  }

  /**
   * Get all goals
   */
  getAll() {
    return this.goals;
  }

  /**
   * Get active goals
   */
  getActive() {
    return this.goals.filter(g => g.status === GOAL_STATUS.ACTIVE);
  }

  /**
   * Get goal by ID
   */
  getById(goalId) {
    return this.goals.find(g => g.id === goalId);
  }

  /**
   * Get goals by category
   */
  getByCategory(category) {
    return this.goals.filter(g => g.category === category);
  }

  /**
   * Calculate progress percentage for a goal
   */
  calculateProgress(goal) {
    if (goal.targetValue === goal.startValue) return 0;
    const progress = (goal.currentValue - goal.startValue) / (goal.targetValue - goal.startValue);
    return Math.max(0, Math.min(1, progress));
  }

  /**
   * Update goal progress
   */
  updateProgress(goalId, currentValue) {
    const goal = this.getById(goalId);
    if (!goal) return null;

    const oldValue = goal.currentValue;
    goal.currentValue = currentValue;
    goal.updatedAt = new Date().toISOString();

    // Check milestones
    goal.milestones.forEach(milestone => {
      if (!milestone.achieved && currentValue >= milestone.target) {
        milestone.achieved = true;
        milestone.achievedAt = new Date().toISOString();
        this.emit("milestone-achieved", { goal, milestone });
      }
    });

    // Check if goal completed
    if (currentValue >= goal.targetValue && goal.status === GOAL_STATUS.ACTIVE) {
      goal.status = GOAL_STATUS.COMPLETED;
      goal.completedAt = new Date().toISOString();
      this.emit("goal-completed", goal);
    }

    this.save();
    this.emit("progress-updated", { goal, oldValue, newValue: currentValue });

    return goal;
  }

  /**
   * Create a new goal
   */
  createGoal({
    title,
    category,
    priority = 5,
    targetValue,
    startValue = 0,
    currentValue = 0,
    unit = "",
    milestones = [],
    project = null,
    description = ""
  }) {
    const goal = {
      id: `goal_${category}_${Date.now()}`,
      title,
      category,
      priority,
      status: GOAL_STATUS.ACTIVE,
      milestones: milestones.length > 0 ? milestones : this.generateMilestones(startValue, targetValue),
      currentValue,
      startValue,
      targetValue,
      unit,
      project: project || category, // Default project to category if not specified
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.goals.push(goal);
    this.goals.sort((a, b) => a.priority - b.priority);
    this.save();

    this.emit("goal-created", goal);
    return goal;
  }

  /**
   * Generate automatic milestones
   */
  generateMilestones(start, target) {
    const range = target - start;
    const milestonePoints = [0.1, 0.25, 0.5, 0.75, 1.0];

    return milestonePoints.map(point => ({
      target: Math.round(start + range * point),
      label: `${Math.round(point * 100)}%`,
      achieved: false
    }));
  }

  /**
   * Update goal status
   */
  updateStatus(goalId, status) {
    const goal = this.getById(goalId);
    if (!goal) return null;

    goal.status = status;
    goal.updatedAt = new Date().toISOString();
    this.save();

    this.emit("status-updated", goal);
    return goal;
  }

  /**
   * Reopen a completed goal (set status back to active)
   * Used when a project linked to this goal is reopened/reactivated
   */
  reopenGoal(goalId) {
    const goal = this.getById(goalId);
    if (!goal) return null;
    if (goal.status !== GOAL_STATUS.COMPLETED) return goal; // Only reopen completed goals

    goal.status = GOAL_STATUS.ACTIVE;
    goal.updatedAt = new Date().toISOString();
    delete goal.completedAt;
    this.save();

    this.emit("goal-reopened", goal);
    this.emit("status-updated", goal);
    return goal;
  }

  /**
   * Delete a goal
   */
  deleteGoal(goalId) {
    const index = this.goals.findIndex(g => g.id === goalId);
    if (index === -1) return false;

    const goal = this.goals.splice(index, 1)[0];
    this.save();

    this.emit("goal-deleted", goal);
    return true;
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return this.getActive().map(goal => ({
      id: goal.id,
      title: goal.title,
      category: goal.category,
      progress: this.calculateProgress(goal),
      currentValue: goal.currentValue,
      targetValue: goal.targetValue,
      unit: goal.unit,
      color: CATEGORY_COLORS[goal.category],
      icon: CATEGORY_ICONS[goal.category],
      nextMilestone: (goal.milestones || []).find(m => !m.achieved)?.label || "Complete",
      milestonesAchieved: (goal.milestones || []).filter(m => m.achieved).length,
      totalMilestones: (goal.milestones || []).length
    }));
  }

  /**
   * Get summary by category
   */
  getCategorySummary() {
    const summary = {};

    for (const category of Object.values(GOAL_CATEGORY)) {
      const categoryGoals = this.getByCategory(category);
      const activeGoals = categoryGoals.filter(g => g.status === GOAL_STATUS.ACTIVE);

      if (activeGoals.length > 0) {
        const avgProgress = activeGoals.reduce((sum, g) => sum + this.calculateProgress(g), 0) / activeGoals.length;
        summary[category] = {
          category,
          goalCount: activeGoals.length,
          avgProgress,
          color: CATEGORY_COLORS[category],
          icon: CATEGORY_ICONS[category]
        };
      }
    }

    return summary;
  }

  /**
   * Sync finance goal with portfolio
   */
  syncFinanceGoal(portfolioValue) {
    const financeGoal = this.goals.find(
      g => g.category === GOAL_CATEGORY.FINANCE && g.status === GOAL_STATUS.ACTIVE
    );

    if (financeGoal) {
      return this.updateProgress(financeGoal.id, portfolioValue);
    }

    return null;
  }

  /**
   * Sync health goal with Oura data
   */
  syncHealthGoal(sleepScore) {
    const healthGoal = this.goals.find(
      g => g.category === GOAL_CATEGORY.HEALTH && g.status === GOAL_STATUS.ACTIVE
    );

    if (healthGoal) {
      return this.updateProgress(healthGoal.id, sleepScore);
    }

    return null;
  }

  /**
   * Reset goals (clears all)
   */
  reset() {
    this.goals = [];
    this.save();
    this.emit("reset");
  }
}

// Singleton instance
let trackerInstance = null;

export const getGoalTracker = () => {
  if (!trackerInstance) {
    trackerInstance = new GoalTracker();
  }
  return trackerInstance;
};

export default GoalTracker;
