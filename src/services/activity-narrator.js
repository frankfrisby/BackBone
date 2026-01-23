/**
 * Activity Narrator - Uses LLM to generate realistic activity descriptions
 *
 * Instead of generic "Working..." messages, this generates contextual
 * descriptions of what the agent is actually doing and why.
 */

import { EventEmitter } from "events";

// Action types with their display formats
export const ACTION_TYPES = {
  // File operations
  READ: { icon: "→", verb: "Reading", color: "#3b82f6" },
  WRITE: { icon: "→", verb: "Writing", color: "#22c55e" },
  UPDATE: { icon: "→", verb: "Update", color: "#f59e0b" },
  DELETE: { icon: "→", verb: "Delete", color: "#ef4444" },

  // Search operations
  SEARCH: { icon: "⌕", verb: "Search", color: "#8b5cf6" },
  GREP: { icon: "⌕", verb: "Grep", color: "#8b5cf6" },
  GLOB: { icon: "⌕", verb: "Glob", color: "#8b5cf6" },
  WEB_SEARCH: { icon: "◎", verb: "WebSearch", color: "#06b6d4" },
  WEB_FETCH: { icon: "↓", verb: "WebFetch", color: "#06b6d4" },

  // System operations
  BASH: { icon: "$", verb: "Bash", color: "#64748b" },
  MKDIR: { icon: "+", verb: "MkDir", color: "#22c55e" },
  COPY: { icon: "⎘", verb: "Copy", color: "#3b82f6" },
  MOVE: { icon: "→", verb: "Move", color: "#f59e0b" },

  // AI operations
  THINK: { icon: "◐", verb: "Think", color: "#a855f7" },
  PLAN: { icon: "◇", verb: "Plan", color: "#ec4899" },
  ANALYZE: { icon: "◈", verb: "Analyze", color: "#6366f1" },

  // Data operations
  FETCH: { icon: "↓", verb: "Fetch", color: "#14b8a6" },
  SYNC: { icon: "↻", verb: "Sync", color: "#0ea5e9" },
  SAVE: { icon: "●", verb: "Save", color: "#22c55e" },
};

// Agent states with shimmer descriptions
export const AGENT_STATES = {
  RESEARCHING: { text: "Researching", color: "#8b5cf6" },
  WORKING: { text: "Working", color: "#3b82f6" },
  BUILDING: { text: "Building", color: "#22c55e" },
  THINKING: { text: "Thinking", color: "#a855f7" },
  REFLECTING: { text: "Reflecting", color: "#ec4899" },
  TESTING: { text: "Testing", color: "#f59e0b" },
  PLANNING: { text: "Planning", color: "#06b6d4" },
  ANALYZING: { text: "Analyzing", color: "#6366f1" },
  CONNECTING: { text: "Connecting", color: "#14b8a6" },
  OBSERVING: { text: "Observing", color: "#64748b" },
};

class ActivityNarrator extends EventEmitter {
  constructor() {
    super();
    this.currentState = "OBSERVING";
    this.currentGoal = null;
    this.actions = [];
    this.subActions = [];
    this.observations = [];
    this.diffs = [];
    this.maxActions = 5;
    this.maxObservations = 3;
  }

  /**
   * Set the main goal the agent is working towards
   */
  setGoal(goal) {
    this.currentGoal = goal;
    this.emit("goal-changed", goal);
    this.emitUpdate();
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
   * Log a main action (e.g., Update, Search, WebSearch)
   */
  action(type, target, detail = null) {
    const actionType = ACTION_TYPES[type] || ACTION_TYPES.BASH;
    const action = {
      id: `act_${Date.now()}`,
      type,
      target,
      detail,
      ...actionType,
      timestamp: Date.now()
    };

    this.actions.unshift(action);
    if (this.actions.length > this.maxActions) {
      this.actions = this.actions.slice(0, this.maxActions);
    }

    this.emit("action", action);
    this.emitUpdate();
    return action.id;
  }

  /**
   * Log a sub-action (e.g., Bash, MkDir, Copy)
   */
  subAction(type, target, detail = null) {
    const actionType = ACTION_TYPES[type] || ACTION_TYPES.BASH;
    const sub = {
      id: `sub_${Date.now()}`,
      type,
      target,
      detail,
      ...actionType,
      timestamp: Date.now()
    };

    this.subActions.unshift(sub);
    if (this.subActions.length > this.maxActions) {
      this.subActions = this.subActions.slice(0, this.maxActions);
    }

    this.emit("sub-action", sub);
    this.emitUpdate();
  }

  /**
   * Add an observation (what the agent learned/noticed)
   */
  observe(text, context = null) {
    const obs = {
      id: `obs_${Date.now()}`,
      text,
      context,
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
   */
  addDiff(file, lineNumber, oldText, newText) {
    const diff = {
      id: `diff_${Date.now()}`,
      file,
      lineNumber,
      oldText,
      newText,
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
   * Get display data for UI
   */
  getDisplayData() {
    return {
      state: this.currentState,
      stateInfo: AGENT_STATES[this.currentState] || AGENT_STATES.OBSERVING,
      goal: this.currentGoal,
      actions: this.actions.slice(0, 3),
      subActions: this.subActions.slice(0, 2),
      observations: this.observations.slice(0, 2),
      diffs: this.diffs.slice(0, 2)
    };
  }

  /**
   * Emit update event
   */
  emitUpdate() {
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
    this.currentState = "OBSERVING";
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
