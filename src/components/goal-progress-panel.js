import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

// Category colors
const CATEGORY_COLORS = {
  finance: "#eab308",
  health: "#22c55e",
  family: "#ec4899",
  career: "#8b5cf6",
  growth: "#3b82f6",
  education: "#06b6d4"
};

// Category icons
const CATEGORY_ICONS = {
  finance: "$",
  health: "+",
  family: "*",
  career: "^",
  growth: ">",
  education: "~"
};

/**
 * Standard Progress Bar - ████░░░░ style
 */
const ProgressBar = ({ progress = 0, width = 12, color = "#22c55e" }) => {
  const safeProgress = Math.max(0, Math.min(1, progress));
  const filled = Math.round(safeProgress * width);
  const empty = width - filled;

  return e(
    Box,
    { flexDirection: "row" },
    filled > 0 && e(Text, { color }, "\u2588".repeat(filled)),
    empty > 0 && e(Text, { color: "#4a5568" }, "\u2591".repeat(empty))
  );
};

/**
 * Goal Progress Panel - Clean, evenly spaced progress display
 * Shows "Help Me Help You" when no goals are set
 */
export const GoalProgressPanel = ({ goals = [], title = "Goals" }) => {
  // Check if goals are empty or all have no real data
  const hasRealGoals = goals.length > 0 && goals.some(g => g.title || g.progress > 0);

  // Empty state - inspiring message to get started
  if (!hasRealGoals) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#0f172a",
        padding: 1,
        height: 6
      },
      e(Text, { color: "#f59e0b", bold: true }, "Goals"),
      e(Text, { color: "#64748b" }, "Run /goals to set goals")
    );
  }

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#0f172a",
      padding: 1,
      height: 8,
      overflow: "hidden"
    },
    // Header
    e(
      Box,
      { marginBottom: 1 },
      e(Text, { color: "#64748b" }, title)
    ),
    // Goals - evenly spaced rows
    e(
      Box,
      { flexDirection: "column" },
      ...goals.slice(0, 4).map((goal, i) => {
        const color = CATEGORY_COLORS[goal.category] || "#64748b";
        const icon = goal.icon || CATEGORY_ICONS[goal.category] || "\u25CF";
        const pct = Math.round((goal.progress || 0) * 100);

        // Use goal title if available, otherwise category name
        const label = goal.title
          ? goal.title.slice(0, 15)
          : (goal.category || "goal").charAt(0).toUpperCase() + (goal.category || "goal").slice(1);

        return e(
          Box,
          { key: goal.id || i, flexDirection: "row", justifyContent: "space-between" },
          // Left: icon + label
          e(
            Box,
            { flexDirection: "row", width: 18 },
            e(Text, { color }, icon + " "),
            e(Text, { color: "#94a3b8" }, label.slice(0, 15))
          ),
          // Center: progress bar
          e(ProgressBar, { progress: goal.progress || 0, width: 8, color }),
          // Right: percentage
          e(Text, { color: "#475569" }, `${String(pct).padStart(3)}%`)
        );
      })
    )
  );
};

/**
 * Goal Summary - Single line version
 */
export const GoalSummary = ({ goals = [] }) => {
  const avgProgress = goals.length > 0
    ? goals.reduce((sum, g) => sum + (g.progress || 0), 0) / goals.length
    : 0;

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    e(Text, { color: "#475569" }, "Goals:"),
    e(ProgressBar, { progress: avgProgress, width: 10, color: "#f59e0b" }),
    e(Text, { color: "#475569" }, `${Math.round(avgProgress * 100)}%`)
  );
};

export default GoalProgressPanel;
