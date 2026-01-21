import React from "react";
import { Box, Text, useInput } from "ink";
import { AI_ACTION_TYPES } from "../services/autonomous-engine.js";

const e = React.createElement;

// Action type colors
const TYPE_COLORS = {
  [AI_ACTION_TYPES.RESEARCH]: "#38bdf8",
  [AI_ACTION_TYPES.EXECUTE]: "#f97316",
  [AI_ACTION_TYPES.ANALYZE]: "#a78bfa",
  [AI_ACTION_TYPES.COMMUNICATE]: "#22d3ee",
  [AI_ACTION_TYPES.BROWSER]: "#fb923c",
  [AI_ACTION_TYPES.PLAN]: "#60a5fa",
  [AI_ACTION_TYPES.HEALTH]: "#22c55e",
  [AI_ACTION_TYPES.FAMILY]: "#ec4899"
};

/**
 * Action Card for detailed view
 */
const ActionCard = ({ action, index, selected = false }) => {
  const typeColor = TYPE_COLORS[action.type] || "#64748b";
  const borderColor = selected ? "#f59e0b" : "#1e293b";

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: selected ? "bold" : "round",
      borderColor,
      padding: 1,
      marginBottom: 1
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#f59e0b", bold: true }, `[${index + 1}]`),
        e(Text, { color: typeColor, bold: true }, action.type.toUpperCase())
      ),
      action.priority && e(Text, { color: "#64748b" }, `Priority: ${action.priority}`)
    ),
    // Title
    e(
      Box,
      { marginTop: 1 },
      e(Text, { color: "#e2e8f0", bold: selected }, action.title)
    ),
    // Description
    action.description && e(
      Box,
      { marginTop: 1 },
      e(Text, { color: "#94a3b8", wrap: "wrap" }, action.description.slice(0, 100))
    ),
    // Execution info
    action.executionPlan && e(
      Box,
      { flexDirection: "row", marginTop: 1, gap: 2 },
      e(Text, { color: "#475569" }, `Tool: ${action.executionPlan.tool}`),
      action.executionPlan.timeout && e(
        Text,
        { color: "#475569" },
        `Timeout: ${Math.round(action.executionPlan.timeout / 1000)}s`
      )
    ),
    // Goal link
    action.goalId && e(
      Box,
      { marginTop: 1 },
      e(Text, { color: "#8b5cf6" }, `Goal: ${action.goalId}`)
    )
  );
};

/**
 * Approval Overlay Component
 * Modal for reviewing and approving AI-proposed actions
 */
export const ApprovalOverlay = ({
  actions = [],
  selectedIndex = 0,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  onSelect,
  onClose,
  visible = true
}) => {
  // Handle keyboard input
  useInput((input, key) => {
    if (!visible) return;

    // Number keys 1-5 to select
    if (input >= "1" && input <= "5") {
      const idx = parseInt(input) - 1;
      if (idx < actions.length) {
        onSelect && onSelect(idx);
      }
    }

    // A to approve selected or all
    if (input.toLowerCase() === "a") {
      if (key.shift) {
        onApproveAll && onApproveAll();
      } else if (actions[selectedIndex]) {
        onApprove && onApprove(actions[selectedIndex].id);
      }
    }

    // R to reject selected or all
    if (input.toLowerCase() === "r") {
      if (key.shift) {
        onRejectAll && onRejectAll();
      } else if (actions[selectedIndex]) {
        onReject && onReject(actions[selectedIndex].id);
      }
    }

    // Arrow keys for navigation
    if (key.upArrow && selectedIndex > 0) {
      onSelect && onSelect(selectedIndex - 1);
    }
    if (key.downArrow && selectedIndex < actions.length - 1) {
      onSelect && onSelect(selectedIndex + 1);
    }

    // Escape to close
    if (key.escape) {
      onClose && onClose();
    }

    // Enter to approve selected
    if (key.return && actions[selectedIndex]) {
      onApprove && onApprove(actions[selectedIndex].id);
    }
  });

  if (!visible) return null;

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "double",
      borderColor: "#f59e0b",
      padding: 1,
      width: "100%"
    },
    // Header
    e(
      Box,
      {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 1,
        borderStyle: "single",
        borderColor: "#334155",
        paddingX: 1
      },
      e(Text, { color: "#f59e0b", bold: true }, "REVIEW PROPOSED ACTIONS"),
      e(Text, { color: "#64748b" }, `${actions.length} pending approval`)
    ),

    // Actions list
    actions.length === 0 ? e(
      Box,
      { padding: 2 },
      e(Text, { color: "#475569" }, "No actions pending approval")
    ) : e(
      Box,
      { flexDirection: "column" },
      ...actions.slice(0, 5).map((action, index) =>
        e(ActionCard, {
          key: action.id,
          action,
          index,
          selected: index === selectedIndex
        })
      )
    ),

    // Footer with controls
    e(
      Box,
      {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 1,
        borderStyle: "single",
        borderColor: "#334155",
        paddingX: 1
      },
      e(
        Box,
        { flexDirection: "row", gap: 2 },
        e(Text, { color: "#22c55e" }, "[Enter/a] Approve"),
        e(Text, { color: "#ef4444" }, "[r] Reject"),
        e(Text, { color: "#3b82f6" }, "[A] Approve All"),
        e(Text, { color: "#f97316" }, "[R] Reject All")
      ),
      e(
        Box,
        { flexDirection: "row", gap: 2 },
        e(Text, { color: "#64748b" }, "[\u2191\u2193] Navigate"),
        e(Text, { color: "#64748b" }, "[Esc] Close")
      )
    )
  );
};

/**
 * Quick Approval Bar - Inline mini version
 */
export const QuickApprovalBar = ({
  pendingCount = 0,
  onOpen
}) => {
  if (pendingCount === 0) return null;

  return e(
    Box,
    {
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 1,
      borderStyle: "round",
      borderColor: "#f59e0b"
    },
    e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#f59e0b" }, "\u26A0"),
      e(Text, { color: "#e2e8f0" }, `${pendingCount} actions awaiting approval`)
    ),
    e(Text, { color: "#64748b" }, "Press [Tab] to review")
  );
};

/**
 * Approval Toast - Small notification
 */
export const ApprovalToast = ({ action, type = "approved" }) => {
  if (!action) return null;

  const color = type === "approved" ? "#22c55e" :
                type === "rejected" ? "#ef4444" : "#3b82f6";
  const icon = type === "approved" ? "\u2713" :
               type === "rejected" ? "\u2717" : "\u25B8";
  const text = type === "approved" ? "Approved" :
               type === "rejected" ? "Rejected" : "Queued";

  return e(
    Box,
    {
      flexDirection: "row",
      gap: 1,
      padding: 1,
      borderStyle: "round",
      borderColor: color
    },
    e(Text, { color }, icon),
    e(Text, { color }, text),
    e(Text, { color: "#94a3b8" }, action.title.slice(0, 40))
  );
};

export default ApprovalOverlay;
