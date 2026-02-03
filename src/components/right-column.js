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
  tradeAction,
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
      tradeAction,
    }),

    // Trading History Panel (only in non-minimal mode)
    viewMode !== VIEW_MODES.MINIMAL &&
      e(TradingHistoryPanel, {
        tradingHistory,
        isConnected: alpacaStatus === "Live",
        timestamp: uiClock,
        privateMode,
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

/**
 * Custom comparison to prevent re-renders from timestamp/uiClock changes
 */
const areRightColumnPropsEqual = (prevProps, nextProps) => {
  // Ignore uiClock - it's only used for timestamp display which has internal caching
  if (prevProps.viewMode !== nextProps.viewMode) return false;
  if (prevProps.privateMode !== nextProps.privateMode) return false;
  if (prevProps.alpacaStatus !== nextProps.alpacaStatus) return false;
  if (prevProps.alpacaMode !== nextProps.alpacaMode) return false;
  if (prevProps.portfolioLastUpdated !== nextProps.portfolioLastUpdated) return false;
  if (prevProps.nextTradeTimeDisplay !== nextProps.nextTradeTimeDisplay) return false;

  // Compare portfolio key values
  if (prevProps.portfolio?.equity !== nextProps.portfolio?.equity) return false;
  if (prevProps.portfolio?.cash !== nextProps.portfolio?.cash) return false;
  if (prevProps.portfolio?.dayPL !== nextProps.portfolio?.dayPL) return false;
  if (prevProps.portfolio?.positions?.length !== nextProps.portfolio?.positions?.length) return false;

  // Compare trading status
  if (prevProps.tradingStatus?.statusText !== nextProps.tradingStatus?.statusText) return false;
  if (prevProps.tradingStatus?.marketOpen !== nextProps.tradingStatus?.marketOpen) return false;

  // Compare tickers length (score lookup)
  if (prevProps.tickers?.length !== nextProps.tickers?.length) return false;

  // Compare connection statuses (just connected state)
  const prevConns = Object.values(prevProps.connectionStatuses || {}).map(c => c?.connected).join(",");
  const nextConns = Object.values(nextProps.connectionStatuses || {}).map(c => c?.connected).join(",");
  if (prevConns !== nextConns) return false;

  return true;
};

// Memoize with custom comparison to prevent unnecessary re-renders
export const RightColumn = memo(RightColumnBase, areRightColumnPropsEqual);

export default RightColumn;
