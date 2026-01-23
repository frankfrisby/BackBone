/**
 * Right Column Component - Portfolio, Trading History, Wealth
 *
 * Self-contained component that subscribes to its own state slices.
 * Updates to other parts of the app don't cause this to re-render.
 */

import React, { memo, useMemo } from "react";
import { Box } from "ink";
import { useAppStore, useAppStoreMultiple, STATE_SLICES } from "../hooks/useAppStore.js";

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
 */
const RightColumnBase = ({ viewMode = VIEW_MODES.CORE }) => {
  // Subscribe to store slices we need
  const portfolioState = useAppStore(STATE_SLICES.PORTFOLIO);
  const connectionsState = useAppStore(STATE_SLICES.CONNECTIONS);
  const tickersState = useAppStore(STATE_SLICES.TICKERS);
  const uiState = useAppStore(STATE_SLICES.UI);

  // Extract needed data
  const { portfolio, tradingStatus, tradingHistory, lastUpdated, nextTradeTime } = portfolioState;
  const { alpaca, personalCapital } = connectionsState;
  const { tickers } = tickersState;
  const { privateMode, uiClock } = uiState;

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
  const lastUpdatedAgo = useMemo(() => formatTimeAgo(lastUpdated), [lastUpdated]);

  return e(
    Box,
    { flexDirection: "column", width: "100%", overflow: "hidden" },

    // Portfolio Panel
    e(PortfolioPanel, {
      portfolio: portfolio
        ? {
            ...portfolio,
            status: alpaca?.status || "Not connected",
            mode: alpaca?.mode || "paper",
          }
        : null,
      formatPercent,
      tradingStatus,
      lastUpdatedAgo,
      nextTradeTime,
      privateMode,
      tickerScores,
    }),

    // Trading History Panel (only in non-minimal mode)
    viewMode !== VIEW_MODES.MINIMAL &&
      e(TradingHistoryPanel, {
        tradingHistory,
        isConnected: alpaca?.status === "Live",
        timestamp: uiClock,
      }),

    // Wealth Panel (if Personal Capital connected) or Connections Status Panel
    personalCapital?.connected
      ? e(WealthPanel, {
          data: personalCapital,
          compact: true,
          privateMode,
        })
      : e(ConnectionsStatusPanel, {
          connections: connectionsState,
        })
  );
};

// Memoize to prevent unnecessary re-renders
export const RightColumn = memo(RightColumnBase);

export default RightColumn;
