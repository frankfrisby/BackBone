import React, { memo } from "react";
import { useAppStoreMultiple, STATE_SLICES } from "../hooks/useAppStore.js";
import { AppFooterBar } from "./app-footer-bar.js";

const e = React.createElement;

const BottomStatusBarBase = () => {
  const state = useAppStoreMultiple([
    STATE_SLICES.UI,
    STATE_SLICES.USER,
    STATE_SLICES.TICKERS,
    STATE_SLICES.PORTFOLIO,
    STATE_SLICES.HEALTH,
    STATE_SLICES.GOALS,
    STATE_SLICES.ENGINE,
  ]);
  const ui = state[STATE_SLICES.UI] || {};
  const user = state[STATE_SLICES.USER] || {};
  const tickers = state[STATE_SLICES.TICKERS] || {};
  const portfolio = state[STATE_SLICES.PORTFOLIO] || {};
  const health = state[STATE_SLICES.HEALTH] || {};
  const goals = state[STATE_SLICES.GOALS] || {};
  const engine = state[STATE_SLICES.ENGINE] || {};

  // Extract SPY data for footer display
  const tickerList = tickers.tickers || [];
  const spy = tickerList.find(t => t.symbol === "SPY");
  const spyData = spy ? {
    score: spy.score ?? null,
    change: spy.changePercent ?? spy.change ?? 0,
  } : null;

  return e(AppFooterBar, {
    currentTier: ui.currentTier,
    viewMode: ui.viewMode,
    privateMode: ui.privateMode,
    firebaseUser: user.firebaseUser,
    spyScore: spyData?.score ?? null,
    spyChange: spyData?.change ?? null,
    // Data freshness
    portfolioUpdated: portfolio.lastUpdated || null,
    healthUpdated: health.ouraHealth?.lastUpdated || null,
    tickersUpdated: tickers.tickerStatus?.lastRefresh || null,
    // Ticker sweep progress (for visibility during long scans)
    tickersSweepRunning: !!tickers.tickerStatus?.fullScanRunning,
    tickersSweepProgress: tickers.tickerStatus?.scanProgress ?? null,
    tickersSweepTotal: (tickers.tickerStatus?.scanTotal ?? null) || (tickers.tickerStatus?.universeSize ?? null),
    tickersEvaluatedToday: tickers.tickerStatus?.evaluatedToday ?? null,
    tickersUniverseSize: tickers.tickerStatus?.universeSize ?? null,
    goalsCount: goals.goals?.length || 0,
    engineStatus: engine.status || null,
  });
};

export const BottomStatusBar = memo(BottomStatusBarBase);
export default BottomStatusBar;
