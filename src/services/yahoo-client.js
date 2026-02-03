import fetch from "node-fetch";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

/**
 * Yahoo Finance Client
 * Connects to the background Yahoo Finance server
 */

const SERVER_URL = process.env.YAHOO_SERVER_URL || "http://localhost:3001";
let serverProcess = null;
let serverStarting = false;

/**
 * Check if server is running
 */
export const isServerRunning = async () => {
  try {
    const response = await fetch(`${SERVER_URL}/health`, { timeout: 2000 });
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Start the Yahoo Finance server in background
 */
export const startServer = async () => {
  if (serverStarting) return false;
  serverStarting = true;

  try {
    // Check if already running
    if (await isServerRunning()) {
      serverStarting = false;
      return true;
    }

    console.log("Starting Yahoo Finance server...");

    const serverPath = path.join(process.cwd(), "src", "server", "yahoo-finance-server.js");

    // Start server as detached process
    serverProcess = spawn("node", [serverPath], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      env: { ...process.env }
    });

    serverProcess.unref();

    // Wait for server to be ready
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await isServerRunning()) {
        console.log("Yahoo Finance server started");
        serverStarting = false;
        return true;
      }
    }

    console.log("Yahoo Finance server failed to start");
    serverStarting = false;
    return false;
  } catch (error) {
    console.error("Error starting server:", error.message);
    serverStarting = false;
    return false;
  }
};

/**
 * Restart Yahoo Finance server to ensure latest code is running
 */
export const restartServer = async () => {
  try {
    if (await isServerRunning()) {
      try {
        await fetch(`${SERVER_URL}/api/shutdown`, { method: "POST" });
      } catch {
        // ignore shutdown errors
      }
      // Wait for shutdown
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 200));
        if (!(await isServerRunning())) break;
      }
    }
  } catch {
    // ignore
  }

  return startServer();
};

/**
 * Fetch tickers from server
 */
export const fetchTickers = async () => {
  try {
    // Ensure server is running
    if (!(await isServerRunning())) {
      await startServer();
      // Wait a bit for initial data
      await new Promise(r => setTimeout(r, 2000));
    }

    const response = await fetch(`${SERVER_URL}/api/tickers`);
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    // Fall back to cached data
    try {
      const cachePath = path.join(process.cwd(), "data", "tickers-cache.json");
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
 * Fetch single ticker from server
 */
export const fetchTicker = async (symbol) => {
  try {
    if (!(await isServerRunning())) {
      await startServer();
    }

    const response = await fetch(`${SERVER_URL}/api/ticker/${symbol}`);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.ticker;
  } catch {
    return null;
  }
};

/**
 * Force refresh tickers
 */
export const refreshTickers = async () => {
  try {
    if (!(await isServerRunning())) {
      await startServer();
    }

    const response = await fetch(`${SERVER_URL}/api/refresh`, { method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Trigger a full scan of all TICKER_UNIVERSE on the server
 * @param {boolean} force - If true, aborts any running scan, clears all lastEvaluated, and restarts from scratch
 */
export const triggerFullScan = async (force = false) => {
  try {
    if (!(await isServerRunning())) {
      await startServer();
    }

    const response = await fetch(`${SERVER_URL}/api/full-scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force })
    });
    if (response.ok) {
      const data = await response.json();
      return data;
    }
    return { success: false, error: "Server error" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Clear the ticker blacklist so the full universe is scanned again
 */
export const clearBlacklist = async () => {
  try {
    if (!(await isServerRunning())) {
      await startServer();
    }

    const response = await fetch(`${SERVER_URL}/api/clear-blacklist`, { method: "POST" });
    if (response.ok) {
      return await response.json();
    }
    return { success: false, error: "Server error" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Get server status
 */
export const getServerStatus = async () => {
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    if (response.ok) {
      return await response.json();
    }
    return { status: "offline" };
  } catch {
    return { status: "offline" };
  }
};
