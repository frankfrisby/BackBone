/**
 * Left Column Component - Progress, Goals, Tickers, Projects
 *
 * Self-contained component that subscribes to its own state slices.
 * Updates to other parts of the app don't cause this to re-render.
 */

import React, { memo, useMemo } from "react";
import { Box } from "ink";
import { useAppStore, useAppStoreMultiple, STATE_SLICES } from "../hooks/useAppStore.js";
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
 * Left Column - subscribes to life scores, goals, health, tickers, projects
 */
const LeftColumnBase = ({ viewMode = VIEW_MODES.CORE }) => {
  // Subscribe to store slices we need
  const healthState = useAppStore(STATE_SLICES.HEALTH);
  const tickersState = useAppStore(STATE_SLICES.TICKERS);
  const projectsState = useAppStore(STATE_SLICES.PROJECTS);

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

  // Extract needed data
  const { ouraHealth, ouraHistory } = healthState;
  const { tickers } = tickersState;
  const { projects } = projectsState;

  // Compute top tickers (memoized)
  const topTickers = useMemo(() => {
    if (!tickers || tickers.length === 0) return [];
    return [...tickers]
      .filter((t) => typeof t.score === "number")
      .sort((a, b) => b.score - a.score)
      .slice(0, viewMode === VIEW_MODES.MINIMAL ? 3 : viewMode === VIEW_MODES.ADVANCED ? 20 : 10);
  }, [tickers, viewMode]);

  // Get current timestamp for ticker panel
  const uiClock = useMemo(() => Date.now(), []);

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
