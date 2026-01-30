import React, { memo, useMemo } from "react";
import { useAppStoreMultiple, STATE_SLICES } from "../hooks/useAppStore.js";
import { LeftColumn } from "./left-column.js";

const e = React.createElement;

const LeftSidebarBase = () => {
  const state = useAppStoreMultiple([
    STATE_SLICES.UI,
    STATE_SLICES.HEALTH,
    STATE_SLICES.TICKERS,
    STATE_SLICES.PROJECTS,
    STATE_SLICES.USER,
    STATE_SLICES.PORTFOLIO,
  ]);

  const ui = state[STATE_SLICES.UI] || {};
  const health = state[STATE_SLICES.HEALTH] || {};
  const tickers = state[STATE_SLICES.TICKERS] || {};
  const projects = state[STATE_SLICES.PROJECTS] || {};
  const user = state[STATE_SLICES.USER] || {};
  const portfolio = state[STATE_SLICES.PORTFOLIO] || {};

  // Extract SPY data for market context
  const spyData = useMemo(() => {
    const tickerList = tickers.tickers || [];
    const spy = tickerList.find(t => t.symbol === "SPY");
    if (!spy) return { spyPositive: null, spyChange: null };
    const change = spy.changePercent ?? spy.change ?? 0;
    return {
      spyPositive: change >= 0,
      spyChange: change,
    };
  }, [tickers.tickers]);

  return e(LeftColumn, {
    viewMode: ui.viewMode,
    ouraHealth: health.ouraHealth,
    ouraHistory: health.ouraHistory,
    tickers: tickers.tickers,
    tickerStatus: tickers.tickerStatus,
    tradingStatus: tickers.tradingStatus,
    projects: projects.projects,
    currentWorkingProject: projects.currentWorkingProject,
    uiClock: ui.uiClock,
    userName: user.userDisplayName,
    aiHealthResponse: health.aiHealthResponse,
    privateMode: ui.privateMode,
    spyPositive: spyData.spyPositive,
    spyChange: spyData.spyChange,
    positions: portfolio.portfolio?.positions || [],
    trailingStops: portfolio.trailingStops || {},
  });
};

export const LeftSidebar = memo(LeftSidebarBase);
export default LeftSidebar;
