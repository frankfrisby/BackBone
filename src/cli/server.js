/**
 * backbone server — Manage the BACKBONE server process
 *
 * The server runs detached from the TUI. This command lets users
 * check, start, stop, and restart it without hunting for PIDs.
 *
 * Usage:
 *   backbone server            # show status
 *   backbone server status     # same
 *   backbone server start      # start if not running
 *   backbone server stop       # graceful shutdown
 *   backbone server restart    # stop + start (for updates)
 */

import { execSync, spawn } from "child_process";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { section, label, ok, fail, warn, info, theme } from "./theme.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, "../server.js");
const PORT = 3000;

const HELP = `
backbone server — Manage the BACKBONE server process

Usage: backbone server <action>

Actions:
  status          Check if server is running (default)
  start           Start server in background
  stop            Graceful shutdown
  restart         Stop + start (use after updates)

Options:
  --json          Machine-readable output
  --help          Show this help
`;

// ── Helpers ──────────────────────────────────────────────────

async function isServerUp() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/health`, { timeout: 3000 }, (res) => {
      res.resume();
      resolve({ up: true, statusCode: res.statusCode });
    });
    req.on("error", () => resolve({ up: false }));
    req.on("timeout", () => { req.destroy(); resolve({ up: false }); });
  });
}

async function getServerInfo() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/health`, { timeout: 3000 }, (res) => {
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

function findServerPids() {
  try {
    // Windows: find PIDs listening on our port
    const output = execSync(
      `netstat -ano | findstr ":${PORT}" | findstr "LISTENING"`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    const pids = new Set();
    for (const line of output.split("\n")) {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[parts.length - 1]);
      if (pid && pid > 0) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function killPids(pids) {
  let killed = 0;
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F /T`, { encoding: "utf-8", timeout: 5000 });
      killed++;
    } catch {}
  }
  return killed;
}

async function waitForServer(up, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await isServerUp();
    if (status.up === up) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function formatUptime(seconds) {
  if (!seconds) return "unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

// ── Actions ──────────────────────────────────────────────────

async function cmdStatus(jsonMode) {
  const health = await getServerInfo();
  const pids = findServerPids();

  if (jsonMode) {
    console.log(JSON.stringify({ up: !!health, pids, health }));
    return;
  }

  console.log(section("Server"));
  if (health) {
    console.log(ok(`Running on :${PORT}`));
    if (health.uptime) console.log(label("Uptime", formatUptime(health.uptime)));
    if (pids.length) console.log(label("PID", pids.join(", ")));
  } else {
    console.log(fail("Not running"));
    if (pids.length) console.log(warn(`Stale process on port ${PORT} (PID: ${pids.join(", ")})`));
  }
}

async function cmdStart(jsonMode) {
  const status = await isServerUp();
  if (status.up) {
    if (jsonMode) return console.log(JSON.stringify({ action: "start", already: true }));
    console.log(info("Server is already running"));
    return;
  }

  // Start detached
  const child = spawn("node", [SERVER_PATH], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  if (jsonMode) {
    const ready = await waitForServer(true);
    console.log(JSON.stringify({ action: "start", success: ready, pid: child.pid }));
    return;
  }

  process.stdout.write("  Starting server...");
  const ready = await waitForServer(true);
  if (ready) {
    console.log(" " + theme.success("OK") + ` (PID ${child.pid})`);
  } else {
    console.log(" " + theme.error("TIMEOUT"));
    console.log(warn("Server didn't respond within 15s. Check: backbone logs --errors"));
  }
}

async function cmdStop(jsonMode) {
  const status = await isServerUp();
  if (!status.up) {
    // Check for orphaned process
    const pids = findServerPids();
    if (pids.length) {
      const killed = killPids(pids);
      if (jsonMode) return console.log(JSON.stringify({ action: "stop", killed, orphan: true }));
      console.log(warn(`Killed ${killed} orphaned process(es) on port ${PORT}`));
      return;
    }
    if (jsonMode) return console.log(JSON.stringify({ action: "stop", already: true }));
    console.log(info("Server is not running"));
    return;
  }

  const pids = findServerPids();
  if (pids.length === 0) {
    if (jsonMode) return console.log(JSON.stringify({ action: "stop", error: "no PID found" }));
    console.log(fail("Server is up but couldn't find PID to kill"));
    return;
  }

  if (!jsonMode) process.stdout.write("  Stopping server...");
  const killed = killPids(pids);
  const stopped = await waitForServer(false, 10000);

  if (jsonMode) {
    console.log(JSON.stringify({ action: "stop", success: stopped, killed }));
    return;
  }

  if (stopped) {
    console.log(" " + theme.success("OK"));
  } else {
    console.log(" " + theme.error("FAILED"));
    console.log(warn("Server didn't stop. Try manually: taskkill /PID " + pids.join(" ")));
  }
}

async function cmdRestart(jsonMode) {
  if (!jsonMode) console.log(theme.heading("\n  Restarting BACKBONE Server\n"));

  const status = await isServerUp();
  if (status.up) {
    await cmdStop(jsonMode);
    // Brief pause for port release
    await new Promise(r => setTimeout(r, 1000));
  }
  await cmdStart(jsonMode);
}

// ── Entry ────────────────────────────────────────────────────

export async function runServer(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  const jsonMode = args.includes("--json");
  const action = args.find(a => !a.startsWith("--")) || "status";

  switch (action) {
    case "status": return cmdStatus(jsonMode);
    case "start": return cmdStart(jsonMode);
    case "stop": return cmdStop(jsonMode);
    case "restart": return cmdRestart(jsonMode);
    default:
      console.error(theme.error(`Unknown action: ${action}`));
      console.log(HELP);
      process.exit(1);
  }
}
