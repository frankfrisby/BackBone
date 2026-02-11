import { spawn } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import os from "os";
import { getBackboneRoot } from "../paths.js";

/**
 * Build a process env with npm global bin on PATH (Windows fix).
 * Claude Code is installed via npm — on Windows the global bin dir
 * may not be on PATH when BACKBONE is launched from backbone.bat.
 */
const getProcessEnvWithNpm = () => {
  const env = { ...process.env };
  if (process.platform === "win32") {
    const npmBin = path.join(process.env.APPDATA || "", "npm");
    if (npmBin) {
      const pathValue = env.PATH || env.Path || "";
      if (!pathValue.toLowerCase().includes(npmBin.toLowerCase())) {
        // Set both casings to be safe on Windows
        const newPath = `${npmBin}${path.delimiter}${pathValue}`;
        env.PATH = newPath;
        env.Path = newPath;
      }
    }
  }
  return env;
};

/**
 * Claude Code Backend for BACKBONE
 * Interface to Claude Code CLI for agentic tasks with real-time streaming
 *
 * Runs Claude Code as a subprocess, capturing stdin/stdout/stderr
 * and emitting events for real-time display in the engine view.
 *
 * Key Features:
 * - Real-time streaming with --output-format stream-json
 * - Session management (continue, resume by session ID)
 * - Working directory support
 * - Tool permission control
 */

// Backend types
export const BACKEND_TYPE = {
  CLAUDE_CODE: "claude-code",
  OPENCODE: "opencode",
  API_FALLBACK: "api-fallback"
};

// Task status
export const TASK_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  STREAMING: "streaming",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled"
};

// Stream message types from Claude Code
export const STREAM_MESSAGE_TYPE = {
  SYSTEM: "system",           // System messages (init, config)
  ASSISTANT: "assistant",     // Claude's text responses
  USER: "user",               // User messages (our prompts)
  TOOL_USE: "tool_use",       // Tool being called
  TOOL_RESULT: "tool_result", // Tool execution result
  ERROR: "error",             // Errors
  RESULT: "result"            // Final result with session_id
};

// On Windows, use "claude.cmd" — bare "claude" can timeout due to slow shell resolution
const CLAUDE_CMD = process.platform === "win32" ? "claude.cmd" : "claude";

/**
 * Check if Claude Code CLI is installed
 */
export const detectClaudeCode = async () => {
  // Try claude CLI first
  try {
    const result = await runCommand(CLAUDE_CMD, ["--version"], { timeout: 15000 });
    if (result.success) {
      return {
        type: BACKEND_TYPE.CLAUDE_CODE,
        installed: true,
        version: result.output.trim(),
        command: CLAUDE_CMD
      };
    }
  } catch (e) {
    // Not installed
  }

  // Try opencode as alternative
  try {
    const result = await runCommand("opencode", ["--version"]);
    if (result.success) {
      return {
        type: BACKEND_TYPE.OPENCODE,
        installed: true,
        version: result.output.trim(),
        command: "opencode"
      };
    }
  } catch (e) {
    // Not installed
  }

  // Fallback to API
  return {
    type: BACKEND_TYPE.API_FALLBACK,
    installed: false,
    version: null,
    command: null
  };
};

/**
 * Run a command and return result
 */
const runCommand = (command, args, options = {}) => {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      shell: true,
      cwd: options.cwd || process.cwd(),
      env: { ...getProcessEnvWithNpm(), ...options.env }
    });

    let output = "";
    let error = "";
    let settled = false;

    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr.on("data", (data) => {
      error += data.toString();
    });

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      resolve({
        success: code === 0,
        output,
        error,
        exitCode: code
      });
    });

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      resolve({
        success: false,
        output: "",
        error: err.message,
        exitCode: -1
      });
    });

    // Timeout support
    if (options.timeout) {
      setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.kill();
        resolve({ success: false, output: "", error: "Timeout", exitCode: -1 });
      }, options.timeout);
    }
  });
};

/**
 * Claude Code Backend Class
 *
 * Manages Claude Code CLI sessions with real-time streaming output.
 * All output is captured and emitted as events for your UI to display.
 */
export class ClaudeCodeBackend extends EventEmitter {
  constructor() {
    super();
    this.backend = null;
    this.initialized = false;
    this.runningTasks = new Map();
    this.sessions = new Map();        // Track session IDs for resumption
    this.activeProcess = null;        // Current running process
    this.sessionStorePath = path.join(os.homedir(), ".backbone", "claude-sessions.json");
  }

  /**
   * Initialize the backend (detect available tools)
   */
  async initialize() {
    this.backend = await detectClaudeCode();
    this.initialized = true;

    // Load saved sessions
    this._loadSessions();

    this.emit("initialized", this.backend);
    return this.backend;
  }

  /**
   * Get backend status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      backend: this.backend,
      runningTasks: this.runningTasks.size,
      available: this.backend?.installed || false,
      activeSessions: this.sessions.size,
      hasActiveProcess: this.activeProcess !== null
    };
  }

  /**
   * Load saved sessions from disk
   */
  _loadSessions() {
    try {
      if (fs.existsSync(this.sessionStorePath)) {
        const data = JSON.parse(fs.readFileSync(this.sessionStorePath, "utf-8"));
        this.sessions = new Map(Object.entries(data));
      }
    } catch (e) {
      // Ignore load errors, start fresh
    }
  }

  /**
   * Save sessions to disk
   */
  _saveSessions() {
    try {
      const dir = path.dirname(this.sessionStorePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.sessionStorePath,
        JSON.stringify(Object.fromEntries(this.sessions), null, 2)
      );
    } catch (e) {
      // Ignore save errors
    }
  }

  /**
   * Execute a task with REAL-TIME STREAMING
   * This is the main method - streams output to your engine view
   *
   * @param {Object} task - Task configuration
   * @param {string} task.prompt - The prompt to send to Claude
   * @param {string} task.workDir - Working directory for the task
   * @param {string[]} task.allowedTools - Tools Claude can use
   * @param {string} task.sessionId - Resume a previous session
   * @param {boolean} task.continue - Continue the most recent conversation
   * @param {number} task.timeout - Timeout in ms (default 5 min)
   * @param {number} task.maxTurns - Max agentic turns before stopping
   *
   * @returns {Promise<Object>} Task result with sessionId for resumption
   */
  async executeStreamingTask(task) {
    if (!this.initialized) {
      await this.initialize();
    }

    const taskId = task.id || `task_${Date.now()}`;

    // If Claude Code not installed, emit fallback
    if (!this.backend.installed) {
      this.emit("task-fallback", { taskId, reason: "Claude Code not installed" });
      return {
        success: false,
        error: "Claude Code CLI not installed. Install with: npm install -g @anthropic-ai/claude-code",
        fallback: true
      };
    }

    const taskRecord = {
      id: taskId,
      status: TASK_STATUS.STREAMING,
      startedAt: new Date().toISOString(),
      prompt: task.prompt,
      workDir: task.workDir || process.cwd(),
      messages: [],       // Collect all streamed messages
      toolCalls: [],      // Track tool usage
      sessionId: null     // Will be set from result
    };

    this.runningTasks.set(taskId, taskRecord);
    this.emit("task-started", taskRecord);

    try {
      // Build command args for streaming — use stdin for prompt (not -p) to get real-time output
      const args = [
        "--output-format", "stream-json",  // Real-time streaming JSON
        "--verbose",
        "--dangerously-skip-permissions",
        ...(fs.existsSync(getBackboneRoot()) ? ["--add-dir", getBackboneRoot()] : [])
      ];

      // Session management
      if (task.sessionId) {
        // Resume specific session
        args.push("--resume", task.sessionId);
      } else if (task.continue) {
        // Continue most recent conversation
        args.push("--continue");
      }

      // Tool permissions (include MCP servers)
      if (task.allowedTools && task.allowedTools.length > 0) {
        const mcpPrefixes = [
          "mcp__backbone-google", "mcp__backbone-linkedin", "mcp__backbone-contacts",
          "mcp__backbone-news", "mcp__backbone-life", "mcp__backbone-health",
          "mcp__backbone-trading", "mcp__backbone-projects",
        ];
        const allTools = [...task.allowedTools, ...mcpPrefixes];
        args.push("--allowedTools", allTools.join(","));
      }

      // Cost/turn limits
      if (task.maxTurns) {
        args.push("--max-turns", String(task.maxTurns));
      }

      // Execute with streaming — prompt sent via stdin
      const result = await this._runStreamingCommand(
        this.backend.command,
        args,
        {
          cwd: task.workDir || process.cwd(),
          timeout: task.timeout || 300000, // 5 min default
          taskId,
          taskRecord,
          stdinPrompt: task.prompt  // Send prompt via stdin for real streaming
        }
      );

      taskRecord.status = result.success ? TASK_STATUS.COMPLETED : TASK_STATUS.FAILED;
      taskRecord.completedAt = new Date().toISOString();
      taskRecord.result = result.finalResult;
      taskRecord.sessionId = result.sessionId;

      // Save session for later resumption
      if (result.sessionId) {
        this.sessions.set(result.sessionId, {
          taskId,
          prompt: task.prompt,
          workDir: task.workDir,
          createdAt: taskRecord.startedAt,
          lastUsed: new Date().toISOString()
        });
        this._saveSessions();
      }

      this.runningTasks.delete(taskId);
      this.emit("task-completed", taskRecord);

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        sessionId: result.sessionId,
        taskId,
        messages: taskRecord.messages,
        toolCalls: taskRecord.toolCalls
      };
    } catch (error) {
      taskRecord.status = TASK_STATUS.FAILED;
      taskRecord.completedAt = new Date().toISOString();
      taskRecord.error = error.message;

      this.runningTasks.delete(taskId);
      this.emit("task-failed", taskRecord);

      return {
        success: false,
        error: error.message,
        taskId
      };
    }
  }

  /**
   * Run command with streaming JSON parsing
   * Parses each line of stream-json output and emits events
   */
  async _runStreamingCommand(command, args, options = {}) {
    const timeout = options.timeout || 300000;
    const taskId = options.taskId;
    const taskRecord = options.taskRecord;
    const stdinPrompt = options.stdinPrompt;

    return new Promise((resolve) => {
      // Use direct node execution on Windows to avoid cmd.exe stdout buffering
      const claudeCliPath = path.join(process.env.APPDATA || "", "npm", "node_modules", "@anthropic-ai", "claude-code", "cli.js");
      const useDirectNode = process.platform === "win32" && fs.existsSync(claudeCliPath);

      const spawnCmd = useDirectNode ? process.execPath : command;
      const spawnArgs = useDirectNode ? [claudeCliPath, ...args] : args;

      // Remove ANTHROPIC_API_KEY so CLI uses Pro/Max OAuth subscription
      const cleanEnv = { ...process.env, FORCE_COLOR: "0" };
      delete cleanEnv.ANTHROPIC_API_KEY;

      const proc = spawn(spawnCmd, spawnArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: options.cwd || process.cwd(),
        env: cleanEnv
      });

      // Send prompt via stdin for real-time streaming (avoids -p buffering issue)
      if (stdinPrompt) {
        proc.stdin.write(stdinPrompt);
        proc.stdin.end();
      }

      this.activeProcess = proc;

      let output = "";
      let error = "";
      let finished = false;
      let sessionId = null;
      let finalResult = null;
      let lineBuffer = "";

      const timeoutId = setTimeout(() => {
        if (!finished) {
          finished = true;
          proc.kill();
          this.activeProcess = null;
          resolve({
            success: false,
            output,
            error: "Task timed out",
            sessionId,
            finalResult
          });
        }
      }, timeout);

      // Parse streaming JSON line by line
      const processLine = (line) => {
        if (!line.trim()) return;

        try {
          const msg = JSON.parse(line);

          // Track message in task record
          if (taskRecord) {
            taskRecord.messages.push(msg);
          }

          // Emit typed events based on message type
          switch (msg.type) {
            case "system":
              this.emit("stream-system", { taskId, message: msg });
              break;

            case "assistant":
              // Claude's text response
              this.emit("stream-text", {
                taskId,
                text: msg.message?.content?.[0]?.text || msg.content || "",
                message: msg
              });
              break;

            case "user":
              // Our prompt or follow-up
              this.emit("stream-user", { taskId, message: msg });
              break;

            case "tool_use":
              // Tool being called - this is the key event for your UI
              const toolName = msg.tool?.name || msg.name || "unknown";
              const toolInput = msg.tool?.input || msg.input || {};
              this.emit("stream-tool-use", {
                taskId,
                tool: toolName,
                input: toolInput,
                message: msg
              });
              if (taskRecord) {
                taskRecord.toolCalls.push({
                  tool: toolName,
                  input: toolInput,
                  timestamp: Date.now()
                });
              }
              break;

            case "tool_result":
              // Tool execution result
              this.emit("stream-tool-result", {
                taskId,
                result: msg.content || msg.result,
                message: msg
              });
              break;

            case "result":
              // Final result with session ID
              sessionId = msg.session_id || msg.sessionId;
              finalResult = msg.result || msg.content;
              this.emit("stream-result", {
                taskId,
                sessionId,
                result: finalResult,
                message: msg
              });
              break;

            case "error":
              this.emit("stream-error", {
                taskId,
                error: msg.error || msg.message,
                message: msg
              });
              break;

            default:
              // Unknown message type, emit generic
              this.emit("stream-message", { taskId, message: msg });
          }
        } catch (e) {
          // Not JSON, emit as raw text
          this.emit("stream-raw", { taskId, text: line });
        }
      };

      proc.stdout.on("data", (data) => {
        const chunk = data.toString();
        output += chunk;

        // Buffer and process complete lines
        lineBuffer += chunk;
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          processLine(line);
        }

        // Also emit raw output for debugging
        this.emit("task-output", { taskId, output: chunk, type: "stdout" });
      });

      proc.stderr.on("data", (data) => {
        const chunk = data.toString();
        error += chunk;
        this.emit("task-output", { taskId, output: chunk, type: "stderr" });
      });

      proc.on("close", (code) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeoutId);
          this.activeProcess = null;

          // Process any remaining buffered line
          if (lineBuffer.trim()) {
            processLine(lineBuffer);
          }

          resolve({
            success: code === 0,
            output,
            error,
            sessionId,
            finalResult
          });
        }
      });

      proc.on("error", (err) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeoutId);
          this.activeProcess = null;
          resolve({
            success: false,
            output: "",
            error: err.message,
            sessionId: null,
            finalResult: null
          });
        }
      });
    });
  }

  /**
   * Execute an agentic task via Claude Code CLI (legacy batch mode)
   * Use executeStreamingTask for real-time output
   */
  async executeTask(task) {
    if (!this.initialized) {
      await this.initialize();
    }

    const taskId = task.id || `task_${Date.now()}`;

    // If Claude Code not installed, use API fallback
    if (!this.backend.installed) {
      this.emit("task-fallback", { taskId, reason: "Claude Code not installed" });
      return {
        success: false,
        error: "Claude Code CLI not installed. Install with: npm install -g @anthropic-ai/claude-code",
        fallback: true
      };
    }

    const taskRecord = {
      id: taskId,
      status: TASK_STATUS.RUNNING,
      startedAt: new Date().toISOString(),
      prompt: task.prompt,
      workDir: task.workDir || process.cwd()
    };

    this.runningTasks.set(taskId, taskRecord);
    this.emit("task-started", taskRecord);

    try {
      // Build command args
      const args = ["-p"];

      // MCP server tool prefixes
      const mcpTools = [
        "mcp__backbone-google",
        "mcp__backbone-linkedin",
        "mcp__backbone-contacts",
        "mcp__backbone-news",
        "mcp__backbone-life",
        "mcp__backbone-health",
        "mcp__backbone-trading",
        "mcp__backbone-projects",
      ];

      // Add allowed tools if specified
      if (task.allowedTools) {
        const allTools = [...task.allowedTools, ...mcpTools];
        args.push("--allowedTools", allTools.join(","));
      } else {
        // Default safe tools + MCP servers
        const defaultTools = ["Read", "Glob", "Grep", "WebFetch", "WebSearch", ...mcpTools];
        args.push("--allowedTools", defaultTools.join(","));
      }

      // Add file context for file update operations
      let enhancedPrompt = task.prompt;
      if (task.fileContext || (task.prompt && (task.prompt.includes("update") || task.prompt.includes("edit") || task.prompt.includes("modify")))) {
        const contextFiles = task.fileContext || [];
        const fileContextStr = contextFiles.length > 0
          ? `\n\nRelevant files for this task:\n${contextFiles.map(f => `- ${f}`).join("\n")}\n\n`
          : "";
        const projectContext = `\n\nProject context: Working in ${task.workDir || process.cwd()}. ` +
          `Review existing patterns and coding conventions before making changes. ` +
          `Ensure all edits maintain consistency with the codebase style.\n\n`;
        enhancedPrompt = projectContext + fileContextStr + task.prompt;
      }

      // Add the prompt
      args.push(enhancedPrompt);

      // Execute
      const result = await this.runWithTimeout(
        this.backend.command,
        args,
        {
          cwd: task.workDir || process.cwd(),
          timeout: task.timeout || 120000,
          taskId
        }
      );

      taskRecord.status = result.success ? TASK_STATUS.COMPLETED : TASK_STATUS.FAILED;
      taskRecord.completedAt = new Date().toISOString();
      taskRecord.result = result;

      this.runningTasks.delete(taskId);
      this.emit("task-completed", taskRecord);

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        taskId
      };
    } catch (error) {
      taskRecord.status = TASK_STATUS.FAILED;
      taskRecord.completedAt = new Date().toISOString();
      taskRecord.error = error.message;

      this.runningTasks.delete(taskId);
      this.emit("task-failed", taskRecord);

      return {
        success: false,
        error: error.message,
        taskId
      };
    }
  }

  /**
   * Run command with timeout (legacy)
   */
  async runWithTimeout(command, args, options = {}) {
    const timeout = options.timeout || 120000;
    const taskId = options.taskId || null;

    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        shell: true,
        cwd: options.cwd || process.cwd()
      });

      let output = "";
      let error = "";
      let finished = false;

      const timeoutId = setTimeout(() => {
        if (!finished) {
          finished = true;
          proc.kill();
          resolve({
            success: false,
            output,
            error: "Task timed out",
            exitCode: -1
          });
        }
      }, timeout);

      proc.stdout.on("data", (data) => {
        const chunk = data.toString();
        output += chunk;
        this.emit("task-output", { taskId, output: chunk, type: "stdout" });
      });

      proc.stderr.on("data", (data) => {
        const chunk = data.toString();
        error += chunk;
        this.emit("task-output", { taskId, output: chunk, type: "stderr" });
      });

      proc.on("close", (code) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeoutId);
          resolve({
            success: code === 0,
            output,
            error,
            exitCode: code
          });
        }
      });

      proc.on("error", (err) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeoutId);
          resolve({
            success: false,
            output: "",
            error: err.message,
            exitCode: -1
          });
        }
      });
    });
  }

  /**
   * Execute a task that can write files (with streaming)
   */
  async executeWriteTask(task) {
    const writeTask = {
      ...task,
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"]
    };
    return this.executeStreamingTask(writeTask);
  }

  /**
   * Execute a research-only task (safe, read-only, with streaming)
   */
  async executeResearchTask(task) {
    const researchTask = {
      ...task,
      allowedTools: ["Read", "Glob", "Grep", "WebFetch", "WebSearch"]
    };
    return this.executeStreamingTask(researchTask);
  }

  /**
   * Continue the most recent conversation
   * @param {string} prompt - Follow-up prompt
   * @param {Object} options - Additional options
   */
  async continueSession(prompt, options = {}) {
    return this.executeStreamingTask({
      ...options,
      prompt,
      continue: true
    });
  }

  /**
   * Resume a specific session by ID
   * @param {string} sessionId - Session ID to resume
   * @param {string} prompt - Follow-up prompt
   * @param {Object} options - Additional options
   */
  async resumeSession(sessionId, prompt, options = {}) {
    return this.executeStreamingTask({
      ...options,
      prompt,
      sessionId
    });
  }

  /**
   * Get list of saved sessions
   */
  getSessions() {
    return Array.from(this.sessions.entries()).map(([id, data]) => ({
      sessionId: id,
      ...data
    }));
  }

  /**
   * Get a specific session
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Clear a session
   */
  clearSession(sessionId) {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      this._saveSessions();
    }
    return deleted;
  }

  /**
   * Clear all sessions
   */
  clearAllSessions() {
    this.sessions.clear();
    this._saveSessions();
  }

  /**
   * Cancel a running task / kill active process
   */
  cancelTask(taskId) {
    const task = this.runningTasks.get(taskId);
    if (task) {
      task.status = TASK_STATUS.CANCELLED;
      this.runningTasks.delete(taskId);

      // Kill the active process if it matches
      if (this.activeProcess) {
        this.activeProcess.kill();
        this.activeProcess = null;
      }

      this.emit("task-cancelled", task);
      return true;
    }
    return false;
  }

  /**
   * Stop any running Claude Code process
   */
  stopAll() {
    if (this.activeProcess) {
      this.activeProcess.kill();
      this.activeProcess = null;
    }

    // Cancel all running tasks
    for (const [taskId, task] of this.runningTasks) {
      task.status = TASK_STATUS.CANCELLED;
      this.emit("task-cancelled", task);
    }
    this.runningTasks.clear();
  }

  /**
   * Check if a task is currently running
   */
  isRunning() {
    return this.activeProcess !== null;
  }

  /**
   * Get the current running task
   */
  getCurrentTask() {
    if (this.runningTasks.size === 0) return null;
    return Array.from(this.runningTasks.values())[0];
  }

  /**
   * Get installation instructions
   */
  getInstallInstructions() {
    return {
      message: "Claude Code CLI is required for autonomous features",
      commands: [
        "npm install -g @anthropic-ai/claude-code",
        "claude auth login"
      ],
      docs: "https://docs.anthropic.com/claude-code"
    };
  }
}

/**
 * Helper: Create a session manager for your engine view
 * This wraps the backend and provides a simpler API for common operations
 */
export const createSessionManager = () => {
  const backend = getClaudeCodeBackend();

  return {
    /**
     * Start a new Claude Code session with streaming output
     * @param {string} prompt - Initial prompt
     * @param {string} workDir - Working directory
     * @param {Object} options - Additional options
     * @returns {Promise} Result with sessionId for resumption
     */
    start: (prompt, workDir, options = {}) => {
      return backend.executeStreamingTask({
        prompt,
        workDir,
        ...options
      });
    },

    /**
     * Continue the most recent session
     */
    continue: (prompt, options = {}) => {
      return backend.continueSession(prompt, options);
    },

    /**
     * Resume a specific session
     */
    resume: (sessionId, prompt, options = {}) => {
      return backend.resumeSession(sessionId, prompt, options);
    },

    /**
     * Stop the current task
     */
    stop: () => {
      backend.stopAll();
    },

    /**
     * Check if running
     */
    isRunning: () => backend.isRunning(),

    /**
     * Get saved sessions
     */
    getSessions: () => backend.getSessions(),

    /**
     * Subscribe to streaming events
     * @param {Object} handlers - Event handlers
     * @param {Function} handlers.onText - Called when Claude sends text
     * @param {Function} handlers.onToolUse - Called when a tool is used
     * @param {Function} handlers.onToolResult - Called with tool results
     * @param {Function} handlers.onComplete - Called when task completes
     * @param {Function} handlers.onError - Called on errors
     */
    subscribe: (handlers) => {
      if (handlers.onText) {
        backend.on("stream-text", handlers.onText);
      }
      if (handlers.onToolUse) {
        backend.on("stream-tool-use", handlers.onToolUse);
      }
      if (handlers.onToolResult) {
        backend.on("stream-tool-result", handlers.onToolResult);
      }
      if (handlers.onComplete) {
        backend.on("stream-result", handlers.onComplete);
        backend.on("task-completed", handlers.onComplete);
      }
      if (handlers.onError) {
        backend.on("stream-error", handlers.onError);
        backend.on("task-failed", handlers.onError);
      }

      // Return unsubscribe function
      return () => {
        if (handlers.onText) backend.off("stream-text", handlers.onText);
        if (handlers.onToolUse) backend.off("stream-tool-use", handlers.onToolUse);
        if (handlers.onToolResult) backend.off("stream-tool-result", handlers.onToolResult);
        if (handlers.onComplete) {
          backend.off("stream-result", handlers.onComplete);
          backend.off("task-completed", handlers.onComplete);
        }
        if (handlers.onError) {
          backend.off("stream-error", handlers.onError);
          backend.off("task-failed", handlers.onError);
        }
      };
    },

    /**
     * Get the raw backend for advanced usage
     */
    getBackend: () => backend
  };
};

// Singleton instance
let backendInstance = null;

export const getClaudeCodeBackend = () => {
  if (!backendInstance) {
    backendInstance = new ClaudeCodeBackend();
  }
  return backendInstance;
};

export default ClaudeCodeBackend;
