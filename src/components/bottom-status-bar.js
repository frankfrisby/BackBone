import React, { memo } from "react";
import { useAppStoreMultiple, STATE_SLICES } from "../hooks/useAppStore.js";
import { AppFooterBar } from "./app-footer-bar.js";

const e = React.createElement;

const BottomStatusBarBase = () => {
  const state = useAppStoreMultiple([STATE_SLICES.UI, STATE_SLICES.USER]);
  const ui = state[STATE_SLICES.UI] || {};
  const user = state[STATE_SLICES.USER] || {};

  return e(AppFooterBar, {
    currentTier: ui.currentTier,
    viewMode: ui.viewMode,
    privateMode: ui.privateMode,
    firebaseUser: user.firebaseUser,
  });
};

export const BottomStatusBar = memo(BottomStatusBarBase);
export default BottomStatusBar;
