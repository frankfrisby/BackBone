import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

// Project status colors
const STATUS_COLORS = {
  active: "#22c55e",
  paused: "#eab308",
  blocked: "#ef4444",
  completed: "#8b5cf6",
  planning: "#3b82f6"
};

// Project status icons
const STATUS_ICONS = {
  active: "\u25B6",   // Play
  paused: "\u25A0",   // Pause
  blocked: "\u25CF",  // Dot
  completed: "\u2713", // Check
  planning: "\u25CB"  // Circle
};

/**
 * Progress Bar - ████░░░░ style
 */
const ProgressBar = ({ progress = 0, width = 8, color = "#22c55e" }) => {
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
 * Projects Panel - Shows 1-5 active projects with progress
 */
export const ProjectsPanel = ({ projects = [], title = "Projects", maxItems = 5 }) => {
  // Filter to show only active/in-progress projects
  const activeProjects = projects
    .filter(p => p.status !== "completed" || p.showCompleted)
    .slice(0, maxItems);

  // Empty state - all projects achieved or none exist
  if (activeProjects.length === 0) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#1e293b",
        padding: 1
      },
      e(
        Box,
        { marginBottom: 1 },
        e(Text, { color: "#64748b" }, title)
      ),
      e(
        Box,
        { flexDirection: "column", paddingLeft: 1 },
        projects.length > 0
          ? e(
              Box,
              { flexDirection: "column" },
              e(Text, { color: "#22c55e" }, "All caught up!"),
              e(Text, { color: "#475569", dimColor: true }, ""),
              e(Text, { color: "#64748b" }, "Everything is achieved."),
              e(Text, { color: "#64748b" }, "What should we tackle next?"),
              e(Text, { color: "#475569", dimColor: true }, ""),
              e(Text, { color: "#64748b", italic: true }, "Run /project new <name>")
            )
          : e(
              Box,
              { flexDirection: "column" },
              e(Text, { color: "#94a3b8" }, "No active projects"),
              e(Text, { color: "#475569", dimColor: true }, ""),
              e(Text, { color: "#64748b" }, "Projects help you break"),
              e(Text, { color: "#64748b" }, "goals into actionable work."),
              e(Text, { color: "#475569", dimColor: true }, ""),
              e(Text, { color: "#64748b", italic: true }, "Run /project new <name>")
            )
      )
    );
  }

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#1e293b",
      padding: 1
    },
    // Header with count
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#64748b" }, title),
      e(Text, { color: "#475569" }, `${activeProjects.length}/${projects.length}`)
    ),
    // Projects list
    e(
      Box,
      { flexDirection: "column" },
      ...activeProjects.map((project, i) => {
        const status = project.status || "active";
        const color = STATUS_COLORS[status] || "#64748b";
        const icon = STATUS_ICONS[status] || "\u25CF";
        const progress = project.progress || 0;
        const pct = Math.round(progress * 100);
        const name = (project.name || project.title || `Project ${i + 1}`).slice(0, 14);

        return e(
          Box,
          { key: project.id || i, flexDirection: "row", justifyContent: "space-between" },
          // Left: status icon + name
          e(
            Box,
            { flexDirection: "row", width: 17 },
            e(Text, { color }, icon + " "),
            e(Text, { color: "#94a3b8" }, name)
          ),
          // Center: progress bar
          e(ProgressBar, { progress, width: 6, color }),
          // Right: percentage
          e(Text, { color: "#475569" }, `${String(pct).padStart(3)}%`)
        );
      })
    )
  );
};

/**
 * Project Summary - Compact single-line view
 */
export const ProjectSummary = ({ projects = [] }) => {
  const active = projects.filter(p => p.status === "active").length;
  const total = projects.length;

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    e(Text, { color: "#475569" }, "Projects:"),
    e(Text, { color: active > 0 ? "#22c55e" : "#64748b" }, `${active}`),
    e(Text, { color: "#475569" }, `/ ${total} active`)
  );
};

export default ProjectsPanel;
