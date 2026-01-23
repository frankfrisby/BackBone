import React, { memo, useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { getActivityNarrator, AGENT_STATES, ACTION_TYPES } from "../services/activity-narrator.js";
import { useCoordinatedUpdates } from "../hooks/useCoordinatedUpdates.js";

const e = React.createElement;

// ═══════════════════════════════════════════════════════════════════════════
// REALISTIC AGENT ACTIVITY PANEL - Claude Code inspired design
// Shows actions, sub-actions, diffs, state with shimmer, and current goal
// ═══════════════════════════════════════════════════════════════════════════

const THEME = {
  bg: "#0f172a",
  primary: "#f1f5f9",
  secondary: "#94a3b8",
  muted: "#64748b",
  dim: "#475569",
  success: "#22c55e",
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
  purple: "#a855f7",
  cyan: "#06b6d4",
};

// Shimmer effect characters for state display
const SHIMMER_CHARS = ["░", "▒", "▓", "█", "▓", "▒", "░", " "];

/**
 * Action display - e.g., "→ Update('linkedin.md')"
 */
const ActionLine = memo(({ action, isMain = true }) => {
  if (!action) return null;

  const icon = action.icon || "→";
  const verb = action.verb || action.type;
  const target = action.target || "";
  const color = action.color || THEME.info;

  return e(
    Box,
    { flexDirection: "row", paddingLeft: isMain ? 0 : 2 },
    e(Text, { color: THEME.dim }, isMain ? "→ " : "↳ "),
    e(Text, { color, bold: isMain }, verb),
    e(Text, { color: THEME.muted }, "("),
    e(Text, { color: THEME.primary }, `'${target}'`),
    e(Text, { color: THEME.muted }, ")"),
    action.detail && e(Text, { color: THEME.secondary }, ` ${action.detail}`)
  );
});

/**
 * Diff display - shows file changes with red/green highlighting
 */
const DiffLine = memo(({ diff }) => {
  if (!diff) return null;

  return e(
    Box,
    { flexDirection: "column", paddingLeft: 2, marginY: 0 },
    // File and line number
    e(
      Box,
      { flexDirection: "row" },
      e(Text, { color: THEME.dim }, "  "),
      e(Text, { color: THEME.muted }, `${diff.file}:`),
      e(Text, { color: THEME.warning }, diff.lineNumber)
    ),
    // Old text (red background)
    diff.oldText && e(
      Box,
      { flexDirection: "row" },
      e(Text, { color: THEME.dim }, "  "),
      e(Text, { color: "#fca5a5", backgroundColor: "#7f1d1d" }, `- ${diff.oldText.slice(0, 50)}`)
    ),
    // New text (green background)
    diff.newText && e(
      Box,
      { flexDirection: "row" },
      e(Text, { color: THEME.dim }, "  "),
      e(Text, { color: "#86efac", backgroundColor: "#14532d" }, `+ ${diff.newText.slice(0, 50)}`)
    )
  );
});

/**
 * Observation display - what the agent learned
 */
const ObservationLine = memo(({ observation }) => {
  if (!observation) return null;

  return e(
    Box,
    { flexDirection: "row", paddingLeft: 1 },
    e(Text, { color: THEME.purple }, "◈ "),
    e(Text, { color: THEME.secondary, italic: true }, observation.text?.slice(0, 60))
  );
});

/**
 * Shimmer state display - animated state indicator
 */
const ShimmerState = memo(({ state, stateInfo, tickCount = 0 }) => {
  // Create shimmer effect based on tick
  const shimmerIndex = tickCount % SHIMMER_CHARS.length;
  const shimmerChar = SHIMMER_CHARS[shimmerIndex];
  const stateText = stateInfo?.text || state || "Idle";
  const stateColor = stateInfo?.color || THEME.muted;

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    e(Text, { color: stateColor }, shimmerChar),
    e(Text, { color: stateColor, bold: true }, `${stateText}...`),
    e(Text, { color: stateColor }, shimmerChar)
  );
});

/**
 * Goal display - what the agent is trying to accomplish
 */
const GoalLine = memo(({ goal }) => {
  if (!goal) return null;

  return e(
    Box,
    { flexDirection: "row", paddingLeft: 1 },
    e(Text, { color: THEME.dim }, "↓ "),
    e(Text, { color: THEME.primary }, goal.slice(0, 70))
  );
});

/**
 * Main Activity Panel
 */
const AgentActivityPanelBase = ({ maxActions = 3 }) => {
  const narrator = getActivityNarrator();
  const [tickCount, setTickCount] = useState(0);

  // Use coordinated updates for smooth rendering
  const data = useCoordinatedUpdates(
    "agent-narrator",
    () => narrator.getDisplayData(),
    { initialData: narrator.getDisplayData() }
  ) || narrator.getDisplayData();

  // Shimmer animation tick (slower than render tick)
  useEffect(() => {
    const interval = setInterval(() => {
      setTickCount(t => t + 1);
    }, 200); // 5fps shimmer
    return () => clearInterval(interval);
  }, []);

  const { state, stateInfo, goal, actions, subActions, observations, diffs } = data;
  const hasContent = actions?.length > 0 || observations?.length > 0 || goal;

  return e(
    Box,
    { flexDirection: "column", paddingX: 1, paddingY: 0 },

    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(Text, { color: THEME.muted, bold: true }, "ENGINE"),
      e(Text, { color: THEME.dim, dimColor: true }, "◆")
    ),

    // Separator
    e(Text, { color: THEME.dim }, "─".repeat(44)),

    // Main actions (e.g., Update, Search, WebSearch)
    actions?.length > 0 && e(
      Box,
      { flexDirection: "column", marginTop: 0 },
      ...actions.slice(0, maxActions).map((action, i) =>
        e(ActionLine, { key: action.id || i, action, isMain: true })
      )
    ),

    // Diffs (file changes with red/green)
    diffs?.length > 0 && e(
      Box,
      { flexDirection: "column", marginTop: 0 },
      ...diffs.slice(0, 2).map((diff, i) =>
        e(DiffLine, { key: diff.id || i, diff })
      )
    ),

    // Sub-actions (e.g., Bash, MkDir, Copy)
    subActions?.length > 0 && e(
      Box,
      { flexDirection: "column", marginTop: 0 },
      ...subActions.slice(0, 2).map((action, i) =>
        e(ActionLine, { key: action.id || i, action, isMain: false })
      )
    ),

    // Observations
    observations?.length > 0 && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      ...observations.slice(0, 2).map((obs, i) =>
        e(ObservationLine, { key: obs.id || i, observation: obs })
      )
    ),

    // State with shimmer effect
    e(
      Box,
      { marginTop: 1, paddingLeft: 1 },
      e(ShimmerState, { state, stateInfo, tickCount })
    ),

    // Current goal
    goal && e(
      Box,
      { marginTop: 0 },
      e(GoalLine, { goal })
    ),

    // Empty state
    !hasContent && e(
      Box,
      { paddingLeft: 1 },
      e(Text, { color: THEME.muted }, "Waiting for activity...")
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
