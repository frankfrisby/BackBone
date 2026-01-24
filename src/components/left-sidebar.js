import React, { memo } from "react";
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
  ]);

  const ui = state[STATE_SLICES.UI] || {};
  const health = state[STATE_SLICES.HEALTH] || {};
  const tickers = state[STATE_SLICES.TICKERS] || {};
  const projects = state[STATE_SLICES.PROJECTS] || {};
  const user = state[STATE_SLICES.USER] || {};

  return e(LeftColumn, {
    viewMode: ui.viewMode,
    ouraHealth: health.ouraHealth,
    ouraHistory: health.ouraHistory,
    tickers: tickers.tickers,
    projects: projects.projects,
    uiClock: ui.uiClock,
    userName: user.userDisplayName,
    aiHealthResponse: health.aiHealthResponse,
    privateMode: ui.privateMode,
  });
};

export const LeftSidebar = memo(LeftSidebarBase);
export default LeftSidebar;
