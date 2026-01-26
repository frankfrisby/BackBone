/**
 * Goal Manager Service
 *
 * Central goal management system for the autonomous engine.
 * Handles auto-initialization, goal selection by priority, goal extraction
 * from messages, and converting goals to actionable work plans.
 *
 * Key Features:
 * - Auto-selects highest priority goal on startup
 * - Extracts goals from user messages
 * - Converts goals to work plans with phases
 * - Tracks goal progress and completion
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { getGoalTracker, GOAL_STATUS, GOAL_CATEGORY } from "./goal-tracker.js";
import { loadGoals, extractGoalsFromMessage, processMessageForGoals } from "./goal-extractor.js";
import { sendMessage, getMultiAIConfig, TASK_TYPES } from "./multi-ai.js";

const DATA_DIR = path.join(process.cwd(), "data");
const ACTIVE_GOAL_PATH = path.join(DATA_DIR, "active-goal.json");

/**
 * Work phases for goal execution
 */
export const WORK_PHASES = {
  RESEARCH: "research",
  ANALYZE: "analyze",
  PLAN: "plan",
  EXECUTE: "execute",
  VALIDATE: "validate"
};

/**
 * Goal priority levels
 */
export const GOAL_PRIORITY = {
  URGENT: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4
};

/**
 * Goal Manager Class
 * Central system for managing goals and converting them to work
 */
export class GoalManager extends EventEmitter {
  constructor() {
    super();
    this.currentGoal = null;
    this.currentWorkPlan = null;
    this.goalQueue = [];
    this.completedGoals = [];
    this.actionHistory = [];
    this.initialized = false;
  }

  /**
   * Initialize the goal manager
   * Auto-loads current goal if one was in progress
   */
  async initialize() {
    if (this.initialized) return;

    // Load any saved active goal
    this.loadActiveGoal();

    // If no active goal, auto-select one
    if (!this.currentGoal) {
      const nextGoal = this.selectNextGoal();
      if (nextGoal) {
        await this.setCurrentGoal(nextGoal);
      }
    }

    this.initialized = true;
    this.emit("initialized", { currentGoal: this.currentGoal });
  }

  /**
   * Load active goal from disk
   */
  loadActiveGoal() {
    try {
      if (fs.existsSync(ACTIVE_GOAL_PATH)) {
        const data = JSON.parse(fs.readFileSync(ACTIVE_GOAL_PATH, "utf-8"));
        if (data.goal && data.goal.status === "active") {
          this.currentGoal = data.goal;
          this.currentWorkPlan = data.workPlan || null;
          this.actionHistory = data.actionHistory || [];
        }
      }
    } catch (error) {
      console.error("[GoalManager] Failed to load active goal:", error.message);
    }
  }

  /**
   * Save active goal to disk
   */
  saveActiveGoal() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      const data = {
        goal: this.currentGoal,
        workPlan: this.currentWorkPlan,
        actionHistory: this.actionHistory,
        savedAt: new Date().toISOString()
      };

      fs.writeFileSync(ACTIVE_GOAL_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("[GoalManager] Failed to save active goal:", error.message);
    }
  }

  /**
   * Get all active goals from the goal tracker
   */
  getActiveGoals() {
    const tracker = getGoalTracker();
    return tracker.getActive();
  }

  /**
   * Select the next goal to work on based on priority and context
   * Priority order: urgent > time-sensitive > high-priority > regular
   */
  selectNextGoal() {
    const goals = this.getActiveGoals();

    if (goals.length === 0) {
      return null;
    }

    // Sort by priority (lower number = higher priority)
    const prioritized = goals.sort((a, b) => {
      // First by priority
      const priorityDiff = (a.priority || 5) - (b.priority || 5);
      if (priorityDiff !== 0) return priorityDiff;

      // Then by urgency
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      const aUrgency = urgencyOrder[a.urgency] ?? 2;
      const bUrgency = urgencyOrder[b.urgency] ?? 2;
      if (aUrgency !== bUrgency) return aUrgency - bUrgency;

      // Then by creation date (oldest first)
      const aDate = new Date(a.createdAt || 0);
      const bDate = new Date(b.createdAt || 0);
      return aDate - bDate;
    });

    return prioritized[0] || null;
  }

  /**
   * Set the current goal to work on
   * Generates an AI-powered plan using GPT-5.2 if available
   */
  async setCurrentGoal(goal) {
    const previousGoal = this.currentGoal;
    this.currentGoal = goal;
    this.actionHistory = [];

    // Create initial work plan
    this.currentWorkPlan = this.goalToWorkPlan(goal);

    // Generate detailed plan using GPT-5.2
    try {
      this.emit("plan-generating", { goal });

      const aiPlan = await this.generatePlanWithAI(goal);
      if (aiPlan) {
        this.currentWorkPlan.aiPlan = aiPlan;
        this.currentWorkPlan.planSteps = aiPlan.phases;
        this.currentWorkPlan.summary = aiPlan.summary;
        this.currentWorkPlan.estimatedActions = aiPlan.estimatedActions;

        this.emit("plan-generated", { goal, plan: aiPlan });
      }
    } catch (error) {
      console.error("[GoalManager] Plan generation failed:", error.message);
      // Continue without AI plan
    }

    // Save state
    this.saveActiveGoal();

    this.emit("goal-changed", {
      previousGoal,
      currentGoal: goal,
      workPlan: this.currentWorkPlan
    });

    return this.currentGoal;
  }

  /**
   * Get the current goal
   */
  getCurrentGoal() {
    return this.currentGoal;
  }

  /**
   * Get the current work plan
   */
  getWorkPlan() {
    return this.currentWorkPlan;
  }

  /**
   * Convert a goal to an actionable work plan
   */
  goalToWorkPlan(goal) {
    if (!goal) return null;

    return {
      goal,
      phases: Object.values(WORK_PHASES),
      currentPhase: 0,
      currentPhaseId: WORK_PHASES.RESEARCH,
      actions: [],
      startedAt: new Date().toISOString(),
      progress: 0
    };
  }

  /**
   * Generate a detailed plan using GPT-5.2
   * Called when a goal starts to create a step-by-step execution plan
   *
   * @param {Object} goal - Goal object
   * @returns {Promise<Object>} Generated plan with steps and strategies
   */
  async generatePlanWithAI(goal) {
    if (!goal) return null;

    try {
      const config = getMultiAIConfig();

      // Prefer GPT-5.2 Thinking for planning
      if (!config.gptThinking?.ready && !config.gptInstant?.ready) {
        console.log("[GoalManager] No AI model available for plan generation");
        return this.generateFallbackPlan(goal);
      }

      const prompt = `Generate a detailed execution plan for this goal:

GOAL: ${goal.title}
CATEGORY: ${goal.category || "general"}
DESCRIPTION: ${goal.description || "No additional details"}
TARGET: ${goal.targetValue || "Not specified"} ${goal.unit || ""}
CURRENT: ${goal.currentValue || 0} ${goal.unit || ""}

Create a structured plan with:
1. RESEARCH PHASE: What information needs to be gathered
2. ANALYZE PHASE: What data needs to be analyzed
3. PLAN PHASE: What strategies to consider
4. EXECUTE PHASE: Specific actions to take
5. VALIDATE PHASE: How to verify success

For each phase, provide 2-3 specific, actionable steps.

Respond in JSON format:
{
  "summary": "1-2 sentence overview",
  "phases": {
    "research": ["step1", "step2"],
    "analyze": ["step1", "step2"],
    "plan": ["step1", "step2"],
    "execute": ["step1", "step2", "step3"],
    "validate": ["step1", "step2"]
  },
  "estimatedActions": 10,
  "keyMetrics": ["metric1", "metric2"]
}`;

      const response = await sendMessage(prompt, TASK_TYPES.PLANNING);

      if (response && typeof response === "string") {
        // Try to parse JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const plan = JSON.parse(jsonMatch[0]);
          return {
            ...plan,
            generatedAt: new Date().toISOString(),
            model: config.gptThinking?.ready ? "gpt-5.2-thinking" : "gpt-5.2"
          };
        }
      }

      return this.generateFallbackPlan(goal);
    } catch (error) {
      console.error("[GoalManager] Failed to generate AI plan:", error.message);
      return this.generateFallbackPlan(goal);
    }
  }

  /**
   * Generate a fallback plan when AI is not available
   */
  generateFallbackPlan(goal) {
    const category = goal.category || "general";

    const categoryPlans = {
      finance: {
        research: ["Research current market conditions", "Analyze portfolio performance"],
        analyze: ["Identify growth opportunities", "Assess risk factors"],
        plan: ["Define investment strategy", "Set milestone targets"],
        execute: ["Execute trades", "Monitor positions", "Adjust as needed"],
        validate: ["Check progress against targets", "Review returns"]
      },
      health: {
        research: ["Review current health metrics", "Research improvement strategies"],
        analyze: ["Identify patterns in data", "Assess lifestyle factors"],
        plan: ["Create improvement plan", "Set measurable goals"],
        execute: ["Implement daily habits", "Track progress", "Adjust routines"],
        validate: ["Measure against baseline", "Review improvement rate"]
      },
      family: {
        research: ["Assess current time allocation", "Research activities"],
        analyze: ["Identify schedule conflicts", "Find optimization opportunities"],
        plan: ["Schedule dedicated time", "Plan activities"],
        execute: ["Block calendar time", "Engage in activities", "Document memories"],
        validate: ["Track hours spent", "Evaluate quality of time"]
      }
    };

    const phases = categoryPlans[category] || {
      research: ["Gather relevant information", "Review current state"],
      analyze: ["Analyze data", "Identify patterns"],
      plan: ["Create action plan", "Set milestones"],
      execute: ["Take action", "Monitor progress"],
      validate: ["Check results", "Adjust approach"]
    };

    return {
      summary: `Plan to achieve: ${goal.title}`,
      phases,
      estimatedActions: 15,
      keyMetrics: ["Progress toward target", "Completion rate"],
      generatedAt: new Date().toISOString(),
      model: "fallback"
    };
  }

  /**
   * Advance to the next phase of work
   */
  advancePhase() {
    if (!this.currentWorkPlan) return false;

    const phases = this.currentWorkPlan.phases;
    const currentPhase = this.currentWorkPlan.currentPhase;

    if (currentPhase >= phases.length - 1) {
      // All phases complete
      return false;
    }

    this.currentWorkPlan.currentPhase++;
    this.currentWorkPlan.currentPhaseId = phases[this.currentWorkPlan.currentPhase];
    this.currentWorkPlan.progress = (this.currentWorkPlan.currentPhase / phases.length) * 100;

    this.saveActiveGoal();
    this.emit("phase-advanced", {
      phase: this.currentWorkPlan.currentPhaseId,
      progress: this.currentWorkPlan.progress
    });

    return true;
  }

  /**
   * Record an action taken toward the goal
   */
  recordAction(action, result) {
    const record = {
      action,
      result,
      timestamp: new Date().toISOString(),
      phase: this.currentWorkPlan?.currentPhaseId
    };

    this.actionHistory.push(record);

    // Keep last 50 actions
    if (this.actionHistory.length > 50) {
      this.actionHistory = this.actionHistory.slice(-50);
    }

    this.saveActiveGoal();
    this.emit("action-recorded", record);

    return record;
  }

  /**
   * Get action history for the current goal
   */
  getActionHistory() {
    return this.actionHistory;
  }

  /**
   * Check if message contains a goal
   */
  messageContainsGoal(message) {
    if (!message || typeof message !== "string") return false;

    const lower = message.toLowerCase();

    // Intent indicators that suggest goals
    const goalIndicators = [
      "i want to",
      "i need to",
      "help me",
      "find me",
      "search for",
      "look for",
      "get me",
      "i'd like to",
      "can you",
      "please"
    ];

    // Action verbs that suggest actionable goals
    const actionVerbs = [
      "find", "search", "get", "buy", "sell",
      "create", "build", "make", "write",
      "analyze", "research", "investigate",
      "fix", "solve", "improve"
    ];

    // Check for goal indicators
    const hasIndicator = goalIndicators.some(ind => lower.includes(ind));
    const hasActionVerb = actionVerbs.some(verb => lower.includes(verb));

    return hasIndicator || hasActionVerb;
  }

  /**
   * Extract a goal from a user message
   */
  extractGoalFromMessage(message) {
    if (!this.messageContainsGoal(message)) {
      return null;
    }

    // Use the existing goal extractor
    const extracted = extractGoalsFromMessage(message);

    if (extracted.length > 0) {
      const goal = extracted[0];
      goal.source = "user_message";
      goal.originalMessage = message;
      return goal;
    }

    // If extractor didn't find it, create a simple goal from the message
    const cleanMessage = message
      .replace(/^(i want to|i need to|help me|find me|please|can you)\s*/i, "")
      .trim();

    if (cleanMessage.length > 5) {
      return {
        id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: cleanMessage.charAt(0).toUpperCase() + cleanMessage.slice(1),
        description: message,
        category: this.detectCategory(cleanMessage),
        priority: GOAL_PRIORITY.HIGH,
        status: "active",
        urgency: "high",
        source: "user_message",
        originalMessage: message,
        createdAt: new Date().toISOString()
      };
    }

    return null;
  }

  /**
   * Detect category from goal text
   */
  detectCategory(text) {
    const lower = text.toLowerCase();

    const categoryKeywords = {
      [GOAL_CATEGORY.FINANCE]: ["money", "stock", "invest", "trade", "portfolio", "salary", "job", "pay"],
      [GOAL_CATEGORY.HEALTH]: ["health", "sleep", "exercise", "weight", "diet", "fitness"],
      [GOAL_CATEGORY.CAREER]: ["job", "career", "work", "interview", "resume", "linkedin"],
      [GOAL_CATEGORY.FAMILY]: ["family", "kids", "wife", "husband", "parent"],
      [GOAL_CATEGORY.EDUCATION]: ["learn", "study", "course", "read", "skill"],
      [GOAL_CATEGORY.GROWTH]: ["improve", "goal", "habit", "productivity"]
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) {
        return category;
      }
    }

    return GOAL_CATEGORY.GROWTH;
  }

  /**
   * Add a new goal and optionally set it as current
   */
  async addGoal(goal, setAsCurrent = true) {
    const tracker = getGoalTracker();

    // Add to tracker
    const createdGoal = tracker.createGoal({
      title: goal.title,
      category: goal.category || GOAL_CATEGORY.GROWTH,
      priority: goal.priority || GOAL_PRIORITY.MEDIUM,
      targetValue: goal.targetValue || 100,
      startValue: goal.startValue || 0,
      currentValue: goal.currentValue || 0,
      unit: goal.unit || "%"
    });

    if (setAsCurrent) {
      await this.setCurrentGoal(createdGoal);
    }

    this.emit("goal-added", createdGoal);
    return createdGoal;
  }

  /**
   * Mark the current goal as complete
   */
  async completeCurrentGoal(summary = null) {
    if (!this.currentGoal) return null;

    const completedGoal = {
      ...this.currentGoal,
      status: "completed",
      completedAt: new Date().toISOString(),
      summary,
      actionHistory: this.actionHistory
    };

    // Add to completed list
    this.completedGoals.unshift(completedGoal);
    if (this.completedGoals.length > 20) {
      this.completedGoals = this.completedGoals.slice(0, 20);
    }

    // Update in tracker
    const tracker = getGoalTracker();
    tracker.updateStatus(this.currentGoal.id, GOAL_STATUS.COMPLETED);

    // Clear current goal
    const previousGoal = this.currentGoal;
    this.currentGoal = null;
    this.currentWorkPlan = null;
    this.actionHistory = [];

    // Save state
    this.saveActiveGoal();

    this.emit("goal-completed", {
      goal: completedGoal,
      summary
    });

    // Auto-select next goal (generates plan with GPT-5.2)
    const nextGoal = this.selectNextGoal();
    if (nextGoal) {
      await this.setCurrentGoal(nextGoal);
    }

    return completedGoal;
  }

  /**
   * Check if current goal is complete based on criteria
   */
  isGoalComplete() {
    if (!this.currentGoal || !this.currentWorkPlan) return false;

    // Check if all phases complete
    const phases = this.currentWorkPlan.phases;
    if (this.currentWorkPlan.currentPhase >= phases.length - 1) {
      return true;
    }

    // Check if goal value target reached (for trackable goals)
    if (this.currentGoal.targetValue && this.currentGoal.currentValue) {
      if (this.currentGoal.currentValue >= this.currentGoal.targetValue) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      currentGoal: this.currentGoal,
      workPlan: this.currentWorkPlan,
      actionHistory: this.actionHistory.slice(-5),
      completedCount: this.completedGoals.length,
      activeCount: this.getActiveGoals().length
    };
  }

  /**
   * Reset the goal manager
   */
  reset() {
    this.currentGoal = null;
    this.currentWorkPlan = null;
    this.actionHistory = [];
    this.completedGoals = [];

    // Clear saved state
    try {
      if (fs.existsSync(ACTIVE_GOAL_PATH)) {
        fs.unlinkSync(ACTIVE_GOAL_PATH);
      }
    } catch (error) {
      // Ignore
    }

    this.emit("reset");
  }
}

// Singleton instance
let goalManagerInstance = null;

export const getGoalManager = () => {
  if (!goalManagerInstance) {
    goalManagerInstance = new GoalManager();
  }
  return goalManagerInstance;
};

export default GoalManager;
