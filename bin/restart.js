#!/usr/bin/env node
/**
 * Restart BACKBONE server cleanly.
 *
 * Usage: npm run restart
 *        node bin/restart.js
 */

import fs from "fs";
import path from "path";
import { execSync, spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Find PID file — try both possible data dirs
function findPidFile() {
  const candidates = [
    path.join(process.env.HOME || process.env.USERPROFILE, ".backbone", "users"),
  ];

  // Read active user
  try {
    const activeUserFile = path.join(process.env.HOME || process.env.USERPROFILE, ".backbone", "active-user.json");
    if (fs.existsSync(activeUserFile)) {
      const { uid } = JSON.parse(fs.readFileSync(activeUserFile, "utf-8"));
      if (uid) {
        const pidPath = path.join(process.env.HOME || process.env.USERPROFILE, ".backbone", "users", uid, "data", "server.pid");
        if (fs.existsSync(pidPath)) return pidPath;
      }
    }
  } catch {}

  // Fallback: search for any server.pid
  try {
    const usersDir = path.join(process.env.HOME || process.env.USERPROFILE, ".backbone", "users");
    if (fs.existsSync(usersDir)) {
      for (const uid of fs.readdirSync(usersDir)) {
        const pidPath = path.join(usersDir, uid, "data", "server.pid");
        if (fs.existsSync(pidPath)) return pidPath;
      }
    }
  } catch {}

  return null;
}

// Step 1: Kill existing server
const pidFile = findPidFile();
if (pidFile) {
  try {
    const { pid } = JSON.parse(fs.readFileSync(pidFile, "utf-8"));
    console.log(`Stopping server (PID ${pid})...`);
    try {
      process.kill(pid, "SIGTERM");
    } catch (e) {
      if (e.code !== "ESRCH") { // ESRCH = process not found (already dead)
        // Force kill on Windows
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" }); } catch {}
      }
    }
    // Clean up PID file
    try { fs.unlinkSync(pidFile); } catch {}
    // Wait for port to free up
    await new Promise(r => setTimeout(r, 2000));
    console.log("Server stopped.");
  } catch (e) {
    console.log("No running server found, starting fresh.");
  }
} else {
  console.log("No PID file found, starting fresh.");
}

// Step 2: Start new server
console.log("Starting BACKBONE server...");
const child = spawn("node", ["src/server.js"], {
  cwd: ROOT,
  stdio: "inherit",
  detached: false,
});

child.on("error", (err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
