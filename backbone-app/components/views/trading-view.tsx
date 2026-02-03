"use client";

import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
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

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold text-neutral-100">Trading</h2>
        </div>
        <p className="text-xs text-neutral-500">
          Real-time signals and positions
        </p>
      </div>

      {/* Signals */}
      <div className="px-5 mb-5">
        <h3 className="text-xs text-neutral-500 uppercase tracking-wide mb-3">
          Active Signals
        </h3>
        {sigs.length === 0 ? (
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-neutral-800 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-neutral-600" />
              </div>
              <div>
                <p className="text-sm text-neutral-400">No active signals</p>
                <p className="text-xs text-neutral-600">
                  Signals will appear when conditions are met
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {sigs.map((signal: any, i: number) => (
              <div
                key={i}
                className="bg-neutral-900 rounded-xl p-3.5 border border-neutral-800"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-neutral-100">
                      {signal.symbol}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        signal.action === "buy"
                          ? "bg-green-500/10 text-green-500"
                          : signal.action === "sell"
                          ? "bg-red-500/10 text-red-500"
                          : "bg-neutral-700 text-neutral-400"
                      }`}
                    >
                      {signal.action?.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-sm font-medium ${
                        signal.score >= 70
                          ? "text-green-500"
                          : signal.score >= 40
                          ? "text-yellow-500"
                          : "text-red-500"
                      }`}
                    >
                      {signal.score}/100
                    </div>
                  </div>
                </div>
                {signal.reason && (
                  <p className="text-xs text-neutral-500">{signal.reason}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Positions */}
      <div className="px-5 pb-6">
        <h3 className="text-xs text-neutral-500 uppercase tracking-wide mb-3">
          Open Positions ({pos.length})
        </h3>
        <div className="space-y-2">
          {pos.length === 0 ? (
            <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800 text-center">
              <p className="text-sm text-neutral-500">No open positions</p>
            </div>
          ) : (
            pos.map((position: any) => {
              const isPos = (position.unrealizedPL || 0) >= 0;
              return (
                <div
                  key={position.symbol}
                  className="bg-neutral-900 rounded-xl p-3.5 border border-neutral-800"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                          isPos ? "bg-green-500/10" : "bg-red-500/10"
                        }`}
                      >
                        {isPos ? (
                          <ArrowUpRight className="h-4 w-4 text-green-500" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-neutral-100">
                          {position.symbol}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {position.qty} @ {formatCurrency(position.avgEntryPrice || 0)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-neutral-100">
                        {formatCurrency(position.marketValue || 0)}
                      </div>
                      <div
                        className={`text-xs font-medium ${
                          isPos ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {formatCurrency(position.unrealizedPL || 0)} (
                        {formatPercentage(position.unrealizedPLPercent || 0)})
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Live indicator */}
      {isLive && (
        <div className="fixed bottom-20 right-4 flex items-center gap-1.5 bg-neutral-900/90 border border-neutral-700 rounded-full px-3 py-1">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500 pulse-dot" />
          <span className="text-[10px] text-neutral-400">Live</span>
        </div>
      )}
    </div>
  );
}
