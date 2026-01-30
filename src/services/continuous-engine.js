/**
 * Continuous Engine - Works continuously to support user goals
 *
 * Philosophy:
 * - The AI should always be working unless paused by user
 * - Work picks up where it left off (session persistence)
 * - Don't re-evaluate beliefs/goals if already done today
 * - Stream output to show progress
 * - Support both Claude Code CLI and Codex CLI
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { runClaudeCodeStreaming, getClaudeCodeStatus } from "./claude-code-cli.js";
import { hasValidCredentials as hasCodexCredentials } from "./codex-oauth.js";
import { getActivityTracker } from "./activity-tracker.js";

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_DIR = path.join(process.cwd(), "memory");
const PROJECTS_DIR = path.join(process.cwd(), "projects");
const ENGINE_STATE_PATH = path.join(DATA_DIR, "continuous-engine-state.json");
const BACKLOG_PATH = path.join(DATA_DIR, "backlog.json");
const GOALS_PATH = path.join(DATA_DIR, "goals.json");
const BELIEFS_PATH = path.join(DATA_DIR, "core-beliefs.json");

// Work phases
const WORK_PHASE = {
  EVALUATE_BELIEFS: "evaluate-beliefs",
  EVALUATE_GOALS: "evaluate-goals",
  PROCESS_BACKLOG: "process-backlog",
  EXECUTE_TASK: "execute-task",
  RESEARCH: "research",
  IDLE: "idle",
};

// CLI backends
const CLI_BACKEND = {
  CLAUDE_CODE: "claude-code",
  CODEX: "codex",
  NONE: "none",
};

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {}
  return "";
}

function getTodayKey() {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

class ContinuousEngine extends EventEmitter {
  constructor() {
    super();
    this.isEnabled = true;
    this.isWorking = false;
    this.isPaused = false;
    this.currentPhase = WORK_PHASE.IDLE;
    this.currentTask = null;
    this.currentStream = null;
    this.streamBuffer = "";
    this.backend = CLI_BACKEND.NONE;
    this.state = this.loadState();
    this.workInterval = null;
    this.lastUserActivity = Date.now();
  }

  loadState() {
    const defaultState = {
      lastEvaluationDate: null,
      beliefsEvaluated: false,
      goalsEvaluated: false,
      currentTaskId: null,
      currentGoalId: null,
      sessionStarted: null,
      totalWorkSessions: 0,
      totalTasksCompleted: 0,
      recentWork: [],
    };
    return readJson(ENGINE_STATE_PATH) || defaultState;
  }

  saveState() {
    writeJson(ENGINE_STATE_PATH, this.state);
  }

  /**
   * Check if we already evaluated today
   */
  hasEvaluatedToday() {
    const today = getTodayKey();
    return this.state.lastEvaluationDate === today && this.state.beliefsEvaluated && this.state.goalsEvaluated;
  }

  /**
   * Mark evaluation as done for today
   */
  markEvaluationDone(type) {
    const today = getTodayKey();
    if (this.state.lastEvaluationDate !== today) {
      // New day - reset evaluation flags
      this.state.lastEvaluationDate = today;
      this.state.beliefsEvaluated = false;
      this.state.goalsEvaluated = false;
    }
    if (type === "beliefs") this.state.beliefsEvaluated = true;
    if (type === "goals") this.state.goalsEvaluated = true;
    this.saveState();
  }

  /**
   * Detect available CLI backend
   */
  async detectBackend() {
    // Prefer Claude Code CLI
    const claudeStatus = await getClaudeCodeStatus();
    if (claudeStatus.ready) {
      this.backend = CLI_BACKEND.CLAUDE_CODE;
      return { backend: CLI_BACKEND.CLAUDE_CODE, status: claudeStatus };
    }

    // Check Codex
    if (hasCodexCredentials()) {
      this.backend = CLI_BACKEND.CODEX;
      return { backend: CLI_BACKEND.CODEX, status: { ready: true } };
    }

    this.backend = CLI_BACKEND.NONE;
    return { backend: CLI_BACKEND.NONE, status: { ready: false } };
  }

  /**
   * Start the continuous engine
   */
  async start() {
    if (this.workInterval) {
      return;
    }

    const tracker = getActivityTracker();
    tracker.log("connecting", "AI Engine", "working");
    tracker.setState("connecting", "Detecting CLI backend...");

    // Detect backend
    const { backend, status } = await this.detectBackend();

    if (backend === CLI_BACKEND.NONE) {
      tracker.log("error", "No CLI backend available", "error");
      tracker.setState("error", "Connect Claude Code CLI or Codex");
      this.emit("no-backend");
      return;
    }

    const backendName = backend === CLI_BACKEND.CLAUDE_CODE ? "Claude Code CLI" : "Codex CLI";
    tracker.log("connected", `${backendName} ready`, "completed");
    tracker.setState("working", `Starting ${backendName}...`);

    this.state.sessionStarted = new Date().toISOString();
    this.saveState();

    // Start working immediately
    this.startWorkCycle();

    // Continue working every 30 seconds if not already working
    this.workInterval = setInterval(() => {
      if (!this.isWorking && !this.isPaused && this.isEnabled) {
        this.continueWork();
      }
    }, 30_000);

    this.emit("started", { backend });
  }

  /**
   * Start the initial work cycle
   */
  async startWorkCycle() {
    if (this.isWorking) return;

    const tracker = getActivityTracker();

    // Phase 1: Check if we need to evaluate beliefs/goals today
    if (!this.hasEvaluatedToday()) {
      // Need to evaluate - but do it quickly
      const beliefs = readJson(BELIEFS_PATH);
      const goals = readJson(GOALS_PATH);

      if (!beliefs?.beliefs?.length || !this.state.beliefsEvaluated) {
        this.currentPhase = WORK_PHASE.EVALUATE_BELIEFS;
        tracker.setState("thinking", "Checking core beliefs...");
        await this.evaluateBeliefs();
        this.markEvaluationDone("beliefs");
      }

      if (!this.state.goalsEvaluated) {
        this.currentPhase = WORK_PHASE.EVALUATE_GOALS;
        tracker.setState("thinking", "Reviewing goals...");
        await this.evaluateGoals();
        this.markEvaluationDone("goals");
      }
    }

    // Phase 2: Find and execute work
    await this.continueWork();
  }

  /**
   * Continue working on current or next task
   */
  async continueWork() {
    if (this.isWorking || this.isPaused) return;

    const tracker = getActivityTracker();

    // Check if we have an ongoing task
    if (this.state.currentTaskId) {
      await this.resumeTask(this.state.currentTaskId);
      return;
    }

    // Find next task from goals
    const nextTask = this.findNextTask();
    if (nextTask) {
      this.currentPhase = WORK_PHASE.EXECUTE_TASK;
      await this.executeTask(nextTask);
      return;
    }

    // No tasks - work on backlog
    const backlogWork = this.findBacklogWork();
    if (backlogWork) {
      this.currentPhase = WORK_PHASE.PROCESS_BACKLOG;
      await this.processBacklogItem(backlogWork);
      return;
    }

    // Nothing to do - do research
    this.currentPhase = WORK_PHASE.RESEARCH;
    tracker.setState("researching", "Looking for opportunities...");
    await this.doResearch();
  }

  /**
   * Evaluate core beliefs quickly
   */
  async evaluateBeliefs() {
    const profile = readFile(path.join(MEMORY_DIR, "profile.md"));
    const beliefs = readJson(BELIEFS_PATH) || { beliefs: [] };

    if (beliefs.beliefs.length > 0) {
      // Already have beliefs - just verify they're still relevant
      this.emit("stream", "Beliefs already defined - skipping evaluation\n");
      return;
    }

    // Infer beliefs from profile
    const prompt = `You are analyzing user profile to identify their core beliefs.

PROFILE:
${profile.slice(0, 2000)}

Identify 2-4 core beliefs (things they care about forever).
Format as JSON array: [{ "name": "...", "description": "..." }]

Be concise. Output only the JSON.`;

    await this.runCLI(prompt, {
      onData: (text) => {
        // Try to parse beliefs from output
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const inferredBeliefs = JSON.parse(jsonMatch[0]);
            beliefs.beliefs = inferredBeliefs.map((b, i) => ({
              id: `belief_${Date.now()}_${i}`,
              name: b.name,
              description: b.description,
              createdAt: new Date().toISOString(),
              createdBy: "continuous-engine",
            }));
            beliefs.lastUpdated = new Date().toISOString();
            writeJson(BELIEFS_PATH, beliefs);
          } catch {}
        }
      },
    });
  }

  /**
   * Evaluate goals quickly
   */
  async evaluateGoals() {
    const goals = readJson(GOALS_PATH) || { goals: [] };
    const activeGoals = goals.goals?.filter((g) => g.status === "active") || [];

    if (activeGoals.length === 0) {
      this.emit("stream", "No active goals - will find work from backlog\n");
      return;
    }

    // Just verify goals are still relevant - no heavy processing
    this.emit("stream", `${activeGoals.length} active goals found\n`);
  }

  /**
   * Find the next task to work on
   */
  findNextTask() {
    const goals = readJson(GOALS_PATH) || { goals: [] };
    const activeGoals = goals.goals?.filter((g) => g.status === "active") || [];

    for (const goal of activeGoals) {
      // Check if goal has tasks
      if (goal.tasks && goal.tasks.length > 0) {
        const incompleteTasks = goal.tasks.filter((t) => !t.completed && typeof t === "object");
        if (incompleteTasks.length > 0) {
          return {
            type: "goal-task",
            goal,
            task: incompleteTasks[0],
            taskIndex: goal.tasks.indexOf(incompleteTasks[0]),
          };
        }

        // Check string tasks (not yet structured)
        const stringTasks = goal.tasks.filter((t) => typeof t === "string");
        if (stringTasks.length > 0) {
          return {
            type: "goal-task",
            goal,
            task: { description: stringTasks[0], completed: false },
            taskIndex: goal.tasks.indexOf(stringTasks[0]),
          };
        }
      }
    }

    return null;
  }

  /**
   * Find backlog item to work on
   */
  findBacklogWork() {
    const backlog = readJson(BACKLOG_PATH) || { items: [] };

    if (backlog.items.length === 0) return null;

    // Sort by impact score and pick top
    const sorted = [...backlog.items].sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0));

    return sorted[0];
  }

  /**
   * Execute a task
   */
  async executeTask(taskInfo) {
    const tracker = getActivityTracker();
    this.isWorking = true;
    this.currentTask = taskInfo;
    this.state.currentTaskId = taskInfo.goal?.id;
    this.saveState();

    const taskDesc = typeof taskInfo.task === "string" ? taskInfo.task : taskInfo.task.description;

    tracker.setState("working", `Working on: ${taskDesc.slice(0, 50)}...`);
    tracker.setGoal(`Complete: ${taskDesc}`);

    const prompt = this.buildTaskPrompt(taskInfo);

    await this.runCLI(prompt, {
      onComplete: (result) => {
        // Mark task complete if successful
        if (result.success) {
          this.markTaskComplete(taskInfo);
        }
        this.isWorking = false;
        this.currentTask = null;
        this.state.currentTaskId = null;
        this.state.totalTasksCompleted++;
        this.saveState();

        // Continue to next task
        setTimeout(() => this.continueWork(), 2000);
      },
    });
  }

  /**
   * Build prompt for task execution
   */
  buildTaskPrompt(taskInfo) {
    const profile = readFile(path.join(MEMORY_DIR, "profile.md"));
    const taskDesc = typeof taskInfo.task === "string" ? taskInfo.task : taskInfo.task.description;

    return `You are working on a task for BACKBONE life optimization system.

USER PROFILE (for context):
${profile.slice(0, 1000)}

GOAL: ${taskInfo.goal?.title || "General task"}
${taskInfo.goal?.description || ""}

TASK TO COMPLETE:
${taskDesc}

INSTRUCTIONS:
1. Analyze what needs to be done
2. Use available tools to complete the task
3. If research is needed, search the web
4. If files need updating, update them
5. Be thorough but efficient
6. Report what you accomplished

Complete this task now.`;
  }

  /**
   * Mark a task as complete
   */
  markTaskComplete(taskInfo) {
    const goals = readJson(GOALS_PATH);
    if (!goals) return;

    const goal = goals.goals.find((g) => g.id === taskInfo.goal?.id);
    if (!goal) return;

    // Mark task complete
    if (typeof goal.tasks[taskInfo.taskIndex] === "string") {
      goal.tasks[taskInfo.taskIndex] = {
        description: goal.tasks[taskInfo.taskIndex],
        completed: true,
        completedAt: new Date().toISOString(),
      };
    } else if (goal.tasks[taskInfo.taskIndex]) {
      goal.tasks[taskInfo.taskIndex].completed = true;
      goal.tasks[taskInfo.taskIndex].completedAt = new Date().toISOString();
    }

    // Update goal progress
    const totalTasks = goal.tasks.length;
    const completedTasks = goal.tasks.filter((t) => (typeof t === "object" ? t.completed : false)).length;
    goal.progress = Math.round((completedTasks / totalTasks) * 100);

    // Check if goal is complete
    if (goal.progress >= 100) {
      goal.status = "completed";
      goal.completedAt = new Date().toISOString();
    }

    goals.lastUpdated = new Date().toISOString();
    writeJson(GOALS_PATH, goals);
  }

  /**
   * Process a backlog item
   */
  async processBacklogItem(item) {
    const tracker = getActivityTracker();
    this.isWorking = true;

    tracker.setState("working", `Processing: ${item.title.slice(0, 50)}...`);
    tracker.setGoal(`Develop backlog item: ${item.title}`);

    const prompt = `You are processing a backlog item for BACKBONE.

BACKLOG ITEM:
- Title: ${item.title}
- Description: ${item.description || "No description"}
- Impact Score: ${item.impactScore || 50}
- Urgency: ${item.urgency || "medium"}

TASK:
1. Research this topic to gather current information
2. Develop the idea with concrete steps
3. Update the backlog item in data/backlog.json with:
   - Enhanced description
   - Specific action steps
   - Updated impact score (if warranted)
   - Set lastEvaluated to current timestamp

Be concise and actionable. Do 1-2 web searches max, then update the file.`;

    await this.runCLI(prompt, {
      onComplete: () => {
        this.isWorking = false;
        setTimeout(() => this.continueWork(), 5000); // Small break before next work
      },
    });
  }

  /**
   * Do research when nothing else to do
   */
  async doResearch() {
    const tracker = getActivityTracker();
    this.isWorking = true;

    const profile = readFile(path.join(MEMORY_DIR, "profile.md"));
    const beliefs = readJson(BELIEFS_PATH) || { beliefs: [] };

    // Extract research topics from profile and beliefs
    const beliefTexts = beliefs.beliefs?.map((b) => b.name).join(", ") || "general interests";

    tracker.setState("researching", "Finding opportunities...");
    tracker.setGoal("Research relevant topics for user");

    const prompt = `You are researching opportunities for BACKBONE user.

USER INTERESTS (from beliefs):
${beliefTexts}

USER PROFILE SUMMARY:
${profile.slice(0, 500)}

TASK:
1. Search for 1-2 current news/trends relevant to user's interests
2. If you find actionable opportunities, add them to data/backlog.json
3. Each item needs: title, description, source ("research"), impactScore (50-80), urgency, isTimeSensitive

Be selective. Only add truly valuable opportunities.
Stop after 2 searches and any additions.`;

    await this.runCLI(prompt, {
      onComplete: () => {
        this.isWorking = false;
        this.currentPhase = WORK_PHASE.IDLE;
        tracker.setState("idle", "Waiting for next work cycle...");
        // Longer break for research cycles
        setTimeout(() => this.continueWork(), 60_000);
      },
    });
  }

  /**
   * Resume a paused task
   */
  async resumeTask(taskId) {
    const goals = readJson(GOALS_PATH);
    if (!goals) {
      this.state.currentTaskId = null;
      this.saveState();
      return this.continueWork();
    }

    const goal = goals.goals.find((g) => g.id === taskId);
    if (!goal) {
      this.state.currentTaskId = null;
      this.saveState();
      return this.continueWork();
    }

    // Find first incomplete task
    const taskIndex = goal.tasks?.findIndex((t) => (typeof t === "object" ? !t.completed : true));
    if (taskIndex === -1 || taskIndex === undefined) {
      this.state.currentTaskId = null;
      this.saveState();
      return this.continueWork();
    }

    await this.executeTask({
      type: "goal-task",
      goal,
      task: goal.tasks[taskIndex],
      taskIndex,
    });
  }

  /**
   * Run CLI command (Claude Code or Codex)
   */
  async runCLI(prompt, callbacks = {}) {
    const tracker = getActivityTracker();
    this.streamBuffer = "";

    if (this.backend === CLI_BACKEND.CLAUDE_CODE) {
      const stream = await runClaudeCodeStreaming(prompt, {
        timeout: 5 * 60_000, // 5 minutes
        cwd: process.cwd(),
      });

      this.currentStream = stream;

      stream.on("data", (text) => {
        this.streamBuffer += text;
        this.emit("stream", text);
        callbacks.onData?.(text);

        // Parse and track tool calls
        const toolMatch = text.match(/(\w+)\(([^)]*)\)/);
        if (toolMatch) {
          tracker.log(toolMatch[1], toolMatch[2].slice(0, 80), "working");
        }
      });

      stream.on("tool", (tool) => {
        tracker.action(tool.tool?.toUpperCase() || "TOOL", tool.input?.slice(0, 100));
        this.emit("tool", tool);
        callbacks.onTool?.(tool);
      });

      stream.on("complete", (result) => {
        this.currentStream = null;
        this.emit("complete", result);
        callbacks.onComplete?.(result);
      });

      stream.on("error", (error) => {
        this.currentStream = null;
        this.emit("error", error);
        callbacks.onError?.(error);
      });
    } else if (this.backend === CLI_BACKEND.CODEX) {
      // Codex CLI integration - similar pattern
      // For now, emit not-implemented
      this.emit("stream", "Codex CLI integration coming soon...\n");
      callbacks.onComplete?.({ success: false, error: "Codex not yet implemented" });
    }
  }

  /**
   * Record user activity (pauses work temporarily)
   */
  recordUserActivity() {
    this.lastUserActivity = Date.now();

    // Don't interrupt during task execution, but note that user is active
    if (this.isWorking) {
      // User is active - we'll pause gracefully at next opportunity
    }
  }

  /**
   * Pause the engine
   */
  pause() {
    this.isPaused = true;
    if (this.currentStream) {
      this.currentStream.abort();
      this.currentStream = null;
    }
    this.emit("paused");
  }

  /**
   * Resume the engine
   */
  resume() {
    this.isPaused = false;
    this.emit("resumed");
    this.continueWork();
  }

  /**
   * Stop the engine
   */
  stop() {
    if (this.workInterval) {
      clearInterval(this.workInterval);
      this.workInterval = null;
    }

    if (this.currentStream) {
      this.currentStream.abort();
      this.currentStream = null;
    }

    this.isWorking = false;
    this.isEnabled = false;
    this.emit("stopped");
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      isWorking: this.isWorking,
      isPaused: this.isPaused,
      currentPhase: this.currentPhase,
      currentTask: this.currentTask
        ? {
            type: this.currentTask.type,
            title: this.currentTask.goal?.title || this.currentTask.task?.description,
          }
        : null,
      backend: this.backend,
      hasEvaluatedToday: this.hasEvaluatedToday(),
      stats: {
        totalSessions: this.state.totalWorkSessions,
        totalTasksCompleted: this.state.totalTasksCompleted,
      },
      streamPreview: this.streamBuffer.slice(-300),
    };
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const status = this.getStatus();
    return {
      status: status.isWorking ? "working" : status.isPaused ? "paused" : "idle",
      phase: status.currentPhase,
      currentTask: status.currentTask?.title || null,
      backend: status.backend,
      streamPreview: status.streamPreview,
    };
  }

  /**
   * Force immediate work (for testing or manual trigger)
   */
  async forceWork() {
    if (this.isWorking) {
      return { success: false, reason: "Already working" };
    }

    this.isPaused = false;
    await this.continueWork();
    return { success: true };
  }
}

// Singleton
let instance = null;

export const getContinuousEngine = () => {
  if (!instance) {
    instance = new ContinuousEngine();
  }
  return instance;
};

export { WORK_PHASE, CLI_BACKEND };
export default ContinuousEngine;
