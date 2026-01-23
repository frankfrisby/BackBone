import { spawn } from "child_process";
import { EventEmitter } from "events";

/**
 * Claude Code Backend for BACKBONE
 * Interface to Claude Code/OpenCode CLI for agentic tasks
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
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled"
};

/**
 * Check if Claude Code CLI is installed
 */
export const detectClaudeCode = async () => {
  // Try claude CLI first
  try {
    const result = await runCommand("claude", ["--version"]);
    if (result.success) {
      return {
        type: BACKEND_TYPE.CLAUDE_CODE,
        installed: true,
        version: result.output.trim(),
        command: "claude"
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
      env: { ...process.env, ...options.env }
    });

    let output = "";
    let error = "";

    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr.on("data", (data) => {
      error += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        output,
        error,
        exitCode: code
      });
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        output: "",
        error: err.message,
        exitCode: -1
      });
    });
  });
};

/**
 * Claude Code Backend Class
 */
export class ClaudeCodeBackend extends EventEmitter {
  constructor() {
    super();
    this.backend = null;
    this.initialized = false;
    this.runningTasks = new Map();
  }

  /**
   * Initialize the backend (detect available tools)
   */
  async initialize() {
    this.backend = await detectClaudeCode();
    this.initialized = true;

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
      available: this.backend?.installed || false
    };
  }

  /**
   * Execute an agentic task via Claude Code CLI
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
      const args = ["--print"];

      // Add allowed tools if specified
      if (task.allowedTools) {
        args.push("--allowedTools", task.allowedTools.join(","));
      } else {
        // Default safe tools
        args.push("--allowedTools", "Read,Glob,Grep,WebFetch,WebSearch");
      }

      // Add the prompt
      args.push(task.prompt);

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
   * Run command with timeout
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
   * Execute a task that can write files (more dangerous)
   */
  async executeWriteTask(task) {
    // Same as executeTask but with write permissions
    const writeTask = {
      ...task,
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"]
    };
    return this.executeTask(writeTask);
  }

  /**
   * Execute a research-only task (safe, read-only)
   */
  async executeResearchTask(task) {
    const researchTask = {
      ...task,
      allowedTools: ["Read", "Glob", "Grep", "WebFetch", "WebSearch"]
    };
    return this.executeTask(researchTask);
  }

  /**
   * Cancel a running task
   */
  cancelTask(taskId) {
    const task = this.runningTasks.get(taskId);
    if (task) {
      task.status = TASK_STATUS.CANCELLED;
      this.runningTasks.delete(taskId);
      this.emit("task-cancelled", task);
      return true;
    }
    return false;
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

// Singleton instance
let backendInstance = null;

export const getClaudeCodeBackend = () => {
  if (!backendInstance) {
    backendInstance = new ClaudeCodeBackend();
  }
  return backendInstance;
};

export default ClaudeCodeBackend;
