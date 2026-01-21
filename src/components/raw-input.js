import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useStdin, useApp } from "ink";
import readline from "readline";

const e = React.createElement;

/**
 * Raw input component that uses readline for stable input handling
 * This bypasses React's state management for the input buffer
 */
export const RawInput = ({ onSubmit, onTypingChange, placeholder = "" }) => {
  const { stdin, setRawMode } = useStdin();
  const [displayValue, setDisplayValue] = useState("");
  const bufferRef = useRef("");
  const onSubmitRef = useRef(onSubmit);
  const onTypingChangeRef = useRef(onTypingChange);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef(null);

  // Keep refs updated
  onSubmitRef.current = onSubmit;
  onTypingChangeRef.current = onTypingChange;

  useEffect(() => {
    if (!stdin) return;

    setRawMode(true);

    const handleData = (data) => {
      const key = data.toString();

      // Handle Enter
      if (key === "\r" || key === "\n") {
        const value = bufferRef.current;
        bufferRef.current = "";
        setDisplayValue("");

        // Clear typing state
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        isTypingRef.current = false;
        if (onTypingChangeRef.current) {
          onTypingChangeRef.current(false);
        }

        if (onSubmitRef.current && value.trim()) {
          onSubmitRef.current(value);
        }
        return;
      }

      // Handle Backspace
      if (key === "\x7f" || key === "\b") {
        if (bufferRef.current.length > 0) {
          bufferRef.current = bufferRef.current.slice(0, -1);
          setDisplayValue(bufferRef.current);
        }
        return;
      }

      // Handle Escape - clear input
      if (key === "\x1b") {
        bufferRef.current = "";
        setDisplayValue("");
        return;
      }

      // Handle Ctrl+C
      if (key === "\x03") {
        process.exit();
        return;
      }

      // Ignore other control characters
      if (key.charCodeAt(0) < 32) {
        return;
      }

      // Add character to buffer
      bufferRef.current += key;
      setDisplayValue(bufferRef.current);

      // Signal typing started
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        if (onTypingChangeRef.current) {
          onTypingChangeRef.current(true);
        }
      }

      // Reset typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false;
        if (onTypingChangeRef.current) {
          onTypingChangeRef.current(false);
        }
      }, 500);
    };

    stdin.on("data", handleData);

    return () => {
      stdin.off("data", handleData);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [stdin, setRawMode]);

  const showPlaceholder = displayValue.length === 0;

  return e(
    Box,
    { flexDirection: "row" },
    e(Text, { color: "#22c55e", bold: true }, "› "),
    showPlaceholder
      ? e(Text, { color: "#475569", dimColor: true }, placeholder)
      : e(Text, { color: "#e2e8f0" }, displayValue),
    e(Text, { color: "#3b82f6" }, "▋")
  );
};

export default RawInput;
