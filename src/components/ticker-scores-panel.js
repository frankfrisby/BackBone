import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

/**
 * Top 3 threshold - must be 8.0 or above to qualify
 */
const TOP3_THRESHOLD = 8.0;

/**
 * Get signal color based on 0-10 score
 * BUY signals only for >= 8.0
 */
const getSignalColor = (score) => {
  if (score >= 9.0) return "#22c55e"; // Bright green - extreme buy
  if (score >= 8.0) return "#4ade80"; // Green - buy
  if (score >= 4.0) return "#eab308"; // Yellow - hold
  if (score >= 3.0) return "#f97316"; // Orange - sell
  return "#ef4444"; // Red - strong sell
};

/**
 * Get signal label - BUY only for top 3 tickers with scores >= 8.0
 * @param {number} score - The ticker score
 * @param {boolean} isTop3 - Whether this ticker is in the top 3 qualified tickers
 */
const getSignalLabel = (score, isTop3 = false) => {
  // Only show BUY signals for top 3 qualified tickers
  if (isTop3 && score >= 9.0) return "BUY++";
  if (isTop3 && score >= 8.0) return "BUY";
  // Everything else is HOLD or SELL based on score
  if (score >= 4.0) return "HOLD";
  if (score >= 3.0) return "SELL";
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
  if (!macd && macd !== 0) return "#64748b";
  if (macd > 0.5) return "#22c55e";
  if (macd > 0) return "#86efac";
  if (macd > -0.5) return "#f97316";
  return "#ef4444";
};

/**
 * Get volume color based on sigma
 */
const getVolumeColor = (sigma) => {
  if (!sigma && sigma !== 0) return "#64748b";
  if (sigma >= 2.0) return "#22c55e";
  if (sigma >= 1.5) return "#4ade80";
  if (sigma >= 1.0) return "#94a3b8";
  if (sigma >= 0.5) return "#f97316";
  return "#ef4444";
};

/**
 * Format score (always X.X format)
 */
const formatScore = (score) => {
  if (score === undefined || score === null) return "--";
  return score.toFixed(1);
};

/**
 * Format percent change
 */
const formatChange = (change) => {
  if (change === undefined || change === null) return "  --";
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
};

/**
 * Format MACD value
 */
const formatMACD = (macd) => {
  if (macd === undefined || macd === null) return " --";
  const value = typeof macd === "object" ? macd.histogram : macd;
  if (value === undefined || value === null) return " --";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
};

/**
 * Format volume sigma
 */
const formatVolume = (sigma) => {
  if (sigma === undefined || sigma === null) return "--";
  return `${sigma.toFixed(1)}σ`;
};

/**
 * Score bar visualization
 */
const ScoreBar = ({ score, width = 6 }) => {
  const pct = Math.min(10, Math.max(0, score || 0)) / 10;
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
 * Check if ticker qualifies for top 3 (must be 8.0 or above)
 */
const isTop3Qualified = (score) => score >= TOP3_THRESHOLD;

/**
 * Ticker Scores Panel - Detailed view with aligned columns
 *
 * Top 3 = ONLY tickers with score >= 8.0 (shown with green background)
 * Shows: 3 on minimal, 10 on core, 20 on advanced
 */
export const TickerScoresPanel = ({
  tickers = [],
  title = "Ticker Scores",
  maxItems = 10,
  viewMode = "core",
  compact = false
}) => {
  // Determine max items based on view mode
  const itemCount = viewMode === "minimal" ? 3 :
                    viewMode === "advanced" ? 20 : 10;
  const actualMax = maxItems || itemCount;

  // Sort by score descending
  const sortedTickers = [...tickers]
    .filter(t => t && t.symbol && typeof t.score === "number")
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, actualMax);

  // Top 3 = only tickers with score >= 8.0
  const top3Symbols = new Set(
    sortedTickers
      .filter(t => isTop3Qualified(t.score))
      .slice(0, 3)
      .map(t => t.symbol)
  );

  const top3Count = top3Symbols.size;

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
      e(Text, { color: "#475569", marginLeft: 1 }, "No ticker data")
    );
  }

  // Minimal/compact view
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
        e(Text, { color: top3Count > 0 ? "#22c55e" : "#475569" },
          top3Count > 0 ? `${top3Count} buy` : "0 buy")
      ),
      ...sortedTickers.map((ticker, i) => {
        const isTop3 = top3Symbols.has(ticker.symbol);
        const color = getSignalColor(ticker.score);

        return e(
          Box,
          {
            key: ticker.symbol,
            flexDirection: "row",
            backgroundColor: isTop3 ? "#166534" : undefined,
            paddingX: isTop3 ? 1 : 0
          },
          e(Text, { color: isTop3 ? "#f59e0b" : "#64748b", width: 3 },
            `${i + 1}.`),
          e(Text, { color: isTop3 ? "#f8fafc" : "#e2e8f0", bold: isTop3, width: 6 },
            ticker.symbol),
          e(Text, { color, bold: isTop3, width: 5 },
            formatScore(ticker.score)),
          e(Text, { color, width: 7 },
            ` ${getSignalLabel(ticker.score, isTop3)}`)
        );
      })
    );
  }

  // Full view with aligned columns
  // Column widths: # (3) | SYM (6) | SCORE (10) | SIGNAL (7) | MACD (7) | VOL (5) | CHG (7)
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
        top3Count > 0
          ? e(Text, { color: "#22c55e", bold: true }, `${top3Count} BUY (≥8.0)`)
          : e(Text, { color: "#64748b" }, "0 buy signals"),
        e(Text, { color: "#475569" }, `showing ${sortedTickers.length}`)
      )
    ),

    // Column headers - fixed widths
    e(
      Box,
      { flexDirection: "row" },
      e(Text, { color: "#475569", width: 4 }, "  # "),
      e(Text, { color: "#475569", width: 6 }, "SYM"),
      e(Text, { color: "#475569", width: 10 }, "  SCORE"),
      e(Text, { color: "#475569", width: 7 }, "SIGNAL"),
      e(Text, { color: "#475569", width: 7 }, "  MACD"),
      e(Text, { color: "#475569", width: 5 }, " VOL"),
      e(Text, { color: "#475569", width: 7 }, "   CHG")
    ),

    // Separator
    e(Text, { color: "#334155" }, "─".repeat(46)),

    // Ticker rows with fixed column widths
    ...sortedTickers.map((ticker, i) => {
      const isTop3 = top3Symbols.has(ticker.symbol);
      const scoreColor = getSignalColor(ticker.score);
      const changeVal = ticker.change ?? ticker.changePercent ?? 0;
      const changeColor = getChangeColor(changeVal);
      const macdVal = typeof ticker.macd === "object" ? ticker.macd?.histogram : ticker.macd;
      const macdColor = getMACDColor(macdVal);
      const volColor = getVolumeColor(ticker.volumeSigma);

      return e(
        Box,
        {
          key: ticker.symbol,
          flexDirection: "row",
          backgroundColor: isTop3 ? "#166534" : undefined
        },
        // # column (1-n with space)
        e(Text, { color: isTop3 ? "#f59e0b" : "#64748b", width: 4 },
          `${(i + 1).toString().padStart(2)} `),
        // Symbol
        e(Text, { color: isTop3 ? "#f8fafc" : "#e2e8f0", bold: isTop3, width: 6 },
          ticker.symbol.padEnd(5)),
        // Score with bar
        e(
          Box,
          { width: 10, flexDirection: "row" },
          e(ScoreBar, { score: ticker.score, width: 5 }),
          e(Text, { color: scoreColor, bold: isTop3 },
            ` ${formatScore(ticker.score)}`)
        ),
        // Signal (space before for separation from score)
        e(Text, { color: scoreColor, bold: isTop3, width: 8 },
          ` ${getSignalLabel(ticker.score, isTop3).padEnd(6)}`),
        // MACD
        e(Text, { color: macdColor, width: 7 },
          formatMACD(macdVal).padStart(6)),
        // Volume
        e(Text, { color: volColor, width: 5 },
          formatVolume(ticker.volumeSigma).padStart(4)),
        // Change
        e(Text, { color: changeColor, width: 7 },
          formatChange(changeVal).padStart(6))
      );
    }),

    // Footer legend
    e(
      Box,
      { marginTop: 1, flexDirection: "row", gap: 1 },
      e(Text, { color: "#166534", backgroundColor: "#166534" }, "  "),
      e(Text, { color: "#475569" }, "= Top 3 (≥8.0)"),
      e(Text, { color: "#334155" }, "│"),
      e(Text, { color: "#22c55e" }, "≥8"),
      e(Text, { color: "#475569" }, "buy"),
      e(Text, { color: "#eab308" }, "4-8"),
      e(Text, { color: "#475569" }, "hold"),
      e(Text, { color: "#ef4444" }, "<4"),
      e(Text, { color: "#475569" }, "sell")
    )
  );
};

/**
 * Top 3 Display - Shows only tickers >= 8.0
 */
export const Top3Display = ({ tickers = [] }) => {
  const qualified = [...tickers]
    .filter(t => t && t.symbol && typeof t.score === "number" && isTop3Qualified(t.score))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3);

  if (qualified.length === 0) {
    return e(Text, { color: "#64748b" }, "No buy signals (need ≥8.0)");
  }

  return e(
    Box,
    { flexDirection: "row", gap: 2 },
    e(Text, { color: "#22c55e", bold: true }, "TOP 3:"),
    ...qualified.map((ticker, i) =>
      e(
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
        e(Text, { color: getSignalColor(ticker.score) }, ticker.score.toFixed(1))
      )
    )
  );
};

/**
 * Ticker Summary Line
 */
export const TickerSummaryLine = ({ tickers = [] }) => {
  const sorted = [...tickers]
    .filter(t => t && t.symbol && typeof t.score === "number")
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3);

  if (sorted.length === 0) {
    return e(Text, { color: "#475569" }, "No ticker data");
  }

  return e(
    Box,
    { flexDirection: "row", gap: 2 },
    ...sorted.map((ticker, i) => {
      const color = getSignalColor(ticker.score);
      const isQualified = isTop3Qualified(ticker.score);
      return e(
        Box,
        {
          key: ticker.symbol,
          flexDirection: "row",
          gap: 1,
          backgroundColor: isQualified ? "#166534" : undefined,
          paddingX: isQualified ? 1 : 0
        },
        e(Text, { color: isQualified ? "#f59e0b" : "#475569" }, `${i + 1}.`),
        e(Text, { color: isQualified ? "#f8fafc" : color, bold: isQualified }, ticker.symbol),
        e(Text, { color }, ticker.score.toFixed(1))
      );
    })
  );
};

export default TickerScoresPanel;
