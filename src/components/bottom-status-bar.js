import React, { memo, useMemo } from "react";
import { useAppStoreMultiple, STATE_SLICES } from "../hooks/useAppStore.js";
import { AppFooterBar } from "./app-footer-bar.js";

const e = React.createElement;

const BottomStatusBarBase = () => {
  const state = useAppStoreMultiple([STATE_SLICES.UI, STATE_SLICES.USER, STATE_SLICES.TICKERS]);
  const ui = state[STATE_SLICES.UI] || {};
  const user = state[STATE_SLICES.USER] || {};
  const tickers = state[STATE_SLICES.TICKERS] || {};

  // Extract SPY data for footer display
  const spyData = useMemo(() => {
    const tickerList = tickers.tickers || [];
    const spy = tickerList.find(t => t.symbol === "SPY");
    if (!spy) return null;
    return {
      score: spy.score ?? null,
      change: spy.changePercent ?? spy.change ?? 0,
    };
  }, [tickers.tickers]);

  return e(AppFooterBar, {
    currentTier: ui.currentTier,
    viewMode: ui.viewMode,
    privateMode: ui.privateMode,
    firebaseUser: user.firebaseUser,
    spyScore: spyData?.score ?? null,
    spyChange: spyData?.change ?? null,
  });
};

export const BottomStatusBar = memo(BottomStatusBarBase);
export default BottomStatusBar;
