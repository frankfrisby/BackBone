import React from "react";
import { Box, Text } from "ink";

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
    empty > 0 && e(Text, { color: "#4a5568" }, "\u2591".repeat(empty))
  );
};

/**
 * Progress Panel (formerly Life Scores)
 * Shows tracking metrics with comparison benchmarks
 */
export const LifeScoresPanel = ({ data, title = "Progress", compact = false, comparisons = null }) => {
  const hasData = data?.categories?.some(c => c.score > 0) || data?.overall > 0;

  // If no data, show encouraging default message
  if (!hasData) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#1e293b",
        padding: 1,
        height: 6
      },
      e(Text, { color: "#64748b" }, title),
      e(Text, { color: "#64748b" }, "Connect services to track")
    );
  }

  const categories = data?.categories || [];
  const overall = data?.overall || 0;
  const overallGrade = data?.overallGrade || "--";
  const trend = data?.trend || "stable";

  const trendIcon = TREND_ICONS[trend] || "-";
  const trendColor = TREND_COLORS[trend] || "#64748b";

  // Overall score color
  let scoreColor = "#22c55e";
  if (overall < 50) scoreColor = "#ef4444";
  else if (overall < 70) scoreColor = "#eab308";

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#1e293b",
      padding: 1,
      height: compact ? 8 : 12,
      overflow: "hidden"
    },
    // Header with overall score
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#64748b" }, title),
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: scoreColor, bold: true }, `${overall}`),
        e(Text, { color: "#475569" }, overallGrade),
        e(Text, { color: trendColor }, trendIcon)
      )
    ),
    // Main tracking metrics
    e(
      Box,
      { flexDirection: "column" },
      ...categories.slice(0, compact ? 3 : 4).map((cat, i) => {
        const color = CATEGORY_COLORS[cat.category] || "#64748b";
        const icon = cat.icon || CATEGORY_ICONS[cat.category] || "\u25CF";
        const label = (cat.category || "score").charAt(0).toUpperCase() + (cat.category || "score").slice(1);

        return e(
          Box,
          { key: cat.category || i, flexDirection: "row", justifyContent: "space-between" },
          // Left: icon + label
          e(
            Box,
            { flexDirection: "row", width: 10 },
            e(Text, { color }, icon + " "),
            e(Text, { color: "#94a3b8" }, label.slice(0, 7).padEnd(7))
          ),
          // Center: score bar
          e(ScoreBar, { score: cat.score || 0, width: 10, color }),
          // Right: score value
          e(Text, { color: "#475569" }, `${String(cat.score || 0).padStart(3)}%`)
        );
      })
    ),
    // Comparison section (if provided)
    comparisons && comparisons.length > 0 && e(
      Box,
      { flexDirection: "column", marginTop: 1, borderTopColor: "#334155", borderTop: true, paddingTop: 1 },
      e(Text, { color: "#64748b", dimColor: true }, "vs Benchmarks"),
      ...comparisons.slice(0, 4).map((comp, i) => e(
        Box,
        { key: comp.label || i, flexDirection: "row", justifyContent: "space-between" },
        e(Text, { color: "#64748b" }, comp.label.slice(0, 18)),
        e(Text, { color: comp.ahead ? "#22c55e" : "#ef4444" }, comp.ahead ? `+${comp.diff}%` : `${comp.diff}%`)
      ))
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
      borderColor: "#1e293b",
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
