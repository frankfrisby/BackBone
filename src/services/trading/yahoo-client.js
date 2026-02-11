import fetch from "node-fetch";
import { spawn } from "child_process";
import net from "net";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { dataFile } from "../paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Yahoo Finance Client
 *
 * Defensive behaviors:
 * - Uses timeouts for health checks so a stuck port does not hang startup.
 * - If the default port is held by an orphaned process, it can start on the next free port.
 * - When this client spawns the server, it attempts to stop it on CLI exit.
 */

const DEFAULT_HOST = process.env.YAHOO_SERVER_HOST || "127.0.0.1";
const DEFAULT_PORT = Number(process.env.YAHOO_SERVER_PORT) || 3002;
const PORT_SCAN_COUNT = Math.max(1, Number(process.env.YAHOO_SERVER_PORT_SCAN_COUNT) || 12);

let serverUrl = process.env.YAHOO_SERVER_URL || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
let serverProcess = null;
let serverStarting = false;
let cleanupRegistered = false;
let lastStartError = null;

export const getServerUrl = () => serverUrl;
export const getLastStartError = () => lastStartError;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithTimeout(url, init = {}, timeoutMs = 2000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function isServerRunningAt(url) {
  try {
    const response = await fetchWithTimeout(`${url}/health`, {}, 1500);
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    return !!(data && data.status === "ok");
  } catch {
    return false;
  }
}

function candidatePorts() {
  const ports = [];
  for (let i = 0; i < PORT_SCAN_COUNT; i++) ports.push(DEFAULT_PORT + i);
  return ports;
}

async function findHealthyServerUrl() {
  // If the user explicitly sets YAHOO_SERVER_URL, we do not scan or mutate it.
  if (process.env.YAHOO_SERVER_URL) {
    return (await isServerRunningAt(serverUrl)) ? serverUrl : null;
  }

  // Prefer current URL (avoids flapping if we already moved ports).
  if (await isServerRunningAt(serverUrl)) return serverUrl;

  for (const port of candidatePorts()) {
    const url = `http://${DEFAULT_HOST}:${port}`;
    if (await isServerRunningAt(url)) return url;
  }

  return null;
}

async function isPortAvailable(port) {
  return await new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, DEFAULT_HOST);
  });
}

async function pickPortToStart() {
  for (const port of candidatePorts()) {
    if (await isPortAvailable(port)) return port;
  }
  for (let port = DEFAULT_PORT + PORT_SCAN_COUNT; port < DEFAULT_PORT + PORT_SCAN_COUNT + 30; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error("No free local port found to start Yahoo Finance server");
}

function registerCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const stop = () => {
    if (!serverProcess || serverProcess.killed) return;
    try {
      serverProcess.kill("SIGTERM");
    } catch {
      // ignore
    }
  };

  process.on("exit", stop);
  process.on("SIGINT", () => {
    stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit(0);
  });
}

/**
 * Check if server is running.
 */
export const isServerRunning = async () => {
  const healthy = await findHealthyServerUrl();
  if (!healthy) return false;
  serverUrl = healthy;
  return true;
};

/**
 * Start the Yahoo Finance server in the background.
 */
export const startServer = async () => {
  if (serverStarting) return false;
  serverStarting = true;
  lastStartError = null;

  try {
    const healthy = await findHealthyServerUrl();
    if (healthy) {
      serverUrl = healthy;
      serverStarting = false;
      return true;
    }

    // If the user explicitly set a server URL and it's not healthy, do not spawn anything.
    if (process.env.YAHOO_SERVER_URL) {
      serverStarting = false;
      return false;
    }

    const port = await pickPortToStart();
    serverUrl = `http://${DEFAULT_HOST}:${port}`;
    console.log(`Starting Yahoo Finance server on ${serverUrl}...`);

    // NOTE: This file lives at src/server/yahoo-finance-server.js (not under src/services).
    const serverPath = path.resolve(__dirname, "..", "..", "server", "yahoo-finance-server.js");
    if (!fs.existsSync(serverPath)) {
      lastStartError = `Server script not found: ${serverPath}`;
      console.error("[Yahoo] " + lastStartError);
      serverStarting = false;
      return false;
    }

    // Persist output for debugging without flooding the CLI UI.
    const logPath = dataFile("yahoo-server.log");
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
    } catch { /* ignore */ }
    let logStream = null;
    try {
      logStream = fs.createWriteStream(logPath, { flags: "a" });
      // In sandboxed environments, opening ~/.backbone may be blocked; don't crash if logging fails.
      logStream.on("error", () => {});
    } catch {
      logStream = null;
    }

    try {
      // Use the current Node runtime (more reliable than relying on PATH).
      const nodePath = process.execPath || "node";
      serverProcess = spawn(nodePath, [serverPath], {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          YAHOO_SERVER_PORT: String(port),
          // Prevent a huge full-scan from auto-starting on boot. The app triggers scans explicitly.
          YAHOO_SERVER_AUTO_FULL_SCAN: "0",
          // If the CLI is killed (e.g., terminal window closed), let the server self-terminate.
          BACKBONE_PARENT_PID: String(process.pid),
        }
      });
    } catch (err) {
      lastStartError = err?.message || String(err);
      console.error("[Yahoo] Failed to spawn server process:", lastStartError);
      serverStarting = false;
      return false;
    }

    // Capture early stderr output so we can surface useful errors (missing file, syntax error, etc.)
    let stderrSnippet = "";
    try {
      serverProcess.stderr?.on("data", (chunk) => {
        if (stderrSnippet.length >= 4000) return;
        stderrSnippet += String(chunk);
        if (stderrSnippet.length > 4000) stderrSnippet = stderrSnippet.slice(0, 4000);
      });
    } catch { /* ignore */ }

    serverProcess.on("error", (err) => {
      lastStartError = err?.message || String(err);
      console.error("[Yahoo] Server process error:", lastStartError);
    });

    serverProcess.on("exit", (code, signal) => {
      // Only record an error if we weren't already healthy.
      if (!lastStartError) {
        const trimmed = String(stderrSnippet || "").trim();
        if (trimmed) {
          lastStartError = trimmed.split("\n").slice(-6).join("\n"); // keep last few lines
        } else if (code !== null || signal) {
          lastStartError = `Yahoo server exited during startup (code ${code ?? "?"}${signal ? `, signal ${signal}` : ""})`;
        }
      }
    });

    if (logStream) {
      serverProcess.stdout?.pipe(logStream);
      serverProcess.stderr?.pipe(logStream);
    }

    registerCleanup();

    for (let i = 0; i < 20; i++) {
      await sleep(500);
      if (await isServerRunningAt(serverUrl)) {
        console.log("Yahoo Finance server started");
        serverStarting = false;
        return true;
      }
      if (serverProcess.exitCode !== null) break;
    }

    console.log("Yahoo Finance server failed to start");
    serverStarting = false;
    return false;
  } catch (error) {
    console.error("Error starting server:", error.message);
    lastStartError = error?.message || String(error);
    serverStarting = false;
    return false;
  }
};

/**
 * Restart the Yahoo Finance server to ensure latest code is running.
 */
export const restartServer = async () => {
  try {
    if (await isServerRunning()) {
      try {
        await fetchWithTimeout(`${serverUrl}/api/shutdown`, { method: "POST" }, 1500);
      } catch {
        // ignore shutdown errors
      }
      // Wait for shutdown
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        await sleep(200);
        if (!(await isServerRunning())) break;
      }
    }
  } catch {
    // ignore
  }

  return startServer();
};

/**
 * Fetch tickers from server.
 */
export const fetchTickers = async () => {
  try {
    if (!(await isServerRunning())) {
      const started = await startServer();
      if (!started || !(await isServerRunning())) {
        throw new Error(lastStartError ? `Yahoo server failed to start: ${lastStartError}` : "Yahoo server is offline");
      }
      await sleep(2000);
    }

    const response = await fetch(`${serverUrl}/api/tickers`);
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    // Fall back to cached data
    try {
      const cachePath = dataFile("tickers-cache.json");
      if (fs.existsSync(cachePath)) {
        const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
        return { success: true, tickers: cached.tickers, lastUpdate: cached.lastUpdate, fromCache: true };
      }
    } catch {
      // ignore
    }

    return { success: false, tickers: [], error: error.message };
  }
};

/**
 * Fetch a single ticker from server.
 */
export const fetchTicker = async (symbol) => {
  try {
    if (!(await isServerRunning())) {
      const started = await startServer();
      if (!started || !(await isServerRunning())) {
        return null;
      }
    }

    const response = await fetch(`${serverUrl}/api/ticker/${symbol}`);
    if (!response.ok) return null;

    const data = await response.json();
    return data.ticker;
  } catch {
    return null;
  }
};

/**
 * Force refresh tickers (core list).
 */
export const refreshTickers = async () => {
  try {
    if (!(await isServerRunning())) {
      const started = await startServer();
      if (!started || !(await isServerRunning())) {
        return false;
      }
    }

    const response = await fetch(`${serverUrl}/api/refresh`, { method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Trigger a full scan of all tickers on the server.
 * @param {boolean} force - If true, aborts any running scan, clears all lastEvaluated, and restarts from scratch.
 */
export const triggerFullScan = async (force = false) => {
  try {
    if (!(await isServerRunning())) {
      const started = await startServer();
      if (!started || !(await isServerRunning())) {
        return { success: false, error: lastStartError ? `Yahoo server failed to start: ${lastStartError}` : "Yahoo server is offline" };
      }
    }

    const response = await fetch(`${serverUrl}/api/full-scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force })
    });
    if (response.ok) {
      return await response.json();
    }
    return { success: false, error: "Server error" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Clear the ticker blacklist so the full universe is scanned again.
 */
export const clearBlacklist = async () => {
  try {
    if (!(await isServerRunning())) {
      const started = await startServer();
      if (!started || !(await isServerRunning())) {
        return { success: false, error: lastStartError ? `Yahoo server failed to start: ${lastStartError}` : "Yahoo server is offline" };
      }
    }

    const response = await fetch(`${serverUrl}/api/clear-blacklist`, { method: "POST" });
    if (response.ok) {
      return await response.json();
    }
    return { success: false, error: "Server error" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Get server status.
 */
export const getServerStatus = async () => {
  try {
    const response = await fetchWithTimeout(`${serverUrl}/health`, {}, 1500);
    if (response.ok) return await response.json();
    return { status: "offline" };
  } catch {
    return { status: "offline" };
  }
};

// Research Convictions API

export const getConvictions = async () => {
  try {
    if (!(await isServerRunning())) {
      const started = await startServer();
      if (!started || !(await isServerRunning())) {
        return { success: false, error: lastStartError ? `Yahoo server failed to start: ${lastStartError}` : "Yahoo server is offline" };
      }
    }

    const response = await fetch(`${serverUrl}/api/convictions`);
    if (response.ok) return await response.json();
    return { success: false, error: "Server error" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const addConviction = async (symbol, conviction, reason, options = {}) => {
  try {
    if (!(await isServerRunning())) {
      const started = await startServer();
      if (!started || !(await isServerRunning())) {
        return { success: false, error: lastStartError ? `Yahoo server failed to start: ${lastStartError}` : "Yahoo server is offline" };
      }
    }

    const response = await fetch(`${serverUrl}/api/convictions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, conviction, reason, ...options })
    });

    if (response.ok) return await response.json();
    return { success: false, error: "Server error" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const bulkAddConvictions = async (tickers, source = "ai-research") => {
  try {
    if (!(await isServerRunning())) {
      const started = await startServer();
      if (!started || !(await isServerRunning())) {
        return { success: false, error: lastStartError ? `Yahoo server failed to start: ${lastStartError}` : "Yahoo server is offline" };
      }
    }

    const response = await fetch(`${serverUrl}/api/convictions/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers, source })
    });

    if (response.ok) return await response.json();
    return { success: false, error: "Server error" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const removeConviction = async (symbol) => {
  try {
    if (!(await isServerRunning())) {
      const started = await startServer();
      if (!started || !(await isServerRunning())) {
        return { success: false, error: lastStartError ? `Yahoo server failed to start: ${lastStartError}` : "Yahoo server is offline" };
      }
    }

    const response = await fetch(`${serverUrl}/api/convictions/${symbol}`, { method: "DELETE" });
    if (response.ok) return await response.json();
    return { success: false, error: "Server error" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const clearConvictions = async () => {
  try {
    if (!(await isServerRunning())) {
      const started = await startServer();
      if (!started || !(await isServerRunning())) {
        return { success: false, error: lastStartError ? `Yahoo server failed to start: ${lastStartError}` : "Yahoo server is offline" };
      }
    }

    const response = await fetch(`${serverUrl}/api/convictions/clear`, { method: "POST" });
    if (response.ok) return await response.json();
    return { success: false, error: "Server error" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
