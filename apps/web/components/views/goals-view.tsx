"use client";

import { useQuery } from "@tanstack/react-query";
import { Target, CheckCircle2, Circle } from "lucide-react";

interface GoalsViewProps {
  data?: any;
}

async function fetchGoals() {
  try {
    const resp = await fetch("http://localhost:3000/api/goals", {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error("Failed");
    return resp.json();
  } catch {
    return null;
  }
}

const categoryStyles: Record<string, { color: string; bg: string }> = {
  health: { color: "text-green-400", bg: "bg-green-500/10" },
  finance: { color: "text-yellow-400", bg: "bg-yellow-500/10" },
  career: { color: "text-blue-400", bg: "bg-blue-500/10" },
  learning: { color: "text-purple-400", bg: "bg-purple-500/10" },
  personal: { color: "text-orange-400", bg: "bg-orange-500/10" },
  social: { color: "text-pink-400", bg: "bg-pink-500/10" },
};

export function GoalsView({ data }: GoalsViewProps) {
  const { data: goals } = useQuery({
    queryKey: ["goals"],
    queryFn: fetchGoals,
  });

  const g = goals || data?.goals || [];

  if (!goals && !data) {
    return (
      <div className="h-full overflow-auto p-5 space-y-3">
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
      </div>
    );
  }

  // Stats
  const active = g.filter((goal: any) => goal.status === "active").length;
  const completed = g.filter((goal: any) => goal.status === "completed").length;
  const avgProgress =
    g.length > 0
      ? Math.round(
          g.reduce((sum: number, goal: any) => sum + (goal.progress || 0), 0) /
            g.length
        )
      : 0;

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Hero Header */}
      <div className="px-6 pt-8 pb-6 gradient-hero">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="h-9 w-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Target className="h-4 w-4 text-orange-500" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-white tracking-tight">
              Goals
            </h2>
            <p className="text-[11px] text-neutral-600">
              {g.length} goal{g.length !== 1 ? "s" : ""} tracked
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="card-surface px-3 py-2.5 text-center">
            <p className="text-[16px] font-bold text-white tabular-nums">
              {active}
            </p>
            <p className="text-[10px] text-neutral-600 mt-0.5">Active</p>
          </div>
          <div className="card-surface px-3 py-2.5 text-center">
            <p className="text-[16px] font-bold text-green-400 tabular-nums">
              {completed}
            </p>
            <p className="text-[10px] text-neutral-600 mt-0.5">Done</p>
          </div>
          <div className="card-surface px-3 py-2.5 text-center">
            <p className="text-[16px] font-bold text-orange-400 tabular-nums">
              {avgProgress}%
            </p>
            <p className="text-[10px] text-neutral-600 mt-0.5">Avg</p>
          </div>
        </div>
      </div>

      {/* Goals list */}
      <div className="px-5 pb-8 space-y-1.5">
        {g.length === 0 ? (
          <div className="card-surface p-8 flex flex-col items-center">
            <div className="h-12 w-12 rounded-2xl bg-[#1a1a1a] flex items-center justify-center mb-3">
              <Target className="h-5 w-5 text-neutral-600" />
            </div>
            <p className="text-[13px] text-neutral-500">No active goals</p>
            <p className="text-[11px] text-neutral-700 mt-0.5">
              Create a goal to get started
            </p>
          </div>
        ) : (
          g.map((goal: any) => {
            const progress = goal.progress || 0;
            const style =
              categoryStyles[goal.category] || {
                color: "text-neutral-400",
                bg: "bg-[#1a1a1a]",
              };
            const progressColor =
              progress >= 75
                ? "bg-green-500"
                : progress >= 40
                ? "bg-yellow-500"
                : "bg-orange-500";

            return (
              <div key={goal.id} className="card-interactive px-4 py-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${style.color} ${style.bg}`}
                      >
                        {goal.category}
                      </span>
                      {goal.status === "completed" && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                      )}
                    </div>
                    <h4 className="text-[13px] font-medium text-white leading-snug">
                      {goal.title}
                    </h4>
                  </div>
                  <span className="text-[11px] text-neutral-600 font-medium tabular-nums">
                    P{goal.priority || "?"}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-neutral-600 uppercase tracking-wider">
                      Progress
                    </span>
                    <span className="text-[11px] text-neutral-400 font-semibold tabular-nums">
                      {progress}%
                    </span>
                  </div>
                  <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${progressColor} transition-all duration-700`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Milestones */}
                {goal.milestones && goal.milestones.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {goal.milestones
                      .slice(0, 3)
                      .map((m: any, i: number) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-[11px]"
                        >
                          {m.achieved ? (
                            <CheckCircle2 className="h-3 w-3 text-green-400 flex-shrink-0" />
                          ) : (
                            <Circle className="h-3 w-3 text-neutral-700 flex-shrink-0" />
                          )}
                          <span
                            className={
                              m.achieved
                                ? "text-neutral-600 line-through"
                                : "text-neutral-400"
                            }
                          >
                            {m.label}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
