import React, { memo } from "react";
import { Box, Text } from "ink";

const e = React.createElement;

/**
 * Format currency with commas and dollar sign
 * @param {number} value - The value to format
 * @param {boolean} privateMode - If true, mask the value with stars
 */
const formatCurrency = (value, privateMode = false) => {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";

  // In private mode, show masked value
  if (privateMode) {
    return "$••••••";
  }

  const isNegative = num < 0;
  const formatted = Math.abs(num).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  return isNegative ? `-$${formatted}` : `$${formatted}`;
};

/**
 * Format percentage
 */
const formatPercent = (value) => {
  if (value === null || value === undefined) return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  const sign = num >= 0 ? "+" : "";
  return `${sign}${num.toFixed(1)}%`;
};

/**
 * Wealth Panel Component
 * Displays Personal Capital financial data
 * @param {Object} data - Financial data from Personal Capital
 * @param {boolean} compact - Use compact display mode
 * @param {boolean} privateMode - Mask sensitive financial values
 */
export const WealthPanel = ({ data, compact = false, privateMode = false }) => {
  if (!data || !data.connected) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "single",
        borderColor: "#334155",
        paddingX: 1,
        paddingY: 0,
        height: 5,
        overflow: "hidden"
      },
      e(Text, { color: "#64748b" }, "Financial Wealth"),
      e(Text, { color: "#475569", dimColor: true }, "Not connected"),
      e(Text, { color: "#475569", dimColor: true }, "Type /finances to connect")
    );
  }

  const { netWorth, accountsByType, topHoldings, lastUpdated, accountCount } = data;

  // Calculate totals
  const assets = netWorth?.assets || 0;
  const liabilities = netWorth?.liabilities || 0;
  const totalNetWorth = netWorth?.total || (assets - liabilities);

  // Categorize accounts
  const investments = (accountsByType?.INVESTMENT?.balance || 0) + (accountsByType?.RETIREMENT?.balance || 0);
  const cash = (accountsByType?.BANK?.balance || 0) + (accountsByType?.CASH?.balance || 0);
  const debt = (accountsByType?.CREDIT_CARD?.balance || 0) + (accountsByType?.LOAN?.balance || 0) + (accountsByType?.MORTGAGE?.balance || 0);

  if (compact) {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(
        Box,
        { flexDirection: "row", gap: 2 },
        e(Text, { color: "#22c55e", bold: true }, formatCurrency(totalNetWorth, privateMode)),
        e(Text, { color: "#64748b" }, "net worth"),
        privateMode && e(Text, { color: "#f59e0b" }, " [PRIVATE]")
      )
    );
  }

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "single",
      borderColor: "#0f172a",
      paddingX: 1,
      paddingY: 0,
      height: compact ? 10 : 14,
      overflow: "hidden"
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#f59e0b", bold: true }, "Financial Wealth"),
        privateMode && e(Text, { color: "#f59e0b" }, "[PRIVATE]")
      ),
      e(Text, { color: "#475569" }, `${accountCount} accounts`)
    ),

    // Net Worth - Main highlight
    e(
      Box,
      { flexDirection: "row", marginTop: 1, gap: 1 },
      e(Text, { color: "#64748b" }, "Net Worth"),
      e(Text, { color: totalNetWorth >= 0 ? "#22c55e" : "#ef4444", bold: true }, formatCurrency(totalNetWorth, privateMode))
    ),

    // Separator
    e(Text, { color: "#334155" }, "─".repeat(30)),

    // Investment - Primary
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#22c55e" }, "●"),
        e(Text, { color: "#94a3b8" }, "Investments")
      ),
      e(Text, { color: "#22c55e", bold: true }, formatCurrency(investments, privateMode))
    ),

    // Cash
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#3b82f6" }, "●"),
        e(Text, { color: "#94a3b8" }, "Cash")
      ),
      e(Text, { color: "#3b82f6" }, formatCurrency(cash, privateMode))
    ),

    // Debt - in red
    debt > 0 && e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#ef4444" }, "●"),
        e(Text, { color: "#94a3b8" }, "Debt")
      ),
      e(Text, { color: "#ef4444", bold: true }, privateMode ? "$••••••" : `-${formatCurrency(debt)}`)
    ),

    // Top Holdings Section
    topHoldings && topHoldings.length > 0 && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: "#64748b" }, "Top Holdings"),
      ...topHoldings.slice(0, 3).map((h, i) =>
        e(
          Box,
          { key: h.ticker || i, flexDirection: "row", justifyContent: "space-between" },
          e(Text, { color: "#94a3b8" }, h.ticker || h.name?.slice(0, 10) || "Unknown"),
          e(
            Box,
            { flexDirection: "row", gap: 1 },
            e(Text, { color: "#64748b" }, formatCurrency(h.value, privateMode)),
            h.gainPercent !== undefined && !privateMode && e(
              Text,
              { color: h.gainPercent >= 0 ? "#22c55e" : "#ef4444" },
              formatPercent(h.gainPercent)
            )
          )
        )
      )
    ),

    // Last updated
    e(
      Box,
      { marginTop: 1 },
      e(Text, { color: "#475569", dimColor: true }, `Updated: ${lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "Never"}`)
    )
  );
};

/**
 * Compact Wealth Display - For header/status bar
 */
export const WealthCompact = ({ data, privateMode = false }) => {
  if (!data || !data.connected) {
    return e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#475569" }, "$"),
      e(Text, { color: "#475569" }, "---")
    );
  }

  const totalNetWorth = data.netWorth?.total || 0;

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    e(Text, { color: "#f59e0b" }, "$"),
    privateMode
      ? e(Text, { color: "#f59e0b" }, "••••••")
      : e(Text, { color: totalNetWorth >= 0 ? "#22c55e" : "#ef4444", bold: true }, formatCurrency(totalNetWorth).replace("$", ""))
  );
};

/**
 * Wealth Summary Line - Single line for notifications/status
 */
export const WealthSummaryLine = ({ data, privateMode = false }) => {
  if (!data || !data.connected) {
    return e(Text, { color: "#475569" }, "Wealth: Not connected");
  }

  const { netWorth, accountsByType } = data;
  const investments = (accountsByType?.INVESTMENT?.balance || 0) + (accountsByType?.RETIREMENT?.balance || 0);
  const debt = (accountsByType?.CREDIT_CARD?.balance || 0) + (accountsByType?.LOAN?.balance || 0) + (accountsByType?.MORTGAGE?.balance || 0);

  return e(
    Box,
    { flexDirection: "row", gap: 2 },
    e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#64748b" }, "Net:"),
      e(Text, { color: "#22c55e", bold: true }, formatCurrency(netWorth?.total || 0, privateMode))
    ),
    e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#64748b" }, "Inv:"),
      e(Text, { color: "#3b82f6" }, formatCurrency(investments, privateMode))
    ),
    debt > 0 && e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#64748b" }, "Debt:"),
      e(Text, { color: "#ef4444" }, formatCurrency(debt, privateMode))
    )
  );
};

/**
 * Connections Status Panel - Shows all connections with commands
 */
const ConnectionsStatusPanelBase = ({ connections = {} }) => {
  const connectionItems = [
    { key: "claude", label: "AI Model", command: "/models", icon: "◈" },
    { key: "alpaca", label: "Trading", command: "/alpaca", icon: "△" },
    { key: "personalCapital", label: "Finances", command: "/finances", icon: "$" },
    { key: "oura", label: "Health", command: "/oura", icon: "○" },
    { key: "linkedin", label: "Career", command: "/linkedin", icon: "in" }
  ];

  const connectedCount = connectionItems.filter(item => connections[item.key]?.connected).length;

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "single",
      borderColor: "#334155",
      paddingX: 1,
      paddingY: 0,
      height: 9,
      overflow: "hidden"
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(Text, { color: "#64748b" }, "Connections"),
      e(Text, { color: connectedCount > 0 ? "#22c55e" : "#64748b" }, `${connectedCount}/${connectionItems.length}`)
    ),

    // Connection items
    ...connectionItems.map(item => {
      const conn = connections[item.key];
      const isConnected = conn?.connected;

      return e(
        Box,
        { key: item.key, flexDirection: "row", justifyContent: "space-between" },
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: isConnected ? "#22c55e" : "#475569" }, isConnected ? "✓" : "○"),
          e(Text, { color: isConnected ? "#94a3b8" : "#64748b" }, item.label)
        ),
        !isConnected && e(Text, { color: "#f59e0b" }, item.command)
      );
    })
  );
};

/**
 * Custom comparison to prevent unnecessary re-renders
 */
const areConnectionsEqual = (prev, next) => {
  const keys = ["claude", "alpaca", "personalCapital", "oura", "linkedin"];
  for (const key of keys) {
    if (prev.connections?.[key]?.connected !== next.connections?.[key]?.connected) {
      return false;
    }
  }
  return true;
};

export const ConnectionsStatusPanel = memo(ConnectionsStatusPanelBase, areConnectionsEqual);

export default WealthPanel;
