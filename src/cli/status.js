/**
 * backbone status — System status overview
 *
 * Shows server state, engine activity, active goals, scheduler,
 * and integration health at a glance.
 */

import fs from "fs";
import http from "http";
import { dataFile, memoryFile, getActiveUserId, getActiveUser } from "../services/paths.js";
import { section, label, ok, fail, warn, info, theme } from "./theme.js";

const HELP = `
backbone status — System status overview

Usage: backbone status [options]

Options:
  --json      Output machine-readable JSON
  --help      Show this help
`;

async function fetchJson(urlPath) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:3000${urlPath}`, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function formatTimeAgo(isoString) {
  if (!isoString) return "never";
  const ms = Date.now() - new Date(isoString).getTime();
  return formatUptime(ms) + " ago";
}

export async function runStatus(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  const jsonMode = args.includes("--json");
  const result = {};

  // Server health
  const health = await fetchJson("/health");
  result.server = { up: !!health, uptime: health?.uptime };

  // User
  let userName = "unknown";
  try {
    const user = getActiveUser();
    userName = user?.displayName || user?.email || getActiveUserId();
  } catch {}
  result.user = userName;

  // Engine state
  const engineState = readJsonFile(dataFile("engine-state.json"));
  result.engine = {
    phase: engineState?.phase || "unknown",
    lastRun: engineState?.lastRunAt,
    currentGoal: engineState?.currentGoal?.title,
  };

  // Goals
  const goals = readJsonFile(dataFile("goals.json")) || [];
  const activeGoals = Array.isArray(goals) ? goals.filter(g => g.status === "active") : [];
  result.goals = {
    total: Array.isArray(goals) ? goals.length : 0,
    active: activeGoals.length,
    titles: activeGoals.slice(0, 5).map(g => g.title),
  };

  // Life scores
  const scores = readJsonFile(dataFile("life-scores.json"));
  result.lifeScores = scores ? {
    overall: scores.overall,
    categories: scores.categories,
  } : null;

  // Scheduler
  const scheduler = readJsonFile(dataFile("proactive-scheduler.json"));
  if (scheduler) {
    const jobs = Object.entries(scheduler.jobs || {});
    const nextJob = jobs
      .map(([id, j]) => ({ id, nextRun: j.nextRunAt }))
      .filter(j => j.nextRun)
      .sort((a, b) => new Date(a.nextRun) - new Date(b.nextRun))[0];
    result.scheduler = {
      jobs: jobs.length,
      messagesDelivered: scheduler.stats?.messagesDelivered || 0,
      nextJob: nextJob ? { id: nextJob.id, at: nextJob.nextRun } : null,
    };
  }

  // Backlog
  const backlog = readJsonFile(dataFile("backlog.json"));
  result.backlog = {
    items: backlog?.items?.length || 0,
    graduated: backlog?.graduatedToGoals?.length || 0,
  };

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Pretty print
  console.log(theme.heading("\n  BACKBONE Status\n"));

  // Server
  console.log(section("Server"));
  console.log(result.server.up ? ok("Running on :3000") : fail("Not responding"));
  if (result.server.uptime) console.log(label("Uptime", formatUptime(result.server.uptime * 1000)));
  console.log(label("User", userName));

  // Engine
  console.log(section("Engine"));
  const phaseColor = result.engine.phase === "running" ? theme.success : result.engine.phase === "resting" ? theme.muted : theme.warn;
  console.log(label("Phase", phaseColor(result.engine.phase)));
  console.log(label("Last run", formatTimeAgo(result.engine.lastRun)));
  if (result.engine.currentGoal) console.log(label("Working on", result.engine.currentGoal));

  // Goals
  console.log(section("Goals"));
  console.log(label("Active", theme.info(String(result.goals.active))));
  console.log(label("Total", String(result.goals.total)));
  for (const title of result.goals.titles) {
    console.log(`    ${theme.muted("•")} ${title}`);
  }

  // Backlog
  console.log(section("Backlog"));
  console.log(label("Items", String(result.backlog.items)));
  console.log(label("Graduated", String(result.backlog.graduated)));

  // Life scores
  if (result.lifeScores) {
    console.log(section("Life Scores"));
    console.log(label("Overall", theme.bold(String(result.lifeScores.overall))));
    if (result.lifeScores.categories) {
      for (const [cat, data] of Object.entries(result.lifeScores.categories)) {
        const score = typeof data === "object" ? data.score : data;
        const bar = "█".repeat(Math.round(score / 10)) + "░".repeat(10 - Math.round(score / 10));
        console.log(`    ${theme.muted(cat.padEnd(10))} ${bar} ${score}`);
      }
    }
  }

  // Scheduler
  if (result.scheduler) {
    console.log(section("Scheduler"));
    console.log(label("Jobs", String(result.scheduler.jobs)));
    console.log(label("Delivered", String(result.scheduler.messagesDelivered)));
    if (result.scheduler.nextJob) {
      console.log(label("Next", `${result.scheduler.nextJob.id} at ${new Date(result.scheduler.nextJob.at).toLocaleTimeString()}`));
    }
  }

  console.log("");
}
