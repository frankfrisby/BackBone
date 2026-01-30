/**
 * Claude Code Executor for Autonomous Engine
 *
 * Executes goals/tasks via Claude Code CLI with:
 * - Automatic tool approval for safe operations
 * - Real-time streaming output for UI display
 * - Session management for multi-turn conversations
 * - Integration with the autonomous engine's action system
 */

import { spawn } from "child_process";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import os from "os";
import { getClaudeCodeBackend, TASK_STATUS } from "./claude-code-backend.js";
import { isClaudeCodeInstalled, isClaudeCodeLoggedIn, getClaudeCodeStatus } from "./claude-code-cli.js";

// MCP server tool prefixes — allows all tools from BACKBONE MCP servers
const MCP_TOOLS = [
  "mcp__backbone-google",
  "mcp__backbone-linkedin",
  "mcp__backbone-contacts",
  "mcp__backbone-news",
  "mcp__backbone-life",
  "mcp__backbone-health",
  "mcp__backbone-trading",
  "mcp__backbone-projects",
];

// Tool permission levels
export const TOOL_PERMISSION = {
  // Always allowed - read-only, safe operations
  SAFE: ["Read", "Glob", "Grep", "WebFetch", "WebSearch", "Task", ...MCP_TOOLS],
  // Allowed with auto-approve in autonomous mode
  AUTO_APPROVE: ["Read", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "Write", "Edit", ...MCP_TOOLS],
  // Dangerous - require explicit approval or full autonomy mode
  DANGEROUS: ["Bash", "Write", "Edit", "NotebookEdit"],
  // All tools
  ALL: ["Read", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "Write", "Edit", "Bash", "NotebookEdit", ...MCP_TOOLS]
};

// Execution modes
export const EXECUTION_MODE = {
  SAFE: "safe",           // Only read-only tools, no file changes
  SUPERVISED: "supervised", // Auto-approve writes, prompt for bash
  AUTONOMOUS: "autonomous"  // Full autonomy, all tools approved
};

/**
 * Claude Code Executor Class
 *
 * Registers as an executor with the autonomous engine
 * and handles running Claude Code tasks.
 */
export class ClaudeCodeExecutor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.mode = options.mode || EXECUTION_MODE.SUPERVISED;
    this.workDir = options.workDir || process.cwd();
    this.maxTurns = options.maxTurns || 50;
    this.timeout = options.timeout || 300000; // 5 min default
    this.backend = getClaudeCodeBackend();
    this.currentTask = null;
    this.sessionId = null;

    // Track execution for UI display
    this.executionLog = [];
    this.toolCalls = [];
  }

  /**
   * Check if executor is ready (Claude Code installed and logged in)
   */
  async isReady() {
    const status = await getClaudeCodeStatus();
    return status.ready;
  }

  /**
   * Get allowed tools based on execution mode
   */
  getAllowedTools() {
    switch (this.mode) {
      case EXECUTION_MODE.SAFE:
        return TOOL_PERMISSION.SAFE;
      case EXECUTION_MODE.SUPERVISED:
        return TOOL_PERMISSION.AUTO_APPROVE;
      case EXECUTION_MODE.AUTONOMOUS:
        return TOOL_PERMISSION.ALL;
      default:
        return TOOL_PERMISSION.SAFE;
    }
  }

  /**
   * Execute an action from the autonomous engine
   *
   * @param {Object} action - Action from autonomous engine
   * @param {string} action.executionPlan.prompt - The goal/prompt to execute
   * @param {string} action.executionPlan.workDir - Working directory
   * @param {number} action.executionPlan.timeout - Timeout in ms
   * @returns {Promise<Object>} Execution result
   */
  async execute(action) {
    const status = await getClaudeCodeStatus();

    if (!status.installed) {
      return {
        success: false,
        error: "Claude Code CLI not installed. Run: npm install -g @anthropic-ai/claude-code",
        needsInstall: true
      };
    }

    if (!status.loggedIn) {
      return {
        success: false,
        error: "Claude Code not logged in. Run: claude",
        needsLogin: true
      };
    }

    const prompt = action.executionPlan?.prompt || action.title;
    const workDir = action.executionPlan?.workDir || this.workDir;
    const timeout = action.executionPlan?.timeout || this.timeout;

    // Clear previous execution log
    this.executionLog = [];
    this.toolCalls = [];
    this.currentTask = action;

    this.emit("execution-start", { action, prompt, workDir });

    try {
      const result = await this._runClaudeCode(prompt, {
        workDir,
        timeout,
        actionId: action.id
      });

      this.currentTask = null;

      return {
        success: result.success,
        output: result.output,
        sessionId: result.sessionId,
        toolCalls: this.toolCalls,
        executionLog: this.executionLog,
        error: result.error
      };
    } catch (error) {
      this.currentTask = null;
      return {
        success: false,
        error: error.message,
        toolCalls: this.toolCalls,
        executionLog: this.executionLog
      };
    }
  }

  /**
   * Run Claude Code with streaming output
   */
  async _runClaudeCode(prompt, options = {}) {
    return new Promise((resolve) => {
      const args = [
        "-p",
        "--output-format", "stream-json",
        "--allowedTools", this.getAllowedTools().join(",")
      ];

      // Add max turns limit
      if (this.maxTurns) {
        args.push("--max-turns", String(this.maxTurns));
      }

      // Continue session if we have one
      if (this.sessionId) {
        args.push("--resume", this.sessionId);
      }

      // Add the prompt
      args.push(prompt);

      const proc = spawn("claude", args, {
        shell: true,
        cwd: options.workDir || this.workDir,
        env: { ...process.env, FORCE_COLOR: "0" }
      });

      let output = "";
      let error = "";
      let sessionId = null;
      let lineBuffer = "";

      const timeout = setTimeout(() => {
        proc.kill();
        resolve({
          success: false,
          output,
          error: "Execution timeout",
          sessionId
        });
      }, options.timeout || this.timeout);

      // Parse streaming JSON output
      const processLine = (line) => {
        if (!line.trim()) return;

        try {
          const msg = JSON.parse(line);
          this.executionLog.push(msg);

          // Emit events for UI updates
          switch (msg.type) {
            case "assistant":
              const text = msg.message?.content?.[0]?.text || msg.content || "";
              if (text) {
                this.emit("text", { text, actionId: options.actionId });
              }
              break;

            case "tool_use":
              const tool = msg.tool?.name || msg.name || "unknown";
              const input = msg.tool?.input || msg.input || {};
              this.toolCalls.push({
                tool,
                input,
                status: "running",
                timestamp: Date.now()
              });
              this.emit("tool-use", {
                tool,
                input,
                actionId: options.actionId
              });
              break;

            case "tool_result":
              // Update last tool call with result
              if (this.toolCalls.length > 0) {
                const lastTool = this.toolCalls[this.toolCalls.length - 1];
                lastTool.result = msg.content || msg.result;
                lastTool.status = "completed";
              }
              this.emit("tool-result", {
                result: msg.content || msg.result,
                actionId: options.actionId
              });
              break;

            case "result":
              sessionId = msg.session_id || msg.sessionId;
              this.sessionId = sessionId;
              this.emit("result", {
                sessionId,
                result: msg.result || msg.content,
                actionId: options.actionId
              });
              break;

            case "error":
              this.emit("error", {
                error: msg.error || msg.message,
                actionId: options.actionId
              });
              break;
          }
        } catch (e) {
          // Not JSON, emit as raw
          this.emit("raw", { text: line, actionId: options.actionId });
        }
      };

      proc.stdout.on("data", (data) => {
        const chunk = data.toString();
        output += chunk;

        // Parse line by line
        lineBuffer += chunk;
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop();

        for (const line of lines) {
          processLine(line);
        }
      });

      proc.stderr.on("data", (data) => {
        error += data.toString();
      });

      proc.on("close", (code) => {
        clearTimeout(timeout);

        // Process remaining buffer
        if (lineBuffer.trim()) {
          processLine(lineBuffer);
        }

        this.emit("execution-end", {
          success: code === 0,
          sessionId,
          actionId: options.actionId
        });

        resolve({
          success: code === 0,
          output,
          error: error || null,
          sessionId
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          output,
          error: err.message,
          sessionId
        });
      });
    });
  }

  /**
   * Continue conversation in current session
   */
  async continueSession(prompt, options = {}) {
    if (!this.sessionId) {
      return {
        success: false,
        error: "No active session to continue"
      };
    }

    return this._runClaudeCode(prompt, {
      ...options,
      continueSession: true
    });
  }

  /**
   * Clear session and start fresh
   */
  clearSession() {
    this.sessionId = null;
    this.executionLog = [];
    this.toolCalls = [];
  }

  /**
   * Stop current execution
   */
  stop() {
    // The backend will handle process cleanup
    this.backend.stopAll();
    this.currentTask = null;
  }

  /**
   * Get current execution status for UI
   */
  getStatus() {
    return {
      ready: this.isReady(),
      mode: this.mode,
      currentTask: this.currentTask,
      sessionId: this.sessionId,
      toolCallCount: this.toolCalls.length,
      lastToolCall: this.toolCalls[this.toolCalls.length - 1] || null
    };
  }

  /**
   * Set execution mode
   */
  setMode(mode) {
    if (Object.values(EXECUTION_MODE).includes(mode)) {
      this.mode = mode;
      this.emit("mode-changed", mode);
    }
  }
}

/**
 * Create executor function for autonomous engine registration
 *
 * Usage:
 * ```js
 * const engine = getAutonomousEngine();
 * const executor = createClaudeCodeExecutor({ mode: "supervised" });
 * engine.registerExecutor("claude-code", executor.execute.bind(executor));
 * ```
 */
export const createClaudeCodeExecutor = (options = {}) => {
  const executor = new ClaudeCodeExecutor(options);

  // Return the execute function bound to the executor
  return {
    executor,
    execute: executor.execute.bind(executor),

    // Subscribe to events
    on: executor.on.bind(executor),
    off: executor.off.bind(executor),

    // Control methods
    stop: executor.stop.bind(executor),
    clearSession: executor.clearSession.bind(executor),
    setMode: executor.setMode.bind(executor),
    getStatus: executor.getStatus.bind(executor)
  };
};

/**
 * Initialize Claude Code executor with autonomous engine
 *
 * This sets up the full integration:
 * - Registers executor with engine
 * - Sets up event forwarding
 * - Handles approval flow
 */
export const initializeClaudeCodeEngine = (autonomousEngine, options = {}) => {
  const { executor, execute, on } = createClaudeCodeExecutor(options);

  // Register executor with autonomous engine
  autonomousEngine.registerExecutor("claude-code", execute);

  // Forward events to autonomous engine
  on("text", (data) => {
    autonomousEngine.emit("claude-text", data);
  });

  on("tool-use", (data) => {
    autonomousEngine.emit("claude-tool-use", data);
  });

  on("tool-result", (data) => {
    autonomousEngine.emit("claude-tool-result", data);
  });

  on("error", (data) => {
    autonomousEngine.emit("claude-error", data);
  });

  on("execution-start", (data) => {
    autonomousEngine.emit("claude-start", data);
  });

  on("execution-end", (data) => {
    autonomousEngine.emit("claude-end", data);
  });

  return executor;
};

// Singleton executor
let executorInstance = null;

export const getClaudeCodeExecutor = (options = {}) => {
  if (!executorInstance) {
    executorInstance = new ClaudeCodeExecutor(options);
  }
  return executorInstance;
};

export default ClaudeCodeExecutor;
