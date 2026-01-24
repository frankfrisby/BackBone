import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { getAIStatus, getMultiAIConfig } from "../services/multi-ai.js";

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
    empty > 0 && e(Text, { color: "#4b5563" }, "\u2591".repeat(empty))
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

const OuraHealthPanel = ({ data, history = [], aiResponse = null }) => {
  const connected = data?.connected;
  const summary = data?.today;
  const qualityScore = useMemo(() => getQualityScore(summary, data?.weekAverage), [summary, data?.weekAverage]);
  const stress = useMemo(() => getStressDescriptor(summary?.readinessScore), [summary]);

  // Check if model is available
  const modelStatus = useMemo(() => {
    const config = getMultiAIConfig();
    const aiStatus = getAIStatus();

    const hasOpenAI = config.gptInstant?.ready || config.gptThinking?.ready;
    const hasClaude = config.claude?.ready;
    const hasModel = hasOpenAI || hasClaude;

    const openaiExceeded = aiStatus.gptInstant?.quotaExceeded || aiStatus.gptThinking?.quotaExceeded;
    const claudeExceeded = aiStatus.claude?.quotaExceeded;
    const tokensExceeded = (hasOpenAI && openaiExceeded) || (hasClaude && claudeExceeded && !hasOpenAI);

    return { hasModel, tokensExceeded, isReady: hasModel && !tokensExceeded };
  }, []);

  const baseScore = summary?.readinessScore ?? summary?.activityScore ?? summary?.sleepScore ?? qualityScore;
  const todayScore = Math.round(baseScore ?? 0);
  const todayQuality = useMemo(() => categorizeScore(todayScore), [todayScore]);

  if (!connected) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#1e293b",
        paddingX: 1,
        paddingY: 0
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
      paddingX: 1,
      paddingTop: 0,
      paddingBottom: 0
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#f97316", bold: true }, "Health"),
      e(Text, { color: "#475569" }, `${formatDateTime(data?.lastUpdated)}`)
    ),

    // Today's overall score
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: todayQuality.color, bold: true }, todayScore ? `${todayScore}%` : "--"),
        e(Text, { color: "#64748b" }, `${todayQuality.label}`)
      ),
      e(ScoreBar, {
        score: todayScore || 0,
        width: 18,
        color: todayQuality.color
      })
    ),

    // Three main scores
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginTop: 1 },
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#94a3b8" }, "Sleep"),
        e(Text, { color: "#e2e8f0" }, summary?.sleepScore ? `${summary.sleepScore}` : "--"),
        e(Text, { color: "#64748b", dimColor: true }, summary?.totalSleepHours ? `${summary.totalSleepHours}h` : "")
      ),
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#94a3b8" }, "Ready"),
        e(Text, { color: "#e2e8f0" }, summary?.readinessScore ? `${summary.readinessScore}` : "--"),
        e(Text, { color: stress?.color, dimColor: true }, stress?.label || "")
      ),
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#94a3b8" }, "Active"),
        e(Text, { color: "#e2e8f0" }, summary?.activityScore ? `${summary.activityScore}` : "--"),
        e(Text, { color: "#64748b", dimColor: true }, summary?.steps ? `${summary.steps}` : "")
      ),
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#94a3b8" }, "Calories"),
        e(Text, { color: "#e2e8f0" }, summary?.activeCalories ? `${Math.round(summary.activeCalories)}` : "--"),
        e(Text, { color: "#64748b", dimColor: true }, "kcal")
      )
    ),

    // 28-day average row
    data?.weekAverage && e(
      Box,
      { flexDirection: "row", justifyContent: "flex-start", marginTop: 1 },
      e(Text, { color: "#475569" }, "28d avg: "),
      e(Text, { color: "#64748b" }, `${data.weekAverage.readinessScore || "--"} ready`)
    ),

    // AI Response section - only show if model is ready and has response
    e(
      Box,
      { flexDirection: "column", marginTop: 1, borderTopColor: "#334155" },
      e(Text, { color: "#334155" }, "─".repeat(32)),
      modelStatus.isReady && aiResponse
        ? e(Text, { color: "#94a3b8", wrap: "wrap" }, aiResponse)
        : e(Text, { color: "#475569", dimColor: true }, "Response when Model is ready")
    )
  );
};

export default OuraHealthPanel;
