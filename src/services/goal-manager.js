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
 * - AI-generated completion criteria for each goal
 * - On-hold status for blocked tasks with review dates
 * - Hyper-specific plans with subtasks and data sources
 * - Smart execution: skip blocked tasks, move to next goal
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
 * Goal/Task status including on-hold
 */
export const GOAL_STATE = {
  ACTIVE: "active",
  ON_HOLD: "on_hold",      // Waiting on something (half-circle indicator)
  COMPLETED: "completed",
  FAILED: "failed",
  BLOCKED: "blocked"       // Cannot proceed due to dependency
};

/**
 * Task status for subtasks
 */
export const TASK_STATE = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  ON_HOLD: "on_hold",
  COMPLETED: "completed",
  BLOCKED: "blocked",
  SKIPPED: "skipped"
};

/**
 * Hold reason types
 */
export const HOLD_REASON = {
  WAITING_EXTERNAL: "waiting_external",    // Waiting on external event (store open, etc)
  WAITING_DATA: "waiting_data",            // Waiting on data to be available
  WAITING_APPROVAL: "waiting_approval",    // Needs user approval
  WAITING_DEPENDENCY: "waiting_dependency", // Waiting on another task
  WAITING_TIME: "waiting_time",            // Time-based wait
  TARGET_NOT_MET: "target_not_met"         // Target criteria not yet achieved
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

    // Criteria and task tracking
    this.goalCriteria = new Map();      // goalId -> completion criteria
    this.goalTasks = new Map();         // goalId -> subtasks array
    this.onHoldTasks = new Map();       // taskId -> { reason, reviewAt, notes }
    this.onHoldGoals = new Map();       // goalId -> { reason, reviewAt, notes }
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
        if (data.goal && (data.goal.status === "active" || data.goal.state === GOAL_STATE.ON_HOLD)) {
          this.currentGoal = data.goal;
          this.currentWorkPlan = data.workPlan || null;
          this.actionHistory = data.actionHistory || [];

          // Load criteria and tasks from saved data
          if (data.goalCriteria) {
            Object.entries(data.goalCriteria).forEach(([key, value]) => {
              this.goalCriteria.set(key, value);
            });
          }

          if (data.goalTasks) {
            Object.entries(data.goalTasks).forEach(([key, value]) => {
              this.goalTasks.set(key, value);
            });
          }

          if (data.onHoldTasks) {
            Object.entries(data.onHoldTasks).forEach(([key, value]) => {
              this.onHoldTasks.set(key, value);
            });
          }

          if (data.onHoldGoals) {
            Object.entries(data.onHoldGoals).forEach(([key, value]) => {
              this.onHoldGoals.set(key, value);
            });
          }
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

      // Convert Maps to objects for serialization
      const criteriaObj = {};
      this.goalCriteria.forEach((value, key) => {
        criteriaObj[key] = value;
      });

      const tasksObj = {};
      this.goalTasks.forEach((value, key) => {
        tasksObj[key] = value;
      });

      const onHoldTasksObj = {};
      this.onHoldTasks.forEach((value, key) => {
        onHoldTasksObj[key] = value;
      });

      const onHoldGoalsObj = {};
      this.onHoldGoals.forEach((value, key) => {
        onHoldGoalsObj[key] = value;
      });

      const data = {
        goal: this.currentGoal,
        workPlan: this.currentWorkPlan,
        actionHistory: this.actionHistory,
        goalCriteria: criteriaObj,
        goalTasks: tasksObj,
        onHoldTasks: onHoldTasksObj,
        onHoldGoals: onHoldGoalsObj,
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
   * Generates completion criteria and detailed plan using GPT-5.2
   */
  async setCurrentGoal(goal) {
    const previousGoal = this.currentGoal;
    this.currentGoal = goal;
    this.actionHistory = [];

    // Create initial work plan
    this.currentWorkPlan = this.goalToWorkPlan(goal);

    try {
      this.emit("plan-generating", { goal });

      // Step 1: Generate completion criteria FIRST
      // This defines what "done" means for this goal
      const criteria = await this.generateCompletionCriteria(goal);
      if (criteria) {
        this.currentWorkPlan.criteria = criteria;
        this.emit("criteria-generated", { goal, criteria });
      }

      // Step 2: Generate hyper-specific detailed plan with subtasks
      const detailedPlan = await this.generateDetailedPlan(goal);
      if (detailedPlan) {
        this.currentWorkPlan.detailedPlan = detailedPlan;
        this.currentWorkPlan.tasks = detailedPlan.tasks;
        this.currentWorkPlan.strategy = detailedPlan.strategy;
        this.emit("detailed-plan-generated", { goal, plan: detailedPlan });
      }

      // Step 3: Generate high-level plan
      const aiPlan = await this.generatePlanWithAI(goal);
      if (aiPlan) {
        this.currentWorkPlan.aiPlan = aiPlan;
        this.currentWorkPlan.planSteps = aiPlan.phases;
        this.currentWorkPlan.summary = aiPlan.summary;
        this.currentWorkPlan.estimatedActions = aiPlan.estimatedActions;

        this.emit("plan-generated", { goal, plan: aiPlan });
      }

      // Check if goal should immediately go on hold (criteria not achievable yet)
      if (criteria) {
        const evaluation = await this.evaluateCriteria(goal);
        if (!evaluation.complete && evaluation.completedCount === 0) {
          // No criteria met yet - check if it's because we're waiting on something
          const unmetCriteria = criteria.criteria.filter(c => !c.isComplete);
          const waitingOnExternal = unmetCriteria.some(c =>
            c.dataSource === "portfolio" ||
            c.dataSource === "plaid_service" ||
            c.dataSource === "oura_health"
          );

          if (waitingOnExternal) {
            // Put on hold - waiting for criteria to be achievable
            this.putGoalOnHold(
              goal.id,
              HOLD_REASON.TARGET_NOT_MET,
              new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              `Waiting for criteria to be met: ${unmetCriteria.map(c => c.description).join(", ")}`
            );
          }
        }
      }

    } catch (error) {
      console.error("[GoalManager] Plan/criteria generation failed:", error.message);
      // Continue without AI plan - will use fallback
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
   * Generate completion criteria for a goal using AI
   * These criteria must be met for the goal to be considered complete
   */
  async generateCompletionCriteria(goal) {
    if (!goal) return null;

    // Check if criteria already exist
    if (this.goalCriteria.has(goal.id)) {
      return this.goalCriteria.get(goal.id);
    }

    try {
      const config = getMultiAIConfig();

      if (!config.gptThinking?.ready && !config.gptInstant?.ready) {
        return this.generateFallbackCriteria(goal);
      }

      const prompt = `Generate specific completion criteria for this goal:

GOAL: ${goal.title}
CATEGORY: ${goal.category || "general"}
DESCRIPTION: ${goal.description || "No additional details"}
TARGET: ${goal.targetValue || "Not specified"} ${goal.unit || ""}
CURRENT: ${goal.currentValue || 0} ${goal.unit || ""}

Create MEASURABLE and VERIFIABLE criteria that must ALL be true for this goal to be complete.
Be specific with numbers, dates, and observable outcomes.

Example for a finance goal "Turn $1,000 into $1,000,000":
- Portfolio total value reaches $1,000,000 or higher
- Value is verified via connected brokerage account
- Gains are realized (not just paper gains)

Respond in JSON format:
{
  "criteria": [
    {
      "id": "criterion_1",
      "description": "Specific measurable criterion",
      "measureType": "value|boolean|percentage|date",
      "targetValue": "target value or true/false",
      "currentValue": null,
      "dataSource": "Where to get this data (portfolio, health_data, web_search, user_input, etc)",
      "isComplete": false
    }
  ],
  "overallComplete": false,
  "minimumCriteriaRequired": "all|any|number",
  "notes": "Any important notes about these criteria"
}`;

      const response = await sendMessage(prompt, TASK_TYPES.PLANNING);

      if (response && typeof response === "string") {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const criteria = JSON.parse(jsonMatch[0]);
          criteria.generatedAt = new Date().toISOString();
          criteria.goalId = goal.id;

          this.goalCriteria.set(goal.id, criteria);
          this.saveActiveGoal();

          this.emit("criteria-generated", { goal, criteria });
          return criteria;
        }
      }

      return this.generateFallbackCriteria(goal);
    } catch (error) {
      console.error("[GoalManager] Failed to generate criteria:", error.message);
      return this.generateFallbackCriteria(goal);
    }
  }

  /**
   * Generate fallback criteria when AI is not available
   */
  generateFallbackCriteria(goal) {
    const category = goal.category || "general";

    const criteriaTemplate = {
      finance: [
        {
          id: "criterion_value",
          description: `Portfolio value reaches ${goal.targetValue || "target"}`,
          measureType: "value",
          targetValue: goal.targetValue || 1000000,
          currentValue: goal.currentValue || 0,
          dataSource: "portfolio",
          isComplete: false
        },
        {
          id: "criterion_verified",
          description: "Value verified via connected account",
          measureType: "boolean",
          targetValue: true,
          currentValue: false,
          dataSource: "plaid_service",
          isComplete: false
        }
      ],
      health: [
        {
          id: "criterion_score",
          description: `Health score reaches ${goal.targetValue || 85}`,
          measureType: "value",
          targetValue: goal.targetValue || 85,
          currentValue: goal.currentValue || 0,
          dataSource: "oura_health",
          isComplete: false
        },
        {
          id: "criterion_consistent",
          description: "Score maintained for 30 consecutive days",
          measureType: "value",
          targetValue: 30,
          currentValue: 0,
          dataSource: "health_history",
          isComplete: false
        }
      ],
      family: [
        {
          id: "criterion_hours",
          description: `Quality time reaches ${goal.targetValue || 14} hours per week`,
          measureType: "value",
          targetValue: goal.targetValue || 14,
          currentValue: goal.currentValue || 0,
          dataSource: "calendar",
          isComplete: false
        }
      ]
    };

    const criteria = {
      criteria: criteriaTemplate[category] || [
        {
          id: "criterion_progress",
          description: `Progress reaches ${goal.targetValue || 100}%`,
          measureType: "percentage",
          targetValue: goal.targetValue || 100,
          currentValue: goal.currentValue || 0,
          dataSource: "manual_tracking",
          isComplete: false
        }
      ],
      overallComplete: false,
      minimumCriteriaRequired: "all",
      notes: "Fallback criteria - update with specific requirements",
      generatedAt: new Date().toISOString(),
      goalId: goal.id
    };

    this.goalCriteria.set(goal.id, criteria);
    return criteria;
  }

  /**
   * Check if goal criteria are met and update status
   * Called on load and after each action
   */
  async evaluateCriteria(goal, contextData = {}) {
    if (!goal) return { complete: false, criteria: [] };

    let criteria = this.goalCriteria.get(goal.id);

    // Generate criteria if they don't exist
    if (!criteria) {
      criteria = await this.generateCompletionCriteria(goal);
    }

    if (!criteria || !criteria.criteria) {
      return { complete: false, criteria: [] };
    }

    let completedCount = 0;

    // Evaluate each criterion
    for (const criterion of criteria.criteria) {
      const currentValue = await this.getCriterionValue(criterion, contextData);

      if (currentValue !== null && currentValue !== undefined) {
        criterion.currentValue = currentValue;
        criterion.lastChecked = new Date().toISOString();

        // Check if criterion is met
        switch (criterion.measureType) {
          case "value":
            criterion.isComplete = currentValue >= criterion.targetValue;
            break;
          case "boolean":
            criterion.isComplete = currentValue === criterion.targetValue;
            break;
          case "percentage":
            criterion.isComplete = currentValue >= criterion.targetValue;
            break;
          default:
            criterion.isComplete = currentValue >= criterion.targetValue;
        }
      }

      if (criterion.isComplete) {
        completedCount++;
      }
    }

    // Determine overall completion
    const minRequired = criteria.minimumCriteriaRequired;
    if (minRequired === "all") {
      criteria.overallComplete = completedCount === criteria.criteria.length;
    } else if (minRequired === "any") {
      criteria.overallComplete = completedCount > 0;
    } else if (typeof minRequired === "number") {
      criteria.overallComplete = completedCount >= minRequired;
    }

    // Update stored criteria
    this.goalCriteria.set(goal.id, criteria);
    this.saveActiveGoal();

    // Determine if goal should be on-hold (criteria not met but working)
    if (!criteria.overallComplete && completedCount > 0) {
      // Partially complete - may need to put on hold
      const incompleteReasons = criteria.criteria
        .filter(c => !c.isComplete)
        .map(c => c.description);

      this.emit("criteria-partial", {
        goal,
        completed: completedCount,
        total: criteria.criteria.length,
        incomplete: incompleteReasons
      });
    }

    this.emit("criteria-evaluated", {
      goal,
      criteria,
      isComplete: criteria.overallComplete
    });

    return {
      complete: criteria.overallComplete,
      criteria: criteria.criteria,
      completedCount,
      totalCount: criteria.criteria.length
    };
  }

  /**
   * Get current value for a criterion from appropriate data source
   */
  async getCriterionValue(criterion, contextData = {}) {
    try {
      switch (criterion.dataSource) {
        case "portfolio":
          return contextData.portfolio?.equity || contextData.portfolio?.total || null;

        case "plaid_service":
          return contextData.netWorth?.total || null;

        case "oura_health":
          return contextData.health?.sleep?.score ||
                 contextData.health?.today?.sleepScore ||
                 null;

        case "health_history":
          // Count consecutive days meeting target
          return contextData.healthHistory?.consecutiveDays || 0;

        case "calendar":
          return contextData.calendar?.weeklyHours || null;

        case "manual_tracking":
          return criterion.currentValue || 0;

        case "web_search":
          // Would need to perform search and extract value
          return null;

        case "user_input":
          return criterion.currentValue || null;

        default:
          return contextData[criterion.dataSource] || null;
      }
    } catch (error) {
      console.error(`[GoalManager] Failed to get criterion value: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate hyper-specific plan with subtasks
   */
  async generateDetailedPlan(goal, contextData = {}) {
    if (!goal) return null;

    try {
      const config = getMultiAIConfig();

      // Get completion criteria first
      const criteria = await this.generateCompletionCriteria(goal);

      if (!config.gptThinking?.ready && !config.gptInstant?.ready) {
        return this.generateFallbackDetailedPlan(goal, criteria);
      }

      const prompt = `Create a HYPER-SPECIFIC execution plan for this goal:

GOAL: ${goal.title}
CATEGORY: ${goal.category || "general"}
DESCRIPTION: ${goal.description || "No additional details"}

COMPLETION CRITERIA (all must be met):
${criteria?.criteria?.map(c => `- ${c.description} (Current: ${c.currentValue}, Target: ${c.targetValue})`).join("\n") || "None defined"}

AVAILABLE DATA:
- Portfolio: ${contextData.portfolio ? "Connected" : "Not connected"}
- Net Worth: ${contextData.netWorth ? `$${contextData.netWorth.total}` : "Not available"}
- Health Data: ${contextData.health ? "Connected" : "Not connected"}
- Calendar: ${contextData.calendar ? "Connected" : "Not connected"}

Generate a detailed plan with:
1. Overall strategy
2. Specific subtasks (each task should be independently actionable)
3. Data sources to query for each task
4. Dependencies between tasks
5. Estimated time/conditions for each task

Respond in JSON:
{
  "strategy": "Overall approach in 2-3 sentences",
  "tasks": [
    {
      "id": "task_001",
      "title": "Specific task title",
      "description": "Detailed description of what needs to be done",
      "category": "research|analyze|execute|validate",
      "priority": 1,
      "estimatedDuration": "30 minutes",
      "dataSources": ["portfolio", "web_search"],
      "dependencies": [],
      "canBeParallel": true,
      "holdConditions": ["Condition that would put this on hold"],
      "successCriteria": "How to know this task is complete"
    }
  ],
  "criticalPath": ["task_001", "task_002"],
  "parallelTracks": [["task_003", "task_004"]]
}`;

      const response = await sendMessage(prompt, TASK_TYPES.PLANNING);

      if (response && typeof response === "string") {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const plan = JSON.parse(jsonMatch[0]);
          plan.generatedAt = new Date().toISOString();
          plan.goalId = goal.id;

          // Store tasks
          this.goalTasks.set(goal.id, plan.tasks.map(t => ({
            ...t,
            state: TASK_STATE.PENDING,
            progress: 0,
            attempts: 0,
            results: []
          })));

          this.emit("detailed-plan-generated", { goal, plan });
          return plan;
        }
      }

      return this.generateFallbackDetailedPlan(goal, criteria);
    } catch (error) {
      console.error("[GoalManager] Failed to generate detailed plan:", error.message);
      return this.generateFallbackDetailedPlan(goal, await this.generateCompletionCriteria(goal));
    }
  }

  /**
   * Generate fallback detailed plan
   */
  generateFallbackDetailedPlan(goal, criteria) {
    const tasks = [
      {
        id: "task_research",
        title: "Research current state and requirements",
        description: `Gather information about current status toward: ${goal.title}`,
        category: "research",
        priority: 1,
        estimatedDuration: "15 minutes",
        dataSources: ["web_search", "portfolio", "health"],
        dependencies: [],
        canBeParallel: false,
        holdConditions: [],
        successCriteria: "All relevant data gathered",
        state: TASK_STATE.PENDING,
        progress: 0
      },
      {
        id: "task_analyze",
        title: "Analyze data and identify gaps",
        description: "Review gathered data and identify what's needed to reach target",
        category: "analyze",
        priority: 2,
        estimatedDuration: "20 minutes",
        dataSources: [],
        dependencies: ["task_research"],
        canBeParallel: false,
        holdConditions: [],
        successCriteria: "Clear understanding of gaps and next steps",
        state: TASK_STATE.PENDING,
        progress: 0
      },
      {
        id: "task_execute",
        title: "Execute primary action",
        description: `Take action toward: ${goal.title}`,
        category: "execute",
        priority: 3,
        estimatedDuration: "Varies",
        dataSources: [],
        dependencies: ["task_analyze"],
        canBeParallel: false,
        holdConditions: criteria?.criteria?.filter(c => !c.isComplete).map(c => c.description) || [],
        successCriteria: "Action completed successfully",
        state: TASK_STATE.PENDING,
        progress: 0
      },
      {
        id: "task_validate",
        title: "Validate progress against criteria",
        description: "Check if completion criteria are met",
        category: "validate",
        priority: 4,
        estimatedDuration: "10 minutes",
        dataSources: criteria?.criteria?.map(c => c.dataSource) || [],
        dependencies: ["task_execute"],
        canBeParallel: false,
        holdConditions: [],
        successCriteria: "All criteria verified",
        state: TASK_STATE.PENDING,
        progress: 0
      }
    ];

    this.goalTasks.set(goal.id, tasks);

    return {
      strategy: `Systematically work toward: ${goal.title}`,
      tasks,
      criticalPath: tasks.map(t => t.id),
      parallelTracks: [],
      generatedAt: new Date().toISOString(),
      goalId: goal.id
    };
  }

  /**
   * Get next available task (skipping blocked/on-hold tasks)
   */
  getNextTask(goalId = null) {
    const gid = goalId || this.currentGoal?.id;
    if (!gid) return null;

    const tasks = this.goalTasks.get(gid);
    if (!tasks || tasks.length === 0) return null;

    // Find first task that is:
    // 1. Pending or in-progress
    // 2. Not on hold
    // 3. Dependencies are met

    for (const task of tasks) {
      if (task.state === TASK_STATE.COMPLETED ||
          task.state === TASK_STATE.SKIPPED) {
        continue;
      }

      // Check if on hold
      if (task.state === TASK_STATE.ON_HOLD) {
        const holdInfo = this.onHoldTasks.get(task.id);
        if (holdInfo && holdInfo.reviewAt) {
          // Check if it's time to review
          if (new Date() < new Date(holdInfo.reviewAt)) {
            continue; // Still on hold
          } else {
            // Time to review - take it off hold
            task.state = TASK_STATE.PENDING;
            this.onHoldTasks.delete(task.id);
          }
        } else {
          continue;
        }
      }

      // Check dependencies
      const depsComplete = task.dependencies.every(depId => {
        const depTask = tasks.find(t => t.id === depId);
        return depTask && depTask.state === TASK_STATE.COMPLETED;
      });

      if (!depsComplete) {
        continue; // Skip - dependencies not met
      }

      return task;
    }

    // No available tasks - check if all are on hold
    const allOnHold = tasks.every(t =>
      t.state === TASK_STATE.COMPLETED ||
      t.state === TASK_STATE.SKIPPED ||
      t.state === TASK_STATE.ON_HOLD ||
      t.state === TASK_STATE.BLOCKED
    );

    if (allOnHold) {
      this.emit("all-tasks-blocked", { goalId: gid });
    }

    return null;
  }

  /**
   * Put a task on hold
   */
  putTaskOnHold(taskId, reason, reviewAt = null, notes = "") {
    const tasks = this.goalTasks.get(this.currentGoal?.id);
    if (!tasks) return false;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;

    task.state = TASK_STATE.ON_HOLD;
    task.onHoldAt = new Date().toISOString();

    const holdInfo = {
      reason,
      reviewAt: reviewAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(), // Default 1 hour
      notes,
      putOnHoldAt: new Date().toISOString()
    };

    this.onHoldTasks.set(taskId, holdInfo);
    this.saveActiveGoal();

    this.emit("task-on-hold", { task, holdInfo });
    return true;
  }

  /**
   * Put goal on hold (waiting for criteria)
   */
  putGoalOnHold(goalId, reason, reviewAt = null, notes = "") {
    const goal = goalId === this.currentGoal?.id
      ? this.currentGoal
      : this.getActiveGoals().find(g => g.id === goalId);

    if (!goal) return false;

    const holdInfo = {
      reason,
      reviewAt: reviewAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Default 24 hours
      notes,
      putOnHoldAt: new Date().toISOString()
    };

    this.onHoldGoals.set(goalId, holdInfo);

    // If it's the current goal, move to next
    if (goalId === this.currentGoal?.id) {
      this.currentGoal.state = GOAL_STATE.ON_HOLD;
      this.emit("goal-on-hold", { goal, holdInfo });

      // Try to switch to next available goal
      const nextGoal = this.selectNextGoal();
      if (nextGoal && nextGoal.id !== goalId && !this.onHoldGoals.has(nextGoal.id)) {
        this.setCurrentGoal(nextGoal);
      }
    }

    this.saveActiveGoal();
    return true;
  }

  /**
   * Complete a task
   */
  completeTask(goalId, taskId, results = {}) {
    const gid = goalId || this.currentGoal?.id;
    const tasks = this.goalTasks.get(gid);
    if (!tasks) return false;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;

    task.state = TASK_STATE.COMPLETED;
    task.completedAt = new Date().toISOString();
    task.results = task.results || [];
    task.results.push(results);
    task.progress = 100;

    // Remove from on-hold if it was there
    this.onHoldTasks.delete(taskId);

    this.saveActiveGoal();
    this.emit("task-completed", { task, results, goalId: gid });

    return true;
  }

  /**
   * Start a task (mark as in progress)
   */
  startTask(goalId, taskId) {
    const gid = goalId || this.currentGoal?.id;
    const tasks = this.goalTasks.get(gid);
    if (!tasks) return false;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;

    task.state = TASK_STATE.IN_PROGRESS;
    task.startedAt = new Date().toISOString();

    this.saveActiveGoal();
    this.emit("task-started", { task, goalId: gid });

    return true;
  }

  /**
   * Get criteria for a goal
   */
  getCriteria(goalId) {
    const criteria = this.goalCriteria.get(goalId);
    return criteria?.criteria || [];
  }

  /**
   * Get tasks for a goal
   */
  getTasks(goalId) {
    return this.goalTasks.get(goalId) || [];
  }

  /**
   * Mark a specific criterion as met
   */
  markCriterionMet(goalId, criterionIndex, evidence = {}) {
    const criteria = this.goalCriteria.get(goalId);
    if (!criteria || !criteria.criteria) return false;

    if (criterionIndex < 0 || criterionIndex >= criteria.criteria.length) return false;

    const criterion = criteria.criteria[criterionIndex];
    criterion.isComplete = true;
    criterion.met = true;
    criterion.metAt = new Date().toISOString();
    criterion.evidence = evidence;

    // Check if all criteria are now met
    const allMet = criteria.criteria.every(c => c.isComplete || c.met);
    if (allMet) {
      criteria.overallComplete = true;
    }

    this.goalCriteria.set(goalId, criteria);
    this.saveActiveGoal();

    this.emit("criterion-met", { goalId, criterionIndex, criterion });

    return true;
  }

  /**
   * Get goal status including on-hold info
   */
  getGoalStatus(goalId = null) {
    const gid = goalId || this.currentGoal?.id;
    if (!gid) return null;

    const tasks = this.goalTasks.get(gid) || [];
    const criteria = this.goalCriteria.get(gid);
    const holdInfo = this.onHoldGoals.get(gid);

    const taskStats = {
      total: tasks.length,
      completed: tasks.filter(t => t.state === TASK_STATE.COMPLETED).length,
      inProgress: tasks.filter(t => t.state === TASK_STATE.IN_PROGRESS).length,
      onHold: tasks.filter(t => t.state === TASK_STATE.ON_HOLD).length,
      pending: tasks.filter(t => t.state === TASK_STATE.PENDING).length,
      blocked: tasks.filter(t => t.state === TASK_STATE.BLOCKED).length
    };

    const criteriaStats = criteria ? {
      total: criteria.criteria.length,
      met: criteria.criteria.filter(c => c.isComplete).length
    } : { total: 0, met: 0 };

    // Determine visual state
    let visualState = "active"; // Default
    if (holdInfo) {
      visualState = "on_hold";
    } else if (criteriaStats.met > 0 && criteriaStats.met < criteriaStats.total) {
      visualState = "partial"; // Half-circle
    } else if (criteriaStats.met === criteriaStats.total && criteriaStats.total > 0) {
      visualState = "complete";
    } else if (taskStats.onHold > 0 && taskStats.inProgress === 0) {
      visualState = "on_hold";
    }

    return {
      goalId: gid,
      state: holdInfo ? GOAL_STATE.ON_HOLD : GOAL_STATE.ACTIVE,
      visualState,
      taskStats,
      criteriaStats,
      holdInfo,
      progress: taskStats.total > 0
        ? Math.round((taskStats.completed / taskStats.total) * 100)
        : 0
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
   * Uses the new criteria evaluation system
   */
  async isGoalComplete(contextData = {}) {
    if (!this.currentGoal) return false;

    // First check criteria
    const criteria = this.goalCriteria.get(this.currentGoal.id);

    if (criteria && criteria.criteria?.length > 0) {
      // Evaluate criteria with context data
      const result = await this.evaluateCriteria(this.currentGoal, contextData);

      if (result.complete) {
        return true;
      }

      // If criteria exist but not complete, goal is NOT complete
      // Even if tasks are done, criteria must be met
      return false;
    }

    // Fallback to old behavior if no criteria exist
    if (this.currentWorkPlan) {
      const phases = this.currentWorkPlan.phases;
      if (this.currentWorkPlan.currentPhase >= phases.length - 1) {
        // All phases done but no criteria - might need to put on hold
        // for criteria verification
        return false;
      }
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
   * Synchronous check if goal appears complete (for quick checks)
   */
  isGoalCompleteSync() {
    if (!this.currentGoal) return false;

    const criteria = this.goalCriteria.get(this.currentGoal.id);

    if (criteria) {
      return criteria.overallComplete || false;
    }

    return false;
  }

  /**
   * Get waiting reasons for all goals/projects when engine is idle
   * Returns array of { project: string, reason: string } for display
   */
  getWaitingReasons() {
    const reasons = [];
    const tracker = getGoalTracker();
    const allGoals = tracker.getAllGoals();

    // Check on-hold goals first
    for (const [goalId, holdInfo] of this.onHoldGoals.entries()) {
      const goal = allGoals.find(g => g.id === goalId);
      if (goal) {
        let reason = "on hold";
        if (holdInfo.reason) {
          switch (holdInfo.reason) {
            case HOLD_REASON.WAITING_EXTERNAL:
              reason = holdInfo.description || "waiting on external event";
              break;
            case HOLD_REASON.WAITING_DATA:
              reason = holdInfo.description || "waiting for data";
              break;
            case HOLD_REASON.WAITING_APPROVAL:
              reason = "needs user approval";
              break;
            case HOLD_REASON.WAITING_DEPENDENCY:
              reason = holdInfo.description || "waiting on dependency";
              break;
            case HOLD_REASON.WAITING_TIME:
              reason = holdInfo.description || "scheduled for later";
              break;
            case HOLD_REASON.TARGET_NOT_MET:
              reason = holdInfo.description || "target not yet met";
              break;
            default:
              reason = holdInfo.description || "on hold";
          }
        }
        reasons.push({
          goal: goal.title,
          project: goal.title,
          reason: reason.slice(0, 30) // Keep concise (10 words max ~30 chars)
        });
      }
    }

    // Check active goals that might be blocked
    for (const goal of allGoals) {
      if (goal.status === "active" && !this.onHoldGoals.has(goal.id)) {
        const status = this.getGoalStatus(goal.id);
        if (status) {
          if (status.taskStats.blocked > 0) {
            reasons.push({
              goal: goal.title,
              project: goal.title,
              reason: "blocked by dependency"
            });
          } else if (status.taskStats.onHold > 0 && status.taskStats.inProgress === 0) {
            reasons.push({
              goal: goal.title,
              project: goal.title,
              reason: "tasks on hold"
            });
          }
        }
      }
    }

    return reasons;
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const currentGoalStatus = this.currentGoal
      ? this.getGoalStatus(this.currentGoal.id)
      : null;

    return {
      currentGoal: this.currentGoal,
      workPlan: this.currentWorkPlan,
      actionHistory: this.actionHistory.slice(-5),
      completedCount: this.completedGoals.length,
      activeCount: this.getActiveGoals().length,
      // New fields
      goalStatus: currentGoalStatus,
      criteria: this.currentGoal ? this.goalCriteria.get(this.currentGoal.id) : null,
      tasks: this.currentGoal ? this.goalTasks.get(this.currentGoal.id) : [],
      onHoldTasks: Array.from(this.onHoldTasks.entries()).map(([id, info]) => ({ taskId: id, ...info })),
      onHoldGoals: Array.from(this.onHoldGoals.entries()).map(([id, info]) => ({ goalId: id, ...info }))
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
