"use client";

import { useDashboardData, formatFreshness } from "@/lib/dashboard";
import { Sparkles, Sun, Moon, CloudSun, Flame, ChevronRight } from "lucide-react";

interface BriefSummary {
  greeting: string;
  dateStr: string;
  dayName: string;
  timeOfDay: "morning" | "afternoon" | "evening";
  mood: "positive" | "neutral" | "cautious";
  sectionsWithData: number;
  summary: string;
  actionItems: Array<{
    type: string;
    priority: string;
    text: string;
  }> | null;
}

export function BriefWidget() {
  const { data, updatedAt, loading } = useDashboardData<BriefSummary>("brief");

  if (loading) {
    return (
      <div className="card-elevated rounded-2xl p-4 space-y-3 animate-pulse">
        <div className="skeleton h-6 w-32 rounded-lg" />
        <div className="skeleton h-4 w-48 rounded-lg" />
        <div className="skeleton h-12 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card-elevated rounded-2xl p-5 flex flex-col items-center justify-center h-full min-h-[140px]">
        <Sparkles className="h-6 w-6 text-neutral-700 mb-2" />
        <p className="text-[12px] text-neutral-600">No brief yet</p>
        <p className="text-[10px] text-neutral-700 mt-0.5">Generated each morning</p>
      </div>
    );
  }

  const TimeIcon =
    data.timeOfDay === "morning"
      ? Sun
      : data.timeOfDay === "afternoon"
        ? CloudSun
        : Moon;

  const moodColor =
    data.mood === "positive"
      ? "#22c55e"
      : data.mood === "cautious"
        ? "#f59e0b"
        : "#3b82f6";

  const moodGradient =
    data.mood === "positive"
      ? "gradient-card-green"
      : data.mood === "cautious"
        ? "from-amber-500/6"
        : "";

  const actionItems = Array.isArray(data.actionItems) ? data.actionItems : [];
  const urgentCount = actionItems.filter((a) => a.priority === "urgent").length;

  return (
    <div className={`card-elevated rounded-2xl overflow-hidden ${moodGradient}`}>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${moodColor}15` }}
            >
              <TimeIcon className="h-3 w-3" style={{ color: moodColor }} />
            </div>
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium">
              Daily Brief
            </span>
          </div>
          <span className="text-[9px] text-neutral-600">
            {formatFreshness(updatedAt)}
          </span>
        </div>

        <p className="text-[13px] font-semibold text-white leading-snug mb-1.5">
          {data.greeting?.split("!")[0]}
        </p>

        {data.summary && (
          <p className="text-[10px] text-neutral-500 leading-relaxed line-clamp-2">
            {data.summary}
          </p>
        )}
      </div>

      {/* Action items preview */}
      {actionItems.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          {actionItems.slice(0, 2).map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              {item.priority === "urgent" ? (
                <Flame className="h-2.5 w-2.5 text-red-400 shrink-0" />
              ) : (
                <ChevronRight className="h-2.5 w-2.5 text-neutral-600 shrink-0" />
              )}
              <p className="text-[10px] text-neutral-400 truncate">{item.text}</p>
            </div>
          ))}
          {actionItems.length > 2 && (
            <p className="text-[9px] text-neutral-600 pl-4">
              +{actionItems.length - 2} more
            </p>
          )}
        </div>
      )}

      {/* Footer with section count */}
      <div className="px-4 py-2.5 border-t border-[#1a1a1a] flex items-center justify-between">
        <span className="text-[9px] text-neutral-600">
          {data.sectionsWithData || 0} sections
        </span>
        {urgentCount > 0 && (
          <span className="text-[9px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded">
            {urgentCount} urgent
          </span>
        )}
      </div>
    </div>
  );
}
