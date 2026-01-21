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

export const PortfolioPanel = ({ portfolio: inputPortfolio = {}, formatPercent, tradingStatus, lastUpdatedAgo, nextTradeTime, privateMode = false }) => {
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
      e(Box, { marginBottom: 1 }, e(Text, { color: "#334155" }, "\u2500".repeat(24))),
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
      height: 14,
      overflow: "hidden"
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
    // P/L Summary
    e(
      Box,
      { flexDirection: "column" },
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#64748b" }, "Day P/L"),
        e(
          Text,
          { color: privateMode ? "#64748b" : (portfolio.dayChange >= 0 ? "#22c55e" : "#ef4444") },
          privateMode ? "$•••• (••••%)" : `${portfolio.dayChangeDollar} (${formatPercent(portfolio.dayChange)})`
        )
      ),
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#64748b" }, "Total P/L"),
        e(
          Text,
          { color: privateMode ? "#64748b" : (portfolio.totalChange >= 0 ? "#22c55e" : "#ef4444") },
          privateMode ? "$•••• (••••%)" : `${portfolio.totalChangeDollar} (${formatPercent(portfolio.totalChange)})`
        )
      )
    ),
    // Positions section (only if we have positions)
    hasPositions
      ? e(
          Box,
          { flexDirection: "column", marginTop: 1 },
          e(Box, { marginBottom: 1 }, e(Text, { color: "#334155" }, "\u2500".repeat(24))),
          // Positions header
          e(
            Box,
            { flexDirection: "row", marginBottom: 1 },
            e(Text, { color: "#475569" }, " "),
            e(Text, { color: "#475569" }, "SYM".padEnd(5)),
            e(Text, { color: "#475569" }, "QTY".padStart(4)),
            e(Text, { color: "#475569" }, "MKT VAL".padStart(8)),
            e(Text, { color: "#475569" }, "P/L".padStart(7))
          ),
          // Position rows
          ...portfolio.positions.slice(0, 5).map((position) =>
            e(
              Box,
              { key: position.symbol, flexDirection: "row" },
              // Icon
              e(Text, null, getTickerIcon(position.symbol)),
              // Symbol
              e(Text, { color: "#94a3b8" }, position.symbol.padEnd(5)),
              // Quantity
              e(Text, { color: "#64748b" }, privateMode ? "••••" : String(position.shares).padStart(4)),
              // Market Value
              e(
                Text,
                { color: "#e2e8f0" },
                formatMarketValue(position.marketValue || position.shares * parseFloat(position.lastPrice?.replace(/[$,]/g, "") || 0), privateMode).padStart(8)
              ),
              // P/L %
              e(
                Text,
                { color: privateMode ? "#64748b" : (position.change >= 0 ? "#22c55e" : "#ef4444") },
                privateMode ? "••••%" : formatPercent(position.change).padStart(7)
              )
            )
          ),
          // Today's change indicator
          e(
            Box,
            { marginTop: 1 },
            e(
              Text,
              { color: "#334155", dimColor: true },
              privateMode
                ? "Today: ••••%"
                : ("Today: " +
                    (portfolio.dayChange >= 0 ? "\u25B2" : "\u25BC") +
                    " " +
                    formatPercent(portfolio.dayChange))
            )
          )
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
      e(Box, { marginBottom: 1 }, e(Text, { color: "#334155" }, "\u2500".repeat(24))),
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
