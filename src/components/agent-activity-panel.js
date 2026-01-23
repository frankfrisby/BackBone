import React, { memo, useMemo, useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { getActivityTracker } from "../services/activity-tracker.js";

const e = React.createElement;

// ═══════════════════════════════════════════════════════════════════════════
// THROTTLED ACTIVITY PANEL - Updates at controlled rate to prevent flickering
// ═══════════════════════════════════════════════════════════════════════════

const THEME = {
  success: "#10b981",
  error: "#ef4444",
  working: "#6366f1",
  info: "#3b82f6",
  primary: "#f1f5f9",
  secondary: "#94a3b8",
  muted: "#64748b",
  dim: "#475569",
};

const STATUS = {
  working: { dot: "●", color: THEME.working },
  completed: { dot: "✓", color: THEME.success },
  error: { dot: "✗", color: THEME.error },
  pending: { dot: "○", color: THEME.muted },
  observation: { dot: "◈", color: THEME.info },
};

const formatTimeUntil = (nextTime) => {
  if (!nextTime) return "soon";
  const diff = nextTime - Date.now();
  if (diff <= 0) return "now";
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

// Static entry - no state, no effects
const ActivityEntry = memo(({ text, detail, status, isLatest }) => {
  const s = STATUS[status] || STATUS.observation;
  return e(
    Box,
    { flexDirection: "row", paddingLeft: 1 },
    e(Text, { color: s.color }, s.dot),
    e(Text, { color: isLatest ? THEME.primary : THEME.secondary }, ` ${detail || text || "..."}`)
  );
});

// Static list
const ActivityList = memo(({ items }) => {
  if (!items || items.length === 0) return null;
  return e(
    Box,
    { flexDirection: "column" },
    ...items.map((entry, i) =>
      e(ActivityEntry, {
        key: entry.id || `item-${i}`,
        text: entry.text,
        detail: entry.detail,
        status: entry.status,
        isLatest: i === 0
      })
    )
  );
});

// Main panel - subscribes to tracker with throttled updates
const EngineStatusPanelBase = ({
  toolEvents = [],
  streamingText = "",
  nextCycleTime = null,
  maxEntries = 5
}) => {
  const tracker = getActivityTracker();

  // State for activity data - initialized from tracker
  const [data, setData] = useState(() => tracker.getDisplayData());

  // Throttled subscription to tracker updates
  useEffect(() => {
    let lastUpdate = 0;
    let pendingUpdate = null;
    const THROTTLE_MS = 500; // Max update rate: once per 500ms

    const handleUpdate = (newData) => {
      const now = Date.now();
      const elapsed = now - lastUpdate;

      if (elapsed >= THROTTLE_MS) {
        // Enough time has passed, update immediately
        lastUpdate = now;
        setData(newData);
      } else if (!pendingUpdate) {
        // Schedule update for later
        pendingUpdate = setTimeout(() => {
          pendingUpdate = null;
          lastUpdate = Date.now();
          setData(tracker.getDisplayData());
        }, THROTTLE_MS - elapsed);
      }
    };

    tracker.on("updated", handleUpdate);

    return () => {
      tracker.off("updated", handleUpdate);
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
      }
    };
  }, [tracker]);

  const isRunning = data.isRunning;
  const isIdle = data.currentState === "idle" || data.currentState === "ready" || !isRunning;

  // Build display items
  const displayItems = useMemo(() => {
    const items = [];
    const seen = new Set();

    if (toolEvents?.length > 0) {
      toolEvents.slice(0, 3).forEach((evt, i) => {
        const text = evt.text || evt.action;
        if (text && !seen.has(text)) {
          seen.add(text);
          items.push({
            id: evt.id || `t${i}`,
            text,
            detail: evt.detail || evt.target,
            status: evt.status === "done" ? "completed" : evt.status === "error" ? "error" : "working"
          });
        }
      });
    }

    (data.activities || []).slice(0, maxEntries - items.length).forEach((act, i) => {
      if (act.text && !seen.has(act.text)) {
        seen.add(act.text);
        items.push({
          id: act.id || `a${i}`,
          text: act.text,
          detail: act.detail || act.target,
          status: act.status
        });
      }
    });

    return items.slice(0, maxEntries);
  }, [toolEvents, data.activities, maxEntries]);

  const hasStreaming = streamingText?.length > 0;

  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },

    // Header - static
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: THEME.muted, bold: true }, "ENGINE"),
        isRunning
          ? e(Text, { color: THEME.success, bold: true }, "● LIVE")
          : e(Text, { color: THEME.dim }, "○ OFF")
      ),
      e(Text, { color: THEME.dim }, `#${data.cycleCount}`)
    ),

    // Separator
    e(Text, { color: THEME.dim }, "─".repeat(40)),

    // Activity list - static
    displayItems.length > 0
      ? e(ActivityList, { items: displayItems })
      : e(Box, { paddingLeft: 1 }, e(Text, { color: THEME.muted }, "Waiting...")),

    // Streaming - static
    hasStreaming && e(
      Box,
      { flexDirection: "row", paddingLeft: 1, marginTop: 1 },
      e(Text, { color: THEME.info }, "│ "),
      e(Text, { color: THEME.secondary }, streamingText.slice(-60))
    ),

    // Status - static, no spinner animation
    e(
      Box,
      { flexDirection: "row", marginTop: 1, paddingLeft: 1 },
      !isIdle
        ? e(
            Box,
            { flexDirection: "row", gap: 1 },
            e(Text, { color: THEME.working }, "►"),
            e(Text, { color: THEME.primary }, data.stateDetail || data.currentState)
          )
        : e(
            Box,
            { flexDirection: "row", gap: 1 },
            e(Text, { color: THEME.muted }, "◇"),
            e(Text, { color: THEME.muted }, "Idle"),
            nextCycleTime && e(Text, { color: THEME.dim }, ` · next ${formatTimeUntil(nextCycleTime)}`)
          )
    )
  );
};

export const AgentActivityPanel = memo(EngineStatusPanelBase);

export const AgentStatusDot = memo(({ status = "idle", running = false }) => {
  if (!running) return e(Text, { color: THEME.dim }, "○");
  const s = STATUS[status] || STATUS.pending;
  return e(Text, { color: s.color }, s.dot);
});

export default AgentActivityPanel;
