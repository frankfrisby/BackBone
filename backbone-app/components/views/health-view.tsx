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
  strokeWidth = 4,
}: {
  score: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-[#1a1a1a]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="ring-animated"
          style={
            {
              "--ring-circumference": circumference,
              filter: `drop-shadow(0 0 6px ${color}40)`,
            } as React.CSSProperties
          }
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-bold text-white tabular-nums"
          style={{ fontSize: size * 0.24 }}
        >
          {score}
        </span>
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
      <div className="h-full overflow-auto p-5 space-y-3">
        <div className="skeleton h-52 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    );
  }

  const readinessLabel =
    readiness >= 80
      ? "Optimal"
      : readiness >= 60
      ? "Good"
      : readiness >= 40
      ? "Fair"
      : "Rest";

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Readiness Hero */}
      <div className="px-6 pt-8 pb-6 flex flex-col items-center gradient-hero">
        <ScoreRing score={readiness} color="#eab308" size={120} strokeWidth={5} />
        <div className="flex items-center gap-2 mt-4">
          <Zap className="h-4 w-4 text-yellow-500" />
          <span className="text-[15px] font-semibold text-white">
            Readiness
          </span>
        </div>
        <p className="text-[13px] text-neutral-500 mt-1">{readinessLabel}</p>
      </div>

      {/* Score cards */}
      <div className="px-5 grid grid-cols-2 gap-2.5 -mt-2">
        <div className="card-elevated p-5 flex flex-col items-center">
          <ScoreRing score={sleep} color="#3b82f6" size={72} />
          <div className="flex items-center gap-1.5 mt-3">
            <Moon className="h-3 w-3 text-blue-400" />
            <span className="text-[12px] text-neutral-400 font-medium">
              Sleep
            </span>
          </div>
          {sleepDuration > 0 && (
            <span className="text-[11px] text-neutral-600 mt-0.5 tabular-nums">
              {sleepDuration}h
            </span>
          )}
        </div>

        <div className="card-elevated p-5 flex flex-col items-center">
          <ScoreRing score={activity} color="#22c55e" size={72} />
          <div className="flex items-center gap-1.5 mt-3">
            <Activity className="h-3 w-3 text-green-400" />
            <span className="text-[12px] text-neutral-400 font-medium">
              Activity
            </span>
          </div>
        </div>
      </div>

      {/* Vitals */}
      <div className="px-5 pt-5 pb-8">
        <h3 className="text-[11px] text-neutral-500 uppercase tracking-widest font-medium mb-3">
          Vitals
        </h3>
        <div className="space-y-1.5">
          {hrv > 0 && (
            <div className="card-interactive flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Activity className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-[13px] text-neutral-300 font-medium">
                    HRV
                  </p>
                  <p className="text-[10px] text-neutral-600">
                    Heart Rate Variability
                  </p>
                </div>
              </div>
              <span className="text-[16px] font-semibold text-white tabular-nums">
                {hrv}
                <span className="text-[11px] text-neutral-500 font-normal ml-0.5">
                  ms
                </span>
              </span>
            </div>
          )}
          {rhr > 0 && (
            <div className="card-interactive flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <Heart className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <p className="text-[13px] text-neutral-300 font-medium">
                    Resting HR
                  </p>
                  <p className="text-[10px] text-neutral-600">
                    Heart Rate
                  </p>
                </div>
              </div>
              <span className="text-[16px] font-semibold text-white tabular-nums">
                {rhr}
                <span className="text-[11px] text-neutral-500 font-normal ml-0.5">
                  bpm
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
