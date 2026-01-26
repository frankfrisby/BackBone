import React, { memo, useMemo, useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { getActivityNarrator, AGENT_STATES, ACTION_TOOLS, ACTION_COLORS, ACTION_ICONS, STATE_COLORS } from "../services/activity-narrator.js";
import { getAutonomousEngine } from "../services/autonomous-engine.js";
import { useCoordinatedUpdates } from "../hooks/useCoordinatedUpdates.js";
import { getAIStatus, getMultiAIConfig, getCurrentModel } from "../services/multi-ai.js";
import { BILLING_URLS } from "../services/api-quota-monitor.js";
import { isClaudeCodeLoggedIn } from "../services/claude-code-cli.js";
import { getGoalManager } from "../services/goal-manager.js";
import { getBackgroundProjectsManager, BACKGROUND_PROJECT_TYPE } from "../services/background-projects.js";

const e = React.createElement;

/**
 * Flashlight text effect with shimmer animation
 * Creates a moving spotlight that sweeps across the text like a shimmer
 * The spotlight position animates from left to right, creating a "loading" shimmer effect
 */
const FlashlightText = ({ text, baseColor = "#f59e0b", bold = true, spotlightCount = 4 }) => {
  // Animate spotlight position from 0 to text length
  const [spotlightPos, setSpotlightPos] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSpotlightPos(prev => (prev + 1) % (text.length + spotlightCount));
    }, 100); // Move every 100ms for smooth shimmer
    return () => clearInterval(interval);
  }, [text.length, spotlightCount]);

  // Build the text with shimmer effect at current position
  const beforeSpotlight = text.slice(0, Math.max(0, spotlightPos));
  const spotlightStart = Math.max(0, spotlightPos);
  const spotlightEnd = Math.min(text.length, spotlightPos + spotlightCount);
  const brightText = text.slice(spotlightStart, spotlightEnd);
  const afterSpotlight = text.slice(spotlightEnd);

  return e(
    Box,
    { flexDirection: "row" },
    // Text before spotlight (base color)
    beforeSpotlight && e(Text, { color: baseColor, bold }, beforeSpotlight),
    // Bright spotlight section (white on colored background)
    brightText && e(Text, { color: "#ffffff", bold, backgroundColor: baseColor }, brightText),
    // Text after spotlight (base color)
    afterSpotlight && e(Text, { color: baseColor, bold }, afterSpotlight)
  );
};

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

// Status dot states - using ACTION_COLORS for consistency
const STATUS_DOT = {
  WORKING: { color: ACTION_COLORS.WORKING, icon: ACTION_ICONS.WORKING, blink: true },
  DONE: { color: ACTION_COLORS.DONE, icon: ACTION_ICONS.DONE, blink: false },
  FAILED: { color: ACTION_COLORS.FAILED, icon: ACTION_ICONS.FAILED, blink: false },
  OBSERVATION: { color: ACTION_COLORS.OBSERVATION, icon: ACTION_ICONS.OBSERVATION, blink: false },
};

/**
 * Status dot component - color indicates status
 * Uses icons from ACTION_ICONS: ● for working, ✓ for done, ✗ for failed, ○ for observation
 */
const StatusDot = memo(({ status = "WORKING" }) => {
  const dotInfo = STATUS_DOT[status] || STATUS_DOT.WORKING;
  return e(Text, { color: dotInfo.color }, dotInfo.icon || "●");
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
 *
 *   Idle...
 *   Waiting on: Stock Research - market closed
 *               Job Finding - waiting for user input
 */
const StateDisplay = memo(({ state, stateInfo, goal, projectName, hideStateLine = false, waitingReasons = [] }) => {
  const stateText = stateInfo?.text || state || "Idle";
  // Use STATE_COLORS if available, fallback to stateInfo color
  const stateKey = (state || "IDLE").toUpperCase();
  const color = STATE_COLORS[stateKey] || stateInfo?.color || THEME.warning;
  const isIdle = stateKey === "IDLE";

  // Get background projects to show when idle
  const backgroundProjects = useMemo(() => {
    if (!isIdle) return [];
    try {
      const bgManager = getBackgroundProjectsManager();
      const displayData = bgManager.getDisplayData();
      if (!displayData.initialized) return [];

      // Show active/triggered background projects
      return displayData.projects
        .filter(p => p.status === "active" || p.status === "triggered")
        .map(p => ({
          title: p.title,
          insight: p.latestInsight,
          type: p.type
        }));
    } catch (e) {
      return [];
    }
  }, [isIdle]);

  // Background project display names
  const bgProjectNames = {
    [BACKGROUND_PROJECT_TYPE.MARKET_RESEARCH]: "Market Research",
    [BACKGROUND_PROJECT_TYPE.FINANCIAL_GROWTH]: "Financial Growth",
    [BACKGROUND_PROJECT_TYPE.DISASTER_PLANNING]: "Disaster Planning"
  };

  return e(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    // State with ellipsis - shimmer effect shows system is running
    // Format: * Researching...  (Esc to interrupt · 5m 33s · ↓ 11.4k tokens · thinking)
    !hideStateLine && e(
      Box,
      { flexDirection: "row" },
      e(Text, { color }, "* "),
      e(FlashlightText, { text: `${stateText}...`, baseColor: color, bold: true })
    ),
    // Goal with project name (only when not idle)
    !isIdle && goal && e(
      Box,
      { paddingLeft: 2, flexDirection: "row", flexWrap: "wrap" },
      e(Text, { color: THEME.muted }, "Goal: "),
      e(Text, { color: THEME.primary, wrap: "wrap" }, goal),
      projectName && e(Text, { color: THEME.dim }, " · "),
      projectName && e(Text, { color: THEME.dim }, "Project: "),
      projectName && e(Text, { color: THEME.muted }, projectName)
    ),
    // When idle, show waiting reasons for top 2 projects
    isIdle && waitingReasons && waitingReasons.length > 0 && e(
      Box,
      { flexDirection: "column", paddingLeft: 2 },
      e(Text, { color: THEME.muted }, "Waiting on:"),
      ...waitingReasons.slice(0, 2).map((reason, i) =>
        e(
          Box,
          { key: i, flexDirection: "row", paddingLeft: 2 },
          e(Text, { color: THEME.dim }, "• "),
          e(Text, { color: THEME.secondary, wrap: "wrap" },
            `${reason.project || reason.goal || "Project"} - ${reason.reason || "waiting"}`
          )
        )
      )
    ),
    // When idle with no waiting reasons but has background projects, show those
    isIdle && (!waitingReasons || waitingReasons.length === 0) && backgroundProjects.length > 0 && e(
      Box,
      { flexDirection: "column", paddingLeft: 2 },
      e(Text, { color: THEME.muted }, "Background work:"),
      ...backgroundProjects.slice(0, 2).map((bp, i) =>
        e(
          Box,
          { key: i, flexDirection: "column", paddingLeft: 2 },
          e(Box, { flexDirection: "row" },
            e(Text, { color: "#64748b" }, "◐ "),
            e(Text, { color: THEME.secondary }, bgProjectNames[bp.type] || bp.title)
          ),
          bp.insight && e(
            Box,
            { paddingLeft: 4 },
            e(Text, { color: THEME.dim, wrap: "wrap" }, bp.insight.slice(0, 60) + (bp.insight.length > 60 ? "..." : ""))
          )
        )
      )
    ),
    // When idle with no reasons and no background projects, show generic message
    isIdle && (!waitingReasons || waitingReasons.length === 0) && backgroundProjects.length === 0 && goal && e(
      Box,
      { paddingLeft: 2, flexDirection: "row", flexWrap: "wrap" },
      e(Text, { color: THEME.muted }, "Status: "),
      e(Text, { color: THEME.secondary, wrap: "wrap" }, goal)
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

  // Status indicator: green dot = done, red dot = failed, gray dot = working
  const isFailed = status === "FAILED" || status === "failed" || status === "error";
  const statusIcon = isDone
    ? e(Text, { color: THEME.success }, "●")  // Green dot for completed
    : isFailed
      ? e(Text, { color: THEME.error }, "●")  // Red dot for failed
      : e(Text, { color: THEME.gray }, "●");  // Gray dot for in-progress

  return e(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    // Main action line: ● Verb(target) - only dot changes color, text stays normal
    e(
      Box,
      { flexDirection: "row" },
      statusIcon,
      e(Text, { color: THEME.muted }, " "),
      e(Text, { color: color, bold: true }, verb),
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
 * Check if an outcome is a real goal/project completion (not small tasks)
 * Only show major achievements like completed goals or projects
 * Filters out "no other goals available" and similar useless messages
 */
const isRealGoalOrProject = (summary) => {
  if (!summary) return false;
  const lower = summary.toLowerCase();

  // FIRST: Filter out all useless/empty state messages
  const uselessPatterns = [
    /no other goals/i,
    /no goals available/i,
    /no outcomes/i,
    /no active goals/i,
    /no pending goals/i,
    /goals? (is|are) empty/i,
    /nothing to (do|show|display)/i,
    /^completed:/i,
    /^analyzed?\s/i,
    /^processed?\s/i,
    /^checked?\s/i,
    /^reviewed?\s/i,
    /initializ/i,
    /autonomous agent/i,
    /help.*manage/i,
    /waiting for/i,
    /idle/i,
    /standby/i
  ];

  // If it matches any useless pattern, reject it immediately
  if (uselessPatterns.some(pattern => pattern.test(lower))) {
    return false;
  }

  // Must contain goal/project completion keywords
  const goalPatterns = [
    /goal.*complete/i,
    /project.*complete/i,
    /complete.*goal/i,
    /complete.*project/i,
    /finished.*project/i,
    /achieved.*goal/i,
    /milestone.*reached/i,
    /objective.*complete/i
  ];

  // Check if it matches goal/project patterns
  return goalPatterns.some(pattern => pattern.test(lower));
};

/**
 * Outcome line - Only for completed GOALS or PROJECTS
 * Shows green dot with white/gray text
 * Does NOT show "no other goals available" or empty outcomes
 */
const OutcomeLine = memo(({ outcome }) => {
  if (!outcome) return null;

  const summary = outcome.summary || outcome;

  // Only show real goal/project completions
  if (!isRealGoalOrProject(summary)) return null;

  // Filter out "no other goals available" and similar messages
  const lowerSummary = summary.toLowerCase();
  if (lowerSummary.includes("no other goals") ||
      lowerSummary.includes("no goals available") ||
      lowerSummary.includes("no outcomes")) {
    return null;
  }

  return e(
    Box,
    { flexDirection: "row", gap: 1, marginBottom: 1 },
    e(Text, { color: THEME.success }, "●"),
    e(Text, { color: THEME.primary, wrap: "wrap" }, summary)
  );
});

/**
 * Full diff view with line numbers like Claude Code
 * Shows: line numbers | - removed (red bg) | + added (green bg)
 *
 * Layout:
 *   ↳ Lines 35-42:
 *   35 | - const oldAuth = require('old');      [RED BACKGROUND]
 *   36 | + const newAuth = require('new');      [GREEN BACKGROUND]
 *   37 | + const config = { secure: true };     [GREEN BACKGROUND]
 *
 * For Update: shows removed then added
 * For Write: shows all lines as added (new file)
 */
const DiffView = memo(({ diff, isNewFile = false, filePath = null }) => {
  if (!diff) return null;

  const removed = diff.removed || [];
  const added = diff.added || [];
  const startLine = diff.startLine || 1;

  // For new files, show all content as added with green background
  if (isNewFile && added.length > 0) {
    return e(
      Box,
      { flexDirection: "column", paddingLeft: 2, marginTop: 0 },
      // Header with file path if provided
      e(Text, { color: THEME.dim }, `  ↳ New file content:`),
      // Content lines with green background for additions
      ...added.slice(0, 15).map((line, i) => {
        const lineNum = (startLine + i).toString().padStart(4);
        const text = typeof line === "object" ? line.text : line;
        return e(
          Box,
          { key: `a${i}`, flexDirection: "row" },
          // Line number column (muted)
          e(Text, { color: THEME.muted }, `${lineNum} │ `),
          // Content with green background for added lines
          e(Text, { color: THEME.diffAddFg, backgroundColor: THEME.diffAddBg },
            `+ ${text || " "}`)
        );
      }),
      added.length > 15 && e(
        Text,
        { color: THEME.dim, paddingLeft: 6 },
        `... and ${added.length - 15} more lines`
      )
    );
  }

  // For updates, show removed then added
  if (removed.length === 0 && added.length === 0) return null;

  const endLine = diff.endLine || (startLine + removed.length + added.length - 1);

  return e(
    Box,
    { flexDirection: "column", paddingLeft: 2, marginTop: 0 },
    // Header showing line range
    e(
      Text,
      { color: THEME.dim },
      `  ↳ Lines ${startLine}-${endLine}:`
    ),
    // Removed lines (red background)
    ...removed.slice(0, 8).map((line, i) => {
      const lineNum = typeof line === "object" ? line.lineNum : (startLine + i);
      const text = typeof line === "object" ? line.text : line;
      return e(
        Box,
        { key: `r${i}`, flexDirection: "row" },
        // Line number column (muted red)
        e(Text, { color: THEME.diffRemoveFg }, `${lineNum.toString().padStart(4)} │ `),
        // Content with red background for removed lines
        e(Text, { color: THEME.diffRemoveFg, backgroundColor: THEME.diffRemoveBg },
          `- ${text || " "}`)
      );
    }),
    // Added lines (green background)
    ...added.slice(0, 8).map((line, i) => {
      const lineNum = typeof line === "object" ? line.lineNum : (startLine + removed.length + i);
      const text = typeof line === "object" ? line.text : line;
      return e(
        Box,
        { key: `a${i}`, flexDirection: "row" },
        // Line number column (muted green)
        e(Text, { color: THEME.diffAddFg }, `${lineNum.toString().padStart(4)} │ `),
        // Content with green background for added lines
        e(Text, { color: THEME.diffAddFg, backgroundColor: THEME.diffAddBg },
          `+ ${text || " "}`)
      );
    }),
    // Show count if more lines
    (removed.length > 8 || added.length > 8) && e(
      Text,
      { color: THEME.dim, paddingLeft: 6 },
      `... ${Math.max(0, removed.length - 8) + Math.max(0, added.length - 8)} more lines`
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
 * Engine Status Line - Bottom status with shimmer, time, tokens, substatus
 *
 * Format: * Researching...  (Esc to interrupt · 5m 33s · ↓ 11.4k tokens · thinking)
 */
const EngineStatusLine = memo(({ state, stateInfo, time, tokens, substatus = "working" }) => {
  const stateKey = (state || "IDLE").toUpperCase();
  const stateColor = STATE_COLORS[stateKey] || stateInfo?.color || THEME.warning;
  const stateText = stateInfo?.text || state || "Idle";

  const formatTime = (ms) => {
    if (!ms) return "0s";
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    if (mins > 0) return `${mins}m ${secs % 60}s`;
    return `${secs}s`;
  };

  const formatTokens = (count) => {
    if (!count) return "0";
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  return e(
    Box,
    { flexDirection: "row", marginTop: 1 },
    // State indicator with shimmer
    e(Text, { color: stateColor }, "* "),
    e(FlashlightText, {
      text: `${stateText}...`,
      baseColor: stateColor
    }),

    // Controls hint
    e(Text, { color: THEME.dim }, "  (Esc to interrupt · "),

    // Time
    e(Text, { color: THEME.muted }, formatTime(time)),

    // Tokens
    e(Text, { color: THEME.dim }, " · ↓ "),
    e(Text, { color: THEME.muted }, `${formatTokens(tokens)} tokens`),

    // Substatus
    e(Text, { color: THEME.dim }, " · "),
    e(Text, { color: THEME.muted }, substatus),

    e(Text, { color: THEME.dim }, ")")
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
const AgentActivityPanelBase = ({ overlayHeader = false, compact = false, scrollOffset = 0 }) => {
  const narrator = getActivityNarrator();
  const autonomousEngine = getAutonomousEngine();

  // Blinking dot animation - toggles every second to show engine is alive
  const [dotVisible, setDotVisible] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => {
      setDotVisible(prev => !prev);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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

  // Claude Code CLI status - shows orange when active
  const claudeCode = data.claudeCode || { active: false, status: "inactive" };
  const isClaudeCodeActive = claudeCode.active;
  const claudeCodeColor = "#f97316"; // Orange

  // Get waiting reasons for idle state display
  const waitingReasons = useMemo(() => {
    const stateKey = (state || "IDLE").toUpperCase();
    if (stateKey === "IDLE" || modelStatus.isPaused) {
      try {
        const goalManager = getGoalManager();
        return goalManager.getWaitingReasons();
      } catch {
        return [];
      }
    }
    return [];
  }, [state, modelStatus.isPaused]);

  // Build timeline from real actions (supports scrolling via scrollOffset)
  const timeline = useMemo(() => {
    const items = [
      ...actions.map(a => ({ ...a, itemType: "action" }))
    ];
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // If paused, only show completed items (not in-progress work)
    if (modelStatus.isPaused) {
      return items.filter(item => item.status === "DONE" || item.status === "completed").slice(0, 3);
    }

    // Apply scroll offset for keyboard navigation (up/down arrows)
    const start = Math.min(scrollOffset, Math.max(0, items.length - 4));
    return items.slice(start, start + 4);
  }, [actions, modelStatus.isPaused, scrollOffset]);

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
  // Deduplicate and limit to only show unique, real outcomes (max 1 to avoid clutter)
  const outcomes = useMemo(() => {
    const seen = new Set();
    return recentCompleted
      .filter(a => a.status === "completed")
      .map(a => {
        // Try to build a meaningful, personal outcome
        const meaningful = buildMeaningfulOutcome(a, userName);
        return meaningful ? { summary: meaningful, timestamp: a.completedAt } : null;
      })
      .filter(Boolean) // Remove null entries
      .filter(o => {
        // Deduplicate by normalized summary text
        const normalized = o.summary.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        // Also filter out useless outcomes here
        return isRealGoalOrProject(o.summary);
      })
      .slice(0, 1); // Max 1 outcome to avoid clutter
  }, [recentCompleted, userName]);

  return e(
    Box,
    { flexDirection: "column", paddingX: compact ? 0 : 1 },

    // Header - show ENGINE with actual connected model
    (() => {
      const config = getMultiAIConfig();
      const { model: currentModelInfo } = getCurrentModel();

      // Determine what model is actually available/connected
      let modelName = "No Model";
      let modelColor = THEME.error;

      if (config.gptInstant?.ready || config.gptThinking?.ready) {
        // OpenAI is connected - show the current model being used
        modelName = currentModelInfo?.shortName || "GPT-5.2";
        modelColor = currentModelInfo?.color || "#10a37f";
      } else if (config.claude?.ready) {
        // Claude is connected
        modelName = "Claude";
        modelColor = "#d97706";
      }

      // If paused, show why
      if (modelStatus.isPaused) {
        if (!modelStatus.hasModel) {
          modelName = "No API Key";
          modelColor = THEME.error;
        } else if (modelStatus.tokensExceeded) {
          modelName = "Quota Exceeded";
          modelColor = THEME.error;
        }
      }

      // Check Claude Code CLI status - use active state from narrator
      const claudeCodeStatus = isClaudeCodeLoggedIn();
      const claudeCodeAvailable = claudeCodeStatus.loggedIn;
      // isClaudeCodeActive comes from narrator data - true when Claude CLI is actually running

      if (compact) {
        return e(
          Box,
          { flexDirection: "column", marginBottom: 1 },
          e(Box, { flexDirection: "row" },
            e(Text, { color: THEME.muted, bold: true }, "ENGINE"),
            // Blinking gray dot to show engine is alive
            e(Text, { color: dotVisible ? THEME.gray : THEME.dim }, " ● "),
            e(Text, { color: modelColor, bold: true }, modelName),
            // Show Claude Code CLI status - ORANGE BACKGROUND when actively running
            isClaudeCodeActive && e(Text, { color: THEME.dim }, " · "),
            isClaudeCodeActive && e(Text, { color: claudeCodeColor, backgroundColor: "#7c2d12", bold: true }, " Claude Code ACTIVE "),
            // Show metrics when Claude Code is active
            isClaudeCodeActive && claudeCode.toolCallCount > 0 && e(Text, { color: THEME.dim }, " · "),
            isClaudeCodeActive && claudeCode.toolCallCount > 0 && e(Text, { color: THEME.gray }, `${claudeCode.toolCallCount} tools`),
            isClaudeCodeActive && claudeCode.tokensUsed > 0 && e(Text, { color: THEME.dim }, " · "),
            isClaudeCodeActive && claudeCode.tokensUsed > 0 && e(Text, { color: THEME.gray }, `${Math.round(claudeCode.tokensUsed / 1000)}k tokens`),
            !isClaudeCodeActive && claudeCodeAvailable && e(Text, { color: THEME.dim }, " · "),
            !isClaudeCodeActive && claudeCodeAvailable && e(Text, { color: THEME.gray }, "Claude CLI Ready")
          ),
          e(Text, { color: "#1e293b" }, "─".repeat(50))
        );
      }

      if (overlayHeader) {
        return e(
          Box,
          { flexDirection: "column" },
          e(Text, { color: THEME.dim }, " "),
          e(Text, { color: THEME.dim }, " ")
        );
      }

      return e(
        React.Fragment,
        null,
        e(
          Box,
          { flexDirection: "row", justifyContent: "space-between" },
          e(Box, { flexDirection: "row" },
            e(Text, { color: THEME.muted, bold: true }, "ENGINE"),
            // Blinking gray dot to show engine is alive
            e(Text, { color: dotVisible ? THEME.gray : THEME.dim }, " ● "),
            e(Text, { color: modelColor, bold: true }, modelName),
            // Show Claude Code CLI status - ORANGE BACKGROUND when actively running
            isClaudeCodeActive && e(Text, { color: THEME.dim }, " · "),
            isClaudeCodeActive && e(Text, { color: claudeCodeColor, backgroundColor: "#7c2d12", bold: true }, " Claude Code ACTIVE "),
            // Show metrics when Claude Code is active
            isClaudeCodeActive && claudeCode.toolCallCount > 0 && e(Text, { color: THEME.dim }, " · "),
            isClaudeCodeActive && claudeCode.toolCallCount > 0 && e(Text, { color: THEME.gray }, `${claudeCode.toolCallCount} tools`),
            isClaudeCodeActive && claudeCode.tokensUsed > 0 && e(Text, { color: THEME.dim }, " · "),
            isClaudeCodeActive && claudeCode.tokensUsed > 0 && e(Text, { color: THEME.gray }, `${Math.round(claudeCode.tokensUsed / 1000)}k tokens`),
            !isClaudeCodeActive && claudeCodeAvailable && e(Text, { color: THEME.dim }, " · "),
            !isClaudeCodeActive && claudeCodeAvailable && e(Text, { color: THEME.gray }, "Claude CLI Ready")
          ),
          metricsLine
            ? e(Text, { color: THEME.dim }, metricsLine)
            : e(StatsLine, { stats })
        ),
        e(Box, {}, e(Text, { color: "#1e293b" }, "─".repeat(60)))
      );
    })(),

    // Model Status Banner (show when no model or tokens exceeded)
    modelStatus.isPaused && e(ModelStatusBanner, { status: modelStatus }),

    // Current STATE with goal and project - ALWAYS SHOW with flashlight effect
    e(StateDisplay, {
      state: modelStatus.isPaused ? "IDLE" : state,
      stateInfo: modelStatus.isPaused ? AGENT_STATES.IDLE : stateInfo,
      goal: modelStatus.isPaused ? "Waiting for model connection..." : goal,
      projectName: modelStatus.isPaused ? null : projectName,
      hideStateLine: overlayHeader,
      waitingReasons: waitingReasons
    }),

    // Real ACTIONS (bash commands, searches, file operations)
    ...timeline.map((item, i) =>
      e(ActionLine, { key: item.id || `act${i}`, action: item, showDetail: !compact })
    ),

    // OBSERVATIONS - What the AI discovered (white dot with spacing)
    !compact && discoveries.length > 0 && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      ...discoveries.map((d, i) =>
        e(ObservationLine, { key: `obs${i}`, observation: d })
      )
    ),

    // OUTCOMES - Only show completed goals/projects (no label, just green dot + white text)
    outcomes.length > 0 && e(
      Box,
      { flexDirection: "column", marginTop: compact ? 0 : 1 },
      ...outcomes.map((o, i) =>
        e(OutcomeLine, { key: `out${i}`, outcome: o })
      )
    ),

    // Note: Empty state is handled by StateDisplay which shows the current state with flashlight effect

    // Task progress (only if not paused and not compact)
    !compact && !modelStatus.isPaused && taskProgress && e(
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
