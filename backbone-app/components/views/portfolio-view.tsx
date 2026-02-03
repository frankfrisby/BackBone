"use client";

import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface PortfolioViewProps {
  data?: any;
  isLive?: boolean;
}

async function fetchPortfolio() {
  try {
    const resp = await fetch("http://localhost:3000/api/portfolio", {
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

export function PortfolioView({ data, isLive }: PortfolioViewProps) {
  const { data: portfolio } = useQuery({
    queryKey: ["portfolio"],
    queryFn: fetchPortfolio,
    refetchInterval: isLive ? 15000 : false,
  });

  const { data: positions } = useQuery({
    queryKey: ["positions"],
    queryFn: fetchPositions,
    refetchInterval: isLive ? 15000 : false,
  });

  const p = portfolio || data?.portfolio;
  const pos = positions || data?.positions || [];

  // Show skeleton while loading
  if (!p) {
    return (
      <div className="h-full overflow-auto p-5 space-y-4">
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-20 rounded-2xl" />
        <div className="skeleton h-20 rounded-2xl" />
        <div className="skeleton h-20 rounded-2xl" />
      </div>
    );
  }

  const isPositive = (p.totalPL || 0) >= 0;
  const dayPositive = (p.dayPL || 0) >= 0;

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Hero section - Robinhood style */}
      <div className="px-5 pt-6 pb-4">
        <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">
          Total Portfolio Value
        </p>
        <div className="text-4xl font-bold text-neutral-100 tracking-tight">
          {formatCurrency(p.equity || 0)}
        </div>

        {/* P&L Row */}
        <div className="flex items-center gap-3 mt-2">
          <div
            className={`flex items-center gap-1 text-sm font-medium ${
              isPositive ? "text-green-500 glow-green" : "text-red-500 glow-red"
            }`}
          >
            {isPositive ? (
              <ArrowUpRight className="h-4 w-4" />
            ) : (
              <ArrowDownRight className="h-4 w-4" />
            )}
            {formatCurrency(Math.abs(p.totalPL || 0))} (
            {formatPercentage(p.totalPLPercent || 0)})
          </div>
          <span className="text-xs text-neutral-600">All time</span>
        </div>

        {/* Day P&L */}
        <div className="flex items-center gap-3 mt-1">
          <div
            className={`flex items-center gap-1 text-xs ${
              dayPositive ? "text-green-500" : "text-red-500"
            }`}
          >
            {dayPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {formatCurrency(Math.abs(p.dayPL || 0))} today
          </div>
        </div>
      </div>

      {/* Chart placeholder */}
      <div className="px-5 mb-4">
        <div className="h-32 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
          <div className="flex items-end gap-0.5 h-16">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 rounded-full ${
                  isPositive ? "bg-green-500/30" : "bg-red-500/30"
                }`}
                style={{
                  height: `${20 + Math.random() * 80}%`,
                  opacity: 0.3 + (i / 30) * 0.7,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-5 mb-4 grid grid-cols-2 gap-3">
        <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800">
          <p className="text-xs text-neutral-500">Buying Power</p>
          <p className="text-lg font-semibold text-neutral-100 mt-0.5">
            {formatCurrency(p.buyingPower || 0)}
          </p>
        </div>
        <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800">
          <p className="text-xs text-neutral-500">Day P&L</p>
          <p
            className={`text-lg font-semibold mt-0.5 ${
              dayPositive ? "text-green-500" : "text-red-500"
            }`}
          >
            {formatCurrency(p.dayPL || 0)}
          </p>
        </div>
      </div>

      {/* Positions */}
      <div className="px-5 pb-6">
        <h3 className="text-xs text-neutral-500 uppercase tracking-wide mb-3">
          Positions ({pos.length})
        </h3>
        <div className="space-y-2">
          {pos.length === 0 ? (
            <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800 text-center">
              <p className="text-sm text-neutral-500">No positions</p>
            </div>
          ) : (
            pos.map((position: any) => {
              const posPositive = (position.unrealizedPL || 0) >= 0;
              return (
                <div
                  key={position.symbol}
                  className="bg-neutral-900 rounded-xl p-3.5 border border-neutral-800 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-neutral-100">
                        {position.symbol}
                      </span>
                      <span className="text-xs text-neutral-600">
                        {position.qty} shares
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      Avg {formatCurrency(position.avgEntryPrice || 0)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-neutral-100">
                      {formatCurrency(position.currentPrice || 0)}
                    </div>
                    <div
                      className={`text-xs font-medium ${
                        posPositive ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {formatPercentage(position.unrealizedPLPercent || 0)}
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
