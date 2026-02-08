"use client";

import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

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

  if (!p) {
    return (
      <div className="h-full overflow-auto p-5 space-y-3">
        <div className="skeleton h-44 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-20 rounded-2xl" />
        <div className="skeleton h-20 rounded-2xl" />
      </div>
    );
  }

  const isPositive = (p.totalPL || 0) >= 0;
  const dayPositive = (p.dayPL || 0) >= 0;

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Hero */}
      <div
        className={`px-6 pt-8 pb-5 ${
          isPositive ? "gradient-card-green" : "gradient-card-red"
        }`}
      >
        <p className="text-[11px] text-neutral-500 uppercase tracking-widest font-medium mb-1.5">
          Portfolio Value
        </p>
        <div className="text-[42px] font-bold text-white tracking-value leading-none tabular-nums">
          {formatCurrency(p.equity || 0)}
        </div>

        <div className="flex items-center gap-4 mt-3">
          <div
            className={`flex items-center gap-1 text-[13px] font-semibold ${
              isPositive ? "text-green-400" : "text-red-400"
            }`}
          >
            {isPositive ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            <span className="tabular-nums">
              {formatCurrency(Math.abs(p.totalPL || 0))}
            </span>
            <span className="text-neutral-500 font-normal ml-0.5">
              ({formatPercentage(p.totalPLPercent || 0)})
            </span>
          </div>
          <span className="text-[11px] text-neutral-600">all time</span>
        </div>
      </div>

      {/* Chart */}
      <div className="px-5 py-4">
        <div className="h-28 card-surface flex items-end justify-center gap-px px-4 pb-4 pt-2 overflow-hidden">
          {Array.from({ length: 40 }).map((_, i) => {
            const height = 15 + Math.random() * 85;
            const opacity = 0.2 + (i / 40) * 0.8;
            return (
              <div
                key={i}
                className="flex-1 rounded-full animate-fade-up"
                style={{
                  height: `${height}%`,
                  opacity,
                  backgroundColor: isPositive
                    ? "rgba(34, 197, 94, 0.4)"
                    : "rgba(239, 68, 68, 0.4)",
                  animationDelay: `${i * 15}ms`,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="px-5 pb-4 grid grid-cols-2 gap-2.5">
        <div className="card-surface px-4 py-3.5">
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider font-medium">
            Buying Power
          </p>
          <p className="text-[18px] font-semibold text-white mt-1 tabular-nums tracking-tight">
            {formatCurrency(p.buyingPower || 0)}
          </p>
        </div>
        <div className="card-surface px-4 py-3.5">
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider font-medium">
            Today
          </p>
          <p
            className={`text-[18px] font-semibold mt-1 tabular-nums tracking-tight ${
              dayPositive ? "text-green-400" : "text-red-400"
            }`}
          >
            {dayPositive ? "+" : ""}
            {formatCurrency(p.dayPL || 0)}
          </p>
        </div>
      </div>

      {/* Positions */}
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
              const posPositive = (position.unrealizedPL || 0) >= 0;
              return (
                <div
                  key={position.symbol}
                  className="card-interactive flex items-center justify-between px-4 py-3.5"
                >
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
                  <div className="text-right">
                    <p className="text-[14px] font-medium text-white tabular-nums">
                      {formatCurrency(position.currentPrice || 0)}
                    </p>
                    <p
                      className={`text-[12px] font-medium tabular-nums ${
                        posPositive ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {posPositive ? "+" : ""}
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
