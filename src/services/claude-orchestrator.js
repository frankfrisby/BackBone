/**
 * Claude Code Orchestrator
 *
 * The brain that orchestrates Claude Code CLI execution with GPT-5.2 evaluation.
 *
 * FLOW:
 * 1. Goal → Spawn Claude Code CLI with goal as prompt
 * 2. Claude Code does real work (files, web, bash)
 * 3. Monitor stdout in real-time
 * 4. GPT-5.2 evaluates output and decides:
 *    - Continue (let Claude keep working)
 *    - Reply (send follow-up input if Claude needs clarification)
 *    - Complete (goal is done, kill process)
 *    - Redirect (Claude is off-track, send correction)
 * 5. Loop until goal is complete or max iterations reached
 *
 * This creates a "supervisor" pattern where GPT-5.2 oversees Claude's work.
 */

import { spawn } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import { getClaudeCodeStatus } from "./claude-code-cli.js";
import { sendMessage, getMultiAIConfig, TASK_TYPES } from "./multi-ai.js";
import { getActivityNarrator, ACTION_STATUS } from "./activity-narrator.js";

/**
 * Orchestration states
 */
export const ORCHESTRATION_STATE = {
  IDLE: "idle",
  STARTING: "starting",
  RUNNING: "running",
  EVALUATING: "evaluating",
  RESPONDING: "responding",
  COMPLETING: "completing",
  STOPPED: "stopped",
  ERROR: "error"
};

/**
 * GPT-5.2 decision types
 */
export const EVALUATION_DECISION = {
  CONTINUE: "continue",      // Let Claude continue working
  REPLY: "reply",            // Send follow-up input to Claude
  COMPLETE: "complete",      // Goal achieved, stop
  REDIRECT: "redirect",      // Claude is off-track, correct course
  ESCALATE: "escalate"       // Need human intervention
};

/**
 * Claude Code Orchestrator Class
 */
export class ClaudeOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.maxTurns = options.maxTurns || 30;
    this.evaluationInterval = options.evaluationInterval || 5000; // Evaluate every 5s of output
    this.timeout = options.timeout || 600000; // 10 minute max
    this.workDir = options.workDir || process.cwd();

    // SECURITY: Allowed directories for Claude Code access
    // Claude can ONLY read/write within these directories
    this.allowedDirectories = options.allowedDirectories || [
      "data",        // User data, goals, settings
      "memory",      // AI memory, conversation history
      "projects",    // User's projects being worked on
      "screenshots"  // Screenshots for analysis
    ];

    // State
    this.state = ORCHESTRATION_STATE.IDLE;
    this.currentGoal = null;
    this.claudeProcess = null;
    this.sessionId = null;

    // Output tracking
    this.outputBuffer = "";
    this.lastEvaluatedAt = 0;
    this.turnCount = 0;
    this.toolCalls = [];
    this.decisions = [];

    // Narrator for UI updates
    this.narrator = getActivityNarrator();
  }

  /**
   * Start orchestrated execution of a goal
   *
   * @param {Object} goal - Goal object with title, description
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeGoal(goal, options = {}) {
    // Check Claude Code is ready
    const status = await getClaudeCodeStatus();
    if (!status.ready) {
      return {
        success: false,
        error: status.installed
          ? "Claude Code not logged in. Run: claude"
          : "Claude Code not installed. Run: npm install -g @anthropic-ai/claude-code"
      };
    }

    this.currentGoal = goal;
    this.state = ORCHESTRATION_STATE.STARTING;
    this.outputBuffer = "";
    this.turnCount = 0;
    this.toolCalls = [];
    this.decisions = [];

    // NOTIFY NARRATOR: Claude Code is now ACTIVE (orange background)
    this.narrator.setClaudeCodeActive(true, "starting");

    this.emit("started", { goal });

    // Build the prompt for Claude Code
    const prompt = this.buildClaudePrompt(goal);

    try {
      // Start Claude Code process
      const result = await this.runClaudeWithSupervision(prompt, {
        workDir: options.workDir || this.workDir,
        timeout: options.timeout || this.timeout
      });

      return result;
    } catch (error) {
      this.state = ORCHESTRATION_STATE.ERROR;
      this.emit("error", { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get the full paths for allowed directories
   */
  getAllowedPaths() {
    return this.allowedDirectories.map(dir => path.join(this.workDir, dir));
  }

  /**
   * Check if a file path is within allowed directories
   */
  isPathAllowed(filePath) {
    if (!filePath) return false;

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.normalize(path.join(this.workDir, filePath));

    const allowedPaths = this.getAllowedPaths();

    // Check if the path starts with any allowed directory
    return allowedPaths.some(allowedPath => {
      const normalizedAllowed = path.normalize(allowedPath);
      return absolutePath.startsWith(normalizedAllowed + path.sep) ||
             absolutePath === normalizedAllowed;
    });
  }

  /**
   * Build directory context for the prompt
   */
  buildDirectoryContext() {
    const allowedPaths = this.getAllowedPaths();

    return `
DIRECTORY ACCESS RESTRICTIONS:
You are running inside BACKBONE and have LIMITED file system access.
You can ONLY access these directories within ${this.workDir}:

${this.allowedDirectories.map(dir => `- ${dir}/ - ${this.getDirectoryDescription(dir)}`).join("\n")}

SECURITY RULES:
- DO NOT access files outside these directories
- DO NOT access src/, node_modules/, bin/, or other system directories
- DO NOT modify .env, package.json, or configuration files
- All file paths must be within: ${allowedPaths.join(", ")}
- When using Bash, only operate within allowed directories
`;
  }

  /**
   * Get description for each allowed directory
   */
  getDirectoryDescription(dir) {
    const descriptions = {
      data: "User data, goals, settings, activity logs",
      memory: "AI memory, conversation history, learned context",
      projects: "User's projects being worked on",
      screenshots: "Screenshots for visual analysis"
    };
    return descriptions[dir] || "User data";
  }

  /**
   * Build the initial prompt for Claude Code
   */
  buildClaudePrompt(goal) {
    const title = goal.title || goal;
    const description = goal.description || "";
    const context = goal.context || "";
    const directoryContext = this.buildDirectoryContext();

    return `You are working on this goal: "${title}"

${description ? `Details: ${description}\n` : ""}
${context ? `Context: ${context}\n` : ""}
${directoryContext}

IMPORTANT INSTRUCTIONS:
1. Work autonomously to achieve this goal
2. Use available tools: Read, Write, Edit, Bash, WebSearch, Fetch, Grep, Glob
3. RESPECT DIRECTORY RESTRICTIONS - only access allowed directories
4. Be thorough - research, plan, then execute
5. Report progress clearly so I can track what you're doing
6. If you need clarification, ask specific questions
7. When the goal is complete, clearly state "GOAL COMPLETE" with a summary

Begin working on this goal now.`;
  }

  /**
   * Run Claude Code with GPT-5.2 supervision
   */
  async runClaudeWithSupervision(prompt, options = {}) {
    return new Promise((resolve) => {
      this.state = ORCHESTRATION_STATE.RUNNING;

      // Build Claude Code args - flags first, then -p with prompt at the end
      const args = [
        "--output-format", "stream-json",
        "--allowedTools", "Read,Write,Edit,Bash,WebSearch,Fetch,Grep,Glob",
        "--max-turns", String(this.maxTurns)
      ];

      // Resume session if we have one
      if (this.sessionId) {
        args.push("--resume", this.sessionId);
      }

      // -p flag must come with prompt at the very end
      args.push("-p", prompt);

      console.log("[ClaudeOrchestrator] Spawning claude with args:", args.slice(0, -1).join(" "), "-p <prompt>");

      // Spawn Claude Code
      this.claudeProcess = spawn("claude", args, {
        shell: true,
        cwd: options.workDir || this.workDir,
        env: { ...process.env, FORCE_COLOR: "0" }
      });

      let lineBuffer = "";
      let lastOutput = "";
      let evaluationTimer = null;
      let timeoutTimer = null;
      let stdinOpen = true;

      // Timeout handler
      timeoutTimer = setTimeout(() => {
        this.killProcess("Timeout exceeded");
        resolve({
          success: false,
          error: "Execution timeout",
          output: this.outputBuffer,
          decisions: this.decisions
        });
      }, options.timeout || this.timeout);

      // Schedule periodic evaluation
      const scheduleEvaluation = () => {
        if (evaluationTimer) clearTimeout(evaluationTimer);

        evaluationTimer = setTimeout(async () => {
          if (this.state !== ORCHESTRATION_STATE.RUNNING) return;

          // Check if we have new output to evaluate
          if (this.outputBuffer.length > lastOutput.length) {
            lastOutput = this.outputBuffer;
            await this.evaluateProgress();

            // Check if we should take action based on evaluation
            const lastDecision = this.decisions[this.decisions.length - 1];
            if (lastDecision) {
              await this.actOnDecision(lastDecision, stdinOpen);

              if (lastDecision.decision === EVALUATION_DECISION.COMPLETE) {
                this.killProcess("Goal complete");
                clearTimeout(timeoutTimer);
                resolve({
                  success: true,
                  output: this.outputBuffer,
                  decisions: this.decisions,
                  toolCalls: this.toolCalls,
                  sessionId: this.sessionId
                });
                return;
              }
            }
          }

          // Schedule next evaluation
          if (this.state === ORCHESTRATION_STATE.RUNNING) {
            scheduleEvaluation();
          }
        }, this.evaluationInterval);
      };

      // Process streaming output
      const processLine = (line) => {
        if (!line.trim()) return;

        try {
          const msg = JSON.parse(line);

          // Track tool calls
          if (msg.type === "tool_use") {
            const tool = msg.tool?.name || msg.name || "unknown";
            const input = msg.tool?.input || msg.input || {};

            // SECURITY: Validate file paths for file operations
            const fileTools = ["Read", "Write", "Edit", "Grep", "Glob"];
            const filePath = input.file_path || input.path || input.file || null;

            if (fileTools.includes(tool) && filePath) {
              if (!this.isPathAllowed(filePath)) {
                console.warn(`[ClaudeOrchestrator] BLOCKED: ${tool} attempted to access restricted path: ${filePath}`);
                this.narrator.observe(`Security: Blocked access to restricted path`);
                this.emit("security-violation", { tool, path: filePath });
                // Don't record blocked operations
                return;
              }
            }

            // For Bash commands, check if they reference restricted paths
            if (tool === "Bash") {
              const command = input.command || input;
              const restrictedPaths = ["src/", "node_modules/", "bin/", ".env", "package.json", ".git/"];
              const accessesRestricted = restrictedPaths.some(rp =>
                command.includes(rp) || command.includes(rp.replace("/", "\\"))
              );

              if (accessesRestricted) {
                console.warn(`[ClaudeOrchestrator] WARNING: Bash command may access restricted paths: ${command.slice(0, 100)}`);
                this.narrator.observe(`Security: Monitoring bash command accessing system paths`);
              }
            }

            this.toolCalls.push({
              tool,
              input,
              timestamp: Date.now()
            });

            // Update narrator with Claude Code tool tracking
            this.narrator.recordClaudeCodeTool(tool, input);
            this.narrator.setClaudeCodeActive(true, "running");
            this.emit("tool-use", { tool, input });
          }

          // Track results
          if (msg.type === "result") {
            this.sessionId = msg.session_id || msg.sessionId;
          }

          // Track assistant messages
          if (msg.type === "assistant") {
            const text = msg.message?.content?.[0]?.text || msg.content || "";
            if (text) {
              this.emit("claude-text", { text });

              // Check for goal completion signals
              if (text.toLowerCase().includes("goal complete") ||
                  text.toLowerCase().includes("task complete") ||
                  text.toLowerCase().includes("successfully completed")) {
                this.emit("completion-signal", { text });
              }
            }
          }

        } catch (e) {
          // Not JSON, still add to buffer
        }

        this.outputBuffer += line + "\n";
      };

      // Handle stdout
      this.claudeProcess.stdout.on("data", (data) => {
        const chunk = data.toString();

        // Parse line by line
        lineBuffer += chunk;
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop();

        for (const line of lines) {
          processLine(line);
        }

        this.emit("output", { chunk, type: "stdout" });

        // Start/reset evaluation timer
        scheduleEvaluation();
      });

      // Handle stderr
      this.claudeProcess.stderr.on("data", (data) => {
        const chunk = data.toString();
        this.emit("output", { chunk, type: "stderr" });
      });

      // Handle stdin close
      this.claudeProcess.stdin.on("close", () => {
        stdinOpen = false;
      });

      // Handle process close
      this.claudeProcess.on("close", (code) => {
        if (evaluationTimer) clearTimeout(evaluationTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);

        // Process remaining buffer
        if (lineBuffer.trim()) {
          processLine(lineBuffer);
        }

        this.state = ORCHESTRATION_STATE.STOPPED;
        this.claudeProcess = null;

        this.emit("stopped", { code });

        resolve({
          success: code === 0,
          output: this.outputBuffer,
          decisions: this.decisions,
          toolCalls: this.toolCalls,
          sessionId: this.sessionId,
          exitCode: code
        });
      });

      // Handle errors
      this.claudeProcess.on("error", (error) => {
        if (evaluationTimer) clearTimeout(evaluationTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);

        this.state = ORCHESTRATION_STATE.ERROR;
        this.claudeProcess = null;

        this.emit("error", { error: error.message });

        resolve({
          success: false,
          error: error.message,
          output: this.outputBuffer,
          decisions: this.decisions
        });
      });
    });
  }

  /**
   * Evaluate Claude's progress using GPT-5.2
   */
  async evaluateProgress() {
    this.state = ORCHESTRATION_STATE.EVALUATING;
    this.emit("evaluating");

    try {
      const config = getMultiAIConfig();
      if (!config.gptInstant?.ready && !config.gptThinking?.ready) {
        // No GPT available, continue by default
        return { decision: EVALUATION_DECISION.CONTINUE };
      }

      // Build evaluation prompt
      const evaluationPrompt = `You are supervising an AI agent (Claude) working on a goal.

GOAL: "${this.currentGoal?.title || this.currentGoal}"

RECENT OUTPUT FROM CLAUDE:
${this.getRecentOutput(3000)}

TOOLS USED SO FAR:
${this.toolCalls.slice(-10).map(t => `- ${t.tool}(${JSON.stringify(t.input).slice(0, 50)}...)`).join("\n")}

TURN COUNT: ${this.turnCount}/${this.maxTurns}

Evaluate Claude's progress and decide what to do:

1. CONTINUE - Claude is making good progress, let it keep working
2. REPLY - Send a follow-up message to Claude (include the message)
3. COMPLETE - The goal has been achieved, stop execution
4. REDIRECT - Claude is off-track, send a correction (include the correction)
5. ESCALATE - There's a problem that needs human attention

Return JSON only:
{
  "decision": "continue|reply|complete|redirect|escalate",
  "reasoning": "brief explanation",
  "message": "message to send if reply/redirect",
  "confidence": 0.0-1.0
}`;

      const result = await sendMessage(evaluationPrompt, {}, TASK_TYPES.QUICK);

      // Parse response
      let parsed;
      try {
        let jsonStr = result.response;
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        parsed = { decision: EVALUATION_DECISION.CONTINUE, reasoning: "Parse error, continuing" };
      }

      // Record decision
      const decision = {
        timestamp: Date.now(),
        turnCount: this.turnCount,
        decision: parsed.decision || EVALUATION_DECISION.CONTINUE,
        reasoning: parsed.reasoning || "",
        message: parsed.message || "",
        confidence: parsed.confidence || 0.5
      };

      this.decisions.push(decision);
      this.emit("decision", decision);

      // Update narrator
      this.narrator.observe(`GPT-5.2 Evaluation: ${decision.decision} - ${decision.reasoning}`);

      this.state = ORCHESTRATION_STATE.RUNNING;
      return decision;

    } catch (error) {
      console.error("[ClaudeOrchestrator] Evaluation error:", error.message);
      return { decision: EVALUATION_DECISION.CONTINUE, reasoning: "Evaluation error" };
    }
  }

  /**
   * Act on an evaluation decision
   */
  async actOnDecision(decision, stdinOpen) {
    switch (decision.decision) {
      case EVALUATION_DECISION.REPLY:
      case EVALUATION_DECISION.REDIRECT:
        if (decision.message && stdinOpen && this.claudeProcess?.stdin) {
          this.state = ORCHESTRATION_STATE.RESPONDING;
          this.claudeProcess.stdin.write(decision.message + "\n");
          this.turnCount++;
          this.emit("replied", { message: decision.message });
          this.narrator.observe(`Sent to Claude: ${decision.message.slice(0, 50)}...`);
        }
        break;

      case EVALUATION_DECISION.COMPLETE:
        // Will be handled by caller
        this.narrator.observe("Goal marked complete by GPT-5.2");
        break;

      case EVALUATION_DECISION.ESCALATE:
        this.emit("escalate", { decision });
        this.narrator.observe(`ESCALATION NEEDED: ${decision.reasoning}`);
        break;

      case EVALUATION_DECISION.CONTINUE:
      default:
        // Do nothing, let Claude continue
        break;
    }
  }

  /**
   * Get recent output for evaluation (truncated)
   */
  getRecentOutput(maxLength = 3000) {
    if (this.outputBuffer.length <= maxLength) {
      return this.outputBuffer;
    }
    return "...[truncated]...\n" + this.outputBuffer.slice(-maxLength);
  }

  /**
   * Kill the Claude process
   */
  killProcess(reason = "Terminated") {
    if (this.claudeProcess) {
      this.claudeProcess.kill();
      this.claudeProcess = null;
      this.emit("killed", { reason });
    }
    this.state = ORCHESTRATION_STATE.STOPPED;

    // NOTIFY NARRATOR: Claude Code is now INACTIVE
    this.narrator.setClaudeCodeActive(false, "complete");
  }

  /**
   * Send input to Claude (for interactive use)
   */
  sendInput(input) {
    if (this.claudeProcess?.stdin) {
      this.claudeProcess.stdin.write(input + "\n");
      this.turnCount++;
      this.emit("input-sent", { input });
      return true;
    }
    return false;
  }

  /**
   * Stop execution
   */
  stop() {
    this.killProcess("User stopped");
  }

  /**
   * Get current state
   */
  getState() {
    return {
      state: this.state,
      goal: this.currentGoal,
      turnCount: this.turnCount,
      maxTurns: this.maxTurns,
      toolCalls: this.toolCalls.length,
      lastDecision: this.decisions[this.decisions.length - 1] || null,
      sessionId: this.sessionId
    };
  }

  /**
   * Continue a previous session
   */
  async continueSession(prompt, options = {}) {
    if (!this.sessionId) {
      return {
        success: false,
        error: "No session to continue"
      };
    }

    return this.runClaudeWithSupervision(prompt, options);
  }
}

// Singleton instance
let orchestratorInstance = null;

export const getClaudeOrchestrator = (options = {}) => {
  if (!orchestratorInstance) {
    orchestratorInstance = new ClaudeOrchestrator(options);
  }
  return orchestratorInstance;
};

export default ClaudeOrchestrator;
