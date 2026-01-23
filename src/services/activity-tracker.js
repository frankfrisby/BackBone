import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { getActivityNarrator, AGENT_STATES, ACTION_TYPES } from "./activity-narrator.js";

/**
 * Activity Tracker - Tracks agent activities for display
 * Now integrates with ActivityNarrator for Claude Code-style updates
 */

const DATA_DIR = path.join(process.cwd(), "data");
const ACTIVITY_LOG_PATH = path.join(DATA_DIR, "activity-log.json");

// Activity statuses
export const ACTIVITY_STATUS = {
  WORKING: "working",
  COMPLETED: "completed",
  ERROR: "error",
  OBSERVATION: "observation"
};

// Action verbs for display
export const ACTION_VERBS = {
  // Analysis
  analyzing: "Analyzing",
  researching: "Researching",
  evaluating: "Evaluating",
  scanning: "Scanning",
  checking: "Checking",

  // Updates
  updating: "Updating",
  syncing: "Syncing",
  refreshing: "Refreshing",
  loading: "Loading",
  fetching: "Fetching",

  // Planning
  planning: "Planning",
  thinking: "Thinking",
  considering: "Considering",
  deciding: "Deciding",

  // Execution
  executing: "Executing",
  running: "Running",
  processing: "Processing",
  building: "Building",
  creating: "Creating",

  // Communication
  connecting: "Connecting",
  sending: "Sending",
  receiving: "Receiving",

  // Observation
  observing: "Observing",
  monitoring: "Monitoring",
  watching: "Watching",

  // System
  starting: "Starting",
  initializing: "Initializing",
  ready: "Ready",
  idle: "Idle",
  waiting: "Waiting"
};

class ActivityTracker extends EventEmitter {
  constructor() {
    super();
    this.activities = [];
    this.maxActivities = 100;
    this.currentState = "idle";
    this.stateDetail = null;
    this.cycleCount = 0;
    this.isRunning = false;
    this.load();
  }

  /**
   * Log a new activity
   */
  log(action, target = null, status = ACTIVITY_STATUS.WORKING) {
    const verb = ACTION_VERBS[action?.toLowerCase()] || this.titleCase(action);

    const activity = {
      id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      action,
      text: verb,
      target,
      status,
      timestamp: new Date().toISOString()
    };

    this.activities.unshift(activity);

    // Trim to max
    if (this.activities.length > this.maxActivities) {
      this.activities = this.activities.slice(0, this.maxActivities);
    }

    this.save();
    this.emit("activity", activity);
    this.emit("updated", this.getDisplayData());

    return activity.id;
  }

  /**
   * Update an existing activity's status
   */
  updateStatus(activityId, status) {
    const activity = this.activities.find(a => a.id === activityId);
    if (activity) {
      activity.status = status;
      activity.updatedAt = new Date().toISOString();
      this.save();
      this.emit("updated", this.getDisplayData());
    }
  }

  /**
   * Mark activity as completed
   */
  complete(activityId) {
    this.updateStatus(activityId, ACTIVITY_STATUS.COMPLETED);
  }

  /**
   * Mark activity as error
   */
  error(activityId, errorMsg = null) {
    const activity = this.activities.find(a => a.id === activityId);
    if (activity) {
      activity.status = ACTIVITY_STATUS.ERROR;
      activity.error = errorMsg;
      activity.updatedAt = new Date().toISOString();
      this.save();
      this.emit("updated", this.getDisplayData());
    }
  }

  /**
   * Add an observation (white dot)
   */
  observe(message, target = null) {
    return this.log("observing", target || message, ACTIVITY_STATUS.OBSERVATION);
  }

  /**
   * Set current state (shown at bottom with shimmer)
   */
  setState(state, detail = null) {
    this.currentState = state;
    this.stateDetail = detail;
    this.emit("state-changed", { state, detail });
    this.emit("updated", this.getDisplayData());
  }

  /**
   * Increment cycle count
   */
  incrementCycle() {
    this.cycleCount++;
    this.emit("cycle", this.cycleCount);
    this.emit("updated", this.getDisplayData());
  }

  /**
   * Set running state
   */
  setRunning(running) {
    this.isRunning = running;
    if (running) {
      this.log("starting", "Agent engine", ACTIVITY_STATUS.WORKING);
      this.setState("starting", "Initializing autonomous engine...");
    } else {
      this.log("idle", "Agent stopped", ACTIVITY_STATUS.OBSERVATION);
      this.setState("idle", null);
    }
    this.emit("running-changed", running);
    this.emit("updated", this.getDisplayData());
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      activities: this.activities.slice(0, 20),
      currentState: this.currentState,
      stateDetail: this.stateDetail,
      cycleCount: this.cycleCount,
      isRunning: this.isRunning
    };
  }

  /**
   * Get recent activities
   */
  getRecent(count = 10) {
    return this.activities.slice(0, count);
  }

  /**
   * Save to disk
   */
  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(ACTIVITY_LOG_PATH, JSON.stringify({
        activities: this.activities.slice(0, 50), // Only persist last 50
        cycleCount: this.cycleCount
      }, null, 2));
    } catch (err) {
      // Ignore save errors
    }
  }

  /**
   * Load from disk
   */
  load() {
    try {
      if (fs.existsSync(ACTIVITY_LOG_PATH)) {
        const data = JSON.parse(fs.readFileSync(ACTIVITY_LOG_PATH, "utf-8"));
        this.activities = data.activities || [];
        this.cycleCount = data.cycleCount || 0;
      }
    } catch (err) {
      this.activities = [];
      this.cycleCount = 0;
    }
  }

  /**
   * Clear all activities
   */
  clear() {
    this.activities = [];
    this.cycleCount = 0;
    this.save();
    this.emit("updated", this.getDisplayData());
  }

  /**
   * Helper to title case a string
   */
  titleCase(str) {
    if (!str) return "Action";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLAUDE CODE STYLE METHODS - For realistic activity display
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the narrator for Claude Code-style updates
   */
  getNarrator() {
    return getActivityNarrator();
  }

  /**
   * Set the current goal the agent is working towards
   */
  setGoal(goal) {
    const narrator = this.getNarrator();
    narrator.setGoal(goal);
  }

  /**
   * Log a main action (Read, Update, Search, WebSearch, etc.)
   */
  action(type, target, detail = null) {
    const narrator = this.getNarrator();
    narrator.action(type, target, detail);
    // Also log to legacy system
    this.log(type.toLowerCase(), target, ACTIVITY_STATUS.WORKING);
  }

  /**
   * Log a sub-action (Bash, MkDir, Copy, etc.)
   */
  subAction(type, target, detail = null) {
    const narrator = this.getNarrator();
    narrator.subAction(type, target, detail);
  }

  /**
   * Add an observation (what the agent learned)
   */
  addObservation(text, context = null) {
    const narrator = this.getNarrator();
    narrator.observe(text, context);
    // Also log to legacy
    this.log("observing", text, ACTIVITY_STATUS.OBSERVATION);
  }

  /**
   * Add a diff (file change with line numbers)
   */
  addDiff(file, lineNumber, oldText, newText) {
    const narrator = this.getNarrator();
    narrator.addDiff(file, lineNumber, oldText, newText);
  }

  /**
   * Set the agent state with Claude Code-style states
   */
  setAgentState(state) {
    const narrator = this.getNarrator();
    narrator.setState(state);
    // Map to legacy state
    const stateMap = {
      RESEARCHING: "researching",
      WORKING: "working",
      BUILDING: "building",
      THINKING: "thinking",
      REFLECTING: "reflecting",
      TESTING: "testing",
      PLANNING: "planning",
      ANALYZING: "analyzing",
      CONNECTING: "connecting",
      OBSERVING: "idle"
    };
    this.setState(stateMap[state] || "working", null);
  }
}

// Singleton instance
let trackerInstance = null;

export const getActivityTracker = () => {
  if (!trackerInstance) {
    trackerInstance = new ActivityTracker();
  }
  return trackerInstance;
};

export default ActivityTracker;
