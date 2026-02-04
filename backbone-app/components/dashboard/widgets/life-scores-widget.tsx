"use client";

import { useDashboardData, formatFreshness } from "@/lib/dashboard";
import { LayoutGrid } from "lucide-react";

interface LifeScoresData {
  overall: number;
  categories: Record<string, number>;
  trends: Record<string, string>;
}

const categoryMeta: Record<string, { label: string; color: string }> = {
  health: { label: "Health", color: "#22c55e" },
  wealth: { label: "Wealth", color: "#f59e0b" },
  career: { label: "Career", color: "#3b82f6" },
  relationships: { label: "Social", color: "#ec4899" },
  personal: { label: "Personal", color: "#8b5cf6" },
  learning: { label: "Learning", color: "#06b6d4" },
};

export function LifeScoresWidget() {
  const { data, updatedAt, loading } = useDashboardData<LifeScoresData>("lifeScores");

  if (loading) {
    return (
      <div className="card-elevated rounded-2xl p-4 space-y-3 animate-pulse">
        <div className="skeleton h-6 w-24 rounded-lg" />
        <div className="skeleton h-20 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card-elevated rounded-2xl p-5 flex flex-col items-center justify-center h-full min-h-[140px]">
        <LayoutGrid className="h-6 w-6 text-neutral-700 mb-2" />
        <p className="text-[12px] text-neutral-600">No life scores</p>
        <p className="text-[10px] text-neutral-700 mt-0.5">Connect data sources in the CLI</p>
      </div>
    );
  }

  const categories = Object.entries(data.categories || {});

  return (
    <div className="card-elevated rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium">Life Scores</span>
        <span className="text-[9px] text-neutral-600">{formatFreshness(updatedAt)}</span>
      </div>

      {/* Overall score */}
      <div className="flex items-center gap-3 mb-3">
        <div className="h-12 w-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
          <span className="text-[20px] font-bold text-cyan-400 tabular-nums">{data.overall}</span>
        </div>
        <div>
          <p className="text-[12px] font-medium text-white">Overall Score</p>
          <p className="text-[10px] text-neutral-500">
            {data.overall >= 80 ? "Excellent" : data.overall >= 60 ? "Good" : data.overall >= 40 ? "Fair" : "Needs work"}
          </p>
        </div>
      </div>

      {/* Category bars */}
      <div className="space-y-2">
        {categories.map(([key, value]) => {
          const meta = categoryMeta[key] || { label: key, color: "#6b7280" };
          const score = typeof value === "number" ? value : 0;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-neutral-500">{meta.label}</span>
                <span className="text-[10px] font-medium text-neutral-400 tabular-nums">{score}</span>
              </div>
              <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${score}%`, backgroundColor: meta.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
