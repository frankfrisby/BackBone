import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

/**
 * Keyboard shortcut display helper
 */
const Shortcut = ({ keys, label, color = "#475569" }) => {
  return e(
    Box,
    { flexDirection: "row", gap: 0 },
    e(Text, { color: "#f59e0b", bold: true }, keys),
    e(Text, { color: "#334155" }, " "),
    e(Text, { color }, label)
  );
};

/**
 * Footer Bar Component - Displays keyboard shortcuts and status info
 */
export const FooterBar = ({
  mode = "normal",
  workingDir = "",
  version = "",
  modelName = "",
  modelProvider = "",
  tokens = null,
  cost = null
}) => {
  const shortcuts = [
    { keys: "ctrl+t", label: "variants" },
    { keys: "tab", label: "agents" },
    { keys: "ctrl+p", label: "commands" },
    { keys: "esc", label: "interrupt" }
  ];

  return e(
    Box,
    {
      flexDirection: "column",
      marginTop: 1
    },
    // Separator line
    e(Text, { color: "#1e293b" }, "─".repeat(80)),
    // Main footer content
    e(
      Box,
      {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingX: 1,
        paddingY: 0
      },
      // Left side: working directory
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#475569" }, workingDir || process.cwd().split(/[\\/]/).pop())
      ),
      // Center: model info
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        modelName && e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: "#8b5cf6", bold: true }, modelName),
          modelProvider && e(Text, { color: "#475569" }, modelProvider),
          e(Text, { color: "#334155" }, "·"),
          e(Text, { color: "#22c55e" }, "xhigh")
        )
      ),
      // Right side: version
      version && e(Text, { color: "#475569" }, version)
    ),
    // Keyboard shortcuts row
    e(
      Box,
      {
        flexDirection: "row",
        justifyContent: "center",
        paddingX: 1,
        gap: 3,
        marginTop: 0
      },
      ...shortcuts.map((shortcut, idx) =>
        e(Shortcut, { key: idx, keys: shortcut.keys, label: shortcut.label })
      )
    ),
    // Token/cost info if available
    (tokens || cost) && e(
      Box,
      {
        flexDirection: "row",
        justifyContent: "flex-end",
        paddingX: 1
      },
      tokens && e(Text, { color: "#475569" }, `${tokens.toLocaleString()} tokens`),
      cost && e(Text, { color: "#475569" }, ` ($${cost.toFixed(2)})`)
    )
  );
};

/**
 * Compact footer for minimal space
 */
export const FooterCompact = ({ shortcuts = [] }) => {
  const defaultShortcuts = [
    { keys: "ctrl+t", label: "variants" },
    { keys: "tab", label: "agents" },
    { keys: "ctrl+p", label: "commands" }
  ];

  const items = shortcuts.length > 0 ? shortcuts : defaultShortcuts;

  return e(
    Box,
    {
      flexDirection: "row",
      justifyContent: "center",
      gap: 3,
      paddingY: 0
    },
    ...items.map((shortcut, idx) =>
      e(Shortcut, { key: idx, keys: shortcut.keys, label: shortcut.label })
    )
  );
};

/**
 * Progress footer with status
 */
export const FooterProgress = ({
  message = "",
  progress = 0,
  tokens = 0,
  cost = 0
}) => {
  const progressWidth = 30;
  const filled = Math.round((progress / 100) * progressWidth);
  const empty = progressWidth - filled;
  const progressBar = "█".repeat(filled) + "░".repeat(empty);

  return e(
    Box,
    {
      flexDirection: "column"
    },
    // Progress bar
    e(
      Box,
      { flexDirection: "row", gap: 1, paddingX: 1 },
      e(Text, { color: "#3b82f6" }, progressBar),
      e(Text, { color: "#475569" }, `${Math.round(progress)}%`)
    ),
    // Status row
    e(
      Box,
      {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingX: 1
      },
      e(Text, { color: "#64748b" }, message),
      e(
        Box,
        { flexDirection: "row", gap: 2 },
        e(Text, { color: "#475569" }, `${tokens.toLocaleString()}`),
        e(Text, { color: "#22c55e" }, `$${cost.toFixed(2)}`)
      )
    ),
    // Interrupt hint
    e(
      Box,
      { justifyContent: "center", paddingX: 1 },
      e(Shortcut, { keys: "esc", label: "interrupt", color: "#64748b" })
    )
  );
};

export default FooterBar;
