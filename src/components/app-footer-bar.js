/**
 * App Footer Bar Component - Tier, View Mode, Shortcuts
 *
 * Self-contained component that subscribes to its own state slices.
 * Displays tier indicator, view mode, and keyboard shortcuts.
 */

import React, { memo } from "react";
import { Box, Text } from "ink";
import { useAppStore, STATE_SLICES } from "../hooks/useAppStore.js";

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
 * App Footer Bar - Shows tier, view mode, and keyboard shortcuts
 */
const AppFooterBarBase = () => {
  // Subscribe to UI state
  const uiState = useAppStore(STATE_SLICES.UI);
  const userState = useAppStore(STATE_SLICES.USER);

  const { currentTier, viewMode, privateMode } = uiState;
  const { firebaseUser } = userState;

  const tierConfig = MODEL_TIERS[currentTier] || MODEL_TIERS.medium;

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
    // Left side: Tier and View mode
    e(
      Box,
      { flexDirection: "row", gap: 2 },
      e(Text, { color: "#64748b" }, "Tier:"),
      e(Text, { color: tierConfig.color, bold: true }, tierConfig.label),
      e(Text, { color: "#334155" }, "|"),
      e(Text, { color: "#64748b" }, "View:"),
      e(Text, { color: "#3b82f6", bold: true }, VIEW_MODE_LABELS[viewMode] || "Core"),
      privateMode && e(Text, { color: "#f59e0b", bold: true }, " [PRIVATE]")
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
