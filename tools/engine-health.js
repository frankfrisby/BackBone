#!/usr/bin/env node
/**
 * Engine Health Check CLI
 * Shows whether the autonomous engine is alive, stalled, or stopped.
 *
 * Usage:
 *   node tools/engine-health.js          # Show current status
 *   node tools/engine-health.js hourly   # Show hourly work log (last 24h)
 *   node tools/engine-health.js actions  # Show recent actions
 */

import fs from "fs";
import path from "path";
import { dataFile } from "../src/services/paths.js";

const HEARTBEAT_PATH = dataFile("engine-heartbeat.json");

const command = process.argv[2] || "status";

if (!fs.existsSync(HEARTBEAT_PATH)) {
  console.log("No heartbeat data found. Engine may not have run with heartbeat tracking yet.");
  console.log("Heartbeat tracking was just added — it will start collecting data on next engine run.");
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(HEARTBEAT_PATH, "utf-8"));
const now = Date.now();
const lastBeat = data.lastBeat ? new Date(data.lastBeat).getTime() : 0;
const lastWork = data.lastWork ? new Date(data.lastWork).getTime() : 0;
const sinceLastBeat = lastBeat ? Math.round((now - lastBeat) / 60000) : -1;
const sinceLastWork = lastWork ? Math.round((now - lastWork) / 60000) : -1;

const statusEmoji = {
  running: "ON",
  stalled: "STALLED",
  paused: "PAUSED",
  stopped: "OFF"
};

if (command === "status") {
  console.log("=== ENGINE HEALTH ===\n");

  const status = sinceLastBeat > 10 && data.status === "running" ? "stalled" : data.status;
  console.log(`Status:          ${statusEmoji[status] || status}`);
  console.log(`Last heartbeat:  ${sinceLastBeat >= 0 ? sinceLastBeat + " min ago" : "never"}`);
  console.log(`Last work done:  ${sinceLastWork >= 0 ? sinceLastWork + " min ago" : "never"}`);

  if (data.uptimeStarted) {
    const uptimeMin = Math.round((now - new Date(data.uptimeStarted).getTime()) / 60000);
    const uptimeHrs = (uptimeMin / 60).toFixed(1);
    console.log(`Uptime:          ${uptimeHrs}h (${uptimeMin} min)`);
  }

  console.log(`Total work:      ${data.totalWork || 0} items`);
  console.log(`Total errors:    ${data.totalErrors || 0}`);
  console.log(`Restarts:        ${data.restarts || 0}`);

  // Last 24h summary
  const last24h = (data.hourlyLog || []).slice(-24);
  const hoursWithWork = last24h.filter(h => h.workItems > 0).length;
  const totalWork24h = last24h.reduce((sum, h) => sum + (h.workItems || 0), 0);
  const totalErrors24h = last24h.reduce((sum, h) => sum + (h.errors || 0), 0);

  console.log(`\n--- Last 24 Hours ---`);
  console.log(`Hours with work: ${hoursWithWork}/24`);
  console.log(`Work items:      ${totalWork24h}`);
  console.log(`Errors:          ${totalErrors24h}`);

  // Last 5 actions
  const recent = (data.recentActions || []).slice(0, 5);
  if (recent.length > 0) {
    console.log(`\n--- Recent Activity ---`);
    for (const action of recent) {
      const ago = Math.round((now - new Date(action.time).getTime()) / 60000);
      console.log(`  ${ago}min ago: ${action.action}`);
    }
  }

} else if (command === "hourly") {
  console.log("=== HOURLY WORK LOG (Last 24h) ===\n");
  console.log("Hour                  | Beats | Work | Errors");
  console.log("----------------------|-------|------|-------");

  const last24h = (data.hourlyLog || []).slice(-24);
  for (const entry of last24h) {
    const hour = entry.hour.slice(11, 16); // HH:MM
    const date = entry.hour.slice(5, 10);  // MM-DD
    const bar = entry.workItems > 0 ? "=".repeat(Math.min(entry.workItems, 10)) : ".";
    console.log(`${date} ${hour}         | ${String(entry.beats || 0).padStart(5)} | ${String(entry.workItems || 0).padStart(4)} | ${entry.errors || 0} ${bar}`);
  }

} else if (command === "actions") {
  console.log("=== RECENT ACTIONS ===\n");
  const actions = (data.recentActions || []).slice(0, 20);
  if (actions.length === 0) {
    console.log("No actions recorded yet.");
  } else {
    for (const action of actions) {
      const ago = Math.round((now - new Date(action.time).getTime()) / 60000);
      const duration = action.duration ? ` (${Math.round(action.duration / 1000)}s)` : "";
      console.log(`  [${ago}min ago]${duration} ${action.action}`);
    }
  }

} else {
  console.log("Usage: node tools/engine-health.js [status|hourly|actions]");
}
