"use client";

import { useDashboardData, formatFreshness } from "@/lib/dashboard";
import { Target, CheckCircle2 } from "lucide-react";

interface GoalsData {
  goals: Array<{
    id: string;
    title: string;
    category: string;
    progress: number;
    status: string;
    milestones: Array<{ label: string; target: number; achieved: boolean }>;
  }>;
  totalActive: number;
}

const categoryColors: Record<string, string> = {
  health: "bg-green-500",
  finance: "bg-yellow-500",
  career: "bg-blue-500",
  learning: "bg-purple-500",
  personal: "bg-orange-500",
  social: "bg-pink-500",
};

export function GoalsWidget() {
  const { data, updatedAt, loading } = useDashboardData<GoalsData>("goals");
  const goals = Array.isArray(data?.goals) ? data.goals : [];

  if (loading) {
    return (
      <div className="card-elevated rounded-2xl p-4 space-y-3 animate-pulse">
        <div className="skeleton h-6 w-16 rounded-lg" />
        <div className="skeleton h-12 rounded-xl" />
        <div className="skeleton h-12 rounded-xl" />
      </div>
    );
  }

  if (!data || goals.length === 0) {
    return (
      <div className="card-elevated rounded-2xl p-5 flex flex-col items-center justify-center h-full min-h-[140px]">
        <Target className="h-6 w-6 text-neutral-700 mb-2" />
        <p className="text-[12px] text-neutral-600">No active goals</p>
        <p className="text-[10px] text-neutral-700 mt-0.5">Create goals in the CLI</p>
      </div>
    );
  }

  const avgProgress = Math.round(
    goals.reduce((sum, g) => sum + (g.progress || 0), 0) / goals.length
  );

  return (
    <div className="card-elevated rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium">Goals</span>
          <span className="text-[10px] text-neutral-600 tabular-nums">
            {typeof data.totalActive === "number" ? data.totalActive : goals.length} active
          </span>
        </div>
        <span className="text-[9px] text-neutral-600">{formatFreshness(updatedAt)}</span>
      </div>

      {/* Overall progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-neutral-500">Average progress</span>
          <span className="text-[12px] font-semibold text-white tabular-nums">{avgProgress}%</span>
        </div>
        <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${avgProgress}%` }}
          />
        </div>
      </div>

      {/* Goal list */}
      <div className="space-y-2">
        {goals.slice(0, 5).map((goal) => (
          <div key={goal.id} className="flex items-center gap-2.5">
            <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${categoryColors[goal.category] || "bg-neutral-500"}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-white truncate">{goal.title}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="h-1 w-12 bg-[#1a1a1a] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${categoryColors[goal.category]?.replace("bg-", "bg-") || "bg-neutral-500"}`}
                  style={{ width: `${goal.progress}%` }}
                />
              </div>
              <span className="text-[10px] text-neutral-500 tabular-nums w-7 text-right">{goal.progress}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
