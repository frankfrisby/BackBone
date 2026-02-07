/**
 * Session State Service
 *
 * Tracks system state so it can resume where it left off:
 * - Current active goal
 * - Last 50 actions
 * - Main system objective
 * - Session metadata
 *
 * Persists to data/session-state.json
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "session-state.json");
const MAX_ACTIONS = 50;

/**
 * Default state structure
 */
const DEFAULT_STATE = {
  // Main system objective (what the system is trying to accomplish overall)
  mainObjective: null,

  // Current active goal being worked on
  currentGoal: null,

  // Last 50 actions taken by the system
  recentActions: [],

  // Session metadata
  session: {
    startedAt: null,
    lastActivityAt: null,
    actionCount: 0,
    resumeCount: 0
  },

  // Context for resuming
  context: {
    lastQuery: null,
    lastResponse: null,
    pendingTasks: [],
    workingOn: null
  }
};

class SessionStateService {
  constructor() {
    this.state = this.load();
    this.dirty = false;
    this.saveInterval = null;

    // Auto-save every 30 seconds if dirty
    this.saveInterval = setInterval(() => {
      if (this.dirty) {
        this.save();
      }
    }, 30000);
  }

  /**
   * Load state from disk
   */
  load() {
    try {
      if (fs.existsSync(STATE_PATH)) {
        const data = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
        // Merge with defaults to ensure all fields exist
        return {
          ...DEFAULT_STATE,
          ...data,
          session: { ...DEFAULT_STATE.session, ...data.session },
          context: { ...DEFAULT_STATE.context, ...data.context }
        };
      }
    } catch (e) {
      console.error("[SessionState] Failed to load:", e.message);
    }
    return { ...DEFAULT_STATE };
  }

  /**
   * Save state to disk
   */
  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      this.state.session.lastActivityAt = new Date().toISOString();
      fs.writeFileSync(STATE_PATH, JSON.stringify(this.state, null, 2));
      this.dirty = false;
    } catch (e) {
      console.error("[SessionState] Failed to save:", e.message);
    }
  }

  /**
   * Start or resume a session
   */
  startSession() {
    const now = new Date().toISOString();

    if (this.state.session.startedAt) {
      // Resuming existing session
      this.state.session.resumeCount++;
    } else {
      // New session
      this.state.session.startedAt = now;
    }

    this.state.session.lastActivityAt = now;
    this.dirty = true;
    this.save();

    return {
      isResume: this.state.session.resumeCount > 0,
      hasState: !!(this.state.mainObjective || this.state.currentGoal || this.state.recentActions.length > 0)
    };
  }

  /**
   * Set the main system objective
   */
  setMainObjective(objective) {
    this.state.mainObjective = objective;
    this.dirty = true;
  }

  /**
   * Get the main system objective
   */
  getMainObjective() {
    return this.state.mainObjective;
  }

  /**
   * Set the current goal being worked on
   */
  setCurrentGoal(goal) {
    this.state.currentGoal = goal;
    this.dirty = true;
  }

  /**
   * Get the current goal
   */
  getCurrentGoal() {
    return this.state.currentGoal;
  }

  /**
   * Record an action
   */
  recordAction(action) {
    const entry = {
      id: `action_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: action.type || "unknown",
      description: action.description || "",
      goal: action.goal || this.state.currentGoal?.title,
      result: action.result || null,
      metadata: action.metadata || {}
    };

    this.state.recentActions.unshift(entry);

    // Keep only last 50 actions
    if (this.state.recentActions.length > MAX_ACTIONS) {
      this.state.recentActions = this.state.recentActions.slice(0, MAX_ACTIONS);
    }

    this.state.session.actionCount++;
    this.dirty = true;

    return entry;
  }

  /**
   * Get recent actions
   */
  getRecentActions(limit = 50) {
    return this.state.recentActions.slice(0, limit);
  }

  /**
   * Set what the system is currently working on
   */
  setWorkingOn(task) {
    this.state.context.workingOn = task;
    this.dirty = true;
  }

  /**
   * Get what the system was working on
   */
  getWorkingOn() {
    return this.state.context.workingOn;
  }

  /**
   * Record the last query and response
   */
  recordInteraction(query, response) {
    this.state.context.lastQuery = query;
    this.state.context.lastResponse = typeof response === "string"
      ? response.slice(0, 500) // Truncate long responses
      : response;
    this.dirty = true;
  }

  /**
   * Add a pending task
   */
  addPendingTask(task) {
    this.state.context.pendingTasks.push({
      id: `task_${Date.now()}`,
      addedAt: new Date().toISOString(),
      ...task
    });
    this.dirty = true;
  }

  /**
   * Remove a pending task
   */
  removePendingTask(taskId) {
    this.state.context.pendingTasks = this.state.context.pendingTasks.filter(
      t => t.id !== taskId
    );
    this.dirty = true;
  }

  /**
   * Get pending tasks
   */
  getPendingTasks() {
    return this.state.context.pendingTasks;
  }

  /**
   * Get full session summary for resuming
   */
  getResumeSummary() {
    return {
      mainObjective: this.state.mainObjective,
      currentGoal: this.state.currentGoal,
      workingOn: this.state.context.workingOn,
      lastQuery: this.state.context.lastQuery,
      pendingTasks: this.state.context.pendingTasks,
      recentActions: this.state.recentActions.slice(0, 10), // Last 10 for summary
      session: {
        startedAt: this.state.session.startedAt,
        lastActivityAt: this.state.session.lastActivityAt,
        actionCount: this.state.session.actionCount,
        resumeCount: this.state.session.resumeCount
      }
    };
  }

  /**
   * Clear all state and start fresh
   */
  startFresh() {
    this.state = {
      ...DEFAULT_STATE,
      session: {
        ...DEFAULT_STATE.session,
        startedAt: new Date().toISOString()
      }
    };
    this.dirty = true;
    this.save();
    return true;
  }

  /**
   * Check if there's resumable state
   */
  hasResumableState() {
    return !!(
      this.state.mainObjective ||
      this.state.currentGoal ||
      this.state.context.workingOn ||
      this.state.recentActions.length > 0 ||
      this.state.context.pendingTasks.length > 0
    );
  }

  /**
   * Get session stats
   */
  getStats() {
    return {
      hasState: this.hasResumableState(),
      actionCount: this.state.session.actionCount,
      resumeCount: this.state.session.resumeCount,
      startedAt: this.state.session.startedAt,
      lastActivityAt: this.state.session.lastActivityAt
    };
  }

  /**
   * Cleanup on exit
   */
  cleanup() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    if (this.dirty) {
      this.save();
    }
  }
}

// Singleton instance
let instance = null;

export const getSessionState = () => {
  if (!instance) {
    instance = new SessionStateService();
  }
  return instance;
};

export const startFreshSession = () => {
  return getSessionState().startFresh();
};

export const recordAction = (action) => {
  return getSessionState().recordAction(action);
};

export const getResumeSummary = () => {
  return getSessionState().getResumeSummary();
};

export default SessionStateService;
