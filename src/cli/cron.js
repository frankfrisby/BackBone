/**
 * backbone cron - Manage BACKBONE proactive scheduler jobs
 *
 * Subcommands:
 *   list               List all jobs with window, type, status, last run
 *   status             Scheduler health: running, daily count, next job, quiet hours
 *   run <id>           Trigger a job immediately via server API
 *   enable <id>        Enable a disabled job
 *   disable <id>       Disable a job
 *   history            Show last 10 job runs sorted by time
 */

import fs from "fs";
import http from "http";
import { dataFile } from "../services/paths.js";
import { section, label, ok, warn, info, fail, theme, symbols } from "./theme.js";

const HELP = [
  "",
  "backbone cron - Manage proactive scheduler jobs",
  "",
  "Usage: backbone cron <subcommand> [options]",
  "",
  "Subcommands:",
  "  list                 List all jobs (table: ID, Window, Type, Status, Last Run)",
  "  status               Scheduler health overview",
  "  run <id>             Trigger a job immediately",
  "  enable <id>          Enable a disabled job",
  "  disable <id>         Disable a job",
  "  history              Show last 10 job runs",
  "",
  "Options:",
  "  --json               Output machine-readable JSON",
  "  --help               Show this help",
  "",
].join("\n");

// --- Helpers ---

function fetchJson(urlPath) {
  return new Promise((resolve) => {
    const url = "http://localhost:3000" + urlPath;
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function postJson(urlPath, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const url = "http://localhost:3000" + urlPath;
    const req = http.request(url, {
      method: "POST",
      timeout: 10000,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, data: null }); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function readState() {
  return readJsonFile(dataFile("proactive-scheduler.json"));
}

function fmtTime(h, m) {
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function fmtWindow(start, end) {
  if (!start || !end) return "\u2014";
  return fmtTime(start[0], start[1]) + "-" + fmtTime(end[0], end[1]);
}

function fmtTimeAgo(isoString) {
  if (!isoString) return "never";
  const ms = Date.now() - new Date(isoString).getTime();
  if (ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hrs = Math.floor(min / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return days + "d " + (hrs % 24) + "h ago";
  if (hrs > 0) return hrs + "h " + (min % 60) + "m ago";
  if (min > 0) return min + "m ago";
  return sec + "s ago";
}

function isQuietHours() {
  const h = new Date().getHours();
  return h >= 22 || h < 7;
}

function pad(str, width) {
  return String(str).padEnd(width);
}

// --- Subcommands ---

async function cmdList(args) {
  const jsonMode = args.includes("--json");

  // Try server API first, fall back to state file
  const serverData = await fetchJson("/api/proactive/status");
  const state = readState();

  const source = serverData || state;
  if (!source) {
    console.log(fail("No scheduler data available. Is the server running?"));
    return;
  }

  const jobs = [];

  if (serverData && serverData.jobs) {
    for (const job of serverData.jobs) {
      const sj = (state && state.jobs && state.jobs[job.id]) || {};
      jobs.push({
        id: job.id,
        type: job.type || "\u2014",
        window: fmtWindow(job.windowStart, job.windowEnd),
        weekdays: job.weekdaysOnly ? "wkdays" : "daily",
        enabled: sj.enabled !== false,
        lastRun: sj.lastRun || job.lastRun || null,
        description: job.description || "",
      });
    }
  } else if (state && state.jobs) {
    for (const [id, j] of Object.entries(state.jobs)) {
      jobs.push({
        id,
        type: "\u2014",
        window: "\u2014",
        weekdays: "\u2014",
        enabled: j.enabled !== false,
        lastRun: j.lastRun || null,
        description: "",
      });
    }
  }

  if (jsonMode) {
    console.log(JSON.stringify(jobs, null, 2));
    return;
  }

  console.log(section("Scheduled Jobs"));
  console.log("");

  const hdr = "  " + pad("ID", 26) + " " + pad("Window", 14) + " " + pad("Type", 16) + " " + pad("Status", 10) + " " + "Last Run";
  console.log(theme.muted(hdr));
  console.log(theme.muted("  " + "\u2500".repeat(82)));

  for (const j of jobs) {
    const statusStr = j.enabled ? theme.success("on") : theme.error("off");
    const lastStr = j.lastRun ? fmtTimeAgo(j.lastRun) : theme.muted("never");
    const raw = j.enabled ? "on" : "off";
    console.log("  " + pad(j.id, 26) + " " + pad(j.window, 14) + " " + pad(j.type, 16) + " " + statusStr + " ".repeat(Math.max(1, 10 - raw.length)) + lastStr);
  }

  console.log(theme.muted("\n  " + jobs.length + " jobs total"));
  console.log("");
}

async function cmdStatus(args) {
  const jsonMode = args.includes("--json");

  const serverData = await fetchJson("/api/proactive/status");
  const state = readState();

  const serverUp = !!serverData;
  const jobEntries = (state && state.jobs) ? Object.entries(state.jobs) : [];
  const enabledCount = jobEntries.filter(([, j]) => j.enabled !== false).length;
  const disabledCount = jobEntries.length - enabledCount;

  const messagesDelivered = (state && state.stats && state.stats.messagesDelivered) || 0;

  const upcoming = jobEntries
    .map(([id, j]) => ({ id, nextRun: j.nextRunAt }))
    .filter((j) => j.nextRun && new Date(j.nextRun) > new Date())
    .sort((a, b) => new Date(a.nextRun) - new Date(b.nextRun));
  const nextJob = upcoming[0] || null;

  const result = {
    serverUp,
    totalJobs: jobEntries.length,
    enabled: enabledCount,
    disabled: disabledCount,
    messagesDelivered,
    quietHours: isQuietHours(),
    nextJob,
  };

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(section("Scheduler Status"));
  console.log("");
  console.log(serverUp ? ok("Server is running") : fail("Server not responding"));
  console.log(label("Total jobs", String(jobEntries.length)));
  console.log(label("Enabled", theme.success(String(enabledCount))));
  if (disabledCount > 0) console.log(label("Disabled", theme.error(String(disabledCount))));
  console.log(label("Messages today", String(messagesDelivered)));
  console.log(isQuietHours() ? warn("Quiet hours active (22:00-07:00)") : ok("Outside quiet hours"));

  if (nextJob) {
    const when = new Date(nextJob.nextRun);
    console.log(label("Next job", nextJob.id + " at " + when.toLocaleTimeString()));
  } else {
    console.log(label("Next job", theme.muted("none scheduled")));
  }

  console.log("");
}

async function cmdRun(args) {
  const jobId = args.find((a) => !a.startsWith("-"));
  if (!jobId) {
    console.log(fail("Usage: backbone cron run <job-id>"));
    return;
  }

  console.log(info("Triggering job " + theme.bold(jobId) + "..."));

  const res = await postJson("/api/proactive/trigger", { jobId });

  if (!res) {
    console.log(fail("Server not responding. Start the server first."));
    return;
  }

  if (res.status === 200) {
    console.log(ok("Job " + theme.bold(jobId) + " triggered successfully"));
    if (res.data && res.data.message) console.log(label("Response", res.data.message));
  } else {
    console.log(fail("Failed to trigger " + jobId + " (HTTP " + res.status + ")"));
    if (res.data && res.data.error) console.log(label("Error", res.data.error));
  }
}

async function cmdEnable(args) {
  const jobId = args.find((a) => !a.startsWith("-"));
  if (!jobId) {
    console.log(fail("Usage: backbone cron enable <job-id>"));
    return;
  }

  const stateFile = dataFile("proactive-scheduler.json");
  const state = readJsonFile(stateFile);
  if (!state) {
    console.log(fail("No scheduler state file found."));
    return;
  }

  if (!state.jobs) state.jobs = {};
  if (!state.jobs[jobId]) state.jobs[jobId] = {};

  if (state.jobs[jobId].enabled !== false) {
    console.log(warn("Job " + theme.bold(jobId) + " is already enabled"));
    return;
  }

  state.jobs[jobId].enabled = true;
  writeJsonFile(stateFile, state);
  console.log(ok("Job " + theme.bold(jobId) + " enabled"));
}

async function cmdDisable(args) {
  const jobId = args.find((a) => !a.startsWith("-"));
  if (!jobId) {
    console.log(fail("Usage: backbone cron disable <job-id>"));
    return;
  }

  const stateFile = dataFile("proactive-scheduler.json");
  const state = readJsonFile(stateFile);
  if (!state) {
    console.log(fail("No scheduler state file found."));
    return;
  }

  if (!state.jobs) state.jobs = {};
  if (!state.jobs[jobId]) state.jobs[jobId] = {};

  if (state.jobs[jobId].enabled === false) {
    console.log(warn("Job " + theme.bold(jobId) + " is already disabled"));
    return;
  }

  state.jobs[jobId].enabled = false;
  writeJsonFile(stateFile, state);
  console.log(ok("Job " + theme.bold(jobId) + " disabled"));
}

async function cmdHistory(args) {
  const jsonMode = args.includes("--json");
  const state = readState();

  if (!state || !state.jobs) {
    console.log(fail("No scheduler state found."));
    return;
  }

  const runs = [];
  for (const [id, job] of Object.entries(state.jobs)) {
    if (job.lastRun) {
      runs.push({ id, time: job.lastRun, enabled: job.enabled !== false });
    }
  }

  runs.sort((a, b) => new Date(b.time) - new Date(a.time));
  const recent = runs.slice(0, 10);

  if (jsonMode) {
    console.log(JSON.stringify(recent, null, 2));
    return;
  }

  console.log(section("Recent Job Runs"));
  console.log("");

  if (recent.length === 0) {
    console.log(info("No job runs recorded yet."));
    console.log("");
    return;
  }

  const hdr = "  " + pad("Time", 22) + " " + pad("Job ID", 28) + " " + "Status";
  console.log(theme.muted(hdr));
  console.log(theme.muted("  " + "\u2500".repeat(60)));

  for (const run of recent) {
    const dt = new Date(run.time);
    const timeStr = dt.toLocaleDateString() + " " + dt.toLocaleTimeString();
    const statusStr = run.enabled ? theme.success("enabled") : theme.error("disabled");
    console.log("  " + pad(timeStr, 22) + " " + pad(run.id, 28) + " " + statusStr);
  }

  console.log("");
}

// --- Entry point ---

export async function runCron(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  const sub = args[0];
  const rest = args.slice(1);

  switch (sub) {
    case "list":
    case "ls":
      return cmdList(rest);
    case "status":
      return cmdStatus(rest);
    case "run":
    case "trigger":
      return cmdRun(rest);
    case "enable":
      return cmdEnable(rest);
    case "disable":
      return cmdDisable(rest);
    case "history":
    case "log":
      return cmdHistory(rest);
    default:
      if (!sub || sub.startsWith("-")) {
        return cmdList(args);
      }
      console.log(fail("Unknown subcommand: " + sub));
      console.log(HELP);
  }
}
