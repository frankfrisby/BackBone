import React, { memo, useMemo } from "react";
import { Box, Text } from "ink";
import { useClaudeCode } from "../hooks/useClaudeCode.js";

const e = React.createElement;

const THEME = {
  bg: "#0f172a",
  primary: "#f1f5f9",
  secondary: "#94a3b8",
  muted: "#64748b",
  dim: "#475569",
  success: "#22c55e",
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
  purple: "#a855f7",
  cyan: "#06b6d4",
  white: "#ffffff",
};

/**
 * Status indicator for Claude Code
 */
const StatusIndicator = memo(({ status, isRunning }) => {
  if (isRunning) {
    return e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: THEME.warning }, "●"),
      e(Text, { color: THEME.warning, bold: true }, "Claude Code Running")
    );
  }

  const statusConfig = {
    idle: { color: THEME.muted, text: "Idle" },
    completed: { color: THEME.success, text: "Completed" },
    failed: { color: THEME.error, text: "Failed" },
    cancelled: { color: THEME.muted, text: "Cancelled" }
  };

  const config = statusConfig[status] || statusConfig.idle;

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    e(Text, { color: config.color }, "○"),
    e(Text, { color: config.color }, config.text)
  );
});

/**
 * Tool call display
 */
const ToolCallLine = memo(({ tool, input, status }) => {
  const isRunning = status === "running";
  const dotColor = isRunning ? THEME.muted : THEME.success;
  const inputPreview = typeof input === "string"
    ? input.slice(0, 60)
    : JSON.stringify(input).slice(0, 60);

  return e(
    Box,
    { flexDirection: "row" },
    e(Text, { color: dotColor }, isRunning ? "●" : "●"),
    e(Text, { color: THEME.muted }, " "),
    e(Text, { color: THEME.cyan, bold: true }, tool),
    e(Text, { color: THEME.muted }, "("),
    e(Text, { color: THEME.white }, inputPreview),
    inputPreview.length < (typeof input === "string" ? input.length : JSON.stringify(input).length)
      ? e(Text, { color: THEME.dim }, "...")
      : null,
    e(Text, { color: THEME.muted }, ")")
  );
});

/**
 * Output line display
 */
const OutputLine = memo(({ entry }) => {
  switch (entry.type) {
    case "text":
      return e(
        Box,
        { paddingLeft: 2 },
        e(Text, { color: THEME.primary, wrap: "wrap" }, entry.content.slice(0, 200))
      );

    case "tool_start":
      return e(ToolCallLine, {
        tool: entry.tool,
        input: entry.input,
        status: "running"
      });

    case "tool_result":
      return e(
        Box,
        { paddingLeft: 2, flexDirection: "row" },
        e(Text, { color: THEME.dim }, "→ "),
        e(Text, { color: THEME.secondary, wrap: "wrap" }, entry.content)
      );

    default:
      return null;
  }
});

/**
 * Claude Code Panel - Shows real-time streaming output
 *
 * Usage in your app:
 * ```js
 * import { ClaudeCodePanel, useClaudeCode } from "./components/claude-code-panel.js";
 *
 * const MyComponent = () => {
 *   const claude = useClaudeCode();
 *
 *   useEffect(() => {
 *     // Start a task
 *     claude.start("Research AI jobs in DC", process.cwd());
 *   }, []);
 *
 *   return <ClaudeCodePanel maxLines={10} />;
 * };
 * ```
 */
export const ClaudeCodePanel = memo(({ maxLines = 15, showHeader = true }) => {
  const {
    isRunning,
    status,
    output,
    currentTool,
    sessionId,
    error
  } = useClaudeCode();

  // Get recent output entries
  const recentOutput = useMemo(() => {
    return output.slice(-maxLines);
  }, [output, maxLines]);

  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },

    // Header
    showHeader && e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: THEME.muted, bold: true }, "CLAUDE CODE"),
      e(StatusIndicator, { status, isRunning })
    ),

    showHeader && e(Box, {}, e(Text, { color: THEME.dim }, "─".repeat(50))),

    // Current tool being executed
    currentTool && e(
      Box,
      { marginY: 1 },
      e(ToolCallLine, {
        tool: currentTool.tool,
        input: currentTool.input,
        status: "running"
      })
    ),

    // Output stream
    recentOutput.length > 0 && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      ...recentOutput.map((entry, i) =>
        e(OutputLine, { key: `out-${i}`, entry })
      )
    ),

    // Empty state
    !isRunning && recentOutput.length === 0 && !error && e(
      Box,
      { paddingY: 1 },
      e(Text, { color: THEME.dim, italic: true }, "No active Claude Code session")
    ),

    // Error display
    error && e(
      Box,
      { marginTop: 1 },
      e(Text, { color: THEME.error }, `Error: ${error}`)
    ),

    // Session ID (for debugging/resumption)
    sessionId && e(
      Box,
      { marginTop: 1 },
      e(Text, { color: THEME.dim }, `Session: ${sessionId.slice(0, 20)}...`)
    )
  );
});

/**
 * Compact status line for headers/status bars
 */
export const ClaudeCodeStatusLine = memo(() => {
  const { isRunning, currentTool, status } = useClaudeCode();

  if (!isRunning && status === "idle") {
    return null;
  }

  if (isRunning && currentTool) {
    return e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: THEME.warning }, "●"),
      e(Text, { color: THEME.muted }, "Claude:"),
      e(Text, { color: THEME.cyan }, currentTool.tool)
    );
  }

  if (isRunning) {
    return e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: THEME.warning }, "●"),
      e(Text, { color: THEME.warning }, "Claude Code running...")
    );
  }

  if (status === "completed") {
    return e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: THEME.success }, "●"),
      e(Text, { color: THEME.success }, "Claude Code done")
    );
  }

  return null;
});

/**
 * Export the hook as well for convenience
 */
export { useClaudeCode } from "../hooks/useClaudeCode.js";

export default ClaudeCodePanel;
