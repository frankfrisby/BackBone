/**
 * Goals Panel Component
 *
 * Displays 5-7 goals on the right side of the engine view.
 * Format:
 *   ● Goal title that can wrap
 *     to two lines if needed
 *     Project Name (gray)
 *
 * Dot colors:
 * - Gray blinking: currently working (first active goal)
 * - Gray solid: pending/waiting
 * - Green: complete
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
import { getGoalManager } from "../services/goal-manager.js";

const e = React.createElement;

// Status colors - simple gray/green/red scheme
const STATUS_COLORS = {
  pending: "#64748b",     // Gray - waiting
  active: "#64748b",      // Gray (blinking when working) - currently active
  completed: "#22c55e",   // Green - done
  failed: "#ef4444",      // Red - failed
  blocked: "#ef4444"      // Red - blocked
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
 * Single Goal Display
 * Format:
 *   ● Goal title (max 2 lines)
 *     Project Name (max 2 lines)
 */
const GoalLine = memo(({ goal, isWorking = false, blinkVisible = true, isFirst = false }) => {
  const status = goal.status || "pending";
  const dotColor = STATUS_COLORS[status] || STATUS_COLORS.pending;

  // Always use dot (●) - color indicates status
  // Green dot = completed, Red dot = failed, Gray dot = pending/active
  const indicator = "●";

  // For the first active goal (being worked on), blink the dot
  const shouldBlink = isWorking && (status === "active" || status === "pending");
  const showIndicator = shouldBlink ? blinkVisible : true;
  const indicatorColor = showIndicator ? dotColor : "#1e293b";

  // Goal title - max 2 lines (truncate if longer)
  const rawTitle = goal.title || "Untitled Goal";
  const title = truncateToLines(rawTitle, 2);

  // Project name - shown below in gray (max 2 lines)
  const rawProject = goal.project || goal.projectName || goal.category || "General";
  const projectName = truncateToLines(rawProject, 2);

  return e(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    // Goal line with indicator and title
    e(
      Box,
      { flexDirection: "row" },
      // Indicator dot with space padding (● + space)
      e(Text, { color: indicatorColor }, indicator + " "),
      // Goal title (light gray, can wrap to 2 lines)
      e(Text, { color: "#94a3b8", wrap: "wrap" }, title)
    ),
    // Project name below in darker gray, indented to align with title after dot
    e(
      Box,
      { paddingLeft: 3 },  // Align with title (dot + space = 2, add 1 more)
      e(Text, { color: "#64748b", dimColor: true, wrap: "wrap" }, projectName)
    )
  );
});

/**
 * Goals Panel
 * Shows 5-7 specific goals with project names
 */
const GoalsPanelBase = ({
  goals = [],
  currentGoalId = null,
  isGenerating = false,
  maxGoals = 7
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

  // Get display goals (limit to maxGoals)
  const displayGoals = goals.slice(0, maxGoals);
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
        { flexDirection: "column" },
        e(
          Box,
          { flexDirection: "row" },
          e(Text, { color: blinkVisible ? "#64748b" : "#1e293b" }, "● "),
          e(Text, { color: "#64748b", italic: true }, "Analyzing data...")
        ),
        e(
          Box,
          { paddingLeft: 2 },
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
          isFirst: i === 0
        })
      ),

      // Empty state
      !isGenerating && !hasGoals && e(
        Box,
        { flexDirection: "column" },
        e(
          Box,
          { flexDirection: "row" },
          e(Text, { color: "#64748b" }, "○ "),
          e(Text, { color: "#64748b" }, "No goals set")
        ),
        e(
          Box,
          { paddingLeft: 2 },
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
  onGoalsUpdated = null
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

      // Sort: active first, then by priority
      const sortedGoals = [...allGoals].sort((a, b) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (b.status === "active" && a.status !== "active") return 1;
        return (a.priority || 5) - (b.priority || 5);
      });

      setGoals(sortedGoals);

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
        onGoalsUpdated(sortedGoals);
      }

      return sortedGoals;
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

      return () => {
        goalManager.off("goal-changed", handleGoalChanged);
        goalManager.off("goal-completed", loadGoals);
        goalManager.off("goal-added", loadGoals);
      };
    } catch (e) {
      // Goal manager not available
    }
  }, [loadGoals]);

  return e(GoalsPanel, {
    goals,
    currentGoalId,
    isGenerating,
    maxGoals: 7
  });
};

export const SmartGoalsPanel = memo(SmartGoalsPanelBase);

export default GoalsPanel;
