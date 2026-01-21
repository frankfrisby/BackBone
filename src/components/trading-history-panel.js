import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

// Fixed column widths for alignment
const COL_WEEK = 16;  // "Dec 28-Jan 3" = 14 chars max, plus padding
const COL_PNL = 8;    // "+10.5%" = 7 chars max
const COL_SPY = 8;    // "+10.5%" = 7 chars max
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
export const TradingHistoryPanel = ({ tradingHistory, isConnected }) => {
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
      // P&L percent - fixed width, right aligned
      e(
        Text,
        { color: (week.pnlPercent || 0) >= 0 ? "#22c55e" : "#ef4444" },
        formatPct(week.pnlPercent || 0).padStart(COL_PNL)
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
    // Header
    e(
      Box,
      { marginBottom: 1 },
      e(Text, { color: "#64748b" }, "Trading History (8 Weeks)")
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
    e(Box, { marginY: 1 }, e(Text, { color: "#334155" }, "\u2500".repeat(COL_WEEK + COL_PNL + COL_SPY + COL_ICON))),

    // Weekly table header
    e(
      Box,
      { flexDirection: "row", marginBottom: 1 },
      e(Text, { color: "#475569" }, "Week".padEnd(COL_WEEK)),
      e(Text, { color: "#475569" }, "P&L".padStart(COL_PNL)),
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
