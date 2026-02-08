"use client";

import { useEffect, useState, useCallback } from "react";
import { useEventSource, type SSEEvent } from "@/hooks/use-event-source";
import { motion } from "framer-motion";
import { Zap, Pause, Coffee, AlertTriangle } from "lucide-react";

interface EngineState {
  running: boolean;
  state: string;
  currentTask?: string;
  uptime?: string;
  shouldBeRunning?: boolean;
}

function getApiBase(): string {
  if (typeof window === "undefined") return "http://localhost:3000";
  const port = parseInt(window.location.port, 10);
  if (port === 3000 || window.location.pathname.startsWith("/app")) {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

function formatUptime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function EngineStatus({ compact = false }: { compact?: boolean }) {
  const [engine, setEngine] = useState<EngineState>({ running: false, state: "unknown" });
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [uptime, setUptime] = useState("");

  const handleEvent = useCallback((event: SSEEvent) => {
    if (event.type === "engine_update" && event.data) {
      setEngine({
        running: event.data.shouldBeRunning || event.data.state === "working",
        state: event.data.state || "unknown",
        currentTask: event.data.currentTask,
        shouldBeRunning: event.data.shouldBeRunning,
      });
    }
  }, []);

  useEventSource({ onEvent: handleEvent });

  // Fetch initial state
  useEffect(() => {
    const base = getApiBase();
    fetch(`${base}/api/engine/status`)
      .then((r) => r.json())
      .then((data) => {
        setEngine({
          running: data.running || false,
          state: data.status || data.state || "unknown",
          currentTask: data.currentTask,
        });
        if (data.startedAt) setStartedAt(new Date(data.startedAt).getTime());
      })
      .catch(() => {});

    fetch(`${base}/api/engine/supervisor`)
      .then((r) => r.json())
      .then((data) => {
        if (data.shouldBeRunning !== undefined) {
          setEngine((prev) => ({
            ...prev,
            shouldBeRunning: data.shouldBeRunning,
            state: data.state || prev.state,
          }));
        }
        if (data.sessionStartedAt) setStartedAt(new Date(data.sessionStartedAt).getTime());
      })
      .catch(() => {});
  }, []);

  // Update uptime counter
  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      setUptime(formatUptime(Date.now() - startedAt));
    }, 60000);
    setUptime(formatUptime(Date.now() - startedAt));
    return () => clearInterval(interval);
  }, [startedAt]);

  const stateConfig: Record<string, { icon: typeof Zap; color: string; dotColor: string; label: string }> = {
    working: { icon: Zap, color: "text-green-400", dotColor: "bg-green-500", label: "Working" },
    resting: { icon: Coffee, color: "text-blue-400", dotColor: "bg-blue-500", label: "Resting" },
    paused: { icon: Pause, color: "text-neutral-500", dotColor: "bg-neutral-600", label: "Paused" },
    stalled: { icon: AlertTriangle, color: "text-amber-400", dotColor: "bg-amber-500", label: "Stalled" },
    unknown: { icon: Zap, color: "text-neutral-600", dotColor: "bg-neutral-700", label: "Offline" },
  };

  const config = stateConfig[engine.state] || stateConfig.unknown;
  const Icon = config.icon;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <div className={`h-1.5 w-1.5 rounded-full ${config.dotColor} ${engine.state === "working" ? "animate-pulse" : ""}`} />
        <span className={`text-[10px] font-medium ${config.color}`}>{config.label}</span>
        {uptime && <span className="text-[9px] text-neutral-600 tabular-nums">{uptime}</span>}
      </div>
    );
  }

  return (
    <motion.div
      className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <span className="text-[12px] font-semibold text-neutral-300">Engine</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${config.dotColor} ${engine.state === "working" ? "animate-pulse" : ""}`} />
          <span className={`text-[11px] font-medium ${config.color}`}>{config.label}</span>
          {uptime && <span className="text-[10px] text-neutral-600 tabular-nums ml-1">{uptime}</span>}
        </div>
      </div>
      {engine.currentTask && (
        <p className="text-[10px] text-neutral-500 truncate mt-1">
          {engine.currentTask}
        </p>
      )}
    </motion.div>
  );
}
