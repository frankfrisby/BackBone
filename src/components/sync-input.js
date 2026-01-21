import React, { useEffect, useRef, useState, useCallback } from "react";
import { Box, Text, useInput, useStdin } from "ink";

const e = React.createElement;

/**
 * Synchronous Input Component
 * Uses a ref-based buffer for the actual value to prevent race conditions.
 * React state is only used for display updates, throttled to prevent flicker.
 */
export const SyncInput = ({
  onSubmit,
  onTypingChange,
  placeholder = "Type here...",
  showCursor = true
}) => {
  // The actual buffer - synchronous, never out of order
  const bufferRef = useRef("");

  // Display state - updated from buffer
  const [display, setDisplay] = useState("");

  // Refs for callbacks
  const onSubmitRef = useRef(onSubmit);
  const onTypingChangeRef = useRef(onTypingChange);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef(null);
  const updateScheduledRef = useRef(false);

  // Keep callback refs updated
  onSubmitRef.current = onSubmit;
  onTypingChangeRef.current = onTypingChange;

  // Sync display with buffer (throttled)
  const syncDisplay = useCallback(() => {
    if (updateScheduledRef.current) return;

    updateScheduledRef.current = true;
    // Use setImmediate/setTimeout to batch rapid updates
    setTimeout(() => {
      setDisplay(bufferRef.current);
      updateScheduledRef.current = false;
    }, 0);
  }, []);

  // Handle raw stdin for guaranteed order
  const { stdin, setRawMode } = useStdin();

  useEffect(() => {
    if (!stdin) return;

    setRawMode(true);

    const handleData = (data) => {
      const str = data.toString();

      // Handle each character/key
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const code = char.charCodeAt(0);

        // Enter - submit
        if (char === '\r' || char === '\n') {
          const value = bufferRef.current;
          bufferRef.current = "";
          syncDisplay();

          // Clear typing state
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          isTypingRef.current = false;
          if (onTypingChangeRef.current) {
            onTypingChangeRef.current(false);
          }

          if (value.trim() && onSubmitRef.current) {
            onSubmitRef.current(value);
          }
          continue;
        }

        // Backspace
        if (code === 127 || code === 8) {
          if (bufferRef.current.length > 0) {
            bufferRef.current = bufferRef.current.slice(0, -1);
            syncDisplay();
          }
          continue;
        }

        // Escape - clear
        if (code === 27) {
          // Check for escape sequences (arrow keys, etc)
          if (i + 2 < str.length && str[i + 1] === '[') {
            // Skip arrow key sequences
            i += 2;
            continue;
          }
          bufferRef.current = "";
          syncDisplay();
          continue;
        }

        // Ctrl+C - exit
        if (code === 3) {
          process.exit();
          continue;
        }

        // Ctrl+U - clear line
        if (code === 21) {
          bufferRef.current = "";
          syncDisplay();
          continue;
        }

        // Ignore other control characters
        if (code < 32 && code !== 9) { // Allow tab
          continue;
        }

        // Regular character - add to buffer synchronously
        bufferRef.current += char;
        syncDisplay();

        // Signal typing (only once)
        if (!isTypingRef.current && onTypingChangeRef.current) {
          isTypingRef.current = true;
          onTypingChangeRef.current(true);
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
        }, 400);
      }
    };

    stdin.on("data", handleData);

    return () => {
      stdin.off("data", handleData);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [stdin, setRawMode, syncDisplay]);

  const isEmpty = display.length === 0;

  return e(
    Box,
    { flexDirection: "row" },
    e(Text, { color: "#22c55e", bold: true }, "› "),
    isEmpty
      ? e(Text, { color: "#475569", dimColor: true }, placeholder)
      : e(Text, { color: "#e2e8f0" }, display),
    showCursor && e(Text, { color: "#3b82f6" }, "▌")
  );
};

export default SyncInput;
