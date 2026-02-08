"use client";

import { useDashboardData, formatFreshness } from "@/lib/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Moon, Zap, Heart } from "lucide-react";

interface HealthData {
  sleep: { score: number; duration: number; efficiency: number };
  readiness: { score: number };
  activity: { score: number; steps: number; calories: number };
  hrv: number | null;
  rhr: number | null;
}

function ScoreRing({ score, color, size = 80 }: { score: number; color: string; size?: number }) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-slate-800" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-bold text-white text-xl tabular-nums">{score}</span>
      </div>
    </div>
  );
}

export function HealthView() {
  const { data, updatedAt, loading } = useDashboardData<HealthData>("health");

  if (loading) {
    return (
      <div className="h-full overflow-auto p-6 space-y-6 animate-pulse">
        <div className="h-40 bg-slate-800 rounded-lg" />
        <div className="h-40 bg-slate-800 rounded-lg" />
        <div className="h-40 bg-slate-800 rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        <Heart className="h-12 w-12 text-slate-700 mb-4" />
        <p className="text-slate-400 text-lg">No health data available</p>
        <p className="text-slate-600 text-sm mt-1">Connect your Oura Ring in the CLI to see health metrics</p>
      </div>
    );
  }

  const sleepScore = data.sleep?.score ?? 0;
  const readinessScore = data.readiness?.score ?? 0;
  const activityScore = data.activity?.score ?? 0;

  const getInsight = (type: string, score: number) => {
    if (score >= 85) return type === "readiness" ? "Great day for challenging tasks" : "Excellent";
    if (score >= 70) return "Good";
    return type === "readiness" ? "Take it easy today" : "Needs attention";
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {updatedAt && (
        <p className="text-xs text-slate-600 text-right">Updated {formatFreshness(updatedAt)}</p>
      )}

      {/* Readiness Score */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Readiness Score
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <ScoreRing score={readinessScore} color="#eab308" />
          <div>
            <div className="text-sm text-slate-400">{getInsight("readiness", readinessScore)}</div>
          </div>
        </CardContent>
      </Card>

      {/* Sleep Data */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <Moon className="h-5 w-5 text-blue-500" />
            Sleep
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-slate-400">Score</div>
              <div className="text-2xl font-bold text-blue-500">{sleepScore}</div>
            </div>
            {data.sleep?.duration != null && (
              <div>
                <div className="text-sm text-slate-400">Duration</div>
                <div className="text-2xl font-bold text-slate-100">{data.sleep.duration}h</div>
              </div>
            )}
            {data.sleep?.efficiency != null && (
              <div>
                <div className="text-sm text-slate-400">Efficiency</div>
                <div className="text-2xl font-bold text-slate-100">{data.sleep.efficiency}%</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Activity */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-500" />
            Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-slate-400">Score</div>
              <div className="text-2xl font-bold text-green-500">{activityScore}</div>
            </div>
            {data.activity?.steps != null && (
              <div>
                <div className="text-sm text-slate-400">Steps</div>
                <div className="text-2xl font-bold text-slate-100">{data.activity.steps.toLocaleString()}</div>
              </div>
            )}
            {data.activity?.calories != null && (
              <div>
                <div className="text-sm text-slate-400">Calories</div>
                <div className="text-2xl font-bold text-slate-100">{data.activity.calories.toLocaleString()}</div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800">
            {data.hrv != null && (
              <div>
                <div className="text-sm text-slate-400">HRV</div>
                <div className="text-lg font-semibold text-slate-100">{data.hrv}ms</div>
              </div>
            )}
            {data.rhr != null && (
              <div>
                <div className="text-sm text-slate-400">Resting HR</div>
                <div className="text-lg font-semibold text-slate-100">{data.rhr} bpm</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
