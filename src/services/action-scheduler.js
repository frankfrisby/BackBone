/**
 * Action Scheduler Service
 *
 * Manages scheduling and prioritization of autonomous actions.
 * Handles action queuing, dependencies, time-based execution,
 * and integration with the autonomous engine.
 *
 * Key Features:
 * - Priority-based action queue
 * - Scheduled (time-based) actions
 * - Action dependencies
 * - Recurring actions
 * - Project context tracking
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const DATA_DIR = path.join(process.cwd(), "data");
const SCHEDULER_STATE_PATH = path.join(DATA_DIR, "action-scheduler.json");

/**
 * Action priority levels
 */
export const ACTION_PRIORITY = {
  CRITICAL: 0,    // Execute immediately
  HIGH: 1,        // Execute as soon as possible
  NORMAL: 2,      // Standard priority
  LOW: 3,         // Execute when nothing else pending
  BACKGROUND: 4   // Run during idle time
};

/**
 * Action status
 */
export const ACTION_STATUS = {
  SCHEDULED: "scheduled",
  PENDING: "pending",
  BLOCKED: "blocked",
  EXECUTING: "executing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled"
};

/**
 * Recurrence patterns
 */
export const RECURRENCE = {
  NONE: null,
  HOURLY: "hourly",
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly"
};

/**
 * Create a new scheduled action
 */
export const createScheduledAction = ({
  id = null,
  type,
  tool,
  target,
  params = {},
  priority = ACTION_PRIORITY.NORMAL,
  goalId = null,
  projectId = null,
  scheduledFor = null,
  dependsOn = [],
  recurrence = null,
  metadata = {}
}) => ({
  id: id || `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  type,
  tool,
  target,
  params,
  priority,
  goalId,
  projectId,
  status: scheduledFor ? ACTION_STATUS.SCHEDULED : ACTION_STATUS.PENDING,
  scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
  dependsOn,
  recurrence,
  metadata,
  result: null,
  error: null,
  createdAt: new Date().toISOString(),
  startedAt: null,
  completedAt: null,
  attempts: 0,
  maxAttempts: 3
});

/**
 * Action Scheduler Class
 */
export class ActionScheduler extends EventEmitter {
  constructor() {
    super();
    this.actionQueue = [];
    this.scheduledActions = [];
    this.completedActions = [];
    this.blockedActions = [];
    this.currentAction = null;
    this.currentProject = null;
    this.currentGoal = null;
    this.schedulerInterval = null;
    this.running = false;

    this.loadState();
  }

  /**
   * Load scheduler state from disk
   */
  loadState() {
    try {
      if (fs.existsSync(SCHEDULER_STATE_PATH)) {
        const data = JSON.parse(fs.readFileSync(SCHEDULER_STATE_PATH, "utf-8"));
        this.actionQueue = data.actionQueue || [];
        this.scheduledActions = data.scheduledActions || [];
        this.completedActions = (data.completedActions || []).slice(0, 100);
        this.blockedActions = data.blockedActions || [];
        this.currentProject = data.currentProject || null;
        this.currentGoal = data.currentGoal || null;
      }
    } catch (error) {
      console.error("[ActionScheduler] Failed to load state:", error.message);
    }
  }

  /**
   * Save scheduler state to disk
   */
  saveState() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      const data = {
        actionQueue: this.actionQueue,
        scheduledActions: this.scheduledActions,
        completedActions: this.completedActions.slice(0, 100),
        blockedActions: this.blockedActions,
        currentProject: this.currentProject,
        currentGoal: this.currentGoal,
        savedAt: new Date().toISOString()
      };

      fs.writeFileSync(SCHEDULER_STATE_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("[ActionScheduler] Failed to save state:", error.message);
    }
  }

  /**
   * Set current context (goal and project)
   */
  setContext(goal, project = null) {
    const previousGoal = this.currentGoal;
    const previousProject = this.currentProject;

    this.currentGoal = goal;
    this.currentProject = project;

    this.saveState();

    this.emit("context-changed", {
      previousGoal,
      previousProject,
      currentGoal: goal,
      currentProject: project
    });
  }

  /**
   * Schedule an action
   */
  scheduleAction(action) {
    const scheduledAction = createScheduledAction({
      ...action,
      goalId: action.goalId || this.currentGoal?.id,
      projectId: action.projectId || this.currentProject?.name
    });

    if (scheduledAction.scheduledFor) {
      this.scheduledActions.push(scheduledAction);
      this.scheduledActions.sort((a, b) =>
        new Date(a.scheduledFor) - new Date(b.scheduledFor)
      );
    } else if (this.areDependenciesMet(scheduledAction)) {
      this.addToQueue(scheduledAction);
    } else {
      scheduledAction.status = ACTION_STATUS.BLOCKED;
      this.blockedActions.push(scheduledAction);
    }

    this.saveState();
    this.emit("action-scheduled", scheduledAction);

    return scheduledAction;
  }

  /**
   * Add action to the priority queue
   */
  addToQueue(action) {
    action.status = ACTION_STATUS.PENDING;
    this.actionQueue.push(action);

    // Sort by priority (lower number = higher priority)
    this.actionQueue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Same priority: FIFO
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
  }

  /**
   * Check if action dependencies are met
   */
  areDependenciesMet(action) {
    if (!action.dependsOn || action.dependsOn.length === 0) {
      return true;
    }

    return action.dependsOn.every(depId => {
      const completed = this.completedActions.find(a => a.id === depId);
      return completed && completed.status === ACTION_STATUS.COMPLETED;
    });
  }

  /**
   * Get next action to execute
   */
  getNextAction() {
    // Check scheduled actions first
    const now = new Date();
    for (let i = 0; i < this.scheduledActions.length; i++) {
      const action = this.scheduledActions[i];
      if (new Date(action.scheduledFor) <= now) {
        this.scheduledActions.splice(i, 1);
        if (this.areDependenciesMet(action)) {
          return action;
        } else {
          action.status = ACTION_STATUS.BLOCKED;
          this.blockedActions.push(action);
        }
      }
    }

    // Then check priority queue
    if (this.actionQueue.length > 0) {
      return this.actionQueue.shift();
    }

    return null;
  }

  /**
   * Execute action and track result
   */
  async executeAction(action, executor) {
    this.currentAction = action;
    action.status = ACTION_STATUS.EXECUTING;
    action.startedAt = new Date().toISOString();
    action.attempts++;

    this.emit("action-started", action);

    try {
      const result = await executor(action);

      action.status = ACTION_STATUS.COMPLETED;
      action.completedAt = new Date().toISOString();
      action.result = result;

      this.completedActions.unshift(action);
      this.completedActions = this.completedActions.slice(0, 100);

      // Handle recurrence
      if (action.recurrence) {
        this.scheduleRecurrence(action);
      }

      // Check blocked actions
      this.checkBlockedActions(action.id);

      this.emit("action-completed", action);

    } catch (error) {
      action.error = error.message;

      if (action.attempts < action.maxAttempts) {
        // Retry later
        action.status = ACTION_STATUS.PENDING;
        action.priority = Math.max(0, action.priority - 1); // Increase priority for retry
        this.addToQueue(action);
        this.emit("action-retry", action);
      } else {
        action.status = ACTION_STATUS.FAILED;
        action.completedAt = new Date().toISOString();
        this.completedActions.unshift(action);
        this.emit("action-failed", action);
      }
    }

    this.currentAction = null;
    this.saveState();

    return action;
  }

  /**
   * Schedule recurrence of completed action
   */
  scheduleRecurrence(action) {
    const nextRun = this.calculateNextRun(action.recurrence);
    if (!nextRun) return;

    const recurringAction = createScheduledAction({
      ...action,
      id: null, // Generate new ID
      scheduledFor: nextRun,
      status: ACTION_STATUS.SCHEDULED,
      result: null,
      error: null,
      attempts: 0,
      startedAt: null,
      completedAt: null
    });

    this.scheduledActions.push(recurringAction);
    this.scheduledActions.sort((a, b) =>
      new Date(a.scheduledFor) - new Date(b.scheduledFor)
    );

    this.emit("action-rescheduled", recurringAction);
  }

  /**
   * Calculate next run time for recurrence
   */
  calculateNextRun(recurrence) {
    const now = new Date();

    switch (recurrence) {
      case RECURRENCE.HOURLY:
        return new Date(now.getTime() + 60 * 60 * 1000);
      case RECURRENCE.DAILY:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case RECURRENCE.WEEKLY:
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case RECURRENCE.MONTHLY:
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return nextMonth;
      default:
        return null;
    }
  }

  /**
   * Check blocked actions after an action completes
   */
  checkBlockedActions(completedActionId) {
    const stillBlocked = [];

    for (const action of this.blockedActions) {
      if (this.areDependenciesMet(action)) {
        this.addToQueue(action);
        this.emit("action-unblocked", action);
      } else {
        stillBlocked.push(action);
      }
    }

    this.blockedActions = stillBlocked;
  }

  /**
   * Cancel an action
   */
  cancelAction(actionId) {
    // Check queue
    let idx = this.actionQueue.findIndex(a => a.id === actionId);
    if (idx !== -1) {
      const action = this.actionQueue.splice(idx, 1)[0];
      action.status = ACTION_STATUS.CANCELLED;
      this.completedActions.unshift(action);
      this.saveState();
      this.emit("action-cancelled", action);
      return action;
    }

    // Check scheduled
    idx = this.scheduledActions.findIndex(a => a.id === actionId);
    if (idx !== -1) {
      const action = this.scheduledActions.splice(idx, 1)[0];
      action.status = ACTION_STATUS.CANCELLED;
      this.completedActions.unshift(action);
      this.saveState();
      this.emit("action-cancelled", action);
      return action;
    }

    // Check blocked
    idx = this.blockedActions.findIndex(a => a.id === actionId);
    if (idx !== -1) {
      const action = this.blockedActions.splice(idx, 1)[0];
      action.status = ACTION_STATUS.CANCELLED;
      this.completedActions.unshift(action);
      this.saveState();
      this.emit("action-cancelled", action);
      return action;
    }

    return null;
  }

  /**
   * Clear all actions for a goal
   */
  clearGoalActions(goalId) {
    this.actionQueue = this.actionQueue.filter(a => a.goalId !== goalId);
    this.scheduledActions = this.scheduledActions.filter(a => a.goalId !== goalId);
    this.blockedActions = this.blockedActions.filter(a => a.goalId !== goalId);
    this.saveState();
    this.emit("goal-actions-cleared", goalId);
  }

  /**
   * Clear all actions for a project
   */
  clearProjectActions(projectId) {
    this.actionQueue = this.actionQueue.filter(a => a.projectId !== projectId);
    this.scheduledActions = this.scheduledActions.filter(a => a.projectId !== projectId);
    this.blockedActions = this.blockedActions.filter(a => a.projectId !== projectId);
    this.saveState();
    this.emit("project-actions-cleared", projectId);
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queuedCount: this.actionQueue.length,
      scheduledCount: this.scheduledActions.length,
      blockedCount: this.blockedActions.length,
      completedCount: this.completedActions.length,
      currentAction: this.currentAction,
      currentGoal: this.currentGoal,
      currentProject: this.currentProject,
      nextScheduled: this.scheduledActions[0]?.scheduledFor || null
    };
  }

  /**
   * Get pending actions
   */
  getPendingActions() {
    return {
      queued: this.actionQueue.slice(0, 10),
      scheduled: this.scheduledActions.slice(0, 10),
      blocked: this.blockedActions.slice(0, 10)
    };
  }

  /**
   * Get completed actions
   */
  getCompletedActions(limit = 10) {
    return this.completedActions.slice(0, limit);
  }

  /**
   * Start the scheduler loop
   */
  start(executor, intervalMs = 1000) {
    if (this.running) return;

    this.running = true;
    this.emit("started");

    this.schedulerInterval = setInterval(async () => {
      if (this.currentAction) return; // Already executing

      const nextAction = this.getNextAction();
      if (nextAction) {
        await this.executeAction(nextAction, executor);
      }
    }, intervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop() {
    this.running = false;

    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }

    this.emit("stopped");
  }

  /**
   * Reset the scheduler
   */
  reset() {
    this.stop();
    this.actionQueue = [];
    this.scheduledActions = [];
    this.completedActions = [];
    this.blockedActions = [];
    this.currentAction = null;

    try {
      if (fs.existsSync(SCHEDULER_STATE_PATH)) {
        fs.unlinkSync(SCHEDULER_STATE_PATH);
      }
    } catch (error) {
      // Ignore
    }

    this.emit("reset");
  }
}

// Singleton instance
let schedulerInstance = null;

export const getActionScheduler = () => {
  if (!schedulerInstance) {
    schedulerInstance = new ActionScheduler();
  }
  return schedulerInstance;
};

export default ActionScheduler;
