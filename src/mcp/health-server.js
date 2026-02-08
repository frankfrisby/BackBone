import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { getDataDir } from "../services/paths.js";

/**
 * BACKBONE Health MCP Server
 * Provides tools for health data from Oura Ring
 */

const DATA_DIR = getDataDir();
const OURA_CACHE = path.join(DATA_DIR, "oura-cache.json");
const OURA_TOKEN_FILE = path.join(DATA_DIR, "oura-token.json");

// Load Oura token — env var first, fallback to config file (MCP child processes don't inherit .env)
const getOuraToken = () => {
  if (process.env.OURA_ACCESS_TOKEN) return process.env.OURA_ACCESS_TOKEN;
  try {
    if (fs.existsSync(OURA_TOKEN_FILE)) {
      const config = JSON.parse(fs.readFileSync(OURA_TOKEN_FILE, "utf-8"));
      return config.token || config.accessToken || config.access_token || null;
    }
  } catch { /* ignore */ }
  return null;
};

const getOuraHeaders = () => ({
  Authorization: `Bearer ${getOuraToken()}`,
  "Content-Type": "application/json",
});

// Tool definitions
const TOOLS = [
  {
    name: "get_sleep_data",
    description: "Get sleep data from Oura Ring for specified date range",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        endDate: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
      required: [],
    },
  },
  {
    name: "get_readiness_score",
    description: "Get today's readiness score and contributors",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD), defaults to today" },
      },
      required: [],
    },
  },
  {
    name: "get_activity_data",
    description: "Get activity and movement data",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        endDate: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
      required: [],
    },
  },
  {
    name: "get_health_summary",
    description: "Get a comprehensive health summary including sleep, readiness, and activity",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// Date helpers
const formatDate = (date) => date.toISOString().split("T")[0];
const today = () => formatDate(new Date());
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
};

// Oura API v2 endpoints
const OURA_BASE = "https://api.ouraring.com/v2/usercollection";

// Cache management
const loadCache = () => {
  try {
    if (fs.existsSync(OURA_CACHE)) {
      return JSON.parse(fs.readFileSync(OURA_CACHE, "utf-8"));
    }
  } catch (e) {}
  return { lastFetch: null, data: {} };
};

const saveCache = (cache) => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(OURA_CACHE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error("Cache save error:", e.message);
  }
};

// Fetch helpers
async function fetchOura(endpoint, params = {}) {
  if (!getOuraToken()) {
    return { error: "OURA_ACCESS_TOKEN not configured (set env var or data/oura-token.json)" };
  }

  const url = new URL(`${OURA_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v) url.searchParams.append(k, v);
  });

  try {
    const response = await fetch(url.toString(), {
      headers: getOuraHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { error: "Oura token expired or invalid" };
      }
      throw new Error(`Oura API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    return { error: error.message };
  }
}

// Tool implementations
async function getSleepData(startDate, endDate) {
  const start = startDate || daysAgo(7);
  const end = endDate || today();

  const data = await fetchOura("daily_sleep", {
    start_date: start,
    end_date: end,
  });

  if (data.error) return data;

  return {
    period: { start, end },
    sleepData: data.data?.map(s => ({
      date: s.day,
      score: s.score,
      totalSleep: Math.round(s.contributors?.total_sleep / 60) || 0, // minutes to hours approx
      efficiency: s.contributors?.efficiency,
      restfulness: s.contributors?.restfulness,
      remSleep: s.contributors?.rem_sleep,
      deepSleep: s.contributors?.deep_sleep,
      latency: s.contributors?.latency,
      timing: s.contributors?.timing,
    })) || [],
  };
}

async function getReadinessScore(date) {
  const targetDate = date || today();

  const data = await fetchOura("daily_readiness", {
    start_date: targetDate,
    end_date: targetDate,
  });

  if (data.error) return data;

  const readiness = data.data?.[0];
  if (!readiness) {
    return { date: targetDate, message: "No readiness data available for this date" };
  }

  return {
    date: readiness.day,
    score: readiness.score,
    temperatureDeviation: readiness.temperature_deviation,
    temperatureTrendDeviation: readiness.temperature_trend_deviation,
    contributors: {
      activityBalance: readiness.contributors?.activity_balance,
      bodyTemperature: readiness.contributors?.body_temperature,
      hrvBalance: readiness.contributors?.hrv_balance,
      previousDayActivity: readiness.contributors?.previous_day_activity,
      previousNight: readiness.contributors?.previous_night,
      recoveryIndex: readiness.contributors?.recovery_index,
      restingHeartRate: readiness.contributors?.resting_heart_rate,
      sleepBalance: readiness.contributors?.sleep_balance,
    },
  };
}

async function getActivityData(startDate, endDate) {
  const start = startDate || daysAgo(7);
  const end = endDate || today();

  const data = await fetchOura("daily_activity", {
    start_date: start,
    end_date: end,
  });

  if (data.error) return data;

  return {
    period: { start, end },
    activityData: data.data?.map(a => ({
      date: a.day,
      score: a.score,
      activeCalories: a.active_calories,
      totalCalories: a.total_calories,
      steps: a.steps,
      equivalentWalkingDistance: a.equivalent_walking_distance,
      highActivityTime: a.high_activity_time,
      mediumActivityTime: a.medium_activity_time,
      lowActivityTime: a.low_activity_time,
      sedentaryTime: a.sedentary_time,
      restingTime: a.resting_time,
      inactivityAlerts: a.inactivity_alerts,
      targetCalories: a.target_calories,
      targetMeters: a.target_meters,
      metersToTarget: a.meters_to_target,
      contributors: {
        meetDailyTargets: a.contributors?.meet_daily_targets,
        moveEveryHour: a.contributors?.move_every_hour,
        recoveryTime: a.contributors?.recovery_time,
        stayActive: a.contributors?.stay_active,
        trainingFrequency: a.contributors?.training_frequency,
        trainingVolume: a.contributors?.training_volume,
      },
    })) || [],
  };
}

async function getHealthSummary() {
  const cache = loadCache();
  const now = Date.now();

  // Use cache if less than 15 minutes old
  if (cache.lastFetch && now - cache.lastFetch < 15 * 60 * 1000 && cache.data.summary) {
    return { ...cache.data.summary, cached: true };
  }

  // Fetch all data in parallel
  const [sleep, readiness, activity] = await Promise.all([
    getSleepData(daysAgo(1), today()),
    getReadinessScore(),
    getActivityData(daysAgo(1), today()),
  ]);

  const todaySleep = sleep.sleepData?.find(s => s.date === today()) ||
                     sleep.sleepData?.[sleep.sleepData.length - 1];
  const todayActivity = activity.activityData?.find(a => a.date === today()) ||
                        activity.activityData?.[activity.activityData.length - 1];

  const summary = {
    date: today(),
    overview: {
      sleepScore: todaySleep?.score || null,
      readinessScore: readiness.score || null,
      activityScore: todayActivity?.score || null,
    },
    sleep: todaySleep || { message: "No sleep data" },
    readiness: readiness.error ? { error: readiness.error } : readiness,
    activity: todayActivity || { message: "No activity data" },
    insights: generateInsights(todaySleep, readiness, todayActivity),
  };

  // Update cache
  cache.lastFetch = now;
  cache.data.summary = summary;
  saveCache(cache);

  return summary;
}

function generateInsights(sleep, readiness, activity) {
  const insights = [];

  if (sleep?.score) {
    if (sleep.score >= 85) {
      insights.push("Excellent sleep quality - energy levels should be high");
    } else if (sleep.score >= 70) {
      insights.push("Good sleep - consider maintaining consistent sleep schedule");
    } else {
      insights.push("Sleep could be improved - prioritize rest tonight");
    }
  }

  if (readiness?.score) {
    if (readiness.score >= 85) {
      insights.push("High readiness - good day for challenging tasks or workouts");
    } else if (readiness.score >= 70) {
      insights.push("Moderate readiness - pace yourself with activities");
    } else {
      insights.push("Low readiness - consider recovery activities and light work");
    }
  }

  if (activity?.steps) {
    if (activity.steps >= 10000) {
      insights.push(`Great activity level with ${activity.steps.toLocaleString()} steps`);
    } else if (activity.steps >= 5000) {
      insights.push(`Moderate activity - ${(10000 - activity.steps).toLocaleString()} more steps to reach 10k`);
    } else {
      insights.push("Low activity today - try to add more movement");
    }
  }

  return insights;
}

// Create server
const server = new Server(
  {
    name: "backbone-health",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  let result;

  switch (name) {
    case "get_sleep_data":
      result = await getSleepData(args.startDate, args.endDate);
      break;
    case "get_readiness_score":
      result = await getReadinessScore(args.date);
      break;
    case "get_activity_data":
      result = await getActivityData(args.startDate, args.endDate);
      break;
    case "get_health_summary":
      result = await getHealthSummary();
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE Health MCP Server running");
}

main().catch(console.error);
