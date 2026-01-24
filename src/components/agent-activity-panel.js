import React, { memo, useMemo } from "react";
import { Box, Text } from "ink";
import { getActivityNarrator, AGENT_STATES, ACTION_TYPES } from "../services/activity-narrator.js";
import { useCoordinatedUpdates, useCoordinatedTick } from "../hooks/useCoordinatedUpdates.js";

const e = React.createElement;

// ═══════════════════════════════════════════════════════════════════════════
// STABLE AGENT ACTIVITY PANEL - Fixed height, no layout shifts
// Uses coordinated updates only - no independent intervals
// ═══════════════════════════════════════════════════════════════════════════

// Fixed panel height to prevent layout shifts
const PANEL_HEIGHT = 10;

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

// Simple pulse indicator (just dots, no width changes)
const PULSE_DOTS = ["◐", "◓", "◑", "◒"];

/**
 * Action display - e.g., "→ Update('linkedin.md')"
 * Always renders a Box for consistent layout height
 */
const ActionLine = memo(({ action, isMain = true }) => {
  // Always return a Box with consistent structure to prevent layout shifts
  if (!action) {
    return e(
      Box,
      { flexDirection: "row", paddingLeft: isMain ? 0 : 2, height: 1 },
      e(Text, { color: THEME.dim }, " ")
    );
  }

  const icon = action.icon || "→";
  const verb = action.verb || action.type;
  const target = action.target || "";
  const color = action.color || THEME.info;

  return e(
    Box,
    { flexDirection: "row", paddingLeft: isMain ? 0 : 2, height: 1 },
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
 * Always renders a Box for consistent layout height
 */
const ObservationLine = memo(({ observation }) => {
  if (!observation) {
    return e(
      Box,
      { flexDirection: "row", paddingLeft: 1, height: 1 },
      e(Text, { color: THEME.dim }, " ")
    );
  }

  return e(
    Box,
    { flexDirection: "row", paddingLeft: 1, height: 1 },
    e(Text, { color: THEME.purple }, "◈ "),
    e(Text, { color: THEME.secondary, italic: true }, observation.text?.slice(0, 60))
  );
});

/**
 * State display with subtle pulse indicator
 * Manages its own tick subscription to isolate animation re-renders
 * (prevents full panel re-renders on each tick - like opentui's dirty region tracking)
 */
const ShimmerState = memo(({ state, stateInfo }) => {
  // Subscribe to tick ONLY in this component - isolates animation re-renders
  const tickCount = useCoordinatedTick(null, true);

  // Simple rotating dot indicator (same width always)
  const pulseIndex = tickCount % PULSE_DOTS.length;
  const pulseChar = PULSE_DOTS[pulseIndex];
  const stateText = stateInfo?.text || state || "Idle";
  const stateColor = stateInfo?.color || THEME.muted;

  return e(
    Box,
    { flexDirection: "row", gap: 1, height: 1 },
    e(Text, { color: stateColor }, pulseChar),
    e(Text, { color: stateColor, bold: true }, `${stateText}...`)
  );
});

/**
 * Goal display - what the agent is trying to accomplish
 * Always renders a Box for consistent layout height
 */
const GoalLine = memo(({ goal }) => {
  if (!goal) {
    return e(
      Box,
      { flexDirection: "row", paddingLeft: 1, height: 1 },
      e(Text, { color: THEME.dim }, " ")
    );
  }

  return e(
    Box,
    { flexDirection: "row", paddingLeft: 1, height: 1 },
    e(Text, { color: THEME.dim }, "↓ "),
    e(Text, { color: THEME.primary }, goal.slice(0, 70))
  );
});

/**
 * Main Activity Panel - Fixed height, no props, self-contained
 * Subscribes directly to narrator to prevent parent re-renders
 */
const AgentActivityPanelBase = () => {
  const maxActions = 3;
  const narrator = getActivityNarrator();

  // Use coordinated updates - synced with global tick
  const data = useCoordinatedUpdates(
    "agent-narrator",
    () => narrator.getDisplayData(),
    { initialData: narrator.getDisplayData() }
  ) || narrator.getDisplayData();

  // NOTE: tickCount removed from parent - ShimmerState manages its own tick subscription
  // This prevents full panel re-renders on each tick (dirty region isolation)

  const { state, stateInfo, goal, actions, subActions, observations, diffs } = data;

  // Build fixed-height content array (always PANEL_HEIGHT lines)
  // NOTE: tickCount is NOT included in deps - shimmer gets it directly to avoid full re-renders
  const lines = useMemo(() => {
    const result = [];

    // Line 0: Header
    result.push({ type: "header" });

    // Line 1: Separator
    result.push({ type: "separator" });

    // Lines 2-4: Actions (always 3 slots)
    const actionSlots = actions?.slice(0, 3) || [];
    for (let i = 0; i < 3; i++) {
      result.push({ type: "action", action: actionSlots[i] || null, isMain: true });
    }

    // Lines 5-6: Sub-actions or observations (2 slots)
    const subSlots = subActions?.slice(0, 2) || [];
    const obsSlots = observations?.slice(0, 2) || [];
    for (let i = 0; i < 2; i++) {
      if (subSlots[i]) {
        result.push({ type: "action", action: subSlots[i], isMain: false });
      } else if (obsSlots[i]) {
        result.push({ type: "observation", observation: obsSlots[i] });
      } else {
        result.push({ type: "empty" });
      }
    }

    // Line 7: State with shimmer (tickCount passed directly to component, not stored in line)
    result.push({ type: "state", state, stateInfo });

    // Line 8: Goal
    result.push({ type: "goal", goal });

    // Line 9: Padding
    result.push({ type: "empty" });

    return result;
  }, [actions, subActions, observations, state, stateInfo, goal]);

  return e(
    Box,
    { flexDirection: "column", paddingX: 1, height: PANEL_HEIGHT },

    // Render fixed lines
    ...lines.map((line, i) => {
      switch (line.type) {
        case "header":
          return e(
            Box,
            { key: i, flexDirection: "row", justifyContent: "space-between", height: 1 },
            e(Text, { color: THEME.muted, bold: true }, "ENGINE"),
            e(Text, { color: THEME.dim }, "◆")
          );
        case "separator":
          return e(Box, { key: i, height: 1 }, e(Text, { color: THEME.dim }, "─".repeat(44)));
        case "action":
          // ActionLine handles null action with consistent structure
          return e(ActionLine, { key: i, action: line.action, isMain: line.isMain });
        case "observation":
          return e(ObservationLine, { key: i, observation: line.observation });
        case "state":
          return e(
            Box,
            { key: i, paddingLeft: 1, height: 1 },
            e(ShimmerState, { state: line.state, stateInfo: line.stateInfo })
          );
        case "goal":
          // GoalLine handles null goal with consistent structure
          return e(GoalLine, { key: i, goal: line.goal });
        default:
          return e(Box, { key: i, height: 1 }, e(Text, { color: THEME.dim }, " "));
      }
    })
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
