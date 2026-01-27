import React, { useRef, useState, useEffect, useMemo, useCallback, memo } from "react";
import { Box, Text, useInput } from "ink";
import { CommandPalette } from "./command-palette.js";

const e = React.createElement;

const CONNECT_OPTIONS = ["linkedin", "email", "calendar", "alpaca", "oura"];

/**
 * Build command matches for autocomplete
 */
const buildMatches = (input, commands) => {
  const trimmed = input.trim();

  if (!trimmed.startsWith("/")) return [];
  if (trimmed === "/") return commands;

  if (trimmed.startsWith("/connect")) {
    const parts = trimmed.split(" ");
    const partial = parts[1] || "";
    return CONNECT_OPTIONS
      .filter(opt => opt.startsWith(partial))
      .map(opt => `/connect ${opt}`);
  }

  return commands.filter(cmd => cmd.startsWith(trimmed));
};

/**
 * Chat Panel with stable input handling
 *
 * Key architecture:
 * - inputRef: The ACTUAL input value (synchronous, never races)
 * - displayValue: React state for rendering (synced from ref)
 * - Uses Ink's useInput (proper integration, no conflicts)
 */
const ChatPanelBase = ({ commands, onSubmit, onTypingChange, modelInfo, compact = false }) => {
  // The actual input buffer - synchronous, source of truth
  const inputRef = useRef("");

  // Display state - synced from ref
  const [displayValue, setDisplayValue] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // Static cursor (no blink) to avoid global re-renders/flicker

  // Callback refs to avoid stale closures
  const onSubmitRef = useRef(onSubmit);
  const onTypingChangeRef = useRef(onTypingChange);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef(null);

  // Keep callback refs current
  useEffect(() => {
    onSubmitRef.current = onSubmit;
    onTypingChangeRef.current = onTypingChange;
  }, [onSubmit, onTypingChange]);

  // Compute matches based on current display
  const matches = useMemo(() =>
    buildMatches(displayValue, commands),
    [displayValue, commands]
  );

  const showPalette = displayValue.startsWith("/") && matches.length > 0;

  const updateScheduledRef = useRef(false);
  const syncDisplay = useCallback(() => {
    if (updateScheduledRef.current) return;
    updateScheduledRef.current = true;
    setTimeout(() => {
      updateScheduledRef.current = false;
      setDisplayValue(inputRef.current);
    }, 30);
  }, []);

  // Signal typing started
  const signalTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTypingChangeRef.current?.(true);
    }

    // Reset typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTypingChangeRef.current?.(false);
    }, 500);
  }, []);

  // Handle keyboard input using Ink's system
  useInput((input, key) => {
    // Enter - submit
    if (key.return) {
      const value = inputRef.current.trim();

      // Clear typing state
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      isTypingRef.current = false;
      onTypingChangeRef.current?.(false);

      if (value) {
        // If showing palette and have selection, use that
        let finalValue = value;
        if (showPalette && matches[activeIndex]) {
          finalValue = matches[activeIndex];
        }
        // Normalize backslash to forward slash
        if (finalValue.startsWith("\\")) {
          finalValue = "/" + finalValue.slice(1);
        }
        onSubmitRef.current?.(finalValue);
      }

      // Clear input
      inputRef.current = "";
      setDisplayValue("");
      setActiveIndex(0);
      return;
    }

    // Backspace
    if (key.backspace || key.delete) {
      if (inputRef.current.length > 0) {
        inputRef.current = inputRef.current.slice(0, -1);
        syncDisplay();
        signalTyping();
      }
      return;
    }

    // Arrow keys for command palette navigation
    if (key.upArrow && showPalette) {
      setActiveIndex(prev => (prev - 1 + matches.length) % matches.length);
      return;
    }
    if (key.downArrow && showPalette) {
      setActiveIndex(prev => (prev + 1) % matches.length);
      return;
    }

    // Tab - autocomplete
    if (key.tab && showPalette && matches[activeIndex]) {
      inputRef.current = matches[activeIndex];
      syncDisplay();
      return;
    }

    // Escape - clear
    if (key.escape) {
      inputRef.current = "";
      setDisplayValue("");
      setActiveIndex(0);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      isTypingRef.current = false;
      onTypingChangeRef.current?.(false);
      return;
    }

    // Regular character input
    if (input && !key.ctrl && !key.meta) {
      inputRef.current += input;
      syncDisplay();
      signalTyping();
      setActiveIndex(0);
    }
  });

  // Cleanup
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Derived values for display
  const isCommand = displayValue.startsWith("/");
  const borderColor = isCommand ? "#f59e0b" : "#0f172a";
  const promptColor = isCommand ? "#f59e0b" : "#22c55e";
  const isEmpty = displayValue.length === 0;
  const cursorColor = isCommand ? "#f59e0b" : "#3b82f6";
  const modelLabel = modelInfo?.displayName
    || modelInfo?.shortNameWithSource
    || modelInfo?.shortName
    || modelInfo?.name
    || "GPT-5.2";

  // Compact mode: minimal input with command palette ABOVE (since input is at bottom)
  if (compact) {
    return e(
      Box,
      {
        flexDirection: "column"
      },
      // Command palette - renders ABOVE input in compact mode
      showPalette && e(CommandPalette, {
        items: matches,
        activeIndex,
        title: "Commands",
        isFocused: true,
        countLabel: "matches",
        compact: true
      }),
      // Input line — auto-expands with content, compact by default
      e(
        Box,
        {
          flexDirection: "row",
          borderStyle: "round",
          borderColor,
          paddingX: 1,
          minHeight: 1
        },
        e(Text, { color: promptColor, bold: true }, isCommand ? "⟩ " : "› "),
        isEmpty
          ? e(Text, { color: "#64748b" }, 'Ask anything or type / for commands')
          : e(Text, { color: "#f8fafc", wrap: "wrap" }, displayValue),
        e(Text, { color: "#ffffff" }, "▌")
      )
    );
  }

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor,
      padding: 1,
      minHeight: 6
    },
    // Header with mode indicator
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: isCommand ? "#f59e0b" : "#64748b", bold: isCommand }, isCommand ? "⌘ Command" : "◉ Input"),
        isCommand && e(Text, { color: "#475569" }, "mode")
      ),
      e(
        Box,
        { flexDirection: "row", gap: 2 },
        e(Text, { color: "#475569" }, "Tab"),
        e(Text, { color: "#334155" }, "complete"),
        e(Text, { color: "#334155" }, "│"),
        e(Text, { color: "#475569" }, "Enter"),
        e(Text, { color: "#334155" }, "send"),
        e(Text, { color: "#334155" }, "│"),
        e(Text, { color: "#475569" }, "Esc"),
        e(Text, { color: "#334155" }, "clear")
      )
    ),
    // Input line with blinking cursor
    e(
      Box,
      { flexDirection: "row", paddingY: 0 },
      e(Text, { color: promptColor, bold: true }, isCommand ? "⟩ " : "› "),
      isEmpty
        ? e(Text, { color: "#64748b" }, 'Ask anything... "Fix broken tests" or type / for commands')
        : e(Text, { color: "#f8fafc" }, displayValue),
      e(Text, { color: "#ffffff" }, "▌")
    ),
    // Character count for long inputs
    displayValue.length > 50 && e(
      Box,
      { flexDirection: "row", justifyContent: "flex-end", marginTop: 0 },
      e(Text, { color: "#475569" }, `${displayValue.length} chars`)
    ),
    // Command palette
    showPalette && e(CommandPalette, {
      items: matches,
      activeIndex,
      title: "Commands",
      isFocused: true,
      countLabel: "matches"
    }),
    // Model indicator - shows below input
    !showPalette && modelInfo && e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginTop: 1, paddingX: 0 },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#475569" }, "Model:"),
        e(Text, { color: modelInfo.color || "#10a37f", bold: true }, `${modelInfo.icon || "◇"} ${modelLabel}`),
        modelInfo.taskType && e(Text, { color: "#334155" }, "│"),
        modelInfo.taskType && e(Text, { color: "#64748b" }, modelInfo.taskType)
      ),
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#334155" }, "instant"),
        e(Text, { color: "#475569" }, "fast"),
        e(Text, { color: "#334155" }, "│"),
        e(Text, { color: "#8b5cf6" }, "thinking"),
        e(Text, { color: "#475569" }, "complex")
      )
    )
  );
};

// Prevent re-renders from parent - we use refs for callbacks
export const ChatPanel = memo(ChatPanelBase, () => true);
