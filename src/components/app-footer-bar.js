/**
 * App Footer Bar Component - Data States + Minimal Shortcuts
 *
 * Shows data freshness states (portfolio, health, tickers, goals)
 * and minimal keyboard shortcuts (Ctrl+S setup only).
 */

import React, { memo } from "react";
import { Box, Text } from "ink";
import { getCronManager } from "../services/cron-manager.js";

const e = React.createElement;

/**
 * Get SPY score color — maps 1-10 score to a color indicating market direction.
 */
const getSpyScoreColor = (score) => {
  if (score == null) return "#64748b";
  if (score >= 8) return "#22c55e";
  if (score >= 6) return "#4ade80";
  if (score >= 4) return "#eab308";
  if (score >= 2) return "#f97316";
  return "#ef4444";
};

/**
 * Format a timestamp as relative time (e.g., "2m ago", "1h ago", "3d ago")
 */
const formatAge = (timestamp) => {
  if (!timestamp) return "never";
  const ms = Date.now() - new Date(timestamp).getTime();
  if (ms < 0) return "now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
};

/**
 * Get freshness color — green if recent, yellow if stale, red if very old
 */
const getFreshnessColor = (timestamp, freshMins = 30, staleMins = 120) => {
  if (!timestamp) return "#ef4444";
  const ms = Date.now() - new Date(timestamp).getTime();
  const mins = ms / 60000;
  if (mins < freshMins) return "#22c55e";
  if (mins < staleMins) return "#eab308";
  return "#ef4444";
};

const AppFooterBarBase = ({
  currentTier = "medium",
  viewMode = "core",
  privateMode = false,
  firebaseUser = null,
  spyScore = null,
  spyChange = null,
  // Data freshness timestamps
  portfolioUpdated = null,
  healthUpdated = null,
  tickersUpdated = null,
  goalsCount = null,
  engineStatus = null,
}) => {
  const spyColor = getSpyScoreColor(spyScore);
  const spyChangeColor = spyChange != null ? (spyChange >= 0 ? "#22c55e" : "#ef4444") : "#64748b";

  return e(
    Box,
    {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingX: 2,
      paddingY: 0,
      borderStyle: "single",
      borderColor: "#1e293b",
      borderTop: true,
      borderBottom: false,
      borderLeft: false,
      borderRight: false,
    },
    // Left side: Data states
    e(
      Box,
      { flexDirection: "row", gap: 2 },
      // SPY market score
      e(Text, { color: "#64748b" }, "SPY"),
      spyScore != null
        ? e(Text, { color: spyColor, bold: true }, ` ${spyScore.toFixed(1)}`)
        : e(Text, { color: "#475569" }, " --"),
      spyChange != null && e(Text, { color: spyChangeColor },
        ` ${spyChange >= 0 ? "+" : ""}${spyChange.toFixed(1)}%`),
      e(Text, { color: "#334155" }, "|"),
      // Portfolio freshness
      e(Text, { color: "#64748b" }, "Portfolio "),
      e(Text, { color: getFreshnessColor(portfolioUpdated, 5, 30) },
        formatAge(portfolioUpdated)),
      e(Text, { color: "#334155" }, "|"),
      // Health freshness
      e(Text, { color: "#64748b" }, "Health "),
      e(Text, { color: getFreshnessColor(healthUpdated, 60, 360) },
        formatAge(healthUpdated)),
      e(Text, { color: "#334155" }, "|"),
      // Tickers freshness
      e(Text, { color: "#64748b" }, "Tickers "),
      e(Text, { color: getFreshnessColor(tickersUpdated, 10, 60) },
        formatAge(tickersUpdated)),
      e(Text, { color: "#334155" }, "|"),
      // Cron status
      (() => {
        try {
          const cronData = getCronManager().getDisplayData();
          const nextJob = cronData.nextJob;
          return [
            e(Text, { key: "ci", color: "#64748b" }, "Cron"),
            e(Text, { key: "cc", color: "#94a3b8" }, ` ${cronData.completedToday}/${cronData.todayCount}`),
            nextJob?.time && e(Text, { key: "ct", color: "#94a3b8" }, ` ${nextJob.time}`)
          ].filter(Boolean);
        } catch {
          return e(Text, { color: "#64748b" }, "Cron --");
        }
      })()
    ),
    // Right side: Minimal shortcuts + login state
    e(
      Box,
      { flexDirection: "row", gap: 2 },
      e(Text, { color: "#38bdf8" }, "^S"),
      e(Text, { color: "#64748b" }, "setup"),
      e(Text, { color: "#334155" }, "|"),
      firebaseUser
        ? e(Text, { color: "#22c55e" }, "logged in")
        : e(Text, { color: "#f97316" }, "not logged in")
    )
  );
};

// Memoize to prevent unnecessary re-renders
export const AppFooterBar = memo(AppFooterBarBase);

export default AppFooterBar;
