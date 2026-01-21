import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

/**
 * Autonomous Engine for BACKBONE
 * Core brain that generates AI-driven actions and executes them
 * Manages goals, proposes actions, and runs the autonomous loop
 */

const DATA_DIR = path.join(process.cwd(), "data");
const ENGINE_STATE_PATH = path.join(DATA_DIR, "autonomous-state.json");

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
    cycleIntervalMs: 30000,      // 30 seconds between cycles
    maxProposedActions: 5,
    requireApproval: true,
    autoApproveTypes: []         // Action types that auto-approve
  }
});

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
   * Start the autonomous loop
   */
  start(generateFn) {
    if (this.state.running) return;

    this.state.running = true;
    saveEngineState(this.state);

    this.emit("started");

    // Run first cycle immediately
    this.runCycle(generateFn);

    // Start interval
    this.loopInterval = setInterval(() => {
      this.runCycle(generateFn);
    }, this.state.config.cycleIntervalMs);
  }

  /**
   * Stop the autonomous loop
   */
  stop() {
    if (!this.state.running) return;

    this.state.running = false;
    saveEngineState(this.state);

    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }

    this.emit("stopped");
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      running: this.state.running,
      currentAction: this.state.currentAction,
      nextAction: this.state.approvedQueue[0] || null,
      proposedActions: this.state.proposedActions,
      approvedCount: this.state.approvedQueue.length,
      completedCount: this.state.completedActions.length,
      cycleCount: this.state.cycleCount,
      lastCycleAt: this.state.lastCycleAt
    };
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
