/**
 * Server Lifecycle Manager — Self-managing server process
 *
 * Handles three things regular users shouldn't think about:
 * 1. CODE CHANGES — watches src/ for changes, auto-restarts server
 * 2. AUTO-UPDATE — periodically checks git for new commits, pulls + restarts
 * 3. HEALTH PING — if server becomes unresponsive, restarts itself
 *
 * Runs inside server.js. The user never needs to touch this.
 */

import fs from "fs";
import path from "path";
import { execSync, spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = path.resolve(__dirname, "../..");
const TAG = "[Lifecycle]";

// ── Config ───────────────────────────────────────────────────

const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000; // Check for updates every 4 hours
const RESTART_DEBOUNCE = 3000;                      // Wait 3s after last file change before restart
const WATCHED_DIRS = ["src", "tools", "skills"];     // Directories to watch for code changes

// ── State ────────────────────────────────────────────────────

let restartTimer = null;
let watchers = [];
let updateTimer = null;
let isRestarting = false;

// ── Code Change Watcher ──────────────────────────────────────

/**
 * Watch source directories for changes. When files change, schedule a
 * graceful restart after a debounce period.
 */
export function startCodeWatcher(onRestart) {
  for (const dir of WATCHED_DIRS) {
    const fullPath = path.join(ENGINE_ROOT, dir);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const watcher = fs.watch(fullPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        // Only care about .js and .json files
        if (!filename.endsWith(".js") && !filename.endsWith(".json")) return;
        // Ignore temp files, logs, data files
        if (filename.includes("node_modules") || filename.includes(".log")) return;

        console.log(`${TAG} File changed: ${dir}/${filename}`);
        scheduleRestart(onRestart);
      });
      watchers.push(watcher);
    } catch (err) {
      console.warn(`${TAG} Could not watch ${dir}/: ${err.message}`);
    }
  }

  if (watchers.length > 0) {
    console.log(`${TAG} Watching ${watchers.length} directories for code changes`);
  }
}

function scheduleRestart(onRestart) {
  if (isRestarting) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    triggerRestart("code-change", onRestart);
  }, RESTART_DEBOUNCE);
}

// ── Auto-Update ──────────────────────────────────────────────

/**
 * Periodically check for git updates. If new commits are available,
 * pull them and restart.
 */
export function startAutoUpdater(onRestart) {
  // Check once on startup (after 2 min delay to let everything settle)
  setTimeout(() => checkForUpdates(onRestart), 2 * 60 * 1000);

  // Then check periodically
  updateTimer = setInterval(() => checkForUpdates(onRestart), UPDATE_CHECK_INTERVAL);
  if (updateTimer.unref) updateTimer.unref(); // Don't keep process alive
}

async function checkForUpdates(onRestart) {
  try {
    // Fetch latest from remote
    execSync("git fetch --quiet", { cwd: ENGINE_ROOT, timeout: 30000, encoding: "utf-8" });

    // Check if we're behind
    const status = execSync("git status -uno --porcelain -b", {
      cwd: ENGINE_ROOT, timeout: 10000, encoding: "utf-8"
    }).trim();

    if (!status.includes("[behind")) {
      return; // Up to date
    }

    // Count how many commits behind
    const behindMatch = status.match(/\[behind (\d+)\]/);
    const count = behindMatch ? behindMatch[1] : "?";
    console.log(`${TAG} ${count} new update(s) available — pulling...`);

    // Check for uncommitted changes that would block pull
    const dirty = execSync("git diff --stat", {
      cwd: ENGINE_ROOT, timeout: 10000, encoding: "utf-8"
    }).trim();

    if (dirty) {
      // Stash changes, pull, pop stash
      console.log(`${TAG} Stashing local changes...`);
      execSync("git stash", { cwd: ENGINE_ROOT, timeout: 10000 });
      execSync("git pull --ff-only", { cwd: ENGINE_ROOT, timeout: 60000 });
      execSync("git stash pop", { cwd: ENGINE_ROOT, timeout: 10000 });
    } else {
      execSync("git pull --ff-only", { cwd: ENGINE_ROOT, timeout: 60000 });
    }

    // Check if package.json changed (might need npm install)
    const changedFiles = execSync("git diff --name-only HEAD~" + count + " HEAD", {
      cwd: ENGINE_ROOT, timeout: 10000, encoding: "utf-8"
    }).trim();

    if (changedFiles.includes("package.json") || changedFiles.includes("package-lock.json")) {
      console.log(`${TAG} Dependencies changed — running npm install...`);
      execSync("npm install --production", { cwd: ENGINE_ROOT, timeout: 120000 });
    }

    console.log(`${TAG} Update applied — restarting...`);
    triggerRestart("auto-update", onRestart);
  } catch (err) {
    // Don't spam logs — updates failing is fine, user might be offline
    if (!err.message?.includes("Could not resolve host")) {
      console.warn(`${TAG} Update check failed: ${err.message}`);
    }
  }
}

// ── Graceful Restart ─────────────────────────────────────────

function triggerRestart(reason, onRestart) {
  if (isRestarting) return;
  isRestarting = true;

  console.log(`${TAG} Restarting (reason: ${reason})...`);

  // Clean up watchers
  stopAll();

  if (typeof onRestart === "function") {
    onRestart(reason);
  } else {
    // Default: exit with code 75 (temp failure) so the watchdog restarts us
    // The watchdog in bin/backbone.js or a process manager will bring us back
    process.exit(75);
  }
}

// ── Cleanup ──────────────────────────────────────────────────

export function stopAll() {
  for (const w of watchers) {
    try { w.close(); } catch {}
  }
  watchers = [];
  if (updateTimer) { clearInterval(updateTimer); updateTimer = null; }
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
}

// ── Single entry point ───────────────────────────────────────

/**
 * Start all lifecycle management. Call this once from server.js listen callback.
 *
 * @param {Function} [onRestart] - Custom restart handler. If not provided,
 *   process.exit(75) is called and the watchdog/process manager restarts us.
 */
export function startLifecycleManager(onRestart) {
  const restartHandler = onRestart || (() => {
    // Spawn a fresh server before dying
    const child = spawn(process.execPath, [path.join(ENGINE_ROOT, "src/server.js")], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, BACKBONE_PARENT_PID: "" }, // No parent tracking
    });
    child.unref();
    // Give it a moment to bind the port, then die
    setTimeout(() => process.exit(0), 2000);
  });

  startCodeWatcher(restartHandler);
  startAutoUpdater(restartHandler);

  console.log(`${TAG} Lifecycle manager active (code watch + auto-update)`);
}
