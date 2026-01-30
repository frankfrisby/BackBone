/**
 * App Footer Bar Component - Tier, View Mode, Cron, Shortcuts
 *
 * Receives data as props from parent.
 * Displays tier indicator, view mode, cron status, and keyboard shortcuts.
 */

import React, { memo } from "react";
import { Box, Text } from "ink";
import { getCronManager } from "../services/cron-manager.js";

const e = React.createElement;

// Model tiers configuration
const MODEL_TIERS = {
  low: { label: "Low", color: "#64748b" },
  medium: { label: "Medium", color: "#f59e0b" },
  high: { label: "High", color: "#22c55e" },
};

// View mode labels
const VIEW_MODE_LABELS = {
  core: "Core",
  advanced: "Advanced",
  minimal: "Minimal",
};

/**
 * App Footer Bar - Shows tier, view mode, cron, and keyboard shortcuts
 *
 * Props:
 * - currentTier: "low" | "medium" | "high"
 * - viewMode: "core" | "advanced" | "minimal"
 * - privateMode: boolean
 * - firebaseUser: User object or null
 */
/**
 * Get SPY score color — maps 1-10 score to a color indicating market direction.
 * 8-10: bright green (bullish)
 * 6-7.9: green (positive)
 * 4-5.9: yellow (neutral/mixed)
 * 2-3.9: orange (bearish)
 * 0-1.9: red (very bearish)
 */
const getSpyScoreColor = (score) => {
  if (score == null) return "#64748b";
  if (score >= 8) return "#22c55e";
  if (score >= 6) return "#4ade80";
  if (score >= 4) return "#eab308";
  if (score >= 2) return "#f97316";
  return "#ef4444";
};

const AppFooterBarBase = ({
  currentTier = "medium",
  viewMode = "core",
  privateMode = false,
  firebaseUser = null,
  spyScore = null,
  spyChange = null,
}) => {
  const tierConfig = MODEL_TIERS[currentTier] || MODEL_TIERS.medium;
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
    // Left side: Tier, View mode, Cron, SPY
    e(
      Box,
      { flexDirection: "row", gap: 2 },
      e(Text, { color: "#64748b" }, "Tier:"),
      e(Text, { color: tierConfig.color, bold: true }, tierConfig.label),
      e(Text, { color: "#334155" }, "|"),
      e(Text, { color: "#64748b" }, "View:"),
      e(Text, { color: "#3b82f6", bold: true }, VIEW_MODE_LABELS[viewMode] || "Core"),
      privateMode && e(Text, { color: "#f59e0b", bold: true }, " [PRIVATE]"),
      e(Text, { color: "#334155" }, "|"),
      (() => {
        try {
          const cronData = getCronManager().getDisplayData();
          const nextJob = cronData.nextJob;
          return [
            e(Text, { key: "ci", color: "#64748b" }, "⏰"),
            e(Text, { key: "cc", color: "#94a3b8" }, ` ${cronData.completedToday}/${cronData.todayCount}`),
            nextJob && e(Text, { key: "cs", color: "#334155" }, " |"),
            nextJob && e(Text, { key: "cn", color: "#f59e0b" }, ` ${nextJob.shortName}`),
            nextJob?.time && e(Text, { key: "ct", color: "#94a3b8" }, ` ${nextJob.time}`)
          ].filter(Boolean);
        } catch {
          return e(Text, { color: "#64748b" }, "⏰ --");
        }
      })(),
      // SPY market prediction score
      e(Text, { color: "#334155" }, "|"),
      e(Text, { color: "#64748b" }, "SPY"),
      spyScore != null
        ? e(Text, { color: spyColor, bold: true }, ` ${spyScore.toFixed(1)}`)
        : e(Text, { color: "#475569" }, " --"),
      spyChange != null && e(Text, { color: spyChangeColor },
        ` ${spyChange >= 0 ? "+" : ""}${spyChange.toFixed(1)}%`)
    ),
    // Right side: Keyboard shortcuts
    e(
      Box,
      { flexDirection: "row", gap: 3 },
      e(Text, { color: "#475569" }, "Ctrl+T"),
      e(Text, { color: "#64748b" }, "tier"),
      e(Text, { color: "#334155" }, ""),
      e(Text, { color: "#3b82f6" }, "Ctrl+U"),
      e(Text, { color: "#64748b" }, "view"),
      e(Text, { color: "#334155" }, ""),
      e(Text, { color: "#38bdf8" }, "Ctrl+S"),
      e(Text, { color: "#64748b" }, "setup"),
      e(Text, { color: "#334155" }, ""),
      e(Text, { color: privateMode ? "#f59e0b" : "#475569" }, "Ctrl+R"),
      e(Text, { color: privateMode ? "#f59e0b" : "#64748b" }, "private"),
      e(Text, { color: "#334155" }, ""),
      firebaseUser
        ? e(Text, { color: "#22c55e" }, "O logout")
        : e(Text, { color: "#f97316" }, "L login"),
      e(Text, { color: "#334155" }, ""),
      e(Text, { color: "#475569" }, "/help"),
      e(Text, { color: "#64748b" }, "commands")
    )
  );
};

// Memoize to prevent unnecessary re-renders
export const AppFooterBar = memo(AppFooterBarBase);

export default AppFooterBar;
