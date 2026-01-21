import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

// Source colors
const SOURCE_COLORS = {
  alpaca: "#22c55e",
  linkedin: "#0077b5",
  oura: "#8b5cf6",
  yahoo: "#7c3aed",
  claude: "#d97706",
  "claude-code": "#f59e0b",
  system: "#64748b",
  user: "#3b82f6",
  autonomous: "#10b981",
  goal: "#ec4899"
};

/**
 * Work Log Panel - Activity feed with AI thoughts
 */
export const WorkLogPanel = ({ entries = [], title = "Activity / Thoughts", maxItems = 10 }) => {
  const displayEntries = entries.slice(0, maxItems);

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#1e293b",
      padding: 1
    },
    // Header
    e(
      Box,
      { marginBottom: 1 },
      e(Text, { color: "#64748b" }, title)
    ),
    // Entries
    displayEntries.length === 0
      ? e(Text, { color: "#475569", dimColor: true }, "Waiting for action...")
      : e(
          Box,
          { flexDirection: "column" },
          ...displayEntries.map((entry, i) => {
            const color = SOURCE_COLORS[entry.source] || "#64748b";
            const icon = entry.status === "error" ? "\u25BC" :
                        entry.status === "pending" ? "\u25CB" : "\u25CF";
            const iconColor = entry.status === "error" ? "#ef4444" :
                             entry.status === "pending" ? "#eab308" : color;

            return e(
              Box,
              { key: entry.id || i, flexDirection: "row", gap: 1 },
              e(Text, { color: iconColor }, icon),
              e(Text, { color: "#475569" }, entry.time || "--:--"),
              e(Text, { color: "#94a3b8", wrap: "truncate" }, (entry.title || "").slice(0, 25))
            );
          })
        )
  );
};

/**
 * Compact Work Log - Minimal version
 */
export const WorkLogCompact = ({ entries = [], maxItems = 5 }) => {
  return e(
    Box,
    { flexDirection: "column" },
    ...entries.slice(0, maxItems).map((entry, i) => e(
      Box,
      { key: entry.id || i, flexDirection: "row", gap: 1 },
      e(Text, { color: SOURCE_COLORS[entry.source] || "#64748b" }, "\u25CF"),
      e(Text, { color: "#94a3b8" }, (entry.title || "").slice(0, 20))
    ))
  );
};

export default WorkLogPanel;
