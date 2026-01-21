import React, { useRef, useCallback } from "react";
import { Box, Text, useInput } from "ink";

const e = React.createElement;

/**
 * Stable text input component that minimizes re-renders
 * No cursor blinking (causes re-renders) - just a static cursor
 */
const StableInputBase = ({
  value = "",
  onChange,
  onSubmit,
  placeholder = "",
  showCursor = true
}) => {
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);

  // Keep refs updated
  onChangeRef.current = onChange;
  onSubmitRef.current = onSubmit;

  // Handle keyboard input
  useInput(useCallback((input, key) => {
    // Handle special keys
    if (key.return) {
      if (onSubmitRef.current) {
        onSubmitRef.current(value);
      }
      return;
    }

    if (key.backspace || key.delete) {
      if (value.length > 0) {
        onChangeRef.current(value.slice(0, -1));
      }
      return;
    }

    // Ignore control keys
    if (key.ctrl || key.meta || key.escape) {
      return;
    }

    // Ignore arrow keys and other special keys for text input
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.tab) {
      return;
    }

    // Add regular character input
    if (input && input.length === 1) {
      onChangeRef.current(value + input);
    }
  }, [value]), { isActive: true });

  const displayValue = value || "";
  const showPlaceholder = displayValue.length === 0 && placeholder;

  return e(
    Box,
    { flexDirection: "row" },
    showPlaceholder
      ? e(Text, { color: "#475569", dimColor: true }, placeholder)
      : e(
          React.Fragment,
          null,
          e(Text, { color: "#e2e8f0" }, displayValue),
          showCursor && e(Text, { color: "#3b82f6" }, "▋")
        )
  );
};

export const StableInput = React.memo(StableInputBase);

export default StableInput;
