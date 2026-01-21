import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

// Action type colors
const TYPE_COLORS = {
  research: "#38bdf8",
  execute: "#f97316",
  analyze: "#a78bfa",
  communicate: "#22d3ee",
  browser: "#fb923c",
  plan: "#60a5fa",
  health: "#22c55e",
  family: "#ec4899"
};

/**
 * Standard Progress Bar - ████░░░░ style
 */
const ProgressBar = ({ progress = 0, width = 15 }) => {
  const filled = Math.round(progress * width);
  const empty = width - filled;

  return e(
    Box,
    { flexDirection: "row" },
    filled > 0 && e(Text, { color: "#22c55e" }, "\u2588".repeat(filled)),
    empty > 0 && e(Text, { color: "#4a5568" }, "\u2591".repeat(empty)),
    e(Text, { color: "#475569" }, ` ${Math.round(progress * 100)}%`)
  );
};

/**
 * Enhanced Actions Panel - Clean action display
 */
export const EnhancedActionsPanel = ({
  currentAction,
  nextAction,
  proposedActions = [],
  approvedCount = 0,
  completedCount = 0,
  showHelp = true
}) => {
  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#4a5568",
      padding: 1,
      height: 10,
      overflow: "hidden"
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#64748b" }, "Actions"),
      e(
        Box,
        { flexDirection: "row", gap: 2 },
        approvedCount > 0 && e(Text, { color: "#3b82f6" }, `${approvedCount} queued`),
        e(Text, { color: "#22c55e" }, `${completedCount} done`)
      )
    ),

    // Current action
    e(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      e(Text, { color: currentAction ? "#22c55e" : "#475569" }, "CURRENT"),
      currentAction
        ? e(
            Box,
            { flexDirection: "column", marginLeft: 1 },
            e(Text, { color: "#e2e8f0" }, currentAction.title),
            currentAction.progress !== undefined && e(ProgressBar, { progress: currentAction.progress })
          )
        : e(Text, { color: "#475569", dimColor: true, marginLeft: 1 }, "Idle")
    ),

    // Next action
    e(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      e(Text, { color: nextAction ? "#3b82f6" : "#475569" }, "NEXT"),
      nextAction
        ? e(Text, { color: "#94a3b8", marginLeft: 1 }, nextAction.title)
        : e(Text, { color: "#475569", dimColor: true, marginLeft: 1 }, "None queued")
    ),

    // Proposed actions
    e(
      Box,
      { flexDirection: "column" },
      e(Text, { color: "#64748b" }, "PROPOSED"),
      proposedActions.length === 0
        ? e(Text, { color: "#475569", dimColor: true, marginLeft: 1 }, "Generating...")
        : e(
            Box,
            { flexDirection: "column", marginLeft: 1 },
            ...proposedActions.slice(0, 5).map((action, i) => {
              const typeColor = TYPE_COLORS[action.type] || "#64748b";
              return e(
                Box,
                { key: action.id || i, flexDirection: "row", gap: 1 },
                e(Text, { color: "#f59e0b" }, `${i + 1}.`),
                e(Text, { color: typeColor }, `[${(action.type || "task").slice(0, 6)}]`),
                e(Text, { color: "#94a3b8", wrap: "truncate" }, (action.title || "").slice(0, 30))
              );
            })
          )
    ),

    // Help
    showHelp && e(
      Box,
      { marginTop: 1 },
      e(Text, { color: "#475569", dimColor: true }, "[A]pprove  [R]eject  [1-5] select")
    )
  );
};

/**
 * Completed Actions List - Clean list
 */
export const CompletedActionsList = ({ actions = [], maxItems = 8, title = "Completed" }) => {
  if (actions.length === 0) {
    return e(
      Box,
      { flexDirection: "column", borderStyle: "single", borderColor: "#4a5568", paddingX: 1 },
      e(Text, { color: "#64748b" }, title),
      e(Text, { color: "#475569", dimColor: true }, "None yet")
    );
  }

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#4a5568",
      padding: 1
    },
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#64748b" }, title),
      e(Text, { color: "#22c55e" }, `${actions.length}`)
    ),
    ...actions.slice(0, maxItems).map((action, i) => {
      const icon = action.status === "completed" ? "\u2713" :
                   action.status === "failed" ? "\u2717" : "\u25CB";
      const iconColor = action.status === "completed" ? "#22c55e" :
                        action.status === "failed" ? "#ef4444" : "#64748b";

      return e(
        Box,
        { key: action.id || i, flexDirection: "row", gap: 1 },
        e(Text, { color: iconColor }, icon),
        e(Text, { color: "#94a3b8", wrap: "truncate" }, (action.title || "").slice(0, 35))
      );
    })
  );
};

export default EnhancedActionsPanel;
