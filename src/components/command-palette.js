import React from "react";
import { Box, Text } from "ink";
import { COMMAND_DESCRIPTIONS } from "../commands.js";

const e = React.createElement;

/**
 * Command icons for visual enhancement
 */
const COMMAND_ICONS = {
  "/connect": "⚡",
  "/commands": "☰",
  "/new": "✦",
  "/init": "⚙",
  "/session": "◎",
  "/review": "◈",
  "/mcp": "⬡",
  "/help": "?",
  "/quit": "✕",
  "/clear": "○",
  "/status": "◉",
  "/settings": "⚙",
  "/profile": "◑",
  "/goals": "◇",
  "/trade": "△",
  "/portfolio": "▣",
  "/analyze": "◈",
  "/agents": "◆",
  default: "›"
};

/**
 * Command category colors
 */
const COMMAND_COLORS = {
  "/connect": "#22c55e",   // green - connection
  "/commands": "#3b82f6",  // blue - info
  "/new": "#f59e0b",       // orange - create
  "/init": "#8b5cf6",      // purple - setup
  "/session": "#06b6d4",   // cyan - sessions
  "/review": "#a78bfa",    // violet - review
  "/mcp": "#ec4899",       // pink - advanced
  "/trade": "#22c55e",     // green - trading
  "/portfolio": "#eab308", // yellow - finance
  "/analyze": "#38bdf8",   // sky - analysis
  default: "#64748b"
};

const getCommandIcon = (cmd) => {
  const base = cmd.split(" ")[0];
  return COMMAND_ICONS[base] || COMMAND_ICONS.default;
};

const getCommandColor = (cmd) => {
  const base = cmd.split(" ")[0];
  return COMMAND_COLORS[base] || COMMAND_COLORS.default;
};

const CommandPaletteBase = ({
  items,
  activeIndex,
  title = "Commands",
  isFocused = false,
  countLabel = "matches",
  compact = false  // In compact mode, render above input without extra margin
}) => {
  if (!items.length) {
    return null;
  }

  const normalizedItems = items.map((item) => {
    if (typeof item === "string") {
      return {
        value: item,
        label: item,
        description: COMMAND_DESCRIPTIONS[item] || "",
        recommended: false
      };
    }

    const value = item.value || item.label;

    return {
      value,
      label: item.label || value,
      description: item.description || COMMAND_DESCRIPTIONS[value] || "",
      recommended: Boolean(item.recommended)
    };
  });

  const visibleItems = normalizedItems.slice(0, 8);
  const headerColor = isFocused ? "#f59e0b" : "#64748b";
  const borderColor = isFocused ? "#334155" : "#1e293b";

  return e(
    Box,
    {
      flexDirection: "column",
      marginTop: compact ? 0 : 1,
      marginBottom: compact ? 1 : 0,  // Space between palette and input in compact mode
      borderStyle: "round",
      borderColor,
      padding: 1
    },
    // Header with title and count
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: headerColor, bold: true }, "⌘"),
        e(Text, { color: headerColor, bold: isFocused }, title)
      ),
      e(Text, { color: "#475569" }, `${normalizedItems.length} ${countLabel}`)
    ),
    // Separator line
    e(Text, { color: "#334155" }, "─".repeat(50)),
    // Command items
    ...visibleItems.map((item, index) => {
      const isActive = index === activeIndex;
      const cmdColor = getCommandColor(item.value);
      const icon = getCommandIcon(item.value);

      return e(
        Box,
        {
          key: item.value,
          flexDirection: "row",
          backgroundColor: isActive ? "#1e293b" : undefined,
          paddingX: 1,
          marginTop: index === 0 ? 1 : 0
        },
        // Selection indicator
        e(
          Text,
          { color: isActive ? "#f59e0b" : "#334155", bold: isActive },
          isActive ? "▸ " : "  "
        ),
        // Icon
        e(
          Text,
          { color: isActive ? cmdColor : "#475569" },
          `${icon} `
        ),
        // Command name
        e(
          Text,
          { color: isActive ? "#f8fafc" : "#e2e8f0", bold: isActive },
          item.label.padEnd(14)
        ),
        // Recommended badge
        item.recommended &&
          e(
            Text,
            { color: "#a78bfa" },
            "★ "
          ),
        // Description (dimmer)
        e(
          Text,
          { color: isActive ? "#94a3b8" : "#64748b" },
          item.description
        )
      );
    }),
    // More items indicator
    normalizedItems.length > 8 && e(
      Box,
      { marginTop: 1, paddingX: 1 },
      e(Text, { color: "#475569" }, `↓ ${normalizedItems.length - 8} more...`)
    ),
    // Footer hint
    e(
      Box,
      { flexDirection: "row", marginTop: 1, gap: 2 },
      e(Text, { color: "#475569" }, "↑↓"),
      e(Text, { color: "#334155" }, "navigate"),
      e(Text, { color: "#475569" }, "Tab"),
      e(Text, { color: "#334155" }, "complete"),
      e(Text, { color: "#475569" }, "Enter"),
      e(Text, { color: "#334155" }, "select")
    )
  );
};

export const CommandPalette = React.memo(CommandPaletteBase);
