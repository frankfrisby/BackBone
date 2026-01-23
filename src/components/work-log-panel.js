import React, { memo } from "react";
import { Box, Text } from "ink";

const e = React.createElement;

// Task states: WHITE = observation, GRAY = working, GREEN = done, RED = error
const TASK_STATE = {
  OBSERVATION: "#f8fafc",  // White - observation/output
  WORKING: "#64748b",      // Gray - starting/working
  DONE: "#22c55e",         // Green - completed
  ERROR: "#ef4444"         // Red - error
};

// Source colors (for identifying source, secondary to status)
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
 * Get status color: white=observation, gray=working, green=done, red=error
 */
const getStatusColor = (status) => {
  if (status === "error" || status === "failed") return TASK_STATE.ERROR;
  if (status === "done" || status === "completed" || status === "success") return TASK_STATE.DONE;
  if (status === "observation" || status === "output" || status === "result") return TASK_STATE.OBSERVATION;
  return TASK_STATE.WORKING; // pending, running, working, or any other status
};

/**
 * Format entry title as Action([target])
 * Examples: Search([url]), Read([file_path]), Update([file_path])
 */
const formatEntryTitle = (entry) => {
  const title = entry.title || "";
  const action = entry.action || entry.type || "";
  const target = entry.target || entry.path || entry.url || "";

  // If we have action and target, format as Action([target])
  if (action && target) {
    const shortTarget = target.length > 25 ? "..." + target.slice(-22) : target;
    return `${action}([${shortTarget}])`;
  }

  // If title contains a colon, try to parse it
  const match = title.match(/^(\w+):\s*(.+)$/);
  if (match) {
    const [, act, tgt] = match;
    const shortTgt = tgt.length > 25 ? "..." + tgt.slice(-22) : tgt;
    return `${act}([${shortTgt}])`;
  }

  // Default: just return the title
  return title.slice(0, 30);
};

/**
 * Work Log Panel - Activity feed with AI thoughts
 * Colors: WHITE = observation, GRAY = working, GREEN = done, RED = error
 */
const WorkLogPanelBase = ({ entries = [], title = "Activity / Thoughts", maxItems = 10 }) => {
  const displayEntries = entries.slice(0, maxItems);

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#0f172a",
      padding: 1
    },
    // Header
    e(
      Box,
      { marginBottom: 1 },
      e(Text, { color: "#64748b" }, title)
    ),
    // Entries - format: ● Action([target]) - each entry updates in place
    displayEntries.length === 0
      ? e(Text, { color: "#475569", dimColor: true }, "Waiting for action...")
      : e(
          Box,
          { flexDirection: "column" },
          ...displayEntries.map((entry, i) => {
            // Status determines color: white=observation, gray=working, green=done, red=error
            const statusColor = getStatusColor(entry.status);
            const formattedTitle = formatEntryTitle(entry);

            return e(
              Box,
              { key: entry.id || `entry-${i}`, flexDirection: "row", gap: 1 },
              e(Text, { color: statusColor }, "●"),
              e(Text, { color: "#475569" }, entry.time || "--:--"),
              e(Text, { color: statusColor, wrap: "truncate" }, formattedTitle)
            );
          })
        )
  );
};

/**
 * Compact Work Log - Minimal version
 * Colors: WHITE = observation, GRAY = working, GREEN = done, RED = error
 */
const WorkLogCompactBase = ({ entries = [], maxItems = 5 }) => {
  return e(
    Box,
    { flexDirection: "column" },
    ...entries.slice(0, maxItems).map((entry, i) => {
      const statusColor = getStatusColor(entry.status);
      return e(
        Box,
        { key: entry.id || `compact-${i}`, flexDirection: "row", gap: 1 },
        e(Text, { color: statusColor }, "●"),
        e(Text, { color: statusColor }, (entry.title || "").slice(0, 20))
      );
    })
  );
};

/**
 * Custom comparison for WorkLogPanel
 */
const areWorkLogPropsEqual = (prevProps, nextProps) => {
  if (prevProps.title !== nextProps.title) return false;
  if (prevProps.maxItems !== nextProps.maxItems) return false;

  const prevEntries = prevProps.entries || [];
  const nextEntries = nextProps.entries || [];

  if (prevEntries.length !== nextEntries.length) return false;

  // Compare entry IDs and statuses
  for (let i = 0; i < Math.min(10, prevEntries.length); i++) {
    if (prevEntries[i]?.id !== nextEntries[i]?.id) return false;
    if (prevEntries[i]?.status !== nextEntries[i]?.status) return false;
    if (prevEntries[i]?.title !== nextEntries[i]?.title) return false;
  }

  return true;
};

// Memoized exports to prevent flickering
export const WorkLogPanel = memo(WorkLogPanelBase, areWorkLogPropsEqual);
export const WorkLogCompact = memo(WorkLogCompactBase);

export default WorkLogPanel;
