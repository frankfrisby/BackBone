import React, { memo } from "react";
import { Box, Text } from "ink";
import { getTickerIcon, getMacdColor, getVolumeScoreColor, formatMacd } from "../data/tickers.js";
import { SparklineChart } from "./sparkline-chart.js";

const e = React.createElement;

const scoreColor = (score) => {
  if (score >= 8) return "#22c55e";
  if (score >= 5) return "#eab308";
  return "#f97316";
};

/**
 * Format MACD trend indicator
 */
const getMacdIndicator = (trend) => {
  if (trend === "bullish") return "\u25B2"; // Up triangle
  if (trend === "bearish") return "\u25BC"; // Down triangle
  return "\u25CF"; // Circle for neutral
};

/**
 * Format volume status indicator
 */
const getVolumeIndicator = (status) => {
  if (status === "high") return "\u2191\u2191"; // Double up arrow
  if (status === "above_avg") return "\u2191"; // Up arrow
  if (status === "low") return "\u2193\u2193"; // Double down arrow
  if (status === "below_avg") return "\u2193"; // Down arrow
  return "\u2022"; // Dot for normal
};

const TickerPanelInner = ({
  tickers,
  formatPercent,
  formatSignal,
  lastUpdated,
  isLive,
  weights,
  showFullDetails = false,
  priceHistory = {}
}) => {
  // Don't show panel if no tickers
  if (!tickers || tickers.length === 0) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#0f172a",
        padding: 1
      },
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
        e(Text, { color: "#64748b" }, "Top Tickers"),
        e(Text, { color: "#475569", dimColor: true }, "No data")
      ),
      e(
        Text,
        { color: "#64748b", dimColor: true },
        "Connect Alpaca API for live ticker data"
      )
    );
  }

  // Get top ticker for sparkline
  const topTicker = tickers[0];
  const topPriceHistory = topTicker ? priceHistory[topTicker.symbol] || [] : [];

  return e(
    Box,
    {
      flexDirection: "column"
    },
    // Sparkline chart for top ticker
    topTicker && e(SparklineChart, {
      ticker: topTicker,
      priceHistory: topPriceHistory,
      width: 50
    }),
    // Main ticker list panel
    e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#0f172a",
        padding: 1
      },
      // Header
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
        e(Text, { color: "#64748b" }, "Top Tickers"),
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: isLive ? "#22c55e" : "#64748b" }, isLive ? "\u25CF" : "\u25CB"),
          e(Text, { color: "#475569", dimColor: true }, lastUpdated)
        )
      ),
      // Weights display
      e(
        Box,
        { marginBottom: 1 },
        e(
          Text,
          { color: "#334155", dimColor: true },
          `M:${(weights.momentum * 100).toFixed(0)} V:${(weights.volume * 100).toFixed(0)} X:${(weights.volatility * 100).toFixed(0)} S:${(weights.sentiment * 100).toFixed(0)}`
        )
      ),
      // Table header
      e(
        Box,
        { flexDirection: "column" },
        e(
          Box,
          { flexDirection: "row", marginBottom: 1 },
          e(Box, { width: 3 }, e(Text, { color: "#334155" }, " # ")),
          e(Box, { width: 6 }, e(Text, { color: "#334155" }, "SYM   ")),
          e(Box, { width: 5 }, e(Text, { color: "#334155" }, " SCR ")),
          e(Box, { width: 8 }, e(Text, { color: "#334155" }, "  CHG  ")),
          e(Box, { width: 3 }, e(Text, { color: "#334155" }, "MCD")),
          e(Box, { width: 3 }, e(Text, { color: "#334155" }, "VOL"))
        ),
        // Ticker rows
        ...tickers.slice(0, 12).map((ticker, index) =>
          e(
            Box,
            { key: ticker.symbol, flexDirection: "row" },
            // Rank
            e(Box, { width: 3 }, e(Text, { color: "#475569" }, String(index + 1).padStart(2) + " ")),
            // Symbol (no emoji - they cause width issues)
            e(Box, { width: 6 }, e(Text, { color: "#94a3b8" }, ticker.symbol.padEnd(6))),
            // Score
            e(
              Box,
              { width: 5 },
              e(Text, { color: scoreColor(ticker.score) }, String(Math.round(ticker.score)).padStart(4) + " ")
            ),
            // Change %
            e(
              Box,
              { width: 8 },
              e(Text, { color: ticker.change >= 0 ? "#22c55e" : "#ef4444" }, formatPercent(ticker.change).padStart(7) + " ")
            ),
            // MACD trend indicator
            e(
              Box,
              { width: 3 },
              e(Text, { color: getMacdColor(ticker.macd?.trend) }, ` ${getMacdIndicator(ticker.macd?.trend)} `)
            ),
            // Volume score indicator
            e(
              Box,
              { width: 3 },
              e(Text, { color: getVolumeScoreColor(ticker.volumeScore?.score) }, getVolumeIndicator(ticker.volumeScore?.status).padEnd(3))
            )
          )
        )
      ),
      // Legend
      e(
        Box,
        { marginTop: 1 },
        e(
          Text,
          { color: "#334155", dimColor: true },
          "MACD: \u25B2 bull \u25BC bear | VOL: \u2191 high \u2193 low"
        )
      )
    )
  );
};

// Custom comparison: only re-render if ticker data actually changed
const areTickersEqual = (prevProps, nextProps) => {
  // Always re-render if lastUpdated changed
  if (prevProps.lastUpdated !== nextProps.lastUpdated) return false;
  if (prevProps.isLive !== nextProps.isLive) return false;

  const prevTickers = prevProps.tickers || [];
  const nextTickers = nextProps.tickers || [];

  // Different length means different data
  if (prevTickers.length !== nextTickers.length) return false;

  // Compare first 12 tickers (what we display) by key fields
  for (let i = 0; i < Math.min(12, prevTickers.length); i++) {
    const prev = prevTickers[i];
    const next = nextTickers[i];
    if (!prev || !next) return false;
    if (prev.symbol !== next.symbol) return false;
    if (prev.score !== next.score) return false;
    if (prev.change !== next.change) return false;
    if (prev.macd?.trend !== next.macd?.trend) return false;
    if (prev.volumeScore?.status !== next.volumeScore?.status) return false;
  }

  return true;
};

export const TickerPanel = memo(TickerPanelInner, areTickersEqual);
