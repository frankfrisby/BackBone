import React, { memo } from "react";
import { Box, Text } from "ink";

const e = React.createElement;

/**
 * Unicode block characters for sparkline (lowest to highest)
 */
const SPARK_BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/**
 * Dotted line characters for indicators
 */
const DOTS = {
  empty: "·",
  half: "∙",
  full: "●",
  line: "─",
  dashed: "┄"
};

/**
 * Calculate RSI (Relative Strength Index)
 * Standard 14-period, adjusted for available data
 */
const calculateRSI = (closePrices) => {
  if (!closePrices || closePrices.length < 3) return null;

  const period = Math.min(6, closePrices.length - 1);
  const changes = [];

  for (let i = 1; i < closePrices.length; i++) {
    changes.push(closePrices[i] - closePrices[i - 1]);
  }

  const gains = changes.slice(-period).filter(c => c > 0);
  const losses = changes.slice(-period).filter(c => c < 0).map(c => Math.abs(c));

  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;

  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Math.round(rsi);
};

/**
 * Generate sparkline from price data
 */
const generateSparkline = (prices, width = 20) => {
  if (!prices || prices.length < 2) return DOTS.dashed.repeat(width);

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  // Normalize and select prices to fit width
  const step = Math.max(1, Math.floor(prices.length / width));
  const sampled = [];

  for (let i = 0; i < prices.length; i += step) {
    sampled.push(prices[i]);
  }

  // Ensure we include the last price
  if (sampled[sampled.length - 1] !== prices[prices.length - 1]) {
    sampled.push(prices[prices.length - 1]);
  }

  // Pad or trim to width
  while (sampled.length < width) {
    sampled.unshift(sampled[0] || 0);
  }
  while (sampled.length > width) {
    sampled.shift();
  }

  return sampled.map(price => {
    const normalized = (price - min) / range;
    const index = Math.floor(normalized * (SPARK_BLOCKS.length - 1));
    return SPARK_BLOCKS[Math.max(0, Math.min(index, SPARK_BLOCKS.length - 1))];
  }).join("");
};

/**
 * Generate MACD histogram bar
 */
const generateMacdBar = (histogram, maxWidth = 10) => {
  if (histogram === null || histogram === undefined) return DOTS.dashed.repeat(maxWidth);

  const absVal = Math.min(Math.abs(histogram), 2);
  const barLength = Math.round((absVal / 2) * maxWidth);
  const isPositive = histogram >= 0;

  if (barLength === 0) {
    return DOTS.empty.repeat(maxWidth);
  }

  const bar = isPositive
    ? "│" + "█".repeat(barLength) + DOTS.empty.repeat(maxWidth - barLength - 1)
    : DOTS.empty.repeat(maxWidth - barLength - 1) + "█".repeat(barLength) + "│";

  return bar;
};

/**
 * Generate RSI gauge
 */
const generateRsiGauge = (rsi, width = 10) => {
  if (rsi === null || rsi === undefined) return `RSI: ${DOTS.dashed.repeat(width)}`;

  const position = Math.round((rsi / 100) * (width - 1));
  const gauge = [];

  for (let i = 0; i < width; i++) {
    if (i === position) {
      gauge.push("●");
    } else if (i < 3) {
      gauge.push(DOTS.empty); // Oversold zone
    } else if (i > width - 4) {
      gauge.push(DOTS.empty); // Overbought zone
    } else {
      gauge.push(DOTS.line);
    }
  }

  return gauge.join("");
};

/**
 * Generate momentum bar
 */
const generateMomentumBar = (momentum, width = 12) => {
  if (!momentum) return DOTS.dashed.repeat(width);

  const score = Math.min(100, Math.max(0, momentum));
  const filled = Math.round((score / 100) * width);

  return "▓".repeat(filled) + "░".repeat(width - filled);
};

/**
 * Get RSI status label and color
 */
const getRsiStatus = (rsi) => {
  if (rsi === null) return { label: "N/A", color: "#64748b" };
  if (rsi >= 70) return { label: "OVERBOUGHT", color: "#ef4444" };
  if (rsi <= 30) return { label: "OVERSOLD", color: "#22c55e" };
  return { label: "NEUTRAL", color: "#64748b" };
};

/**
 * Simple deterministic hash for consistent pseudo-random values
 */
const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

/**
 * Generate simulated price history from ticker data
 * Uses deterministic values based on ticker symbol - won't change on re-render
 */
const generateSimulatedPrices = (ticker, length = 20) => {
  if (!ticker) return [];

  const basePrice = ticker.signals?.lastPrice || 100;
  const change = ticker.change || 0;

  // Generate price history that ends at current price with overall change direction
  const prices = [];
  const startPrice = basePrice / (1 + change / 100);

  // Use symbol hash for deterministic "noise" pattern
  const symbolHash = hashString(ticker.symbol || "AAAA");

  for (let i = 0; i < length; i++) {
    const progress = i / (length - 1);
    const trendComponent = startPrice + (basePrice - startPrice) * progress;
    // Deterministic noise based on symbol and position
    const seedValue = ((symbolHash + i * 17) % 100) / 100 - 0.5;
    const noise = seedValue * Math.abs(change) * 0.1 * basePrice * 0.01;
    prices.push(trendComponent + noise);
  }

  // Ensure last price matches
  prices[prices.length - 1] = basePrice;

  return prices;
};

/**
 * Sparkline Chart Component
 * Displays top ticker with visual indicators
 */
const SparklineChartInner = ({
  ticker,
  priceHistory = [],
  width = 50
}) => {
  if (!ticker) {
    return e(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      e(Text, { color: "#475569", dimColor: true }, "No top ticker data available")
    );
  }

  // Use real price history if available, otherwise generate simulated
  const effectivePriceHistory = priceHistory.length >= 2
    ? priceHistory
    : generateSimulatedPrices(ticker, 20);

  // Calculate indicators
  const sparkline = generateSparkline(effectivePriceHistory, 24);
  const rsi = calculateRSI(effectivePriceHistory);
  const rsiStatus = getRsiStatus(rsi);
  const macdData = ticker.macd || {};
  const macdHistogram = macdData.histogram ?? 0;
  const macdTrend = macdData.trend || "neutral";
  const macdValue = macdData.macd;
  const momentum = ticker.signals?.momentum || 50;
  const volumeStatus = ticker.volumeScore?.status || "normal";

  // Price change color
  const changeColor = ticker.change >= 0 ? "#22c55e" : "#ef4444";
  const changeSign = ticker.change >= 0 ? "+" : "";

  // MACD colors
  const macdColor = macdTrend === "bullish" ? "#22c55e" : macdTrend === "bearish" ? "#ef4444" : "#64748b";

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#3b82f6",
      paddingX: 1,
      paddingTop: 1,
      paddingBottom: 1,
      marginBottom: 1
    },
    // Header with ticker symbol and price
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#3b82f6", bold: true }, "▲ TOP"),
        e(Text, { color: "#e2e8f0", bold: true }, ticker.symbol),
        e(Text, { color: "#64748b" }, `Score: ${Math.round(ticker.score)}`)
      ),
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: changeColor, bold: true }, `${changeSign}${ticker.change?.toFixed(2)}%`),
        ticker.signals?.lastPrice && e(Text, { color: "#94a3b8" }, `$${ticker.signals.lastPrice.toFixed(2)}`)
      )
    ),
    // Sparkline
    e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Box, { width: 6 }, e(Text, { color: "#475569" }, "Price ")),
      e(Text, { color: changeColor }, sparkline),
      e(Text, { color: "#475569", dimColor: true }, priceHistory.length > 0 ? ` ${priceHistory.length}d` : "")
    ),
    // Indicators row
    e(
      Box,
      { flexDirection: "row", gap: 2, marginTop: 1 },
      // RSI
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#475569" }, "RSI"),
        e(Text, { color: rsiStatus.color }, rsi !== null ? String(rsi).padStart(3) : " --"),
        e(Text, { color: rsiStatus.color, dimColor: true }, `[${rsiStatus.label}]`)
      ),
      // MACD
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#475569" }, "MACD"),
        e(
          Text,
          { color: macdColor },
          macdTrend === "bullish" ? "▲" : macdTrend === "bearish" ? "▼" : "●"
        ),
        e(
          Text,
          { color: macdColor },
          macdValue != null ? (macdValue >= 0 ? "+" : "") + macdValue.toFixed(2) : "--"
        )
      ),
      // Volume
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#475569" }, "Vol"),
        e(
          Text,
          { color: volumeStatus === "high" ? "#22c55e" : volumeStatus === "low" ? "#ef4444" : "#64748b" },
          volumeStatus === "high" ? "↑↑" : volumeStatus === "above_avg" ? "↑" : volumeStatus === "low" ? "↓↓" : volumeStatus === "below_avg" ? "↓" : "○"
        )
      )
    ),
    // Momentum bar
    e(
      Box,
      { flexDirection: "row", gap: 1, marginTop: 1 },
      e(Box, { width: 6 }, e(Text, { color: "#475569" }, "Mom   ")),
      e(Text, { color: momentum >= 60 ? "#22c55e" : momentum >= 40 ? "#eab308" : "#ef4444" }, generateMomentumBar(momentum, 16)),
      e(Text, { color: "#475569", dimColor: true }, ` ${Math.round(momentum)}%`)
    ),
    // MACD histogram visual
    e(
      Box,
      { flexDirection: "row", gap: 1, marginTop: 1 },
      e(Box, { width: 6 }, e(Text, { color: "#475569" }, "Hist  ")),
      e(
        Text,
        { color: macdColor },
        generateMacdHistogramVisual(macdHistogram)
      )
    )
  );
};

/**
 * Generate visual MACD histogram
 */
const generateMacdHistogramVisual = (histogram) => {
  if (histogram === null || histogram === undefined) return "────────────────";

  const center = 8;
  const scale = Math.min(Math.abs(histogram), 2) / 2;
  const bars = Math.round(scale * center);

  let visual = "";
  if (histogram >= 0) {
    visual = "────────" + "█".repeat(bars) + "░".repeat(center - bars);
  } else {
    visual = "░".repeat(center - bars) + "█".repeat(bars) + "────────";
  }

  return visual;
};

// Custom comparison: only re-render if ticker data actually changed
const areSparklinePropsEqual = (prevProps, nextProps) => {
  const prevTicker = prevProps.ticker;
  const nextTicker = nextProps.ticker;

  // Both null/undefined - equal
  if (!prevTicker && !nextTicker) return true;
  // One null, other not - not equal
  if (!prevTicker || !nextTicker) return false;

  // Compare key ticker fields
  if (prevTicker.symbol !== nextTicker.symbol) return false;
  if (prevTicker.score !== nextTicker.score) return false;
  if (prevTicker.change !== nextTicker.change) return false;
  if (prevTicker.macd?.trend !== nextTicker.macd?.trend) return false;
  if (prevTicker.macd?.macd !== nextTicker.macd?.macd) return false;
  if (prevTicker.signals?.momentum !== nextTicker.signals?.momentum) return false;
  if (prevTicker.signals?.lastPrice !== nextTicker.signals?.lastPrice) return false;
  if (prevTicker.volumeScore?.status !== nextTicker.volumeScore?.status) return false;

  // Compare price history length (don't deep compare all values)
  if (prevProps.priceHistory?.length !== nextProps.priceHistory?.length) return false;

  return true;
};

export const SparklineChart = memo(SparklineChartInner, areSparklinePropsEqual);

/**
 * Mini sparkline for inline display
 */
export const MiniSparkline = ({ prices, color = "#64748b" }) => {
  if (!prices || prices.length < 2) {
    return e(Text, { color }, "········");
  }

  return e(Text, { color }, generateSparkline(prices, 8));
};

export default SparklineChart;
