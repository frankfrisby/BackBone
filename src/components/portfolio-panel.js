import React from "react";
import { Box, Text } from "ink";
import { getTickerIcon } from "../data/tickers.js";

const e = React.createElement;

const statusColor = (status) => {
  if (status === "Live") return "#22c55e";
  if (status === "Connecting...") return "#3b82f6";
  if (status === "Missing keys") return "#f97316";
  if (status === "Offline") return "#ef4444";
  return "#64748b";
};

const statusIcon = (status) => {
  if (status === "Live") return "\u25CF";
  return "\u25CB";
};

/**
 * Format currency with proper notation
 * @param {number|string} value - The value to format
 * @param {boolean} privateMode - If true, mask the value with dots
 */
const formatCurrency = (value, privateMode = false) => {
  if (value === null || value === undefined) return "--";
  if (privateMode) return "$••••••";
  const num = typeof value === "string" ? parseFloat(value.replace(/[$,]/g, "")) : value;
  if (isNaN(num)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
};

/**
 * Format market value
 * @param {number|string} value - The value to format
 * @param {boolean} privateMode - If true, mask the value
 */
const formatMarketValue = (value, privateMode = false) => {
  if (value === null || value === undefined) return "--";
  if (privateMode) return "$••••";
  const num = typeof value === "string" ? parseFloat(value.replace(/[$,]/g, "")) : value;
  if (isNaN(num)) return "--";

  if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `$${(num / 1000).toFixed(1)}K`;
  }
  return `$${num.toFixed(0)}`;
};

/**
 * Position action bar - 4 bars showing score level
 * Bar 1: Red (< 4), Bar 2: Yellow (4-6), Bar 3: Dark Green (6-8), Bar 4: Light Green (>= 8)
 */
const PositionActionBar = ({ score }) => {
  // Determine how many bars are "lit" based on score
  // Score < 4: 1 bar, Score 4-6: 2 bars, Score 6-8: 3 bars, Score >= 8: 4 bars
  let level = 0;
  if (score !== null && score !== undefined) {
    if (score >= 8.0) level = 4;
    else if (score >= 6.0) level = 3;
    else if (score >= 4.0) level = 2;
    else level = 1;
  }

  // Colors for each bar position
  const colors = {
    red: "#ef4444",
    yellow: "#eab308",
    darkGreen: "#16a34a",
    lightGreen: "#22c55e"
  };
  const dimColor = "#334155";

  return e(
    Box,
    { flexDirection: "row" },
    // Bar 1 - Red (sell)
    e(Text, { color: level >= 1 ? colors.red : dimColor }, "█"),
    // Bar 2 - Yellow (hold)
    e(Text, { color: level >= 2 ? colors.yellow : dimColor }, "█"),
    // Bar 3 - Dark Green (keep)
    e(Text, { color: level >= 3 ? colors.darkGreen : dimColor }, "█"),
    // Bar 4 - Light Green (buy)
    e(Text, { color: level >= 4 ? colors.lightGreen : dimColor }, "█")
  );
};

export const PortfolioPanel = ({ portfolio: inputPortfolio = {}, formatPercent, tradingStatus, lastUpdatedAgo, nextTradeTime, privateMode = false, tickerScores = {} }) => {
  // Ensure portfolio has default values
  const portfolio = {
    positions: [],
    equity: "--",
    cash: "--",
    buyingPower: "--",
    dayChange: 0,
    totalChange: 0,
    dayChangeDollar: "--",
    totalChangeDollar: "--",
    status: "Not connected",
    mode: "Paper",
    ...inputPortfolio
  };

  const hasPositions = portfolio.positions && portfolio.positions.length > 0;
  // ALWAYS show data if we have equity or positions - status doesn't matter
  const hasData = portfolio.equity !== "--" || hasPositions;

  // Trading status section builder
  const buildTradingStatusSection = () => {
    if (!tradingStatus) return null;

    return e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      // Separator
      e(Box, { marginBottom: 1 }, e(Text, { color: "#334155" }, "\u2500".repeat(30))),
      // Trading system status
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: tradingStatus.statusColor }, tradingStatus.statusIcon),
        e(Text, { color: tradingStatus.statusColor }, tradingStatus.statusText)
      ),
      // Last attempt (if any)
      tradingStatus.lastAttempt
        ? e(
            Box,
            { flexDirection: "column", marginTop: 1 },
            e(
              Box,
              { flexDirection: "row", gap: 1 },
              e(Text, { color: tradingStatus.lastAttempt.color }, tradingStatus.lastAttempt.icon),
              e(
                Text,
                { color: "#94a3b8" },
                `${tradingStatus.lastAttempt.action?.toUpperCase() || "TRADE"} ${tradingStatus.lastAttempt.symbol || ""}`
              ),
              e(Text, { color: "#475569", dimColor: true }, tradingStatus.lastAttempt.timestamp)
            ),
            e(
              Text,
              { color: "#64748b", dimColor: true, marginLeft: 2 },
              tradingStatus.lastAttempt.message
            )
          )
        : null
    );
  };

  // Build API key display
  const buildKeyDisplay = () => {
    if (!portfolio.apiKeyPreview) return null;
    return e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#64748b" }, "API Key"),
        e(Text, { color: "#94a3b8" }, portfolio.apiKeyPreview)
      ),
      portfolio.apiSecretPreview && e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#64748b" }, "Secret"),
        e(Text, { color: "#94a3b8" }, portfolio.apiSecretPreview)
      )
    );
  };

  // Don't show detailed data if not connected and have no data
  if (!hasData) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#1e293b",
        padding: 1,
        height: 8,
        overflow: "hidden"
      },
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
        e(Text, { color: "#64748b" }, "Portfolio"),
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: statusColor(portfolio.status) }, statusIcon(portfolio.status)),
          e(Text, { color: "#475569", dimColor: true }, portfolio.status || "Not connected")
        )
      ),
      // Show mode if available
      portfolio.mode && e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#64748b" }, "Mode"),
        e(Text, { color: "#94a3b8" }, portfolio.mode)
      ),
      // Show API key info if available
      buildKeyDisplay(),
      // Status messages
      portfolio.status === "Connecting..." && e(
        Text,
        { color: "#3b82f6", marginTop: 1 },
        "Connecting to Alpaca..."
      ),
      portfolio.status === "Offline" && e(
        Text,
        { color: "#f97316", marginTop: 1 },
        "Connection offline. Retrying..."
      ),
      // Prompt to connect only if no keys
      !portfolio.apiKeyPreview && portfolio.status !== "Connecting..." && e(
        Text,
        { color: "#94a3b8", marginTop: 1 },
        "Type → /alpaca to connect"
      ),
      // Trading status even when disconnected
      buildTradingStatusSection()
    );
  }

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#1e293b",
      padding: 1,
      minHeight: 14
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#64748b" }, "Portfolio"),
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: statusColor(portfolio.status) }, statusIcon(portfolio.status)),
        e(Text, { color: "#475569", dimColor: true }, portfolio.mode)
      )
    ),
    // Account summary
    e(
      Box,
      { flexDirection: "column" },
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#94a3b8" }, "Equity"),
        e(Text, { color: "#e2e8f0", bold: true }, privateMode ? "$••••••" : portfolio.equity)
      ),
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#64748b" }, "Cash"),
        e(Text, { color: "#94a3b8" }, privateMode ? "$••••••" : portfolio.cash)
      ),
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#64748b" }, "Buying Power"),
        e(Text, { color: "#94a3b8" }, privateMode ? "$••••••" : portfolio.buyingPower)
      ),
      privateMode && e(
        Box,
        { marginTop: 1 },
        e(Text, { color: "#f59e0b" }, "[PRIVATE MODE]")
      )
    ),
    // Separator
    e(Box, { marginY: 1 }, e(Text, { color: "#334155" }, "\u2500".repeat(24))),
    // Day P/L Summary
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(Text, { color: "#64748b" }, "Day P/L"),
      e(
        Text,
        { color: privateMode ? "#64748b" : (portfolio.dayChange >= 0 ? "#22c55e" : "#ef4444"), bold: true },
        privateMode ? "$•••• (••••%)" : `${portfolio.dayChangeDollar} (${formatPercent(portfolio.dayChange)})`
      )
    ),
    // Positions section (only if we have positions)
    hasPositions
      ? e(
          Box,
          { flexDirection: "column", marginTop: 1 },
          e(Box, { marginBottom: 1 }, e(Text, { color: "#334155" }, "\u2500".repeat(30))),
          // Positions header
          e(
            Box,
            { flexDirection: "row", marginBottom: 1 },
            e(Text, { color: "#475569" }, " "),
            e(Text, { color: "#475569", width: 5 }, "SYM"),
            e(Text, { color: "#475569", width: 4 }, "QTY"),
            e(Text, { color: "#475569", width: 7 }, "VALUE"),
            e(Text, { color: "#475569", width: 6 }, " P/L"),
            e(Text, { color: "#475569", width: 5 }, " ACT")
          ),
          // Position rows with action indicator
          ...portfolio.positions.slice(0, 5).map((position) => {
            const score = tickerScores[position.symbol];
            return e(
              Box,
              { key: position.symbol, flexDirection: "row" },
              // Icon
              e(Text, null, getTickerIcon(position.symbol)),
              // Symbol
              e(Text, { color: "#94a3b8", width: 5 }, position.symbol),
              // Quantity
              e(Text, { color: "#64748b", width: 4 }, privateMode ? "••" : String(position.shares).padStart(3)),
              // Market Value
              e(
                Text,
                { color: "#e2e8f0", width: 7 },
                formatMarketValue(position.marketValue || position.shares * parseFloat(position.lastPrice?.replace(/[$,]/g, "") || 0), privateMode)
              ),
              // P/L %
              e(
                Text,
                { color: privateMode ? "#64748b" : (position.change >= 0 ? "#22c55e" : "#ef4444"), width: 6 },
                privateMode ? "••••" : formatPercent(position.change)
              ),
              // Action indicator (Keep/Hold/Sell)
              e(PositionActionBar, { score })
            );
          }),
        )
      : e(
          Box,
          { marginTop: 1 },
          e(Text, { color: "#64748b", dimColor: true }, "No positions")
        ),
    // Last updated and next trade time
    (lastUpdatedAgo || nextTradeTime) && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Box, { marginBottom: 1 }, e(Text, { color: "#334155" }, "\u2500".repeat(30))),
      lastUpdatedAgo && e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#64748b" }, "Updated"),
        e(Text, { color: "#94a3b8" }, lastUpdatedAgo)
      ),
      nextTradeTime && e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#64748b" }, "Next attempt"),
        e(Text, { color: "#3b82f6" }, nextTradeTime)
      )
    ),
    // Trading status section
    buildTradingStatusSection()
  );
};
