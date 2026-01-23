import React, { useState, useEffect, memo, useMemo, useRef, useCallback } from "react";
import { Box, Text } from "ink";
import { getActivityTracker } from "../services/activity-tracker.js";

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
const ActivityEntry = memo(({ id, text, detail, status }) => {
  const dotColor = DOT_COLORS[status] || DOT_COLORS.observation;
  const textColor = status === "working" ? "#94a3b8" :
                    status === "completed" ? "#4ade80" :
                    status === "error" ? "#f87171" : "#e2e8f0";

  const displayText = detail || text;

  return e(
    Box,
    { flexDirection: "row", gap: 1, paddingLeft: 1 },
    e(Text, { color: dotColor }, "●"),
    e(Text, { color: textColor }, displayText)
  );
});

// ALIVE pulse indicator - isolated animation
const AlivePulse = memo(({ running }) => {
  const [pulseOn, setPulseOn] = useState(true);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setPulseOn(prev => !prev), 1000);
    return () => clearInterval(interval);
  }, [running]);

  if (!running) return null;

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    e(Text, { color: pulseOn ? "#22c55e" : "#064e3b" }, "●"),
    e(Text, { color: pulseOn ? "#22c55e" : "#166534", bold: true }, "ALIVE")
  );
});

// Active state indicator with simple dots animation
const ActiveIndicator = memo(({ text }) => {
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

// Static activity list - only updates when items actually change
const ActivityList = memo(({ items }) => {
  if (!items || items.length === 0) return null;

  return e(
    Box,
    { flexDirection: "column", gap: 0 },
    ...items.map(entry =>
      e(ActivityEntry, {
        key: entry.id,
        id: entry.id,
        text: entry.text,
        detail: entry.detail,
        status: entry.status
      })
    )
  );
}, (prev, next) => {
  // Only re-render if items actually changed
  if (prev.items?.length !== next.items?.length) return false;
  for (let i = 0; i < (prev.items?.length || 0); i++) {
    if (prev.items[i].id !== next.items[i].id ||
        prev.items[i].status !== next.items[i].status) {
      return false;
    }
  }
  return true;
});

/**
 * Engine Status Panel - Self-contained component that subscribes to activity tracker
 * This isolates updates from the main app to prevent full app re-renders
 */
const EngineStatusPanelBase = ({
  toolEvents = [],
  streamingText = "",
  nextCycleTime = null,
  maxEntries = 6
}) => {
  // Subscribe directly to activity tracker - isolates updates from main app
  const tracker = useMemo(() => getActivityTracker(), []);

  // Use refs for data that updates frequently, state for rendering
  const dataRef = useRef(tracker.getDisplayData());
  const [renderKey, setRenderKey] = useState(0);
  const lastUpdateRef = useRef(Date.now());

  // Throttled update - only re-render at most every 500ms
  useEffect(() => {
    const handleUpdate = (data) => {
      dataRef.current = data;

      const now = Date.now();
      if (now - lastUpdateRef.current > 500) {
        lastUpdateRef.current = now;
        setRenderKey(prev => prev + 1);
      }
    };

    tracker.on("updated", handleUpdate);
    return () => tracker.off("updated", handleUpdate);
  }, [tracker]);

  // Also check for updates on a slower interval as backup
  useEffect(() => {
    const interval = setInterval(() => {
      const newData = tracker.getDisplayData();
      if (JSON.stringify(newData) !== JSON.stringify(dataRef.current)) {
        dataRef.current = newData;
        setRenderKey(prev => prev + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [tracker]);

  const data = dataRef.current;
  const isIdle = data.currentState === "idle" || data.currentState === "ready" || !data.isRunning;
  const isActive = !isIdle && data.isRunning;

  // Build display items from tool events + activities
  const displayItems = useMemo(() => {
    const items = [];

    // Add tool events first
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

    // Add activities with deduplication
    const existingTexts = new Set(items.map(d => d.text));
    (data.activities || []).slice(0, maxEntries - items.length).forEach((act, i) => {
      if (!existingTexts.has(act.text)) {
        items.push({
          id: act.id || `act_${i}`,
          text: act.text,
          detail: act.detail || act.target,
          status: act.status
        });
        existingTexts.add(act.text);
      }
    });

    return items.slice(0, maxEntries);
  }, [toolEvents, data.activities, maxEntries]);

  const hasStreaming = streamingText && streamingText.length > 0;

  return e(
    Box,
    { flexDirection: "column", paddingX: 1, marginBottom: 1 },

    // Header row
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "row", gap: 1, alignItems: "center" },
        e(Text, { color: "#64748b" }, "Engine Status"),
        e(AlivePulse, { running: data.isRunning })
      ),
      e(Text, { color: "#475569", dimColor: true }, `cycle ${data.cycleCount}`)
    ),

    // Activity list
    e(ActivityList, { items: displayItems }),

    // Streaming output
    hasStreaming && e(
      Box,
      { flexDirection: "row", gap: 1, paddingLeft: 1, marginTop: 1 },
      e(Text, { color: "#3b82f6" }, "..."),
      e(Text, { color: "#94a3b8", wrap: "truncate-end" }, streamingText.slice(-80))
    ),

    // Current state
    e(
      Box,
      { flexDirection: "row", gap: 1, marginTop: 1, paddingLeft: 1 },
      isActive
        ? e(ActiveIndicator, { text: data.stateDetail || data.currentState })
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

export const AgentActivityPanel = memo(EngineStatusPanelBase);

// Compact status dot for other panels
export const AgentStatusDot = memo(({ status = "idle", running = false }) => {
  const color = status === "error" ? DOT_COLORS.error :
                status === "idle" || !running ? DOT_COLORS.idle :
                DOT_COLORS.working;

  return e(Text, { color }, "●");
});

export default AgentActivityPanel;
