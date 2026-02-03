"use client";

import { useQuery } from "@tanstack/react-query";
import { Target, CheckCircle2, Circle, Clock } from "lucide-react";

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

export function GoalsView({ data }: GoalsViewProps) {
  const { data: goals } = useQuery({
    queryKey: ["goals"],
    queryFn: fetchGoals,
  });

  const g = goals || data?.goals || [];

  if (!goals && !data) {
    return (
      <div className="h-full overflow-auto p-5 space-y-4">
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Target className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold text-neutral-100">Goals</h2>
        </div>
        <p className="text-xs text-neutral-500">
          {g.length} active goal{g.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Goals list */}
      <div className="px-5 pb-6 space-y-3">
        {g.length === 0 ? (
          <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800 text-center">
            <Target className="h-8 w-8 text-neutral-700 mx-auto mb-2" />
            <p className="text-sm text-neutral-500">No active goals</p>
            <p className="text-xs text-neutral-600 mt-1">
              Create a goal to get started
            </p>
          </div>
        ) : (
          g.map((goal: any) => {
            const progress = goal.progress || 0;
            const categoryColors: Record<string, string> = {
              health: "text-green-500 bg-green-500/10",
              finance: "text-yellow-500 bg-yellow-500/10",
              career: "text-blue-500 bg-blue-500/10",
              learning: "text-purple-500 bg-purple-500/10",
              personal: "text-orange-500 bg-orange-500/10",
              social: "text-pink-500 bg-pink-500/10",
            };
            const colorClass =
              categoryColors[goal.category] ||
              "text-neutral-400 bg-neutral-700";

            return (
              <div
                key={goal.id}
                className="bg-neutral-900 rounded-xl p-4 border border-neutral-800"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${colorClass}`}
                      >
                        {goal.category}
                      </span>
                      {goal.status === "completed" && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      )}
                    </div>
                    <h4 className="text-sm font-medium text-neutral-100">
                      {goal.title}
                    </h4>
                  </div>
                  <span className="text-xs text-neutral-500">
                    P{goal.priority || "?"}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-neutral-500">Progress</span>
                    <span className="text-xs text-neutral-400">
                      {progress}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Milestones */}
                {goal.milestones && goal.milestones.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {goal.milestones.slice(0, 3).map((m: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs"
                      >
                        {m.achieved ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <Circle className="h-3 w-3 text-neutral-600" />
                        )}
                        <span
                          className={
                            m.achieved
                              ? "text-neutral-500 line-through"
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
