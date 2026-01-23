/**
 * Right Column Component - Portfolio, Trading History, Wealth
 *
 * Receives data as props from parent to avoid store sync timing issues.
 */

import React, { memo, useMemo } from "react";
import { Box } from "ink";

// Import child components
import { PortfolioPanel } from "./portfolio-panel.js";
import { TradingHistoryPanel } from "./trading-history-panel.js";
import { WealthPanel, ConnectionsStatusPanel } from "./wealth-panel.js";

// Import formatters
import { formatPercent } from "../data/tickers.js";

const e = React.createElement;

// View mode constants
const VIEW_MODES = {
  CORE: "core",
  ADVANCED: "advanced",
  MINIMAL: "minimal",
};

/**
 * Format time ago string
 */
const formatTimeAgo = (date) => {
  if (!date) return null;
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

/**
 * Right Column - Portfolio, Trading History, Wealth/Connections
 *
 * Props:
 * - viewMode: "core" | "advanced" | "minimal"
 * - portfolio: Portfolio data object
 * - tradingStatus: Trading status display data
 * - tradingHistory: Trading history data
 * - portfolioLastUpdated: Timestamp of last portfolio update
 * - nextTradeTimeDisplay: Next trade time string
 * - privateMode: Whether to hide sensitive data
 * - alpacaStatus: Alpaca connection status
 * - alpacaMode: Alpaca mode (paper/live)
 * - tickers: Array of ticker data for score lookup
 * - personalCapitalData: Personal Capital wealth data
 * - connectionStatuses: All connection statuses
 * - uiClock: Timestamp for UI updates
 */
const RightColumnBase = ({
  viewMode = VIEW_MODES.CORE,
  portfolio,
  tradingStatus,
  tradingHistory,
  portfolioLastUpdated,
  nextTradeTimeDisplay,
  privateMode = false,
  alpacaStatus = "Not connected",
  alpacaMode = "paper",
  tickers = [],
  personalCapitalData,
  connectionStatuses = {},
  uiClock,
}) => {
  // Compute ticker scores for position action indicators
  const tickerScores = useMemo(() => {
    if (!tickers || tickers.length === 0) return {};
    return tickers.reduce((acc, t) => {
      if (t.symbol && typeof t.score === "number") {
        acc[t.symbol] = t.score;
      }
      return acc;
    }, {});
  }, [tickers]);

  // Format last updated time
  const lastUpdatedAgo = useMemo(() => formatTimeAgo(portfolioLastUpdated), [portfolioLastUpdated]);

  return e(
    Box,
    { flexDirection: "column", width: "100%", overflow: "hidden" },

    // Portfolio Panel
    e(PortfolioPanel, {
      portfolio: portfolio
        ? {
            ...portfolio,
            status: alpacaStatus,
            mode: alpacaMode,
          }
        : null,
      formatPercent,
      tradingStatus,
      lastUpdatedAgo,
      nextTradeTime: nextTradeTimeDisplay,
      privateMode,
      tickerScores,
    }),

    // Trading History Panel (only in non-minimal mode)
    viewMode !== VIEW_MODES.MINIMAL &&
      e(TradingHistoryPanel, {
        tradingHistory,
        isConnected: alpacaStatus === "Live",
        timestamp: uiClock,
      }),

    // Wealth Panel (if Personal Capital connected) or Connections Status Panel
    personalCapitalData?.connected
      ? e(WealthPanel, {
          data: personalCapitalData,
          compact: true,
          privateMode,
        })
      : e(ConnectionsStatusPanel, {
          connections: connectionStatuses,
        })
  );
};

// Memoize to prevent unnecessary re-renders
export const RightColumn = memo(RightColumnBase);

export default RightColumn;
