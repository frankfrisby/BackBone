import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

// Project status colors
const STATUS_COLORS = {
  working: "#f59e0b",  // Amber - currently being worked on by engine
  active: "#22c55e",   // Green - active project
  onhold: "#64748b",   // Gray - on hold
  paused: "#eab308",   // Yellow - paused
  blocked: "#ef4444",  // Red - blocked
  completed: "#8b5cf6", // Purple - done
  planning: "#3b82f6"  // Blue - planning
};

// Project status icons
const STATUS_ICONS = {
  working: "\u26A1",   // Lightning bolt - currently working
  active: "\u25B6",    // Play
  onhold: "\u23F8",    // Pause bars
  paused: "\u25A0",    // Square
  blocked: "\u25CF",   // Dot
  completed: "\u2713", // Check
  planning: "\u25CB"   // Circle
};

// Status display labels
const STATUS_LABELS = {
  working: "WORKING",
  active: "Active",
  onhold: "On Hold",
  paused: "Paused",
  blocked: "Blocked",
  completed: "Done",
  planning: "Planning"
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

// Status priority for sorting (lower = higher priority)
const STATUS_PRIORITY = {
  working: 0,
  active: 1,
  onhold: 2,
  paused: 3,
  blocked: 4,
  planning: 5,
  completed: 6
};

/**
 * Projects Panel - Shows top 3 projects by status (working > active > on hold)
 */
export const ProjectsPanel = ({ projects = [], title = "Projects", maxItems = 3, currentWorkingProject = null }) => {
  // Mark the currently working project
  const projectsWithWorkingStatus = projects.map(p => ({
    ...p,
    status: (currentWorkingProject && currentWorkingProject !== "analyzing" &&
             (p.name === currentWorkingProject || p.id === currentWorkingProject ||
              p.name?.includes(currentWorkingProject) || currentWorkingProject.includes(p.name)))
      ? "working"
      : (p.status || "active")
  }));

  // If engine is analyzing but no specific project, add a virtual "analyzing" entry
  const showAnalyzingEntry = currentWorkingProject === "analyzing" &&
    !projectsWithWorkingStatus.some(p => p.status === "working");

  // Filter out completed, sort by priority, take top 3
  // Build the list of projects to show
  let activeProjects = projectsWithWorkingStatus
    .filter(p => p.status !== "completed")
    .sort((a, b) => {
      const priorityA = STATUS_PRIORITY[a.status] ?? 99;
      const priorityB = STATUS_PRIORITY[b.status] ?? 99;
      return priorityA - priorityB;
    })
    .slice(0, maxItems);

  // Add analyzing entry at top if engine is working but no specific project detected
  if (showAnalyzingEntry) {
    activeProjects = [
      { id: "_analyzing", name: "Analyzing...", status: "working" },
      ...activeProjects.slice(0, maxItems - 1)
    ];
  }

  // Empty state - all projects achieved or none exist
  if (activeProjects.length === 0) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#0f172a",
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
      borderColor: "#0f172a",
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
        const statusLabel = STATUS_LABELS[status] || status;
        const name = (project.name || project.title || `Project ${i + 1}`).slice(0, 18);

        return e(
          Box,
          { key: project.id || i, flexDirection: "column", marginBottom: i < activeProjects.length - 1 ? 1 : 0 },
          // Row 1: icon + name
          e(
            Box,
            { flexDirection: "row" },
            e(Text, { color }, icon + " "),
            e(Text, { color: status === "working" ? "#f59e0b" : "#e2e8f0", bold: status === "working" }, name)
          ),
          // Row 2: status label
          e(
            Box,
            { paddingLeft: 2 },
            e(Text, { color, dimColor: status !== "working" }, statusLabel)
          )
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
