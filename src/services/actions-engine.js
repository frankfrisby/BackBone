import fs from "fs";
import path from "path";

/**
 * Actions Engine for BACKBONE
 * Manages the queue of actions the system will take
 */

const DATA_DIR = path.join(process.cwd(), "data");
const ACTIONS_PATH = path.join(DATA_DIR, "actions-queue.json");

// Action statuses
export const ACTION_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled"
};

// Action types
export const ACTION_TYPES = {
  SYNC_PORTFOLIO: "sync_portfolio",
  SYNC_HEALTH: "sync_health",
  SYNC_LINKEDIN: "sync_linkedin",
  ANALYZE_TICKERS: "analyze_tickers",
  EVALUATE_TRADES: "evaluate_trades",
  EXECUTE_TRADE: "execute_trade",
  SAVE_MEMORY: "save_memory",
  CLOUD_SYNC: "cloud_sync",
  REFRESH_QUOTES: "refresh_quotes",
  CHECK_ALERTS: "check_alerts",
  UPDATE_SCORES: "update_scores",
  FETCH_NEWS: "fetch_news",
  PROCESS_MESSAGE: "process_message",
  // AI-generated action types
  AI_RESEARCH: "ai_research",
  AI_EXECUTE: "ai_execute",
  AI_ANALYZE: "ai_analyze",
  AI_COMMUNICATE: "ai_communicate",
  AI_PLAN: "ai_plan",
  AI_HEALTH: "ai_health",
  AI_FAMILY: "ai_family"
};

// Action display names
const ACTION_NAMES = {
  [ACTION_TYPES.SYNC_PORTFOLIO]: "Syncing portfolio data",
  [ACTION_TYPES.SYNC_HEALTH]: "Syncing health metrics",
  [ACTION_TYPES.SYNC_LINKEDIN]: "Syncing LinkedIn profile",
  [ACTION_TYPES.ANALYZE_TICKERS]: "Analyzing ticker signals",
  [ACTION_TYPES.EVALUATE_TRADES]: "Evaluating trade opportunities",
  [ACTION_TYPES.EXECUTE_TRADE]: "Executing trade",
  [ACTION_TYPES.SAVE_MEMORY]: "Saving to memory",
  [ACTION_TYPES.CLOUD_SYNC]: "Syncing to cloud",
  [ACTION_TYPES.REFRESH_QUOTES]: "Refreshing quotes",
  [ACTION_TYPES.CHECK_ALERTS]: "Checking alerts",
  [ACTION_TYPES.UPDATE_SCORES]: "Updating scores",
  [ACTION_TYPES.FETCH_NEWS]: "Fetching market news",
  [ACTION_TYPES.PROCESS_MESSAGE]: "Processing message",
  // AI-generated action names
  [ACTION_TYPES.AI_RESEARCH]: "AI researching",
  [ACTION_TYPES.AI_EXECUTE]: "AI executing task",
  [ACTION_TYPES.AI_ANALYZE]: "AI analyzing data",
  [ACTION_TYPES.AI_COMMUNICATE]: "AI communicating",
  [ACTION_TYPES.AI_PLAN]: "AI planning",
  [ACTION_TYPES.AI_HEALTH]: "AI health task",
  [ACTION_TYPES.AI_FAMILY]: "AI family task"
};

/**
 * Default actions queue
 */
const getDefaultQueue = () => ({
  current: null,
  queue: [],
  history: [],
  lastUpdated: new Date().toISOString()
});

/**
 * Load actions queue from disk
 */
export const loadActionsQueue = () => {
  try {
    if (fs.existsSync(ACTIONS_PATH)) {
      return JSON.parse(fs.readFileSync(ACTIONS_PATH, "utf-8"));
    }
  } catch (error) {
    console.error("Failed to load actions queue:", error.message);
  }
  return getDefaultQueue();
};

/**
 * Save actions queue to disk
 */
export const saveActionsQueue = (queue) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(ACTIONS_PATH, JSON.stringify(queue, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save actions queue:", error.message);
    return false;
  }
};

/**
 * Create a new action
 */
export const createAction = (type, details = {}) => ({
  id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  type,
  name: ACTION_NAMES[type] || type,
  status: ACTION_STATUS.PENDING,
  details,
  createdAt: new Date().toISOString(),
  startedAt: null,
  completedAt: null,
  result: null,
  error: null
});

/**
 * Add action to queue
 */
export const queueAction = (type, details = {}, priority = false) => {
  const queue = loadActionsQueue();
  const action = createAction(type, details);

  if (priority) {
    queue.queue.unshift(action);
  } else {
    queue.queue.push(action);
  }

  queue.lastUpdated = new Date().toISOString();
  saveActionsQueue(queue);
  return action;
};

/**
 * Start next action in queue
 */
export const startNextAction = () => {
  const queue = loadActionsQueue();

  // If there's already an active action, don't start another
  if (queue.current && queue.current.status === ACTION_STATUS.ACTIVE) {
    return queue.current;
  }

  // Get next action from queue
  if (queue.queue.length === 0) {
    return null;
  }

  const nextAction = queue.queue.shift();
  nextAction.status = ACTION_STATUS.ACTIVE;
  nextAction.startedAt = new Date().toISOString();

  queue.current = nextAction;
  queue.lastUpdated = new Date().toISOString();
  saveActionsQueue(queue);

  return nextAction;
};

/**
 * Complete current action
 */
export const completeAction = (result = null) => {
  const queue = loadActionsQueue();

  if (!queue.current) {
    return null;
  }

  queue.current.status = ACTION_STATUS.COMPLETED;
  queue.current.completedAt = new Date().toISOString();
  queue.current.result = result;

  // Move to history (keep last 20)
  queue.history.unshift(queue.current);
  queue.history = queue.history.slice(0, 20);

  queue.current = null;
  queue.lastUpdated = new Date().toISOString();
  saveActionsQueue(queue);

  return queue.history[0];
};

/**
 * Fail current action
 */
export const failAction = (error) => {
  const queue = loadActionsQueue();

  if (!queue.current) {
    return null;
  }

  queue.current.status = ACTION_STATUS.FAILED;
  queue.current.completedAt = new Date().toISOString();
  queue.current.error = error;

  // Move to history
  queue.history.unshift(queue.current);
  queue.history = queue.history.slice(0, 20);

  queue.current = null;
  queue.lastUpdated = new Date().toISOString();
  saveActionsQueue(queue);

  return queue.history[0];
};

/**
 * Get actions display data for UI
 */
export const getActionsDisplay = () => {
  const queue = loadActionsQueue();

  // Current active action
  const active = queue.current;

  // Next actions (up to 3)
  const upcoming = queue.queue.slice(0, 3);

  return {
    active: active ? {
      id: active.id,
      name: active.name,
      type: active.type,
      status: active.status,
      startedAt: active.startedAt,
      details: active.details
    } : null,
    next: upcoming.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type
    })),
    queueLength: queue.queue.length,
    historyLength: queue.history.length
  };
};

/**
 * Initialize default actions queue for system startup
 */
export const initializeDefaultActions = () => {
  const queue = loadActionsQueue();

  // Only initialize if queue is empty
  if (queue.queue.length === 0 && !queue.current) {
    // Add default startup actions
    const defaultActions = [
      { type: ACTION_TYPES.SYNC_PORTFOLIO, details: { source: "startup" } },
      { type: ACTION_TYPES.REFRESH_QUOTES, details: { source: "startup" } },
      { type: ACTION_TYPES.ANALYZE_TICKERS, details: { source: "startup" } },
      { type: ACTION_TYPES.SYNC_HEALTH, details: { source: "startup" } },
      { type: ACTION_TYPES.CHECK_ALERTS, details: { source: "startup" } }
    ];

    defaultActions.forEach(({ type, details }) => {
      queueAction(type, details);
    });
  }

  return queue;
};

/**
 * Clear all actions
 */
export const clearActions = () => {
  const queue = getDefaultQueue();
  saveActionsQueue(queue);
  return queue;
};

/**
 * Add periodic actions based on time
 */
export const schedulePeriodicActions = () => {
  const queue = loadActionsQueue();
  const now = new Date();

  // Check what actions should be scheduled
  const actions = [];

  // Every 5 seconds - refresh quotes (if market open)
  const marketOpen = isMarketHours(now);
  if (marketOpen) {
    const hasQuoteAction = queue.queue.some(a => a.type === ACTION_TYPES.REFRESH_QUOTES);
    if (!hasQuoteAction) {
      actions.push({ type: ACTION_TYPES.REFRESH_QUOTES, details: { periodic: true } });
    }
  }

  // Every 30 seconds - update scores
  const hasScoreAction = queue.queue.some(a => a.type === ACTION_TYPES.UPDATE_SCORES);
  if (!hasScoreAction) {
    actions.push({ type: ACTION_TYPES.UPDATE_SCORES, details: { periodic: true } });
  }

  // Queue the actions
  actions.forEach(({ type, details }) => {
    queueAction(type, details);
  });

  return actions;
};

/**
 * Check if current time is market hours
 */
const isMarketHours = (date = new Date()) => {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  return timeInMinutes >= 570 && timeInMinutes < 960; // 9:30am - 4:00pm
};
