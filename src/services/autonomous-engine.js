import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { getGoalManager } from "./goal-manager.js";
import { getToolExecutor, TOOL_TYPES } from "./tool-executor.js";
import { STATE_FOR_ACTIVITY, getStateForActivity } from "./engine-state.js";
import { getClaudeOrchestrator, EVALUATION_DECISION, ORCHESTRATION_STATE } from "./claude-orchestrator.js";
import { getClaudeCodeStatus } from "./claude-code-cli.js";
import { getActionScheduler, ACTION_PRIORITY, ACTION_STATUS } from "./action-scheduler.js";
import { getProjectManager } from "./project-manager.js";

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

    // Action scheduler and project integration
    this.actionScheduler = null;
    this.projectManager = null;
    this.currentProject = null;
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
   */
  async setCurrentGoal(goal) {
    this.currentGoal = goal;
    this.actionHistory = [];
    this.actionCount = 0;

    if (this.narrator) {
      this.narrator.setGoal(goal?.title || null);
    }

    // Switch to project for this goal
    if (goal) {
      await this.switchToProjectForGoal(goal);
    }

    this.emit("goal-set", goal);
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

    // Start interval
    this.loopInterval = setInterval(() => {
      this.runCycle(generateFn);
    }, this.state.config.cycleIntervalMs);
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

    this.emit("stopped");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW AUTONOMOUS LOOP - AUTO-START, TOOL CHAINING, NO USER APPROVAL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start the true autonomous loop
   * AUTO-START: Automatically selects highest priority goal and begins work
   */
  async startAutonomousLoop() {
    if (this.running) {
      console.log("[AutonomousEngine] Already running");
      return;
    }

    this.running = true;

    // Initialize services
    this.initializeServices();

    this.emit("autonomous-started");

    // Run the autonomous loop
    await this.runAutonomousLoop();
  }

  /**
   * Run the autonomous loop
   * Uses Claude Code CLI with GPT-5.2 supervision for goal execution
   */
  async runAutonomousLoop() {
    // Initialize Claude Orchestrator
    const orchestrator = getClaudeOrchestrator({
      maxTurns: 30,
      evaluationInterval: 5000,
      timeout: 600000
    });

    // Set up orchestrator event handlers
    this.setupOrchestratorEvents(orchestrator);

    while (this.running) {
      try {
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
            // No goals available - wait and check again
            this.setEngineState("idle");
            await this.wait(5000);
            continue;
          }

          // Switch to project for this goal
          await this.switchToProjectForGoal(this.currentGoal);

          // Log goal selection
          if (this.narrator) {
            this.narrator.setGoal(this.currentGoal.title);
            this.narrator.observe(`Starting work on: ${this.currentGoal.title}`);
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

          // Execute goal with Claude Orchestrator
          const result = await orchestrator.executeGoal(this.currentGoal, {
            workDir: process.cwd()
          });

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

        } else {
          // ═══════════════════════════════════════════════════════════════
          // FALLBACK MODE: Use AI Brain + Tool Executor
          // ═══════════════════════════════════════════════════════════════
          this.setEngineState("thinking");

          if (this.narrator) {
            this.narrator.observe(`Claude Code not available, using fallback mode`);
          }

          // Determine next action using AI Brain
          const nextAction = await this.determineNextAction();

          if (!nextAction) {
            // No action determined - wait and try again
            // Don't complete goal just because no action was returned
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

          const result = await this.executeAction(nextAction);

          // Track history
          this.actionHistory.push({ action: nextAction, result, timestamp: Date.now() });
          this.actionCount++;

          if (this.actionHistory.length > 30) {
            this.actionHistory = this.actionHistory.slice(-30);
          }

          // Brief reflection between actions
          this.setEngineState("reflecting");
          await this.wait(1500); // 1.5s between actions for visual feedback

          // Only complete based on action count (not isGoalComplete which may be too aggressive)
          if (this.actionCount >= this.maxActionsPerGoal) {
            await this.completeCurrentGoal();
          }
          // Continue loop for next action
        }

      } catch (error) {
        console.error("[AutonomousEngine] Loop error:", error.message);
        this.emit("loop-error", error);

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
   */
  isGoalComplete() {
    if (!this.currentGoal) return true;

    // Check with goal manager
    if (this.goalManager) {
      return this.goalManager.isGoalComplete();
    }

    // Fallback: check action count
    return this.actionCount >= this.maxActionsPerGoal;
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

    this.emit("goal-completed", completedGoal);

    // Auto-select next goal (generates plan with GPT-5.2)
    if (this.goalManager) {
      const nextGoal = this.goalManager.selectNextGoal();
      if (nextGoal) {
        await this.goalManager.setCurrentGoal(nextGoal);
        this.currentGoal = nextGoal;
        // Project switching happens in setCurrentGoal
        await this.switchToProjectForGoal(nextGoal);
      }
    }
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
      lastCycleAt: this.state.lastCycleAt,
      currentProject: this.currentProject,
      currentGoal: this.currentGoal,
      schedulerStatus: this.getSchedulerStatus()
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
