"use client";

import { useState } from "react";
import { useDashboardConfig, useConnectedSources, WIDGET_META } from "@/lib/dashboard";
import { DashboardSettings } from "./dashboard-settings";
import { PortfolioWidget } from "./widgets/portfolio-widget";
import { HealthWidget } from "./widgets/health-widget";
import { GoalsWidget } from "./widgets/goals-widget";
import { TickersWidget } from "./widgets/tickers-widget";
import { TradingWidget } from "./widgets/trading-widget";
import { LifeScoresWidget } from "./widgets/life-scores-widget";
import { BriefWidget } from "./widgets/brief-widget";
import { Settings, LayoutGrid } from "lucide-react";

const WIDGET_MAP: Record<string, React.ComponentType> = {
  portfolio: PortfolioWidget,
  health: HealthWidget,
  goals: GoalsWidget,
  tickers: TickersWidget,
  trading: TradingWidget,
  lifeScores: LifeScoresWidget,
  brief: BriefWidget,
};

export function DashboardView() {
  const { config, loading } = useDashboardConfig();
  const { sources } = useConnectedSources();
  const [showSettings, setShowSettings] = useState(false);

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
