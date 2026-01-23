import React, { useState, useEffect, memo, useMemo, useRef } from "react";
import { Box, Text } from "ink";
import { getActivityTracker } from "../services/activity-tracker.js";

const e = React.createElement;

// ═══════════════════════════════════════════════════════════════════════════
// THEME - Claude Code / OpenCode inspired design
// ═══════════════════════════════════════════════════════════════════════════

const THEME = {
  // Status colors
  success: "#10b981",    // Emerald
  error: "#ef4444",      // Red
  working: "#6366f1",    // Indigo
  warning: "#f59e0b",    // Amber
  info: "#3b82f6",       // Blue

  // Text colors
  primary: "#f1f5f9",    // Slate 100
  secondary: "#94a3b8",  // Slate 400
  muted: "#64748b",      // Slate 500
  dim: "#475569",        // Slate 600

  // Accents
  accent: "#8b5cf6",     // Violet
  highlight: "#22d3ee",  // Cyan
};

// Status indicators
const STATUS = {
  working: { dot: "◉", color: THEME.working },
  completed: { dot: "✓", color: THEME.success },
  error: { dot: "✗", color: THEME.error },
  pending: { dot: "○", color: THEME.muted },
  observation: { dot: "◈", color: THEME.info },
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

const formatTimeUntil = (nextTime) => {
  if (!nextTime) return "soon";
  const diff = nextTime - Date.now();
  if (diff <= 0) return "now";
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

// Single activity entry - clean, minimal
const ActivityEntry = memo(({ text, detail, status, isLatest }) => {
  const s = STATUS[status] || STATUS.observation;
  const displayText = detail || text || "Processing...";

  return e(
    Box,
    { flexDirection: "row", paddingLeft: 1 },
    e(Text, { color: s.color }, s.dot),
    e(Text, { color: isLatest ? THEME.primary : THEME.secondary }, ` ${displayText}`)
  );
});

// Activity list with separator
const ActivityList = memo(({ items }) => {
  if (!items || items.length === 0) return null;

  return e(
    Box,
    { flexDirection: "column" },
    ...items.map((entry, i) =>
      e(ActivityEntry, {
        key: entry.id || i,
        text: entry.text,
        detail: entry.detail,
        status: entry.status,
        isLatest: i === 0
      })
    )
  );
}, (prev, next) => {
  if (prev.items?.length !== next.items?.length) return false;
  for (let i = 0; i < (prev.items?.length || 0); i++) {
    if (prev.items[i]?.id !== next.items[i]?.id ||
        prev.items[i]?.status !== next.items[i]?.status) {
      return false;
    }
  }
  return true;
});

// Spinner animation frames
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PANEL
// ═══════════════════════════════════════════════════════════════════════════

const EngineStatusPanelBase = ({
  toolEvents = [],
  streamingText = "",
  nextCycleTime = null,
  maxEntries = 5
}) => {
  const tracker = useMemo(() => getActivityTracker(), []);
  const [data, setData] = useState(() => tracker.getDisplayData());
  const [frame, setFrame] = useState(0);
  const lastJsonRef = useRef("");

  // Single animation loop - 100ms for smooth spinner
  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER.length);

      // Check for data changes (throttled by the interval)
      const newData = tracker.getDisplayData();
      const newJson = JSON.stringify(newData);
      if (newJson !== lastJsonRef.current) {
        lastJsonRef.current = newJson;
        setData(newData);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [tracker]);

  const isRunning = data.isRunning;
  const isIdle = data.currentState === "idle" || data.currentState === "ready" || !isRunning;
  const isActive = !isIdle && isRunning;

  // Build display items
  const displayItems = useMemo(() => {
    const items = [];
    const seen = new Set();

    // Tool events first
    if (toolEvents?.length > 0) {
      toolEvents.slice(0, 3).forEach((evt, i) => {
        const text = evt.text || evt.action;
        if (!seen.has(text)) {
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

    // Activities
    (data.activities || []).slice(0, maxEntries - items.length).forEach((act, i) => {
      if (!seen.has(act.text)) {
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

  const spinner = SPINNER[frame];
  const hasStreaming = streamingText?.length > 0;

  return e(
    Box,
    { flexDirection: "column", paddingX: 1, paddingY: 0 },

    // ─── Header ───────────────────────────────────────────────────────
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: THEME.muted, bold: true }, "ENGINE"),
        isRunning
          ? e(
              Box,
              { flexDirection: "row", gap: 1 },
              e(Text, { color: THEME.success }, "●"),
              e(Text, { color: THEME.success, bold: true }, "LIVE")
            )
          : e(Text, { color: THEME.dim }, "○ STOPPED")
      ),
      e(Text, { color: THEME.dim }, `#${data.cycleCount}`)
    ),

    // ─── Separator ────────────────────────────────────────────────────
    e(Text, { color: THEME.dim }, "─".repeat(40)),

    // ─── Activity List ────────────────────────────────────────────────
    displayItems.length > 0
      ? e(ActivityList, { items: displayItems })
      : e(
          Box,
          { paddingLeft: 1 },
          e(Text, { color: THEME.muted }, "No recent activity")
        ),

    // ─── Streaming Output ─────────────────────────────────────────────
    hasStreaming && e(
      Box,
      { flexDirection: "row", paddingLeft: 1, marginTop: 1 },
      e(Text, { color: THEME.info }, "│ "),
      e(Text, { color: THEME.secondary, wrap: "truncate-end" }, streamingText.slice(-60))
    ),

    // ─── Status Line ──────────────────────────────────────────────────
    e(
      Box,
      { flexDirection: "row", marginTop: 1, paddingLeft: 1 },
      isActive
        ? e(
            Box,
            { flexDirection: "row", gap: 1 },
            e(Text, { color: THEME.working }, spinner),
            e(Text, { color: THEME.primary }, data.stateDetail || data.currentState)
          )
        : e(
            Box,
            { flexDirection: "row", gap: 1 },
            e(Text, { color: THEME.muted }, "◇"),
            e(Text, { color: THEME.muted }, "Idle"),
            nextCycleTime && e(
              Text,
              { color: THEME.dim },
              ` · next in ${formatTimeUntil(nextCycleTime)}`
            )
          )
    )
  );
};

export const AgentActivityPanel = memo(EngineStatusPanelBase);

// Compact status indicator
export const AgentStatusDot = memo(({ status = "idle", running = false }) => {
  if (!running) return e(Text, { color: THEME.dim }, "○");
  const s = STATUS[status] || STATUS.pending;
  return e(Text, { color: s.color }, s.dot);
});

export default AgentActivityPanel;
