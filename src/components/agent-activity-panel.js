import React, { useState, useEffect, memo, useMemo, useRef } from "react";
import { Box, Text } from "ink";

const e = React.createElement;

// Status dot colors
const DOT_COLORS = {
  error: "#ef4444",      // Red
  completed: "#22c55e",  // Green
  working: "#3b82f6",    // Blue (active, no blink to reduce flicker)
  observation: "#f8fafc", // White
  idle: "#475569"        // Dim gray
};

// Format time until next cycle
const formatTimeUntil = (nextTime) => {
  if (!nextTime) return "soon";
  const now = Date.now();
  const diff = nextTime - now;
  if (diff <= 0) return "now";
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

// Activity log entry with status dot - NO animation to prevent flicker
const ActivityEntry = memo(({ entry }) => {
  // Static colors - no blinking to prevent flickering
  const dotColor = DOT_COLORS[entry.status] || DOT_COLORS.observation;
  const textColor = entry.status === "working" ? "#94a3b8" :
                    entry.status === "completed" ? "#4ade80" :
                    entry.status === "error" ? "#f87171" : "#e2e8f0";

  // Format: ● Reading config/settings.js:42
  const displayText = entry.detail || entry.text;

  return e(
    Box,
    { flexDirection: "row", gap: 1, paddingLeft: 1 },
    e(Text, { color: dotColor }, "●"),
    e(Text, { color: textColor }, displayText)
  );
}, (prev, next) => {
  // Custom comparison to prevent unnecessary re-renders
  return prev.entry.id === next.entry.id &&
         prev.entry.status === next.entry.status &&
         prev.entry.detail === next.entry.detail &&
         prev.entry.text === next.entry.text;
});

// Simple active indicator - minimal animation
const ActiveIndicator = memo(({ text }) => {
  // Single simple animation for active state only
  const [dots, setDots] = useState("...");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? "." : prev + ".");
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    e(Text, { color: "#3b82f6" }, "↓"),
    e(Text, { color: "#94a3b8" }, text),
    e(Text, { color: "#3b82f6" }, dots)
  );
});

/**
 * Engine Status Panel - Clean, borderless display of agent activity
 * Optimized to minimize re-renders and flickering
 */
const EngineStatusPanelBase = ({
  activities = [],
  currentState = "idle",
  stateDetail = null,
  engineRunning = false,
  cycleCount = 0,
  nextCycleTime = null,
  toolEvents = [],
  streamingText = "",
  maxEntries = 6
}) => {
  // Single pulse animation for ALIVE indicator only
  const [pulseOn, setPulseOn] = useState(true);
  const pulseRef = useRef(null);

  useEffect(() => {
    if (!engineRunning) {
      if (pulseRef.current) clearInterval(pulseRef.current);
      return;
    }
    pulseRef.current = setInterval(() => setPulseOn(prev => !prev), 1000);
    return () => {
      if (pulseRef.current) clearInterval(pulseRef.current);
    };
  }, [engineRunning]);

  const isIdle = currentState === "idle" || currentState === "ready" || !engineRunning;
  const isActive = !isIdle && engineRunning;

  // Memoize display items to prevent unnecessary rebuilds
  const displayItems = useMemo(() => {
    const items = [];

    // Add tool events first (most recent activity)
    if (toolEvents && toolEvents.length > 0) {
      toolEvents.slice(0, 4).forEach((evt, i) => {
        items.push({
          id: evt.id || `tool_${evt.timestamp || i}`,
          text: evt.text || evt.action,
          detail: evt.detail || evt.target,
          status: evt.status === "done" ? "completed" :
                  evt.status === "error" ? "error" : "working"
        });
      });
    }

    // Add activities (with deduplication)
    const existingTexts = new Set(items.map(d => d.text));
    activities.slice(0, maxEntries - items.length).forEach(act => {
      if (!existingTexts.has(act.text)) {
        items.push({
          id: act.id || `act_${act.timestamp || activities.indexOf(act)}`,
          text: act.text,
          detail: act.detail || act.target,
          status: act.status
        });
        existingTexts.add(act.text);
      }
    });

    return items.slice(0, maxEntries);
  }, [toolEvents, activities, maxEntries]);

  // Memoize streaming output check
  const hasStreamingOutput = streamingText && streamingText.length > 0;
  const truncatedStreaming = hasStreamingOutput ? streamingText.slice(-80) : "";

  return e(
    Box,
    { flexDirection: "column", paddingX: 1, marginBottom: 1 },

    // Header: Engine Status + ALIVE indicator
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "row", gap: 1, alignItems: "center" },
        e(Text, { color: "#64748b" }, "Engine Status"),
        engineRunning && e(Text, { color: pulseOn ? "#22c55e" : "#064e3b" }, "●"),
        engineRunning && e(Text, { color: pulseOn ? "#22c55e" : "#166534", bold: true }, "ALIVE")
      ),
      e(Text, { color: "#475569", dimColor: true }, `cycle ${cycleCount}`)
    ),

    // Activity entries - static rendering, no animations per entry
    displayItems.length > 0 && e(
      Box,
      { flexDirection: "column", gap: 0 },
      ...displayItems.map(entry =>
        e(ActivityEntry, { key: entry.id, entry })
      )
    ),

    // Streaming output (if any)
    hasStreamingOutput && e(
      Box,
      { flexDirection: "row", gap: 1, paddingLeft: 1, marginTop: 1 },
      e(Text, { color: "#3b82f6" }, "..."),
      e(Text, { color: "#94a3b8", wrap: "truncate-end" }, truncatedStreaming)
    ),

    // Current state (bottom) - only animate when active
    e(
      Box,
      { flexDirection: "row", gap: 1, marginTop: 1, paddingLeft: 1 },
      isActive
        ? e(ActiveIndicator, { text: stateDetail || currentState })
        : e(
            Box,
            { flexDirection: "row", gap: 1 },
            e(Text, { color: "#475569" }, "○"),
            e(Text, { color: "#64748b" }, "Idle"),
            nextCycleTime && e(Text, { color: "#475569", dimColor: true }, `· next cycle in ${formatTimeUntil(nextCycleTime)}`)
          )
    )
  );
};

// Memoize with deep comparison on key props
export const AgentActivityPanel = memo(EngineStatusPanelBase, (prev, next) => {
  // Only re-render when meaningful data changes
  if (prev.engineRunning !== next.engineRunning) return false;
  if (prev.cycleCount !== next.cycleCount) return false;
  if (prev.currentState !== next.currentState) return false;
  if (prev.stateDetail !== next.stateDetail) return false;
  if (prev.streamingText !== next.streamingText) return false;

  // Compare arrays by length and first item (quick check)
  if (prev.toolEvents?.length !== next.toolEvents?.length) return false;
  if (prev.activities?.length !== next.activities?.length) return false;

  // If first items changed, re-render
  const prevFirst = prev.toolEvents?.[0] || prev.activities?.[0];
  const nextFirst = next.toolEvents?.[0] || next.activities?.[0];
  if (prevFirst?.id !== nextFirst?.id || prevFirst?.status !== nextFirst?.status) return false;

  return true;
});

// Compact status dot for other panels - no animation
export const AgentStatusDot = memo(({ status = "idle", running = false }) => {
  const color = status === "error" ? DOT_COLORS.error :
                status === "idle" || !running ? DOT_COLORS.idle :
                DOT_COLORS.working;

  return e(Text, { color }, "●");
});

export default AgentActivityPanel;
