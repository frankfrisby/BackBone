import React, { useState, useEffect, memo, useMemo, useRef } from "react";
import { Box, Text } from "ink";
import { getActivityTracker } from "../services/activity-tracker.js";
import { getRenderController } from "../services/render-controller.js";

const e = React.createElement;

// Status dot colors
const DOT_COLORS = {
  error: "#ef4444",      // Red
  completed: "#22c55e",  // Green
  working: "#3b82f6",    // Blue
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

// Activity log entry - completely static, no animations
const ActivityEntry = memo(({ id, text, detail, status }) => {
  const dotColor = DOT_COLORS[status] || DOT_COLORS.observation;
  const textColor = status === "working" ? "#94a3b8" :
                    status === "completed" ? "#4ade80" :
                    status === "error" ? "#f87171" : "#e2e8f0";

  return e(
    Box,
    { flexDirection: "row", gap: 1, paddingLeft: 1 },
    e(Text, { color: dotColor }, "●"),
    e(Text, { color: textColor }, detail || text)
  );
});

// Static activity list
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
 * Engine Status Panel - Uses centralized render controller to prevent flickering
 * All animations sync to a single global tick to avoid multiple render cycles
 */
const EngineStatusPanelBase = ({
  toolEvents = [],
  streamingText = "",
  nextCycleTime = null,
  maxEntries = 6
}) => {
  const tracker = useMemo(() => getActivityTracker(), []);
  const renderController = useMemo(() => getRenderController(), []);

  // Single state for all data - only updates on render controller tick
  const [viewState, setViewState] = useState(() => ({
    data: tracker.getDisplayData(),
    animations: renderController.getAnimationStates()
  }));

  // Subscribe to centralized render tick - single source of updates
  useEffect(() => {
    // Start the render controller if not running
    renderController.start();

    // Track if data actually changed
    let lastDataJson = JSON.stringify(tracker.getDisplayData());

    const handleTick = (tickData) => {
      const currentData = tracker.getDisplayData();
      const currentJson = JSON.stringify(currentData);

      // Only update state if data actually changed OR animation state changed
      const dataChanged = currentJson !== lastDataJson;

      if (dataChanged) {
        lastDataJson = currentJson;
        setViewState({
          data: currentData,
          animations: tickData.animations
        });
      } else {
        // Only update animations (cheap update)
        setViewState(prev => ({
          ...prev,
          animations: tickData.animations
        }));
      }
    };

    renderController.on("tick", handleTick);
    return () => {
      renderController.off("tick", handleTick);
    };
  }, [tracker, renderController]);

  const { data, animations } = viewState;
  const isIdle = data.currentState === "idle" || data.currentState === "ready" || !data.isRunning;
  const isActive = !isIdle && data.isRunning;

  // Build display items
  const displayItems = useMemo(() => {
    const items = [];

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

  // Animation values from centralized controller
  const pulseOn = animations.pulseOn;
  const dotPhase = animations.dotPhase;
  const dots = ".".repeat((dotPhase % 3) + 1);

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
        data.isRunning && e(Text, { color: pulseOn ? "#22c55e" : "#064e3b" }, "●"),
        data.isRunning && e(Text, { color: pulseOn ? "#22c55e" : "#166534", bold: true }, "ALIVE")
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
        ? e(
            Box,
            { flexDirection: "row", gap: 1 },
            e(Text, { color: "#3b82f6" }, "↓"),
            e(Text, { color: "#94a3b8" }, data.stateDetail || data.currentState),
            e(Text, { color: "#3b82f6" }, dots)
          )
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

// Compact status dot
export const AgentStatusDot = memo(({ status = "idle", running = false }) => {
  const color = status === "error" ? DOT_COLORS.error :
                status === "idle" || !running ? DOT_COLORS.idle :
                DOT_COLORS.working;

  return e(Text, { color }, "●");
});

export default AgentActivityPanel;
