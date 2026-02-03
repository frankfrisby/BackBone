"use client";

import { useQuery } from "@tanstack/react-query";
import { Moon, Zap, Activity, Heart } from "lucide-react";

interface HealthViewProps {
  data?: any;
}

async function fetchHealth() {
  try {
    const resp = await fetch("http://localhost:3000/api/health", {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error("Failed");
    return resp.json();
  } catch {
    return null;
  }
}

function ScoreRing({
  score,
  color,
  size = 80,
}: {
  score: number;
  color: string;
  size?: number;
}) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-neutral-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-neutral-100">{score}</span>
      </div>
    </div>
  );
}

export function HealthView({ data }: HealthViewProps) {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  const h = health || data || {};
  const readiness = h.readinessScore || h.readiness?.score || 0;
  const sleep = h.sleepScore || h.sleep?.score || 0;
  const activity = h.activityScore || h.activity?.score || 0;
  const sleepDuration = h.lastNightSleep || h.sleep?.duration || 0;
  const hrv = h.hrvAverage || h.hrv || 0;
  const rhr = h.restingHeartRate || h.rhr || 0;

  const hasData = readiness > 0 || sleep > 0 || activity > 0;

  if (!hasData) {
    return (
      <div className="h-full overflow-auto p-5 space-y-4">
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Readiness Hero */}
      <div className="px-5 pt-6 pb-4 flex flex-col items-center">
        <ScoreRing score={readiness} color="#eab308" size={100} />
        <div className="flex items-center gap-1.5 mt-3">
          <Zap className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-medium text-neutral-300">
            Readiness
          </span>
        </div>
        <p className="text-xs text-neutral-500 mt-1">
          {readiness >= 80
            ? "Great day ahead"
            : readiness >= 60
            ? "Take it easy"
            : "Rest recommended"}
        </p>
      </div>

      {/* Score cards */}
      <div className="px-5 grid grid-cols-2 gap-3 mb-4">
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800 flex flex-col items-center">
          <ScoreRing score={sleep} color="#3b82f6" size={64} />
          <div className="flex items-center gap-1 mt-2">
            <Moon className="h-3 w-3 text-blue-500" />
            <span className="text-xs text-neutral-400">Sleep</span>
          </div>
          <span className="text-xs text-neutral-500 mt-0.5">
            {sleepDuration ? `${sleepDuration}h` : "—"}
          </span>
        </div>

        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800 flex flex-col items-center">
          <ScoreRing score={activity} color="#22c55e" size={64} />
          <div className="flex items-center gap-1 mt-2">
            <Activity className="h-3 w-3 text-green-500" />
            <span className="text-xs text-neutral-400">Activity</span>
          </div>
        </div>
      </div>

      {/* Vitals */}
      <div className="px-5 pb-6">
        <h3 className="text-xs text-neutral-500 uppercase tracking-wide mb-3">
          Vitals
        </h3>
        <div className="space-y-2">
          {hrv > 0 && (
            <div className="bg-neutral-900 rounded-xl p-3.5 border border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Activity className="h-4 w-4 text-purple-500" />
                </div>
                <span className="text-sm text-neutral-300">HRV</span>
              </div>
              <span className="text-sm font-medium text-neutral-100">
                {hrv} ms
              </span>
            </div>
          )}
          {rhr > 0 && (
            <div className="bg-neutral-900 rounded-xl p-3.5 border border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Heart className="h-4 w-4 text-red-500" />
                </div>
                <span className="text-sm text-neutral-300">Resting HR</span>
              </div>
              <span className="text-sm font-medium text-neutral-100">
                {rhr} bpm
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
