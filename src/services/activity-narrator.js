/**
 * Activity Narrator - Tracks and displays agent activity
 *
 * Provides:
 * - Clear list of available ACTION_TOOLS the AI can use
 * - Clear list of AGENT_STATES for display
 * - Tool usage tracking with metrics
 * - Time, tokens, and tools display with interpunct (·) separator
 */

import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { getProjectManager } from "./project-manager.js";

const DATA_DIR = path.join(process.cwd(), "data");
const DAILY_STATS_FILE = path.join(DATA_DIR, "daily_token_stats.json");

/**
 * ACTION TOOLS - Real executable tools only
 *
 * These are REAL operations that execute on the system.
 * Each tool takes real input and produces real output.
 *
 * Examples of REAL usage:
 * - Bash(cd "C:/Users/frank/projects" && npm install)
 * - Grep("async function.*export" --include="*.js" ./src)
 * - Read(C:/Users/frank/Documents/resume.md)
 * - Write(C:/Users/frank/projects/notes.md)
 * - WebFetch(https://www.linkedin.com/in/frank)
 * - WebSearch(AI engineering jobs Delaware 5 years experience)
 */
export const ACTION_TOOLS = {
  // === FILE OPERATIONS ===
  // These read/write actual files on the filesystem

  READ: {
    id: "READ",
    icon: "→",
    verb: "Read",
    description: "Read file contents",
    category: "file",
    // Example: Read(C:/Users/frank/Documents/resume.md)
  },

  WRITE: {
    id: "WRITE",
    icon: "✎",
    verb: "Write",
    description: "Create new file with content",
    category: "file",
    // Example: Write(C:/Users/frank/projects/job_search.md)
    // Shows: full file content with line numbers in green
  },

  UPDATE: {
    id: "UPDATE",
    icon: "↻",
    verb: "Update",
    description: "Modify existing file",
    category: "file",
    // Example: Update(C:/Users/frank/projects/job_search.md)
    // Shows: diff with line numbers, red for removed, green for added
  },

  EDIT: {
    id: "EDIT",
    icon: "✏",
    verb: "Edit",
    description: "Edit specific lines in file",
    category: "file",
    // Example: Edit(C:/Users/frank/src/auth.js)
    // Shows: diff with line numbers
  },

  DELETE: {
    id: "DELETE",
    icon: "✕",
    verb: "Delete",
    description: "Delete file from filesystem",
    category: "file",
    // Example: Delete(C:/Users/frank/temp/old_file.txt)
  },

  // === SHELL/SYSTEM OPERATIONS ===
  // Execute real commands on the system

  BASH: {
    id: "BASH",
    icon: "$",
    verb: "Bash",
    description: "Execute shell command",
    category: "system",
    // Example: Bash(cd "C:/Users/frank/projects" && npm start)
    // Example: Bash(git status)
    // Example: Bash(node --version)
  },

  MKDIR: {
    id: "MKDIR",
    icon: "+",
    verb: "MkDir",
    description: "Create directory for project",
    category: "system",
    // Example: MkDir(C:/Users/frank/projects/job-search-dc)
    // Used when creating new project directories
  },

  COPY: {
    id: "COPY",
    icon: "⊕",
    verb: "Copy",
    description: "Copy file or directory",
    category: "system",
    // Example: Copy(C:/Users/frank/docs/template.md -> C:/Users/frank/projects/new.md)
  },

  MOVE: {
    id: "MOVE",
    icon: "↝",
    verb: "Move",
    description: "Move file or directory",
    category: "system",
    // Example: Move(C:/Users/frank/downloads/file.pdf -> C:/Users/frank/docs/)
  },

  // === SEARCH OPERATIONS ===
  // Search files and content with real patterns

  GREP: {
    id: "GREP",
    icon: "⌕",
    verb: "Grep",
    description: "Search file contents with regex",
    category: "search",
    // Example: Grep("async function" --include="*.js" ./src)
    // Example: Grep("TODO|FIXME" -r ./src)
    // Shows: matching lines with file:line:content
  },

  GLOB: {
    id: "GLOB",
    icon: "◉",
    verb: "Glob",
    description: "Find files by pattern",
    category: "search",
    // Example: Glob(./src/**/*.test.js)
    // Example: Glob(C:/Users/frank/Documents/*.md)
    // Shows: list of matching file paths
  },

  // === WEB OPERATIONS ===
  // Fetch real URLs and search the web

  WEB_FETCH: {
    id: "WEB_FETCH",
    icon: "↓",
    verb: "Fetch",
    description: "Fetch content from URL",
    category: "web",
    // Example: Fetch(https://www.linkedin.com/in/frank)
    // Example: Fetch(https://api.github.com/users/frank)
    // Shows: actual content retrieved from the URL
  },

  WEB_SEARCH: {
    id: "WEB_SEARCH",
    icon: "◎",
    verb: "WebSearch",
    description: "Search the web",
    category: "web",
    // Example: WebSearch(AI engineering jobs Delaware 5 years Python experience)
    // Shows: actual search results with titles and URLs
  },

  // === API OPERATIONS ===
  // Call real APIs

  API_CALL: {
    id: "API_CALL",
    icon: "⬡",
    verb: "API",
    description: "Call external API",
    category: "api",
    // Example: API(GET https://api.openai.com/v1/models)
    // Example: API(POST https://api.alpaca.markets/v2/orders)
  },

  // Fallback for unknown tools
  UNKNOWN: {
    id: "UNKNOWN",
    icon: "?",
    verb: "Unknown",
    description: "Unknown operation",
    category: "other"
  }
};

// Legacy alias for backward compatibility
export const ACTION_TYPES = ACTION_TOOLS;

/**
 * AGENT STATES - Possible states the agent can be in
 * These describe what the agent is currently doing at a high level
 */
export const AGENT_STATES = {
  // Active states (orange) - agent is doing something
  RESEARCHING: {
    id: "RESEARCHING",
    text: "Researching",
    description: "Gathering information from sources",
    color: "#f59e0b",
    isActive: true
  },
  WORKING: {
    id: "WORKING",
    text: "Working",
    description: "Executing tasks",
    color: "#f59e0b",
    isActive: true
  },
  BUILDING: {
    id: "BUILDING",
    text: "Building",
    description: "Creating or constructing",
    color: "#f59e0b",
    isActive: true
  },
  THINKING: {
    id: "THINKING",
    text: "Thinking",
    description: "Processing and reasoning",
    color: "#f59e0b",
    isActive: true
  },
  REFLECTING: {
    id: "REFLECTING",
    text: "Reflecting",
    description: "Reviewing and evaluating",
    color: "#f59e0b",
    isActive: true
  },
  TESTING: {
    id: "TESTING",
    text: "Testing",
    description: "Running tests/validations",
    color: "#f59e0b",
    isActive: true
  },
  PLANNING: {
    id: "PLANNING",
    text: "Planning",
    description: "Creating action plans",
    color: "#f59e0b",
    isActive: true
  },
  ANALYZING: {
    id: "ANALYZING",
    text: "Analyzing",
    description: "Analyzing data/patterns",
    color: "#f59e0b",
    isActive: true
  },
  CONNECTING: {
    id: "CONNECTING",
    text: "Connecting",
    description: "Connecting to services",
    color: "#f59e0b",
    isActive: true
  },
  EXECUTING: {
    id: "EXECUTING",
    text: "Executing",
    description: "Running operations",
    color: "#f59e0b",
    isActive: true
  },
  LEARNING: {
    id: "LEARNING",
    text: "Learning",
    description: "Learning from feedback",
    color: "#f59e0b",
    isActive: true
  },

  // Passive states (gray) - agent is idle or waiting
  OBSERVING: {
    id: "OBSERVING",
    text: "Observing",
    description: "Monitoring for events",
    color: "#64748b",
    isActive: false
  },
  WAITING: {
    id: "WAITING",
    text: "Waiting",
    description: "Waiting for input",
    color: "#64748b",
    isActive: false
  },
  IDLE: {
    id: "IDLE",
    text: "Idle",
    description: "No active tasks",
    color: "#64748b",
    isActive: false
  },

  // Error states (red)
  ERROR: {
    id: "ERROR",
    text: "Error",
    description: "Error occurred",
    color: "#ef4444",
    isActive: false
  },
  RECOVERING: {
    id: "RECOVERING",
    text: "Recovering",
    description: "Recovering from error",
    color: "#f97316",
    isActive: true
  }
};

/**
 * Action status types
 */
export const ACTION_STATUS = {
  WORKING: "WORKING",       // Gray blinking dot - in progress
  DONE: "DONE",             // Green dot - completed
  FAILED: "FAILED",         // Red dot - failed
  OBSERVATION: "OBSERVATION" // White dot - observation
};

/**
 * ACTION COLORS - Visual display colors for action states
 * These colors match the reference image exactly
 */
export const ACTION_COLORS = {
  // In-progress states
  WORKING: "#64748b",      // Gray - currently executing
  WORKING_BLINK: true,     // Gray blinking for active action

  // Completion states
  DONE: "#22c55e",         // Green - successfully completed
  FAILED: "#ef4444",       // Red - failed with error

  // Information states
  OBSERVATION: "#ffffff",  // White - AI observation/discovery
  THINKING: "#a78bfa",     // Purple - AI thinking (not shown as action)
};

/**
 * ACTION ICONS - Visual indicators for action status
 */
export const ACTION_ICONS = {
  WORKING: "●",            // Solid gray dot (blinking)
  DONE: "✓",               // Green checkmark
  FAILED: "✗",             // Red X
  OBSERVATION: "○",        // White hollow dot
};

/**
 * STATE COLORS - Colors for engine states
 * Each state has a distinctive color for clear visual feedback
 */
export const STATE_COLORS = {
  RESEARCHING: "#38bdf8",  // Cyan/blue
  ANALYZING: "#14b8a6",    // Teal
  THINKING: "#a78bfa",     // Purple
  PLANNING: "#60a5fa",     // Blue
  BUILDING: "#22c55e",     // Green
  WORKING: "#f97316",      // Orange
  EXECUTING: "#22c55e",    // Green
  REFLECTING: "#ec4899",   // Pink
  CONNECTING: "#06b6d4",   // Cyan
  LEARNING: "#f472b6",     // Light pink
  IDLE: "#94a3b8",         // Gray
  WAITING: "#94a3b8",      // Gray
  OBSERVING: "#94a3b8",    // Gray
  ERROR: "#ef4444",        // Red
  RECOVERING: "#f97316",   // Orange
  TESTING: "#f59e0b",      // Amber
  // Claude Code specific states
  CLAUDE_CODE_ACTIVE: "#f97316",  // Orange - Claude Code is running
};

/**
 * Claude Code execution status tracking
 * When Claude Code CLI is active, show orange background in model section
 */
export const CLAUDE_CODE_STATUS = {
  INACTIVE: "inactive",
  STARTING: "starting",
  RUNNING: "running",
  EVALUATING: "evaluating",
  RESPONDING: "responding",
  COMPLETE: "complete",
  ERROR: "error"
};

/**
 * Claude Code display color
 */
export const CLAUDE_CODE_COLOR = "#f97316"; // Orange

/**
 * Get list of all available tools by category
 */
export function getToolsByCategory() {
  const byCategory = {};
  for (const [key, tool] of Object.entries(ACTION_TOOLS)) {
    if (!byCategory[tool.category]) {
      byCategory[tool.category] = [];
    }
    byCategory[tool.category].push(tool);
  }
  return byCategory;
}

/**
 * Get list of all available states by type
 */
export function getStatesByType() {
  const active = [];
  const passive = [];
  for (const state of Object.values(AGENT_STATES)) {
    if (state.isActive) {
      active.push(state);
    } else {
      passive.push(state);
    }
  }
  return { active, passive };
}

/**
 * Format metrics with interpunct (·) separator
 * @param {Object} metrics - { time, tokens, tools }
 * @returns {string} Formatted string like "2.3s · 150 tokens · 3 tools"
 */
export function formatMetrics(metrics) {
  const parts = [];

  if (metrics.time !== undefined) {
    const timeStr = metrics.time >= 1000
      ? `${(metrics.time / 1000).toFixed(1)}s`
      : `${metrics.time}ms`;
    parts.push(timeStr);
  }

  if (metrics.tokens !== undefined) {
    parts.push(`${metrics.tokens} tokens`);
  }

  if (metrics.tools !== undefined) {
    const toolCount = Array.isArray(metrics.tools) ? metrics.tools.length : metrics.tools;
    parts.push(`${toolCount} tools`);
  }

  return parts.join(" · ");
}

class ActivityNarrator extends EventEmitter {
  constructor() {
    super();
    this.currentState = "OBSERVING";
    this.currentGoal = null;

    // Project tracking - goals are associated with projects
    // Project is a directory where work outputs are stored
    this.currentProject = null; // { name, path, createdAt }
    this.projectName = null;    // Display name (max 5 words)

    // User name for personal outcomes (set from app when available)
    this.userName = process.env.USER_NAME || null;

    this.actions = [];
    this.subActions = [];
    this.observations = [];
    this.diffs = [];
    this.maxActions = 20; // Support up to 20 rows of detail
    this.maxObservations = 10;

    // Token and runtime tracking - PER GOAL
    // These reset when the goal changes
    this.stats = {
      tokens: 0,
      runtime: 0,
      startTime: Date.now()
    };

    // Daily cumulative token tracking (persists across goals)
    this.dailyStats = this.loadDailyStats();

    // Tool usage tracking - PER GOAL (resets with goal)
    this.toolsUsed = new Map(); // toolId -> { count, lastUsed, totalTime }
    this.currentSessionTools = []; // Tools used in current session

    // Current work description (25+ words)
    this.workDescription = null;

    // Task progress tracking
    this.taskProgress = null;

    // Service health tracking for agentic robustness
    this.serviceHealth = new Map();

    // Memoization for getDisplayData() to prevent flickering
    // Only recreate objects when data actually changes
    this._dataVersion = 0;
    this._lastDisplayDataVersion = -1;
    this._cachedDisplayData = null;
    this._lastDetailedDataVersion = -1;
    this._cachedDetailedData = null;
    this.cycleMetrics = {
      totalCycles: 0,
      successfulCycles: 0,
      failedCycles: 0,
      consecutiveFailures: 0,
      lastCycleError: null,
      avgCycleDuration: 0,
      cycleDurations: []
    };

    // Error tracking
    this.errors = [];
    this.maxErrors = 50;

    // Display settings
    this.displaySettings = {
      maxDetailRows: 20,
      compactMode: false,
      showMetrics: true
    };

    // Claude Code CLI tracking
    // When active, shows orange background in model section
    this.claudeCode = {
      active: false,
      status: "inactive",        // inactive, starting, running, evaluating, complete, error
      sessionId: null,
      tokensUsed: 0,
      toolCalls: [],             // { tool, input, timestamp, result }
      currentTool: null,         // Currently executing tool
      startTime: null,
      decisions: []              // GPT-5.2 evaluation decisions
    };
  }

  /**
   * Set Claude Code CLI as active (shows orange background)
   */
  setClaudeCodeActive(active, status = "running") {
    this.claudeCode.active = active;
    this.claudeCode.status = status;
    if (active && !this.claudeCode.startTime) {
      this.claudeCode.startTime = Date.now();
    }
    if (!active) {
      this.claudeCode.startTime = null;
    }
    this._markDataChanged();
    this.emit("claude-code-status", { active, status });
  }

  /**
   * Record a Claude Code tool call
   */
  recordClaudeCodeTool(tool, input, result = null) {
    const toolCall = {
      tool,
      input,
      timestamp: Date.now(),
      result
    };
    this.claudeCode.toolCalls.unshift(toolCall);
    this.claudeCode.currentTool = { tool, input };

    // Also add as a visible action
    this.action(tool.toUpperCase(), typeof input === "string" ? input : JSON.stringify(input).slice(0, 80));

    // Keep last 50 tool calls
    if (this.claudeCode.toolCalls.length > 50) {
      this.claudeCode.toolCalls = this.claudeCode.toolCalls.slice(0, 50);
    }
    this._markDataChanged();
  }

  /**
   * Record GPT-5.2 evaluation decision
   */
  recordEvaluationDecision(decision) {
    this.claudeCode.decisions.unshift({
      ...decision,
      timestamp: Date.now()
    });
    if (this.claudeCode.decisions.length > 20) {
      this.claudeCode.decisions = this.claudeCode.decisions.slice(0, 20);
    }
    this._markDataChanged();
  }

  /**
   * Update Claude Code tokens
   */
  updateClaudeCodeTokens(tokens) {
    this.claudeCode.tokensUsed += tokens;
    this._markDataChanged();
  }

  /**
   * Get Claude Code display data
   */
  getClaudeCodeData() {
    return {
      active: this.claudeCode.active,
      status: this.claudeCode.status,
      sessionId: this.claudeCode.sessionId,
      tokensUsed: this.claudeCode.tokensUsed,
      toolCallCount: this.claudeCode.toolCalls.length,
      recentTools: this.claudeCode.toolCalls.slice(0, 5),
      currentTool: this.claudeCode.currentTool,
      runtime: this.claudeCode.startTime ? Date.now() - this.claudeCode.startTime : 0,
      lastDecision: this.claudeCode.decisions[0] || null
    };
  }

  /**
   * Reset Claude Code tracking (when goal changes)
   */
  resetClaudeCode() {
    this.claudeCode = {
      active: false,
      status: "inactive",
      sessionId: null,
      tokensUsed: 0,
      toolCalls: [],
      currentTool: null,
      startTime: null,
      decisions: []
    };
    this._markDataChanged();
  }

  /**
   * Load daily token usage stats from disk
   */
  loadDailyStats() {
    try {
      if (fs.existsSync(DAILY_STATS_FILE)) {
        const data = JSON.parse(fs.readFileSync(DAILY_STATS_FILE, "utf8"));
        return data;
      }
    } catch (error) {
      console.error("Failed to load daily stats:", error.message);
    }
    return { days: {}, totalTokens: 0 };
  }

  /**
   * Save daily token usage stats to disk
   */
  saveDailyStats() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DAILY_STATS_FILE, JSON.stringify(this.dailyStats, null, 2));
    } catch (error) {
      console.error("Failed to save daily stats:", error.message);
    }
  }

  /**
   * Record tokens used (adds to both goal stats and daily cumulative)
   */
  recordTokens(count) {
    // Add to current goal stats
    this.stats.tokens += count;

    // Add to daily cumulative
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    if (!this.dailyStats.days[today]) {
      this.dailyStats.days[today] = { tokens: 0, goals: 0, actions: 0 };
    }
    this.dailyStats.days[today].tokens += count;
    this.dailyStats.totalTokens += count;

    this.saveDailyStats();
    this._markDataChanged();
  }

  /**
   * Get daily stats summary
   */
  getDailyStatsSummary() {
    const today = new Date().toISOString().split("T")[0];
    const todayStats = this.dailyStats.days[today] || { tokens: 0, goals: 0, actions: 0 };

    // Get last 7 days
    const last7Days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      last7Days.push({
        date: dateStr,
        ...this.dailyStats.days[dateStr] || { tokens: 0, goals: 0, actions: 0 }
      });
    }

    return {
      today: todayStats,
      last7Days,
      totalAllTime: this.dailyStats.totalTokens
    };
  }

  /**
   * Reset per-goal stats (called when goal changes)
   */
  resetGoalStats() {
    // Record that a goal was completed in daily stats
    const today = new Date().toISOString().split("T")[0];
    if (!this.dailyStats.days[today]) {
      this.dailyStats.days[today] = { tokens: 0, goals: 0, actions: 0 };
    }
    this.dailyStats.days[today].goals++;
    this.saveDailyStats();

    // Reset per-goal trackers
    this.stats = {
      tokens: 0,
      runtime: 0,
      startTime: Date.now()
    };
    this.toolsUsed.clear();
    this.currentSessionTools = [];
    this.actions = [];
    this.subActions = [];
    this.observations = [];
    this.diffs = [];

    this._markDataChanged();
  }

  /**
   * Track tool usage
   */
  trackToolUsage(toolId, duration = 0) {
    const now = Date.now();

    // Update cumulative tracking
    if (!this.toolsUsed.has(toolId)) {
      this.toolsUsed.set(toolId, { count: 0, totalTime: 0, lastUsed: null });
    }
    const toolStats = this.toolsUsed.get(toolId);
    toolStats.count++;
    toolStats.totalTime += duration;
    toolStats.lastUsed = now;

    // Track in current session
    if (!this.currentSessionTools.includes(toolId)) {
      this.currentSessionTools.push(toolId);
    }

    this.emit("tool-used", { toolId, duration, totalUsage: toolStats });
  }

  /**
   * Get tool usage summary
   */
  getToolUsageSummary() {
    const summary = [];
    for (const [toolId, stats] of this.toolsUsed) {
      const tool = ACTION_TOOLS[toolId];
      summary.push({
        id: toolId,
        name: tool?.verb || toolId,
        icon: tool?.icon || "?",
        count: stats.count,
        totalTime: stats.totalTime,
        lastUsed: stats.lastUsed
      });
    }
    // Sort by count descending
    summary.sort((a, b) => b.count - a.count);
    return summary;
  }

  /**
   * Get formatted metrics string with interpunct separator
   */
  getFormattedMetrics() {
    const runtime = Date.now() - this.stats.startTime;
    return formatMetrics({
      time: runtime,
      tokens: this.stats.tokens,
      tools: this.currentSessionTools.length
    });
  }

  /**
   * Reset session tracking (call at start of new work session)
   */
  resetSession() {
    this.currentSessionTools = [];
    this.stats.tokens = 0;
    this.stats.startTime = Date.now();
    this.actions = [];
    this.observations = [];
    this.emitUpdate();
  }

  /**
   * Register a service for health monitoring
   */
  registerService(serviceName, status = "unknown") {
    this.serviceHealth.set(serviceName, {
      name: serviceName,
      status,
      lastUpdate: Date.now(),
      errorCount: 0,
      lastError: null
    });
    this.emitUpdate();
  }

  /**
   * Update service health status
   */
  updateServiceHealth(serviceName, status, error = null) {
    const service = this.serviceHealth.get(serviceName);
    if (service) {
      service.status = status;
      service.lastUpdate = Date.now();
      if (error) {
        service.errorCount++;
        service.lastError = { message: error.message, timestamp: Date.now() };
      }
      this.emit("service-health-changed", { serviceName, status, error });
      this.emitUpdate();
    }
  }

  /**
   * Record cycle completion
   */
  recordCycleComplete(duration, success = true, error = null) {
    this.cycleMetrics.totalCycles++;

    if (success) {
      this.cycleMetrics.successfulCycles++;
      this.cycleMetrics.consecutiveFailures = 0;
    } else {
      this.cycleMetrics.failedCycles++;
      this.cycleMetrics.consecutiveFailures++;
      this.cycleMetrics.lastCycleError = {
        message: error?.message || "Unknown error",
        timestamp: Date.now(),
        stack: error?.stack
      };

      // Track error
      this.trackError("cycle", error);

      // Emit warning if consecutive failures
      if (this.cycleMetrics.consecutiveFailures >= 3) {
        this.emit("cycle-health-warning", {
          consecutiveFailures: this.cycleMetrics.consecutiveFailures,
          lastError: this.cycleMetrics.lastCycleError
        });
      }
    }

    // Track cycle duration for averages
    this.cycleMetrics.cycleDurations.push(duration);
    if (this.cycleMetrics.cycleDurations.length > 20) {
      this.cycleMetrics.cycleDurations.shift();
    }
    this.cycleMetrics.avgCycleDuration =
      this.cycleMetrics.cycleDurations.reduce((a, b) => a + b, 0) /
      this.cycleMetrics.cycleDurations.length;

    this.emitUpdate();
  }

  /**
   * Track an error
   */
  trackError(source, error, context = {}) {
    const errorEntry = {
      id: `err_${Date.now()}`,
      source,
      message: error?.message || String(error),
      stack: error?.stack,
      timestamp: Date.now(),
      context
    };

    this.errors.unshift(errorEntry);
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    this.emit("error-tracked", errorEntry);
    return errorEntry;
  }

  /**
   * Get health summary for display
   */
  getHealthSummary() {
    const services = {};
    for (const [name, service] of this.serviceHealth) {
      services[name] = {
        status: service.status,
        errorCount: service.errorCount,
        lastError: service.lastError
      };
    }

    const cycleSuccessRate = this.cycleMetrics.totalCycles > 0
      ? (this.cycleMetrics.successfulCycles / this.cycleMetrics.totalCycles * 100).toFixed(1)
      : 100;

    return {
      services,
      cycles: {
        total: this.cycleMetrics.totalCycles,
        successful: this.cycleMetrics.successfulCycles,
        failed: this.cycleMetrics.failedCycles,
        successRate: `${cycleSuccessRate}%`,
        consecutiveFailures: this.cycleMetrics.consecutiveFailures,
        avgDuration: Math.round(this.cycleMetrics.avgCycleDuration)
      },
      recentErrors: this.errors.slice(0, 5),
      overallStatus: this.getOverallStatus()
    };
  }

  /**
   * Get overall system status
   */
  getOverallStatus() {
    // Check for critical failures
    if (this.cycleMetrics.consecutiveFailures >= 5) {
      return "critical";
    }
    if (this.cycleMetrics.consecutiveFailures >= 3) {
      return "degraded";
    }

    // Check service health
    let unhealthyCount = 0;
    for (const service of this.serviceHealth.values()) {
      if (service.status === "unhealthy") unhealthyCount++;
    }

    if (unhealthyCount > this.serviceHealth.size / 2) {
      return "degraded";
    }

    return "healthy";
  }

  /**
   * Check if a goal is too vague
   * Goals must be hyper-specific with actionable details
   */
  isVagueGoal(goal) {
    if (!goal || typeof goal !== "string") return true;
    const lower = goal.toLowerCase();

    // Vague patterns to reject
    const vaguePatterns = [
      /^initializ/i,
      /^starting/i,
      /^beginning/i,
      /help (you |user )?manage/i,
      /help (you |user )?with/i,
      /autonomous agent/i,
      /life management/i,
      /improve your life/i,
      /optimize your/i,
      /monitor(ing)? (your )?/i,
      /analyz(e|ing) (your )?data/i,
      /gather(ing)? information/i,
      /^working on/i,
      /^processing/i,
      /^running/i,
    ];

    if (vaguePatterns.some(pattern => pattern.test(goal))) {
      return true;
    }

    // Must have specific details (numbers, symbols, names, or action verbs)
    // Goals should be full sentences with 15+ words for proper detail
    const wordCount = goal.split(" ").length;
    const hasSpecifics = /\$[\d,]+|\d+%|[A-Z]{2,5}|@|#|\d{4}/.test(goal) || // Numbers, tickers, dates
                         wordCount >= 15; // At least 15 words for full detailed sentence

    return !hasSpecifics;
  }

  /**
   * Set the main goal the agent is working towards
   * Goal MUST be hyper-specific with actionable details
   *
   * GOOD: "Research NVDA swing trade entry at $875 support with 2% stop loss"
   * BAD: "Initializing autonomous agent to help manage your life"
   *
   * When goal changes, per-goal stats (time, tokens, tools) are reset
   * but daily cumulative tracking continues
   */
  setGoal(goal) {
    // Reject vague goals
    if (this.isVagueGoal(goal)) {
      console.warn(`[ActivityNarrator] REJECTED vague goal: "${goal?.slice(0, 50)}..."`);
      return false;
    }

    // If goal is changing (not initial set), reset per-goal stats
    if (this.currentGoal && this.currentGoal !== goal) {
      this.resetGoalStats();
    }

    this.currentGoal = goal;
    this.emit("goal-changed", goal);
    this.emitUpdate();
    return true;
  }

  /**
   * Set user name for personal outcome messages
   */
  setUserName(name) {
    this.userName = name;
    this._markDataChanged();
  }

  /**
   * Set the current project
   * Creates or loads a real project directory with PROJECT.md
   * @param {string} name - Project display name (max 5 words, e.g., "Job Search DC")
   * @param {string} goal - Optional goal description (uses currentGoal if not provided)
   */
  setProject(name, goal = null) {
    const projectManager = getProjectManager();
    const projectGoal = goal || this.currentGoal || "No goal specified";

    // Find or create the project directory
    const project = projectManager.findOrCreate(name, projectGoal);

    this.projectName = project.name;
    this.currentProject = project;
    this.emit("project-changed", this.currentProject);
    this.emitUpdate();

    return project;
  }

  /**
   * Get current project info
   */
  getProject() {
    return this.currentProject;
  }

  /**
   * Add an update to the current project's log
   * @param {string} type - Update type (research, document, progress, note)
   * @param {string} message - Update message
   */
  addProjectUpdate(type, message) {
    if (!this.currentProject) return;

    try {
      const projectManager = getProjectManager();
      projectManager.addUpdate(type, message);
    } catch (err) {
      console.warn("[ActivityNarrator] Failed to add project update:", err.message);
    }
  }

  /**
   * Write a file to the current project
   * @param {string} subPath - Path relative to project (e.g., "research/findings.md")
   * @param {string} content - File content
   * @returns {string|null} Full path to file or null
   */
  writeToProject(subPath, content) {
    if (!this.currentProject) return null;

    try {
      const projectManager = getProjectManager();
      return projectManager.writeFile(subPath, content);
    } catch (err) {
      console.warn("[ActivityNarrator] Failed to write to project:", err.message);
      return null;
    }
  }

  /**
   * Read a file from the current project
   * @param {string} subPath - Path relative to project
   * @returns {string|null} File content or null
   */
  readFromProject(subPath) {
    if (!this.currentProject) return null;

    try {
      const projectManager = getProjectManager();
      return projectManager.readFile(subPath);
    } catch (err) {
      console.warn("[ActivityNarrator] Failed to read from project:", err.message);
      return null;
    }
  }

  /**
   * List all projects
   * @returns {Array} List of project info
   */
  listProjects() {
    const projectManager = getProjectManager();
    return projectManager.listProjects();
  }

  /**
   * Switch to a different project
   * @param {string} name - Project name
   * @returns {Object|null} Project info or null
   */
  switchProject(name) {
    const projectManager = getProjectManager();
    const project = projectManager.switchProject(name);

    if (project) {
      this.projectName = project.name;
      this.currentProject = project;
      this.emit("project-changed", this.currentProject);
      this.emitUpdate();
    }

    return project;
  }

  /**
   * Clear current project (but don't delete it)
   */
  clearProject() {
    this.projectName = null;
    this.currentProject = null;
    this.emit("project-cleared");
    this.emitUpdate();
  }

  /**
   * Reset all projects (moves to backup for 7 day recovery)
   * @returns {Array} List of backed up projects
   */
  resetAllProjects() {
    const projectManager = getProjectManager();
    const backups = projectManager.resetAllProjects();

    this.projectName = null;
    this.currentProject = null;
    this.emit("all-projects-reset", backups);
    this.emitUpdate();

    return backups;
  }

  /**
   * List available project backups
   * @returns {Array} Backup info with recovery dates
   */
  listProjectBackups() {
    const projectManager = getProjectManager();
    return projectManager.listBackups();
  }

  /**
   * Recover a project from backup
   * @param {string} backupName - Backup folder name
   * @returns {Object|null} Recovered project or null
   */
  recoverProject(backupName) {
    const projectManager = getProjectManager();
    const project = projectManager.recoverProject(backupName);

    if (project) {
      this.projectName = project.name;
      this.currentProject = project;
      this.emit("project-recovered", project);
      this.emitUpdate();
    }

    return project;
  }

  /**
   * Set the current agent state
   */
  setState(state) {
    if (AGENT_STATES[state]) {
      this.currentState = state;
      this.emit("state-changed", state);
      this.emitUpdate();
    }
  }

  /**
   * Set detailed work description (25+ words)
   */
  setWorkDescription(description) {
    this.workDescription = description;
    this.emitUpdate();
  }

  /**
   * Set task progress
   */
  setTaskProgress(current, total, taskName = "tasks") {
    this.taskProgress = { current, total, taskName };
    this.emitUpdate();
  }

  /**
   * Clear task progress
   */
  clearTaskProgress() {
    this.taskProgress = null;
    this.emitUpdate();
  }

  /**
   * Update token count
   */
  addTokens(count) {
    this.stats.tokens += count;
    this.emitUpdate();
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = {
      tokens: 0,
      runtime: 0,
      startTime: Date.now()
    };
    this.emitUpdate();
  }

  /**
   * Validate that a target is a REAL terminal command (for BASH type)
   * Real commands start with: git, npm, node, python, pip, curl, wget, cd, ls, mkdir, rm, cp, mv, etc.
   *
   * STRICT VALIDATION to prevent fake/hallucinated commands:
   * - Must start with a known command or executable path
   * - Cannot be abstract descriptions like "run the script"
   */
  isValidBashCommand(target) {
    if (!target || typeof target !== "string") return false;
    const cmd = target.trim();
    const cmdLower = cmd.toLowerCase();

    // Reject if it looks like a description rather than a command
    const descriptionPatterns = [
      /^(run|execute|start|do|perform|check|analyze|process|validate|test)\s+(the|a|this|that|my)/i,
      /^(search|find|look)\s+for/i,
      /^(create|make|build)\s+(a|the|new)\s+/i,
      /^updating/i,
      /^researching/i,
      /^analyzing/i,
    ];
    if (descriptionPatterns.some(pattern => pattern.test(cmd))) {
      return false;
    }

    // Valid command prefixes (actual terminal commands)
    const validPrefixes = [
      "git ", "npm ", "npx ", "node ", "python ", "python3 ", "pip ", "pip3 ",
      "curl ", "wget ", "cd ", "ls ", "dir ", "mkdir ", "rmdir ", "rm ", "del ",
      "cp ", "copy ", "mv ", "move ", "cat ", "type ", "echo ", "grep ", "find ",
      "chmod ", "chown ", "sudo ", "apt ", "yum ", "brew ", "docker ", "kubectl ",
      "aws ", "gcloud ", "az ", "terraform ", "ansible ", "make ", "cmake ",
      "cargo ", "rustc ", "go ", "java ", "javac ", "dotnet ", "nuget ",
      "yarn ", "pnpm ", "bun ", "deno ", "tsx ", "ts-node ", "tsc ",
      "claude ", "code ", "vim ", "nano ", "notepad ", "start ", "open ",
      "powershell ", "pwsh ", "bash ", "sh ", "zsh ", "cmd ",
      "where ", "which ", "set ", "export ", "env ", "printenv ",
      "touch ", "head ", "tail ", "less ", "more ", "wc ", "sort ", "uniq ",
      "tar ", "zip ", "unzip ", "gzip ", "gunzip ", "7z ",
      "ssh ", "scp ", "rsync ", "ftp ", "sftp ",
      "ping ", "traceroute ", "netstat ", "ifconfig ", "ipconfig ", "nslookup ",
      "./", "../", "/", "~/"
    ];

    // Also allow Windows drive paths as executable paths
    const windowsDrivePattern = /^[A-Za-z]:[\\\/]/;
    if (windowsDrivePattern.test(cmd)) {
      return true;
    }

    return validPrefixes.some(prefix => cmdLower.startsWith(prefix));
  }

  /**
   * Validate that a target is a real file path (for MKDIR, READ, WRITE, etc.)
   *
   * STRICT VALIDATION:
   * - Must contain path separators OR start with valid path prefix
   * - Cannot be abstract descriptions
   * - File paths should look like actual paths with extensions or directory names
   */
  isValidFilePath(target) {
    if (!target || typeof target !== "string") return false;
    const pathStr = target.trim();

    // Reject if it looks like a description rather than a path
    const descriptionPatterns = [
      /^(the|a|this|that|my|new|old)\s+/i,
      /^(file|folder|directory|document|script)\s+(for|to|with|named)/i,
      /^(create|make|update|edit|read|write)\s+/i,
      /\s+(file|folder|directory|document)$/i,
    ];
    if (descriptionPatterns.some(pattern => pattern.test(pathStr))) {
      return false;
    }

    // Must look like a file path
    const hasPathSeparator = pathStr.includes("/") || pathStr.includes("\\");
    const startsWithValidPath = /^(\.\/|\.\.\/|\/|~\/|[A-Za-z]:\\|[A-Za-z]:\/)/i.test(pathStr);
    const looksLikeFile = /\.[a-zA-Z0-9]+$/.test(pathStr);
    const looksLikeDir = /[\/\\][a-zA-Z0-9_.-]+$/.test(pathStr) || pathStr.endsWith("/") || pathStr.endsWith("\\");

    // Must have at least one path-like characteristic
    if (hasPathSeparator || startsWithValidPath) {
      return looksLikeFile || looksLikeDir || startsWithValidPath;
    }

    // Single filename without path - must have extension
    return looksLikeFile;
  }

  /**
   * Validate that a target is a valid copy/move operation
   * Format: source -> destination OR source, destination
   */
  isValidCopyMove(target) {
    if (!target || typeof target !== "string") return false;

    // Check for arrow format: source -> dest
    if (target.includes("->")) {
      const parts = target.split("->").map(p => p.trim());
      return parts.length === 2 &&
             this.isValidFilePath(parts[0]) &&
             this.isValidFilePath(parts[1]);
    }

    // Check for comma format: source, dest
    if (target.includes(",")) {
      const parts = target.split(",").map(p => p.trim());
      return parts.length === 2 &&
             this.isValidFilePath(parts[0]) &&
             this.isValidFilePath(parts[1]);
    }

    // Single path - could be valid for some copy operations
    return this.isValidFilePath(target);
  }

  /**
   * Log a main action (e.g., Update, Search, WebSearch)
   *
   * VALIDATION RULES:
   * - BASH: target MUST be a real terminal command (git, npm, curl, etc.)
   * - MKDIR/DELETE: target MUST be a real file path
   * - READ/WRITE/UPDATE/EDIT: target MUST be a real file path
   * - COPY/MOVE: target MUST be a valid source -> destination format
   * - WEB_FETCH: target MUST be a URL (http:// or https://)
   * - WEB_SEARCH: target should be a search query
   * - GREP/GLOB: target should be a search pattern with path
   *
   * @param {string} type - Action type from ACTION_TOOLS
   * @param {string} target - File path, URL, command, or query
   * @param {string} detail - Detailed description
   * @param {string} status - ACTION_STATUS value
   */
  action(type, target, detail = null, status = ACTION_STATUS.WORKING) {
    // Normalize type to uppercase for lookup
    const normalizedType = type?.toUpperCase?.() || type;
    const actionType = ACTION_TOOLS[normalizedType] || ACTION_TOOLS[type] || ACTION_TOOLS.BASH;

    // STRICT VALIDATION - reject invalid actions based on type
    // This prevents hallucinated/fake actions from appearing in the UI

    if (normalizedType === "BASH" && !this.isValidBashCommand(target)) {
      console.warn(`[ActivityNarrator] REJECTED BASH: "${target?.slice(0, 50)}" is not a valid bash command`);
      return null;
    }

    if ((normalizedType === "MKDIR" || normalizedType === "DELETE" || normalizedType === "READ" || normalizedType === "WRITE" || normalizedType === "UPDATE" || normalizedType === "EDIT")
        && !this.isValidFilePath(target)) {
      console.warn(`[ActivityNarrator] REJECTED ${normalizedType}: "${target?.slice(0, 50)}" is not a valid file path`);
      return null;
    }

    if ((normalizedType === "COPY" || normalizedType === "MOVE") && !this.isValidCopyMove(target)) {
      console.warn(`[ActivityNarrator] REJECTED ${normalizedType}: "${target?.slice(0, 50)}" is not a valid copy/move format`);
      return null;
    }

    if (normalizedType === "WEB_FETCH" && !target?.startsWith("http")) {
      console.warn(`[ActivityNarrator] REJECTED WEB_FETCH: "${target?.slice(0, 50)}" is not a valid URL`);
      return null;
    }

    if (normalizedType === "GREP" && !target?.includes(" ")) {
      // GREP should have at least a pattern and path separated by space
      console.warn(`[ActivityNarrator] REJECTED GREP: "${target?.slice(0, 50)}" should have pattern and path`);
      return null;
    }

    if (normalizedType === "GLOB" && !/[*?[\]{}]/.test(target || "") && !this.isValidFilePath(target)) {
      // GLOB should have glob patterns or be a valid path
      console.warn(`[ActivityNarrator] REJECTED GLOB: "${target?.slice(0, 50)}" is not a valid glob pattern`);
      return null;
    }

    const action = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: normalizedType,
      target,
      detail,
      status,
      icon: actionType.icon,
      verb: actionType.verb,
      color: "#f8fafc", // White for visibility
      category: actionType.category,
      timestamp: Date.now(),
      startTime: Date.now()
    };

    // Track tool usage
    this.trackToolUsage(type);

    this.actions.unshift(action);
    if (this.actions.length > this.maxActions) {
      this.actions = this.actions.slice(0, this.maxActions);
    }

    this.emit("action", action);
    this.emitUpdate();
    return action.id;
  }

  /**
   * Update an action's status
   */
  updateActionStatus(actionId, status) {
    const action = this.actions.find(a => a.id === actionId);
    if (action) {
      action.status = status;
      this.emitUpdate();
    }
  }

  /**
   * Mark action as completed and record duration
   */
  completeAction(actionId) {
    const action = this.actions.find(a => a.id === actionId);
    if (action) {
      action.status = ACTION_STATUS.DONE;
      action.endTime = Date.now();
      action.duration = action.endTime - action.startTime;

      // Update tool usage with duration
      if (action.type && this.toolsUsed.has(action.type)) {
        const toolStats = this.toolsUsed.get(action.type);
        toolStats.totalTime += action.duration;
      }

      this.emitUpdate();
    }
  }

  /**
   * Mark action as failed
   */
  failAction(actionId) {
    this.updateActionStatus(actionId, ACTION_STATUS.FAILED);
  }

  /**
   * Set the results of an action (ACTUAL DATA, not summaries)
   * @param {string} actionId - The action ID
   * @param {string|string[]} results - Array of result lines or newline-separated string
   *
   * Example for WebSearch:
   *   setActionResults(id, [
   *     "1. Senior AI Engineer at TechCorp - $180k, Remote, 5+ yrs",
   *     "2. ML Engineer at DataCo - $165k, DC Area, Python required",
   *     "3. AI Research Scientist at LabX - $200k, Hybrid, PhD preferred"
   *   ])
   *
   * Example for Fetch:
   *   setActionResults(id, [
   *     "Title: Senior AI Engineer",
   *     "Company: TechCorp Inc.",
   *     "Salary: $180,000 - $220,000",
   *     "Location: Washington DC (Hybrid)",
   *     "Requirements: Python, TensorFlow, 5+ years experience"
   *   ])
   */
  setActionResults(actionId, results) {
    const action = this.actions.find(a => a.id === actionId);
    if (action) {
      if (Array.isArray(results)) {
        action.results = results;
      } else {
        action.result = results;
      }
      this.emitUpdate();
    }
  }

  // Alias for backwards compatibility
  setActionResult(actionId, result) {
    this.setActionResults(actionId, result);
  }

  /**
   * Attach a diff to an action (for file operations)
   * @param {string} actionId - The action to attach diff to
   * @param {Object} diff - Diff object with removed and added lines
   * @param {Array} diff.removed - Lines removed [{lineNum, text}]
   * @param {Array} diff.added - Lines added [{lineNum, text}]
   */
  attachDiff(actionId, diff) {
    const action = this.actions.find(a => a.id === actionId);
    if (action) {
      action.diff = diff;
      this.emitUpdate();
    }
  }

  /**
   * Create a WebSearch action
   * @param {string} query - The search query (8-20 words)
   * @returns {string} actionId
   */
  webSearch(query) {
    return this.action("WEB_SEARCH", query, null);
  }

  /**
   * Create a Fetch action for a URL
   * @param {string} url - The URL to fetch
   * @returns {string} actionId
   */
  fetch(url) {
    return this.action("WEB_FETCH", url, null);
  }

  /**
   * Create a file action with result description
   * @param {string} type - Action type (WRITE, UPDATE, EDIT)
   * @param {string} filePath - Full path to file
   * @param {string} result - Description of what was written/changed
   * @param {Object} diff - Optional diff object
   * @returns {string} actionId
   */
  fileAction(type, filePath, result, diff = null) {
    const actionId = this.action(type, filePath, null);
    if (result) {
      this.setActionResult(actionId, result);
    }
    if (diff) {
      this.attachDiff(actionId, diff);
    }
    return actionId;
  }

  /**
   * Log a sub-action (e.g., Bash, MkDir, Copy)
   */
  subAction(type, target, detail = null) {
    const actionType = ACTION_TOOLS[type] || ACTION_TOOLS.BASH;
    const sub = {
      id: `sub_${Date.now()}`,
      type,
      target,
      detail,
      status: ACTION_STATUS.WORKING,
      icon: actionType.icon,
      verb: actionType.verb,
      color: "#f8fafc",
      category: actionType.category,
      timestamp: Date.now(),
      startTime: Date.now()
    };

    // Track tool usage
    this.trackToolUsage(type);

    this.subActions.unshift(sub);
    if (this.subActions.length > this.maxActions) {
      this.subActions = this.subActions.slice(0, this.maxActions);
    }

    this.emit("sub-action", sub);
    this.emitUpdate();
  }

  /**
   * Check if observation is useless (just restating obvious facts)
   */
  isUselessObservation(text) {
    if (!text || typeof text !== "string") return true;
    const lower = text.toLowerCase();

    // Patterns that indicate useless observations (just restating what user already knows)
    const uselessPatterns = [
      /your (current )?portfolio (only )?(has|contains|consists|includes)/i,
      /you (currently )?have \d+ (positions?|stocks?|holdings?)/i,
      /currently (holding|tracking|monitoring)/i,
      /no (new )?(changes|updates|activity) (detected|found|to report)/i,
      /everything (looks|seems|appears) (normal|fine|ok|stable)/i,
      /continuing to (monitor|watch|track|observe)/i,
      /waiting for (new |more )?(data|information|updates)/i,
      /cycle completed/i,
      /monitoring systems/i,
      /all systems (are )?(running|operational|normal)/i,
      /checking (your )?/i,
      /analyzed (your )?/i,
      /reviewing (your )?/i,
    ];

    // Reject if matches useless pattern
    if (uselessPatterns.some(pattern => pattern.test(text))) {
      return true;
    }

    // Reject if too short (less than 20 chars) and doesn't have actionable info
    if (text.length < 20 && !text.includes("$") && !text.includes("%")) {
      return true;
    }

    return false;
  }

  /**
   * Add an observation (what the agent learned/noticed)
   * Filters out useless observations that just restate obvious facts
   */
  observe(text, context = null) {
    // REJECT useless observations
    if (this.isUselessObservation(text)) {
      console.warn(`[ActivityNarrator] REJECTED useless observation: "${text?.slice(0, 50)}..."`);
      return null;
    }

    const obs = {
      id: `obs_${Date.now()}`,
      text,
      context,
      status: ACTION_STATUS.OBSERVATION,
      timestamp: Date.now()
    };

    this.observations.unshift(obs);
    if (this.observations.length > this.maxObservations) {
      this.observations = this.observations.slice(0, this.maxObservations);
    }

    this.emit("observation", obs);
    this.emitUpdate();
  }

  /**
   * Add a diff (file change with red/green highlighting)
   * @param {string} file - Filename
   * @param {number} lineNumber - Line number
   * @param {string[]} removed - Lines being removed
   * @param {string[]} added - Lines being added
   */
  addDiff(file, lineNumber, removed, added) {
    const diff = {
      id: `diff_${Date.now()}`,
      file,
      lineNumber,
      removed: Array.isArray(removed) ? removed : (removed ? [removed] : []),
      added: Array.isArray(added) ? added : (added ? [added] : []),
      timestamp: Date.now()
    };

    this.diffs.unshift(diff);
    if (this.diffs.length > 3) {
      this.diffs = this.diffs.slice(0, 3);
    }

    this.emit("diff", diff);
    this.emitUpdate();
  }

  /**
   * Clear a diff after showing
   */
  clearDiffs() {
    this.diffs = [];
    this.emitUpdate();
  }

  /**
   * Mark data as changed - call this whenever state mutates
   * This enables memoization to work correctly
   */
  _markDataChanged() {
    this._dataVersion++;
  }

  /**
   * Get display data for UI (compact view)
   * Memoized to prevent flickering - returns same object reference if data unchanged
   */
  getDisplayData() {
    // Update runtime
    this.stats.runtime = Date.now() - this.stats.startTime;

    // Return cached data if nothing has changed
    // IMPORTANT: Don't mutate cached object to prevent JSON changes that trigger re-renders
    if (this._cachedDisplayData && this._lastDisplayDataVersion === this._dataVersion) {
      // Only rebuild every 5 seconds to update runtime display without constant flicker
      const timeSinceRebuild = Date.now() - (this._lastDisplayRebuild || 0);
        if (timeSinceRebuild < 1000) {
          return this._cachedDisplayData;
        }
    }

    // Data changed or 5s elapsed - rebuild the display data
    this._lastDisplayDataVersion = this._dataVersion;
    this._lastDisplayRebuild = Date.now();
    this._cachedDisplayData = {
      state: this.currentState,
      stateInfo: AGENT_STATES[this.currentState] || AGENT_STATES.OBSERVING,
      goal: this.currentGoal,
      projectName: this.projectName,
      project: this.currentProject,
      actions: this.actions.slice(0, 5),
      subActions: this.subActions.slice(0, 2),
      observations: this.observations.slice(0, 4),
      diffs: this.diffs.slice(0, 2),
      stats: { ...this.stats },
      dailyStats: this.getDailyStatsSummary(),
      userName: this.userName,
      workDescription: this.workDescription,
      taskProgress: this.taskProgress,
      health: this.getHealthSummary(),
      metricsLine: this.getFormattedMetrics(),
      toolsUsedThisSession: this.currentSessionTools.slice(),
      toolUsageSummary: this.getToolUsageSummary().slice(0, 5),
      // Claude Code CLI tracking - shows orange when active
      claudeCode: this.getClaudeCodeData()
    };

    return this._cachedDisplayData;
  }

  /**
   * Get detailed display data (up to 20 rows)
   * Use this when there's no conversation taking up space
   * Memoized to prevent flickering
   */
  getDetailedDisplayData() {
    this.stats.runtime = Date.now() - this.stats.startTime;

    // Return cached data if nothing has changed
    // Don't mutate cached object to prevent JSON changes that trigger re-renders
    if (this._cachedDetailedData && this._lastDetailedDataVersion === this._dataVersion) {
      const timeSinceRebuild = Date.now() - (this._lastDetailedRebuild || 0);
      if (timeSinceRebuild < 5000) {
        return this._cachedDetailedData;
      }
    }

    // Data changed or 5s elapsed - rebuild
    this._lastDetailedDataVersion = this._dataVersion;
    this._lastDetailedRebuild = Date.now();
    this._cachedDetailedData = {
      state: this.currentState,
      stateInfo: AGENT_STATES[this.currentState] || AGENT_STATES.OBSERVING,
      goal: this.currentGoal,
      projectName: this.projectName,
      project: this.currentProject,
      actions: this.actions.slice(0, 15),
      subActions: this.subActions.slice(0, 5),
      observations: this.observations.slice(0, 10),
      diffs: this.diffs.slice(0, 3),
      stats: { ...this.stats },
      workDescription: this.workDescription,
      taskProgress: this.taskProgress,
      health: this.getHealthSummary(),
      metricsLine: this.getFormattedMetrics(),
      toolsUsedThisSession: this.currentSessionTools.slice(),
      toolUsageSummary: this.getToolUsageSummary(),
      recentErrors: this.errors.slice(0, 5),
      serviceStatuses: this.getServiceStatuses(),
      cycleInfo: {
        total: this.cycleMetrics.totalCycles,
        successful: this.cycleMetrics.successfulCycles,
        failed: this.cycleMetrics.failedCycles,
        avgDuration: Math.round(this.cycleMetrics.avgCycleDuration)
      }
    };

    return this._cachedDetailedData;
  }

  /**
   * Get service statuses for display
   */
  getServiceStatuses() {
    const statuses = [];
    for (const [name, service] of this.serviceHealth) {
      statuses.push({
        name,
        status: service.status,
        errorCount: service.errorCount
      });
    }
    return statuses;
  }

  /**
   * Emit update event
   */
  emitUpdate() {
    // Mark data as changed so memoization knows to rebuild
    this._markDataChanged();
    this.emit("updated", this.getDisplayData());
  }

  /**
   * Clear all activity
   */
  clear() {
    this.actions = [];
    this.subActions = [];
    this.observations = [];
    this.diffs = [];
    this.currentGoal = null;
    this.currentProject = null;
    this.projectName = null;
    this.currentState = "OBSERVING";
    this.workDescription = null;
    this.taskProgress = null;
    this.emitUpdate();
  }

  /**
   * Reset health metrics (useful for fresh starts)
   */
  resetHealthMetrics() {
    this.cycleMetrics = {
      totalCycles: 0,
      successfulCycles: 0,
      failedCycles: 0,
      consecutiveFailures: 0,
      lastCycleError: null,
      avgCycleDuration: 0,
      cycleDurations: []
    };
    this.errors = [];
    for (const service of this.serviceHealth.values()) {
      service.errorCount = 0;
      service.lastError = null;
      service.status = "unknown";
    }
    this.emitUpdate();
  }
}

// Singleton
let instance = null;

export const getActivityNarrator = () => {
  if (!instance) {
    instance = new ActivityNarrator();
  }
  return instance;
};

export default ActivityNarrator;
