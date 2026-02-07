/**
 * Autonomous Loop
 *
 * The main continuous execution loop for the BACKBONE engine.
 * Thinks, researches, plans, acts, builds, tests, reflects, and repeats.
 *
 * This is the heart of the self-improving AI system.
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EngineState, saveState, loadState, logThinking, createCheckpoint } from "./state-persistence.js";
import { TaskQueue, Task, PRIORITY, TASK_STATUS, getTaskQueue, saveTaskQueue } from "./task-queue.js";
import { sendMessage, TASK_TYPES } from "./multi-ai.js";
import { getGoalIntelligence } from "./goal-intelligence.js";
import { getDataDir, getMemoryDir, getProjectsDir } from "./paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = getMemoryDir();
const PROJECTS_DIR = getProjectsDir();
const DATA_DIR = getDataDir();

/**
 * Configuration
 */
const CONFIG = {
  // Timing
  THINK_INTERVAL_MS: 30000,        // 30 seconds between think cycles
  REFLECT_INTERVAL_MS: 3600000,    // 1 hour between reflection cycles
  IDLE_SLEEP_MS: 60000,            // 1 minute when idle
  MAX_TASK_DURATION_MS: 1800000,   // 30 minutes max per task

  // Limits
  MAX_CONSECUTIVE_ERRORS: 5,
  MAX_TASKS_BEFORE_COMMIT: 3,

  // Boundaries - require user approval for these
  REQUIRE_APPROVAL: [
    "financial_transaction",
    "external_communication",
    "account_modification",
    "public_publishing",
    "system_modification"
  ]
};

/**
 * Engine states
 */
const ENGINE_STATUS = {
  IDLE: "IDLE",
  THINKING: "THINKING",
  RESEARCHING: "RESEARCHING",
  PLANNING: "PLANNING",
  EXECUTING: "EXECUTING",
  BUILDING: "BUILDING",
  TESTING: "TESTING",
  REFLECTING: "REFLECTING",
  PAUSED: "PAUSED",
  ERROR: "ERROR"
};

/**
 * The Autonomous Loop class
 */
export class AutonomousLoop {
  constructor() {
    this.state = null;
    this.queue = null;
    this.running = false;
    this.paused = false;
    this.consecutiveErrors = 0;
    this.tasksSinceCommit = 0;
    this.lastReflection = null;
    this.listeners = new Map();
  }

  /**
   * Initialize the loop
   */
  async initialize() {
    console.log("[AutonomousLoop] Initializing...");

    // Load persisted state
    this.state = await loadState();
    this.queue = await getTaskQueue();

    // Check for recovery
    if (this.state.currentTask) {
      console.log(`[AutonomousLoop] Recovering from previous session`);
      console.log(`[AutonomousLoop] Last task: ${this.state.currentTask.title}`);
      await logThinking({
        title: "Session Recovery",
        context: "System restart or crash recovery",
        decision: `Resuming from task: ${this.state.currentTask.title}`,
        reasoning: "Found incomplete task from previous session"
      });
    }

    console.log("[AutonomousLoop] Initialized");
    return this;
  }

  /**
   * Start the autonomous loop
   */
  async start() {
    if (this.running) {
      console.log("[AutonomousLoop] Already running");
      return;
    }

    this.running = true;
    this.paused = false;
    this.state.startSession();
    await saveState(this.state);

    await logThinking({
      title: "Session Started",
      context: "Starting autonomous loop",
      decision: "Begin think-execute-reflect cycle",
      reasoning: "User started the autonomous engine"
    });

    console.log("[AutonomousLoop] Starting autonomous loop...");
    this.emit("started", { sessionId: this.state.session.id });

    // Main loop
    while (this.running) {
      try {
        if (this.paused) {
          await this.sleep(CONFIG.IDLE_SLEEP_MS);
          continue;
        }

        // 1. THINK - What should we work on?
        this.state.setStatus(ENGINE_STATUS.THINKING);
        await saveState(this.state);
        const task = await this.think();

        if (!task) {
          // Nothing to do, maybe reflect
          if (this.shouldReflect()) {
            await this.reflect();
          }
          await this.sleep(CONFIG.IDLE_SLEEP_MS);
          continue;
        }

        // 2. Execute the task through the phases
        await this.executeTask(task);

        // 3. Check if we should commit
        if (this.tasksSinceCommit >= CONFIG.MAX_TASKS_BEFORE_COMMIT) {
          await this.commitProgress();
          this.tasksSinceCommit = 0;
        }

        // Reset error counter on success
        this.consecutiveErrors = 0;

      } catch (error) {
        await this.handleError(error);
      }

      // Small delay between iterations
      await this.sleep(CONFIG.THINK_INTERVAL_MS);
    }

    console.log("[AutonomousLoop] Loop stopped");
  }

  /**
   * THINK phase - Decide what to work on next
   */
  async think() {
    console.log("[AutonomousLoop] Thinking...");
    this.emit("thinking", {});

    // First check if we have a current task to resume
    if (this.state.currentTask) {
      console.log(`[AutonomousLoop] Resuming task: ${this.state.currentTask.title}`);
      return Task.fromObject(this.state.currentTask);
    }

    // Get next task from queue
    let task = this.queue.getNext();

    if (task) {
      console.log(`[AutonomousLoop] Found queued task: ${task.title}`);
      return task;
    }

    // No queued tasks - generate work from projects
    task = await this.generateNextTask();

    if (task) {
      console.log(`[AutonomousLoop] Generated task: ${task.title}`);
      this.queue.add(task);
      await saveTaskQueue();
      return task;
    }

    console.log("[AutonomousLoop] No work to do");
    return null;
  }

  /**
   * Generate the next task by analyzing projects and goals
   */
  async generateNextTask() {
    try {
      // Read active projects
      const projects = await this.getActiveProjects();

      if (projects.length === 0) {
        return null;
      }

      // Find project with lowest completion that has work to do
      for (const project of projects) {
        const nextStep = await this.getNextProjectStep(project);
        if (nextStep) {
          return new Task({
            title: nextStep.title,
            description: nextStep.description,
            project: project.name,
            priority: this.calculatePriority(project, nextStep),
            type: nextStep.type || "general",
            context: { project, step: nextStep }
          });
        }
      }

      return null;
    } catch (error) {
      console.error("[AutonomousLoop] Failed to generate task:", error.message);
      return null;
    }
  }

  /**
   * Execute a task through all phases
   */
  async executeTask(task) {
    console.log(`[AutonomousLoop] Executing task: ${task.title}`);

    // Start the task
    task.start();
    this.state.setCurrentTask(task.toObject());
    await createCheckpoint(this.state, `Starting task: ${task.title}`);

    try {
      // Phase 1: RESEARCH (if needed)
      if (task.type === "research" || this.needsResearch(task)) {
        this.state.setStatus(ENGINE_STATUS.RESEARCHING);
        await saveState(this.state);
        await this.research(task);
      }

      // Phase 2: PLAN (if needed)
      if (task.type === "planning" || this.needsPlanning(task)) {
        this.state.setStatus(ENGINE_STATUS.PLANNING);
        await saveState(this.state);
        await this.plan(task);
      }

      // Phase 3: EXECUTE
      this.state.setStatus(ENGINE_STATUS.EXECUTING);
      await saveState(this.state);
      const result = await this.execute(task);

      // Phase 4: BUILD (if produced artifacts)
      if (result && result.artifacts) {
        this.state.setStatus(ENGINE_STATUS.BUILDING);
        await saveState(this.state);
        await this.build(task, result);
      }

      // Phase 5: TEST (if testable)
      if (this.isTestable(task)) {
        this.state.setStatus(ENGINE_STATUS.TESTING);
        await saveState(this.state);
        await this.test(task, result);
      }

      // Complete the task
      this.queue.complete(task.id, result);
      this.state.completeCurrentTask();
      this.tasksSinceCommit++;
      await saveState(this.state);
      await saveTaskQueue();

      // Log completion
      await logThinking({
        title: `Completed: ${task.title}`,
        context: `Project: ${task.project || "none"}`,
        decision: "Task completed successfully",
        reasoning: result ? JSON.stringify(result).substring(0, 200) : "No result",
        outcome: "success"
      });

      this.emit("taskCompleted", { task, result });

    } catch (error) {
      // Handle task failure
      this.queue.fail(task.id, error.message);
      this.state.recordError(error);
      await saveState(this.state);
      await saveTaskQueue();

      await logThinking({
        title: `Failed: ${task.title}`,
        context: `Project: ${task.project || "none"}`,
        decision: "Task failed",
        reasoning: error.message,
        outcome: "failure"
      });

      this.emit("taskFailed", { task, error });
      throw error;
    }
  }

  /**
   * RESEARCH phase - Gather information
   */
  async research(task) {
    console.log(`[AutonomousLoop] Researching: ${task.title}`);
    this.emit("researching", { task });

    const prompt = `You are a research assistant for the BACKBONE autonomous engine.

Task: ${task.title}
Description: ${task.description || "No description"}
Project: ${task.project || "General"}

Research this topic and provide:
1. Key facts and context
2. Relevant data or metrics
3. Potential approaches
4. Risks or concerns
5. Recommended next steps

Be thorough but concise. Focus on actionable information.`;

    const response = await sendMessage(prompt, {
      taskType: TASK_TYPES.RESEARCH,
      maxTokens: 2000
    });

    // Store research results in task context
    task.context.research = response;
    return response;
  }

  /**
   * PLAN phase - Create execution plan
   */
  async plan(task) {
    console.log(`[AutonomousLoop] Planning: ${task.title}`);
    this.emit("planning", { task });

    const research = task.context.research || "";

    const prompt = `You are a planning assistant for the BACKBONE autonomous engine.

Task: ${task.title}
Description: ${task.description || "No description"}
Project: ${task.project || "General"}
${research ? `\nResearch:\n${research.substring(0, 1000)}` : ""}

Create an execution plan:
1. List specific steps to complete this task
2. Identify any dependencies or blockers
3. Estimate effort for each step
4. Define success criteria
5. Note any risks or concerns

Output a clear, actionable plan.`;

    const response = await sendMessage(prompt, {
      taskType: TASK_TYPES.PLANNING,
      maxTokens: 1500
    });

    // Store plan in task context
    task.context.plan = response;
    return response;
  }

  /**
   * EXECUTE phase - Do the work
   */
  async execute(task) {
    console.log(`[AutonomousLoop] Executing: ${task.title}`);
    this.emit("executing", { task });

    // Check if this requires approval
    if (this.requiresApproval(task)) {
      console.log(`[AutonomousLoop] Task requires approval: ${task.title}`);
      task.block("Requires user approval", null);
      this.emit("approvalRequired", { task });
      return { status: "blocked", reason: "Requires user approval" };
    }

    // Use Claude Code CLI to execute the task
    const result = await this.executeWithClaudeCli(task);
    return result;
  }

  /**
   * Execute task using Claude Code CLI
   */
  async executeWithClaudeCli(task) {
    return new Promise((resolve, reject) => {
      const plan = task.context.plan || "";
      const research = task.context.research || "";

      const prompt = `Execute this task for the BACKBONE autonomous engine:

Task: ${task.title}
Project: ${task.project || "General"}
${task.description ? `Description: ${task.description}` : ""}
${plan ? `\nPlan:\n${plan.substring(0, 500)}` : ""}
${research ? `\nResearch:\n${research.substring(0, 500)}` : ""}

Execute the task and report results. If you create files, list them. If you make changes, describe them.`;

      const claude = spawn("claude", [
        "--print",
        "--output-format", "text",
        "-p", prompt
      ], {
        shell: true,
        cwd: process.cwd(),
        timeout: CONFIG.MAX_TASK_DURATION_MS
      });

      let output = "";
      let error = "";

      claude.stdout.on("data", (data) => {
        output += data.toString();
      });

      claude.stderr.on("data", (data) => {
        error += data.toString();
      });

      claude.on("close", (code) => {
        if (code === 0 && output.trim()) {
          resolve({
            status: "completed",
            output: output.trim(),
            artifacts: this.extractArtifacts(output)
          });
        } else {
          reject(new Error(error || `Claude CLI exited with code ${code}`));
        }
      });

      claude.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * BUILD phase - Create artifacts
   */
  async build(task, result) {
    console.log(`[AutonomousLoop] Building: ${task.title}`);
    this.emit("building", { task, result });

    // Artifacts were already created during execute
    // This phase is for additional processing if needed
    return result;
  }

  /**
   * TEST phase - Verify work
   */
  async test(task, result) {
    console.log(`[AutonomousLoop] Testing: ${task.title}`);
    this.emit("testing", { task, result });

    // Basic verification
    const prompt = `Verify the results of this task:

Task: ${task.title}
Result: ${JSON.stringify(result).substring(0, 1000)}

Verify:
1. Did the task complete successfully?
2. Were all requirements met?
3. Are there any issues or concerns?
4. What's the quality rating (1-10)?

Provide a brief verification report.`;

    const verification = await sendMessage(prompt, {
      taskType: TASK_TYPES.REASONING,
      maxTokens: 500
    });

    task.context.verification = verification;
    return verification;
  }

  /**
   * REFLECT phase - Learn from completed work + run goal intelligence
   */
  async reflect() {
    console.log("[AutonomousLoop] Reflecting...");
    this.state.setStatus(ENGINE_STATUS.REFLECTING);
    await saveState(this.state);
    this.emit("reflecting", {});

    // Get recently completed tasks
    const completed = this.queue.completedTasks.slice(0, 10);

    if (completed.length === 0) {
      // Even without completed tasks, run goal intelligence cycle
      await this.runGoalIntelligenceCycle();
      return;
    }

    const prompt = `Reflect on these recently completed tasks:

${completed.map(t => `- ${t.title}: ${t.status} ${t.result ? `(${JSON.stringify(t.result).substring(0, 100)})` : ""}`).join("\n")}

Provide insights:
1. What patterns do you see?
2. What could be improved?
3. Are there recurring themes?
4. What skills could be created from these patterns?
5. What should be prioritized next?

Be concise and actionable.`;

    const insights = await sendMessage(prompt, {
      taskType: TASK_TYPES.REASONING,
      maxTokens: 1000
    });

    // Log reflection
    await logThinking({
      title: "Periodic Reflection",
      context: `Reviewed ${completed.length} completed tasks`,
      decision: "Generated insights for improvement",
      reasoning: insights.substring(0, 500),
      outcome: "reflected"
    });

    this.lastReflection = new Date();
    this.emit("reflected", { insights });

    // Run goal intelligence cycle (learn, evaluate, plan, propose)
    await this.runGoalIntelligenceCycle();

    return insights;
  }

  /**
   * Run the goal intelligence cycle — learn, evaluate, plan, propose
   */
  async runGoalIntelligenceCycle() {
    try {
      const gi = getGoalIntelligence();
      const result = await gi.runCycle();
      console.log(`[AutonomousLoop] Goal intelligence cycle #${result.cycleCount} complete`);
    } catch (e) {
      console.error("[AutonomousLoop] Goal intelligence cycle failed:", e.message);
    }
  }

  /**
   * Get active projects
   */
  async getActiveProjects() {
    try {
      const projects = [];

      if (!fs.existsSync(PROJECTS_DIR)) {
        return projects;
      }

      const dirs = await fs.promises.readdir(PROJECTS_DIR);

      for (const dir of dirs) {
        const projectPath = path.join(PROJECTS_DIR, dir, "PROJECT.md");
        if (fs.existsSync(projectPath)) {
          const content = await fs.promises.readFile(projectPath, "utf-8");
          const statusMatch = content.match(/\*\*Status\*\*:\s*(\w+)/i);
          const completionMatch = content.match(/\*\*Completion\*\*:\s*(\d+)%/i);

          const status = statusMatch ? statusMatch[1].toLowerCase() : "active";
          const completion = completionMatch ? parseInt(completionMatch[1]) : 0;

          if (status === "active" || status === "planning") {
            projects.push({
              name: dir,
              path: path.join(PROJECTS_DIR, dir),
              status,
              completion,
              content
            });
          }
        }
      }

      // Sort by completion (lowest first)
      projects.sort((a, b) => a.completion - b.completion);

      return projects;
    } catch (error) {
      console.error("[AutonomousLoop] Failed to get projects:", error.message);
      return [];
    }
  }

  /**
   * Get next step for a project
   */
  async getNextProjectStep(project) {
    // Check for TASKS.md or unchecked items in PROJECT.md
    const tasksPath = path.join(project.path, "TASKS.md");

    if (fs.existsSync(tasksPath)) {
      const content = await fs.promises.readFile(tasksPath, "utf-8");
      const unchecked = content.match(/- \[ \] (.+)/);
      if (unchecked) {
        return {
          title: unchecked[1],
          description: `From project ${project.name} tasks`,
          type: "execute"
        };
      }
    }

    // Check PROJECT.md for tasks
    const unchecked = project.content.match(/- \[ \] (.+)/);
    if (unchecked) {
      return {
        title: unchecked[1],
        description: `From project ${project.name}`,
        type: "execute"
      };
    }

    return null;
  }

  /**
   * Calculate task priority
   */
  calculatePriority(project, step) {
    let priority = PRIORITY.NORMAL;

    // Boost for lower completion projects
    if (project.completion < 25) priority += 10;
    if (project.completion < 50) priority += 5;

    // Boost for certain task types
    if (step.type === "fix" || step.type === "bug") priority += 20;
    if (step.type === "research") priority -= 10;

    return Math.min(priority, PRIORITY.CRITICAL);
  }

  /**
   * Check if task needs research
   */
  needsResearch(task) {
    const keywords = ["research", "investigate", "analyze", "understand", "learn", "explore"];
    const title = task.title.toLowerCase();
    return keywords.some(k => title.includes(k));
  }

  /**
   * Check if task needs planning
   */
  needsPlanning(task) {
    const keywords = ["implement", "create", "build", "develop", "design", "refactor"];
    const title = task.title.toLowerCase();
    return keywords.some(k => title.includes(k));
  }

  /**
   * Check if task is testable
   */
  isTestable(task) {
    const keywords = ["implement", "create", "build", "fix", "update", "modify"];
    const title = task.title.toLowerCase();
    return keywords.some(k => title.includes(k));
  }

  /**
   * Check if task requires approval
   */
  requiresApproval(task) {
    const title = task.title.toLowerCase();
    const desc = (task.description || "").toLowerCase();

    for (const boundary of CONFIG.REQUIRE_APPROVAL) {
      if (title.includes(boundary.replace("_", " ")) ||
          desc.includes(boundary.replace("_", " "))) {
        return true;
      }
    }

    // Check for financial keywords
    const financialKeywords = ["buy", "sell", "trade", "invest", "transfer", "payment"];
    if (financialKeywords.some(k => title.includes(k))) {
      return true;
    }

    return false;
  }

  /**
   * Extract artifacts from output
   */
  extractArtifacts(output) {
    const artifacts = [];

    // Look for file paths
    const fileMatches = output.matchAll(/(?:created|wrote|saved|updated).*?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z]+)/gi);
    for (const match of fileMatches) {
      artifacts.push({ type: "file", path: match[1] });
    }

    return artifacts.length > 0 ? artifacts : null;
  }

  /**
   * Check if we should reflect
   */
  shouldReflect() {
    if (!this.lastReflection) return true;
    const elapsed = Date.now() - this.lastReflection.getTime();
    return elapsed > CONFIG.REFLECT_INTERVAL_MS;
  }

  /**
   * Commit progress to git
   */
  async commitProgress() {
    console.log("[AutonomousLoop] Committing progress...");

    try {
      const { execSync } = await import("child_process");

      // Check for changes
      const status = execSync("git status --porcelain", { encoding: "utf-8", cwd: process.cwd() });
      if (!status.trim()) {
        console.log("[AutonomousLoop] No changes to commit");
        return;
      }

      // Add and commit
      execSync("git add -A", { cwd: process.cwd() });
      execSync(`git commit -m "[Auto-Engine] Autonomous progress checkpoint"`, { cwd: process.cwd() });
      execSync("git push", { cwd: process.cwd() });

      console.log("[AutonomousLoop] Committed and pushed progress");
    } catch (error) {
      console.error("[AutonomousLoop] Failed to commit:", error.message);
    }
  }

  /**
   * Handle errors
   */
  async handleError(error) {
    console.error("[AutonomousLoop] Error:", error.message);

    this.consecutiveErrors++;
    this.state.recordError(error);
    this.state.setStatus(ENGINE_STATUS.ERROR);
    await saveState(this.state);

    if (this.consecutiveErrors >= CONFIG.MAX_CONSECUTIVE_ERRORS) {
      console.error("[AutonomousLoop] Too many consecutive errors, pausing...");
      this.pause();
    }

    this.emit("error", { error });
  }

  /**
   * Pause the loop
   */
  pause() {
    this.paused = true;
    this.state.setStatus(ENGINE_STATUS.PAUSED);
    saveState(this.state);
    console.log("[AutonomousLoop] Paused");
    this.emit("paused", {});
  }

  /**
   * Resume the loop
   */
  resume() {
    this.paused = false;
    this.consecutiveErrors = 0;
    console.log("[AutonomousLoop] Resumed");
    this.emit("resumed", {});
  }

  /**
   * Stop the loop
   */
  async stop() {
    console.log("[AutonomousLoop] Stopping...");
    this.running = false;

    // Save final state
    await saveState(this.state);
    await saveTaskQueue();

    this.emit("stopped", {});
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Emit event
   */
  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    for (const callback of callbacks) {
      try {
        callback(data);
      } catch (e) {
        console.error(`[AutonomousLoop] Event handler error:`, e);
      }
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      running: this.running,
      paused: this.paused,
      status: this.state?.status || ENGINE_STATUS.IDLE,
      currentTask: this.state?.currentTask,
      queueLength: this.queue?.length || 0,
      session: this.state?.session,
      consecutiveErrors: this.consecutiveErrors
    };
  }
}

// Singleton instance
let _loop = null;

/**
 * Get the autonomous loop instance
 */
export async function getAutonomousLoop() {
  if (!_loop) {
    _loop = new AutonomousLoop();
    await _loop.initialize();
  }
  return _loop;
}

/**
 * Start the autonomous loop
 */
export async function startAutonomousLoop() {
  const loop = await getAutonomousLoop();
  // Run in background
  loop.start().catch(err => {
    console.error("[AutonomousLoop] Fatal error:", err);
  });
  return loop;
}

/**
 * Stop the autonomous loop
 */
export async function stopAutonomousLoop() {
  if (_loop) {
    await _loop.stop();
  }
}
