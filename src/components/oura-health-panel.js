import React, { useMemo } from "react";
import { Box, Text } from "ink";

const e = React.createElement;

const formatDateTime = (value) => {
  if (!value) return "--";
  const when = new Date(value);
  if (isNaN(when)) return "--";
  return when.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
};

const ScoreBar = ({ score = 0, width = 12, color = "#22c55e" }) => {
  const safeScore = Math.max(0, Math.min(100, score));
  const filled = Math.round((safeScore / 100) * width);
  const empty = Math.max(0, width - filled);

  return e(
    Box,
    { flexDirection: "row", width },
    filled > 0 && e(Text, { color }, "\u2588".repeat(filled)),
    empty > 0 && e(Text, { color: "#1e293b" }, "\u2591".repeat(empty))
  );
};

const getStressDescriptor = (readinessScore) => {
  if (readinessScore == null) {
    return { label: "Stress unknown", color: "#64748b" };
  }
  const pressure = Math.round(Math.max(0, 100 - readinessScore));
  if (pressure <= 20) {
    return { label: `Low stress (${pressure})`, color: "#22c55e" };
  }
  if (pressure <= 40) {
    return { label: `Manageable stress (${pressure})`, color: "#eab308" };
  }
  return { label: `High stress (${pressure})`, color: "#ef4444" };
};

const buildSuggestions = (summary, weekAverage) => {
  const list = [];
  if (!summary) return list;

  if (summary.sleepScore && summary.sleepScore < 80) {
    list.push("Wind down 30m earlier; dim screens + avoid caffeine to boost deep sleep.");
  }
  if (summary.totalSleepHours && Number(summary.totalSleepHours) < 6.8) {
    list.push("Schedule a 20-min power nap or light stretch to fill the sleep debt.");
  }
  if (summary.readinessScore && summary.readinessScore < 75) {
    list.push("Hydrate, breathe deeply for 5 mins, and keep meetings short to protect recovery.");
  }
  if (summary.activityScore && summary.activityScore < 70) {
    list.push("Add a brisk 10-min walk mid-afternoon to widen your active steps.");
  }
  if (weekAverage?.readinessScore && weekAverage.readinessScore > (summary.readinessScore || 0) + 3) {
    list.push("Current readiness is below your weekly average; lean into your proven habits.");
  }
  if (list.length === 0) {
    list.push("Keep consistent hydration, movement, and bed/wake routine.");
  }

  return list.slice(0, 3);
};

const getQualityScore = (summary, weekAverage) => {
  const todayScores = [
    summary?.sleepScore,
    summary?.readinessScore,
    summary?.activityScore
  ].filter(Boolean);
  const weekly = [
    weekAverage?.sleepScore,
    weekAverage?.readinessScore,
    weekAverage?.activityScore
  ].filter(Boolean);

  const combined = todayScores.length ? todayScores : weekly;
  if (!combined.length) return null;
  return Math.round(combined.reduce((sum, v) => sum + v, 0) / combined.length);
};

const buildTrendHistory = (history = []) => {
  const reduced = history
    .map((entry) => {
      const latestSleep = entry?.sleep?.slice(-1)[0];
      const latestReadiness = entry?.readiness?.slice(-1)[0];
      const latestActivity = entry?.activity?.slice(-1)[0];
      const entryScores = [
        latestSleep?.score,
        latestReadiness?.score,
        latestActivity?.score
      ].filter(Boolean);
      const score = entryScores.length
        ? Math.round(entryScores.reduce((sum, value) => sum + value, 0) / entryScores.length)
        : null;
      return {
        ...entry,
        computedScore: score,
        label: entry.savedAt || entry.fetchedAt || entry.lastUpdated
      };
    })
    .filter((entry) => entry.computedScore != null)
    .slice(-60)
    .reverse();
  return reduced;
};

const toSparkline = (scores, width = 28) => {
  if (!scores.length) return "";
  const sparkChars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const start = Math.max(0, scores.length - width);
  const slice = scores.slice(start);
  return slice
    .map((value) => {
      const next = Math.max(0, Math.min(100, value));
      const index = Math.floor((next / 100) * (sparkChars.length - 1));
      return sparkChars[index];
    })
    .join("");
};

const OuraHealthPanel = ({ data, history = [] }) => {
  const connected = data?.connected;
  const summary = data?.today;
  const qualityScore = useMemo(() => getQualityScore(summary, data?.weekAverage), [summary, data?.weekAverage]);
  const stress = useMemo(() => getStressDescriptor(summary?.readinessScore), [summary]);
  const suggestions = useMemo(() => buildSuggestions(summary, data?.weekAverage), [summary, data?.weekAverage]);
  const trend = useMemo(() => buildTrendHistory(history), [history]);
  const sparkline = useMemo(() => toSparkline(trend.map((entry) => entry.computedScore || 0)), [trend]);
  const avgTrend = useMemo(() => {
    if (!trend.length) return null;
    const total = trend.reduce((sum, entry) => sum + (entry.computedScore || 0), 0);
    return Math.round(total / trend.length);
  }, [trend]);

  if (!connected) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#0f172a",
        padding: 1,
        marginBottom: 1
      },
      e(Text, { color: "#64748b" }, "Oura Ring not connected"),
      e(Text, { color: "#475569" }, "Type /oura or run Setup to add your data.")
    );
  }

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#0f172a",
      padding: 1,
      marginBottom: 1
    },
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#f97316", bold: true }, "Oura Health"),
      e(Text, { color: "#475569" }, `Last checked ${formatDateTime(data?.lastUpdated)}`)
    ),
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: qualityScore >= 85 ? "#22c55e" : qualityScore >= 70 ? "#eab308" : "#ef4444", bold: true }, qualityScore ? `${qualityScore}%` : "Score pending"),
        e(Text, { color: "#64748b" }, "Composite of sleep · readiness · activity")
      ),
      e(ScoreBar, {
        score: qualityScore || 0,
        width: 18,
        color: qualityScore >= 85 ? "#22c55e" : qualityScore >= 70 ? "#eab308" : "#ef4444"
      })
    ),
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginTop: 1 },
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#94a3b8" }, "Sleep"),
        e(Text, { color: "#e2e8f0" }, summary?.sleepScore ? `${summary.sleepScore} score` : "--"),
        e(Text, { color: "#64748b" }, summary?.totalSleepHours ? `${summary.totalSleepHours} hrs` : "--")
      ),
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#94a3b8" }, "Readiness"),
        e(Text, { color: "#e2e8f0" }, summary?.readinessScore ? `${summary.readinessScore} score` : "--"),
        e(Text, { color: stress?.color, dimColor: true }, stress?.label || "")
      ),
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#94a3b8" }, "Activity"),
        e(Text, { color: "#e2e8f0" }, summary?.activityScore ? `${summary.activityScore} score` : "--"),
        e(Text, { color: "#64748b" }, summary?.steps ? `${summary.steps} steps` : "--")
      )
    ),
    e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: "#64748b" }, "30-day trend"),
      e(Text, { color: "#94a3b8" }, sparkline || "Collecting data..."),
      e(Text, { color: "#475569" }, avgTrend ? `Average ${avgTrend}% over ${trend.length} days` : "Waiting for more data")
    ),
    e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: "#64748b" }, "Actions"),
      ...suggestions.map((item, index) =>
        e(Text, { key: `${item}-${index}`, color: "#94a3b8" }, `• ${item}`)
      )
    )
  );
};

export default OuraHealthPanel;
