import React, { memo } from "react";
import { Box, Text } from "ink";

const e = React.createElement;

const STATUS_COLORS = {
  working: "#64748b",
  done: "#22c55e",
  error: "#ef4444",
  observation: "#f8fafc"
};

const formatDuration = (entry) => {
  if (!entry.endedAt) return "running";
  const ms = Math.max(0, entry.endedAt - entry.startedAt);
  const seconds = Math.floor(ms / 1000);
  return `${seconds}s`;
};

const formatTarget = (target) => {
  if (!target) return "";
  const trimmed = target.length > 80 ? `${target.slice(0, 77)}...` : target;
  return `('${trimmed}')`;
};

const renderDiffLine = (line, index) => {
  let color = "#94a3b8";
  if (line.startsWith("+")) color = "#22c55e";
  if (line.startsWith("-")) color = "#ef4444";
  const lineNo = String(index + 1).padStart(2, " ");
  return e(Text, { key: `${index}-${line}`, color }, `${lineNo} ${line}`);
};

const ToolActionsPanelBase = ({ items = [] }) => {
  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#0f172a",
      padding: 1,
      marginBottom: 1
    },
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(Text, { color: "#64748b" }, "Actions"),
      e(Text, { color: "#475569" }, `${items.length} tools`)
    ),
    items.length === 0
      ? e(Text, { color: "#475569" }, "No tool activity yet.")
      : e(
          Box,
          { flexDirection: "column", marginTop: 1 },
          ...items.map((entry) => {
            const color = STATUS_COLORS[entry.status] || "#64748b";
            const statusIcon = entry.status === "done" ? "✓" : entry.status === "error" ? "x" : "•";
            return e(
              Box,
              { key: entry.id, flexDirection: "column", marginBottom: 1 },
              e(
                Box,
                { flexDirection: "row", gap: 1 },
                e(Text, { color }, statusIcon),
                e(Text, { color, bold: entry.status === "working" }, `${entry.tool}${formatTarget(entry.target)}`),
                e(Text, { color: "#475569" }, formatDuration(entry)),
                e(Text, { color: "#475569" }, `tokens: ${entry.tokens || "n/a"}`)
              ),
              entry.diffLines && entry.diffLines.length > 0 && e(
                Box,
                { flexDirection: "column", marginLeft: 2, marginTop: 0 },
                e(Text, { color: "#64748b" }, "-> changes"),
                ...entry.diffLines.slice(-6).map(renderDiffLine)
              )
            );
          })
        )
  );
};

const areToolEventsEqual = (prevProps, nextProps) => {
  const prevItems = prevProps.items || [];
  const nextItems = nextProps.items || [];
  if (prevItems.length !== nextItems.length) return false;
  for (let i = 0; i < prevItems.length; i += 1) {
    const prev = prevItems[i];
    const next = nextItems[i];
    if (!prev || !next) return false;
    const prevLines = prev.diffLines?.length || 0;
    const nextLines = next.diffLines?.length || 0;
    if (
      prev.id !== next.id ||
      prev.status !== next.status ||
      prev.tool !== next.tool ||
      prev.target !== next.target ||
      prev.tokens !== next.tokens ||
      (prev.startedAt || 0) !== (next.startedAt || 0) ||
      (prev.endedAt || 0) !== (next.endedAt || 0) ||
      prevLines !== nextLines
    ) {
      return false;
    }
  }
  return true;
};

export const ToolActionsPanel = memo(ToolActionsPanelBase, areToolEventsEqual);

export default ToolActionsPanel;
