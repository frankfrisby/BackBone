import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { getDataDir } from "./paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * API Server Client
 * Manages the background API server (port 3000) that the web app connects to.
 * Spawns src/server.js as a child process.
 *
 * On startup, ALWAYS kills any stale server and restarts fresh. This ensures
 * code changes are always picked up — no more stale servers after closing the CLI.
 */

const SERVER_URL = process.env.API_SERVER_URL || "http://localhost:3000";
const PID_FILE = path.join(getDataDir(), "server.pid");
let serverProcess = null;
let serverStarting = false;
let exitHandlersInstalled = false;

/**
 * Check if the API server is running
 */
export const isServerRunning = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${SERVER_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Kill any stale server from a previous CLI session.
 * Uses the PID file written by server.js, falls back to port-based kill on Windows.
 */
const killStaleServer = async () => {
  // Try PID file first
  try {
    if (fs.existsSync(PID_FILE)) {
      const data = JSON.parse(fs.readFileSync(PID_FILE, "utf-8"));
      if (data.pid) {
        try {
          process.kill(data.pid, 0); // Check if alive
          process.kill(data.pid);    // Kill it
          console.log(`[API Server] Killed stale server (PID ${data.pid} from ${data.startedAt || "unknown"})`);
          await new Promise(r => setTimeout(r, 1000));
        } catch {
          // Process already dead
        }
        try { fs.unlinkSync(PID_FILE); } catch {}
      }
    }
  } catch {}

  // If still running (PID file might be stale), kill by port on Windows
  if (await isServerRunning()) {
    try {
      if (process.platform === "win32") {
        const output = execSync('netstat -ano | findstr ":3000" | findstr "LISTENING"', { encoding: "utf-8", timeout: 3000 });
        const lines = output.trim().split("\n");
        for (const line of lines) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && /^\d+$/.test(pid) && parseInt(pid) !== process.pid) {
            try {
              process.kill(parseInt(pid));
              console.log(`[API Server] Killed stale server on port 3000 (PID ${pid})`);
            } catch {}
          }
        }
      } else {
        execSync("lsof -ti:3000 | xargs kill -9 2>/dev/null || true", { timeout: 3000 });
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch {
      // Best effort
    }
  }
};

/**
 * Start the API server in the background.
 * Always kills any stale server first to ensure fresh code is loaded.
 */
export const startApiServer = async () => {
  if (serverStarting) return false;
  serverStarting = true;

  try {
    // Always kill stale server to ensure fresh code
    if (await isServerRunning()) {
      console.log("[API Server] Found existing server — restarting with fresh code...");
      await killStaleServer();
    }

    console.log("[API Server] Starting server...");

    const serverPath = path.resolve(__dirname, "..", "server.js");

    // Start server as a child process so it stops when the CLI exits
    serverProcess = spawn("node", [serverPath], {
      detached: false,
      stdio: "ignore",
      env: {
        ...process.env,
        BACKBONE_NO_BROWSER: "1",
        // If the CLI window is closed abruptly on Windows, our exit handlers may not run.
        // Let the server self-terminate when the parent PID disappears.
        BACKBONE_PARENT_PID: String(process.pid),
      }
    });
    if (!exitHandlersInstalled) {
      exitHandlersInstalled = true;
      const shutdown = async () => {
        await stopApiServer();
      };
      process.on("exit", shutdown);
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
      process.on("SIGBREAK", shutdown);
      process.on("SIGHUP", shutdown);
    }

    // Wait for server to be ready (up to 8 seconds)
    for (let i = 0; i < 16; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await isServerRunning()) {
        console.log("[API Server] Started successfully on port 3000");
        serverStarting = false;
        return true;
      }
    }

    console.log("[API Server] Failed to start within 8s");
    serverStarting = false;
    return false;
  } catch (error) {
    console.error("[API Server] Error starting:", error.message);
    serverStarting = false;
    return false;
  }
};

/**
 * Stop the API server
 */
export const stopApiServer = async () => {
  try {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
    // Also clean up PID file
    try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch {}
  } catch {
    // Best effort
  }
};

/**
 * Restart the API server
 */
export const restartApiServer = async () => {
  await stopApiServer();
  await killStaleServer();
  await new Promise(r => setTimeout(r, 1000));
  return startApiServer();
};

export default { isServerRunning, startApiServer, stopApiServer, restartApiServer };
