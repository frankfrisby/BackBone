import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

/**
 * Score thresholds (0-10 scale)
 */
const SCORE_THRESHOLDS = {
  EXTREME_BUY: 9.0,
  BUY: 7.0,
  MODERATE_BUY: 6.0,
  HOLD: 4.0,
  SELL: 3.0,
  EXTREME_SELL: 1.5
};

/**
 * Get signal color based on 0-10 score
 */
const getSignalColor = (score) => {
  if (score >= SCORE_THRESHOLDS.EXTREME_BUY) return "#22c55e"; // Bright green
  if (score >= SCORE_THRESHOLDS.BUY) return "#4ade80"; // Green
  if (score >= SCORE_THRESHOLDS.MODERATE_BUY) return "#86efac"; // Light green
  if (score >= SCORE_THRESHOLDS.HOLD) return "#eab308"; // Yellow
  if (score >= SCORE_THRESHOLDS.SELL) return "#f97316"; // Orange
  return "#ef4444"; // Red
};

/**
 * Get background color for top 3 candidates
 */
const getBackgroundColor = (score, isTop3) => {
  if (!isTop3) return undefined;
  if (score >= SCORE_THRESHOLDS.BUY) return "#166534"; // Dark green bg
  return undefined;
};

/**
 * Get signal label
 */
const getSignalLabel = (score) => {
  if (score >= SCORE_THRESHOLDS.EXTREME_BUY) return "BUY++";
  if (score >= SCORE_THRESHOLDS.BUY) return "BUY";
  if (score >= SCORE_THRESHOLDS.MODERATE_BUY) return "BUY-";
  if (score >= SCORE_THRESHOLDS.HOLD) return "HOLD";
  if (score >= SCORE_THRESHOLDS.SELL) return "SELL";
  return "SELL--";
};

/**
 * Get change color
 */
const getChangeColor = (change) => {
  if (change > 2) return "#22c55e";
  if (change > 0) return "#4ade80";
  if (change > -2) return "#f97316";
  return "#ef4444";
};

/**
 * Get MACD color
 */
const getMACDColor = (macd) => {
  if (!macd) return "#64748b";
  if (macd > 0.5) return "#22c55e";
  if (macd > 0) return "#86efac";
  if (macd > -0.5) return "#f97316";
  return "#ef4444";
};

/**
 * Get volume color based on sigma
 */
const getVolumeColor = (sigma) => {
  if (!sigma) return "#64748b";
  if (sigma >= 2.0) return "#22c55e"; // High volume
  if (sigma >= 1.5) return "#4ade80";
  if (sigma >= 1.0) return "#94a3b8";
  if (sigma >= 0.5) return "#f97316";
  return "#ef4444"; // Low volume
};

/**
 * Format percent change
 */
const formatChange = (change) => {
  if (change === undefined || change === null) return "  --  ";
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`.padStart(7);
};

/**
 * Format MACD value
 */
const formatMACD = (macd) => {
  if (!macd || macd.histogram === undefined) return " -- ";
  const value = macd.histogram || 0;
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`.padStart(6);
};

/**
 * Format volume sigma
 */
const formatVolume = (sigma) => {
  if (!sigma) return " -- ";
  return `${sigma.toFixed(1)}σ`.padStart(5);
};

/**
 * Score bar visualization
 */
const ScoreBar = ({ score, width = 8 }) => {
  const pct = Math.min(10, Math.max(0, score)) / 10;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const color = getSignalColor(score);

  return e(
    Box,
    { flexDirection: "row" },
    filled > 0 && e(Text, { color }, "█".repeat(filled)),
    empty > 0 && e(Text, { color: "#334155" }, "░".repeat(empty))
  );
};

/**
 * Check if ticker is top 3 candidate (meets buy threshold)
 */
const isTop3Candidate = (score) => score >= SCORE_THRESHOLDS.MODERATE_BUY;

/**
 * Ticker Scores Panel - Detailed view with all columns
 *
 * Columns: #, Symbol, Score, Signal, MACD, Volume, Change
 * Shows 3 on minimal, 10 on core, 20 on advanced
 */
export const TickerScoresPanel = ({
  tickers = [],
  title = "Ticker Scores",
  maxItems = 10,
  viewMode = "core",
  showColumns = true,
  compact = false
}) => {
  // Determine max items based on view mode
  const itemCount = viewMode === "minimal" ? 3 :
                    viewMode === "advanced" ? 20 : 10;

  const actualMax = maxItems || itemCount;

  // Sort by score descending and get top N
  const sortedTickers = [...tickers]
    .filter(t => t && t.symbol && typeof t.score === "number")
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, actualMax);

  // Identify top 3 candidates (must meet buy threshold)
  const top3Candidates = sortedTickers
    .filter(t => isTop3Candidate(t.score))
    .slice(0, 3)
    .map(t => t.symbol);

  if (sortedTickers.length === 0) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#1e293b",
        padding: 1
      },
      e(Text, { color: "#64748b" }, title),
      e(Text, { color: "#475569", marginLeft: 1 }, "No ticker data available")
    );
  }

  // Minimal view - just symbol, score, signal
  if (viewMode === "minimal" || compact) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#1e293b",
        padding: 1
      },
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
        e(Text, { color: "#64748b" }, title),
        e(Text, { color: "#475569" }, `Top ${sortedTickers.length}`)
      ),
      ...sortedTickers.map((ticker, i) => {
        const isTop3 = top3Candidates.includes(ticker.symbol);
        const signalColor = getSignalColor(ticker.score);
        const bgColor = getBackgroundColor(ticker.score, isTop3);

        return e(
          Box,
          {
            key: ticker.symbol,
            flexDirection: "row",
            justifyContent: "space-between",
            backgroundColor: bgColor
          },
          e(
            Box,
            { flexDirection: "row", gap: 1 },
            e(Text, { color: isTop3 ? "#f59e0b" : "#475569" }, `${(i + 1).toString().padStart(2)}.`),
            e(Text, { color: isTop3 ? "#f8fafc" : "#e2e8f0", bold: isTop3 }, ticker.symbol.padEnd(5))
          ),
          e(
            Box,
            { flexDirection: "row", gap: 1 },
            e(Text, { color: signalColor, bold: true }, ticker.score.toFixed(1).padStart(4)),
            e(Text, { color: signalColor }, getSignalLabel(ticker.score).padStart(6))
          )
        );
      })
    );
  }

  // Full view with all columns
  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#1e293b",
      padding: 1
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#64748b" }, title),
      e(
        Box,
        { flexDirection: "row", gap: 2 },
        e(Text, { color: "#22c55e" }, `${top3Candidates.length} buy signals`),
        e(Text, { color: "#475569" }, `· ${sortedTickers.length} tickers`)
      )
    ),

    // Column headers
    showColumns && e(
      Box,
      { flexDirection: "row", marginBottom: 1 },
      e(Text, { color: "#475569", width: 4 }, " # "),
      e(Text, { color: "#475569", width: 6 }, "SYM"),
      e(Text, { color: "#475569", width: 10 }, "SCORE"),
      e(Text, { color: "#475569", width: 7 }, "SIGNAL"),
      e(Text, { color: "#475569", width: 7 }, "MACD"),
      e(Text, { color: "#475569", width: 6 }, "VOL"),
      e(Text, { color: "#475569", width: 8 }, "CHANGE")
    ),

    // Separator
    showColumns && e(Text, { color: "#334155" }, "─".repeat(48)),

    // Ticker rows
    ...sortedTickers.map((ticker, i) => {
      const isTop3 = top3Candidates.includes(ticker.symbol);
      const signalColor = getSignalColor(ticker.score);
      const bgColor = getBackgroundColor(ticker.score, isTop3);
      const changeColor = getChangeColor(ticker.change || ticker.changePercent || 0);
      const macdColor = getMACDColor(ticker.macd?.histogram);
      const volumeColor = getVolumeColor(ticker.volumeSigma);

      return e(
        Box,
        {
          key: ticker.symbol,
          flexDirection: "row",
          backgroundColor: bgColor,
          paddingX: bgColor ? 1 : 0
        },
        // Rank number
        e(
          Box,
          { width: 4 },
          e(Text, { color: isTop3 ? "#f59e0b" : "#64748b", bold: isTop3 }, `${(i + 1).toString().padStart(2)}.`)
        ),
        // Symbol
        e(
          Box,
          { width: 6 },
          e(Text, { color: isTop3 ? "#f8fafc" : "#e2e8f0", bold: isTop3 }, ticker.symbol.padEnd(5))
        ),
        // Score with bar
        e(
          Box,
          { width: 10, flexDirection: "row", gap: 1 },
          e(ScoreBar, { score: ticker.score, width: 5 }),
          e(Text, { color: signalColor, bold: true }, ticker.score.toFixed(1).padStart(3))
        ),
        // Signal
        e(
          Box,
          { width: 7 },
          e(Text, { color: signalColor, bold: isTop3 }, getSignalLabel(ticker.score).padEnd(6))
        ),
        // MACD
        e(
          Box,
          { width: 7 },
          e(Text, { color: macdColor }, formatMACD(ticker.macd))
        ),
        // Volume sigma
        e(
          Box,
          { width: 6 },
          e(Text, { color: volumeColor }, formatVolume(ticker.volumeSigma))
        ),
        // Price change
        e(
          Box,
          { width: 8 },
          e(Text, { color: changeColor }, formatChange(ticker.change || ticker.changePercent))
        )
      );
    }),

    // Footer
    e(
      Box,
      { marginTop: 1, flexDirection: "row", justifyContent: "space-between" },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#475569" }, "Score: 0-10"),
        e(Text, { color: "#334155" }, "·"),
        e(Text, { color: "#22c55e" }, "≥6"),
        e(Text, { color: "#475569" }, "buy"),
        e(Text, { color: "#334155" }, "·"),
        e(Text, { color: "#eab308" }, "4-6"),
        e(Text, { color: "#475569" }, "hold"),
        e(Text, { color: "#334155" }, "·"),
        e(Text, { color: "#ef4444" }, "<4"),
        e(Text, { color: "#475569" }, "sell")
      ),
      e(Text, { color: "#334155" }, "/tickers for details")
    )
  );
};

/**
 * Ticker Summary Line - Single line for header/footer
 */
export const TickerSummaryLine = ({ tickers = [] }) => {
  const top3 = [...tickers]
    .filter(t => t && t.symbol && typeof t.score === "number")
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3);

  if (top3.length === 0) {
    return e(Text, { color: "#475569" }, "No ticker data");
  }

  return e(
    Box,
    { flexDirection: "row", gap: 2 },
    ...top3.map((ticker, i) => {
      const color = getSignalColor(ticker.score);
      const isTop3Qualified = isTop3Candidate(ticker.score);
      return e(
        Box,
        { key: ticker.symbol, flexDirection: "row", gap: 1 },
        e(Text, { color: isTop3Qualified ? "#f59e0b" : "#475569" }, `${i + 1}.`),
        e(Text, { color, bold: isTop3Qualified }, ticker.symbol),
        e(Text, { color }, ticker.score.toFixed(1))
      );
    })
  );
};

/**
 * Top 3 Display - Shows only buy-qualified tickers
 */
export const Top3Display = ({ tickers = [] }) => {
  const qualified = [...tickers]
    .filter(t => t && t.symbol && typeof t.score === "number" && isTop3Candidate(t.score))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3);

  if (qualified.length === 0) {
    return e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#64748b" }, "No buy signals")
    );
  }

  return e(
    Box,
    { flexDirection: "row", gap: 2 },
    e(Text, { color: "#22c55e" }, "TOP 3:"),
    ...qualified.map((ticker, i) => {
      const color = getSignalColor(ticker.score);
      return e(
        Box,
        {
          key: ticker.symbol,
          flexDirection: "row",
          gap: 1,
          backgroundColor: "#166534",
          paddingX: 1
        },
        e(Text, { color: "#f59e0b", bold: true }, `${i + 1}.`),
        e(Text, { color: "#f8fafc", bold: true }, ticker.symbol),
        e(Text, { color }, ticker.score.toFixed(1))
      );
    })
  );
};

export default TickerScoresPanel;
