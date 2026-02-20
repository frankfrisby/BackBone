/**
 * BACKBONE Daemon
 *
 * Cross-platform background service manager.
 * Keeps the gateway + autonomous engine running even after terminal closes.
 *
 * Supports:
 *   - Windows: Task Scheduler (schtasks)
 *   - macOS: launchd (plist)
 *   - Linux: systemd (user service)
 *
 * Usage:
 *   node src/services/gateway/daemon.js install   — install as background service
 *   node src/services/gateway/daemon.js uninstall — remove background service
 *   node src/services/gateway/daemon.js start     — start the daemon
 *   node src/services/gateway/daemon.js stop      — stop the daemon
 *   node src/services/gateway/daemon.js status    — check if running
 *   node src/services/gateway/daemon.js run       — run in foreground (what the service calls)
 */

import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { getDataDir, dataFile } from "../paths.js";

const SERVICE_NAME = "backbone-engine";
const DISPLAY_NAME = "BACKBONE Engine";
const PID_FILE = dataFile("daemon.pid");
const LOG_FILE = dataFile("daemon.log");

const platform = os.platform();

// ── Daemon Runner ─────────────────────────────────────────────

/**
 * Run the daemon in foreground — this is what the service invocation calls
 */
export async function runDaemon() {
  console.log(`[daemon] Starting BACKBONE daemon (pid: ${process.pid})`);

  // Write PID file
  fs.writeFileSync(PID_FILE, String(process.pid));

  // Handle shutdown
  const shutdown = async (signal) => {
    console.log(`[daemon] Received ${signal}, shutting down...`);
    try { fs.unlinkSync(PID_FILE); } catch {}

    if (_gateway) await _gateway.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("uncaughtException", (err) => {
    console.error("[daemon] Uncaught exception:", err);
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] CRASH: ${err.stack || err}\n`);
    // Don't exit — let the service manager restart us
  });

  // Start gateway
  const { GatewayServer } = await import("./gateway-server.js");
  const _gateway = new GatewayServer();

  try {
    await _gateway.start();
  } catch (err) {
    if (err.message?.includes("already in use")) {
      console.log("[daemon] Gateway already running, attaching...");
    } else {
      throw err;
    }
  }

  // Start agent runtime
  const { getAgentRuntime } = await import("./agent-runtime.js");
  getAgentRuntime(_gateway);

  // Start autonomous engine (if available)
  try {
    const { getAutonomousEngine } = await import("../engine/autonomous-engine.js");
    const engine = getAutonomousEngine();
    if (!engine.state?.running) {
      engine.start();
      console.log("[daemon] Autonomous engine started");
    }
  } catch (err) {
    console.log("[daemon] Autonomous engine not available:", err.message);
  }

  // Start cron manager (if available)
  try {
    const { startCronJobs } = await import("../cron-manager.js");
    startCronJobs();
    console.log("[daemon] Cron jobs started");
  } catch (err) {
    console.log("[daemon] Cron manager not available:", err.message);
  }

  console.log("[daemon] All systems online");

  // Keep alive
  setInterval(() => {
    fs.writeFileSync(PID_FILE, String(process.pid)); // touch PID
  }, 60_000);
}

// ── Status ────────────────────────────────────────────────────

export function getDaemonStatus() {
  try {
    if (!fs.existsSync(PID_FILE)) return { running: false };

    const pid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim());
    if (!pid) return { running: false };

    // Check if process is alive
    try {
      process.kill(pid, 0); // signal 0 = check existence
      return { running: true, pid };
    } catch {
      // Stale PID file
      try { fs.unlinkSync(PID_FILE); } catch {}
      return { running: false, stalePid: pid };
    }
  } catch {
    return { running: false };
  }
}

// ── Install / Uninstall ───────────────────────────────────────

export function installDaemon() {
  const nodePath = process.execPath;
  const scriptPath = path.resolve(import.meta.dirname || ".", "daemon.js");
  const cwd = path.resolve(scriptPath, "../../../..");

  if (platform === "win32") {
    return _installWindows(nodePath, scriptPath, cwd);
  } else if (platform === "darwin") {
    return _installMacOS(nodePath, scriptPath, cwd);
  } else {
    return _installLinux(nodePath, scriptPath, cwd);
  }
}

export function uninstallDaemon() {
  if (platform === "win32") return _uninstallWindows();
  else if (platform === "darwin") return _uninstallMacOS();
  else return _uninstallLinux();
}

// ── Windows (Task Scheduler) ────────────────────────────────

function _installWindows(nodePath, scriptPath, cwd) {
  try {
    // Create a wrapper script
    const batPath = path.join(cwd, "bin", "backbone-daemon.bat");
    fs.writeFileSync(batPath, [
      `@echo off`,
      `cd /d "${cwd}"`,
      `"${nodePath}" "${scriptPath}" run >> "${LOG_FILE}" 2>&1`,
    ].join("\r\n"));

    // Create scheduled task that runs at logon
    execSync(
      `schtasks /create /tn "${SERVICE_NAME}" /tr "${batPath}" ` +
      `/sc onlogon /rl highest /f`,
      { stdio: "pipe" }
    );

    console.log(`[daemon] Installed Windows scheduled task "${SERVICE_NAME}"`);
    console.log(`[daemon] Will start at logon. Run 'backbone daemon start' to start now.`);
    return true;
  } catch (err) {
    console.error("[daemon] Install failed:", err.message);
    return false;
  }
}

function _uninstallWindows() {
  try {
    execSync(`schtasks /delete /tn "${SERVICE_NAME}" /f`, { stdio: "pipe" });
    console.log(`[daemon] Removed Windows scheduled task "${SERVICE_NAME}"`);
    return true;
  } catch (err) {
    console.error("[daemon] Uninstall failed:", err.message);
    return false;
  }
}

// ── macOS (launchd) ─────────────────────────────────────────

function _installMacOS(nodePath, scriptPath, cwd) {
  const plistName = `com.backbone.engine`;
  const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${plistName}.plist`);

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plistName}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${scriptPath}</string>
    <string>run</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${cwd}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
</dict>
</plist>`;

  try {
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(plistPath, plist);
    execSync(`launchctl load "${plistPath}"`, { stdio: "pipe" });
    console.log(`[daemon] Installed launchd service "${plistName}"`);
    return true;
  } catch (err) {
    console.error("[daemon] Install failed:", err.message);
    return false;
  }
}

function _uninstallMacOS() {
  const plistName = `com.backbone.engine`;
  const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${plistName}.plist`);
  try {
    execSync(`launchctl unload "${plistPath}"`, { stdio: "pipe" });
    fs.unlinkSync(plistPath);
    console.log(`[daemon] Removed launchd service "${plistName}"`);
    return true;
  } catch (err) {
    console.error("[daemon] Uninstall failed:", err.message);
    return false;
  }
}

// ── Linux (systemd user service) ────────────────────────────

function _installLinux(nodePath, scriptPath, cwd) {
  const unitDir = path.join(os.homedir(), ".config", "systemd", "user");
  const unitPath = path.join(unitDir, `${SERVICE_NAME}.service`);

  const unit = `[Unit]
Description=${DISPLAY_NAME}
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${scriptPath} run
WorkingDirectory=${cwd}
Restart=on-failure
RestartSec=10
StandardOutput=append:${LOG_FILE}
StandardError=append:${LOG_FILE}

[Install]
WantedBy=default.target
`;

  try {
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(unitPath, unit);
    execSync("systemctl --user daemon-reload", { stdio: "pipe" });
    execSync(`systemctl --user enable ${SERVICE_NAME}`, { stdio: "pipe" });
    console.log(`[daemon] Installed systemd user service "${SERVICE_NAME}"`);
    console.log(`[daemon] Run: systemctl --user start ${SERVICE_NAME}`);
    return true;
  } catch (err) {
    console.error("[daemon] Install failed:", err.message);
    return false;
  }
}

function _uninstallLinux() {
  try {
    execSync(`systemctl --user stop ${SERVICE_NAME}`, { stdio: "pipe" });
    execSync(`systemctl --user disable ${SERVICE_NAME}`, { stdio: "pipe" });
    const unitPath = path.join(os.homedir(), ".config", "systemd", "user", `${SERVICE_NAME}.service`);
    fs.unlinkSync(unitPath);
    execSync("systemctl --user daemon-reload", { stdio: "pipe" });
    console.log(`[daemon] Removed systemd user service "${SERVICE_NAME}"`);
    return true;
  } catch (err) {
    console.error("[daemon] Uninstall failed:", err.message);
    return false;
  }
}

// ── Start / Stop ────────────────────────────────────────────

export function startDaemon() {
  const status = getDaemonStatus();
  if (status.running) {
    console.log(`[daemon] Already running (pid: ${status.pid})`);
    return status.pid;
  }

  const scriptPath = path.resolve(import.meta.dirname || ".", "daemon.js");
  const cwd = path.resolve(scriptPath, "../../../..");

  const child = spawn(process.execPath, [scriptPath, "run"], {
    cwd,
    stdio: "ignore",
    detached: true,
    env: { ...process.env },
  });

  child.unref();
  console.log(`[daemon] Started (pid: ${child.pid})`);
  return child.pid;
}

export function stopDaemon() {
  const status = getDaemonStatus();
  if (!status.running) {
    console.log("[daemon] Not running");
    return false;
  }

  try {
    process.kill(status.pid, "SIGTERM");
    try { fs.unlinkSync(PID_FILE); } catch {}
    console.log(`[daemon] Stopped (pid: ${status.pid})`);
    return true;
  } catch (err) {
    console.error("[daemon] Stop failed:", err.message);
    return false;
  }
}

// ── CLI Entry Point ─────────────────────────────────────────

const command = process.argv[2];

if (command === "run") {
  runDaemon().catch(err => {
    console.error("[daemon] Fatal:", err);
    process.exit(1);
  });
} else if (command === "install") {
  installDaemon();
} else if (command === "uninstall") {
  uninstallDaemon();
} else if (command === "start") {
  startDaemon();
} else if (command === "stop") {
  stopDaemon();
} else if (command === "status") {
  const s = getDaemonStatus();
  console.log(JSON.stringify(s, null, 2));
} else if (command) {
  console.log(`Unknown command: ${command}`);
  console.log("Usage: daemon.js [install|uninstall|start|stop|status|run]");
}
