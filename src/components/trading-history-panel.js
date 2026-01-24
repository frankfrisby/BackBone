import React, { memo } from "react";
import { Box, Text } from "ink";

const e = React.createElement;

/**
 * Format date/time for screenshots (cached to prevent re-renders)
 */
let cachedPanelDateTime = "";
let lastPanelDateUpdate = 0;
const formatDateTime = (date = new Date()) => {
  const now = Date.now();
  // Only update every 30 seconds to prevent flickering
  if (now - lastPanelDateUpdate > 30000 || !cachedPanelDateTime) {
    const options = {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    };
    cachedPanelDateTime = date.toLocaleString("en-US", options);
    lastPanelDateUpdate = now;
  }
  return cachedPanelDateTime;
};

// Fixed column widths for alignment
const COL_WEEK = 14;  // "Dec 28-Jan 3" = 14 chars max
const COL_PNL_AMT = 9; // "$1,234" or "($1,234)"
const COL_PNL_PCT = 7; // "+10.5%"
const COL_SPY = 7;    // "+10.5%"
const COL_ICON = 2;   // checkmark/x

/**
 * Format currency - negative values use parentheses: ($500)
 */
const formatMoney = (value, privateMode = false) => {
  if (value === null || value === undefined) return "--";
  if (privateMode) return "$••••";
  const absValue = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  if (value < 0) {
    return `($${absValue})`;
  }
  return `$${absValue}`;
};

/**
 * Format percent with sign
 */
const formatPct = (value, privateMode = false) => {
  if (value === null || value === undefined) return "--";
  if (privateMode) return "••%";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
};

/**
 * Trading History Panel
 * Shows 8 weeks of P&L, SPY comparison, and growth projection
 */
const TradingHistoryPanelBase = ({ tradingHistory, isConnected, timestamp = null, privateMode = false }) => {
  // Don't show if not connected
  if (!isConnected || !tradingHistory) {
    return null;
  }

  const {
    weeks = [],
    totalPnL = 0,
    totalPnLPercent = 0,
    growthRate = 0,
    projectedValue = 0
  } = tradingHistory;

  // Ensure we always have 8 weeks to display
  const displayWeeks = weeks.length > 0 ? weeks : [];

  // Build week rows
  const weekRows = displayWeeks.map((week, index) => {
    const isLive = week.isCurrentWeek;
    const labelColor = isLive ? "#38bdf8" : "#94a3b8"; // Cyan for live, gray for past
    const pnlColor = privateMode ? "#94a3b8" : ((week.pnl || 0) >= 0 ? "#22c55e" : "#ef4444");

    // For current week, append "LIVE" indicator to label
    const weekLabel = isLive
      ? `${(week.label || "--")} \u25CF` // Bullet point for live
      : (week.label || "--");

    return e(
      Box,
      { key: `week-${index}`, flexDirection: "row" },
      // Week label - fixed width, left aligned (cyan + bullet for live week)
      e(Text, { color: labelColor, bold: isLive }, weekLabel.padEnd(COL_WEEK)),
      // P&L dollar amount - fixed width, right aligned
      e(
        Text,
        { color: pnlColor, bold: isLive },
        formatMoney(week.pnl || 0, privateMode).padStart(COL_PNL_AMT)
      ),
      // P&L percent - fixed width, right aligned
      e(
        Text,
        { color: pnlColor, bold: isLive },
        formatPct(week.pnlPercent || 0, privateMode).padStart(COL_PNL_PCT)
      ),
      // SPY return - fixed width, right aligned
      e(
        Text,
        { color: isLive ? "#94a3b8" : "#64748b", bold: isLive },
        formatPct(week.spyReturn || 0, privateMode).padStart(COL_SPY)
      ),
      // Beat/Miss indicator
      e(
        Text,
        { color: privateMode ? "#475569" : (week.beatSpy ? "#22c55e" : "#ef4444"), bold: isLive },
        privateMode ? "".padStart(COL_ICON) : (week.beatSpy ? "\u2713" : "\u2717").padStart(COL_ICON)
      )
    );
  });

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#0f172a",
      paddingX: 1,
      marginTop: 1
    },
    // Header with date/time for screenshots
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#64748b" }, "Trading History (8 Weeks)"),
        e(Text, { color: "#475569" }, `Updated: ${formatDateTime(timestamp ? new Date(timestamp) : new Date())}`)
      )
    ),

    // Total P&L summary
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(Text, { color: "#94a3b8" }, "Total P&L"),
      e(
        Text,
        { color: totalPnL >= 0 ? "#22c55e" : "#ef4444", bold: true },
        `${formatMoney(totalPnL, privateMode)} (${formatPct(totalPnLPercent, privateMode)})`
      )
    ),

    // Growth rate and projection
    e(
      Box,
      { flexDirection: "column", marginY: 1 },
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#64748b" }, "Growth Rate"),
        e(
          Text,
          { color: growthRate >= 0 ? "#22c55e" : "#ef4444" },
          formatPct(growthRate, privateMode)
        )
      ),
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#64748b" }, "Projected (1 Year)"),
        e(
          Text,
          { color: projectedValue >= 0 ? "#e2e8f0" : "#ef4444" },
          formatMoney(projectedValue, privateMode)
        )
      )
    ),

    // Separator
    e(Box, { marginY: 1 }, e(Text, { color: "#334155" }, "\u2500".repeat(COL_WEEK + COL_PNL_AMT + COL_PNL_PCT + COL_SPY + COL_ICON))),

    // Weekly table header
    e(
      Box,
      { flexDirection: "row", marginBottom: 1 },
      e(Text, { color: "#475569" }, "Week".padEnd(COL_WEEK)),
      e(Text, { color: "#475569" }, "P&L".padStart(COL_PNL_AMT)),
      e(Text, { color: "#475569" }, "%".padStart(COL_PNL_PCT)),
      e(Text, { color: "#475569" }, "SPY".padStart(COL_SPY)),
      e(Text, { color: "#475569" }, "".padStart(COL_ICON))
    ),

    // All 8 weekly rows
    ...weekRows,

    // Legend
    e(
      Box,
      { marginTop: 1, flexDirection: "column" },
      !privateMode && e(Text, { color: "#475569", dimColor: true }, "\u2713 Beat SPY  \u2717 Missed SPY"),
      e(Text, { color: "#38bdf8", dimColor: true }, "\u25CF Current week (real-time)")
    )
  );
};

/**
 * Custom comparison to prevent unnecessary re-renders
 */
const areTradingHistoryPropsEqual = (prevProps, nextProps) => {
  if (prevProps.privateMode !== nextProps.privateMode) return false;
  if (prevProps.isConnected !== nextProps.isConnected) return false;

  const prevHistory = prevProps.tradingHistory;
  const nextHistory = nextProps.tradingHistory;

  if (!prevHistory && !nextHistory) return true;
  if (!prevHistory || !nextHistory) return false;

  // Compare key values
  if (prevHistory.totalPnL !== nextHistory.totalPnL) return false;
  if (prevHistory.totalPnLPercent !== nextHistory.totalPnLPercent) return false;
  if (prevHistory.growthRate !== nextHistory.growthRate) return false;

  // Compare weeks length
  const prevWeeks = prevHistory.weeks || [];
  const nextWeeks = nextHistory.weeks || [];
  if (prevWeeks.length !== nextWeeks.length) return false;

  // Check current week for real-time updates (P&L changes)
  const prevCurrentWeek = prevWeeks.find(w => w.isCurrentWeek);
  const nextCurrentWeek = nextWeeks.find(w => w.isCurrentWeek);
  if (prevCurrentWeek && nextCurrentWeek) {
    // Round to 1 decimal to avoid flickering from tiny changes
    const prevPnl = Math.round((prevCurrentWeek.pnl || 0) * 10) / 10;
    const nextPnl = Math.round((nextCurrentWeek.pnl || 0) * 10) / 10;
    if (prevPnl !== nextPnl) return false;
  }

  // NOTE: timestamp intentionally ignored - formatDateTime has internal caching

  return true;
};

// Memoized export to prevent flickering
export const TradingHistoryPanel = memo(TradingHistoryPanelBase, areTradingHistoryPropsEqual);
