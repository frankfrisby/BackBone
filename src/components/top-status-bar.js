import React, { memo, useEffect, useState } from "react";
import { ConnectionBar } from "./connection-bar.js";
import { useAppStore, STATE_SLICES } from "../hooks/useAppStore.js";

const e = React.createElement;

const TopStatusBarBase = () => {
  const connections = useAppStore(STATE_SLICES.CONNECTIONS) || {};
  const userState = useAppStore(STATE_SLICES.USER) || {};
  const userDisplay = userState.firebaseUserDisplay || userState.userDisplayName || "";
  const [statusActive, setStatusActive] = useState(true);
  const isOnline = Object.values(connections || {}).some((conn) => conn?.connected);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setStatusActive((prev) => !prev);
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  return e(ConnectionBar, {
    connections,
    title: "BACKBONE",
    version: "3.0.0",
    userDisplay,
    statusText: isOnline ? "ONLINE" : "OFFLINE",
    statusVariant: isOnline ? "online" : "offline",
    blinkActive: statusActive,
  });
};

export const TopStatusBar = memo(TopStatusBarBase);
export default TopStatusBar;
