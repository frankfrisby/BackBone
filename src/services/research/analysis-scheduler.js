import fs from "fs";
import path from "path";
import { getDataDir } from "../paths.js";
import {
  createAIAction,
  AI_ACTION_TYPES,
  EXECUTION_TOOLS,
  saveEngineState
} from "../engine/autonomous-engine.js";

const DATA_DIR = getDataDir();
const STATE_PATH = path.join(DATA_DIR, "analysis-scheduler.json");
const LOG_PATH = path.join(DATA_DIR, "evaluation-history.md");

const ensureDataDirectory = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const getDefaultState = () => ({
  lastRuns: {},
  history: []
});

const loadState = () => {
  try {
    ensureDataDirectory();
    if (fs.existsSync(STATE_PATH)) {
      const raw = fs.readFileSync(STATE_PATH, "utf-8");
      return { ...getDefaultState(), ...JSON.parse(raw) };
    }
  } catch (error) {
    console.error("[AnalysisScheduler] Failed to load state:", error.message);
  }
  return getDefaultState();
};

const saveState = (state) => {
  try {
    ensureDataDirectory();
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    return true;
  } catch (error) {
    console.error("[AnalysisScheduler] Failed to save state:", error.message);
    return false;
  }
};

const shouldRunDomain = (state, domain, intervalMs = 0) => {
  if (!intervalMs) return true;
  const last = state.lastRuns[domain];
  if (!last) return true;
  return Date.now() - new Date(last).getTime() >= intervalMs;
};

const recordDomainRun = (state, domain) => {
  if (!domain) return;
  state.lastRuns[domain] = new Date().toISOString();
};

const appendEvaluationLog = (actions = []) => {
  ensureDataDirectory();
  const now = new Date().toISOString();
  const entry = `[${now}] queued: ${actions.map((a) => a.title).join("; ") || "none"}`;
  try {
    fs.appendFileSync(LOG_PATH, entry + "\n");
  } catch (error) {
    console.error("[AnalysisScheduler] Failed to append log:", error.message);
  }
};

const formatTickers = (tickers = []) => {
  return tickers.slice(0, 5).map((t) => `${t.symbol} (${Math.round(t.score) || 0})`).join(", ") || "no tickers in view";
};

const formatGoals = (goals = []) => {
  return goals.slice(0, 4).map((goal) => `${goal.title || "Goal"} (${Math.round((goal.progress || 0) * 100)}%)`).join("; ") || "no active goals";
};

const buildEvaluationActions = (context = {}, state) => {
  const { tickers = [], portfolio = {}, oura = {}, profile = {}, linkedIn = {}, goals = [], emails = {}, projects = [] } = context;
  const actions = [];

  // Research stock tickers
  actions.push({
    domain: "stocks",
    title: "Research stock market tickers",
    type: AI_ACTION_TYPES.RESEARCH,
    description: "Collect fresh catalysts and risks for key tickers in the user's stream.",
    prompt: `Backbone, research these tickers: ${formatTickers(tickers)}.
Focus on macro headwinds, earnings expectations, and technical breakouts.
Explain how these fit the user's portfolio (${portfolio?.equity ? `$${portfolio.equity.toLocaleString()}` : "no portfolio loaded"}). 
Wrap findings in markdown with headers, bullets, and a "Next steps" section.
Update projects/finance.md with the takeaways, noting any suggested actions and watchlist items.`,
    intervalMs: 0
  });

  // Research news
  actions.push({
    domain: "news",
    title: "Research topical news",
    type: AI_ACTION_TYPES.RESEARCH,
    description: "Scan the latest headlines that could impact the user's financial or product focus.",
    prompt: `Scan current news and summarize 3 stories (market-moving, personal industry, or goal-related). 
Prioritize relevance to ${tickers.length ? "tickers " + formatTickers(tickers) : "user interests"} and any ongoing projects.
Provide the summary in markdown, link to source handle, and end with "Implication for user" actionable notes.`,
    intervalMs: 0
  });

  // Research user profile (LinkedIn weekly)
  if (shouldRunDomain(state, "userProfile", 7 * 24 * 60 * 60 * 1000)) {
    const summaryPieces = [
      profile?.name,
      linkedIn?.headline,
      linkedIn?.company,
      linkedIn?.summary
    ].filter(Boolean).join("; ");
    actions.push({
      domain: "userProfile",
      title: "Research the user profile",
      type: AI_ACTION_TYPES.RESEARCH,
      description: "Update the user story, career focus, and goals.",
      prompt: `Gather details about the user from linked data (${summaryPieces || "no profile data"}). 
Document strengths, current focus, and sentiment toward work/family/health.
Produce a tidy markdown biography placed under projects/life.md (title, job, wins, next moves).
Highlight what changed since the previous snapshot and include a changelog of modifications.`,
      intervalMs: 7 * 24 * 60 * 60 * 1000
    });
  }

  // Analyze tickers
  actions.push({
    domain: "tickerAnalysis",
    title: "Analyze current tickers",
    type: AI_ACTION_TYPES.ANALYZE,
    description: "Review price action, scores, and portfolio weight.",
    prompt: `Analyze the signals for ${formatTickers(tickers)} and contrast with the portfolio (${portfolio?.equity ? `equity $${portfolio.equity.toLocaleString()}` : "not connected"}). 
Highlight imbalances, risk levels, and any speculative positions needing attention.
Render comparison table in markdown and attach a "<score> vs benchmark" summary for context.`,
    intervalMs: 0
  });

  // Analyze emails
  actions.push({
    domain: "emailAnalysis",
    title: "Analyze recent email activity",
    type: AI_ACTION_TYPES.ANALYZE,
    description: "Surface priorities from emails in the last five days.",
    prompt: `Given ${emails?.total ?? 0} total emails (${emails?.unread ?? 0} unread) and providers ${emails?.providers?.join(", ") || "unknown"}, 
rank the most important threads or senders from the last 5 days, noting required replies, deadlines, or risks.
Summarize as markdown with "High attention", "Watch", and "Archived" sections and log updates to projects/communications.md.`,
    intervalMs: 0
  });

  // Analyze Oura health (if available)
  if (oura?.connected) {
    actions.push({
      domain: "health",
      title: "Analyze Oura health data",
      type: AI_ACTION_TYPES.HEALTH,
      description: "Interpret readiness, sleep, and activity readings.",
      prompt: `Review the Oura stats (sleep ${oura?.today?.sleepScore || "N/A"}, readiness ${oura?.today?.readinessScore || "N/A"}, activity ${oura?.today?.activityScore || "N/A"}).
Note trends in stress, recovery, and movement from the past 30 days.
Craft a wellness narrative in markdown, include precise actions (e.g., hydration, movement, rest), and append to projects/health.md.`,
      intervalMs: 0
    });
  }

  return actions;
};

export const runUserEvaluationCycle = (engine, context = {}) => {
  const state = loadState();
  const actions = buildEvaluationActions(context, state);
  const existingTitles = new Set([
    ...(engine.state.proposedActions || []).map((a) => a.title),
    ...(engine.state.approvedQueue || []).map((a) => a.title)
  ]);
  const addedActions = [];

  actions.forEach((descriptor) => {
    if (!descriptor.title || existingTitles.has(descriptor.title)) {
      return;
    }

    const action = createAIAction({
      title: descriptor.title,
      type: descriptor.type,
      description: descriptor.description,
      requiresApproval: true,
      priority: descriptor.priority || 5,
      executionPlan: {
        tool: descriptor.executionTool || EXECUTION_TOOLS.CLAUDE_CODE,
        prompt: descriptor.prompt
      }
    });

    engine.state.proposedActions.push(action);
    existingTitles.add(descriptor.title);
    addedActions.push(action);
    recordDomainRun(state, descriptor.domain || descriptor.title);
  });

  if (addedActions.length > 0) {
    engine.state.proposedActions = engine.state.proposedActions.slice(-engine.state.config.maxProposedActions);
    saveEngineState(engine.state);
    engine.emit("proposals-updated", engine.state.proposedActions);
    state.history.unshift({
      timestamp: new Date().toISOString(),
      actions: addedActions.map((act) => act.title)
    });
    if (state.history.length > 40) {
      state.history = state.history.slice(0, 40);
    }
    saveState(state);
    appendEvaluationLog(addedActions);
  } else {
    // Still persist run times if a weekly action was deferred
    saveState(state);
  }

  return addedActions.length;
};

export default {
  runUserEvaluationCycle,
  loadState
};
