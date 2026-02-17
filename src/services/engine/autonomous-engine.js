import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { getGoalManager, GOAL_STATE, TASK_STATE, HOLD_REASON } from "../goals/goal-manager.js";
import { getToolExecutor, TOOL_TYPES } from "../tool-executor.js";
import { STATE_FOR_ACTIVITY, getStateForActivity } from "./engine-state.js";
import { getClaudeOrchestrator, EVALUATION_DECISION, ORCHESTRATION_STATE } from "../ai/claude-orchestrator.js";
import { getClaudeCodeStatus, getCurrentModelInUse } from "../ai/claude-code-cli.js";
import { getActionScheduler, ACTION_PRIORITY, ACTION_STATUS } from "../action-scheduler.js";
import { getProjectManager } from "../projects/project-manager.js";
import { getWorkerCoordination, WORKER_MODE } from "./worker-coordination.js";
import { showActivityTitle, showNotificationTitle, restoreBaseTitle, setWorkContext, clearWorkContext } from "../ui/terminal-resize.js";
import { getActionApproval, APPROVAL_REQUIRED_ACTIONS, APPROVAL_STATUS } from "../action-approval.js";
import { getEngineHeartbeat } from "./engine-heartbeat.js";
import { calculateDataCompleteness } from "./thinking-engine.js";
import { getSkillDiscovery } from "./skill-discovery.js";
import { matchGoalToAgent } from "./agent-dispatcher.js";
import { notifyProgress, notifyBlocked, sendWhatsApp, askUser } from "../messaging/proactive-outreach.js";

import { getDataDir, dataFile } from "../paths.js";
/**
 * Autonomous Engine for BACKBONE
 * Core brain that generates AI-driven actions and executes them
 * Manages goals, proposes actions, and runs the autonomous loop
 *
 * KEY FEATURES:
 * - AUTO-START: Automatically picks highest priority goal on launch
 * - TOOL CHAINING: AI decides next action after each completes
 * - STATE DISPLAY: Shows proper states (Researching, Analyzing, Building, etc.)
 * - AUTONOMOUS: No user approval needed for tool execution
 */

const DATA_DIR = getDataDir();
const ENGINE_STATE_PATH = path.join(DATA_DIR, "autonomous-state.json");
const HANDOFF_FILE = path.join(DATA_DIR, "engine-handoff.json");

// Rest duration constants (milliseconds)
const REST_AFTER_SUCCESS = 15 * 60 * 1000;     // 15 min after successful work
const REST_AFTER_RATE_LIMIT = 30 * 60 * 1000;  // 30 min after rate limit
const REST_QUIET_HOURS = 60 * 60 * 1000;       // 60 min during quiet hours (22:00-07:00)
const REST_NO_WORK = 30 * 60 * 1000;           // 30 min when no work available
const REST_COUNTDOWN_INTERVAL = 30 * 1000;      // Emit countdown every 30s

// Action statuses
export const AI_ACTION_STATUS = {
  PROPOSED: "proposed",
  APPROVED: "approved",
  EXECUTING: "executing",
  COMPLETED: "completed",
  FAILED: "failed",
  REJECTED: "rejected"
};

// Action types for AI-generated actions
export const AI_ACTION_TYPES = {
  RESEARCH: "research",       // Research stocks, markets, opportunities
  EXECUTE: "execute",         // Execute trades, send messages
  ANALYZE: "analyze",         // Analyze data, patterns, health metrics
  COMMUNICATE: "communicate", // Send emails, messages, schedule calls
  BROWSER: "browser",         // Web automation tasks via Playwright
  PLAN: "plan",              // Planning and strategy tasks
  HEALTH: "health",          // Health-related actions
  FAMILY: "family"           // Family/personal time actions
};

// Execution tools
export const EXECUTION_TOOLS = {
  CLAUDE_CODE: "claude-code",
  CLAUDE_API: "claude-api",
  ALPACA: "alpaca",
  PLAYWRIGHT: "playwright",
  API: "api"
};

/**
 * Default engine state
 */
const getDefaultState = () => ({
  running: false,
  currentAction: null,
  proposedActions: [],
  approvedQueue: [],
  completedActions: [],
  lastCycleAt: null,
  cycleCount: 0,
  config: {
    cycleIntervalMs: 30000,      // Default 30 seconds, adjusted based on model
    maxProposedActions: 5,
    requireApproval: true,
    autoApproveTypes: []         // Action types that auto-approve
  }
});

/**
 * Get cycle interval based on current model
 * Opus 4.6: 15 minutes (to respect rate limits)
 * Sonnet: 10 minutes
 */
const getCycleIntervalForModel = () => {
  const model = getCurrentModelInUse();
  const isOpus = model.includes("opus");
  // Opus 4.6: 15 minutes = 900000ms
  // Sonnet: 10 minutes = 600000ms
  return isOpus ? 900000 : 600000;
};

/**
 * Load engine state from disk
 */
export const loadEngineState = () => {
  try {
    if (fs.existsSync(ENGINE_STATE_PATH)) {
      const state = JSON.parse(fs.readFileSync(ENGINE_STATE_PATH, "utf-8"));
      return { ...getDefaultState(), ...state };
    }
  } catch (error) {
    console.error("Failed to load engine state:", error.message);
  }
  return getDefaultState();
};

/**
 * Save engine state to disk
 */
export const saveEngineState = (state) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(ENGINE_STATE_PATH, JSON.stringify(state, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save engine state:", error.message);
    return false;
  }
};

/**
 * Create a new AI-generated action
 */
export const createAIAction = ({
  goalId = null,
  title,
  type,
  description = "",
  executionPlan = {},
  requiresApproval = true,
  priority = 5
}) => ({
  id: `ai_action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  goalId,
  title,
  type,
  description,
  status: AI_ACTION_STATUS.PROPOSED,
  requiresApproval,
  priority,
  executionPlan: {
    tool: executionPlan.tool || EXECUTION_TOOLS.CLAUDE_CODE,
    prompt: executionPlan.prompt || "",
    workDir: executionPlan.workDir || process.cwd(),
    timeout: executionPlan.timeout || 120000
  },
  result: null,
  error: null,
  createdAt: new Date().toISOString(),
  approvedAt: null,
  startedAt: null,
  completedAt: null
});

/**
 * Autonomous Engine Class
 */
export class AutonomousEngine extends EventEmitter {
  constructor() {
    super();
    this.state = loadEngineState();
    this.loopInterval = null;
    this.contextProviders = {};
    this.executors = {};

    // New autonomous loop properties
    this.running = false;
    this.currentGoal = null;
    this.actionHistory = [];
    this.goalManager = null;
    this.toolExecutor = null;
    this.aiBrain = null;
    this.narrator = null;

    // Auto-chain settings
    this.autoChain = true;
    this.maxActionsPerGoal = 50;
    this.actionCount = 0;

    // Thinking / generation throttle
    this.lastGoalGeneration = 0;
    this.goalGenerationCooldownMs = 10 * 60 * 1000; // 10 minutes between generation attempts

    // Work-rest cycle (long-horizon continuous operation)
    // Rest period is DYNAMIC based on data completeness score:
    //   < 15%  → 15 min  (new system, work hard to build foundation)
    //  15-30%  → 30 min  (early, still aggressive)
    //  30-50%  → 45 min  (growing, moderate pace)
    //  50-70%  → 60 min  (maturing, standard pace)
    //  70-85%  → 90 min  (mature, lighter maintenance)
    //    85%+  → 120 min (very complete, maintenance mode)
    this.restPeriodMs = this._calculateRestPeriod();
    this.isResting = false;
    this.restUntil = 0;               // timestamp when rest ends
    this.restWakeResolve = null;       // resolve function to interrupt rest
    this.lastSessionId = null;         // Claude Code session ID for --resume
    this.cycleCount = 0;

    // Action scheduler and project integration
    this.actionScheduler = null;
    this.projectManager = null;
    this.currentProject = null;
  }

  /**
   * Calculate rest period based on data completeness score.
   * Lower completeness = shorter rest (more work to do).
   * Higher completeness = longer rest (maintenance mode).
   */
  _calculateRestPeriod() {
    try {
      const { percentage } = calculateDataCompleteness();
      let restMs;
      if (percentage < 15)      restMs = 15 * 60 * 1000;   // 15 min
      else if (percentage < 30) restMs = 30 * 60 * 1000;   // 30 min
      else if (percentage < 50) restMs = 45 * 60 * 1000;   // 45 min
      else if (percentage < 70) restMs = 60 * 60 * 1000;   // 60 min
      else if (percentage < 85) restMs = 90 * 60 * 1000;   // 90 min
      else                      restMs = 120 * 60 * 1000;  // 120 min
      console.log(`[AutonomousEngine] Data completeness: ${percentage}% → rest ${Math.round(restMs / 60000)}m`);
      return restMs;
    } catch {
      return 30 * 60 * 1000; // fallback 30 min
    }
  }

  /**
   * Interruptible rest — sleeps for the specified duration but wakes immediately
   * if wakeFromRest() is called (e.g., user asks a question).
   * Emits rest-countdown events every 30s for dashboard visibility.
   *
   * @param {string} reason - Why we're resting
   * @param {number} [durationMs] - Override rest duration (otherwise uses adaptive calculation)
   */
  async restBetweenCycles(reason = "work cycle complete", durationMs = null) {
    // Determine rest duration: explicit override > quiet hours > adaptive
    let restMs = durationMs;
    if (!restMs) {
      if (this._isQuietHours()) {
        restMs = Math.max(REST_QUIET_HOURS, this._calculateRestPeriod());
      } else {
        restMs = this._calculateRestPeriod();
      }
    }

    this.restPeriodMs = restMs;
    this.isResting = true;
    this.restUntil = Date.now() + restMs;
    this.restReason = reason;
    this.setEngineState("resting");

    const restMinutes = Math.round(restMs / 60000);
    console.log(`[AutonomousEngine] Resting ${restMinutes}m (${reason})`);
    if (this.narrator) {
      this.narrator.observe(`Resting ${restMinutes}m — ${reason}`);
    }
    if (this.heartbeat) this.heartbeat.beat(`rest-start: ${reason}`);

    // Log rest state for header display
    this.emit("rest-start", { restUntil: this.restUntil, reason, durationMs: restMs });

    // Visible countdown — emit every 30s so dashboard shows "Resting 12m left"
    const countdownInterval = setInterval(() => {
      if (!this.isResting) return;
      const remaining = Math.max(0, this.restUntil - Date.now());
      const remainMin = Math.round(remaining / 60000);
      const remainSec = Math.round(remaining / 1000);

      // Emit for dashboard/SSE
      this.emit("rest-countdown", {
        remainingMs: remaining,
        remainingMin: remainMin,
        remainingSec: remainSec,
        reason: this.restReason
      });

      if (this.heartbeat) {
        this.heartbeat.beat(`resting: ${remainMin}m left`);
      }
    }, REST_COUNTDOWN_INTERVAL);

    try {
      await new Promise((resolve) => {
        this.restWakeResolve = resolve;
        this._restTimeout = setTimeout(() => {
          this.restWakeResolve = null;
          resolve("timeout");
        }, restMs);
      });
    } finally {
      clearInterval(countdownInterval);
      clearTimeout(this._restTimeout);
      this.isResting = false;
      this.restUntil = 0;
      this.restReason = null;
      this.emit("rest-end");
    }

    console.log("[AutonomousEngine] Rest complete, resuming work");
    if (this.narrator) this.narrator.observe("Rest complete — resuming work");
    if (this.heartbeat) this.heartbeat.beat("rest-end");
  }

  /**
   * Check if currently in quiet hours (22:00-07:00)
   */
  _isQuietHours() {
    const hour = new Date().getHours();
    return hour >= 22 || hour < 7;
  }

  /**
   * Extend current rest period due to rate limiting.
   * Called by claude-code-cli when it detects rate limits.
   */
  extendRestForRateLimit() {
    if (this.isResting) {
      // Extend existing rest to at least 30 min from now
      const newRestUntil = Date.now() + REST_AFTER_RATE_LIMIT;
      if (newRestUntil > this.restUntil) {
        this.restUntil = newRestUntil;
        this.restReason = "rate limit — extended rest";
        const remainMin = Math.round((this.restUntil - Date.now()) / 60000);
        console.log(`[AutonomousEngine] Rest extended to ${remainMin}m (rate limit)`);
        this.emit("rest-extended", { restUntil: this.restUntil, reason: "rate-limit" });
      }
    } else {
      // Not resting — start a 30min rest
      this.restBetweenCycles("rate limit detected", REST_AFTER_RATE_LIMIT);
    }
  }

  /**
   * Wake from rest early — called when user sends a message
   */
  wakeFromRest() {
    if (this.isResting && this.restWakeResolve) {
      console.log("[AutonomousEngine] Woken from rest (user activity)");
      if (this.narrator) this.narrator.observe("Woken from rest — user needs attention");
      this.restWakeResolve("user-wake");
      this.restWakeResolve = null;
    }
  }

  /**
   * Get rest status for UI
   */
  getRestStatus() {
    if (!this.isResting) return null;
    const remaining = Math.max(0, this.restUntil - Date.now());
    const totalRestMin = Math.round(this.restPeriodMs / 60000);
    let completeness = 0;
    try { completeness = calculateDataCompleteness().percentage; } catch {}
    return {
      resting: true,
      remainingMs: remaining,
      remainingMin: Math.round(remaining / 60000),
      totalRestMin,
      completeness,
      reason: this.restReason || null,
      restUntil: new Date(this.restUntil).toISOString()
    };
  }

  /**
   * Set the goal manager instance
   */
  setGoalManager(manager) {
    this.goalManager = manager;
  }

  /**
   * Set the AI brain instance
   */
  setAIBrain(brain) {
    this.aiBrain = brain;
  }

  /**
   * Set the activity narrator instance
   */
  setNarrator(narrator) {
    this.narrator = narrator;
  }

  /**
   * Set the tool executor instance
   */
  setToolExecutor(executor) {
    this.toolExecutor = executor;
  }

  /**
   * Set the action scheduler instance
   */
  setActionScheduler(scheduler) {
    this.actionScheduler = scheduler;
  }

  /**
   * Set the project manager instance
   */
  setProjectManager(manager) {
    this.projectManager = manager;
  }

  /**
   * Initialize action scheduler and project manager
   */
  initializeServices() {
    if (!this.actionScheduler) {
      this.actionScheduler = getActionScheduler();
    }
    if (!this.projectManager) {
      this.projectManager = getProjectManager();
    }
  }

  /**
   * Switch to a project for the current goal
   * Creates project if it doesn't exist
   */
  async switchToProjectForGoal(goal) {
    if (!goal || !this.projectManager) return null;

    try {
      // Create or get project for this goal
      const project = await this.projectManager.createProjectForGoal(goal);

      if (project) {
        this.currentProject = project;

        // Update action scheduler context
        if (this.actionScheduler) {
          this.actionScheduler.setContext(goal, project);
        }

        // Log project switch
        if (this.narrator) {
          this.narrator.observe(`Switched to project: ${project.name}`);
        }

        this.emit("project-switched", { goal, project });
        return project;
      }
    } catch (error) {
      console.error("[AutonomousEngine] Failed to switch project:", error.message);
    }

    return null;
  }

  /**
   * Schedule an action for later execution
   */
  scheduleAction(action) {
    if (!this.actionScheduler) {
      this.initializeServices();
    }

    const scheduledAction = this.actionScheduler.scheduleAction({
      ...action,
      goalId: action.goalId || this.currentGoal?.id,
      projectId: action.projectId || this.currentProject?.name
    });

    this.emit("action-scheduled", scheduledAction);
    return scheduledAction;
  }

  /**
   * Schedule multiple actions in sequence (with dependencies)
   */
  scheduleActionSequence(actions) {
    if (!this.actionScheduler) {
      this.initializeServices();
    }

    const scheduledActions = [];
    let previousActionId = null;

    for (const action of actions) {
      const scheduledAction = this.scheduleAction({
        ...action,
        dependsOn: previousActionId ? [previousActionId] : []
      });
      scheduledActions.push(scheduledAction);
      previousActionId = scheduledAction.id;
    }

    return scheduledActions;
  }

  /**
   * Schedule a recurring action
   */
  scheduleRecurringAction(action, recurrence) {
    return this.scheduleAction({
      ...action,
      recurrence
    });
  }

  /**
   * Get next scheduled action
   */
  getNextScheduledAction() {
    if (!this.actionScheduler) return null;
    return this.actionScheduler.getNextAction();
  }

  /**
   * Get scheduler status
   */
  getSchedulerStatus() {
    if (!this.actionScheduler) return null;
    return this.actionScheduler.getStatus();
  }

  /**
   * Set the current goal directly
   * Also switches to the appropriate project context
   * NEW: Requires user approval before starting significant goals
   */
  async setCurrentGoal(goal, options = {}) {
    const { skipApproval = false, approved = false } = options;

    // If approval is required and not yet approved, request it
    if (goal && !skipApproval && !approved && !this.goalApprovals?.has(goal.id)) {
      const approval = await this.requestGoalApproval(goal);
      if (approval) {
        // Wait for approval - don't start goal yet
        this.pendingGoal = goal;
        this.emit("awaiting-approval", { goal, approval });

        // Notify user via WhatsApp so they can approve from their phone
        askUser(
          `I'd like to start working on: *${goal.title}*\n\n` +
          `Category: ${goal.category || "general"}\n` +
          `${goal.description ? `Details: ${goal.description.slice(0, 200)}\n\n` : "\n"}` +
          `Reply "yes" to approve or "no" to skip.`,
          { context: "goal-approval", trigger: "goal-approval", identifier: `approve_${goal.id}` }
        ).catch(() => {});

        return false;
      }
    }

    this.currentGoal = goal;
    this.pendingGoal = null;
    this.actionHistory = [];
    this.actionCount = 0;

    if (this.narrator) {
      this.narrator.setGoal(goal?.title || null);
    }

    // Switch to project for this goal
    if (goal) {
      await this.switchToProjectForGoal(goal);
      // Set persistent work context in title (stays until goal changes)
      setWorkContext(`Working: ${goal.title.slice(0, 50)}`);
    } else {
      // Clear work context when no goal is active
      clearWorkContext();
    }

    this.emit("goal-set", goal);
    return true;
  }

  /**
   * Request approval for a goal before starting it
   */
  async requestGoalApproval(goal) {
    if (!goal) return null;

    // Skip approval for research-only or low-impact goals
    const lowImpactKeywords = ["research", "analyze", "review", "check", "monitor"];
    const isLowImpact = lowImpactKeywords.some(k => goal.title?.toLowerCase().includes(k));
    if (isLowImpact) return null;

    // Build context explaining why this goal matters
    const actionApproval = getActionApproval();
    const beliefs = this.contextProviders.beliefs ? await this.contextProviders.beliefs() : [];
    const goals = this.contextProviders.goals ? await this.contextProviders.goals() : [];

    const context = actionApproval.buildActionContext({
      title: goal.title,
      description: goal.description || goal.title,
      metadata: goal
    }, { beliefs, goals });

    // Determine the action type
    let actionType = APPROVAL_REQUIRED_ACTIONS.START_GOAL;
    if (goal.title?.toLowerCase().includes("apply")) {
      actionType = APPROVAL_REQUIRED_ACTIONS.APPLY_TO_PROGRAM;
    } else if (goal.title?.toLowerCase().includes("buy") || goal.title?.toLowerCase().includes("sell")) {
      actionType = APPROVAL_REQUIRED_ACTIONS.TRADE_STOCK;
    } else if (goal.title?.toLowerCase().includes("email") || goal.title?.toLowerCase().includes("message")) {
      actionType = APPROVAL_REQUIRED_ACTIONS.SEND_MESSAGE;
    }

    // Request approval
    const approval = await actionApproval.requestApproval({
      type: actionType,
      title: goal.title,
      description: goal.description || `Start working on: ${goal.title}`,
      context: {
        whyMatters: context.whyMatters || `This goal is in your ${goal.category || "general"} category.`,
        whyNow: context.whyNow || (goal.priority === 1 ? "This is your highest priority goal." : "This aligns with your current focus."),
        bigPicture: context.bigPicture || "Part of your life optimization journey.",
        benefits: goal.expectedOutcome || "Progress toward your goals.",
        risks: "Time investment required."
      },
      urls: goal.urls || [],
      metadata: { goalId: goal.id, category: goal.category, priority: goal.priority }
    });

    return approval;
  }

  /**
   * Handle approval response for a pending goal
   */
  async handleApprovalResponse(approvalId, approved) {
    if (!this.pendingGoal) return;

    if (!this.goalApprovals) {
      this.goalApprovals = new Set();
    }

    if (approved) {
      // Mark goal as approved and start it
      this.goalApprovals.add(this.pendingGoal.id);
      await this.setCurrentGoal(this.pendingGoal, { approved: true });

      if (this.narrator) {
        this.narrator.observe(`Goal approved: ${this.pendingGoal.title}`);
      }

      this.emit("goal-approved", this.pendingGoal);
    } else {
      // Goal rejected - clear it
      if (this.narrator) {
        this.narrator.observe(`Goal rejected: ${this.pendingGoal.title}`);
      }
      this.emit("goal-rejected", this.pendingGoal);
      this.pendingGoal = null;
    }
  }

  /**
   * Get the state for a tool/activity type
   */
  getStateForTool(toolType) {
    return STATE_FOR_ACTIVITY[toolType] || "working";
  }

  /**
   * Register a context provider (e.g., portfolio, health, goals)
   */
  registerContextProvider(name, provider) {
    this.contextProviders[name] = provider;
  }

  /**
   * Register an executor for action types
   */
  registerExecutor(tool, executor) {
    this.executors[tool] = executor;
  }

  /**
   * Get current context from all providers
   */
  async getContext() {
    const context = {};
    for (const [name, provider] of Object.entries(this.contextProviders)) {
      try {
        context[name] = await provider();
      } catch (error) {
        context[name] = { error: error.message };
      }
    }
    return context;
  }

  /**
   * Generate action proposals using AI
   */
  async generateProposals(context, generateFn) {
    const needed = this.state.config.maxProposedActions - this.state.proposedActions.length;
    if (needed <= 0) return [];

    try {
      const proposals = await generateFn(context, needed);

      // Add proposals to state
      const newActions = proposals.map(p => createAIAction(p));
      this.state.proposedActions.push(...newActions);

      // Trim to max
      this.state.proposedActions = this.state.proposedActions.slice(0, this.state.config.maxProposedActions);

      saveEngineState(this.state);
      this.emit("proposals-updated", this.state.proposedActions);

      return newActions;
    } catch (error) {
      this.emit("error", { type: "generation", error: error.message });
      return [];
    }
  }

  /**
   * Approve an action by ID
   */
  approveAction(actionId) {
    const index = this.state.proposedActions.findIndex(a => a.id === actionId);
    if (index === -1) return null;

    const action = this.state.proposedActions.splice(index, 1)[0];
    action.status = AI_ACTION_STATUS.APPROVED;
    action.approvedAt = new Date().toISOString();

    this.state.approvedQueue.push(action);
    saveEngineState(this.state);

    this.emit("action-approved", action);
    return action;
  }

  /**
   * Reject an action by ID
   */
  rejectAction(actionId) {
    const index = this.state.proposedActions.findIndex(a => a.id === actionId);
    if (index === -1) return null;

    const action = this.state.proposedActions.splice(index, 1)[0];
    action.status = AI_ACTION_STATUS.REJECTED;

    saveEngineState(this.state);
    this.emit("action-rejected", action);
    return action;
  }

  /**
   * Approve all proposed actions
   */
  approveAll() {
    const approved = [];
    while (this.state.proposedActions.length > 0) {
      const action = this.state.proposedActions.shift();
      action.status = AI_ACTION_STATUS.APPROVED;
      action.approvedAt = new Date().toISOString();
      this.state.approvedQueue.push(action);
      approved.push(action);
    }
    saveEngineState(this.state);
    this.emit("actions-approved", approved);
    return approved;
  }

  /**
   * Execute the next approved action
   */
  async executeNext() {
    // Check if already executing
    if (this.state.currentAction) {
      return null;
    }

    // Get next from approved queue
    if (this.state.approvedQueue.length === 0) {
      return null;
    }

    const action = this.state.approvedQueue.shift();
    action.status = AI_ACTION_STATUS.EXECUTING;
    action.startedAt = new Date().toISOString();
    this.state.currentAction = action;

    saveEngineState(this.state);
    this.emit("action-started", action);

    try {
      const executor = this.executors[action.executionPlan.tool];
      if (!executor) {
        throw new Error(`No executor registered for tool: ${action.executionPlan.tool}`);
      }

      const result = await executor(action);

      action.status = AI_ACTION_STATUS.COMPLETED;
      action.completedAt = new Date().toISOString();
      action.result = result;

      // Move to completed
      this.state.completedActions.unshift(action);
      this.state.completedActions = this.state.completedActions.slice(0, 50); // Keep last 50
      this.state.currentAction = null;

      saveEngineState(this.state);
      this.emit("action-completed", action);

      // Record action for skill discovery
      try {
        const discovery = getSkillDiscovery();
        const newSkill = discovery.recordAction(
          action.type || action.label || "unknown",
          action.description || action.label || "Engine action completed",
          { goalId: this.state.currentGoal?.id, project: this.state.currentProject }
        );
        if (newSkill) {
          discovery.notifyNewSkill(newSkill);
        }
      } catch {}

      return action;
    } catch (error) {
      action.status = AI_ACTION_STATUS.FAILED;
      action.completedAt = new Date().toISOString();
      action.error = error.message;

      // Move to completed (as failed)
      this.state.completedActions.unshift(action);
      this.state.completedActions = this.state.completedActions.slice(0, 50);
      this.state.currentAction = null;

      saveEngineState(this.state);
      this.emit("action-failed", action);

      return action;
    }
  }

  /**
   * Run one cycle of the autonomous loop
   */
  async runCycle(generateFn) {
    this.state.cycleCount++;
    this.state.lastCycleAt = new Date().toISOString();

    this.emit("cycle-start", this.state.cycleCount);

    // 1. Execute any approved actions
    if (this.state.approvedQueue.length > 0 && !this.state.currentAction) {
      await this.executeNext();
    }

    // 2. Generate new proposals if needed
    if (this.state.proposedActions.length < this.state.config.maxProposedActions) {
      const context = await this.getContext();
      await this.generateProposals(context, generateFn);
    }

    // 3. Auto-approve certain action types
    for (const action of [...this.state.proposedActions]) {
      if (this.state.config.autoApproveTypes.includes(action.type)) {
        this.approveAction(action.id);
      }
    }

    saveEngineState(this.state);
    this.emit("cycle-end", this.state.cycleCount);
  }

  /**
   * Start the autonomous loop (legacy)
   */
  start(generateFn) {
    if (this.state.running) return;

    this.state.running = true;
    this.running = true;
    saveEngineState(this.state);

    this.emit("started");

    // Run first cycle immediately
    this.runCycle(generateFn);

    // Get interval based on model (Opus: 15min, Sonnet: 30sec)
    const intervalMs = getCycleIntervalForModel();
    const intervalLabel = intervalMs >= 60000 ? `${intervalMs / 60000} minutes` : `${intervalMs / 1000} seconds`;
    console.log(`[AutonomousEngine] Cycle interval: ${intervalLabel} (model: ${getCurrentModelInUse().includes("opus") ? "Opus 4.6" : "Sonnet"})`);

    // Start interval
    this.loopInterval = setInterval(() => {
      this.runCycle(generateFn);
    }, intervalMs);
  }

  /**
   * Stop the autonomous loop
   */
  stop() {
    if (!this.state.running && !this.running) return;

    this.state.running = false;
    this.running = false;
    saveEngineState(this.state);

    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }

    // Stop heartbeat tracking
    if (this.heartbeat) {
      this.heartbeat.stop();
    }

    this.emit("stopped");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW AUTONOMOUS LOOP - AUTO-START, TOOL CHAINING, NO USER APPROVAL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start the true autonomous loop
   * AUTO-START: Automatically selects highest priority goal and begins work
   *
   * WORKER COORDINATION: Only executes if this instance is the worker.
   * Viewer instances can see state but won't execute actions.
   */
  async startAutonomousLoop() {
    if (this.running) {
      console.log("[AutonomousEngine] Already running");
      return;
    }

    // Check worker coordination
    const coordination = getWorkerCoordination();
    if (coordination.isViewer()) {
      console.log("[AutonomousEngine] Running in VIEWER mode - observing only");
      this.viewerMode = true;
      this.running = true;
      // In viewer mode, we still track state but don't execute
      this.emit("started", { mode: WORKER_MODE.VIEWER });
      return;
    }

    this.viewerMode = false;
    this.running = true;

    // Initialize services
    this.initializeServices();

    this.emit("autonomous-started");

    // Start heartbeat tracking
    const heartbeat = getEngineHeartbeat();
    heartbeat.start();
    this.heartbeat = heartbeat;

    // Restore last session ID for Claude Code --resume (context continuity)
    try {
      const sessionPath = path.join(DATA_DIR, "engine-session.json");
      if (fs.existsSync(sessionPath)) {
        const saved = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
        if (saved.sessionId) {
          this.lastSessionId = saved.sessionId;
          console.log(`[AutonomousEngine] Restored session ${saved.sessionId.slice(0, 12)}... (cycle ${saved.cycleCount || 0})`);
        }
      }
    } catch {}

    // Watchdog: auto-restart loop if it stalls
    heartbeat.on("stalled", ({ sinceLastBeatMin }) => {
      console.log(`[AutonomousEngine] Watchdog detected stall (${sinceLastBeatMin}min). Restarting loop...`);
      heartbeat.recordRestart(`Watchdog: stalled for ${sinceLastBeatMin} minutes`);
      // Re-run the loop
      if (this.running) {
        this.runAutonomousLoop().catch(err => {
          console.error("[AutonomousEngine] Loop restart failed:", err.message);
          heartbeat.recordError("Loop restart failed: " + err.message);
        });
      }
    });

    // Run the autonomous loop
    await this.runAutonomousLoop();
  }

  /**
   * Run the autonomous loop
   * Uses Claude Code CLI with GPT-5.2 supervision for goal execution
   */
  async runAutonomousLoop() {
    // Initialize Claude Orchestrator — reuse across cycles for session continuity
    const orchestrator = getClaudeOrchestrator({
      maxTurns: 30,
      evaluationInterval: 5000,
      timeout: 600000
    });

    // Restore session ID from last run (enables --resume for context continuity)
    if (this.lastSessionId) {
      orchestrator.sessionId = this.lastSessionId;
      console.log(`[AutonomousEngine] Resuming Claude session: ${this.lastSessionId.slice(0, 12)}...`);
    }

    // Set up orchestrator event handlers
    this.setupOrchestratorEvents(orchestrator);

    while (this.running) {
      try {
        // Heartbeat: engine is alive
        if (this.heartbeat) this.heartbeat.beat("loop-iteration");
        this.cycleCount++;

        // VIEWER MODE: Check if we should execute or just observe
        if (this.viewerMode) {
          // In viewer mode, just wait and sync state periodically
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Check if we've become the worker
          const coordination = getWorkerCoordination();
          if (coordination.shouldExecute()) {
            console.log("[AutonomousEngine] Promoted to WORKER mode");
            this.viewerMode = false;
            this.emit("mode-changed", { mode: WORKER_MODE.WORKER });
          }
          continue;
        }

        // 0. Check for scheduled actions first
        if (this.actionScheduler) {
          const scheduledAction = this.actionScheduler.getNextAction();
          if (scheduledAction) {
            this.setEngineState("executing");

            if (this.narrator) {
              this.narrator.observe(`Executing scheduled action: ${scheduledAction.type}`);
            }

            await this.actionScheduler.executeAction(scheduledAction, async (action) => {
              const executor = this.toolExecutor || getToolExecutor();
              return await executor.execute({
                action: action.tool,
                target: action.target,
                params: action.params
              });
            });

            continue; // Check for more scheduled actions
          }
        }

        // 1. AUTO-START: Check for current goal, auto-select if none
        if (!this.currentGoal) {
          this.setEngineState("thinking");

          if (this.goalManager) {
            await this.goalManager.initialize();
            this.currentGoal = this.goalManager.getCurrentGoal();
          }

          if (!this.currentGoal) {
            // No goals available — THINK and GENERATE new ones
            const timeSinceLastGen = Date.now() - this.lastGoalGeneration;
            if (this.aiBrain && timeSinceLastGen > this.goalGenerationCooldownMs) {
              this.setEngineState("thinking");
              if (this.narrator) {
                this.narrator.setState("THINKING");
                this.narrator.observe("No active goals — thinking about what to work on...");
              }
              if (this.heartbeat) this.heartbeat.beat("generating-goals");

              try {
                console.log("[AutonomousEngine] No goals — generating from context...");
                const suggestedGoals = await this.aiBrain.generateGoalsFromContext();
                this.lastGoalGeneration = Date.now();

                if (suggestedGoals && suggestedGoals.length > 0) {
                  console.log(`[AutonomousEngine] Generated ${suggestedGoals.length} new goals`);
                  for (const goal of suggestedGoals) {
                    this.goalManager.addGoal(goal, false);
                  }
                  if (this.heartbeat) this.heartbeat.recordWork(`Generated ${suggestedGoals.length} new goals`);

                  // Now pick the best one
                  this.currentGoal = this.goalManager.selectNextGoal();
                  if (this.currentGoal) {
                    await this.goalManager.setCurrentGoal(this.currentGoal);
                    if (this.narrator) {
                      this.narrator.observe(`Created and starting: ${this.currentGoal.title}`);
                    }
                  }
                } else {
                  console.log("[AutonomousEngine] AI brain returned no goals — resting");
                  if (this.narrator) this.narrator.observe("No ideas generated — resting before retry");
                  await this.restBetweenCycles("no work available", REST_NO_WORK);
                  continue;
                }
              } catch (genError) {
                console.error("[AutonomousEngine] Goal generation failed:", genError.message);
                if (this.heartbeat) this.heartbeat.recordError("Goal generation: " + genError.message);
                this.lastGoalGeneration = Date.now(); // Prevent rapid retries
                this.setEngineState("idle");
                await this.wait(30000);
                continue;
              }
            } else {
              // Cooldown active — just wait
              this.setEngineState("idle");
              await this.wait(30000);
              continue;
            }

            // If still no goal after generation, wait
            if (!this.currentGoal) {
              this.setEngineState("idle");
              await this.wait(30000);
              continue;
            }
          }

          // Switch to project for this goal
          await this.switchToProjectForGoal(this.currentGoal);

          // Log goal selection
          if (this.narrator) {
            this.narrator.setGoal(this.currentGoal.title);
            this.narrator.observe(`Starting work on: ${this.currentGoal.title}`);
          }
        }

        // 1.5. CHECK IF CURRENT GOAL IS ON HOLD OR BLOCKED
        if (this.shouldSwitchGoal()) {
          this.setEngineState("reflecting");

          if (this.narrator) {
            this.narrator.observe("Current goal blocked - checking alternatives...");
          }

          const newGoal = await this.switchToNextGoal("blocked");

          if (!newGoal) {
            // All goals blocked - wait and re-check
            this.setEngineState("idle");
            await this.wait(10000); // Wait longer before re-checking
            continue;
          }

          // Continue with new goal
          continue;
        }

        // 1.6. EVALUATE CRITERIA - Check if goal might be complete or should be on hold
        if (this.goalManager && this.currentGoal) {
          const contextData = await this.getContext();
          const evaluation = await this.goalManager.evaluateCriteria(this.currentGoal, contextData);

          if (evaluation && evaluation.complete) {
            // Goal criteria met - complete it
            if (this.narrator) {
              this.narrator.observe("Goal criteria met - completing goal");
            }
            await this.completeCurrentGoal();
            continue;
          }

          // Check if partially complete and should notify
          if (evaluation && evaluation.completedCount > 0 && evaluation.completedCount < evaluation.totalCount) {
            if (this.narrator) {
              this.narrator.observe(`Progress: ${evaluation.completedCount}/${evaluation.totalCount} criteria met`);
            }
          }
        }

        // 2. Check if Claude Code is available
        const claudeStatus = await getClaudeCodeStatus();

        if (claudeStatus.ready) {
          // ═══════════════════════════════════════════════════════════════
          // CLAUDE CODE MODE: Run goal through Claude CLI with GPT-5.2 supervision
          // ═══════════════════════════════════════════════════════════════
          this.setEngineState("executing");

          if (this.narrator) {
            this.narrator.observe(`Executing via Claude Code CLI...`);
          }

          // Gather user context so Claude has real data about the user
          let userContext = {};
          try {
            userContext = await this.getContext();
          } catch {}

          // Match goal to a specialized agent for domain-specific identity injection
          let agentIdentity = null;
          try {
            const agent = matchGoalToAgent(this.currentGoal);
            if (agent) {
              agentIdentity = agent.identity;
              console.log(`[AutonomousEngine] Agent: ${agent.id} handling goal: ${this.currentGoal.title}`);
              if (this.narrator) {
                this.narrator.observe(`Agent: ${agent.id} activated`);
              }
            }
          } catch {}

          // Execute goal with Claude Orchestrator (15-min timeout to prevent infinite hangs)
          const GOAL_TIMEOUT = 15 * 60 * 1000;
          const result = await Promise.race([
            orchestrator.executeGoal(this.currentGoal, { workDir: process.cwd(), userContext, agentIdentity }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Goal execution timeout (15min)")), GOAL_TIMEOUT)
            )
          ]).catch(err => ({
            success: false,
            error: err.message,
            output: "Timed out"
          }));

          // Signal Claude Code CLI has finished
          this.emit("claude-end", { success: result.success, goal: this.currentGoal });

          // SAVE SESSION ID — enables --resume for context continuity across cycles
          if (result.sessionId) {
            this.lastSessionId = result.sessionId;
            orchestrator.sessionId = result.sessionId;
            // Persist to state file for crash recovery
            try {
              const statePath = path.join(DATA_DIR, "engine-session.json");
              fs.writeFileSync(statePath, JSON.stringify({
                sessionId: result.sessionId,
                goalId: this.currentGoal?.id,
                goalTitle: this.currentGoal?.title,
                cycleCount: this.cycleCount,
                savedAt: new Date().toISOString()
              }, null, 2));
            } catch {}
          }

          // Record heartbeat for completed work
          if (this.heartbeat) {
            const goalTitle = this.currentGoal?.title || this.currentGoal?.id || "unknown";
            this.heartbeat.recordWork(`Goal: ${goalTitle} (${result.success ? "success" : "failed"})`);
          }

          // Process result
          if (result.success) {
            if (this.narrator) {
              this.narrator.observe(`Progress: ${result.output?.slice(0, 100)}...`);
            }

            // Record in goal manager
            if (this.goalManager) {
              for (const toolCall of (result.toolCalls || [])) {
                this.goalManager.recordAction({
                  action: toolCall.tool,
                  target: JSON.stringify(toolCall.input).slice(0, 100)
                }, { success: true });
                this.actionCount++;
              }
            }

            // Check if goal is truly complete (based on action count and goal manager)
            if (this.actionCount >= this.maxActionsPerGoal || (this.goalManager && this.goalManager.isGoalComplete())) {
              await this.completeCurrentGoal();
            }
            // Otherwise continue the loop - Claude Code will handle chaining
          } else {
            // Goal failed or incomplete
            const errorStr = result.error || '';
            const isBillingError = errorStr.toLowerCase().includes('credit balance') ||
                                   errorStr.toLowerCase().includes('billing') ||
                                   errorStr.toLowerCase().includes('insufficient');

            if (isBillingError) {
              // Billing error — pause for 1 hour, then auto-resume (fallback models may work)
              console.log("[AutonomousEngine] Billing error detected, pausing for 1 hour then auto-resuming");
              if (this.narrator) {
                this.narrator.observe(`Billing issue — pausing 1h, will retry with fallback models`);
              }
              if (this.heartbeat) this.heartbeat.recordError("Billing error — 1h pause");
              await this.wait(60 * 60 * 1000); // 1 hour
              console.log("[AutonomousEngine] Auto-resuming after billing pause");
              if (this.heartbeat) this.heartbeat.recordRestart("Auto-resume after billing pause");
              continue; // Retry the loop — fallback chain in multi-ai.js should skip exhausted models
            }

            if (this.narrator) {
              this.narrator.observe(`Working on issue: ${result.error || 'retrying'}`);
            }

            // Increment failure count but keep trying
            this.actionCount++;

            // Only give up after many failures (not just 3)
            if (this.actionCount >= 20) {
              // Too many failures, move to next goal
              await this.completeCurrentGoal();
            }
            // Otherwise loop continues and tries again
          }

          // ── HANDOFF CHAINING ──
          // Extract handoff instructions from Claude's output so next cycle continues
          if (result.output) {
            const handoff = this.extractHandoff(result.output);
            if (handoff) {
              this.saveHandoff(handoff);
              console.log(`[AutonomousEngine] Handoff saved: ${handoff.nextTask?.slice(0, 60)}`);
            }
          }

          // ── CONTEXT SYNC ──
          // After meaningful work, trigger Firebase context sync so cloud AI has fresh data
          if (result.success) {
            this.triggerContextSync("engine work completed");

            // ── PROACTIVE OUTREACH ──
            // Only notify on goal completion, not mid-cycle (mid-cycle raw output is garbled).
            // The completeCurrentGoal() method handles proper completion notifications.
          }

          // ── WORK-REST CYCLE ──
          // Adaptive rest: success=15m, rate-limit=30m, quiet-hours=60m, no-work=30m
          // Rest is interruptible — wakeFromRest() skips it immediately.
          // Session ID is preserved so --resume picks up context next cycle.
          if (this.running && !this.isResting) {
            const restMs = result.success ? REST_AFTER_SUCCESS : REST_AFTER_RATE_LIMIT;
            await this.restBetweenCycles(
              result.success ? "work cycle complete" : "error recovery",
              restMs
            );
          }

        } else {
          // ═══════════════════════════════════════════════════════════════
          // FALLBACK MODE: Use AI Brain + Tool Executor with Task Management
          // ═══════════════════════════════════════════════════════════════
          this.setEngineState("thinking");

          if (this.narrator) {
            this.narrator.observe(`Using task-based execution mode`);
          }

          // Try to get next task from goal manager first
          let currentTask = this.getNextTask();
          let nextAction = null;

          if (currentTask) {
            // Convert task to action
            nextAction = await this.taskToAction(currentTask);

            if (this.narrator) {
              this.narrator.observe(`Working on task: ${currentTask.title}`);
            }
          } else {
            // No structured tasks - fall back to AI Brain action generation
            nextAction = await this.determineNextAction();
          }

          if (!nextAction) {
            // No action determined - check if we should switch goals
            if (this.shouldSwitchGoal()) {
              const newGoal = await this.switchToNextGoal("blocked");
              if (newGoal) continue;
            }

            // Wait and try again
            this.setEngineState("reflecting");
            await this.wait(2000);

            // Only complete if we've exceeded action limit
            if (this.actionCount >= this.maxActionsPerGoal) {
              await this.completeCurrentGoal();
            }
            continue;
          }

          // Execute with Tool Executor
          const toolState = this.getStateForTool(nextAction.action);
          this.setEngineState(toolState);

          try {
            const result = await this.executeAction(nextAction);

            // Track history
            this.actionHistory.push({ action: nextAction, result, timestamp: Date.now() });
            this.actionCount++;

            if (this.actionHistory.length > 30) {
              this.actionHistory = this.actionHistory.slice(-30);
            }

            // Mark task complete if we had one
            if (currentTask && result.success) {
              this.goalManager?.completeTask(currentTask.id, result);
            }

          } catch (error) {
            // Action failed - check if we should put task on hold
            if (currentTask) {
              const shouldHold = this.shouldPutTaskOnHold(error, nextAction);
              if (shouldHold) {
                this.putTaskOnHold(
                  currentTask.id,
                  shouldHold.reason,
                  shouldHold.reviewAt,
                  error.message
                );

                if (this.narrator) {
                  this.narrator.observe(`Task paused: ${shouldHold.reason.replace(/_/g, " ")}`);
                }
              }
            }

            // Check if all tasks are now blocked
            if (this.shouldSwitchGoal()) {
              const newGoal = await this.switchToNextGoal("blocked");
              if (newGoal) continue;
            }
          }

          // Brief reflection between actions
          this.setEngineState("reflecting");
          await this.wait(1500); // 1.5s between actions for visual feedback

          // Check criteria for completion
          if (await this.isGoalComplete()) {
            await this.completeCurrentGoal();
          } else if (this.actionCount >= this.maxActionsPerGoal) {
            // Max actions reached - evaluate and either complete or put on hold
            const contextData = await this.getContext();
            const evaluation = await this.goalManager?.evaluateCriteria(this.currentGoal, contextData);

            if (evaluation?.complete) {
              await this.completeCurrentGoal();
            } else {
              // Not complete but max actions - put on hold
              this.goalManager?.putGoalOnHold(
                this.currentGoal.id,
                HOLD_REASON.TARGET_NOT_MET,
                new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                `Criteria not met after ${this.actionCount} actions`
              );

              await this.switchToNextGoal("blocked");
            }
          }
          // Continue loop for next action
        }

      } catch (error) {
        console.error("[AutonomousEngine] Loop error:", error.message);
        this.emit("loop-error", error);
        if (this.heartbeat) this.heartbeat.recordError(error.message);

        // Show error in terminal title (30 seconds)
        showNotificationTitle("error", `Error: ${error.message.slice(0, 30)}`, 30000);

        // Wait before retrying
        await this.wait(5000);
      }
    }
  }

  /**
   * Set up event handlers for the Claude Orchestrator
   */
  setupOrchestratorEvents(orchestrator) {
    // Started event
    orchestrator.on("started", ({ goal }) => {
      if (this.narrator) {
        this.narrator.setClaudeCodeActive(true, "started");
        this.narrator.observe(`Claude Code starting: ${goal?.title || "goal"}`);
      }
      this.emit("claude-start", { goal });
    });

    // Raw streaming output for real-time display
    orchestrator.on("output", ({ chunk, type }) => {
      // Stream raw output to UI
      this.emit("claude-stream", { chunk, type });

      // Also update narrator with streaming indicator
      if (this.narrator && chunk.length > 0) {
        this.narrator.setClaudeCodeActive(true, "streaming");
      }
    });

    // Tool usage events
    orchestrator.on("tool-use", ({ tool, input }) => {
      if (this.narrator) {
        this.narrator.action(tool.toUpperCase(), JSON.stringify(input).slice(0, 80), null, "WORKING");
      }
      this.emit("claude-tool-use", { tool, input });
    });

    // Claude text output (parsed from stream)
    orchestrator.on("claude-text", ({ text }) => {
      this.emit("claude-text", { text });
      this.emit("claude-output", { text });
    });

    // GPT-5.2 decisions
    orchestrator.on("decision", (decision) => {
      if (this.narrator) {
        this.narrator.observe(`GPT-5.2: ${decision.decision} (${decision.reasoning})`);
      }
      this.emit("evaluation-decision", decision);
    });

    // Completion signals
    orchestrator.on("completion-signal", ({ text }) => {
      if (this.narrator) {
        this.narrator.observe(`Completion signal detected`);
      }
    });

    // Errors
    orchestrator.on("error", ({ error }) => {
      if (this.narrator) {
        this.narrator.observe(`Claude error: ${error}`);
      }
      this.emit("claude-error", { error });
    });

    // Escalation
    orchestrator.on("escalate", ({ decision }) => {
      if (this.narrator) {
        this.narrator.observe(`ESCALATION: ${decision.reasoning}`);
      }
      this.emit("needs-human", { reason: decision.reasoning });
    });
  }

  /**
   * Determine the next action to take based on goal and context
   */
  async determineNextAction() {
    if (!this.currentGoal) {
      return null;
    }

    try {
      // Try AI brain first
      if (this.aiBrain) {
        const result = await this.aiBrain.determineNextAction(
          this.currentGoal,
          this.actionHistory
        );

        if (result) {
          return result;
        }
      }

      // Fallback: Generate simple actions based on goal category and history
      return this.generateFallbackAction();
    } catch (error) {
      console.error("[AutonomousEngine] Failed to determine next action:", error.message);
      // Return fallback action on error
      return this.generateFallbackAction();
    }
  }

  /**
   * Generate a simple fallback action when AI is not available
   */
  generateFallbackAction() {
    if (!this.currentGoal) return null;

    const actionsCount = this.actionHistory.length;
    const category = this.currentGoal.category || "growth";
    const title = this.currentGoal.title || "";

    // Simple action sequence based on category
    // Use action names that match TOOL_TYPES in tool-executor.js
    // The narrator will be called separately with proper type mapping
    const actionSequences = {
      finance: [
        { action: "WebSearch", narratorType: "WEB_SEARCH", target: "stock market analysis today opportunities", reasoning: "Research current market conditions" },
        { action: "WebSearch", narratorType: "WEB_SEARCH", target: "best investment strategies 2026", reasoning: "Research investment strategies" },
        { action: "Read", narratorType: "READ", target: "data/portfolio.json", reasoning: "Review current portfolio" },
        { action: "WebSearch", narratorType: "WEB_SEARCH", target: "high growth stocks 2026", reasoning: "Find growth opportunities" }
      ],
      health: [
        { action: "Read", narratorType: "READ", target: "data/oura_data.json", reasoning: "Review current health metrics" },
        { action: "WebSearch", narratorType: "WEB_SEARCH", target: "improve sleep quality tips", reasoning: "Research sleep improvement" },
        { action: "WebSearch", narratorType: "WEB_SEARCH", target: "Oura ring sleep optimization", reasoning: "Find optimization strategies" },
        { action: "Read", narratorType: "READ", target: "data/user_profile.json", reasoning: "Review personal health goals" }
      ],
      family: [
        { action: "WebSearch", narratorType: "WEB_SEARCH", target: "quality family time activities", reasoning: "Research family activities" },
        { action: "WebSearch", narratorType: "WEB_SEARCH", target: "work life balance tips", reasoning: "Find balance strategies" },
        { action: "Read", narratorType: "READ", target: "data/user_profile.json", reasoning: "Review family information" }
      ],
      career: [
        { action: "WebSearch", narratorType: "WEB_SEARCH", target: "job opportunities " + title.slice(0, 50), reasoning: "Search for opportunities" },
        { action: "Read", narratorType: "READ", target: "data/linkedin_profile.json", reasoning: "Review career profile" },
        { action: "WebSearch", narratorType: "WEB_SEARCH", target: "career advancement strategies", reasoning: "Research career growth" }
      ],
      growth: [
        { action: "WebSearch", narratorType: "WEB_SEARCH", target: title.slice(0, 50) + " strategies", reasoning: "Research goal strategies" },
        { action: "Read", narratorType: "READ", target: "data/user_profile.json", reasoning: "Review user context" },
        { action: "WebSearch", narratorType: "WEB_SEARCH", target: "personal development tips 2026", reasoning: "Find growth strategies" }
      ]
    };

    const sequence = actionSequences[category] || actionSequences.growth;
    const actionIndex = actionsCount % sequence.length;

    // Keep cycling through actions until maxActionsPerGoal is reached
    // The main loop will handle goal completion based on actionCount
    // Don't return null here as it would trigger premature goal completion
    return sequence[actionIndex];
  }

  /**
   * Execute an action with proper state display
   */
  async executeAction(action) {
    const executor = this.toolExecutor || getToolExecutor();

    // Emit action start for UI
    this.emit("action-started", {
      type: action.action,
      target: action.target,
      status: "WORKING"
    });

    // Log action to narrator (use narratorType if available, otherwise map action name)
    if (this.narrator) {
      // Map tool executor names to narrator ACTION_TOOLS keys
      const narratorTypeMap = {
        "WebSearch": "WEB_SEARCH",
        "Fetch": "WEB_FETCH",
        "Read": "READ",
        "Write": "WRITE",
        "Edit": "EDIT",
        "Bash": "BASH",
        "Grep": "GREP",
        "Glob": "GLOB"
      };
      const narratorType = action.narratorType || narratorTypeMap[action.action] || action.action;

      this.narrator.action(
        narratorType,
        action.target,
        action.reasoning || null,
        "WORKING"
      );
    }

    try {
      const result = await executor.execute(action);

      // Emit success
      this.emit("action-completed", {
        ...action,
        status: "DONE",
        result
      });

      // Update narrator
      if (this.narrator && result.success) {
        const actionId = this.narrator.actions[0]?.id;
        if (actionId) {
          this.narrator.completeAction(actionId);
          if (result.output || result.content) {
            this.narrator.setActionResult(actionId, result.output || result.content);
          }
        }
      }

      // Record in goal manager
      if (this.goalManager) {
        this.goalManager.recordAction(action, result);
      }

      return result;

    } catch (error) {
      // Emit failure
      this.emit("action-failed", {
        ...action,
        status: "FAILED",
        error: error.message
      });

      // Update narrator
      if (this.narrator) {
        const actionId = this.narrator.actions[0]?.id;
        if (actionId) {
          this.narrator.failAction(actionId);
        }
      }

      throw error;
    }
  }

  /**
   * Set engine state and notify narrator
   */
  setEngineState(state) {
    if (this.narrator) {
      const stateUpper = state.toUpperCase();
      this.narrator.setState(stateUpper);
    }
    this.emit("state-changed", state);
  }

  /**
   * Check if current goal is complete
   * Uses criteria evaluation with context data
   */
  async isGoalComplete() {
    if (!this.currentGoal) return true;

    // Check with goal manager using context data
    if (this.goalManager) {
      // Get current context for criteria evaluation
      const contextData = await this.getContext();

      // Check criteria (async - evaluates against real data)
      const isComplete = await this.goalManager.isGoalComplete(contextData);
      return isComplete;
    }

    // Fallback: check action count
    return this.actionCount >= this.maxActionsPerGoal;
  }

  /**
   * Check if current goal is on hold
   */
  isGoalOnHold() {
    if (!this.currentGoal || !this.goalManager) return false;

    const status = this.goalManager.getGoalStatus(this.currentGoal.id);
    return status?.state === GOAL_STATE.ON_HOLD;
  }

  /**
   * Get next available task for current goal
   * Skips blocked and on-hold tasks
   */
  getNextTask() {
    if (!this.goalManager || !this.currentGoal) return null;
    return this.goalManager.getNextTask(this.currentGoal.id);
  }

  /**
   * Put current task on hold and move to next
   */
  putTaskOnHold(taskId, reason, reviewAt = null, notes = "") {
    if (!this.goalManager) return false;

    const success = this.goalManager.putTaskOnHold(taskId, reason, reviewAt, notes);

    if (success && this.narrator) {
      this.narrator.observe(`Task on hold: ${reason.replace(/_/g, " ")}`);
    }

    return success;
  }

  /**
   * Check if all tasks are blocked/on-hold and we should switch goals
   */
  shouldSwitchGoal() {
    if (!this.goalManager || !this.currentGoal) return false;

    const status = this.goalManager.getGoalStatus(this.currentGoal.id);

    // If goal is on hold, switch
    if (status?.state === GOAL_STATE.ON_HOLD) return true;

    // If all tasks are blocked/on-hold, switch
    if (status?.taskStats) {
      const { total, completed, onHold, blocked, pending, inProgress } = status.taskStats;
      const remaining = total - completed;
      const available = pending + inProgress;

      // No available tasks to work on
      if (remaining > 0 && available === 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Switch to the next available goal when current is blocked
   */
  async switchToNextGoal(reason = "blocked") {
    if (!this.goalManager) return null;

    const currentId = this.currentGoal?.id;

    // Put current goal on hold if switching due to blockage
    if (currentId && reason === "blocked") {
      this.goalManager.putGoalOnHold(
        currentId,
        HOLD_REASON.WAITING_DEPENDENCY,
        new Date(Date.now() + 60 * 60 * 1000).toISOString(), // Review in 1 hour
        "All tasks blocked - switching to next goal"
      );
    }

    // Find next goal that's not on hold
    const activeGoals = this.goalManager.getActiveGoals();
    const onHoldGoalIds = new Set();

    // Get all on-hold goal IDs
    const displayData = this.goalManager.getDisplayData();
    for (const holdInfo of displayData.onHoldGoals || []) {
      onHoldGoalIds.add(holdInfo.goalId);
    }

    // Find first goal that's not the current one and not on hold
    const nextGoal = activeGoals.find(g =>
      g.id !== currentId && !onHoldGoalIds.has(g.id)
    );

    if (nextGoal) {
      await this.goalManager.setCurrentGoal(nextGoal);
      this.currentGoal = nextGoal;
      await this.switchToProjectForGoal(nextGoal);

      if (this.narrator) {
        this.narrator.observe(`Switched to goal: ${nextGoal.title}`);
        this.narrator.setGoal(nextGoal.title);
      }

      this.emit("goal-switched", { previousGoal: currentId, newGoal: nextGoal });
      return nextGoal;
    }

    // No non-held goals available — release the highest-priority on-hold goal
    // so the engine always has something to work toward
    if (onHoldGoalIds.size > 0) {
      const heldGoal = activeGoals.find(g => onHoldGoalIds.has(g.id));
      if (heldGoal) {
        this.goalManager.releaseGoalFromHold(heldGoal.id);
        await this.goalManager.setCurrentGoal(heldGoal);
        this.currentGoal = heldGoal;
        await this.switchToProjectForGoal(heldGoal);

        if (this.narrator) {
          this.narrator.observe(`Resuming held goal: ${heldGoal.title}`);
          this.narrator.setGoal(heldGoal.title);
        }

        this.emit("goal-switched", { previousGoal: currentId, newGoal: heldGoal });
        return heldGoal;
      }
    }

    // Truly no goals at all — ask the user for direction
    if (this.narrator) {
      this.narrator.observe("No goals available - waiting for new goals");
    }

    notifyBlocked(
      "All goals are either completed or blocked",
      "What should I work on next? Any priorities or tasks you'd like me to pick up?"
    ).catch(() => {});

    return null;
  }

  /**
   * Complete the current goal and move to next
   */
  async completeCurrentGoal() {
    if (!this.currentGoal) return;

    const completedGoal = this.currentGoal;

    // Notify narrator
    if (this.narrator) {
      this.narrator.observe(`Completed goal: ${completedGoal.title}`);
    }

    // Update project status
    if (this.projectManager && this.currentProject) {
      this.projectManager.updateProjectStatus(this.currentProject.name, "completed");
      this.projectManager.addUpdate("completed", `Goal completed: ${completedGoal.title}`);
    }

    // Clear scheduled actions for this goal
    if (this.actionScheduler) {
      this.actionScheduler.clearGoalActions(completedGoal.id);
    }

    // Complete in goal manager
    if (this.goalManager) {
      await this.goalManager.completeCurrentGoal();
    }

    // Reset for next goal
    this.currentGoal = null;
    this.currentProject = null;
    this.actionHistory = [];
    this.actionCount = 0;

    // Show goal completion in title
    showNotificationTitle("goal", `Completed: ${completedGoal.title.slice(0, 30)}`, 30000);

    // Notify user via WhatsApp — include what was actually accomplished
    const completionSummary = completedGoal.description
      ? `Wrapped up: ${completedGoal.description.slice(0, 150)}`
      : `Finished working on this.`;
    notifyProgress(completedGoal.title, completionSummary, {
      trigger: "goal-completed",
    }).catch(() => {});

    this.emit("goal-completed", completedGoal);

    // Auto-select next goal — or generate new ones if none available
    if (this.goalManager) {
      let nextGoal = this.goalManager.selectNextGoal();

      // No existing goals? Generate new ones from context
      if (!nextGoal && this.aiBrain) {
        try {
          console.log("[AutonomousEngine] No next goal — generating from context...");
          if (this.narrator) this.narrator.observe("Goal completed — thinking about what's next...");

          const suggestedGoals = await this.aiBrain.generateGoalsFromContext();
          this.lastGoalGeneration = Date.now();

          if (suggestedGoals && suggestedGoals.length > 0) {
            for (const goal of suggestedGoals) {
              this.goalManager.addGoal(goal, false);
            }
            nextGoal = this.goalManager.selectNextGoal();
            if (this.heartbeat) this.heartbeat.recordWork(`Generated ${suggestedGoals.length} new goals after completion`);
          }
        } catch (err) {
          console.error("[AutonomousEngine] Post-completion goal gen failed:", err.message);
        }
      }

      if (nextGoal) {
        await this.goalManager.setCurrentGoal(nextGoal);
        this.currentGoal = nextGoal;
        await this.switchToProjectForGoal(nextGoal);
      }
    }
  }

  /**
   * Convert a task to an executable action
   */
  async taskToAction(task) {
    if (!task) return null;

    // Map task category to tool type
    const categoryToTool = {
      research: "WebSearch",
      analyze: "Read",
      execute: "Bash",
      validate: "Read"
    };

    // Determine tool based on task category and data sources
    let tool = categoryToTool[task.category] || "WebSearch";
    let target = task.title;

    // If task has specific data sources, use appropriate tool
    if (task.dataSources?.length > 0) {
      const dataSource = task.dataSources[0];
      if (dataSource === "web_search") {
        tool = "WebSearch";
        target = task.description || task.title;
      } else if (dataSource === "portfolio" || dataSource === "health" || dataSource === "calendar") {
        tool = "Read";
        target = `data/${dataSource.replace("_", "_")}.json`;
      }
    }

    return {
      action: tool,
      target,
      reasoning: task.description || `Working on: ${task.title}`,
      taskId: task.id
    };
  }

  /**
   * Determine if a task should be put on hold based on error
   */
  shouldPutTaskOnHold(error, action) {
    const errorMsg = error.message?.toLowerCase() || "";

    // External service unavailable
    if (errorMsg.includes("timeout") || errorMsg.includes("connection") || errorMsg.includes("unavailable")) {
      return {
        reason: HOLD_REASON.WAITING_EXTERNAL,
        reviewAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
      };
    }

    // Data not available
    if (errorMsg.includes("not found") || errorMsg.includes("no data") || errorMsg.includes("empty")) {
      return {
        reason: HOLD_REASON.WAITING_DATA,
        reviewAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
      };
    }

    // Rate limiting
    if (errorMsg.includes("rate limit") || errorMsg.includes("too many")) {
      return {
        reason: HOLD_REASON.WAITING_TIME,
        reviewAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
      };
    }

    // Permission or authentication issues
    if (errorMsg.includes("permission") || errorMsg.includes("auth") || errorMsg.includes("unauthorized")) {
      return {
        reason: HOLD_REASON.WAITING_APPROVAL,
        reviewAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      };
    }

    // Don't put on hold for other errors (might be transient)
    return null;
  }

  /**
   * Wait helper
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop the autonomous loop
   */
  stopAutonomousLoop() {
    this.running = false;
    this.emit("autonomous-stopped");
  }

  // ═══════════════════════════════════════════════════════════════
  // HANDOFF CHAINING — Persist what the next cycle should do
  // ═══════════════════════════════════════════════════════════════

  /**
   * Save handoff instructions for the next cycle
   */
  saveHandoff(handoff) {
    if (!handoff) return;
    try {
      const dir = path.dirname(HANDOFF_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(HANDOFF_FILE, JSON.stringify({
        ...handoff,
        savedAt: new Date().toISOString(),
        fromCycle: this.cycleCount,
        fromGoal: this.currentGoal?.title || null
      }, null, 2));
    } catch {}
  }

  /**
   * Load handoff instructions from previous cycle
   */
  loadHandoff() {
    try {
      if (fs.existsSync(HANDOFF_FILE)) {
        const handoff = JSON.parse(fs.readFileSync(HANDOFF_FILE, "utf-8"));
        // Expire handoffs older than 4 hours
        const savedTime = handoff.savedAt ? new Date(handoff.savedAt).getTime()
                        : handoff.extractedAt ? handoff.extractedAt
                        : 0;
        if (savedTime > 0 && Date.now() - savedTime > 4 * 60 * 60 * 1000) {
          console.log("[AutonomousEngine] Handoff expired (>4h old)");
          return null;
        }
        return handoff;
      }
    } catch {}
    return null;
  }

  /**
   * Extract handoff from Claude Code output
   */
  extractHandoff(output) {
    if (!output) return null;

    // Look for structured handoff block
    const handoffMatch = output.match(/HANDOFF:\s*\n([\s\S]*?)(?:\n---|\n##|\nIMPORTANT|$)/i);
    if (handoffMatch) {
      const raw = handoffMatch[1].trim();
      const nextTaskMatch = raw.match(/NEXT\s*TASK:\s*(.+)/i);
      const contextMatch = raw.match(/CONTEXT:\s*(.+)/i);

      return {
        nextTask: nextTaskMatch?.[1]?.trim() || raw.split("\n")[0],
        context: contextMatch?.[1]?.trim() || raw.slice(0, 500),
        fromAction: this.currentGoal?.title || "unknown"
      };
    }

    return null;
  }

  /**
   * Trigger a context sync to Firebase after meaningful work
   */
  async triggerContextSync(reason) {
    try {
      const { getFirebaseContextSync } = await import("../firebase/firebase-context-sync.js");
      const sync = getFirebaseContextSync();
      if (sync.running) {
        sync.triggerSync(reason);
      }
    } catch {}
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    // Get worker coordination status
    let workerStatus = { mode: WORKER_MODE.WORKER, isViewer: false };
    try {
      const coordination = getWorkerCoordination();
      workerStatus = coordination.getStatus();
    } catch (e) {
      // Coordination not initialized
    }

    return {
      running: this.state.running,
      currentAction: this.state.currentAction,
      nextAction: this.state.approvedQueue[0] || null,
      proposedActions: this.state.proposedActions,
      approvedCount: this.state.approvedQueue.length,
      completedCount: this.state.completedActions.length,
      cycleCount: this.state.cycleCount,
      lastCycleAt: this.state.lastCycleAt,
      currentProject: this.currentProject,
      currentGoal: this.currentGoal,
      schedulerStatus: this.getSchedulerStatus(),
      // Worker coordination
      viewerMode: this.viewerMode || false,
      workerMode: workerStatus.mode,
      isViewer: workerStatus.isViewer,
      isWorker: !workerStatus.isViewer,
      // Work-rest cycle
      restStatus: this.getRestStatus(),
      cycleCount: this.cycleCount,
      hasSession: !!this.lastSessionId
    };
  }

  /**
   * Get current project
   */
  getCurrentProject() {
    return this.currentProject;
  }

  /**
   * Switch to a different project by name
   */
  async switchProject(projectName) {
    if (!this.projectManager) {
      this.initializeServices();
    }

    const project = this.projectManager.loadProject(projectName);
    if (project) {
      this.currentProject = project;

      if (this.actionScheduler) {
        this.actionScheduler.setContext(this.currentGoal, project);
      }

      if (this.narrator) {
        this.narrator.observe(`Switched to project: ${project.name}`);
      }

      this.emit("project-switched", { project });
      return project;
    }

    return null;
  }

  /**
   * List all projects
   */
  listProjects() {
    if (!this.projectManager) {
      this.initializeServices();
    }
    return this.projectManager.listProjects();
  }

  /**
   * Get recent completed actions
   */
  getRecentCompleted(limit = 10) {
    return this.state.completedActions.slice(0, limit);
  }

  /**
   * Update configuration
   */
  updateConfig(config) {
    this.state.config = { ...this.state.config, ...config };
    saveEngineState(this.state);
    this.emit("config-updated", this.state.config);
  }

  /**
   * Clear all actions and reset
   */
  reset() {
    this.stop();
    this.state = getDefaultState();
    saveEngineState(this.state);
    this.emit("reset");
  }
}

// Singleton instance
let engineInstance = null;

export const getAutonomousEngine = () => {
  if (!engineInstance) {
    engineInstance = new AutonomousEngine();
  }
  return engineInstance;
};

export default AutonomousEngine;
