import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { getProgressResearch } from "../services/research/progress-research.js";
import { getROIDisplayData } from "../services/trading/roi-calculator.js";

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

// Trend indicators with background colors
const TREND_ICONS = { up: "\u2191", down: "\u2193", stable: "-" };
const TREND_COLORS = { up: "#22c55e", down: "#ef4444", stable: "#64748b" };
const TREND_BG_COLORS = { up: "#166534", down: "#991b1b", stable: null }; // Dark green/red backgrounds

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
 * │ User               Warren Buffett    │
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
  userGoals = [],
  privateMode = false
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

  // Get trend from research data (tracks over time)
  const trend = progressData?.user?.trend || "stable";
  const trendChange = progressData?.user?.trendChange || 0;
  const trendIcon = TREND_ICONS[trend] || "-";
  const trendColor = TREND_COLORS[trend] || "#64748b";
  const trendBgColor = TREND_BG_COLORS[trend] || null;

  // Display name - use actual name or "You" as last resort
  const displayName = firstName || "You";

  // Calculate a baseline score based on what we know
  // Show score if we have any data (goals or connected services)
  const effectiveProgress = overallProgress > 0 ? overallProgress : (hasData || hasGoals ? 0 : null);
  const showComparisons = !privateMode;
  const progressDisplay = privateMode ? "--" : (effectiveProgress !== null ? `${effectiveProgress}` : "--");

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

    // User row: Name · Score with trend badge
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      // Left side: User name · score · trend badge
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#e2e8f0", bold: true }, displayName),
        e(Text, { color: "#64748b" }, "·"),
        e(Text, { color: privateMode ? "#64748b" : getScoreColor(effectiveProgress || 0), bold: true }, progressDisplay),
        // Trend badge with colored background (only if not stable and not private)
        !privateMode && effectiveProgress !== null && trend !== "stable" && e(
          Text,
          {
            color: "#ffffff",
            backgroundColor: trendBgColor,
            bold: true
          },
          ` ${trendIcon}${Math.abs(trendChange) > 0 ? Math.abs(trendChange) : ""} `
        )
      ),
      // Right side: Target name · score
      showComparisons && e(
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
      e(ScoreBar, { score: privateMode ? 0 : (effectiveProgress || 0), width: 12, color: privateMode ? "#374151" : (effectiveProgress ? getScoreColor(effectiveProgress) : "#374151") }),
      showComparisons && e(ScoreBar, { score: topFigure.score, width: 12, color: "#22c55e" })
    ),

    // Average Person row (lighter text)
    showComparisons && e(
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
 * 6-month ROI projection with monetary and time savings
 */
export const ParallelWorldPanel = ({ data, weeksUsing = 0 }) => {
  // Get ROI projection data
  const roiData = useMemo(() => {
    try {
      return getROIDisplayData();
    } catch (e) {
      return null;
    }
  }, []);

  const daysUsing = roiData?.daysUsing || Math.round(weeksUsing * 7);
  const currentScore = roiData?.currentScore || 0;
  const projectedScore = roiData?.projectedScore || 0;
  const projectedGain = roiData?.projectedGain || 0;

  // Build 6-month timeline
  const withSystem = roiData?.withSystemLine || [];
  const withoutSystem = roiData?.withoutSystemLine || [];

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
      e(Text, { color: "#f59e0b", bold: true }, "6-Month ROI Projection"),
      e(Text, { color: "#475569" }, `Day ${daysUsing}`)
    ),

    // Current vs Projected
    e(
      Box,
      { flexDirection: "row", marginBottom: 1 },
      e(Text, { color: "#64748b" }, "Now: "),
      e(Text, { color: "#e2e8f0", bold: true }, `${currentScore}%`),
      e(Text, { color: "#64748b" }, "  →  6mo: "),
      e(Text, { color: "#22c55e", bold: true }, `${projectedScore}%`),
      projectedGain > 0 && e(
        Text,
        { color: "#ffffff", backgroundColor: "#166534", bold: true },
        ` +${projectedGain}% `
      )
    ),

    // Timeline visualization (simple text chart)
    e(Text, { color: "#334155" }, "─".repeat(32)),
    e(
      Box,
      { flexDirection: "row", marginTop: 1 },
      e(Text, { color: "#64748b", width: 8 }, "Month"),
      e(Text, { color: "#22c55e", width: 10 }, "With"),
      e(Text, { color: "#ef4444", width: 10 }, "Without"),
      e(Text, { color: "#3b82f6", width: 8 }, "Gain")
    ),

    // Month rows (0, 3, 6)
    ...[0, 3, 6].map(m => {
      const withVal = withSystem[m]?.score || currentScore;
      const withoutVal = withoutSystem[m]?.score || currentScore;
      const gain = Math.round((withVal - withoutVal) * 10) / 10;
      return e(
        Box,
        { key: m, flexDirection: "row" },
        e(Text, { color: "#475569", width: 8 }, m === 0 ? "Now" : `${m}mo`),
        e(Text, { color: "#22c55e", width: 10 }, `${withVal}%`),
        e(Text, { color: "#ef4444", width: 10 }, `${withoutVal}%`),
        e(
          Text,
          {
            color: gain > 0 ? "#22c55e" : "#64748b",
            bold: gain > 5,
            width: 8
          },
          gain > 0 ? `+${gain}%` : "-"
        )
      );
    }),

    // Value metrics
    e(Text, { color: "#334155", marginTop: 1 }, "─".repeat(32)),
    roiData?.monetaryGain && e(
      Box,
      { flexDirection: "row", marginTop: 1 },
      e(Text, { color: "#64748b" }, "Potential Savings: "),
      e(Text, { color: "#eab308", bold: true }, roiData.monetaryGain)
    ),
    roiData?.timeSaved && e(
      Box,
      { flexDirection: "row" },
      e(Text, { color: "#64748b" }, "Time Reclaimed: "),
      e(Text, { color: "#3b82f6", bold: true }, roiData.timeSaved)
    ),

    // Summary
    e(
      Box,
      { marginTop: 1 },
      e(
        Text,
        { color: "#64748b", dimColor: true },
        roiData?.summary || "Progress compounds over time."
      )
    )
  );
};

export default LifeScoresPanel;
