"use client";

import { useDashboardData, formatFreshness } from "@/lib/dashboard";
import { TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface TickersData {
  tickers: Array<{
    symbol: string;
    score: number;
    price: number;
    change: number;
    macdTrend: string;
  }>;
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-green-400";
  if (score >= 40) return "text-yellow-400";
  return "text-red-400";
}

function getScoreBg(score: number): string {
  if (score >= 70) return "bg-green-500/10";
  if (score >= 40) return "bg-yellow-500/10";
  return "bg-red-500/10";
}

export function TickersWidget() {
  const { data, updatedAt, loading } = useDashboardData<TickersData>("tickers");

  if (loading) {
    return (
      <div className="card-elevated rounded-2xl p-4 space-y-2 animate-pulse">
        <div className="skeleton h-6 w-20 rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-8 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data || !data.tickers || data.tickers.length === 0) {
    return (
      <div className="card-elevated rounded-2xl p-5 flex flex-col items-center justify-center h-full min-h-[140px]">
        <TrendingUp className="h-6 w-6 text-neutral-700 mb-2" />
        <p className="text-[12px] text-neutral-600">No ticker data</p>
        <p className="text-[10px] text-neutral-700 mt-0.5">Start the ticker engine in the CLI</p>
      </div>
    );
  }

  return (
    <div className="card-elevated rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium">Tickers</span>
        <span className="text-[9px] text-neutral-600">{formatFreshness(updatedAt)}</span>
      </div>

      <div className="space-y-1">
        {data.tickers.slice(0, 8).map((ticker) => {
          const isPositive = (ticker.change || 0) >= 0;
          return (
            <div key={ticker.symbol} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-white w-12">{ticker.symbol}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getScoreBg(ticker.score)} ${getScoreColor(ticker.score)} tabular-nums`}>
                  {ticker.score}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-neutral-400 tabular-nums">
                  ${ticker.price?.toFixed(2)}
                </span>
                <div className={`flex items-center gap-0.5 text-[10px] font-medium tabular-nums ${isPositive ? "text-green-400" : "text-red-400"}`}>
                  {isPositive ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                  {isPositive ? "+" : ""}{(ticker.change || 0).toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
