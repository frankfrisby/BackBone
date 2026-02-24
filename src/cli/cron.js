/**
 * backbone cron — View scheduled proactive jobs
 *
 * Inspired by OpenClaw's `openclaw cron list/status`.
 * Shows the proactive scheduler's jobs, next run times, and history.
 */

import fs from "fs";
import http from "http";
import { dataFile } from "../services/paths.js";
import { section, label, ok, warn, info, theme } from "./theme.js";

const HELP = `
backbone cron — View scheduled proactive jobs

Usage: backbone cron <action>

Actions:
  list             List all scheduled jobs with next run times
  status           Show scheduler status and stats
  trigger <jobId>  Trigger a job immediately (requires running server)
  history          Show recent job execution history

Options:
  --json      Output machine-readable JSON
  --help      Show this help

Job IDs:
  morning-brief, evening-brief, market-open, market-midday,
  market-close, goal-check, project-nudge, adhoc-intel
`;

function readSchedulerState() {
  const p = dataFile("proactive-scheduler.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

async function triggerJob(jobId) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jobId });
    const req = http.request({
      hostname: "localhost",
      port: 3000,
      path: "/api/proactive/trigger",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(payload);
    req.end();
  });
}

function formatNextRun(isoString) {
  if (!isoString) return theme.muted("not scheduled");
  const d = new Date(isoString);
  const now = Date.now();
  const diff = d.getTime() - now;
  if (diff < 0) return theme.warn("overdue");
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return theme.info(`in ${hours}h ${mins % 60}m`);
  return theme.success(`in ${mins}m`);
}

function formatLastRun(isoString) {
  if (!isoString) return theme.muted("never");
  const d = new Date(isoString);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 24) return theme.muted(`${Math.floor(hours / 24)}d ago`);
  if (hours > 0) return theme.muted(`${hours}h ${mins % 60}m ago`);
  return theme.muted(`${mins}m ago`);
}

export async function runCron(args) {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.log(HELP);
    return;
  }

  const jsonMode = args.includes("--json");
  const action = args[0];

  switch (action) {
    case "list": {
      const state = readSchedulerState();
      if (!state) {
        console.log(warn("No scheduler state. Start backbone first."));
        return;
      }

      const jobs = Object.entries(state.jobs || {}).sort((a, b) => {
        const aNext = a[1].nextRunAt ? new Date(a[1].nextRunAt).getTime() : Infinity;
        const bNext = b[1].nextRunAt ? new Date(b[1].nextRunAt).getTime() : Infinity;
        return aNext - bNext;
      });

      if (jsonMode) {
        console.log(JSON.stringify(jobs.map(([id, j]) => ({ id, ...j })), null, 2));
        return;
      }

      console.log(theme.heading("\n  Proactive Jobs\n"));
      for (const [id, job] of jobs) {
        const enabled = job.enabled !== false;
        const status = enabled ? theme.success("ON ") : theme.muted("OFF");
        console.log(`  ${status} ${theme.bold(id.padEnd(18))} next: ${formatNextRun(job.nextRunAt)}  last: ${formatLastRun(job.lastRun)}`);
      }
      console.log("");
      break;
    }

    case "status": {
      const state = readSchedulerState();
      if (!state) {
        console.log(warn("No scheduler state."));
        return;
      }

      if (jsonMode) {
        console.log(JSON.stringify(state.stats || {}, null, 2));
        return;
      }

      console.log(theme.heading("\n  Scheduler Status\n"));
      const stats = state.stats || {};
      console.log(label("Messages delivered", String(stats.messagesDelivered || 0)));
      console.log(label("Total jobs", String(Object.keys(state.jobs || {}).length)));
      console.log(label("Max per day", String(state.config?.maxMessagesPerDay || 8)));
      console.log(label("Quiet hours", `${state.config?.quietHoursStart || 22}:00 - ${state.config?.quietHoursEnd || 7}:00`));
      console.log("");
      break;
    }

    case "trigger": {
      const jobId = args[1];
      if (!jobId) {
        console.error(theme.error("Usage: backbone cron trigger <jobId>"));
        process.exit(1);
      }
      try {
        console.log(info(`Triggering ${jobId}...`));
        const result = await triggerJob(jobId);
        if (result.status === 200) {
          console.log(ok(`Job ${jobId} triggered successfully`));
        } else {
          console.log(warn(`Server returned ${result.status}: ${JSON.stringify(result.data)}`));
        }
      } catch (err) {
        console.log(theme.error(`Failed to trigger: ${err.message}. Is the server running?`));
      }
      break;
    }

    case "history": {
      const state = readSchedulerState();
      if (!state) {
        console.log(warn("No scheduler state."));
        return;
      }

      const jobs = Object.entries(state.jobs || {})
        .filter(([_, j]) => j.lastRun)
        .sort((a, b) => new Date(b[1].lastRun).getTime() - new Date(a[1].lastRun).getTime());

      if (jsonMode) {
        console.log(JSON.stringify(jobs.map(([id, j]) => ({ id, lastRun: j.lastRun, lastResult: j.lastResult })), null, 2));
        return;
      }

      console.log(theme.heading("\n  Job History (recent first)\n"));
      if (jobs.length === 0) {
        console.log(info("No jobs have run yet"));
        return;
      }
      for (const [id, job] of jobs.slice(0, 15)) {
        const time = new Date(job.lastRun).toLocaleString();
        const result = job.lastResult === "success" ? theme.success("OK") :
                       job.lastResult === "skipped" ? theme.muted("SKIP") :
                       theme.warn(job.lastResult || "?");
        console.log(`  ${theme.muted(time)}  ${result}  ${id}`);
      }
      console.log("");
      break;
    }

    default:
      console.error(theme.error(`Unknown action: ${action}`));
      console.log(HELP);
      process.exit(1);
  }
}
