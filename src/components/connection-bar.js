import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

const e = React.createElement;

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
 * Pulsing Dot Component - Animates between bright and dim colors
 */
const PulsingDot = ({ connected, color, dimColor, pulsePhase }) => {
  if (!connected) {
    return e(Text, { color: "#334155" }, "○ ");
  }

  // Pulse between bright and dim based on phase
  const currentColor = pulsePhase ? color : dimColor;
  return e(Text, { color: currentColor, bold: pulsePhase }, "● ");
};

/**
 * Connection Bar Component - Shows colored status dots with service names
 * Connected dots pulse to show active connection
 */
export const ConnectionBar = ({ connections = {}, title = "BACKBONE", version = "" }) => {
  const [pulsePhase, setPulsePhase] = useState(true);

  // Pulse animation - toggle every 5 seconds (slower to reduce re-renders)
  useEffect(() => {
    const interval = setInterval(() => {
      setPulsePhase(prev => !prev);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
      borderColor: "#1e293b"
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
      e(Text, { color: "#475569" }, "connected")
    ),
    // Connection indicators with pulsing dots
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
          e(PulsingDot, {
            connected,
            color: config.color,
            dimColor: config.dimColor,
            pulsePhase
          }),
          e(Text, { color: textColor }, config.label),
          idx < services.length - 1 && e(Text, { color: "#1e293b" }, " │")
        );
      })
    )
  );
};

/**
 * Compact Connection Status - Just icons with labels on hover
 */
export const ConnectionStatusCompact = ({ connections = {} }) => {
  const [pulsePhase, setPulsePhase] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulsePhase(prev => !prev);
    }, 3000); // Reduced from 1s to 3s to prevent glitching
    return () => clearInterval(interval);
  }, []);

  const services = ["alpaca", "claude", "linkedin", "oura", "yahoo", "personalCapital"];

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    ...services.map(service => {
      const config = SERVICE_CONFIG[service];
      const conn = connections[service];
      const connected = conn?.connected || false;
      const color = connected
        ? (pulsePhase ? config?.color : config?.dimColor) || "#22c55e"
        : "#334155";
      return e(Text, { key: service, color }, connected ? "\u25CF" : "\u25CB");
    })
  );
};

/**
 * Detailed Connection Panel - For diagnostics view
 */
export const ConnectionPanel = ({ connections = [], title = "Connections" }) => {
  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "single",
      borderColor: "#1e293b",
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
