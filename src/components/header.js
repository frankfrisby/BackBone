import React, { useMemo } from "react";
import { Box, Text } from "ink";

const e = React.createElement;

// Static gradient colors - no animation, just color stops
const GRADIENT_COLORS = ["#667eea", "#764ba2", "#f093fb"];

// Cache date string to prevent re-renders every second
let cachedDateTime = "";
let lastDateUpdate = 0;
const DATE_UPDATE_INTERVAL = 60000; // Update every minute

/**
 * ASCII Art BACKBONE logo
 */
const BACKBONE_LOGO = [
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
  "\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551 \u2588\u2588\u2554\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2557  ",
  "\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2588\u2588\u2557 \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u255D  ",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551  \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
  "\u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u255D  \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D"
];

/**
 * Compact BACKBONE title
 */
const BACKBONE_COMPACT = "\u25C6 BACKBONE";

/**
 * Status indicator colors
 */
const getStatusColor = (status) => {
  if (status === "Connected") return "#22c55e";
  if (status === "Missing key" || status === "Missing") return "#f97316";
  if (status === "Offline") return "#ef4444";
  return "#64748b";
};

/**
 * Status indicator icon - more distinct icons
 */
const getStatusIcon = (status) => {
  if (status === "Connected") return "●"; // Filled circle
  if (status === "Pending") return "◐"; // Half circle
  if (status === "Offline") return "✕"; // X mark
  return "○"; // Empty circle
};

/**
 * Get current date/time string (cached to prevent unnecessary re-renders)
 */
const getDateTime = () => {
  const now = Date.now();
  if (now - lastDateUpdate > DATE_UPDATE_INTERVAL || !cachedDateTime) {
    cachedDateTime = new Date().toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    lastDateUpdate = now;
  }
  return cachedDateTime;
};

/**
 * Header component with big BACKBONE logo
 */
const HeaderBase = ({ claudeStatus, version = "2.0.0", compact = false, integrations = {} }) => {
  const statusColor = getStatusColor(claudeStatus);
  const statusIcon = getStatusIcon(claudeStatus);

  // Count connected integrations
  const connectedCount = Object.values(integrations).filter((v) => v === "Connected").length;
  const totalCount = Object.keys(integrations).length;

  if (compact) {
    return e(
      Box,
      {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingX: 1,
        borderStyle: "round",
        borderColor: "#334155"
      },
      e(
        Box,
        { flexDirection: "row", gap: 1, alignItems: "center" },
        e(Text, { color: "#667eea", bold: true }, BACKBONE_COMPACT),
        e(Text, { color: "#334155" }, "│"),
        e(Text, { color: "#475569" }, `v${version}`)
      ),
      e(
        Box,
        { flexDirection: "row", gap: 2, alignItems: "center" },
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: statusColor, bold: true }, statusIcon),
          e(Text, { color: statusColor }, claudeStatus)
        ),
        e(Text, { color: "#334155" }, "│"),
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: connectedCount > 0 ? "#22c55e" : "#64748b" }, `${connectedCount}/${totalCount}`),
          e(Text, { color: "#475569" }, "services")
        ),
        e(Text, { color: "#334155" }, "│"),
        e(Text, { color: "#475569" }, getDateTime())
      )
    );
  }

  return e(
    Box,
    {
      flexDirection: "column",
      paddingX: 2,
      paddingY: 1,
      borderStyle: "double",
      borderColor: "#f59e0b"
    },
    // Big ASCII logo - static colors instead of animated gradient
    e(
      Box,
      { flexDirection: "column", alignItems: "center" },
      ...BACKBONE_LOGO.map((line, i) =>
        e(Text, { key: i, color: GRADIENT_COLORS[i % GRADIENT_COLORS.length], bold: true }, line)
      )
    ),
    // Subtitle and version
    e(
      Box,
      { flexDirection: "row", justifyContent: "center", marginTop: 1, gap: 1 },
      e(Text, { color: "#8b5cf6" }, "◆"),
      e(Text, { color: "#94a3b8" }, "AI-Powered Life Operating System"),
      e(Text, { color: "#334155" }, "│"),
      e(Text, { color: "#f59e0b", bold: true }, `v${version}`)
    ),
    // Status bar separator
    e(
      Box,
      { marginTop: 1, justifyContent: "center" },
      e(Text, { color: "#334155" }, "═".repeat(76))
    ),
    // Status info row
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginTop: 1 },
      // Left: Connection status
      e(
        Box,
        { flexDirection: "row", gap: 3 },
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: "#64748b" }, "Claude"),
          e(Text, { color: statusColor, bold: true }, statusIcon),
          e(Text, { color: statusColor }, claudeStatus)
        ),
        e(Text, { color: "#334155" }, "│"),
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: "#64748b" }, "Services"),
          e(
            Text,
            { color: connectedCount > 0 ? "#22c55e" : "#64748b", bold: true },
            `${connectedCount}/${totalCount}`
          ),
          e(Text, { color: "#475569" }, "connected")
        )
      ),
      // Right: Date/time and help hint
      e(
        Box,
        { flexDirection: "row", gap: 2 },
        e(Text, { color: "#475569" }, getDateTime()),
        e(Text, { color: "#334155" }, "│"),
        e(Text, { color: "#f59e0b" }, "/"),
        e(Text, { color: "#64748b" }, "commands")
      )
    )
  );
};

/**
 * Minimal header for small terminals
 */
export const HeaderMinimal = ({ claudeStatus }) => {
  const statusColor = getStatusColor(claudeStatus);
  return e(
    Box,
    { flexDirection: "row", gap: 2, paddingX: 1 },
    e(Text, { color: "#667eea", bold: true }, BACKBONE_COMPACT),
    e(Text, { color: statusColor }, getStatusIcon(claudeStatus))
  );
};

/**
 * Custom comparison to prevent unnecessary re-renders
 */
const areHeaderPropsEqual = (prevProps, nextProps) => {
  // Only re-render if these specific values change
  if (prevProps.claudeStatus !== nextProps.claudeStatus) return false;
  if (prevProps.version !== nextProps.version) return false;
  if (prevProps.compact !== nextProps.compact) return false;

  // Deep compare integrations object
  const prevIntegrations = prevProps.integrations || {};
  const nextIntegrations = nextProps.integrations || {};
  const prevKeys = Object.keys(prevIntegrations);
  const nextKeys = Object.keys(nextIntegrations);

  if (prevKeys.length !== nextKeys.length) return false;

  for (const key of prevKeys) {
    if (prevIntegrations[key] !== nextIntegrations[key]) return false;
  }

  return true;
};

export const Header = React.memo(HeaderBase, areHeaderPropsEqual);
