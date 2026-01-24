import React, { memo, useMemo, useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { getActivityNarrator, AGENT_STATES, ACTION_TOOLS } from "../services/activity-narrator.js";
import { getAutonomousEngine } from "../services/autonomous-engine.js";
import { useCoordinatedUpdates } from "../hooks/useCoordinatedUpdates.js";
import { getAIStatus, getMultiAIConfig } from "../services/multi-ai.js";
import { BILLING_URLS } from "../services/api-quota-monitor.js";

const e = React.createElement;

/**
 * Flashlight text effect - highlight a few leading letters (no blinking)
 */
const FlashlightText = memo(({ text, baseColor = "#f59e0b", bold = true }) => {
  const palette = {
    "#f59e0b": "#fbbf24",
    "#60a5fa": "#93c5fd",
    "#22c55e": "#4ade80",
    "#a855f7": "#c084fc",
  };
  const bright = palette[baseColor] || "#ffffff";
  const spotlightCount = Math.min(2, text.length);
  const brightText = text.slice(0, spotlightCount);
  const restText = text.slice(spotlightCount);

  return e(
    Box,
    { flexDirection: "row" },
    e(Text, { color: bright, bold }, brightText),
    e(Text, { color: baseColor, bold }, restText)
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED ENGINE PANEL - Detailed actions, shimmer state, token tracking
// ═══════════════════════════════════════════════════════════════════════════

const PANEL_HEIGHT = 14;

const THEME = {
  bg: "#0f172a",
  primary: "#f1f5f9",
  secondary: "#94a3b8",
  muted: "#64748b",
  dim: "#475569",
  success: "#22c55e",
  error: "#ef4444",
  warning: "#f59e0b",
  warningLight: "#fbbf24",
  info: "#3b82f6",
  purple: "#a855f7",
  cyan: "#06b6d4",
  white: "#ffffff",
  gray: "#6b7280",
  diffAddBg: "#14532d",
  diffAddFg: "#86efac",
  diffRemoveBg: "#7f1d1d",
  diffRemoveFg: "#fca5a5",
};

// Status dot states
const STATUS_DOT = {
  WORKING: { color: THEME.gray, blink: true },
  DONE: { color: THEME.success, blink: false },
  FAILED: { color: THEME.error, blink: false },
  OBSERVATION: { color: THEME.white, blink: false },
};

/**
 * Status dot component - color indicates status
 */
const StatusDot = memo(({ status = "WORKING" }) => {
  const dotInfo = STATUS_DOT[status] || STATUS_DOT.WORKING;
  return e(Text, { color: dotInfo.color }, "●");
});

/**
 * Current State Display with Goal and Project
 *
 * The GOAL persists across state changes (Researching → Planning → Building)
 * The PROJECT is created/found to work on this goal
 *
 * Example:
 *   Researching...
 *   Goal: Finding AI engineering jobs in the DC area that match Frank's
 *         5 years of experience · Project: Job Search DC
 *
 *   Planning...
 *   Goal: Finding AI engineering jobs in the DC area that match Frank's
 *         5 years of experience · Project: Job Search DC
 *
 *   Building...
 *   Goal: Researching the best stocks to buy for Jan 26th week
 *         · Project: Stock Analysis Q1
 */
const StateDisplay = memo(({ state, stateInfo, goal, projectName, hideStateLine = false }) => {
  const stateText = stateInfo?.text || state || "Idle";
  const color = stateInfo?.color || THEME.warning;

  return e(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    // State with ellipsis - pulsing effect to show system is running
    !hideStateLine && e(FlashlightText, { text: `${stateText}...`, baseColor: color, bold: true }),
    // Goal with project name
    goal && e(
      Box,
      { paddingLeft: 2, flexDirection: "row", flexWrap: "wrap" },
      e(Text, { color: THEME.muted }, "Goal: "),
      e(Text, { color: THEME.primary, wrap: "wrap" }, goal),
      projectName && e(Text, { color: THEME.dim }, " · "),
      projectName && e(Text, { color: THEME.dim }, "Project: "),
      projectName && e(Text, { color: THEME.muted }, projectName)
    )
  );
});

/**
 * Action line - concrete operations with FULL DATA
 *
 * Bash/Search: ● Bash(grep -r "pattern" ./src)
 *              → src/file.js:42: const pattern = "match";
 *              → src/other.js:15: // pattern here
 *
 * WebSearch:   ● WebSearch(Jobs in AI in Delaware with 5 years exp)
 *              → 1. Senior AI Engineer at TechCorp - $180k, Remote
 *              → 2. ML Engineer at DataCo - $165k, DC Area
 *
 * Fetch:       ● Fetch(https://jobs.com/ai-engineer)
 *              → Title: Senior AI Engineer
 *              → Company: TechCorp Inc.
 *
 * Update:      ● Update(/src/services/auth.js)
 *              ↳ Lines 35-42:
 *              35 - const oldAuth = require('old');
 *              36 + const newAuth = require('new');
 *              37 + const config = { secure: true };
 *
 * Write:       ● Write(/projects/job_finding.md)
 *              ↳ New file content:
 *               1 + # Job Search Notes
 *               2 + ## AI Engineer - DC Area
 *               3 + Company: TechCorp Inc.
 */
const ActionLine = memo(({ action, showDetail = true }) => {
  if (!action) {
    return null;
  }

  const status = action.status || "WORKING";
  const verb = action.verb || action.type;
  const target = action.target || "";
  const results = action.results || [];
  const result = action.result || action.detail || "";
  const color = action.color || THEME.white;
  const diff = action.diff || null;
  const category = action.category || "";

  // Determine action type
  const isNewFile = verb === "Write";
  const isFileOp = category === "file";
  const isWebSearch = verb === "WebSearch" || action.type === "WEB_SEARCH";
  const isWebFetch = verb === "Fetch" || action.type === "WEB_FETCH";
  const isDone = status === "DONE";

  // Parse results - can be array or newline-separated string
  let resultLines = results;
  if (resultLines.length === 0 && result) {
    resultLines = result.split("\n").filter(line => line.trim());
  }

  // Status indicator: gray dot = working, green dot = done
  const statusDot = isDone
    ? e(Text, { color: THEME.success }, "●")
    : e(Text, { color: THEME.gray }, "●");

  return e(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    // Main action line: ● Verb(target in white)
    e(
      Box,
      { flexDirection: "row" },
      statusDot,
      e(Text, { color: THEME.muted }, " "),
      e(Text, { color, bold: true }, verb),
      e(Text, { color: THEME.muted }, "("),
      e(Text, { color: THEME.white, wrap: "wrap" }, target),
      e(Text, { color: THEME.muted }, ")")
    ),

    // For WebSearch/Fetch: show ↓ arrow and results below
    (isWebSearch || isWebFetch) && e(
      Box,
      { flexDirection: "column", paddingLeft: 2 },
      // Down arrow to indicate content below
      e(Text, { color: THEME.dim }, "↓"),
      // Show result lines with proper formatting
      ...resultLines.slice(0, 8).map((line, i) =>
        e(
          Box,
          { key: i },
          e(Text, { color: THEME.secondary, wrap: "wrap" }, `  ${line}`)
        )
      ),
      resultLines.length > 8 && e(
        Text,
        { color: THEME.dim },
        `  ... and ${resultLines.length - 8} more results`
      ),
      // Show nothing found if no results and done
      isDone && resultLines.length === 0 && e(
        Text,
        { color: THEME.dim },
        "  No results found"
      )
    ),

    // For file operations with diff, show the diff
    isFileOp && diff && e(DiffView, { diff, isNewFile }),

    // For other non-file, non-web operations, show result lines with arrow
    !isFileOp && !isWebSearch && !isWebFetch && resultLines.length > 0 && e(
      Box,
      { flexDirection: "column", paddingLeft: 2 },
      ...resultLines.slice(0, 10).map((line, i) =>
        e(
          Box,
          { key: i },
          e(Text, { color: THEME.dim }, "→ "),
          e(Text, { color: THEME.secondary, wrap: "wrap" }, line)
        )
      ),
      resultLines.length > 10 && e(
        Text,
        { color: THEME.dim },
        `  ... and ${resultLines.length - 10} more`
      )
    )
  );
});

/**
 * Observation line - What the AI discovered/noticed
 *
 * Shows observations with white dot:
 * ○  Found 3 high-yield savings accounts with 5%+ APY
 * ○  Identified sleep pattern: HRV drops on weekdays
 * ○  Located 5 AI engineering jobs paying $180k+
 *
 * Uses white dot (○) with spacing, NOT green arrow
 */
const ObservationLine = memo(({ observation }) => {
  if (!observation) return null;

  const text = observation.text || observation;

  return e(
    Box,
    { flexDirection: "row", marginBottom: 1 },
    e(Text, { color: THEME.white }, "○"),
    e(Text, { color: THEME.white }, "  "),
    e(Text, { color: THEME.primary, wrap: "wrap" }, text)
  );
});

/**
 * Build a meaningful, personal outcome summary
 * Instead of "Completed: Analyze portfolio" show:
 * "Hey Frank, I've connected your LinkedIn profile. Now I'm exploring ways to market your skills..."
 */
const buildMeaningfulOutcome = (action, userName = "there") => {
  const firstName = userName?.split(" ")[0] || "there";
  const type = action.type?.toLowerCase() || "";
  const title = action.title?.toLowerCase() || "";
  const result = action.result || {};

  // LinkedIn connection
  if (type.includes("linkedin") || title.includes("linkedin")) {
    if (title.includes("connect") || result.connected) {
      return `Hey ${firstName}, I've connected your LinkedIn profile. Now I'm exploring ways to leverage your network and skills to prepare for better opportunities.`;
    }
    if (title.includes("profile") || title.includes("analyz")) {
      return `${firstName}, I've reviewed your LinkedIn presence. I'm now identifying ways to strengthen your professional brand and expand your reach.`;
    }
  }

  // Oura/Health connection
  if (type.includes("oura") || type.includes("health") || title.includes("health")) {
    if (title.includes("connect") || result.connected) {
      return `${firstName}, your health data is now connected. I'll be tracking your sleep, readiness, and activity to help optimize your performance.`;
    }
    if (title.includes("analyz") || title.includes("review")) {
      return `I've analyzed your recent health metrics, ${firstName}. I'm identifying patterns that could help improve your energy and focus.`;
    }
  }

  // Portfolio/Trading
  if (type.includes("portfolio") || type.includes("trading") || title.includes("stock") || title.includes("invest")) {
    if (title.includes("analyz") || title.includes("review")) {
      return `${firstName}, I've reviewed your portfolio positions. I'm now researching market conditions to identify potential opportunities.`;
    }
    if (title.includes("trade") || title.includes("buy") || title.includes("sell")) {
      return `Trade analysis complete, ${firstName}. I've evaluated the position based on current market data and your risk profile.`;
    }
  }

  // Goal setting
  if (type.includes("goal") || title.includes("goal")) {
    return `${firstName}, I've set up tracking for your goals. I'll monitor progress and suggest actions to keep you on track.`;
  }

  // Research tasks
  if (title.includes("research") || title.includes("search") || title.includes("find")) {
    const topic = title.replace(/research|search|find|for|the/gi, "").trim();
    return `Research complete, ${firstName}. I've gathered insights on ${topic || "your request"} and I'm planning next steps.`;
  }

  // Generic but still meaningful fallback
  if (result.summary && !result.summary.startsWith("Completed:")) {
    return result.summary;
  }

  // If we can't make it meaningful, return null to filter it out
  return null;
};

/**
 * Check if an outcome is meaningful enough to show
 */
const isUselessOutcome = (summary) => {
  if (!summary) return true;
  const lower = summary.toLowerCase();

  // Filter out generic/vague outcomes
  const uselessPatterns = [
    /^completed:/i,
    /^analyzed?\s/i,
    /^processed?\s/i,
    /^checked?\s/i,
    /^reviewed?\s/i,
    /initializ/i,
    /autonomous agent/i,
    /help.*manage/i
  ];

  return uselessPatterns.some(pattern => pattern.test(lower));
};

/**
 * Outcome line - Real achievements/completions
 *
 * Shows actual results with personal touch:
 * - "Hey Frank, I've connected your LinkedIn profile. Now I'm exploring ways to..."
 * - "I've analyzed your health data and found some patterns to optimize."
 * - "Research complete. I've identified 5 opportunities that match your criteria."
 */
const OutcomeLine = memo(({ outcome }) => {
  if (!outcome) return null;

  const summary = outcome.summary || outcome;

  // Don't show useless outcomes
  if (isUselessOutcome(summary)) return null;

  return e(
    Box,
    { flexDirection: "row", gap: 1, marginBottom: 1 },
    e(Text, { color: THEME.success }, "✓"),
    e(Text, { color: THEME.success, wrap: "wrap" }, summary)
  );
});

/**
 * Full diff view with line numbers like Claude Code
 * Shows: line numbers | - removed (red bg) | + added (green bg)
 *
 * For Update: shows removed then added
 * For Write: shows all lines as added (new file)
 */
const DiffView = memo(({ diff, isNewFile = false }) => {
  if (!diff) return null;

  const removed = diff.removed || [];
  const added = diff.added || [];
  const startLine = diff.startLine || 1;

  // For new files, show all content as added
  if (isNewFile && added.length > 0) {
    return e(
      Box,
      { flexDirection: "column", paddingLeft: 2, marginTop: 0 },
      e(Text, { color: THEME.dim }, `  ↳ New file content:`),
      ...added.slice(0, 15).map((line, i) => {
        const lineNum = (startLine + i).toString().padStart(4);
        const text = typeof line === "object" ? line.text : line;
        return e(
          Box,
          { key: `a${i}`, flexDirection: "row" },
          e(Text, { color: THEME.diffAddFg }, `${lineNum} `),
          e(Text, { color: THEME.diffAddFg, backgroundColor: THEME.diffAddBg },
            `+ ${text}`)
        );
      }),
      added.length > 15 && e(
        Text,
        { color: THEME.dim },
        `     ... and ${added.length - 15} more lines`
      )
    );
  }

  // For updates, show removed then added
  if (removed.length === 0 && added.length === 0) return null;

  return e(
    Box,
    { flexDirection: "column", paddingLeft: 2, marginTop: 0 },
    diff.startLine && e(
      Text,
      { color: THEME.dim },
      `  ↳ Lines ${diff.startLine}-${diff.endLine || diff.startLine + removed.length + added.length}:`
    ),
    // Removed lines (red background)
    ...removed.slice(0, 8).map((line, i) => {
      const lineNum = typeof line === "object" ? line.lineNum : (startLine + i);
      const text = typeof line === "object" ? line.text : line;
      return e(
        Box,
        { key: `r${i}`, flexDirection: "row" },
        e(Text, { color: THEME.diffRemoveFg }, `${lineNum.toString().padStart(4)} `),
        e(Text, { color: THEME.diffRemoveFg, backgroundColor: THEME.diffRemoveBg },
          `- ${text}`)
      );
    }),
    // Added lines (green background)
    ...added.slice(0, 8).map((line, i) => {
      const lineNum = typeof line === "object" ? line.lineNum : (startLine + removed.length + i);
      const text = typeof line === "object" ? line.text : line;
      return e(
        Box,
        { key: `a${i}`, flexDirection: "row" },
        e(Text, { color: THEME.diffAddFg }, `${lineNum.toString().padStart(4)} `),
        e(Text, { color: THEME.diffAddFg, backgroundColor: THEME.diffAddBg },
          `+ ${text}`)
      );
    }),
    // Show count if more lines
    (removed.length > 8 || added.length > 8) && e(
      Text,
      { color: THEME.dim },
      `     ... ${Math.max(0, removed.length - 8) + Math.max(0, added.length - 8)} more lines`
    )
  );
});


/**
 * Stats line - tokens, runtime, current focus
 */
const StatsLine = memo(({ stats }) => {
  const { tokens = 0, runtime = 0, currentFocus = "" } = stats || {};

  const formatRuntime = (ms) => {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    if (mins > 0) return `${mins}m ${secs % 60}s`;
    return `${secs}s`;
  };

  return e(
    Box,
    { flexDirection: "row", gap: 2, height: 1 },
    e(Text, { color: THEME.dim }, `⟨ ${tokens.toLocaleString()} tokens`),
    e(Text, { color: THEME.dim }, `│ ${formatRuntime(runtime)}`),
    e(Text, { color: THEME.dim }, "⟩")
  );
});

/**
 * Current work description - 25+ words explaining what's happening
 */
const WorkDescription = memo(({ description }) => {
  if (!description) return e(Box, { height: 1 }, e(Text, { color: THEME.dim }, " "));

  return e(
    Box,
    { flexDirection: "row", height: 1 },
    e(Text, { color: THEME.secondary }, description.slice(0, 70))
  );
});

/**
 * Task progress indicator
 */
const TaskProgress = memo(({ current, total, taskName }) => {
  if (!total) return null;

  return e(
    Box,
    { flexDirection: "row", gap: 1, height: 1 },
    e(Text, { color: THEME.dim }, `[${current}/${total}]`),
    e(Text, { color: THEME.muted }, taskName || "tasks")
  );
});

/**
 * Model Status Banner - Shows when no model connected or tokens exceeded
 */
const ModelStatusBanner = memo(({ status }) => {
  if (!status) return null;

  const { hasModel, tokensExceeded, provider, billingUrl } = status;

  // No model connected
  if (!hasModel) {
    return e(
      Box,
      {
        backgroundColor: "#1e293b",
        paddingX: 2,
        paddingY: 1,
        marginBottom: 1,
        borderStyle: "round",
        borderColor: "#475569"
      },
      e(
        Box,
        { flexDirection: "column" },
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: "#f59e0b" }, "⚠"),
          e(Text, { color: "#f59e0b", bold: true }, "No Model Connected")
        ),
        e(
          Text,
          { color: "#94a3b8" },
          "Please connect a model to enable AI features."
        ),
        e(
          Text,
          { color: "#64748b", dimColor: true },
          "Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env"
        )
      )
    );
  }

  // Tokens exceeded
  if (tokensExceeded) {
    return e(
      Box,
      {
        backgroundColor: "#7f1d1d",
        paddingX: 2,
        paddingY: 1,
        marginBottom: 1,
        borderStyle: "round",
        borderColor: "#dc2626"
      },
      e(
        Box,
        { flexDirection: "column" },
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: "#fca5a5" }, "⚠"),
          e(Text, { color: "#fca5a5", bold: true }, `${provider === "openai" ? "GPT-5.2" : "Claude"} Tokens Exceeded`)
        ),
        e(
          Text,
          { color: "#fca5a5" },
          "Add tokens to continue AI features."
        ),
        e(
          Text,
          { color: "#f87171", dimColor: true },
          billingUrl || BILLING_URLS[provider]
        )
      )
    );
  }

  return null;
});

/**
 * Main Engine Panel
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────┐
 * │ ENGINE                                    tokens · time │
 * ├─────────────────────────────────────────────────────────┤
 * │ Researching...                                          │
 * │   Topic: Figuring out Frank's LinkedIn page             │
 * │                                                         │
 * │ ● WebSearch(Jobs in AI in Delaware with 5 yrs exp)      │
 * │   → 5 results found                                     │
 * │                                                         │
 * │ ● Fetch(https://jobs.com/ai-engineer-dc)                │
 * │   → Senior AI Engineer at TechCorp, requires Python...  │
 * │                                                         │
 * │ ○ Found 3 matching positions in the DC area             │
 * │                                                         │
 * │ ● Update(/projects/job_finding.md)                      │
 * │   ↓ Adding AI engineer job. Has pros and cons...        │
 * │   [diff view with green/red lines]                      │
 * └─────────────────────────────────────────────────────────┘
 */
const AgentActivityPanelBase = ({ overlayHeader = false }) => {
  const narrator = getActivityNarrator();
  const autonomousEngine = getAutonomousEngine();

  // Check model status
  const modelStatus = useMemo(() => {
    const config = getMultiAIConfig();
    const aiStatus = getAIStatus();

    // Check if any model is available
    const hasOpenAI = config.gptInstant?.ready || config.gptThinking?.ready;
    const hasClaude = config.claude?.ready;
    const hasModel = hasOpenAI || hasClaude;

    // Check if tokens exceeded
    const openaiExceeded = aiStatus.gptInstant?.quotaExceeded || aiStatus.gptThinking?.quotaExceeded;
    const claudeExceeded = aiStatus.claude?.quotaExceeded;
    const tokensExceeded = (hasOpenAI && openaiExceeded) || (hasClaude && claudeExceeded && !hasOpenAI);

    // Determine which provider's tokens are exceeded
    const provider = openaiExceeded ? "openai" : claudeExceeded ? "anthropic" : "openai";
    const billingUrl = openaiExceeded ? aiStatus.gptInstant?.billingUrl : aiStatus.claude?.billingUrl;

    return {
      hasModel,
      tokensExceeded,
      provider,
      billingUrl,
      // Engine should be paused if no model or tokens exceeded
      isPaused: !hasModel || tokensExceeded
    };
  }, []);

  // Use coordinated updates
  const data = useCoordinatedUpdates(
    "agent-narrator",
    () => narrator.getDisplayData(),
    { initialData: narrator.getDisplayData() }
  ) || narrator.getDisplayData();

  // Get autonomous engine data
  const engineData = autonomousEngine?.getDisplayData() || {};
  const currentAction = engineData.currentAction;
  const recentCompleted = autonomousEngine?.getRecentCompleted(3) || [];

  // Destructure with stable defaults
  const state = data.state || "OBSERVING";
  const stateInfo = data.stateInfo || AGENT_STATES.OBSERVING;
  const goal = data.goal || data.workDescription || (currentAction?.title) || "";
  const projectName = data.projectName || null;
  const actions = data.actions || [];
  const observations = data.observations || [];
  const stats = data.stats || { tokens: 0, runtime: 0 };
  const taskProgress = data.taskProgress;
  const metricsLine = data.metricsLine || "";

  // Build timeline from real actions
  const timeline = useMemo(() => {
    const items = [
      ...actions.map(a => ({ ...a, itemType: "action" }))
    ];
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // If paused, only show completed items (not in-progress work)
    if (modelStatus.isPaused) {
      return items.filter(item => item.status === "DONE" || item.status === "completed").slice(0, 3);
    }

    return items.slice(0, 4);
  }, [actions, modelStatus.isPaused]);

  // Build discoveries from observations (filter out advice-like text)
  const discoveries = useMemo(() => {
    return observations
      .filter(o => {
        const text = (o.text || o).toLowerCase();
        // Filter out advice patterns
        return !text.includes("you should") &&
               !text.includes("consider ") &&
               !text.includes("try to") &&
               !text.includes("make sure");
      })
      .slice(0, 2);
  }, [observations]);

  // Get user's name from narrator context
  const userName = data.userName || process.env.USER_NAME || "there";

  // Build outcomes from completed actions with meaningful summaries
  const outcomes = useMemo(() => {
    return recentCompleted
      .filter(a => a.status === "completed")
      .map(a => {
        // Try to build a meaningful, personal outcome
        const meaningful = buildMeaningfulOutcome(a, userName);
        return meaningful ? { summary: meaningful, timestamp: a.completedAt } : null;
      })
      .filter(Boolean) // Remove null entries
      .slice(0, 2);
  }, [recentCompleted, userName]);

  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },

    // Header
    overlayHeader
      ? e(
          Box,
          { flexDirection: "column" },
          e(Text, { color: THEME.dim }, " "),
          e(Text, { color: THEME.dim }, " ")
        )
      : e(
          React.Fragment,
          null,
          e(
            Box,
            { flexDirection: "row", justifyContent: "space-between" },
            e(Text, { color: THEME.muted, bold: true }, "ENGINE"),
            metricsLine
              ? e(Text, { color: THEME.dim }, metricsLine)
              : e(StatsLine, { stats })
          ),
          e(Box, {}, e(Text, { color: THEME.dim }, "─".repeat(60)))
        ),

    // Model Status Banner (show when no model or tokens exceeded)
    modelStatus.isPaused && e(ModelStatusBanner, { status: modelStatus }),

    // Current STATE with goal and project (only show if not paused)
    !modelStatus.isPaused && e(StateDisplay, {
      state,
      stateInfo,
      goal,
      projectName,
      hideStateLine: overlayHeader
    }),

    // Real ACTIONS (bash commands, searches, file operations)
    ...timeline.map((item, i) =>
      e(ActionLine, { key: item.id || `act${i}`, action: item, showDetail: true })
    ),

    // OBSERVATIONS - What the AI discovered (white dot with spacing)
    discoveries.length > 0 && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      ...discoveries.map((d, i) =>
        e(ObservationLine, { key: `obs${i}`, observation: d })
      )
    ),

    // OUTCOMES - Real achievements (shown at bottom)
    outcomes.length > 0 && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: THEME.dim }, "─ Outcomes ─"),
      ...outcomes.map((o, i) =>
        e(OutcomeLine, { key: `out${i}`, outcome: o })
      )
    ),

    // Empty state (only if not paused and no timeline)
    !modelStatus.isPaused && timeline.length === 0 && discoveries.length === 0 && e(
      Box,
      { paddingY: 1 },
      e(Text, { color: THEME.dim, italic: true }, "Analyzing metrics and planning improvements...")
    ),

    // Show completed work label if paused and has old work
    modelStatus.isPaused && timeline.length > 0 && e(
      Box,
      { marginTop: 1 },
      e(Text, { color: THEME.dim, dimColor: true }, "─ Previous work ─")
    ),

    // Task progress (only if not paused)
    !modelStatus.isPaused && taskProgress && e(
      Box,
      { marginTop: 1 },
      e(TaskProgress, { ...taskProgress })
    )
  );
};

export const AgentActivityPanel = memo(AgentActivityPanelBase);

/**
 * Compact status dot for headers
 */
export const AgentStatusDot = memo(({ state = "OBSERVING" }) => {
  const stateInfo = AGENT_STATES[state] || AGENT_STATES.OBSERVING;
  return e(Text, { color: stateInfo.color }, "●");
});

export default AgentActivityPanel;
