import React, { memo } from "react";
import { Box, Text } from "ink";

const e = React.createElement;

// ============================================================================
// COLORS & STYLING
// ============================================================================

const COLORS = {
  // Status colors
  live: "#22c55e",
  connecting: "#3b82f6",
  warning: "#f97316",
  offline: "#ef4444",

  // P&L colors
  profit: "#22c55e",
  loss: "#ef4444",
  neutral: "#94a3b8",

  // Score colors (aligned with BackBoneApp thresholds)
  scoreBuy: "#22c55e",      // >= 8.0
  scoreHold: "#eab308",     // 4.0 - 8.0
  scoreSell: "#ef4444",     // < 4.0
  scoreExtreme: "#16a34a",  // >= 9.0

  // UI colors
  primary: "#e2e8f0",
  secondary: "#94a3b8",
  muted: "#64748b",
  dim: "#475569",
  border: "#0f172a",
  background: "#1e293b",

  // Accent
  accent: "#3b82f6",
  gold: "#f59e0b"
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const getStatusColor = (status) => {
  if (status === "Live") return COLORS.live;
  if (status === "Connecting...") return COLORS.connecting;
  if (status === "Missing keys") return COLORS.warning;
  if (status === "Offline") return COLORS.offline;
  return COLORS.muted;
};

const getStatusDot = (status) => {
  return status === "Live" ? "\u25CF" : "\u25CB";
};

/**
 * Format currency with $ and commas
 */
const formatCurrency = (value, privateMode = false) => {
  if (value === null || value === undefined || value === "--") return "--";
  if (privateMode) return "$\u2022\u2022\u2022\u2022\u2022\u2022";

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
 * Format value in compact notation (K/M)
 */
const formatCompact = (value, privateMode = false) => {
  if (value === null || value === undefined) return "--";
  if (privateMode) return "$\u2022\u2022\u2022";

  const num = typeof value === "string" ? parseFloat(value.replace(/[$,]/g, "")) : value;
  if (isNaN(num)) return "--";

  if (Math.abs(num) >= 1000000) {
    return `$${(num / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(num) >= 1000) {
    return `$${(num / 1000).toFixed(1)}K`;
  }
  return `$${num.toFixed(0)}`;
};

/**
 * Format percentage with sign
 */
const formatPct = (value, privateMode = false) => {
  if (value === null || value === undefined) return "--";
  if (privateMode) return "\u2022\u2022%";

  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return "--";

  const sign = num >= 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
};

/**
 * Get P/L color based on value
 */
const getPLColor = (value, privateMode = false) => {
  if (privateMode) return COLORS.muted;
  if (value === null || value === undefined) return COLORS.muted;
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return COLORS.muted;
  if (num > 0) return COLORS.profit;
  if (num < 0) return COLORS.loss;
  return COLORS.neutral;
};

/**
 * Get score color based on BackBoneApp thresholds
 */
const getScoreColor = (score) => {
  if (score === null || score === undefined) return COLORS.dim;
  if (score >= 9.0) return COLORS.scoreExtreme;
  if (score >= 8.0) return COLORS.scoreBuy;
  if (score >= 4.0) return COLORS.scoreHold;
  return COLORS.scoreSell;
};

/**
 * Get action label based on score
 */
const getActionLabel = (score) => {
  if (score === null || score === undefined) return "---";
  if (score >= 9.0) return "BUY+";
  if (score >= 8.0) return "BUY";
  if (score >= 6.0) return "KEEP";
  if (score >= 4.0) return "HOLD";
  if (score >= 2.7) return "WEAK";
  return "SELL";
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Score indicator bar with visual representation
 */
const ScoreIndicator = ({ score }) => {
  const color = getScoreColor(score);
  const label = getActionLabel(score);

  // Visual bar (0-10 mapped to 5 segments)
  const filled = score !== null ? Math.min(5, Math.max(0, Math.round(score / 2))) : 0;
  const empty = 5 - filled;

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    e(
      Box,
      { flexDirection: "row" },
      filled > 0 && e(Text, { color }, "\u2588".repeat(filled)),
      empty > 0 && e(Text, { color: COLORS.border }, "\u2591".repeat(empty))
    ),
    e(Text, { color, bold: score >= 8.0 }, label.padStart(4))
  );
};

/**
 * Single position row with clean formatting
 * Column widths: NUM(2) SYM(5) QTY(4) VALUE(7) TODAY(8) P/L(8) ACTION(11)
 */
const PositionRow = ({ position, score, privateMode, isFirst, index = 0 }) => {
  // Today's change - use todayChange from Alpaca data (unrealized_intraday_pl based)
  const todayPercent = position.todayChange ?? position.dayChangePercent ?? position.todayChangePercent ?? 0;

  // Total position PnL - use unrealizedPlPercent or calculate from cost basis
  const totalPercent = position.unrealizedPlPercent ?? position.totalChangePercent ?? position.pnlPercent ?? 0;

  const todayColor = getPLColor(todayPercent, privateMode);
  const totalColor = getPLColor(totalPercent, privateMode);

  // Calculate market value
  const marketValue = position.marketValue ||
    (position.shares * parseFloat(String(position.lastPrice || 0).replace(/[$,]/g, "")));

  // Format values with consistent widths
  // Number (1-based index) with space, then ticker padded to 5 chars
  const numDisplay = String(index + 1).padStart(2);
  const symDisplay = position.symbol.padEnd(5);
  const qtyDisplay = (privateMode ? "••" : String(position.shares || 0)).padStart(4);
  const valDisplay = formatCompact(marketValue, privateMode).padStart(7);
  const todayDisplay = formatPct(todayPercent, privateMode).padStart(8);
  const totalDisplay = formatPct(totalPercent, privateMode).padStart(8);

  return e(
    Box,
    {
      flexDirection: "row",
      paddingY: 0,
      backgroundColor: isFirst ? "#1a2e1a" : undefined
    },
    // Number (2 chars)
    e(Text, { color: COLORS.dim }, numDisplay),
    // Space between number and symbol
    e(Text, null, " "),
    // Symbol (5 chars, padded)
    e(Text, { color: COLORS.primary, bold: true }, symDisplay),
    // Shares (4 chars)
    e(Text, { color: COLORS.muted }, qtyDisplay),
    // Market Value (7 chars)
    e(Text, { color: COLORS.secondary }, valDisplay),
    // Today's PnL % (8 chars)
    e(Text, { color: todayColor, bold: Math.abs(todayPercent) >= 5 }, todayDisplay),
    // Total P/L % (8 chars)
    e(Text, { color: totalColor, bold: Math.abs(totalPercent) >= 5 }, totalDisplay),
    // Score/Action (11 chars)
    e(Box, { marginLeft: 1 }, e(ScoreIndicator, { score }))
  );
};

/**
 * Account summary section
 */
const AccountSummary = ({ portfolio, privateMode }) => {
  return e(
    Box,
    { flexDirection: "column" },
    // Equity (main highlight)
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(Text, { color: COLORS.secondary }, "Equity"),
      e(Text, { color: COLORS.primary, bold: true },
        privateMode ? "$\u2022\u2022\u2022,\u2022\u2022\u2022" : portfolio.equity)
    ),
    // Cash & Buying Power on same row
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginTop: 0 },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: COLORS.muted }, "Cash"),
        e(Text, { color: COLORS.secondary },
          privateMode ? "$\u2022\u2022\u2022" : formatCompact(portfolio.cash))
      ),
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: COLORS.muted }, "BP"),
        e(Text, { color: COLORS.secondary },
          privateMode ? "$\u2022\u2022\u2022" : formatCompact(portfolio.buyingPower))
      )
    )
  );
};

/**
 * Day P/L display
 */
const DayPL = ({ portfolio, privateMode }) => {
  const color = getPLColor(portfolio.dayChange, privateMode);
  const isPositive = portfolio.dayChange >= 0;

  return e(
    Box,
    {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: isPositive && !privateMode ? "#0a2a0a" : privateMode ? undefined : "#2a0a0a",
      paddingX: 1,
      marginY: 1
    },
    e(Text, { color: COLORS.muted }, "Today"),
    e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color, bold: true },
        privateMode ? "$\u2022\u2022\u2022" : portfolio.dayChangeDollar),
      e(Text, { color },
        privateMode ? "(\u2022\u2022%)" : `(${formatPct(portfolio.dayChange, privateMode)})`)
    )
  );
};

/**
 * Positions header row
 * Column widths must match PositionRow: NUM(2) SPACE(1) SYM(5) QTY(4) VALUE(7) TODAY(8) P/L(8) ACTION(11)
 */
const PositionsHeader = () => {
  return e(
    Box,
    { flexDirection: "row", marginBottom: 0 },
    e(Text, { color: COLORS.dim }, "  "),          // 2 chars (number column)
    e(Text, { color: COLORS.dim }, " "),           // 1 char space
    e(Text, { color: COLORS.dim }, "SYM  "),       // 5 chars
    e(Text, { color: COLORS.dim }, " QTY"),        // 4 chars
    e(Text, { color: COLORS.dim }, "  VALUE"),     // 7 chars
    e(Text, { color: COLORS.dim }, "   TODAY"),    // 8 chars
    e(Text, { color: COLORS.dim }, "     P/L"),    // 8 chars
    e(Text, { color: COLORS.dim, marginLeft: 1 }, "ACTION")  // 11 chars
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const PortfolioPanelBase = ({
  portfolio: inputPortfolio = {},
  formatPercent = formatPct,
  tradingStatus,
  lastUpdatedAgo,
  nextTradeTime,
  privateMode = false,
  tickerScores = {},
  tradeAction,
  spyData = null
}) => {
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
  const hasData = portfolio.equity !== "--" || hasPositions;

  // Sort positions by market value (highest first)
  const sortedPositions = hasPositions
    ? [...portfolio.positions].sort((a, b) => {
        const aVal = a.marketValue || (a.shares * parseFloat(String(a.lastPrice || 0).replace(/[$,]/g, "")));
        const bVal = b.marketValue || (b.shares * parseFloat(String(b.lastPrice || 0).replace(/[$,]/g, "")));
        return bVal - aVal;
      })
    : [];

  // ============ NOT CONNECTED STATE ============
  if (!hasData) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: COLORS.border,
        padding: 1
      },
      // Header
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
        e(Text, { color: COLORS.muted }, "Portfolio"),
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: getStatusColor(portfolio.status) }, getStatusDot(portfolio.status)),
          e(Text, { color: COLORS.dim }, portfolio.status || "Not connected")
        )
      ),
      // Mode
      portfolio.mode && e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: COLORS.muted }, "Mode"),
        e(Text, { color: COLORS.secondary }, portfolio.mode)
      ),
      // API Key preview
      portfolio.apiKeyPreview && e(
        Box,
        { flexDirection: "row", justifyContent: "space-between", marginTop: 1 },
        e(Text, { color: COLORS.muted }, "API Key"),
        e(Text, { color: COLORS.secondary }, portfolio.apiKeyPreview)
      ),
      // Connect prompt
      !portfolio.apiKeyPreview && portfolio.status !== "Connecting..." && e(
        Box,
        { marginTop: 1 },
        e(Text, { color: COLORS.accent }, "\u2192 Type /alpaca to connect")
      ),
      // Connecting indicator
      portfolio.status === "Connecting..." && e(
        Box,
        { marginTop: 1, flexDirection: "row", gap: 1 },
        e(Text, { color: COLORS.connecting }, "\u25CF"),
        e(Text, { color: COLORS.connecting }, "Connecting to Alpaca...")
      )
    );
  }

  // ============ CONNECTED STATE ============
  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: COLORS.border,
      padding: 1
    },
    // ===== HEADER =====
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: COLORS.muted }, "Portfolio"),
        privateMode && e(Text, { color: COLORS.gold }, "[PRIVATE]")
      ),
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: getStatusColor(portfolio.status) }, getStatusDot(portfolio.status)),
        e(Text, { color: COLORS.dim }, portfolio.mode),
        // Trade action indicator: ✓ green for trades, ✗ red with reason when idle
        tradeAction && tradeAction.type === "trade" && e(Text, { color: "#22c55e" }, `\u2713 ${tradeAction.text}`),
        tradeAction && tradeAction.type === "no-trade" && e(Text, { color: "#ef4444" }, `\u2717 ${tradeAction.text}`),
        tradeAction && tradeAction.type === "idle" && e(Text, { color: "#64748b" }, `\u2013 ${tradeAction.text}`),
        // SPY indicator with arrow (green ▲ / red ▼)
        spyData && e(Text, { color: "#334155" }, "│"),
        spyData && e(Text, {
          color: spyData.positive ? "#22c55e" : "#ef4444",
          bold: true
        }, `SPY ${spyData.positive ? "▲" : "▼"} ${spyData.change >= 0 ? "+" : ""}${spyData.change?.toFixed(1)}%`)
      )
    ),

    // ===== ACCOUNT SUMMARY =====
    e(AccountSummary, { portfolio, privateMode }),

    // ===== DAY P/L =====
    e(DayPL, { portfolio, privateMode }),

    // ===== POSITIONS SECTION =====
    hasPositions
    ? e(
        Box,
        { flexDirection: "column" },
        e(
          Box,
          { marginBottom: 0 },
          e(Text, { color: COLORS.secondary, bold: true }, "Positions")
        ),
        // Header row
        e(PositionsHeader),
          // Separator (matches total column width: 2+1+5+4+7+8+8+1+10 = 46)
          e(Text, { color: COLORS.border }, "\u2500".repeat(46)),
          // Position rows (limit to 6)
          ...sortedPositions.slice(0, 6).map((position, index) =>
            e(PositionRow, {
              key: position.symbol,
              position,
              score: tickerScores[position.symbol],
              privateMode,
              isFirst: index === 0,
              index
            })
          ),
          // Show more indicator if > 6 positions
          sortedPositions.length > 6 && e(
            Text,
            { color: COLORS.dim, marginTop: 1 },
            `  ... and ${sortedPositions.length - 6} more`
          )
        )
      : e(
          Box,
          { paddingY: 1 },
          e(Text, { color: COLORS.dim }, "No open positions")
        ),

    // ===== FOOTER =====
    (lastUpdatedAgo || nextTradeTime) && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: COLORS.border }, "\u2500".repeat(46)),
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        lastUpdatedAgo && e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: COLORS.dim }, "Updated"),
          e(Text, { color: COLORS.muted }, lastUpdatedAgo)
        ),
        nextTradeTime && e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: COLORS.dim }, "Next"),
          e(Text, { color: COLORS.accent }, nextTradeTime)
        )
      )
    ),

    // ===== TRADING STATUS =====
    tradingStatus && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: tradingStatus.statusColor }, tradingStatus.statusIcon),
        e(Text, { color: tradingStatus.statusColor }, tradingStatus.statusText)
      ),
      tradingStatus.lastAttempt && e(
        Box,
        { flexDirection: "row", gap: 1, marginTop: 0 },
        e(Text, { color: tradingStatus.lastAttempt.color }, tradingStatus.lastAttempt.icon),
        e(Text, { color: COLORS.secondary },
          `${tradingStatus.lastAttempt.action?.toUpperCase() || "TRADE"} ${tradingStatus.lastAttempt.symbol || ""}`),
        e(Text, { color: COLORS.dim }, tradingStatus.lastAttempt.timestamp)
      )
    )
  );
};

// Memoize to prevent flickering
export const PortfolioPanel = memo(PortfolioPanelBase);

export default PortfolioPanel;
