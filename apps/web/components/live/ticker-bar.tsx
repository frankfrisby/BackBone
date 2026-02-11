"use client";

import { useEffect, useState, useCallback } from "react";
import { useEventSource, type SSEEvent } from "@/hooks/use-event-source";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, ArrowUp, ArrowDown, Shield } from "lucide-react";

interface TickerData {
  symbol: string;
  price: number;
  change: number;
  score?: number;
}

interface PortfolioPosition {
  symbol: string;
  price: number;
  change: number;
  pl: number;
  qty: number;
}

interface MarketIndicators {
  spyChange: number | null;
  recessionScore: number;
}

function getApiBase(): string {
  if (typeof window === "undefined") return "http://localhost:3000";
  const port = parseInt(window.location.port, 10);
  if (port === 3000 || window.location.pathname.startsWith("/app")) {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

function getRecessionColor(score: number): string {
  if (score >= 8) return "text-red-500";
  if (score >= 6) return "text-orange-500";
  if (score >= 4) return "text-yellow-500";
  if (score >= 2) return "text-lime-500";
  return "text-green-500";
}

function getRecessionBg(score: number): string {
  if (score >= 8) return "bg-red-500/10";
  if (score >= 6) return "bg-orange-500/10";
  if (score >= 4) return "bg-yellow-500/10";
  if (score >= 2) return "bg-lime-500/10";
  return "bg-green-500/10";
}

export function TickerBar() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [equity, setEquity] = useState<number>(0);
  const [dayPL, setDayPL] = useState<number>(0);
  const [topTickers, setTopTickers] = useState<TickerData[]>([]);
  const [marketIndicators, setMarketIndicators] = useState<MarketIndicators>({
    spyChange: null,
    recessionScore: 5.0,
  });

  // Handle SSE updates
  const handleEvent = useCallback((event: SSEEvent) => {
    if (event.type === "portfolio_update" && event.data) {
      if (event.data.equity) setEquity(event.data.equity);
      if (event.data.dayPL !== undefined) setDayPL(event.data.dayPL);
      if (event.data.positions) setPositions(event.data.positions);
    }
    if (event.type === "ticker_update" && event.data?.top5) {
      setTopTickers(event.data.top5);
    }
  }, []);

  useEventSource({ onEvent: handleEvent });

  // Fetch initial data
  useEffect(() => {
    const base = getApiBase();
    fetch(`${base}/api/portfolio`)
      .then((r) => r.json())
      .then((data) => {
        if (data.equity) setEquity(data.equity);
        if (data.dayPL !== undefined) setDayPL(data.dayPL);
      })
      .catch(() => {});

    fetch(`${base}/api/positions`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPositions(
            data.map((p: any) => ({
              symbol: p.symbol,
              price: p.currentPrice || p.price || 0,
              change: p.changeToday || p.change || 0,
              pl: p.unrealizedPL || p.pl || 0,
              qty: p.qty || 0,
            }))
          );
        }
      })
      .catch(() => {});

    fetch(`${base}/api/tickers`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTopTickers(data.slice(0, 5));
        }
      })
      .catch(() => {});

    // Fetch market indicators (SPY + Recession)
    fetch(`${base}/api/market-indicators`)
      .then((r) => r.json())
      .then((data) => {
        if (data) setMarketIndicators(data);
      })
      .catch(() => {});

    // Refresh market indicators every 60s
    const interval = setInterval(() => {
      fetch(`${base}/api/market-indicators`)
        .then((r) => r.json())
        .then((data) => {
          if (data) setMarketIndicators(data);
        })
        .catch(() => {});
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const plColor = dayPL >= 0 ? "text-green-400" : "text-red-400";
  const spyChange = marketIndicators.spyChange;
  const spyColor = spyChange != null && spyChange >= 0 ? "text-green-400" : "text-red-400";
  const recScore = marketIndicators.recessionScore;
  const recColor = getRecessionColor(recScore);
  const recBg = getRecessionBg(recScore);

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-[#141414] overflow-x-auto scrollbar-none">
      {/* Portfolio summary */}
      <div className="flex items-center gap-3 flex-shrink-0 pr-3 border-r border-[#1a1a1a]">
        <div>
          <span className="text-[10px] text-neutral-600 uppercase tracking-wider">Equity</span>
          <p className="text-[13px] font-semibold text-white tabular-nums">
            ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <span className="text-[10px] text-neutral-600 uppercase tracking-wider">Day P&L</span>
          <p className={`text-[13px] font-semibold tabular-nums ${plColor}`}>
            {dayPL >= 0 ? "+" : ""}${dayPL.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Position tickers */}
      {positions.slice(0, 6).map((p) => (
        <motion.div
          key={p.symbol}
          className="flex items-center gap-1.5 flex-shrink-0"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <span className="text-[11px] font-medium text-neutral-300">{p.symbol}</span>
          <span className="text-[10px] tabular-nums text-neutral-500">
            ${p.price?.toFixed(2) || "—"}
          </span>
          <span
            className={`text-[10px] tabular-nums flex items-center gap-0.5 ${
              p.change >= 0 ? "text-green-500" : "text-red-500"
            }`}
          >
            {p.change >= 0 ? (
              <TrendingUp className="h-2.5 w-2.5" />
            ) : (
              <TrendingDown className="h-2.5 w-2.5" />
            )}
            {Math.abs(p.change).toFixed(1)}%
          </span>
        </motion.div>
      ))}

      {/* Divider */}
      {positions.length > 0 && topTickers.length > 0 && (
        <div className="h-4 w-px bg-[#1a1a1a] flex-shrink-0" />
      )}

      {/* Top scored tickers */}
      <div className="flex items-center gap-1 flex-shrink-0 mr-1">
        <span className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest">TOP</span>
      </div>
      {topTickers.map((t) => (
        <div key={t.symbol} className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[11px] font-medium text-neutral-400">{t.symbol}</span>
          {t.score != null && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-[#1a1a1a] text-neutral-500 tabular-nums">
              {t.score?.toFixed(1)}
            </span>
          )}
        </div>
      ))}

      {/* SPY indicator */}
      {spyChange != null && (
        <>
          <div className="h-4 w-px bg-[#1a1a1a] flex-shrink-0" />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[11px] font-semibold text-neutral-300">SPY</span>
            <span className={`text-[11px] font-semibold tabular-nums flex items-center gap-0.5 ${spyColor}`}>
              {spyChange >= 0 ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )}
              {spyChange >= 0 ? "+" : ""}{spyChange.toFixed(2)}%
            </span>
          </div>
        </>
      )}

      {/* Recession indicator */}
      <div className="h-4 w-px bg-[#1a1a1a] flex-shrink-0" />
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Shield className={`h-3 w-3 ${recColor}`} />
        <span className="text-[10px] text-neutral-500">Recession</span>
        <span className={`text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded ${recColor} ${recBg}`}>
          {recScore.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
