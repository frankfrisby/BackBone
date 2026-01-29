/**
 * Goals Panel Component
 *
 * Displays 2-3 active/on-hold goals on the right side of the engine view.
 * Format:
 *   ● Goal title that can wrap
 *     to two lines if needed
 *     Project Name (gray)
 *
 * Dot colors:
 * - Gray blinking: currently working (first active goal)
 * - Gray solid: pending/waiting
 * - Green: complete (not shown in this list)
 * - Red: failed/blocked
 *
 * Each goal is SPECIFIC (not vague like "make money")
 * Example: "Turn $1,000 into $1M in 1.5 years from Jan 9, 2026"
 */

import React, { memo, useEffect, useState, useCallback, useRef } from "react";
import { Box, Text } from "ink";
import { getGoalTracker, GOAL_STATUS } from "../services/goal-tracker.js";
import { generateGoalsFromData } from "../services/goal-generator.js";
import { getProjectManager } from "../services/project-manager.js";
import { getGoalManager, GOAL_STATE } from "../services/goal-manager.js";

const e = React.createElement;

// Status colors - gray/green/red/yellow scheme
const STATUS_COLORS = {
  pending: "#64748b",     // Gray - waiting
  active: "#64748b",      // Gray (blinking when working) - currently active
  completed: "#22c55e",   // Green - done
  failed: "#ef4444",      // Red - failed
  blocked: "#ef4444",     // Red - blocked
  on_hold: "#f59e0b",     // Amber/yellow - on hold, waiting for something
  partial: "#22c55e"      // Green (for partial fill indicator)
};

// Visual indicators for different states
const STATUS_INDICATORS = {
  pending: "●",           // Solid dot - waiting
  active: "●",            // Solid dot (blinks) - working
  completed: "●",         // Solid green dot - done
  failed: "●",            // Solid red dot - failed
  blocked: "●",           // Solid red dot - blocked
  on_hold: "◐",           // Half-filled circle - on hold/partial (left half filled)
  partial: "◐"            // Half-filled circle - partially complete, waiting
};

/**
 * Truncate text to approximately fit in N lines
 * Assumes ~30 chars per line in the goals panel
 */
const truncateToLines = (text, maxLines, charsPerLine = 30) => {
  const maxChars = maxLines * charsPerLine;
  if (!text || text.length <= maxChars) return text || "";
  return text.slice(0, maxChars - 3).trim() + "...";
};

/**
 * Get the visual state for a goal from the goal manager
 * Returns: "active", "on_hold", "partial", "completed", "failed", "blocked", "pending"
 */
const getGoalVisualState = (goal) => {
  try {
    const goalManager = getGoalManager();
    const status = goalManager.getGoalStatus(goal.id);
    if (status && status.visualState) {
      return status.visualState;
    }
  } catch (e) {
    // Goal manager not available, fall back to basic status
  }

  // Fall back to goal's basic status
  return goal.status || "pending";
};

/**
 * Single Goal Display
 * Format:
 *   ● Goal title (max 2 lines)
 *     Project Name (max 2 lines)
 *
 * Indicators:
 *   ● Solid dot - pending, active, completed, failed
 *   ◐ Half circle - on hold/partial (waiting for something)
 */
const GoalLine = memo(({ goal, isWorking = false, blinkVisible = true, isFirst = false, privateMode = false }) => {
  const basicStatus = goal.status || "pending";

  // Get visual state which considers on-hold and partial completion
  const visualState = getGoalVisualState(goal);

  // Determine color based on visual state
  let dotColor;
  if (visualState === "on_hold" || visualState === "partial") {
    // On-hold uses amber for the filled part
    dotColor = STATUS_COLORS.on_hold;
  } else {
    dotColor = STATUS_COLORS[basicStatus] || STATUS_COLORS.pending;
  }

  // Get the appropriate indicator based on visual state
  // Half-circle (◐) for on_hold/partial, solid dot (●) for others
  const indicator = STATUS_INDICATORS[visualState] || STATUS_INDICATORS.pending;

  // For the first active goal (being worked on), blink the dot
  const shouldBlink = isWorking && (basicStatus === "active" || basicStatus === "pending") && visualState !== "on_hold";
  const showIndicator = shouldBlink ? blinkVisible : true;
  const indicatorColor = showIndicator ? dotColor : "#1e293b";

  // Goal title - max 2 lines (truncate if longer)
  const rawTitle = goal.title || "Untitled Goal";
  const title = truncateToLines(rawTitle, 2);

  // Project name - shown below in gray (max 2 lines)
  const rawProject = goal.project || goal.projectName || goal.category || "General";
  const projectName = truncateToLines(rawProject, 2);

  // Add on-hold reason if available
  let statusNote = "";
  if (visualState === "on_hold" || visualState === "partial") {
    try {
      const goalManager = getGoalManager();
      const status = goalManager.getGoalStatus(goal.id);
      if (status && status.holdInfo?.reason) {
        statusNote = ` (${status.holdInfo.reason.replace(/_/g, " ")})`;
      } else if (visualState === "partial") {
        statusNote = " (partial)";
      }
    } catch (e) {
      // Ignore
    }
  }

  // In private mode, mask goal content
  const displayTitle = privateMode ? "[goal hidden]" : title;
  const displayProject = privateMode ? "[project]" : (projectName + statusNote);

  return e(
    Box,
    { flexDirection: "row", marginBottom: 1 },
    // Left column: indicator (fixed width for grid alignment)
    e(
      Box,
      { width: 2, flexShrink: 0 },
      e(Text, { color: indicatorColor }, indicator)
    ),
    // Right column: goal text and project (can wrap)
    e(
      Box,
      { flexDirection: "column", flexGrow: 1 },
      // Goal title (light gray, can wrap)
      e(Text, { color: privateMode ? "#475569" : "#94a3b8", wrap: "wrap" }, displayTitle),
      // Project name below in darker gray
      e(Text, { color: "#475569", dimColor: true, wrap: "wrap" }, displayProject)
    )
  );
});

/**
 * Goals Panel
 * Shows max 3 non-completed goals (next up / active / on-hold)
 * Completed goals should appear under outcomes instead.
 */
const GoalsPanelBase = ({
  goals = [],
  currentGoalId = null,
  isGenerating = false,
  maxGoals = 3,  // Show 2-3 active/on-hold goals
  privateMode = false
}) => {
  // Blink state for active goal indicator
  const [blinkVisible, setBlinkVisible] = useState(true);

  // Blink effect for working goal - faster blink rate
  useEffect(() => {
    const interval = setInterval(() => {
      setBlinkVisible(v => !v);
    }, 400); // 400ms for more noticeable blink
    return () => clearInterval(interval);
  }, []);

  // Get display goals (limit to maxGoals, exclude completed)
  const displayGoals = goals.filter(g => g.status !== "completed").slice(0, maxGoals);
  const hasGoals = displayGoals.length > 0;

  // Find the first goal to mark as working (if no currentGoalId, use first active goal)
  const workingGoalId = currentGoalId || (displayGoals.find(g => g.status === "active")?.id);

  return e(
    Box,
    { flexDirection: "column" },

    // Header
    e(Text, { color: "#f59e0b", bold: true }, "Goals"),
    e(Text, { color: "#334155" }, "─".repeat(20)),

    // Goals list or empty state
    e(
      Box,
      { flexDirection: "column", marginTop: 1 },

      // Loading state
      isGenerating && e(
        Box,
        { flexDirection: "row" },
        e(Box, { width: 2, flexShrink: 0 }, e(Text, { color: blinkVisible ? "#64748b" : "#1e293b" }, "●")),
        e(
          Box,
          { flexDirection: "column", flexGrow: 1 },
          e(Text, { color: "#64748b", italic: true }, "Analyzing data..."),
          e(Text, { color: "#64748b", dimColor: true }, "Generating goals")
        )
      ),

      // Goals list
      !isGenerating && hasGoals && displayGoals.map((goal, i) =>
        e(GoalLine, {
          key: goal.id || `goal-${i}`,
          goal,
          isWorking: goal.id === workingGoalId,
          blinkVisible,
          isFirst: i === 0,
          privateMode
        })
      ),

      // Empty state
      !isGenerating && !hasGoals && e(
        Box,
        { flexDirection: "row" },
        e(Box, { width: 2, flexShrink: 0 }, e(Text, { color: "#64748b" }, "○")),
        e(
          Box,
          { flexDirection: "column", flexGrow: 1 },
          e(Text, { color: "#64748b" }, "No goals set"),
          e(Text, { color: "#64748b", dimColor: true }, "Run /goals to create")
        )
      )
    )
  );
};

export const GoalsPanel = memo(GoalsPanelBase);

/**
 * Smart Goals Panel with auto-generation and project management
 * Connects to goal manager for real-time updates on working goal
 */
const SmartGoalsPanelBase = ({
  autoGenerate = true,
  onGoalsUpdated = null,
  privateMode = false
}) => {
  const [goals, setGoals] = useState([]);
  const [currentGoalId, setCurrentGoalId] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const initRef = useRef(false);

  // Load goals from tracker and sync with goal manager
  const loadGoals = useCallback(() => {
    try {
      const tracker = getGoalTracker();
      const allGoals = tracker.getAll();

      // Sort: active/on-hold first, then by priority; exclude completed from panel
      const sortedGoals = [...allGoals]
        .filter(g => g.status !== "completed")
        .sort((a, b) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (b.status === "active" && a.status !== "active") return 1;
        if (a.status === "on_hold" && b.status !== "on_hold") return -1;
        if (b.status === "on_hold" && a.status !== "on_hold") return 1;
        return (a.priority || 5) - (b.priority || 5);
      });

      // If no active/on-hold goals, fall back to default projects
      let displayGoals = sortedGoals;
      const hasActiveOrHold = sortedGoals.some(g => g.status === "active" || g.status === "on_hold");
      if (!hasActiveOrHold) {
        try {
          const projectManager = getProjectManager();
          const projects = projectManager.listProjects();
          const fallback = projects
            .slice(0, 3)
            .map((p) => ({
              id: `project-${p.safeName || p.name}`,
              title: p.name,
              project: p.name,
              // Use "partial" for started projects to show half-circle (◐)
              status: p.status === "paused" ? "on_hold" : "partial"
            }));
          if (fallback.length > 0) {
            displayGoals = fallback;
          }
        } catch (e) {
          // Ignore fallback errors
        }
      }

      setGoals(displayGoals);

      // Get current working goal from goal manager (if available)
      try {
        const goalManager = getGoalManager();
        const currentGoal = goalManager.getCurrentGoal();
        if (currentGoal) {
          setCurrentGoalId(currentGoal.id);
        } else {
          // Default to first active goal
          const firstActive = sortedGoals.find(g => g.status === "active");
          setCurrentGoalId(firstActive?.id || sortedGoals[0]?.id || null);
        }
      } catch (e) {
        // Goal manager not available, use first active goal
        const firstActive = sortedGoals.find(g => g.status === "active");
        setCurrentGoalId(firstActive?.id || sortedGoals[0]?.id || null);
      }

      if (onGoalsUpdated) {
        onGoalsUpdated(displayGoals);
      }

      return displayGoals;
    } catch (error) {
      console.error("[GoalsPanel] Failed to load goals:", error.message);
      return [];
    }
  }, [onGoalsUpdated]);

  // Initialize goals and create projects on first load
  const initializeGoals = useCallback(async () => {
    if (initRef.current) return;
    initRef.current = true;

    try {
      const tracker = getGoalTracker();
      const allGoals = tracker.getAll();

      // If we have goals, ensure they have projects
      if (allGoals.length > 0) {
        setIsGenerating(true);

        let projectManager;
        try {
          projectManager = getProjectManager();
        } catch (e) {
          console.error("[GoalsPanel] Project manager not available");
        }

        // Create projects for goals that don't have them
        for (const goal of allGoals) {
          if (projectManager && goal.project) {
            try {
              await projectManager.createProjectForGoal(goal);
            } catch (e) {
              // Project might already exist
            }
          }
        }

        setIsGenerating(false);
        loadGoals();
      } else if (autoGenerate) {
        // No goals - try to generate from data
        setIsGenerating(true);

        try {
          const result = await generateGoalsFromData();

          if (result.success && result.goals.length > 0) {
            let projectManager;
            try {
              projectManager = getProjectManager();
            } catch (e) {
              // Ignore
            }

            for (const goalData of result.goals) {
              const goal = tracker.createGoal({
                title: goalData.title,
                category: goalData.category || "growth",
                description: goalData.rationale || "",
                targetValue: goalData.targetValue,
                unit: goalData.unit,
                priority: goalData.priority || 3,
                project: goalData.project || null
              });

              if (projectManager && goal) {
                try {
                  await projectManager.createProjectForGoal(goal);
                } catch (e) {
                  console.error("[GoalsPanel] Failed to create project:", e.message);
                }
              }
            }
          }
        } catch (error) {
          console.error("[GoalsPanel] Failed to generate goals:", error.message);
        }

        setIsGenerating(false);
        loadGoals();
      }
    } catch (error) {
      console.error("[GoalsPanel] Init error:", error.message);
      setIsGenerating(false);
    }
  }, [autoGenerate, loadGoals]);

  // Initial load
  useEffect(() => {
    loadGoals();
    // Delay initialization to let other systems start
    const timer = setTimeout(initializeGoals, 2000);
    return () => clearTimeout(timer);
  }, [loadGoals, initializeGoals]);

  // Refresh goals periodically and sync with goal manager
  useEffect(() => {
    const interval = setInterval(loadGoals, 5000); // More frequent updates
    return () => clearInterval(interval);
  }, [loadGoals]);

  // Listen for goal manager changes
  useEffect(() => {
    try {
      const goalManager = getGoalManager();

      const handleGoalChanged = ({ currentGoal }) => {
        if (currentGoal) {
          setCurrentGoalId(currentGoal.id);
        }
        loadGoals();
      };

      goalManager.on("goal-changed", handleGoalChanged);
      goalManager.on("goal-completed", loadGoals);
      goalManager.on("goal-added", loadGoals);
      goalManager.on("goal-on-hold", loadGoals);        // Listen for on-hold status changes
      goalManager.on("task-on-hold", loadGoals);        // Listen for task on-hold changes
      goalManager.on("criteria-evaluated", loadGoals);  // Listen for criteria evaluation

      return () => {
        goalManager.off("goal-changed", handleGoalChanged);
        goalManager.off("goal-completed", loadGoals);
        goalManager.off("goal-added", loadGoals);
        goalManager.off("goal-on-hold", loadGoals);
        goalManager.off("task-on-hold", loadGoals);
        goalManager.off("criteria-evaluated", loadGoals);
      };
    } catch (e) {
      // Goal manager not available
    }
  }, [loadGoals]);

  return e(GoalsPanel, {
    goals,
    currentGoalId,
    isGenerating,
    maxGoals: 3,
    privateMode
  });
};

export const SmartGoalsPanel = memo(SmartGoalsPanelBase);

export default GoalsPanel;
