import React, { memo } from "react";
import { useAppStoreMultiple, STATE_SLICES } from "../hooks/useAppStore.js";
import { RightColumn } from "./right-column.js";

const e = React.createElement;

const RightSidebarBase = () => {
  const state = useAppStoreMultiple([
    STATE_SLICES.UI,
    STATE_SLICES.PORTFOLIO,
    STATE_SLICES.TICKERS,
    STATE_SLICES.CONNECTIONS,
  ]);

  const ui = state[STATE_SLICES.UI] || {};
  const portfolio = state[STATE_SLICES.PORTFOLIO] || {};
  const tickers = state[STATE_SLICES.TICKERS] || {};
  const connections = state[STATE_SLICES.CONNECTIONS] || {};

  return e(RightColumn, {
    viewMode: ui.viewMode,
    portfolio: portfolio.portfolio,
    tradingStatus: portfolio.tradingStatus,
    tradingHistory: portfolio.tradingHistory,
    portfolioLastUpdated: portfolio.lastUpdated,
    nextTradeTimeDisplay: portfolio.nextTradeTime,
    privateMode: ui.privateMode,
    alpacaStatus: portfolio.alpacaStatus,
    alpacaMode: portfolio.alpacaMode,
    tickers: tickers.tickers,
    personalCapitalData: portfolio.personalCapitalData,
    connectionStatuses: connections,
    uiClock: ui.uiClock,
    tradeAction: portfolio.tradeAction,
  });
};

export const RightSidebar = memo(RightSidebarBase);
export default RightSidebar;
