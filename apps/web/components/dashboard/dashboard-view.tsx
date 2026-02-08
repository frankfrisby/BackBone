"use client";

import { useState, useEffect, useCallback } from "react";
import { useDashboardConfig, useConnectedSources, WIDGET_META } from "@/lib/dashboard";
import { DashboardSettings } from "./dashboard-settings";
import { PortfolioWidget } from "./widgets/portfolio-widget";
import { HealthWidget } from "./widgets/health-widget";
import { GoalsWidget } from "./widgets/goals-widget";
import { TickersWidget } from "./widgets/tickers-widget";
import { TradingWidget } from "./widgets/trading-widget";
import { LifeScoresWidget } from "./widgets/life-scores-widget";
import { BriefWidget } from "./widgets/brief-widget";
import { ActivityFeed } from "../live/activity-feed";
import { TickerBar } from "../live/ticker-bar";
import { EngineStatus } from "../live/engine-status";
import { useIsLocalMode, useLocalData } from "@/hooks/use-local-data";
import { useEventSource, type SSEEvent } from "@/hooks/use-event-source";
import { motion } from "framer-motion";
import {
  Settings,
  LayoutGrid,
  TrendingUp,
  TrendingDown,
  Activity,
  Heart,
  Target,
  BarChart3,
  Brain,
  Zap,
  ChevronRight,
} from "lucide-react";

const WIDGET_MAP: Record<string, React.ComponentType> = {
  portfolio: PortfolioWidget,
  health: HealthWidget,
  goals: GoalsWidget,
  tickers: TickersWidget,
  trading: TradingWidget,
  lifeScores: LifeScoresWidget,
  brief: BriefWidget,
};

// ── Live Stats Cards ─────────────────────────────────────────

function LivePortfolioCard() {
  const { data } = useLocalData<any>("/api/portfolio", 15000);
  const [flash, setFlash] = useState(false);
  const [prevEquity, setPrevEquity] = useState(0);

  useEffect(() => {
    if (data?.equity && data.equity !== prevEquity) {
      setFlash(true);
      setPrevEquity(data.equity);
      setTimeout(() => setFlash(false), 600);
    }
  }, [data?.equity, prevEquity]);

  const equity = data?.equity || 0;
  const dayPL = data?.dayPL || 0;
  const dayPLPct = data?.dayPLPercent || 0;
  const plColor = dayPL >= 0 ? "text-green-400" : "text-red-400";

  return (
    <motion.div
      className={`rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-4 transition-all ${
        flash ? "ring-1 ring-green-500/30" : ""
      }`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-emerald-400" />
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Portfolio</span>
      </div>
      <p className="text-[24px] font-bold text-white tabular-nums tracking-tight">
        ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      <div className="flex items-center gap-2 mt-1">
        {dayPL >= 0 ? (
          <TrendingUp className={`h-3 w-3 ${plColor}`} />
        ) : (
          <TrendingDown className={`h-3 w-3 ${plColor}`} />
        )}
        <span className={`text-[12px] font-medium tabular-nums ${plColor}`}>
          {dayPL >= 0 ? "+" : ""}${dayPL.toFixed(2)} ({dayPLPct >= 0 ? "+" : ""}{dayPLPct.toFixed(2)}%)
        </span>
        <span className="text-[10px] text-neutral-600">today</span>
      </div>
    </motion.div>
  );
}

function LiveHealthCard() {
  const { data } = useLocalData<any>("/api/health", 60000);

  const sleep = data?.sleep?.score;
  const readiness = data?.readiness?.score;
  const activity = data?.activity?.score;
  const steps = data?.activity?.steps;

  return (
    <motion.div
      className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Heart className="h-4 w-4 text-rose-400" />
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Health</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <span className="text-[10px] text-neutral-600">Sleep</span>
          <p className="text-[18px] font-bold text-white tabular-nums">{sleep || "—"}</p>
        </div>
        <div>
          <span className="text-[10px] text-neutral-600">Ready</span>
          <p className="text-[18px] font-bold text-white tabular-nums">{readiness || "—"}</p>
        </div>
        <div>
          <span className="text-[10px] text-neutral-600">Steps</span>
          <p className="text-[18px] font-bold text-white tabular-nums">{steps ? (steps > 999 ? `${(steps / 1000).toFixed(1)}k` : steps) : "—"}</p>
        </div>
      </div>
    </motion.div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  health: "bg-green-500",
  finance: "bg-yellow-500",
  career: "bg-blue-500",
  education: "bg-purple-500",
  learning: "bg-purple-500",
  personal: "bg-orange-500",
  social: "bg-pink-500",
  growth: "bg-teal-500",
};

function LiveGoalsCard() {
  const { data } = useLocalData<any>("/api/goals", 60000);

  const goals = data?.goals || [];
  const active = goals.filter((g: any) => g.status === "active" || g.status === "planning");

  return (
    <motion.div
      className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Target className="h-4 w-4 text-blue-400" />
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Goals</span>
        <span className="text-[10px] text-neutral-600 ml-auto">{active.length} active</span>
      </div>
      <div className="space-y-2">
        {active.slice(0, 5).map((g: any) => (
          <div key={g.id || g.title} className="flex items-center gap-2">
            <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[g.category] || "bg-neutral-500"}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-neutral-300 truncate">{g.title}</p>
            </div>
            {g.status === "planning" ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 flex-shrink-0">PLAN</span>
            ) : (
              <>
                <div className="w-16 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden flex-shrink-0">
                  <div
                    className={`h-full rounded-full ${CATEGORY_COLORS[g.category]?.replace("bg-", "bg-") || "bg-blue-500"}`}
                    style={{ width: `${Math.max(g.progress || 0, 2)}%` }}
                  />
                </div>
                <span className="text-[9px] text-neutral-600 tabular-nums w-6 text-right flex-shrink-0">
                  {g.progress || 0}%
                </span>
              </>
            )}
          </div>
        ))}
        {active.length === 0 && (
          <p className="text-[11px] text-neutral-700">No active goals</p>
        )}
      </div>
    </motion.div>
  );
}

function LiveSignalsCard() {
  const { data } = useLocalData<any[]>("/api/signals", 30000);

  const signals = data || [];

  return (
    <motion.div
      className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Brain className="h-4 w-4 text-purple-400" />
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Signals</span>
        <span className="text-[10px] text-neutral-600 ml-auto">{signals.length}</span>
      </div>
      <div className="space-y-1.5">
        {signals.slice(0, 5).map((s: any) => (
          <div key={s.symbol} className="flex items-center gap-2">
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
              s.action === "buy" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
            }`}>
              {s.action.toUpperCase()}
            </span>
            <span className="text-[11px] font-medium text-neutral-300">{s.symbol}</span>
            <span className="text-[10px] text-neutral-600 tabular-nums ml-auto">{s.score?.toFixed(1)}</span>
          </div>
        ))}
        {signals.length === 0 && (
          <p className="text-[11px] text-neutral-700">No active signals</p>
        )}
      </div>
    </motion.div>
  );
}

function LiveRecentTradesCard() {
  const { data } = useLocalData<any>("/api/positions", 30000);

  const positions = data?.positions || data || [];

  return (
    <motion.div
      className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-amber-400" />
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Positions</span>
        <span className="text-[10px] text-neutral-600 ml-auto">{Array.isArray(positions) ? positions.length : 0}</span>
      </div>
      <div className="space-y-1.5">
        {(Array.isArray(positions) ? positions : []).slice(0, 6).map((p: any) => {
          const pnl = parseFloat(p.unrealized_pl || p.unrealizedPL || 0);
          // unrealized_plpc is decimal (0.052), unrealizedPLPercent is already % (5.2)
          const pnlPct = p.unrealized_plpc != null
            ? parseFloat(p.unrealized_plpc) * 100
            : parseFloat(p.unrealizedPLPercent || 0);
          const plColor = pnl >= 0 ? "text-green-400" : "text-red-400";
          return (
            <div key={p.symbol} className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-neutral-300 w-12">{p.symbol}</span>
              <span className="text-[10px] text-neutral-600 tabular-nums">{p.qty || p.quantity} sh</span>
              <span className={`text-[10px] tabular-nums ml-auto ${plColor}`}>
                {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
              </span>
            </div>
          );
        })}
        {(!Array.isArray(positions) || positions.length === 0) && (
          <p className="text-[11px] text-neutral-700">No open positions</p>
        )}
      </div>
    </motion.div>
  );
}

function LiveLifeScoresCard() {
  const { data } = useLocalData<any>("/api/life-scores", 60000);

  const categories = data?.categories || {};
  const dimensions = Object.entries(categories);
  const overall = data?.overall || 0;

  return (
    <motion.div
      className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-yellow-400" />
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Life Scores</span>
        {overall > 0 && (
          <span className="text-[10px] text-neutral-500 ml-auto">{overall}/100</span>
        )}
      </div>
      <div className="space-y-1.5">
        {dimensions.slice(0, 6).map(([key, value]: [string, any]) => {
          const score = typeof value === "number" ? value : (value?.score || 0);
          const barColor = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500 capitalize w-14 truncate">{key}</span>
              <div className="flex-1 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score}%` }} />
              </div>
              <span className="text-[9px] text-neutral-600 tabular-nums w-6 text-right">{score}</span>
            </div>
          );
        })}
        {dimensions.length === 0 && (
          <p className="text-[11px] text-neutral-700">No scores yet</p>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Dashboard View ──────────────────────────────────────

export function DashboardView() {
  const { config, loading } = useDashboardConfig();
  const { sources } = useConnectedSources();
  const [showSettings, setShowSettings] = useState(false);
  const isLocal = useIsLocalMode();
  const [now, setNow] = useState(new Date());

  // Update clock every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Desktop Local Mode: Live Dashboard ─────────────────────

  if (isLocal) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-black">
        {/* Ticker bar across the top */}
        <TickerBar />

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Live data cards */}
          <div className="flex-1 overflow-auto no-scrollbar p-4">
            {/* Header with time */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-[16px] font-bold text-white tracking-tight">BACKBONE</h1>
                <p className="text-[11px] text-neutral-600">
                  {now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  {" "}
                  {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                </p>
              </div>
              <EngineStatus compact />
            </div>

            {/* Live stats grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <LivePortfolioCard />
              <LiveHealthCard />
              <LiveGoalsCard />
              <LiveSignalsCard />
              <LiveRecentTradesCard />
              <LiveLifeScoresCard />
            </div>

            {/* Engine status full */}
            <div className="mb-4">
              <EngineStatus />
            </div>

            {/* Existing widgets below */}
            {config && (
              <div className="grid grid-cols-2 gap-3">
                {(config.widgets || [])
                  .filter((w) => w.enabled)
                  .map((widget) => {
                    const Component = WIDGET_MAP[widget.sourceId];
                    if (!Component) return null;
                    return (
                      <div
                        key={widget.sourceId}
                        className={`animate-fade-up ${widget.size === "full" ? "col-span-2" : ""}`}
                      >
                        <Component />
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Right: Activity feed */}
          <div className="w-72 border-l border-[#141414] bg-[#050505] flex flex-col">
            <ActivityFeed />
          </div>
        </div>
      </div>
    );
  }

  // ── Firebase/Remote Mode: Original Dashboard ───────────────

  if (loading) {
    return (
      <div className="h-full overflow-auto no-scrollbar p-5">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-44 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const enabledWidgets = (config?.widgets || []).filter((w) => w.enabled);

  if (enabledWidgets.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="h-12 w-12 rounded-2xl bg-[#111] border border-[#1a1a1a] flex items-center justify-center mb-3">
          <LayoutGrid className="h-5 w-5 text-neutral-700" />
        </div>
        <p className="text-[13px] text-neutral-600 mb-1">No widgets enabled</p>
        <button
          onClick={() => setShowSettings(true)}
          className="text-[12px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          Configure dashboard
        </button>
        {showSettings && (
          <DashboardSettings onClose={() => setShowSettings(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h2 className="text-[14px] font-semibold text-white">Dashboard</h2>
          <p className="text-[10px] text-neutral-600 mt-0.5">
            Live data from BACKBONE CLI
          </p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="h-8 w-8 rounded-xl bg-[#111] border border-[#1a1a1a] flex items-center justify-center hover:border-[#2a2a2a] transition-colors"
        >
          <Settings className="h-3.5 w-3.5 text-neutral-400" />
        </button>
      </div>

      {/* Widget grid */}
      <div className="px-5 pb-8">
        <div className="grid grid-cols-2 gap-3">
          {enabledWidgets.map((widget) => {
            const Component = WIDGET_MAP[widget.sourceId];
            if (!Component) return null;

            return (
              <div
                key={widget.sourceId}
                className={`animate-fade-up ${widget.size === "full" ? "col-span-2" : ""}`}
              >
                <Component />
              </div>
            );
          })}
        </div>
      </div>

      {showSettings && (
        <DashboardSettings onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
