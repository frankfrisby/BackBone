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

// Status colors - WHITE=observation, GRAY=working, GREEN=done, RED=error
const STATUS_COLORS = {
  // Working states (gray)
  starting: TASK_STATE.WORKING,
  researching: TASK_STATE.WORKING,
  thinking: TASK_STATE.WORKING,
  planning: TASK_STATE.WORKING,
  building: TASK_STATE.WORKING,
  working: TASK_STATE.WORKING,
  reflecting: TASK_STATE.WORKING,
  updating: TASK_STATE.WORKING,
  connecting: TASK_STATE.WORKING,
  connecting_agent: TASK_STATE.WORKING,
  connecting_provider: TASK_STATE.WORKING,
  running_cron: TASK_STATE.WORKING,
  analyzing: TASK_STATE.WORKING,
  executing: TASK_STATE.WORKING,
  learning: TASK_STATE.WORKING,
  syncing: TASK_STATE.WORKING,
  waiting: TASK_STATE.WORKING,
  // Observation states (white)
  observing: TASK_STATE.OBSERVATION,
  output: TASK_STATE.OBSERVATION,
  result: TASK_STATE.OBSERVATION,
  // Done states (green)
  idle: TASK_STATE.DONE,
  done: TASK_STATE.DONE,
  completed: TASK_STATE.DONE,
  success: TASK_STATE.DONE,
  // Error states (red)
  closing: TASK_STATE.ERROR,
  error: TASK_STATE.ERROR,
  failed: TASK_STATE.ERROR
};

// Cache timestamp to prevent re-renders
let cachedTime = "";
let lastTimeUpdate = 0;
const getCachedTime = () => {
  const now = Date.now();
  if (now - lastTimeUpdate > 60000 || !cachedTime) {
    cachedTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    lastTimeUpdate = now;
  }
  return cachedTime;
};

// Status icons
const STATUS_ICONS = {
  starting: "⚡",
  researching: "◎",
  thinking: "◐",
  planning: "◇",
  building: "▣",
  working: "⚙",
  reflecting: "◈",
  updating: "↻",
  connecting: "◌",
  connecting_agent: "◆",
  connecting_provider: "☁",
  running_cron: "⏰",
  closing: "○",
  idle: "●",
  waiting: "◐",
  analyzing: "◈",
  executing: "▶",
  learning: "◇",
  syncing: "↺"
};

// Action type labels - format: Action([target])
const ACTION_LABELS = {
  search: "Search",
  read: "Read",
  write: "Write",
  update: "Update",
  delete: "Delete",
  fetch: "Fetch",
  analyze: "Analyze",
  execute: "Execute",
  connect: "Connect",
  sync: "Sync",
  researching: "Research"
};

const titleCase = (value) => {
  if (!value) return "Action";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

/**
 * Format action for display: ● Action([target])
 * @param {string} action - The action type (search, read, write, etc.)
 * @param {string} target - The target (url, file path, etc.)
 * @param {string} status - observation, working, done, error
 */
const formatAction = (action, target, status = "working") => {
  let color;
  switch (status) {
    case "error":
    case "failed":
      color = TASK_STATE.ERROR;
      break;
    case "done":
    case "completed":
    case "success":
      color = TASK_STATE.DONE;
      break;
    case "observation":
    case "output":
    case "result":
      color = TASK_STATE.OBSERVATION;
      break;
    default: // working, starting, etc.
      color = TASK_STATE.WORKING;
  }
  const normalized = action?.toLowerCase();
  const label = ACTION_LABELS[normalized] || titleCase(action);
  const trimmedTarget = target
    ? (target.length > 60 ? `${target.slice(0, 57)}...` : target)
    : "";
  const targetText = trimmedTarget ? `('${trimmedTarget}')` : "";
  return { icon: "●", color, text: `${label}${targetText}` };
};

// Status labels for display
const STATUS_LABELS = {
  starting: "Starting",
  researching: "Researching",
  thinking: "Thinking",
  planning: "Planning",
  building: "Building",
  working: "Working",
  reflecting: "Reflecting",
  updating: "Updating",
  connecting: "Connecting",
  connecting_agent: "Connect(Agent)",
  connecting_provider: "Connect(Provider)",
  running_cron: "Cron",
  closing: "Closing",
  idle: "Ready",
  waiting: "Waiting",
  analyzing: "Analyzing",
  executing: "Executing",
  learning: "Learning",
  syncing: "Syncing"
};

/**
 * Engine Status Panel - Shows what the AI is currently doing
 * Colors: WHITE = observation, GRAY = working, GREEN = done, RED = error
 */
const EngineStatusPanelBase = ({
  status = {},
  currentPlan = null,
  currentWork = null,
  projects = [],
  compact = false,
  actionStreamingText = "",
  borderless = false
}) => {
  const statusId = status?.id || "idle";
  const statusDetail = status?.detail || null;
  const statusColor = STATUS_COLORS[statusId] || "#64748b";
  const statusIcon = STATUS_ICONS[statusId] || "●";
  const statusLabel = STATUS_LABELS[statusId] || "Ready";
  const isActive = statusId !== "idle" && statusId !== "waiting";
  const containerProps = compact
    ? {
        flexDirection: "row",
        gap: 1,
        paddingX: borderless ? 0 : 1,
        marginBottom: borderless ? 0 : 1
      }
    : {
        flexDirection: "column",
        paddingX: borderless ? 0 : 1,
        paddingY: borderless ? 0 : 1,
        marginBottom: borderless ? 0 : 1,
        ...(borderless ? {} : { borderStyle: "round", borderColor: "#0f172a" })
      };

  // Parse action and target from status detail (format: "action:target" or just detail)
  const parseAction = (detail) => {
    if (!detail) return null;
    const match = detail.match(/^(\w+):(.+)$/);
    if (match) {
      return { action: match[1], target: match[2] };
    }
    return { action: statusId, target: detail };
  };

  const parsedAction = parseAction(statusDetail);
  const actionDisplay = parsedAction
    ? formatAction(parsedAction.action, parsedAction.target, isActive ? "running" : "done")
    : null;

  if (compact) {
    return e(
      Box,
      containerProps,
      e(Text, { color: statusColor }, isActive ? "●" : "✓"),
      actionDisplay
        ? e(Text, { color: statusColor, bold: isActive }, actionDisplay.text)
        : e(Text, { color: statusColor, bold: isActive }, statusLabel)
    );
  }

  return e(
    Box,
    containerProps,
    // Header with status
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "row", gap: 1, alignItems: "center" },
        e(Text, { color: "#64748b" }, "Engine Status"),
        isActive && e(Text, { color: statusColor }, "·"),
        isActive && e(Text, { color: TASK_STATE.OBSERVATION }, "...")
      ),
      e(Text, { color: "#475569" }, getCachedTime())
    ),

    // Current Status Display - format: ● Action([target])
    e(
      Box,
      { flexDirection: "row", gap: 1, marginBottom: 1 },
      isActive && actionDisplay
        ? e(Text, { color: TASK_STATE.OBSERVATION }, "...")
        : e(Text, { color: statusColor, bold: true }, isActive ? "●" : "✓"),
      actionDisplay
        ? e(Text, { color: isActive ? "#94a3b8" : statusColor, bold: isActive }, actionDisplay.text)
        : e(Text, { color: statusColor, bold: true }, statusLabel)
    ),

    // Live action output (streaming)
    actionStreamingText && e(
      Box,
      { flexDirection: "row", gap: 1, marginBottom: 1 },
      e(Text, { color: TASK_STATE.OBSERVATION }, "..."),
      e(Text, { color: "#94a3b8", wrap: "wrap" }, actionStreamingText.slice(-160))
    ),

    // Current Plan (if any)
    currentPlan && e(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      e(Text, { color: "#64748b" }, "PLAN"),
      e(
        Box,
        { marginLeft: 2, flexDirection: "column" },
        ...(Array.isArray(currentPlan) ? currentPlan : [currentPlan])
          .slice(0, 3)
          .map((step, i) => e(
            Box,
            { key: i, flexDirection: "row", gap: 1 },
            e(Text, { color: "#f59e0b" }, `${i + 1}.`),
            e(Text, { color: "#94a3b8" }, typeof step === "string" ? step.slice(0, 40) : step.title?.slice(0, 40) || "Step")
          ))
      )
    ),

    // Current Work (if any)
    currentWork && e(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      e(Text, { color: "#64748b" }, "WORKING ON"),
      e(Text, { color: "#e2e8f0", marginLeft: 2 }, currentWork.slice(0, 50))
    ),

    // Active Projects
    projects.length > 0 && e(
      Box,
      { flexDirection: "column" },
      e(Text, { color: "#64748b" }, "ACTIVE PROJECTS"),
      e(
        Box,
        { flexDirection: "column", marginLeft: 2 },
        ...projects.slice(0, 3).map((project, i) => e(
          Box,
          { key: project.id || i, flexDirection: "row", gap: 1 },
          e(Text, { color: project.isActive ? "#22c55e" : "#475569" }, project.isActive ? "▶" : "○"),
          e(Text, { color: project.isActive ? "#e2e8f0" : "#94a3b8" }, project.name?.slice(0, 20) || project.id),
          e(Text, { color: "#475569" }, `(${project.messageCount || 0} msgs)`)
        ))
      )
    )
  );
};

/**
 * Compact status line for header/footer use
 * Colors: WHITE = observation, GRAY = working, GREEN = done, RED = error
 */
const EngineStatusLineBase = ({ status = {}, showSpinner = true }) => {
  const statusId = status?.id || "idle";
  const statusDetail = status?.detail || null;
  const statusColor = STATUS_COLORS[statusId] || TASK_STATE.DONE;
  const statusIcon = STATUS_ICONS[statusId] || "●";
  const statusLabel = STATUS_LABELS[statusId] || "Ready";
  const isActive = statusId !== "idle" && statusId !== "waiting";

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    isActive && showSpinner
      ? e(Text, { color: TASK_STATE.OBSERVATION }, "...")
      : e(Text, { color: statusColor }, statusIcon),
    e(Text, { color: statusColor, bold: isActive }, statusLabel),
    statusDetail && e(Text, { color: "#64748b" }, `· ${statusDetail.slice(0, 25)}`)
  );
};

/**
 * Custom comparison for EngineStatusPanel
 */
const areEngineStatusPropsEqual = (prevProps, nextProps) => {
  if (prevProps.borderless !== nextProps.borderless) return false;
  // Only re-render if actual status changes
  if (prevProps.status?.id !== nextProps.status?.id) return false;
  if (prevProps.status?.detail !== nextProps.status?.detail) return false;
  if (prevProps.compact !== nextProps.compact) return false;
  if (prevProps.currentWork !== nextProps.currentWork) return false;
  if (prevProps.actionStreamingText !== nextProps.actionStreamingText) return false;

  // Compare plans length and content
  const prevPlan = prevProps.currentPlan || [];
  const nextPlan = nextProps.currentPlan || [];
  if (prevPlan.length !== nextPlan.length) return false;

  // Compare projects length
  const prevProjects = prevProps.projects || [];
  const nextProjects = nextProps.projects || [];
  if (prevProjects.length !== nextProjects.length) return false;

  return true;
};

// Memoized exports to prevent flickering
export const EngineStatusPanel = memo(EngineStatusPanelBase, areEngineStatusPropsEqual);
export const EngineStatusLine = memo(EngineStatusLineBase);

export default EngineStatusPanel;
