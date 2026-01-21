import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

// Unicode arrow: ↳ (U+21B3) - down then right arrow
const ARROW_DOWN_RIGHT = "\u21B3";

const statusColor = (status) => {
  if (status === "active") return "#22c55e"; // Green
  if (status === "pending") return "#94a3b8"; // Gray
  if (status === "completed") return "#22c55e"; // Green
  if (status === "failed") return "#ef4444"; // Red
  return "#64748b";
};

const statusIcon = (status, isActive) => {
  if (isActive) return ARROW_DOWN_RIGHT;
  if (status === "completed") return "✓";
  if (status === "failed") return "✗";
  return "○";
};

/**
 * Actions Panel - Shows current and upcoming system actions
 */
export const ActionsPanel = ({ actions, userName }) => {
  const { active, next } = actions || { active: null, next: [] };

  // Build the actions list
  const actionItems = [];

  // Active action (with arrow)
  if (active) {
    actionItems.push({
      name: active.name,
      isActive: true,
      status: "active"
    });
  } else {
    actionItems.push({
      name: "Idle - waiting for next action",
      isActive: true,
      status: "pending"
    });
  }

  // Next actions (up to 3 more)
  next.slice(0, 3).forEach((action, index) => {
    actionItems.push({
      name: action.name,
      isActive: false,
      status: "pending"
    });
  });

  // Pad with placeholder actions if less than 4
  while (actionItems.length < 4) {
    actionItems.push({
      name: "—",
      isActive: false,
      status: "pending",
      placeholder: true
    });
  }

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#1e293b",
      padding: 1,
      marginBottom: 1
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#64748b" }, "Actions"),
      userName
        ? e(Text, { color: "#94a3b8" }, userName)
        : e(Text, { color: "#475569", dimColor: true }, "Connect profile")
    ),
    // Actions list
    e(
      Box,
      { flexDirection: "column" },
      ...actionItems.map((action, index) =>
        e(
          Box,
          { key: index, flexDirection: "row", gap: 1 },
          // Arrow or bullet
          e(
            Text,
            { color: action.isActive ? "#22c55e" : "#475569" },
            action.isActive ? ARROW_DOWN_RIGHT : " "
          ),
          // Action name
          e(
            Text,
            {
              color: action.placeholder
                ? "#334155"
                : action.isActive
                  ? "#e2e8f0"
                  : "#94a3b8",
              bold: action.isActive
            },
            action.name
          )
        )
      )
    )
  );
};

/**
 * Compact Actions Display - For inline use
 */
export const ActionsCompact = ({ actions }) => {
  const { active } = actions || { active: null };

  if (!active) {
    return e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#64748b" }, "○"),
      e(Text, { color: "#64748b" }, "Idle")
    );
  }

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    e(Text, { color: "#22c55e" }, ARROW_DOWN_RIGHT),
    e(Text, { color: "#e2e8f0" }, active.name)
  );
};
