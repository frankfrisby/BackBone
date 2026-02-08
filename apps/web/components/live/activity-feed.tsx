"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEventSource, type SSEEvent } from "@/hooks/use-event-source";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Brain,
  Heart,
  Target,
  Zap,
  RefreshCw,
  BarChart3,
  Wifi,
  WifiOff,
} from "lucide-react";

interface ActivityEntry {
  id: string;
  category: string;
  message: string;
  data?: any;
  timestamp: string;
}

const CATEGORY_CONFIG: Record<string, { icon: typeof Activity; color: string; label: string }> = {
  trade: { icon: TrendingUp, color: "text-green-400", label: "Trade" },
  research: { icon: Brain, color: "text-purple-400", label: "Research" },
  engine: { icon: Zap, color: "text-yellow-400", label: "Engine" },
  health: { icon: Heart, color: "text-red-400", label: "Health" },
  goal: { icon: Target, color: "text-blue-400", label: "Goal" },
  system: { icon: RefreshCw, color: "text-neutral-400", label: "System" },
  portfolio_update: { icon: BarChart3, color: "text-emerald-400", label: "Portfolio" },
  ticker_update: { icon: TrendingUp, color: "text-cyan-400", label: "Tickers" },
  health_update: { icon: Heart, color: "text-rose-400", label: "Health" },
  trade_update: { icon: TrendingDown, color: "text-orange-400", label: "Trade" },
  engine_update: { icon: Zap, color: "text-amber-400", label: "Engine" },
  goals_update: { icon: Target, color: "text-indigo-400", label: "Goals" },
  life_scores_update: { icon: Activity, color: "text-teal-400", label: "Scores" },
  prediction_update: { icon: Brain, color: "text-violet-400", label: "Predict" },
};

const MAX_ENTRIES = 100;

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

function describeEvent(event: SSEEvent): string {
  const { type, data } = event;
  if (type === "activity" && data?.message) return data.message;
  if (type === "connected") return "Connected to BACKBONE server";

  switch (type) {
    case "portfolio_update":
      if (data?.equity) return `Portfolio: $${Number(data.equity).toLocaleString()} | Day P&L: $${Number(data.dayPL || 0).toFixed(2)}`;
      return "Portfolio data updated";
    case "ticker_update":
      if (data?.top5?.length) {
        const top = data.top5.map((t: any) => `${t.symbol}(${t.score?.toFixed(1)})`).join(" ");
        return `Top tickers: ${top}`;
      }
      return `${data?.count || 0} tickers updated`;
    case "health_update":
      return `Sleep: ${data?.sleepScore || "—"} | Readiness: ${data?.readinessScore || "—"}`;
    case "trade_update":
      if (data?.latest) return `Trade: ${data.latest.side} ${data.latest.symbol} x${data.latest.qty}`;
      return `${data?.totalTrades || 0} trades logged`;
    case "engine_update":
      return `Engine: ${data?.state || "unknown"} ${data?.currentTask ? `— ${data.currentTask}` : ""}`;
    case "goals_update":
      return "Goals data refreshed";
    case "life_scores_update":
      return "Life scores updated";
    case "prediction_update":
      return "Prediction scores refreshed";
    default:
      return `${type} event received`;
  }
}

export function ActivityFeed({ compact = false }: { compact?: boolean }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const handleEvent = useCallback((event: SSEEvent) => {
    const entry: ActivityEntry = {
      id: event.type === "activity" && event.data?.id ? event.data.id : crypto.randomUUID(),
      category: event.type === "activity" ? event.data?.category || "system" : event.type,
      message: describeEvent(event),
      data: event.data,
      timestamp: event.timestamp,
    };
    setEntries((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
    });
  }, []);

  const { connected } = useEventSource({ onEvent: handleEvent });

  // Fetch initial activity log
  useEffect(() => {
    let sseBase: string;
    const port = parseInt(window.location.port, 10);
    if (port === 3000 || window.location.pathname.startsWith("/app")) {
      sseBase = window.location.origin;
    } else {
      sseBase = "http://localhost:3000";
    }
    fetch(`${sseBase}/api/activity?limit=50`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setEntries(data);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  return (
    <div className={`flex flex-col ${compact ? "h-full" : "h-full"}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-neutral-500" />
          <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Live Activity</span>
        </div>
        <div className="flex items-center gap-1.5">
          {connected ? (
            <>
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-neutral-600">live</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-neutral-700" />
              <span className="text-[10px] text-neutral-600">offline</span>
            </>
          )}
        </div>
      </div>

      {/* Feed */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 scrollbar-thin"
      >
        <AnimatePresence initial={false}>
          {entries.map((entry) => {
            const config = CATEGORY_CONFIG[entry.category] || CATEGORY_CONFIG.system;
            const Icon = config.icon;

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-2 py-1.5 px-1 rounded hover:bg-[#111] transition-colors group"
              >
                <Icon className={`h-3 w-3 mt-0.5 flex-shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-neutral-300 leading-tight truncate">
                    {entry.message}
                  </p>
                </div>
                <span className="text-[9px] text-neutral-700 tabular-nums flex-shrink-0 group-hover:text-neutral-500 transition-colors">
                  {formatTime(entry.timestamp)}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-neutral-700">
            <Activity className="h-6 w-6 mb-2" />
            <p className="text-[11px]">Waiting for activity...</p>
          </div>
        )}
      </div>
    </div>
  );
}
