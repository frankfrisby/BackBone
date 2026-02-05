import { spawn } from "child_process";
import path from "path";
import fetch from "node-fetch";

/**
 * API Server Client
 * Manages the background API server (port 3000) that the web app connects to.
 * Spawns src/server.js as a detached process, similar to yahoo-client.js pattern.
 */

const SERVER_URL = process.env.API_SERVER_URL || "http://localhost:3000";
let serverProcess = null;
let serverStarting = false;

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
 * Start the API server in the background
 */
export const startApiServer = async () => {
  if (serverStarting) return false;
  serverStarting = true;

  try {
    // Check if already running
    if (await isServerRunning()) {
      console.log("[API Server] Already running on port 3000");
      serverStarting = false;
      return true;
    }

    console.log("[API Server] Starting background server...");

    const serverPath = path.join(process.cwd(), "src", "server.js");

    // Start server as detached process
    serverProcess = spawn("node", [serverPath], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      env: { ...process.env }
    });

    serverProcess.unref();

    // Wait for server to be ready (up to 5 seconds)
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await isServerRunning()) {
        console.log("[API Server] Started successfully on port 3000");
        serverStarting = false;
        return true;
      }
    }

    console.log("[API Server] Failed to start within 5s");
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
    // Also try to kill any server on port 3000
    if (process.platform === "win32") {
      spawn("npx", ["kill-port", "3000"], {
        cwd: process.cwd(),
        detached: true,
        stdio: "ignore",
        shell: true
      }).unref();
    }
  } catch {
    // Best effort
  }
};

/**
 * Restart the API server
 */
export const restartApiServer = async () => {
  await stopApiServer();
  await new Promise(r => setTimeout(r, 1000));
  return startApiServer();
};

export default { isServerRunning, startApiServer, stopApiServer, restartApiServer };
