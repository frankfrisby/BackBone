import React, { memo } from "react";
import { Box, Text } from "ink";
import { SCORE_THRESHOLDS, getSignalFromScore } from "../services/score-engine.js";

const e = React.createElement;

/**
 * Check if a timestamp falls within the current "ticker day" (4 AM to 4 AM).
 */
const isTickerToday = (timestamp) => {
  if (!timestamp) return false;
  const now = new Date();
  const ts = new Date(timestamp);
  const tickerDayStart = new Date(now);
  tickerDayStart.setHours(4, 0, 0, 0);
  if (now < tickerDayStart) {
    tickerDayStart.setDate(tickerDayStart.getDate() - 1);
  }
  return ts >= tickerDayStart;
};

/**
 * Custom comparison for ticker scores to prevent unnecessary re-renders
 * NOTE: Ignores timestamp prop since time display is cached internally
 */
const areTickerScoresEqual = (prevProps, nextProps) => {
  // Check simple props first (excluding timestamp - cached internally)
  if (prevProps.title !== nextProps.title) return false;
  if (prevProps.maxItems !== nextProps.maxItems) return false;
  if (prevProps.viewMode !== nextProps.viewMode) return false;
  if (prevProps.compact !== nextProps.compact) return false;
  // NOTE: timestamp intentionally ignored - formatDateTime has internal caching

  // Deep compare tickers - only check what matters for display
  const prevTickers = prevProps.tickers || [];
  const nextTickers = nextProps.tickers || [];

  if (prevTickers.length !== nextTickers.length) return false;

  // Compare top 7 tickers' key values (symbol, score, change)
  for (let i = 0; i < Math.min(7, prevTickers.length); i++) {
    const prev = prevTickers[i] || {};
    const next = nextTickers[i] || {};
    if (prev.symbol !== next.symbol) return false;
    if (prev.score !== next.score) return false;
    if (prev.change !== next.change || prev.changePercent !== next.changePercent) return false;
  }

  // Compare positions (for trailing stop dots)
  const prevPos = prevProps.positions || [];
  const nextPos = nextProps.positions || [];
  if (prevPos.length !== nextPos.length) return false;

  // Compare trailing stops keys and values
  const prevStops = prevProps.trailingStops || {};
  const nextStops = nextProps.trailingStops || {};
  const prevStopKeys = Object.keys(prevStops).sort();
  const nextStopKeys = Object.keys(nextStops).sort();
  if (prevStopKeys.join(",") !== nextStopKeys.join(",")) return false;
  for (const k of prevStopKeys) {
    if (prevStops[k]?.trailPercent !== nextStops[k]?.trailPercent) return false;
    if (prevStops[k]?.gainPercent !== nextStops[k]?.gainPercent) return false;
  }

  return true;
};

/**
 * Format date/time for screenshots (cached to prevent flickering)
 */
let cachedDateTime = "";
let lastDateUpdate = 0;
const formatDateTime = (date = new Date()) => {
  const now = Date.now();
  // Only update every 30 seconds to prevent flickering
  if (now - lastDateUpdate > 30000 || !cachedDateTime) {
    const options = {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    };
    cachedDateTime = date.toLocaleString("en-US", options);
    lastDateUpdate = now;
  }
  return cachedDateTime;
};

/**
 * Short date/time for compact status display (e.g. 2/1 9:42a)
 */
const formatShortDateTime = (date) => {
  if (!date) return "--";
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return "--";
  const datePart = dt.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  const timePart = dt
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(" AM", "a")
    .replace(" PM", "p");
  return `${datePart} ${timePart}`;
};

/**
 * BackBoneApp Thresholds
 * - Top 3 threshold varies by SPY direction:
 *   - SPY Positive: 7.1 (more lenient)
 *   - SPY Negative: 8.0 (more strict)
 * - Default: 8.0 (when SPY status unknown)
 */
const TOP3_THRESHOLD_SPY_POSITIVE = SCORE_THRESHOLDS?.BUY_SPY_POSITIVE || 7.1;
const TOP3_THRESHOLD_SPY_NEGATIVE = SCORE_THRESHOLDS?.BUY_SPY_NEGATIVE || 8.0;
const TOP3_THRESHOLD = TOP3_THRESHOLD_SPY_NEGATIVE; // Default to stricter threshold

/**
 * Get dynamic threshold based on SPY direction
 */
const getDynamicThreshold = (spyPositive = null) => {
  if (spyPositive === true) return TOP3_THRESHOLD_SPY_POSITIVE;
  if (spyPositive === false) return TOP3_THRESHOLD_SPY_NEGATIVE;
  return TOP3_THRESHOLD; // Default when unknown
};

/**
 * Get signal color based on 0-10 score (BackBoneApp aligned)
 *
 * Score Color Mapping:
 * - 9.0+:  Bright green (#22c55e) - EXTREME BUY
 * - 8.0+:  Green (#4ade80) - BUY (SPY negative threshold)
 * - 7.1+:  Light green (#86efac) - BUY (SPY positive threshold)
 * - 4.0+:  Yellow (#eab308) - HOLD
 * - 3.0+:  Orange (#f97316) - SELL
 * - 2.7+:  Red-orange - TECHNICAL OVERRIDE threshold
 * - <1.5:  Red (#ef4444) - EXTREME SELL
 */
const getSignalColor = (score) => {
  if (score >= 9.0) return "#22c55e"; // Bright green - extreme buy
  if (score >= 8.0) return "#4ade80"; // Green - buy (SPY negative)
  if (score >= 7.1) return "#86efac"; // Light green - buy (SPY positive)
  if (score >= 4.0) return "#eab308"; // Yellow - hold
  if (score >= 3.0) return "#f97316"; // Orange - sell
  if (score >= 2.7) return "#fb923c"; // Light orange - near technical override
  if (score >= 1.5) return "#f87171"; // Light red - approaching extreme sell
  return "#ef4444"; // Red - extreme sell
};

/**
 * Get signal label - Uses BackBoneApp thresholds
 *
 * @param {number} score - The ticker score
 * @param {boolean} isTop3 - Whether this ticker is in the top 3 qualified tickers
 * @param {boolean|null} spyPositive - SPY direction for dynamic threshold
 */
const getSignalLabel = (score, isTop3 = false, spyPositive = null) => {
  const threshold = getDynamicThreshold(spyPositive);

  // Extreme signals
  if (score >= 9.0) return isTop3 ? "BUY++" : "HIGH";
  if (score <= 1.5) return "SELL--";

  // Buy signals (only for top 3 qualified)
  if (isTop3 && score >= threshold) return "BUY";

  // Hold zone
  if (score >= 4.0) return "HOLD";

  // Sell zone
  if (score >= 3.0) return "SELL";
  if (score >= 2.7) return "WEAK"; // Near technical override threshold

  return "SELL-";
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
 * Format percent change (fixed 6 char width: +XX.X% or -XX.X%)
 */
const formatChange = (change) => {
  if (change === undefined || change === null) return "   -- ";
  const sign = change >= 0 ? "+" : "";
  const formatted = `${sign}${change.toFixed(1)}%`;
  return formatted.padStart(6);
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
 * Format dollar value in compact notation ($1.2K, $34.5K, $1.2M)
 */
const formatCompactValue = (value) => {
  if (value == null || isNaN(value)) return "";
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
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
 * Check if ticker qualifies for top 3 (uses dynamic threshold)
 * @param {number} score - Ticker score
 * @param {boolean|null} spyPositive - SPY direction for dynamic threshold
 */
const isTop3Qualified = (score, spyPositive = null) => {
  const threshold = getDynamicThreshold(spyPositive);
  return score >= threshold;
};

/**
 * Ticker Scores Panel - Detailed view with aligned columns
 *
 * Top 3 = ONLY tickers meeting dynamic threshold (shown with green background)
 * - SPY Positive: >= 7.1
 * - SPY Negative: >= 8.0
 * - Default: >= 8.0
 *
 * Shows: 3 on minimal, 7 on core, 15 on advanced
 */
const TickerScoresPanelBase = ({
  tickers = [],
  title = "Ticker Scores",
  maxItems = 7,
  viewMode = "core",
  compact = false,
  timestamp = null,
  spyPositive = null,  // SPY direction for dynamic threshold
  spyChange = null,    // SPY % change for display
  tickerStatus = null,  // Status: { refreshing, lastRefresh, error, scanCount, scanDone }
  tradingStatus = null,  // Trading: { enabled, nextTime, lastTrade: { success, symbol, action, message, timestamp } }
  positions = [],       // Portfolio positions (from Alpaca)
  trailingStops = {},   // Trailing stop data keyed by symbol { symbol: { trailPercent, gainPercent } }
}) => {
  // Format timestamp for display
  const displayTime = formatDateTime(
    tickerStatus?.lastRefresh
      ? new Date(tickerStatus.lastRefresh)
      : (timestamp ? new Date(timestamp) : new Date())
  );
  // Determine max items based on view mode
  const itemCount = viewMode === "minimal" ? 3 :
                    viewMode === "advanced" ? 15 : 7;
  const actualMax = maxItems || itemCount;

  // Get dynamic threshold based on SPY
  const threshold = getDynamicThreshold(spyPositive);

  // Sort by score descending
  const sortedTickers = [...tickers]
    .filter(t => t && t.symbol && typeof t.score === "number")
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, actualMax);

  // Top 3 = only tickers meeting dynamic threshold
  const top3Symbols = new Set(
    sortedTickers
      .filter(t => t.score >= threshold)
      .slice(0, 3)
      .map(t => t.symbol)
  );

  const top3Count = top3Symbols.size;

  // Build a set of held position symbols and their gain data for trailing stop dots
  const positionMap = {};
  if (positions && positions.length > 0) {
    for (const pos of positions) {
      const sym = pos.symbol;
      const gainPct = pos.unrealizedPlPercent ?? pos.totalChangePercent ?? pos.pnlPercent ?? null;
      const todayPct = pos.todayChange ?? pos.dayChangePercent ?? 0;
      const hasStop = trailingStops && trailingStops[sym];
      const trailPct = hasStop ? trailingStops[sym].trailPercent : null;
      const mktVal = pos.marketValue || (pos.shares * parseFloat(String(pos.lastPrice || 0).replace(/[$,]/g, ""))) || 0;
      positionMap[sym] = { gainPct, todayPct, hasStop: !!hasStop, trailPct, marketValue: mktVal };
    }
  }

  /**
   * Get trailing stop dot color for a position:
   * - gray (#64748b): no trailing stop set
   * - green (#22c55e): room to grow (gain > trailPercent * 2, comfortable margin)
   * - yellow (#eab308): hold zone (gain is positive but close to stop, could sell)
   * - red (#ef4444): likely to sell soon (gain < trailPercent, stop is tight)
   * Returns null if the ticker is not a held position.
   */
  const getStopDotColor = (symbol) => {
    const data = positionMap[symbol];
    if (!data) return null; // Not a position — no dot
    if (!data.hasStop) return "#64748b"; // No trailing stop — gray

    const gain = data.gainPct ?? 0;
    const trail = data.trailPct ?? 2;

    // Red: gain is less than trail% — stop is very close to triggering
    if (gain <= trail) return "#ef4444";
    // Yellow: gain is between 1x and 2x trail — could sell
    if (gain <= trail * 2) return "#eab308";
    // Green: gain is more than 2x trail — room to grow
    return "#22c55e";
  };

  if (sortedTickers.length === 0) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#0f172a",
        padding: 1
      },
      e(Text, { color: "#64748b" }, title),
      e(Text, { color: "#475569", marginLeft: 1 }, "No ticker data")
    );
  }

  // Minimal/compact view - show tickers with positions prioritized
  if (viewMode === "minimal" || compact) {
    // Build mini list: start with top 4 scored, then inject any held positions not already shown
    const topScored = sortedTickers.slice(0, 4);
    const topSymbols = new Set(topScored.map(t => t.symbol));
    // Find held positions that aren't in top 4 (so their dots/amounts are visible)
    const heldNotShown = sortedTickers.filter(t => positionMap[t.symbol] && !topSymbols.has(t.symbol));
    const miniTickers = [...topScored, ...heldNotShown];

    // Calculate market status for indicator
    const getMarketStatus = () => {
      if (!tickerStatus) return "pending";
      if (tickerStatus.refreshing) return "working";
      if (tickerStatus.error) return "error";
      if (tickerStatus.scanDone || tickerStatus.scanCount > 0) return "done";
      return "pending";
    };
    const marketStatus = getMarketStatus();

    // Check if full scan is complete (based on actual count, not just timestamp)
    const getFullScanStatus = () => {
      const evaluated = tickerStatus?.evaluatedToday || 0;
      const universe = tickerStatus?.universeSize || 0;
      const allDone = evaluated >= universe && universe > 0;
      const lastScan = tickerStatus?.lastFullScan ? new Date(tickerStatus.lastFullScan) : null;
      return {
        ran: allDone,
        time: allDone && lastScan ? lastScan.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : null,
        count: `${evaluated}/${universe}`
      };
    };
    const fullScanStatus = getFullScanStatus();

    // Check market hours update frequency (9am-4pm ET)
    const getUpdateFrequencyStatus = () => {
      if (!tickerStatus?.updateHistory || tickerStatus.updateHistory.length === 0) {
        return { healthy: false, gaps: 0 };
      }

      const now = new Date();
      const today = new Date();
      today.setHours(9, 0, 0, 0); // 9am today
      const marketClose = new Date();
      marketClose.setHours(16, 0, 0, 0); // 4pm today

      // Only check if we're in market hours
      const isMarketHours = now >= today && now <= marketClose;
      if (!isMarketHours) {
        return { healthy: true, gaps: 0, afterHours: true };
      }

      // Get today's updates
      const todayUpdates = tickerStatus.updateHistory
        .filter(u => {
          const updateTime = new Date(u);
          return updateTime.toDateString() === now.toDateString() &&
                 updateTime >= today &&
                 updateTime <= marketClose;
        })
        .sort((a, b) => new Date(a) - new Date(b));

      if (todayUpdates.length === 0) {
        return { healthy: false, gaps: 999 };
      }

      // Check for gaps > 2 hours
      let gaps = 0;
      for (let i = 1; i < todayUpdates.length; i++) {
        const prev = new Date(todayUpdates[i - 1]);
        const curr = new Date(todayUpdates[i]);
        const diffHours = (curr - prev) / (1000 * 60 * 60);
        if (diffHours > 2) gaps++;
      }

      // Check gap from last update to now
      const lastUpdate = new Date(todayUpdates[todayUpdates.length - 1]);
      const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
      if (hoursSinceUpdate > 2) gaps++;

      return { healthy: gaps === 0, gaps, updateCount: todayUpdates.length };
    };
    const updateStatus = getUpdateFrequencyStatus();

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
        e(
          Box,
          { flexDirection: "column" },
          e(Text, { color: "#64748b" }, title),
          e(
            Box,
            { flexDirection: "row", gap: 1 },
            e(Text, { color: "#475569", dimColor: true }, `${displayTime}`),
            tradingStatus && e(Text, { color: "#334155" }, "│"),
            tradingStatus && e(Text, {
              color: tradingStatus.mode === "options" ? "#f59e0b" : "#3b82f6"
            }, tradingStatus.mode || "swing"),
            tradingStatus && e(Text, {
              color: tradingStatus.riskLevel === "risky" ? "#ef4444" : "#22c55e"
            }, ` ${tradingStatus.riskLevel || "conservative"}`)
          )
        ),
        e(
          Box,
          { flexDirection: "row", gap: 1, alignItems: "center" },
          // SPY indicator with arrow (green ▲ / red ▼)
          spyChange !== null && e(Text, {
            color: spyPositive ? "#22c55e" : "#ef4444",
            bold: true
          }, `SPY ${spyPositive ? "▲" : "▼"} ${spyChange >= 0 ? "+" : ""}${spyChange?.toFixed(1) || 0}%`),
          spyChange !== null && e(Text, { color: "#334155" }, "│"),
          e(Text, { color: top3Count > 0 ? "#22c55e" : "#475569" },
            top3Count > 0 ? `${top3Count} buy` : "0 buy"),
          e(StatusDot, {
            status: marketStatus,
            blinking: marketStatus === "working"
          }),
          e(Text, { color: "#334155" }, "│"),
          e(Text, { color: "#475569", dimColor: true },
            `last ${formatShortDateTime(tickerStatus?.lastRefresh)}`)
        )
      ),
      // Mini view column headers
      e(
        Box,
        { flexDirection: "row", marginBottom: 0 },
        e(Text, { color: "#475569", width: 3 }, " # "),
        e(Text, { color: "#475569", width: 6 }, "SYM"),
        e(Text, { color: "#475569", width: 2 }, ""),
        e(Text, { color: "#475569", width: 5 }, "SCORE"),
        e(Text, { color: "#475569", width: 7 }, " SIGNAL"),
        e(Text, { color: "#475569", width: 8 }, "   VALUE"),
        e(Text, { color: "#475569", width: 8 }, "     P/L")
      ),
      // Top scored tickers + held positions
      ...miniTickers.map((ticker, i) => {
        const isTop3 = top3Symbols.has(ticker.symbol);
        const color = getSignalColor(ticker.score);
        const stopDotColor = getStopDotColor(ticker.symbol);

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
          // Trailing stop dot (only shown for held positions)
          e(Text, { color: stopDotColor || "#1e293b", width: 2 },
            stopDotColor ? "●" : " "),
          e(Text, { color, bold: isTop3, width: 5 },
            formatScore(ticker.score)),
          e(Text, { color, width: 7 },
            ` ${getSignalLabel(ticker.score, isTop3)}`),
          // Position value (only for held positions)
          positionMap[ticker.symbol]
            ? e(Text, { color: "#94a3b8", width: 8 },
                `${formatCompactValue(positionMap[ticker.symbol].marketValue).padStart(8)}`)
            : e(Text, { width: 8 }, ""),
          // Position daily P&L % (only for held positions)
          positionMap[ticker.symbol]
            ? (() => {
                const today = positionMap[ticker.symbol].todayPct;
                const total = positionMap[ticker.symbol].gainPct;
                // Show today's change if non-zero, otherwise show total P&L
                const pct = (today && Math.abs(today) >= 0.01) ? today : (total || 0);
                const isToday = today && Math.abs(today) >= 0.01;
                const sign = pct >= 0 ? "+" : "";
                const label = `${sign}${pct.toFixed(1)}%`;
                const plColor = pct > 0 ? "#22c55e" : pct < 0 ? "#ef4444" : "#64748b";
                return e(Text, { color: plColor, width: 8 },
                  `${label.padStart(7)}${isToday ? "" : "*"}`);
              })()
            : e(Text, { width: 8 }, "")
        );
      }),
      // Trading status line - shows next trade time and last action
      tradingStatus && e(
        Box,
        { flexDirection: "row", gap: 1, marginTop: 1, borderTop: true, borderColor: "#334155", paddingTop: 1 },
        // Next trade time
        e(Text, { color: "#64748b" }, "next:"),
        e(Text, { color: tradingStatus.enabled ? "#3b82f6" : "#475569" },
          tradingStatus.nextTime || "--:--"),
        e(Text, { color: "#334155" }, "│"),
        // Last trade action
        e(Text, { color: "#64748b" }, "last:"),
        tradingStatus.lastTrade ? [
          e(Text, {
            key: "icon",
            color: tradingStatus.lastTrade.success ? "#22c55e" : "#ef4444"
          }, tradingStatus.lastTrade.success ? "✓" : "✗"),
          e(Text, {
            key: "msg",
            color: tradingStatus.lastTrade.success ? "#94a3b8" : "#f87171"
          }, ` ${tradingStatus.lastTrade.message?.slice(0, 25) || tradingStatus.lastTrade.symbol || "..."}`)
        ] : e(Text, { color: "#475569" }, "no trades yet")
      ),
      // Data quality status line - shows Full (800+) and Refresh (150) status
      e(
        Box,
        { flexDirection: "row", gap: 1, marginTop: tradingStatus ? 0 : 1, borderTop: !tradingStatus, borderColor: "#334155", paddingTop: tradingStatus ? 0 : 1 },
        // Full scan status (based on actual count)
        e(StatusDot, {
          status: fullScanStatus.ran ? "done" : "pending",
          blinking: tickerStatus?.fullScanRunning || false
        }),
        e(Text, { color: fullScanStatus.ran ? "#94a3b8" : "#64748b" },
          fullScanStatus.ran ? `Full ${fullScanStatus.time}` : `Full ${fullScanStatus.count}`),
        e(Text, { color: "#334155" }, "│"),
        // Refresh status (150 ticker list)
        e(StatusDot, {
          status: updateStatus.afterHours ? "pending" : updateStatus.healthy ? "done" : "error",
          blinking: tickerStatus?.refreshing || false
        }),
        e(Text, { color: updateStatus.afterHours ? "#64748b" : updateStatus.healthy ? "#94a3b8" : "#f59e0b" },
          "Refresh"),
        tickerStatus?.scanCount > 0 && e(Text, { color: "#475569", dimColor: true },
          ` (${tickerStatus.scanCount})`)
      )
    );
  }

  // Full view with aligned columns
  // Column widths: # (3) | SYM (6) | SCORE (10) | SIGNAL (7) | MACD (7) | VOL (5) | CHG (7)
  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#0f172a",
      padding: 1
    },
    // Header with date/time
    e(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(
          Box,
          { flexDirection: "column" },
          e(Text, { color: "#64748b" }, title),
          e(Text, { color: "#475569", dimColor: true }, `Updated: ${displayTime}`)
        ),
        e(
          Box,
          { flexDirection: "row", gap: 2 },
          top3Count > 0
            ? e(Text, { color: "#22c55e", bold: true }, `${top3Count} BUY (≥${threshold})`)
            : e(Text, { color: "#64748b" }, `0 buy (need ≥${threshold})`),
          spyChange !== null && e(Text, {
            color: spyPositive ? "#22c55e" : "#ef4444",
            bold: true
          }, `SPY ${spyPositive ? "▲" : "▼"} ${spyChange >= 0 ? "+" : ""}${spyChange?.toFixed(2) || 0}%`),
          e(Text, { color: "#475569" }, `showing ${sortedTickers.length}`)
        )
      )
    ),

    // Column headers - fixed widths (total: 3+5+10+7+7+5+7 = 44)
    e(
      Box,
      { flexDirection: "row" },
      e(Text, { color: "#475569" }, " # "),       // 3 chars
      e(Text, { color: "#475569" }, "SYM  "),     // 5 chars
      e(Text, { color: "#475569" }, "   SCORE  "),// 10 chars
      e(Text, { color: "#475569" }, "SIGNAL "),   // 7 chars
      e(Text, { color: "#475569" }, "  MACD "),   // 7 chars
      e(Text, { color: "#475569" }, " VOL "),     // 5 chars
      e(Text, { color: "#475569" }, "   CHG")     // 7 chars (includes space before)
    ),

    // Separator
    e(Text, { color: "#334155" }, "─".repeat(44)),

    // Ticker rows with fixed column widths (must match header: 3+5+10+7+7+5+7 = 44)
    ...sortedTickers.map((ticker, i) => {
      const isTop3 = top3Symbols.has(ticker.symbol);
      const scoreColor = getSignalColor(ticker.score);
      const changeVal = ticker.change ?? ticker.changePercent ?? 0;
      const changeColor = getChangeColor(changeVal);
      const macdVal = typeof ticker.macd === "object" ? ticker.macd?.histogram : ticker.macd;
      const macdColor = getMACDColor(macdVal);
      const volColor = getVolumeColor(ticker.volumeSigma);

      // Pre-format all values with exact widths
      const numCol = (i + 1).toString().padStart(2) + " ";           // 3 chars
      const symCol = ticker.symbol.padEnd(5);                         // 5 chars
      const sigCol = getSignalLabel(ticker.score, isTop3).padEnd(6) + " ";  // 7 chars
      const macdCol = formatMACD(macdVal).padStart(6) + " ";          // 7 chars
      const volCol = formatVolume(ticker.volumeSigma).padStart(4) + " "; // 5 chars
      const chgCol = formatChange(changeVal).padStart(6);             // 7 chars (already padded)

      return e(
        Box,
        {
          key: ticker.symbol,
          flexDirection: "row",
          backgroundColor: isTop3 ? "#166534" : undefined
        },
        // # column (3 chars)
        e(Text, { color: isTop3 ? "#f59e0b" : "#64748b" }, numCol),
        // Symbol (5 chars)
        e(Text, { color: isTop3 ? "#f8fafc" : "#e2e8f0", bold: isTop3 }, symCol),
        // Score with bar (10 chars: 5 bar + 1 space + 4 score)
        e(ScoreBar, { score: ticker.score, width: 5 }),
        e(Text, { color: scoreColor, bold: isTop3 }, ` ${formatScore(ticker.score)}  `),
        // Signal (7 chars)
        e(Text, { color: scoreColor, bold: isTop3 }, sigCol),
        // MACD (7 chars)
        e(Text, { color: macdColor }, macdCol),
        // Volume (5 chars)
        e(Text, { color: volColor }, volCol),
        // Change (7 chars)
        e(Text, { color: changeColor }, chgCol)
      );
    }),

    // Footer legend with dynamic threshold
    e(
      Box,
      { marginTop: 1, flexDirection: "row", gap: 1 },
      e(Text, { color: "#166534", backgroundColor: "#166534" }, "  "),
      e(Text, { color: "#475569" }, `= Top 3 (≥${threshold})`),
      e(Text, { color: "#334155" }, "│"),
      e(Text, { color: "#22c55e" }, `≥${threshold}`),
      e(Text, { color: "#475569" }, "buy"),
      e(Text, { color: "#eab308" }, `4-${threshold}`),
      e(Text, { color: "#475569" }, "hold"),
      e(Text, { color: "#ef4444" }, "<4"),
      e(Text, { color: "#475569" }, "sell"),
      e(Text, { color: "#334155" }, "│"),
      e(Text, { color: "#64748b", dimColor: true },
        spyPositive === null ? "SPY ?" : spyPositive ? "SPY+" : "SPY-")
    )
  );
};

/**
 * Top 3 Display - Shows only tickers meeting dynamic threshold
 * @param {Array} tickers - All tickers
 * @param {boolean|null} spyPositive - SPY direction for dynamic threshold
 */
const Top3DisplayBase = ({ tickers = [], spyPositive = null }) => {
  const threshold = getDynamicThreshold(spyPositive);
  const qualified = [...tickers]
    .filter(t => t && t.symbol && typeof t.score === "number" && t.score >= threshold)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3);

  if (qualified.length === 0) {
    return e(Text, { color: "#64748b" }, `No buy signals (need ≥${threshold})`);
  }

  return e(
    Box,
    { flexDirection: "row", gap: 2 },
    e(Text, { color: "#22c55e", bold: true }, `TOP 3 (≥${threshold}):`),
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
 * Status indicator dot with blinking support
 * Status colors:
 * - done: green (#22c55e) - data loaded successfully
 * - working: pulsing gray (#6b7280) - currently refreshing
 * - error: red (#ef4444) - failed to load
 * - pending: dim gray (#475569) - not yet started
 */
const StatusDot = ({ status, label, blinking = false }) => {
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    if (blinking) {
      const interval = setInterval(() => setVisible(v => !v), 400);
      return () => clearInterval(interval);
    }
    setVisible(true);
  }, [blinking]);

  // Status colors: green=done, gray=working (pulsing), red=error, dim=pending
  const color = status === "done" ? "#22c55e" :
                status === "working" ? "#6b7280" :
                status === "error" ? "#ef4444" :
                "#475569";

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    e(Text, { color: visible ? color : "#1e293b" }, "●"),
    label && e(Text, { color: "#64748b" }, label)
  );
};

/**
 * Ticker Summary Line with status indicators
 * @param {Array} tickers - All tickers
 * @param {boolean|null} spyPositive - SPY direction for dynamic threshold
 * @param {Object} scanStatus - Status of 800 ticker scan { done: bool, count: num, working: bool }
 * @param {Object} refreshStatus - Status of refresh { done: bool, working: bool, lastRefresh: Date }
 */
const TickerSummaryLineBase = ({
  tickers = [],
  spyPositive = null,
  scanStatus = null,
  refreshStatus = null,
  showStatusDots = true
}) => {
  const threshold = getDynamicThreshold(spyPositive);
  const sorted = [...tickers]
    .filter(t => t && t.symbol && typeof t.score === "number")
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 4);  // Show 4 tickers in mini view

  // Calculate scan status
  const scanStatusValue = scanStatus?.working ? "working" :
                          (scanStatus?.count >= 800 || scanStatus?.done) ? "done" : "pending";
  const scanLabel = scanStatus?.count ? `${scanStatus.count}+` : null;

  // Calculate refresh status
  const now = Date.now();
  const lastRefreshAge = refreshStatus?.lastRefresh ?
    (now - new Date(refreshStatus.lastRefresh).getTime()) : Infinity;
  const refreshStatusValue = refreshStatus?.working ? "working" :
                             lastRefreshAge < 10 * 60 * 1000 ? "done" : "pending"; // 10 min

  if (sorted.length === 0) {
    return e(
      Box,
      { flexDirection: "row", gap: 2 },
      e(Text, { color: "#475569" }, "No ticker data"),
      showStatusDots && e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(StatusDot, { status: scanStatusValue, label: scanLabel, blinking: scanStatusValue === "working" }),
        e(StatusDot, { status: refreshStatusValue, label: "Refresh", blinking: refreshStatusValue === "working" })
      )
    );
  }

  return e(
    Box,
    { flexDirection: "row", gap: 2 },
    // Show 4 tickers
    ...sorted.map((ticker, i) => {
      const color = getSignalColor(ticker.score);
      const isQualified = ticker.score >= threshold;
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
    }),
    // Status dots section (to right of tickers)
    showStatusDots && e(
      Box,
      { flexDirection: "row", gap: 1, marginLeft: 1 },
      e(StatusDot, { status: scanStatusValue, label: scanLabel, blinking: scanStatusValue === "working" }),
      e(StatusDot, { status: refreshStatusValue, label: "Refresh", blinking: refreshStatusValue === "working" })
    )
  );
};

// Memoized exports to prevent flickering
export const TickerScoresPanel = memo(TickerScoresPanelBase, areTickerScoresEqual);
export const Top3Display = memo(Top3DisplayBase);
export const TickerSummaryLine = memo(TickerSummaryLineBase);

export default TickerScoresPanel;
