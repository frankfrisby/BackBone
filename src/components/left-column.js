/**
 * Left Column Component - Progress, Goals, Tickers, Projects
 *
 * Receives data as props from parent to avoid store sync timing issues.
 * Uses coordinated updates for frequently changing data.
 */

import React, { memo, useMemo } from "react";
import { Box } from "ink";
import { useCoordinatedUpdates } from "../hooks/useCoordinatedUpdates.js";

// Import child components
import { LifeScoresPanel } from "./life-scores-panel.js";
import OuraHealthPanel from "./oura-health-panel.js";
import { GoalProgressPanel } from "./goal-progress-panel.js";
import { TickerScoresPanel } from "./ticker-scores-panel.js";
import { ProjectsPanel } from "./projects-panel.js";

// Import services for direct subscriptions
import { getLifeScores } from "../services/life-scores.js";
import { getGoalTracker } from "../services/goal-tracker.js";

const e = React.createElement;

// View mode constants
const VIEW_MODES = {
  CORE: "core",
  ADVANCED: "advanced",
  MINIMAL: "minimal",
};

/**
 * Left Column - Progress, Goals, Tickers, Projects
 *
 * Props:
 * - viewMode: "core" | "advanced" | "minimal"
 * - ouraHealth: Oura health data
 * - ouraHistory: Oura history data
 * - tickers: Array of ticker data with scores
 * - projects: Array of project data
 * - uiClock: Timestamp for ticker panel updates
 */
const LeftColumnBase = ({
  viewMode = VIEW_MODES.CORE,
  ouraHealth,
  ouraHistory,
  tickers = [],
  projects = [],
  uiClock,
}) => {
  // Use coordinated updates for frequently changing data (like activity narrator pattern)
  const lifeScores = getLifeScores();
  const goalTracker = getGoalTracker();

  const lifeScoresData = useCoordinatedUpdates(
    "life-scores-left",
    () => lifeScores.getDisplayData(),
    { initialData: lifeScores.getDisplayData() }
  ) || lifeScores.getDisplayData();

  const goalsData = useCoordinatedUpdates(
    "goals-left",
    () => goalTracker.getDisplayData(),
    { initialData: goalTracker.getDisplayData() }
  ) || goalTracker.getDisplayData();

  // Compute top tickers (memoized)
  const topTickers = useMemo(() => {
    if (!tickers || tickers.length === 0) return [];
    return [...tickers]
      .filter((t) => typeof t.score === "number")
      .sort((a, b) => b.score - a.score)
      .slice(0, viewMode === VIEW_MODES.MINIMAL ? 3 : viewMode === VIEW_MODES.ADVANCED ? 20 : 10);
  }, [tickers, viewMode]);

  return e(
    Box,
    { flexDirection: "column", width: "100%", overflow: "hidden" },

    // Life Scores Panel
    e(LifeScoresPanel, {
      data: lifeScoresData,
      title: "Progress",
      compact: true,
    }),

    // Oura Health Panel
    e(OuraHealthPanel, {
      data: ouraHealth,
      history: ouraHistory,
    }),

    // Goal Progress Panel (show top 2 goals)
    e(GoalProgressPanel, {
      goals: Array.isArray(goalsData) ? goalsData.slice(0, 2) : [],
      title: "Goals",
    }),

    // Ticker Scores Panel
    e(TickerScoresPanel, {
      tickers: topTickers,
      title: "Ticker Scores",
      viewMode: viewMode,
      maxItems: viewMode === VIEW_MODES.MINIMAL ? 3 : viewMode === VIEW_MODES.ADVANCED ? 20 : 10,
      compact: viewMode === VIEW_MODES.MINIMAL,
      timestamp: uiClock,
    }),

    // Projects Panel (only in advanced mode)
    viewMode === VIEW_MODES.ADVANCED &&
      e(ProjectsPanel, {
        projects: projects?.slice(0, 3) || [],
        title: "Active Projects",
        maxItems: 3,
      })
  );
};

// Memoize to prevent unnecessary re-renders from parent
export const LeftColumn = memo(LeftColumnBase);

export default LeftColumn;
