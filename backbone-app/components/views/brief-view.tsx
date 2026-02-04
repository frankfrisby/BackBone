"use client";

import { useState } from "react";
import { useDashboardData, formatFreshness } from "@/lib/dashboard";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import {
  Sun,
  Moon,
  CloudSun,
  Sparkles,
  Bot,
  Newspaper,
  TrendingUp,
  TrendingDown,
  Heart,
  Target,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Zap,
  Activity,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Flame,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────

interface SystemActivityItem {
  source: string;
  count: number;
  highlights: string[];
  status: string;
}

interface Headline {
  title: string;
  source: string;
  category: string;
  relevance: number | null;
}

interface MarketSummary {
  direction: "up" | "down";
  avgChange: number;
  topGainers: Array<{ symbol: string; change: number }>;
  topLosers: Array<{ symbol: string; change: number }>;
  tickerCount: number;
}

interface PortfolioSection {
  equity: number | null;
  dayPL: number | null;
  dayPLPercent: number | null;
  topPositions: Array<{
    symbol: string;
    qty: number;
    marketValue: number;
    unrealizedPL: number;
    unrealizedPLPercent: number;
  }>;
  recentTrades: Array<{
    symbol: string;
    side: string;
    qty: number;
    price: number;
    time: string;
  }>;
  signals: Array<{ symbol: string; score: number; price: number }>;
}

interface HealthSection {
  sleep: { score: number; duration: number | null; efficiency: number | null };
  readiness: { score: number };
  activity: { score: number; steps: number | null; calories: number | null };
  hrv: number | null;
  rhr: number | null;
}

interface GoalsSection {
  totalActive: number;
  avgProgress: number;
  goals: Array<{
    title: string;
    category: string;
    progress: number;
    status: string;
  }>;
  recentMilestones: Array<{ goal: string; milestone: string }>;
}

interface CalendarEvent {
  title: string;
  time: string;
  location: string | null;
  allDay: boolean;
}

interface ActionItem {
  type: string;
  priority: "urgent" | "important" | "useful";
  text: string;
  detail: string;
  category: string;
}

interface LifeScoresSection {
  overall: number;
  categories: Record<string, { score: number; trend: string }>;
}

interface BriefData {
  id: string;
  generatedAt: string;
  date: string;
  dayName: string;
  dateStr: string;
  timeOfDay: "morning" | "afternoon" | "evening";
  greeting: string;
  mood: "positive" | "neutral" | "cautious";
  sectionsWithData: number;
  systemActivity: SystemActivityItem[] | null;
  worldSnapshot: {
    headlines: Headline[];
    marketSummary: MarketSummary | null;
  } | null;
  portfolio: PortfolioSection | null;
  health: HealthSection | null;
  goals: GoalsSection | null;
  calendar: CalendarEvent[] | null;
  actionItems: ActionItem[] | null;
  lifeScores: LifeScoresSection | null;
  summary: string;
}

// ── Collapsible Section ───────────────────────────────────────────

function BriefSection({
  title,
  icon: Icon,
  iconColor,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  icon: typeof Sun;
  iconColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card-elevated rounded-2xl overflow-hidden animate-fade-up">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1a1a1a] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${iconColor}15` }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: iconColor }} />
          </div>
          <span className="text-[13px] font-semibold text-white">{title}</span>
          {badge !== undefined && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
              style={{
                backgroundColor: `${iconColor}20`,
                color: iconColor,
              }}
            >
              {badge}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-neutral-600" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-neutral-600" />
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ── Priority Badge ────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    urgent: { bg: "bg-red-500/15", text: "text-red-400", label: "Urgent" },
    important: {
      bg: "bg-amber-500/15",
      text: "text-amber-400",
      label: "Important",
    },
    useful: {
      bg: "bg-blue-500/15",
      text: "text-blue-400",
      label: "Useful",
    },
  };
  const c = config[priority] || config.useful;
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// ── Score Ring (inline, small) ─────────────────────────────────────

function ScoreRing({
  score,
  color,
  size = 36,
}: {
  score: number;
  color: string;
  size?: number;
}) {
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

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
          strokeDashoffset={offset}
          className="ring-animated"
          style={
            {
              "--ring-circumference": circumference,
              filter: `drop-shadow(0 0 3px ${color}40)`,
            } as React.CSSProperties
          }
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-bold text-white tabular-nums"
          style={{ fontSize: size * 0.3 }}
        >
          {score}
        </span>
      </div>
    </div>
  );
}

// ── Category color helper ─────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  health: "#22c55e",
  finance: "#f59e0b",
  career: "#3b82f6",
  learning: "#8b5cf6",
  personal: "#ec4899",
  social: "#06b6d4",
};

// ── Main Component ────────────────────────────────────────────────

export function BriefView() {
  const { data: brief, updatedAt, loading } = useDashboardData<BriefData>("brief");

  if (loading) {
    return (
      <div className="h-full overflow-auto no-scrollbar p-5 space-y-3">
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-20 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-32 rounded-2xl" />
          <div className="skeleton h-32 rounded-2xl" />
        </div>
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="h-14 w-14 rounded-2xl bg-[#111] border border-[#1a1a1a] flex items-center justify-center mb-4">
          <Sparkles className="h-6 w-6 text-neutral-700" />
        </div>
        <p className="text-[14px] text-neutral-400 font-medium mb-1">
          No brief yet
        </p>
        <p className="text-[11px] text-neutral-600 max-w-[220px] text-center">
          Your daily brief will appear here when BACKBONE generates it each
          morning.
        </p>
      </div>
    );
  }

  const TimeIcon =
    brief.timeOfDay === "morning"
      ? Sun
      : brief.timeOfDay === "afternoon"
        ? CloudSun
        : Moon;

  const moodGradient =
    brief.mood === "positive"
      ? "from-emerald-500/8 via-transparent to-transparent"
      : brief.mood === "cautious"
        ? "from-amber-500/8 via-transparent to-transparent"
        : "from-blue-500/6 via-transparent to-transparent";

  const moodAccent =
    brief.mood === "positive"
      ? "#22c55e"
      : brief.mood === "cautious"
        ? "#f59e0b"
        : "#3b82f6";

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* ── Hero Header ─────────────────────────────────────── */}
      <div
        className={`px-5 pt-6 pb-5 bg-gradient-to-b ${moodGradient}`}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="h-8 w-8 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${moodAccent}15` }}
          >
            <TimeIcon
              className="h-4 w-4"
              style={{ color: moodAccent }}
            />
          </div>
          <div>
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium">
              {brief.dateStr}
            </p>
          </div>
          {updatedAt && (
            <span className="text-[9px] text-neutral-700 ml-auto">
              {formatFreshness(updatedAt)}
            </span>
          )}
        </div>
        <h1 className="text-[20px] font-bold text-white leading-tight">
          {brief.greeting}
        </h1>
        {brief.summary && (
          <p className="text-[12px] text-neutral-400 mt-2 leading-relaxed">
            {brief.summary}
          </p>
        )}
      </div>

      {/* ── Sections ────────────────────────────────────────── */}
      <div className="px-4 pb-8 space-y-3">
        {/* Action Items — always at the top if present */}
        {brief.actionItems && brief.actionItems.length > 0 && (
          <BriefSection
            title="Action Items"
            icon={Flame}
            iconColor="#ef4444"
            defaultOpen={true}
            badge={brief.actionItems.length}
          >
            <div className="space-y-2">
              {brief.actionItems.map((item, i) => (
                <div
                  key={i}
                  className="flex gap-3 p-2.5 rounded-xl bg-[#111] border border-[#1a1a1a] hover:border-[#2a2a2a] transition-colors"
                >
                  <div className="mt-0.5">
                    {item.priority === "urgent" ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-neutral-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[12px] text-white font-medium truncate">
                        {item.text}
                      </p>
                      <PriorityBadge priority={item.priority} />
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </BriefSection>
        )}

        {/* Health + Portfolio side by side on larger views */}
        {(brief.health || brief.portfolio) && (
          <div className="grid grid-cols-2 gap-3">
            {/* Health */}
            {brief.health && (
              <div className="card-elevated rounded-2xl p-4 animate-fade-up">
                <div className="flex items-center gap-2 mb-3">
                  <Heart className="h-3.5 w-3.5 text-violet-400" />
                  <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium">
                    Health
                  </span>
                </div>
                <div className="flex items-center justify-around">
                  {brief.health.sleep?.score && (
                    <div className="flex flex-col items-center gap-1">
                      <ScoreRing
                        score={brief.health.sleep.score}
                        color="#8b5cf6"
                      />
                      <span className="text-[8px] text-neutral-600">
                        Sleep
                      </span>
                    </div>
                  )}
                  {brief.health.readiness?.score && (
                    <div className="flex flex-col items-center gap-1">
                      <ScoreRing
                        score={brief.health.readiness.score}
                        color="#3b82f6"
                      />
                      <span className="text-[8px] text-neutral-600">
                        Ready
                      </span>
                    </div>
                  )}
                  {brief.health.activity?.score && (
                    <div className="flex flex-col items-center gap-1">
                      <ScoreRing
                        score={brief.health.activity.score}
                        color="#22c55e"
                      />
                      <span className="text-[8px] text-neutral-600">
                        Active
                      </span>
                    </div>
                  )}
                </div>
                {(brief.health.hrv || brief.health.rhr || brief.health.activity?.steps) && (
                  <div className="grid grid-cols-3 gap-1 mt-3 pt-2.5 border-t border-[#1a1a1a]">
                    <div className="text-center">
                      <p className="text-[12px] font-semibold text-white tabular-nums">
                        {brief.health.activity?.steps?.toLocaleString() || "--"}
                      </p>
                      <p className="text-[8px] text-neutral-600">Steps</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[12px] font-semibold text-white tabular-nums">
                        {brief.health.hrv || "--"}
                      </p>
                      <p className="text-[8px] text-neutral-600">HRV</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[12px] font-semibold text-white tabular-nums">
                        {brief.health.rhr || "--"}
                      </p>
                      <p className="text-[8px] text-neutral-600">RHR</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Portfolio */}
            {brief.portfolio && (
              <div className="card-elevated rounded-2xl overflow-hidden animate-fade-up">
                <div
                  className={`px-4 pt-4 pb-3 ${(brief.portfolio.dayPL || 0) >= 0 ? "gradient-card-green" : "gradient-card-red"}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="h-3.5 w-3.5 text-neutral-500" />
                    <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium">
                      Portfolio
                    </span>
                  </div>
                  {brief.portfolio.equity && (
                    <p className="text-[22px] font-bold text-white tracking-value tabular-nums leading-none">
                      {formatCurrency(brief.portfolio.equity)}
                    </p>
                  )}
                  {brief.portfolio.dayPL !== null && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <span
                        className={`text-[11px] font-semibold tabular-nums ${(brief.portfolio.dayPL || 0) >= 0 ? "text-green-400" : "text-red-400"}`}
                      >
                        {(brief.portfolio.dayPL || 0) >= 0 ? (
                          <ArrowUpRight className="h-3 w-3 inline" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 inline" />
                        )}
                        {formatCurrency(Math.abs(brief.portfolio.dayPL || 0))}
                      </span>
                    </div>
                  )}
                </div>
                {brief.portfolio.topPositions.length > 0 && (
                  <div className="px-4 py-2.5 space-y-1">
                    {brief.portfolio.topPositions.slice(0, 3).map((pos) => (
                      <div
                        key={pos.symbol}
                        className="flex items-center justify-between py-0.5"
                      >
                        <span className="text-[11px] font-semibold text-white">
                          {pos.symbol}
                        </span>
                        <span
                          className={`text-[10px] font-medium tabular-nums ${(pos.unrealizedPL || 0) >= 0 ? "text-green-400" : "text-red-400"}`}
                        >
                          {formatPercentage(pos.unrealizedPLPercent || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Calendar */}
        {brief.calendar && brief.calendar.length > 0 && (
          <BriefSection
            title="Today's Schedule"
            icon={Calendar}
            iconColor="#3b82f6"
            defaultOpen={true}
            badge={brief.calendar.length}
          >
            <div className="space-y-1.5">
              {brief.calendar.map((event, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-2 px-2.5 rounded-xl bg-[#111] border border-[#1a1a1a]"
                >
                  <div className="flex flex-col items-center min-w-[44px]">
                    <span className="text-[11px] font-semibold text-blue-400 tabular-nums">
                      {event.allDay ? "All day" : event.time}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-white font-medium truncate">
                      {event.title}
                    </p>
                    {event.location && (
                      <p className="text-[10px] text-neutral-600 truncate">
                        {event.location}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </BriefSection>
        )}

        {/* World Snapshot */}
        {brief.worldSnapshot && (
          <BriefSection
            title="World Snapshot"
            icon={Newspaper}
            iconColor="#f59e0b"
            defaultOpen={true}
          >
            {/* Market summary */}
            {brief.worldSnapshot.marketSummary && (
              <div className="mb-3 p-3 rounded-xl bg-[#111] border border-[#1a1a1a]">
                <div className="flex items-center gap-2 mb-2">
                  {brief.worldSnapshot.marketSummary.direction === "up" ? (
                    <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                  )}
                  <span className="text-[11px] font-medium text-white">
                    Markets{" "}
                    <span
                      className={`tabular-nums ${brief.worldSnapshot.marketSummary.avgChange >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      {brief.worldSnapshot.marketSummary.avgChange >= 0
                        ? "+"
                        : ""}
                      {brief.worldSnapshot.marketSummary.avgChange}%
                    </span>
                  </span>
                  <span className="text-[9px] text-neutral-600 ml-auto">
                    {brief.worldSnapshot.marketSummary.tickerCount} tickers
                  </span>
                </div>
                <div className="flex gap-4">
                  {brief.worldSnapshot.marketSummary.topGainers.length > 0 && (
                    <div className="flex-1">
                      <p className="text-[9px] text-neutral-600 mb-1">
                        Top Gainers
                      </p>
                      {brief.worldSnapshot.marketSummary.topGainers.map((t) => (
                        <div
                          key={t.symbol}
                          className="flex justify-between text-[10px] py-0.5"
                        >
                          <span className="text-white font-medium">
                            {t.symbol}
                          </span>
                          <span className="text-green-400 tabular-nums">
                            +{t.change}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {brief.worldSnapshot.marketSummary.topLosers.length > 0 && (
                    <div className="flex-1">
                      <p className="text-[9px] text-neutral-600 mb-1">
                        Top Losers
                      </p>
                      {brief.worldSnapshot.marketSummary.topLosers.map((t) => (
                        <div
                          key={t.symbol}
                          className="flex justify-between text-[10px] py-0.5"
                        >
                          <span className="text-white font-medium">
                            {t.symbol}
                          </span>
                          <span className="text-red-400 tabular-nums">
                            {t.change}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Headlines */}
            {brief.worldSnapshot.headlines.length > 0 && (
              <div className="space-y-1.5">
                {brief.worldSnapshot.headlines.map((h, i) => (
                  <div
                    key={i}
                    className="flex gap-2.5 py-1.5"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500/60 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-[11px] text-white leading-snug">
                        {h.title}
                      </p>
                      <p className="text-[9px] text-neutral-600 mt-0.5">
                        {h.source}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </BriefSection>
        )}

        {/* Goals */}
        {brief.goals && (
          <BriefSection
            title="Goals"
            icon={Target}
            iconColor="#3b82f6"
            defaultOpen={true}
            badge={`${brief.goals.avgProgress}%`}
          >
            {/* Recent milestones */}
            {brief.goals.recentMilestones &&
              brief.goals.recentMilestones.length > 0 && (
                <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="h-3 w-3 text-emerald-400" />
                    <span className="text-[10px] font-semibold text-emerald-400">
                      Recent Milestones
                    </span>
                  </div>
                  {brief.goals.recentMilestones.map((m, i) => (
                    <p key={i} className="text-[10px] text-emerald-300/80 py-0.5">
                      {m.milestone} — {m.goal}
                    </p>
                  ))}
                </div>
              )}

            <div className="space-y-2">
              {brief.goals.goals.map((goal, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        CATEGORY_COLORS[goal.category] || "#6b7280",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-white truncate">
                      {goal.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-16 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${goal.progress}%`,
                          backgroundColor:
                            CATEGORY_COLORS[goal.category] || "#6b7280",
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-neutral-500 tabular-nums w-7 text-right">
                      {goal.progress}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </BriefSection>
        )}

        {/* System Activity */}
        {brief.systemActivity && brief.systemActivity.length > 0 && (
          <BriefSection
            title="System Activity"
            icon={Bot}
            iconColor="#8b5cf6"
            defaultOpen={false}
          >
            <div className="space-y-2.5">
              {brief.systemActivity.map((item, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-medium text-white capitalize">
                      {item.source.replace(/-/g, " ")}
                    </span>
                    <span className="text-[9px] text-neutral-600">
                      {item.count} {item.count === 1 ? "task" : "tasks"}
                    </span>
                  </div>
                  {item.highlights.map((h, j) => (
                    <p key={j} className="text-[10px] text-neutral-400 pl-3 py-0.5">
                      {h}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </BriefSection>
        )}

        {/* Life Scores */}
        {brief.lifeScores && (
          <BriefSection
            title="Life Scores"
            icon={Activity}
            iconColor="#06b6d4"
            defaultOpen={false}
            badge={brief.lifeScores.overall}
          >
            <div className="space-y-2">
              {Object.entries(brief.lifeScores.categories || {}).map(
                ([cat, val]) => {
                  const score =
                    typeof val === "object" ? (val as any).score : val;
                  const trend =
                    typeof val === "object" ? (val as any).trend : null;
                  const color = CATEGORY_COLORS[cat] || "#6b7280";
                  return (
                    <div key={cat} className="flex items-center gap-2.5">
                      <span className="text-[10px] text-neutral-400 capitalize w-16">
                        {cat}
                      </span>
                      <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Number(score) || 0}%`,
                            backgroundColor: color,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-white font-semibold tabular-nums w-7 text-right">
                        {score || 0}
                      </span>
                      {trend && (
                        <span
                          className={`text-[9px] ${trend === "up" ? "text-green-400" : trend === "down" ? "text-red-400" : "text-neutral-600"}`}
                        >
                          {trend === "up" ? "+" : trend === "down" ? "-" : "~"}
                        </span>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          </BriefSection>
        )}

        {/* Trading Signals */}
        {brief.portfolio?.signals && brief.portfolio.signals.length > 0 && (
          <BriefSection
            title="Buy Signals"
            icon={Zap}
            iconColor="#22c55e"
            defaultOpen={false}
            badge={brief.portfolio.signals.length}
          >
            <div className="space-y-1.5">
              {brief.portfolio.signals.map((sig) => (
                <div
                  key={sig.symbol}
                  className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-[#111] border border-[#1a1a1a]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-white">
                      {sig.symbol}
                    </span>
                    <span className="text-[10px] text-neutral-500 tabular-nums">
                      ${sig.price?.toFixed(2)}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md tabular-nums ${
                      sig.score >= 70
                        ? "bg-green-500/15 text-green-400"
                        : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {sig.score}
                  </span>
                </div>
              ))}
            </div>
          </BriefSection>
        )}

        {/* Recent Trades */}
        {brief.portfolio?.recentTrades &&
          brief.portfolio.recentTrades.length > 0 && (
            <BriefSection
              title="Recent Trades"
              icon={Clock}
              iconColor="#ef4444"
              defaultOpen={false}
              badge={brief.portfolio.recentTrades.length}
            >
              <div className="space-y-1.5">
                {brief.portfolio.recentTrades.map((trade, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          trade.side?.toLowerCase() === "buy"
                            ? "bg-green-500/15 text-green-400"
                            : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {trade.side}
                      </span>
                      <span className="text-[11px] font-semibold text-white">
                        {trade.symbol}
                      </span>
                      <span className="text-[10px] text-neutral-600 tabular-nums">
                        {trade.qty}sh @ ${trade.price?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </BriefSection>
          )}
      </div>
    </div>
  );
}
