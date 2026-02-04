"use client";

import { useDashboardData, formatFreshness } from "@/lib/dashboard";
import { Heart, Moon, Zap, Activity } from "lucide-react";

interface HealthData {
  sleep: { score: number; duration: number; efficiency: number };
  readiness: { score: number };
  activity: { score: number; steps: number; calories: number };
  hrv: number | null;
  rhr: number | null;
}

function MiniRing({ score, color, size = 44 }: { score: number; color: string; size?: number }) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-[#1a1a1a]" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="ring-animated"
          style={{ "--ring-circumference": circumference, filter: `drop-shadow(0 0 4px ${color}40)` } as React.CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-bold text-white tabular-nums" style={{ fontSize: size * 0.28 }}>{score}</span>
      </div>
    </div>
  );
}

export function HealthWidget() {
  const { data, updatedAt, loading } = useDashboardData<HealthData>("health");

  if (loading) {
    return (
      <div className="card-elevated rounded-2xl p-4 space-y-3 animate-pulse">
        <div className="skeleton h-6 w-20 rounded-lg" />
        <div className="flex gap-4">
          <div className="skeleton h-11 w-11 rounded-full" />
          <div className="skeleton h-11 w-11 rounded-full" />
          <div className="skeleton h-11 w-11 rounded-full" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card-elevated rounded-2xl p-5 flex flex-col items-center justify-center h-full min-h-[140px]">
        <Heart className="h-6 w-6 text-neutral-700 mb-2" />
        <p className="text-[12px] text-neutral-600">No health data</p>
        <p className="text-[10px] text-neutral-700 mt-0.5">Connect Oura in the CLI</p>
      </div>
    );
  }

  return (
    <div className="card-elevated rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium">Health</span>
        <span className="text-[9px] text-neutral-600">{formatFreshness(updatedAt)}</span>
      </div>

      {/* Score rings */}
      <div className="flex items-center justify-around">
        <div className="flex flex-col items-center gap-1">
          <MiniRing score={data.sleep?.score || 0} color="#8b5cf6" />
          <div className="flex items-center gap-1">
            <Moon className="h-2.5 w-2.5 text-violet-400" />
            <span className="text-[9px] text-neutral-500">Sleep</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <MiniRing score={data.readiness?.score || 0} color="#3b82f6" />
          <div className="flex items-center gap-1">
            <Zap className="h-2.5 w-2.5 text-blue-400" />
            <span className="text-[9px] text-neutral-500">Ready</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <MiniRing score={data.activity?.score || 0} color="#22c55e" />
          <div className="flex items-center gap-1">
            <Activity className="h-2.5 w-2.5 text-green-400" />
            <span className="text-[9px] text-neutral-500">Active</span>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#1a1a1a]">
        <div className="text-center">
          <p className="text-[14px] font-semibold text-white tabular-nums">{data.activity?.steps?.toLocaleString() || "--"}</p>
          <p className="text-[9px] text-neutral-600">Steps</p>
        </div>
        <div className="text-center">
          <p className="text-[14px] font-semibold text-white tabular-nums">{data.hrv || "--"}</p>
          <p className="text-[9px] text-neutral-600">HRV</p>
        </div>
        <div className="text-center">
          <p className="text-[14px] font-semibold text-white tabular-nums">{data.rhr || "--"}</p>
          <p className="text-[9px] text-neutral-600">RHR</p>
        </div>
      </div>
    </div>
  );
}
