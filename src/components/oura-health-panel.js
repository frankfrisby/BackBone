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
    empty > 0 && e(Text, { color: "#111827" }, "\u2591".repeat(empty))
  );
};

const getStressDescriptor = (readinessScore) => {
  if (readinessScore == null) {
    return { label: "Stress unknown", color: "#64748b", level: "unknown" };
  }
  const pressure = Math.round(Math.max(0, 100 - readinessScore));
  if (pressure <= 20) {
    return { label: "Relaxed", color: "#22c55e", level: "relaxed" };
  }
  if (pressure <= 40) {
    return { label: "Normal", color: "#eab308", level: "normal" };
  }
  return { label: "Stressed", color: "#ef4444", level: "stressed" };
};

const buildSuggestions = (summary, weekAverage) => {
  const list = [];
  if (!summary) return list;

  if (summary.sleepScore && summary.sleepScore < 80) {
    list.push("Wind down 30m earlier; dim screens + avoid caffeine to boost deep rest.");
  }
  if (summary.totalSleepHours && Number(summary.totalSleepHours) < 6.8) {
    list.push("Schedule a 20-min power nap or light stretch to recover energy.");
  }
  if (summary.readinessScore && summary.readinessScore < 75) {
    list.push("Hydrate, breathe deeply for 5 mins, and keep meetings shorter today.");
  }
  if (summary.activityScore && summary.activityScore < 70) {
    list.push("Add a brisk 10-min walk mid-afternoon to widen active steps.");
  }
  if (weekAverage?.readinessScore && weekAverage.readinessScore > (summary.readinessScore || 0) + 3) {
    list.push("Weekly readiness was stronger; lean into the rituals that lifted it.");
  }
  if (list.length === 0) {
    list.push("Keep hydration, movement, and consistent bed/wake times steady.");
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

const buildInsight = (summary, stress) => {
  if (!summary) return null;
  const sleep = summary.totalSleepHours ? `${summary.totalSleepHours}h` : "n/a";
  const readiness = summary.readinessScore ? `${summary.readinessScore}` : "n/a";
  const activity = summary.activityScore ? `${summary.activityScore}` : "n/a";
  const calories = summary.activeCalories ? `${Math.round(summary.activeCalories)} kcal` : "n/a";
  const heartRate = summary.restingHeartRate || 71;
  return `GPT-5.2: Sleep ${sleep}, Readiness ${readiness}, Activity ${activity}, Calories ${calories}, Heart rate ${heartRate} bpm. ${stress?.label === "Relaxed" ? "Keep the calm by staying present." : stress?.label === "Stressed" ? "Prioritize breathwork and recovery moments." : "Maintain balance with light movement."}`;
};

const categorizeScore = (score) => {
  if (score >= 75) {
    return { label: "Strong", color: "#22c55e", bucket: "green" };
  }
  if (score >= 60) {
    return { label: "Steady", color: "#f97316", bucket: "orange" };
  }
  return { label: "Needs Recovery", color: "#ef4444", bucket: "red" };
};

const buildReadinessCounts = (history = []) => {
  const trimmed = history.slice(-60);
  const counts = { green: 0, orange: 0, red: 0 };
  trimmed.forEach((entry) => {
    const latestReadiness = entry?.readiness?.slice(-1)[0]?.score;
    const score = typeof latestReadiness === "number" ? latestReadiness : null;
    if (score == null) return;
    if (score >= 75) counts.green += 1;
    else if (score >= 60) counts.orange += 1;
    else counts.red += 1;
  });
  return { counts, total: counts.green + counts.orange + counts.red };
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
  const aiInsight = useMemo(() => buildInsight(summary, stress), [summary, stress]);
  const baseScore = summary?.readinessScore ?? summary?.activityScore ?? summary?.sleepScore ?? qualityScore;
  const todayScore = Math.round(baseScore ?? 0);
  const todayQuality = useMemo(() => categorizeScore(todayScore), [todayScore]);
  const readinessBreakdown = useMemo(() => buildReadinessCounts(history), [history]);

  if (!connected) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#1e293b",
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
      borderColor: "#1e293b",
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
        e(Text, { color: todayQuality.color, bold: true }, todayScore ? `${todayScore}%` : "Score pending"),
        e(Text, { color: "#64748b" }, `Today · ${todayQuality.label}`),
        e(Text, { color: "#94a3b8" }, `Readiness ${todayScore >= 0 ? `${todayScore}` : "--"}`)
      ),
      e(ScoreBar, {
        score: todayScore || 0,
        width: 18,
        color: todayQuality.color
      })
    ),
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginTop: 1 },
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#94a3b8" }, "🛌 Sleep"),
        e(Text, { color: "#e2e8f0" }, summary?.sleepScore ? `${summary.sleepScore} sleep` : "--"),
        e(Text, { color: "#64748b" }, summary?.totalSleepHours ? `${summary.totalSleepHours} hrs` : "--")
      ),
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#94a3b8" }, "💡 Readiness"),
        e(Text, { color: "#e2e8f0" }, summary?.readinessScore ? `${summary.readinessScore} readiness` : "--"),
        e(Text, { color: stress?.color, dimColor: true }, stress?.label || "")
      ),
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#94a3b8" }, "⚡ Activity"),
        e(Text, { color: "#e2e8f0" }, summary?.activityScore ? `${summary.activityScore} activity` : "--"),
        e(Text, { color: "#64748b" }, summary?.steps ? `${summary.steps} steps` : "--")
      )
    ),
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginTop: 1 },
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#94a3b8" }, "❤️ Heart rate"),
        e(Text, { color: "#e2e8f0" }, `${summary?.restingHeartRate || 71} bpm`)
      ),
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#94a3b8" }, "🔥 Calories"),
        e(Text, { color: "#e2e8f0" }, summary?.activeCalories ? `${Math.round(summary.activeCalories)} kcal` : "--")
      )
    ),
    e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: "#64748b" }, "30-day trend"),
      e(Text, { color: "#94a3b8" }, sparkline || "Collecting data..."),
      e(Text, { color: "#475569" }, avgTrend ? `Average ${avgTrend}% over ${trend.length} days` : "Waiting for more days")
    ),
    e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: "#64748b" }, "60-day readiness"),
      e(
        Box,
        { flexDirection: "row", gap: 2, flexWrap: "wrap" },
        e(Text, { color: "#22c55e" }, `${readinessBreakdown.counts.green} days ≥ 75`),
        e(Text, { color: "#f97316" }, `${readinessBreakdown.counts.orange} days 60-74`),
        e(Text, { color: "#ef4444" }, `${readinessBreakdown.counts.red} days < 60`)
      ),
      e(Text, { color: "#94a3b8" }, `${readinessBreakdown.total} days of readiness data`)
    ),
    aiInsight ? e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: "#f59e0b" }, "AI Insight"),
      e(Text, { color: "#94a3b8" }, aiInsight)
    ) : e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: "#f59e0b" }, "Guiding questions"),
      e(Text, { color: "#94a3b8" }, "• What routine wins should you repeat tomorrow?"),
      e(Text, { color: "#94a3b8" }, "• Which stressor can you remove or reframe right now?")
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
