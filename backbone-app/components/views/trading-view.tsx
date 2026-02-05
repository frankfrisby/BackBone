"use client";

import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import {
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Zap,
} from "lucide-react";

interface TradingViewProps {
  data?: any;
  isLive?: boolean;
}

async function fetchSignals() {
  try {
    const resp = await fetch("http://localhost:3000/api/signals", {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error("Failed");
    return resp.json();
  } catch {
    return null;
  }
}

async function fetchPositions() {
  try {
    const resp = await fetch("http://localhost:3000/api/positions", {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error("Failed");
    return resp.json();
  } catch {
    return null;
  }
}

function ScoreBar({ score }: { score: number }) {
  // Scores are 0-10 scale
  const color =
    score >= 7
      ? "bg-green-500"
      : score >= 4
      ? "bg-yellow-500"
      : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${(score / 10) * 100}%` }}
        />
      </div>
      <span
        className={`text-[12px] font-semibold tabular-nums ${
          score >= 7
            ? "text-green-400"
            : score >= 4
            ? "text-yellow-400"
            : "text-red-400"
        }`}
      >
        {score.toFixed(1)}
      </span>
    </div>
  );
}

export function TradingView({ data, isLive }: TradingViewProps) {
  const { data: signals } = useQuery({
    queryKey: ["signals"],
    queryFn: fetchSignals,
    refetchInterval: isLive ? 15000 : false,
  });

  const { data: positions } = useQuery({
    queryKey: ["positions"],
    queryFn: fetchPositions,
    refetchInterval: isLive ? 15000 : false,
  });

  const sigs = signals || data?.signals || [];
  const pos = positions || data?.positions || [];

  if (!signals && !data) {
    return (
      <div className="h-full overflow-auto p-5 space-y-3">
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Hero Header */}
      <div className="px-6 pt-8 pb-6 gradient-hero">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="h-9 w-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-orange-500" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-white tracking-tight">
              Trading Signals
            </h2>
            <p className="text-[11px] text-neutral-600">
              Real-time analysis & positions
            </p>
          </div>
        </div>
      </div>

      {/* Active Signals */}
      <div className="px-5 pb-5">
        <h3 className="text-[11px] text-neutral-500 uppercase tracking-widest font-medium mb-3">
          Active Signals
        </h3>

        {sigs.length === 0 ? (
          <div className="card-surface p-6 flex flex-col items-center">
            <div className="h-12 w-12 rounded-2xl bg-[#1a1a1a] flex items-center justify-center mb-3">
              <Zap className="h-5 w-5 text-neutral-600" />
            </div>
            <p className="text-[13px] text-neutral-500">No active signals</p>
            <p className="text-[11px] text-neutral-700 mt-0.5">
              Signals appear when conditions are met
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {sigs.map((signal: any, i: number) => (
              <div key={i} className="card-interactive px-4 py-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[14px] font-semibold text-white">
                      {signal.symbol}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        signal.action === "buy"
                          ? "bg-green-500/10 text-green-400"
                          : signal.action === "sell"
                          ? "bg-red-500/10 text-red-400"
                          : "bg-[#1a1a1a] text-neutral-500"
                      }`}
                    >
                      {signal.action}
                    </span>
                  </div>
                  {signal.price && (
                    <span className="text-[13px] font-medium text-neutral-300 tabular-nums">
                      {formatCurrency(signal.price)}
                    </span>
                  )}
                </div>
                <ScoreBar score={signal.score || 0} />
                {signal.reason && (
                  <p className="text-[11px] text-neutral-600 mt-2 leading-relaxed">
                    {signal.reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open Positions */}
      <div className="px-5 pb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] text-neutral-500 uppercase tracking-widest font-medium">
            Positions
          </h3>
          <span className="text-[11px] text-neutral-600 tabular-nums">
            {pos.length}
          </span>
        </div>

        <div className="space-y-1.5">
          {pos.length === 0 ? (
            <div className="card-surface p-5 text-center">
              <p className="text-[13px] text-neutral-600">No open positions</p>
            </div>
          ) : (
            pos.map((position: any) => {
              const isPos = (position.unrealizedPL || 0) >= 0;
              return (
                <div
                  key={position.symbol}
                  className="card-interactive flex items-center justify-between px-4 py-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                        isPos ? "bg-green-500/10" : "bg-red-500/10"
                      }`}
                    >
                      {isPos ? (
                        <ArrowUpRight className="h-4 w-4 text-green-400" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-white">
                          {position.symbol}
                        </span>
                        <span className="text-[11px] text-neutral-600 tabular-nums">
                          {position.qty} shares
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-600 mt-0.5 tabular-nums">
                        Avg {formatCurrency(position.avgEntryPrice || 0)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[14px] font-medium text-white tabular-nums">
                      {formatCurrency(position.marketValue || position.currentPrice || 0)}
                    </p>
                    <p
                      className={`text-[12px] font-medium tabular-nums ${
                        isPos ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {isPos ? "+" : ""}
                      {formatPercentage(position.unrealizedPLPercent || 0)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Live badge */}
      {isLive && (
        <div className="fixed bottom-20 right-4 flex items-center gap-2 glass rounded-full px-3.5 py-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500 pulse-dot" />
          <span className="text-[10px] text-neutral-400 font-medium">
            Live
          </span>
        </div>
      )}
    </div>
  );
}
