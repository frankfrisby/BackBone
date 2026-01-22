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
  // Only update every 60 seconds to prevent flickering
  if (now - lastPanelDateUpdate > 60000 || !cachedPanelDateTime) {
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
const formatMoney = (value) => {
  if (value === null || value === undefined) return "--";
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
const formatPct = (value) => {
  if (value === null || value === undefined) return "--";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
};

/**
 * Trading History Panel
 * Shows 8 weeks of P&L, SPY comparison, and growth projection
 */
const TradingHistoryPanelBase = ({ tradingHistory, isConnected }) => {
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
  const weekRows = displayWeeks.map((week, index) =>
    e(
      Box,
      { key: `week-${index}`, flexDirection: "row" },
      // Week label - fixed width, left aligned
      e(Text, { color: "#94a3b8" }, (week.label || "--").padEnd(COL_WEEK)),
      // P&L dollar amount - fixed width, right aligned
      e(
        Text,
        { color: (week.pnl || 0) >= 0 ? "#22c55e" : "#ef4444" },
        formatMoney(week.pnl || 0).padStart(COL_PNL_AMT)
      ),
      // P&L percent - fixed width, right aligned
      e(
        Text,
        { color: (week.pnlPercent || 0) >= 0 ? "#22c55e" : "#ef4444" },
        formatPct(week.pnlPercent || 0).padStart(COL_PNL_PCT)
      ),
      // SPY return - fixed width, right aligned
      e(
        Text,
        { color: "#64748b" },
        formatPct(week.spyReturn || 0).padStart(COL_SPY)
      ),
      // Beat/Miss indicator
      e(
        Text,
        { color: week.beatSpy ? "#22c55e" : "#ef4444" },
        (week.beatSpy ? "\u2713" : "\u2717").padStart(COL_ICON)
      )
    )
  );

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#1e293b",
      paddingX: 1,
      marginTop: 1
    },
    // Header with date/time for screenshots
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#64748b" }, "Trading History (8 Weeks)"),
      e(Text, { color: "#8b5cf6", bold: true }, formatDateTime())
    ),

    // Total P&L summary
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(Text, { color: "#94a3b8" }, "Total P&L"),
      e(
        Text,
        { color: totalPnL >= 0 ? "#22c55e" : "#ef4444", bold: true },
        `${formatMoney(totalPnL)} (${formatPct(totalPnLPercent)})`
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
          formatPct(growthRate)
        )
      ),
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#64748b" }, "Projected (1 Year)"),
        e(
          Text,
          { color: projectedValue >= 0 ? "#e2e8f0" : "#ef4444" },
          formatMoney(projectedValue)
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
      { marginTop: 1 },
      e(Text, { color: "#475569", dimColor: true }, "\u2713 Beat SPY  \u2717 Missed SPY")
    )
  );
};

/**
 * Custom comparison to prevent unnecessary re-renders
 */
const areTradingHistoryPropsEqual = (prevProps, nextProps) => {
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

  return true;
};

// Memoized export to prevent flickering
export const TradingHistoryPanel = memo(TradingHistoryPanelBase, areTradingHistoryPropsEqual);
