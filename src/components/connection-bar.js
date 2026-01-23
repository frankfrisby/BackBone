import React, { useState, useEffect, memo } from "react";
import { Box, Text } from "ink";

const e = React.createElement;

// Cache for time display to prevent re-renders
let cachedTime = "";
let lastTimeUpdate = 0;

// Service colors and icons
const SERVICE_CONFIG = {
  alpaca: { color: "#22c55e", dimColor: "#166534", icon: "△", label: "Alpaca" },
  claude: { color: "#d97706", dimColor: "#92400e", icon: "◈", label: "Claude" },
  claudeCode: { color: "#f59e0b", dimColor: "#b45309", icon: "⟨⟩", label: "Code" },
  linkedin: { color: "#0077b5", dimColor: "#1e3a5f", icon: "in", label: "LinkedIn" },
  oura: { color: "#8b5cf6", dimColor: "#5b21b6", icon: "○", label: "Oura" },
  yahoo: { color: "#7c3aed", dimColor: "#4c1d95", icon: "Y!", label: "Yahoo" },
  personalCapital: { color: "#00a6a0", dimColor: "#006e6b", icon: "$", label: "Finance" }
};

/**
 * Status Dot Component - Static indicator (no animation to prevent flickering)
 */
const StatusDot = ({ connected, color }) => {
  if (!connected) {
    return e(Text, { color: "#334155" }, "○ ");
  }
  return e(Text, { color, bold: true }, "● ");
};

/**
 * Connection Bar Component - Shows colored status dots with service names
 * Static indicators to prevent flickering
 */
const ConnectionBarBase = ({ connections = {}, title = "BACKBONE", version = "", userDisplay = "" }) => {
  const services = Object.keys(SERVICE_CONFIG);
  const connectedCount = services.filter(key => connections[key]?.connected).length;

  return e(
    Box,
    {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingX: 1,
      paddingY: 0,
      marginBottom: 1,
      borderStyle: "round",
      borderColor: "#0f172a"
    },
    // Title with logo
    e(
      Box,
      { flexDirection: "row", gap: 1, alignItems: "center" },
      e(Text, { color: "#f59e0b", bold: true }, "◆"),
      e(Text, { color: "#f59e0b", bold: true }, title),
      e(Text, { color: "#64748b" }, " ENGINE"),
      version && e(Text, { color: "#475569" }, `v${version}`),
      e(Text, { color: "#334155" }, "│"),
      e(Text, { color: connectedCount > 0 ? "#22c55e" : "#64748b" }, `${connectedCount}/${services.length}`),
      e(Text, { color: "#475569" }, "connected"),
      userDisplay && e(Text, { color: "#1e293b" }, " │"),
      userDisplay && e(Text, { color: "#94a3b8" }, userDisplay)
    ),
    // Connection indicators with static dots
    e(
      Box,
      { flexDirection: "row", gap: 1 },
      ...services.map((key, idx) => {
        const config = SERVICE_CONFIG[key];
        const conn = connections[key];
        const connected = conn?.connected || false;
        const textColor = connected ? "#94a3b8" : "#475569";

        return e(
          Box,
          { key, flexDirection: "row", gap: 0 },
          e(StatusDot, {
            connected,
            color: config.color
          }),
          e(Text, { color: textColor }, config.label),
          idx < services.length - 1 && e(Text, { color: "#1e293b" }, " │")
        );
      })
    )
  );
};

/**
 * Custom comparison to prevent unnecessary re-renders
 */
const areConnectionBarPropsEqual = (prevProps, nextProps) => {
  if (prevProps.title !== nextProps.title) return false;
  if (prevProps.version !== nextProps.version) return false;
  if (prevProps.userDisplay !== nextProps.userDisplay) return false;

  // Only compare connection status, not details (which may include timestamps)
  const prevConns = prevProps.connections || {};
  const nextConns = nextProps.connections || {};
  const services = Object.keys(SERVICE_CONFIG);

  for (const key of services) {
    const prevConnected = prevConns[key]?.connected || false;
    const nextConnected = nextConns[key]?.connected || false;
    if (prevConnected !== nextConnected) return false;
  }

  return true;
};

export const ConnectionBar = memo(ConnectionBarBase, areConnectionBarPropsEqual);

/**
 * Compact Connection Status - Just icons (no animation)
 */
const ConnectionStatusCompactBase = ({ connections = {} }) => {
  const services = ["alpaca", "claude", "linkedin", "oura", "yahoo", "personalCapital"];

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    ...services.map(service => {
      const config = SERVICE_CONFIG[service];
      const conn = connections[service];
      const connected = conn?.connected || false;
      const color = connected ? config?.color || "#22c55e" : "#334155";
      return e(Text, { key: service, color }, connected ? "\u25CF" : "\u25CB");
    })
  );
};

export const ConnectionStatusCompact = memo(ConnectionStatusCompactBase);

/**
 * Detailed Connection Panel - For diagnostics view
 */
export const ConnectionPanel = ({ connections = [], title = "Connections" }) => {
  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "single",
      borderColor: "#0f172a",
      paddingX: 1
    },
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(Text, { color: "#64748b" }, title),
      e(Text, { color: "#22c55e" }, `${connections.filter(c => c.connected).length}/${connections.length}`)
    ),
    ...connections.slice(0, 6).map((conn, i) => e(
      Box,
      { key: conn.source || i, flexDirection: "row", gap: 1 },
      e(Text, { color: conn.connected ? "#22c55e" : "#475569" }, conn.connected ? "\u25CF" : "\u25CB"),
      e(Text, { color: "#94a3b8" }, (conn.source || "").slice(0, 10))
    ))
  );
};

export default ConnectionBar;
