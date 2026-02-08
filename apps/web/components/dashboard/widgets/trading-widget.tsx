"use client";

import { useDashboardData, formatFreshness } from "@/lib/dashboard";
import { Activity, Zap, ZapOff } from "lucide-react";

interface TradingData {
  autoTradingEnabled: boolean;
  mode: string;
  todayTradeCount: number;
  lastTradeTime: string | null;
}

export function TradingWidget() {
  const { data, updatedAt, loading } = useDashboardData<TradingData>("trading");

  if (loading) {
    return (
      <div className="card-elevated rounded-2xl p-4 space-y-3 animate-pulse">
        <div className="skeleton h-6 w-20 rounded-lg" />
        <div className="skeleton h-16 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card-elevated rounded-2xl p-5 flex flex-col items-center justify-center h-full min-h-[140px]">
        <Activity className="h-6 w-6 text-neutral-700 mb-2" />
        <p className="text-[12px] text-neutral-600">No trading data</p>
        <p className="text-[10px] text-neutral-700 mt-0.5">Enable auto-trading in the CLI</p>
      </div>
    );
  }

  return (
    <div className="card-elevated rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium">Trading</span>
        <span className="text-[9px] text-neutral-600">{formatFreshness(updatedAt)}</span>
      </div>

      {/* Auto-trading status */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${data.autoTradingEnabled ? "bg-green-500/10" : "bg-neutral-800"}`}>
          {data.autoTradingEnabled ? (
            <Zap className="h-4 w-4 text-green-400" />
          ) : (
            <ZapOff className="h-4 w-4 text-neutral-600" />
          )}
        </div>
        <div>
          <p className="text-[12px] font-medium text-white">
            {data.autoTradingEnabled ? "Auto-trading active" : "Auto-trading off"}
          </p>
          <p className="text-[10px] text-neutral-500 capitalize">{data.mode} mode</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="card-surface rounded-xl px-3 py-2.5">
          <p className="text-[9px] text-neutral-600 uppercase tracking-wider">Today</p>
          <p className="text-[16px] font-semibold text-white tabular-nums mt-0.5">{data.todayTradeCount}</p>
          <p className="text-[9px] text-neutral-600">trades</p>
        </div>
        <div className="card-surface rounded-xl px-3 py-2.5">
          <p className="text-[9px] text-neutral-600 uppercase tracking-wider">Last Trade</p>
          <p className="text-[12px] font-medium text-white mt-0.5">
            {data.lastTradeTime ? formatFreshness(data.lastTradeTime) : "None"}
          </p>
        </div>
      </div>
    </div>
  );
}
