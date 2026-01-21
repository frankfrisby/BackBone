import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

const e = React.createElement;

// Status colors from engine-state
const STATUS_COLORS = {
  starting: "#f59e0b",
  researching: "#38bdf8",
  thinking: "#a78bfa",
  planning: "#60a5fa",
  building: "#22c55e",
  working: "#f97316",
  reflecting: "#ec4899",
  updating: "#eab308",
  connecting: "#06b6d4",
  connecting_agent: "#8b5cf6",
  connecting_provider: "#3b82f6",
  running_cron: "#64748b",
  closing: "#ef4444",
  idle: "#22c55e",
  waiting: "#94a3b8",
  analyzing: "#14b8a6",
  executing: "#22c55e",
  learning: "#f472b6",
  syncing: "#06b6d4"
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

// Status labels for display
const STATUS_LABELS = {
  starting: "Starting up Engine",
  researching: "Researching",
  thinking: "Thinking",
  planning: "Planning",
  building: "Building",
  working: "Working",
  reflecting: "Reflecting",
  updating: "Updating",
  connecting: "Connecting",
  connecting_agent: "Connecting to Agent",
  connecting_provider: "Connecting to Provider",
  running_cron: "Running Cron Services",
  closing: "Closing Down Engine",
  idle: "Ready",
  waiting: "Waiting",
  analyzing: "Analyzing",
  executing: "Executing",
  learning: "Learning",
  syncing: "Syncing"
};

/**
 * Engine Status Panel - Shows what the AI is currently doing
 * Replaces the generic "Actions" panel with meaningful status
 */
export const EngineStatusPanel = ({
  status = {},
  currentPlan = null,
  currentWork = null,
  projects = [],
  compact = false
}) => {
  const statusId = status?.id || "idle";
  const statusDetail = status?.detail || null;
  const statusColor = STATUS_COLORS[statusId] || "#64748b";
  const statusIcon = STATUS_ICONS[statusId] || "●";
  const statusLabel = STATUS_LABELS[statusId] || "Ready";
  const isActive = statusId !== "idle" && statusId !== "waiting";

  if (compact) {
    return e(
      Box,
      { flexDirection: "row", gap: 1, paddingX: 1 },
      isActive
        ? e(Spinner, { type: "dots" })
        : e(Text, { color: statusColor }, statusIcon),
      e(Text, { color: statusColor, bold: isActive }, statusLabel),
      statusDetail && e(Text, { color: "#94a3b8" }, ` · ${statusDetail.slice(0, 30)}`)
    );
  }

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: isActive ? statusColor : "#1e293b",
      padding: 1,
      marginBottom: 1
    },
    // Header with status
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "row", gap: 1, alignItems: "center" },
        e(Text, { color: "#64748b" }, "Engine Status"),
        isActive && e(Text, { color: statusColor }, "·"),
        isActive && e(Spinner, { type: "dots" })
      ),
      e(Text, { color: "#475569" }, new Date().toLocaleTimeString())
    ),

    // Current Status Display
    e(
      Box,
      { flexDirection: "row", gap: 1, marginBottom: 1 },
      e(Text, { color: statusColor, bold: true }, statusIcon),
      e(Text, { color: statusColor, bold: true }, statusLabel),
      statusDetail && e(Text, { color: "#94a3b8" }, "..."),
    ),

    // Status Detail (what specifically is being done)
    statusDetail && e(
      Box,
      { marginBottom: 1, marginLeft: 2 },
      e(Text, { color: "#e2e8f0" }, statusDetail)
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
 */
export const EngineStatusLine = ({ status = {}, showSpinner = true }) => {
  const statusId = status?.id || "idle";
  const statusDetail = status?.detail || null;
  const statusColor = STATUS_COLORS[statusId] || "#64748b";
  const statusIcon = STATUS_ICONS[statusId] || "●";
  const statusLabel = STATUS_LABELS[statusId] || "Ready";
  const isActive = statusId !== "idle" && statusId !== "waiting";

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    isActive && showSpinner
      ? e(Spinner, { type: "dots" })
      : e(Text, { color: statusColor }, statusIcon),
    e(Text, { color: statusColor, bold: isActive }, statusLabel),
    statusDetail && e(Text, { color: "#64748b" }, `· ${statusDetail.slice(0, 25)}`)
  );
};

export default EngineStatusPanel;
