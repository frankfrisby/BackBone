"use client";

import { useDashboardData, formatFreshness } from "@/lib/dashboard";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, BarChart3 } from "lucide-react";

interface PortfolioData {
  equity: number;
  cash: number;
  dayPL: number;
  dayPLPercent: number;
  totalPL: number;
  totalPLPercent: number;
  positions: Array<{
    symbol: string;
    qty: number;
    currentPrice: number;
    avgEntryPrice: number;
    unrealizedPL: number;
    unrealizedPLPercent: number;
    marketValue: number;
  }>;
}

export function PortfolioWidget() {
  const { data, updatedAt, loading } = useDashboardData<PortfolioData>("portfolio");

  if (loading) {
    return (
      <div className="card-elevated rounded-2xl p-4 space-y-3 animate-pulse">
        <div className="skeleton h-6 w-24 rounded-lg" />
        <div className="skeleton h-10 w-36 rounded-lg" />
        <div className="skeleton h-16 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card-elevated rounded-2xl p-5 flex flex-col items-center justify-center h-full min-h-[140px]">
        <BarChart3 className="h-6 w-6 text-neutral-700 mb-2" />
        <p className="text-[12px] text-neutral-600">No portfolio data</p>
        <p className="text-[10px] text-neutral-700 mt-0.5">Connect Alpaca in the CLI</p>
      </div>
    );
  }

  const isPositive = (data.dayPL || 0) >= 0;

  return (
    <div className="card-elevated rounded-2xl overflow-hidden">
      {/* Header */}
      <div className={`px-4 pt-4 pb-3 ${isPositive ? "gradient-card-green" : "gradient-card-red"}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium">
            Portfolio
          </span>
          <span className="text-[9px] text-neutral-600">{formatFreshness(updatedAt)}</span>
        </div>
        <div className="text-[28px] font-bold text-white tracking-value leading-none tabular-nums">
          {formatCurrency(data.equity)}
        </div>
        <div className="flex items-center gap-1 mt-1.5">
          <div className={`flex items-center gap-0.5 text-[12px] font-semibold ${isPositive ? "text-green-400" : "text-red-400"}`}>
            {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            <span className="tabular-nums">
              {isPositive ? "+" : ""}{formatCurrency(data.dayPL)}
            </span>
            <span className="text-neutral-500 font-normal text-[11px] ml-0.5">
              ({formatPercentage(data.dayPLPercent)})
            </span>
          </div>
          <span className="text-[10px] text-neutral-600 ml-1">today</span>
        </div>
      </div>

      {/* Top positions */}
      {data.positions && data.positions.length > 0 && (
        <div className="px-4 py-3 space-y-1">
          {data.positions.slice(0, 5).map((pos) => {
            const posPositive = (pos.unrealizedPL || 0) >= 0;
            return (
              <div key={pos.symbol} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-white">{pos.symbol}</span>
                  <span className="text-[10px] text-neutral-600 tabular-nums">{pos.qty}sh</span>
                </div>
                <div className={`text-[11px] font-medium tabular-nums ${posPositive ? "text-green-400" : "text-red-400"}`}>
                  {posPositive ? "+" : ""}{formatPercentage(pos.unrealizedPLPercent || 0)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
