import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { getProgressResearch } from "../services/progress-research.js";

const e = React.createElement;

// Category colors
const CATEGORY_COLORS = {
  finance: "#eab308",
  health: "#22c55e",
  family: "#ec4899",
  career: "#8b5cf6",
  growth: "#3b82f6",
  education: "#06b6d4"
};

// Category icons
const CATEGORY_ICONS = {
  finance: "$",
  health: "+",
  family: "*",
  career: "^",
  growth: ">",
  education: "~"
};

// Trend indicators
const TREND_ICONS = { up: "\u2191", down: "\u2193", stable: "-" };
const TREND_COLORS = { up: "#22c55e", down: "#ef4444", stable: "#64748b" };

/**
 * Standard Score Bar - ████░░░░ style
 */
const ScoreBar = ({ score = 0, width = 10, color = "#22c55e" }) => {
  const safeScore = Math.max(0, Math.min(100, score));
  const filled = Math.round((safeScore / 100) * width);
  const empty = width - filled;

  return e(
    Box,
    { flexDirection: "row" },
    filled > 0 && e(Text, { color }, "\u2588".repeat(filled)),
    empty > 0 && e(Text, { color: "#6b7280" }, "\u2591".repeat(empty))
  );
};

/**
 * Progress Panel (formerly Life Scores)
 * Shows tracking metrics with comparison benchmarks
 *
 * New layout:
 * ┌──────────────────────────────────────┐
 * │ Frank              Warren Buffett    │
 * │ 72                              98   │
 * │ ████████░░░░       ██████████████░░  │
 * └──────────────────────────────────────┘
 */
export const LifeScoresPanel = ({
  data,
  title = "Progress",
  compact = false,
  comparisons = null,
  userName = null,
  userGoals = []
}) => {
  // Get real progress data from research service
  const progressData = useMemo(() => {
    try {
      const research = getProgressResearch();
      return research.getProgressComparison();
    } catch (e) {
      return null;
    }
  }, []);

  // User's actual progress from their goals and connected data
  const overallProgress = progressData?.user?.score || 0;
  const hasGoals = progressData?.user?.hasGoals || false;
  const hasData = progressData?.user?.hasData || false;

  // Empirical average person score (research-backed)
  const avgPersonScore = progressData?.avgPerson?.score || 27;

  // Aspirational figure based on user's primary goal
  const topFigure = progressData?.aspiration || { name: "Warren Buffett", score: 99 };

  // Get user's first name
  const firstName = userName?.split(" ")[0] || null;

  // If no goals set, show setup message
  if (!hasGoals && !firstName) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#0f172a",
        padding: 1,
        height: 6
      },
      e(Text, { color: "#64748b" }, "Progress"),
      e(
        Box,
        { flexDirection: "row" },
        e(Text, { color: "#475569" }, "Type "),
        e(Text, { color: "#94a3b8", bold: true }, "/Goals"),
        e(Text, { color: "#475569" }, " to set goals")
      )
    );
  }

  // Score color based on value
  const getScoreColor = (score) => {
    if (score >= 80) return "#22c55e";
    if (score >= 60) return "#eab308";
    if (score >= 40) return "#f97316";
    return "#ef4444";
  };

  const trend = data?.trend || "stable";
  const trendIcon = TREND_ICONS[trend] || "-";
  const trendColor = TREND_COLORS[trend] || "#64748b";

  // Display name - use actual name or "You" as last resort
  const displayName = firstName || "You";

  // Calculate a baseline score based on what we know
  // Show score if we have any data (goals or connected services)
  const effectiveProgress = overallProgress > 0 ? overallProgress : (hasData || hasGoals ? 0 : null);

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#0f172a",
      padding: 1,
      height: compact ? 9 : 11,
      overflow: "hidden"
    },
    // Section header
    e(
      Box,
      { marginBottom: 1 },
      e(Text, { color: "#64748b" }, "Progress")
    ),

    // User row: Name · Score
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      // Left side: User name · score
      e(
        Box,
        { flexDirection: "row" },
        e(Text, { color: "#e2e8f0", bold: true }, displayName),
        e(Text, { color: "#64748b" }, " · "),
        effectiveProgress !== null
          ? e(Text, { color: getScoreColor(effectiveProgress), bold: true }, `${effectiveProgress}`)
          : e(Text, { color: "#475569" }, "--"),
        effectiveProgress !== null && e(Text, { color: trendColor }, ` ${trendIcon}`)
      ),
      // Right side: Target name · score
      e(
        Box,
        { flexDirection: "row" },
        e(Text, { color: "#22c55e" }, topFigure.name),
        e(Text, { color: "#64748b" }, " · "),
        e(Text, { color: "#22c55e", bold: true }, `${topFigure.score}`)
      )
    ),

    // Progress bars row
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", gap: 2, marginTop: 1 },
      e(ScoreBar, { score: effectiveProgress || 0, width: 12, color: effectiveProgress ? getScoreColor(effectiveProgress) : "#374151" }),
      e(ScoreBar, { score: topFigure.score, width: 12, color: "#22c55e" })
    ),

    // Average Person row (lighter text)
    e(
      Box,
      { flexDirection: "row", justifyContent: "center", marginTop: 1 },
      e(Text, { color: "#374151" }, "Average Person"),
      e(Text, { color: "#374151" }, " · "),
      e(Text, { color: "#374151" }, `${avgPersonScore}`),
      e(Text, { color: "#374151" }, "  "),
      e(ScoreBar, { score: avgPersonScore, width: 6, color: "#1e293b" })
    )
  );
};

/**
 * Overall Score Display - Big number
 */
export const OverallScoreDisplay = ({ score, grade, trend }) => {
  const trendIcon = TREND_ICONS[trend] || "-";
  const trendColor = TREND_COLORS[trend] || "#64748b";

  let scoreColor = "#22c55e";
  if (score < 50) scoreColor = "#ef4444";
  else if (score < 70) scoreColor = "#eab308";

  return e(
    Box,
    { flexDirection: "row", gap: 2 },
    e(Text, { color: scoreColor, bold: true }, `${score}`),
    e(Text, { color: "#64748b" }, grade),
    e(Text, { color: trendColor }, trendIcon)
  );
};

/**
 * Parallel World Comparison - Shows life trajectory with vs without optimization
 * Illustrates the compounding effect of daily optimizations
 */
export const ParallelWorldPanel = ({ data, weeksUsing = 0 }) => {
  // Calculate projected gains based on consistent optimization
  const categories = data?.categories || [];

  // Base improvement rates per week (compounding)
  const IMPROVEMENT_RATES = {
    finance: 1.5, // 1.5% weekly improvement (compound to 100%+ over year)
    health: 2.0,  // 2% weekly improvement
    career: 1.2,  // 1.2% weekly improvement
    family: 1.0,  // 1% weekly improvement
    growth: 2.5,  // 2.5% weekly improvement (fastest with AI assistance)
    education: 1.8 // 1.8% weekly improvement
  };

  // Calculate projected scores for parallel worlds
  const projections = categories.map(cat => {
    const baseScore = cat.score || 0;
    const weeklyRate = IMPROVEMENT_RATES[cat.category] || 1.0;

    // Without BACKBONE: slight decline (-0.2% per week due to entropy)
    const withoutBB = Math.max(0, baseScore - (weeksUsing * 0.2));

    // With BACKBONE: compound improvement
    const withBB = Math.min(100, baseScore + (weeksUsing * weeklyRate));

    // Difference
    const diff = withBB - withoutBB;

    return {
      category: cat.category,
      without: Math.round(withoutBB),
      with: Math.round(withBB),
      diff: Math.round(diff),
      color: CATEGORY_COLORS[cat.category] || "#64748b"
    };
  });

  // Calculate overall difference
  const totalWithout = projections.reduce((sum, p) => sum + p.without, 0) / (projections.length || 1);
  const totalWith = projections.reduce((sum, p) => sum + p.with, 0) / (projections.length || 1);
  const overallDiff = Math.round(totalWith - totalWithout);

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#0f172a",
      padding: 1
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#f59e0b", bold: true }, "Parallel Worlds"),
      e(Text, { color: "#475569" }, `Week ${weeksUsing}`)
    ),

    // Column headers
    e(
      Box,
      { flexDirection: "row", marginBottom: 1 },
      e(Text, { color: "#475569", width: 9 }, ""),
      e(Text, { color: "#ef4444", width: 8 }, "Without"),
      e(Text, { color: "#22c55e", width: 8 }, "With"),
      e(Text, { color: "#3b82f6", width: 6 }, "Gain")
    ),

    // Category rows
    ...projections.slice(0, 6).map((proj, i) => {
      const label = proj.category.charAt(0).toUpperCase() + proj.category.slice(1);
      return e(
        Box,
        { key: proj.category || i, flexDirection: "row" },
        e(Text, { color: proj.color, width: 9 }, label.slice(0, 8)),
        e(Text, { color: "#ef4444", width: 8 }, `${proj.without}%`),
        e(Text, { color: "#22c55e", width: 8 }, `${proj.with}%`),
        e(Text, { color: "#3b82f6", bold: true, width: 6 }, `+${proj.diff}%`)
      );
    }),

    // Overall summary
    e(
      Box,
      { marginTop: 1, borderTopColor: "#334155" },
      e(Text, { color: "#334155" }, "─".repeat(28))
    ),
    e(
      Box,
      { flexDirection: "row", marginTop: 1 },
      e(Text, { color: "#94a3b8", bold: true, width: 9 }, "TOTAL"),
      e(Text, { color: "#ef4444", width: 8 }, `${Math.round(totalWithout)}%`),
      e(Text, { color: "#22c55e", width: 8 }, `${Math.round(totalWith)}%`),
      e(Text, { color: "#f59e0b", bold: true, width: 6 }, `+${overallDiff}%`)
    ),

    // Motivation message
    e(
      Box,
      { marginTop: 1 },
      e(
        Text,
        { color: "#64748b", dimColor: true },
        overallDiff > 50
          ? "You're building a better future."
          : overallDiff > 20
            ? "Progress compounds daily."
            : "Every day of optimization counts."
      )
    )
  );
};

export default LifeScoresPanel;
