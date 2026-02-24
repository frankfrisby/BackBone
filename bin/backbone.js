#!/usr/bin/env node
import "dotenv/config";
import { createElement } from "react";
import { render } from "ink";
import { exec, execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { format as formatValue } from "util";
import { Writable } from "stream";
import { ensureUserDirs, dataFile, memoryFile, getDataDir, getBackboneHome, getBackboneRoot, getEngineRoot, getActiveUserId, getActiveUser, migrateToUserScoped, isLegacyInstall } from "../src/services/paths.js";
import { mountAllExtensions } from "../src/services/mount-user-extensions.js";

// ── Singleton lock — prevent multiple instances ────────────────
const LOCK_FILE = dataFile(".backbone.lock");

const acquireLock = () => {
  try {
    // Ensure data dir exists
    const dataDir = getDataDir();
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    // Check if lock file exists and if the process is still alive
    if (fs.existsSync(LOCK_FILE)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, "utf-8"));
        const pid = lockData.pid;

        // Check if the process is still running AND is actually a node process
        // (Windows reuses PIDs aggressively, so a stale lock can match an unrelated process)
        if (pid) {
          let isBackboneAlive = false;
          try {
            process.kill(pid, 0); // Signal 0 = check if process exists
            // PID is alive — verify it's actually node, not a recycled PID
            if (process.platform === "win32") {
              try {
                const result = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName"`, { encoding: "utf-8", timeout: 3000 }).trim().toLowerCase();
                isBackboneAlive = result === "node";
              } catch {
                // Can't verify — assume stale
              }
            } else {
              // On Unix, PIDs recycle less aggressively; trust the signal check
              isBackboneAlive = true;
            }
          } catch {
            // Process is dead — stale lock
          }

          if (isBackboneAlive) {
            process.exit(0);
          }
        }
      } catch {
        // Corrupt lock file — overwrite it
      }
    }

    // Write our lock
    fs.writeFileSync(LOCK_FILE, JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString()
    }));
  } catch {
    // If we can't write the lock, continue anyway
  }
};

const releaseLock = () => {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, "utf-8"));
      // Only delete if it's our lock
      if (lockData.pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch {
    // Best effort
  }
};

// ── First-run scaffolding — create required directories and config ──
const ensureFirstRun = () => {
  // Migrate flat ~/.backbone/{data,memory,...} → ~/.backbone/users/default/
  // No-op if already migrated (dirs don't exist at root level)
  migrateToUserScoped();

  // Create all user-data directories (data, memory, projects, skills, mcp, tools)
  ensureUserDirs();

  // Also ensure engine skills/ dir exists alongside the code
  const skillsDir = path.join(getEngineRoot(), "skills");
  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });

  // Mount user extensions — merges user MCP/skills/tools with engine defaults
  mountAllExtensions();

  // Seed essential data files if they don't exist
  const seeds = {
    [dataFile("goals.json")]: "[]",
    [dataFile("core-beliefs.json")]: JSON.stringify({
      beliefs: [
        { id: "belief_1", name: "Build wealth", description: "Grow financial independence through smart investing and income growth" },
        { id: "belief_2", name: "Be healthy", description: "Optimize physical and mental health through exercise, sleep, and nutrition" },
        { id: "belief_3", name: "Grow continuously", description: "Never stop learning — invest in skills, knowledge, and personal development" }
      ]
    }, null, 2),
    [dataFile("life-scores.json")]: JSON.stringify({
      overall: 50,
      categories: {
        finance: { score: 50, trend: "stable" },
        health: { score: 50, trend: "stable" },
        family: { score: 50, trend: "stable" },
        career: { score: 50, trend: "stable" },
        growth: { score: 50, trend: "stable" },
        education: { score: 50, trend: "stable" }
      }
    }, null, 2),
    [dataFile("user-settings.json")]: JSON.stringify({ theme: "dark", quietHoursStart: 22, quietHoursEnd: 7 }, null, 2),
    [dataFile("backlog.json")]: JSON.stringify({ items: [], graduatedToGoals: [], dismissed: [], lastUpdated: null, stats: { totalGenerated: 0, totalGraduated: 0, totalDismissed: 0 } }, null, 2),
    [dataFile("user-skills/index.json")]: "[]",
  };

  // Seed memory file
  const backboneMdPath = memoryFile("BACKBONE.md");
  if (!fs.existsSync(backboneMdPath)) {
    fs.writeFileSync(backboneMdPath, "# BACKBONE Engine Memory\\n\\nThis file stores persistent memory across sessions.\\n");
  }

  for (const [fullPath, content] of Object.entries(seeds)) {
    if (!fs.existsSync(fullPath)) {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, content);
    }
  }
};

ensureFirstRun();

// ── CLI subcommands — run before TUI if args match ───────────────
const cliArgs = process.argv.slice(2);
if (cliArgs.length > 0) {
  const { handleCliSubcommand } = await import("../src/cli/index.js");
  const handled = await handleCliSubcommand(cliArgs);
  if (handled) process.exit(0);
}

// Acquire lock before anything else
acquireLock();

// ── Runtime log routing (prevents console output from destabilizing Ink UI) ─────────────
const RUNTIME_LOG_PATH = dataFile("runtime.log");
const LOG_WINDOW_LOCK_PATH = dataFile(".runtime-log-window.lock");

let runtimeLogStream = null;
let originalConsoleMethods = null;
let originalStderrWrite = null;
let logRoutingInitialized = false;

const parseDiagnosticsSettings = () => {
  try {
    const settingsPath = dataFile("user-settings.json");
    if (!fs.existsSync(settingsPath)) {
      return {
        separateLogWindow: true,
        mirrorConsoleInMainWindow: false
      };
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const diagnostics = settings?.diagnostics || {};
    return {
      separateLogWindow: typeof diagnostics.separateLogWindow === "boolean"
        ? diagnostics.separateLogWindow
        : true,
      mirrorConsoleInMainWindow: typeof diagnostics.mirrorConsoleInMainWindow === "boolean"
        ? diagnostics.mirrorConsoleInMainWindow
        : false
    };
  } catch {
    return {
      separateLogWindow: true,
      mirrorConsoleInMainWindow: false
    };
  }
};

const ensureRuntimeLogFile = () => {
  try {
    const dir = path.dirname(RUNTIME_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(RUNTIME_LOG_PATH)) fs.writeFileSync(RUNTIME_LOG_PATH, "");
    if (!runtimeLogStream) {
      runtimeLogStream = fs.createWriteStream(RUNTIME_LOG_PATH, { flags: "a" });
    }
  } catch {
    // Best effort only.
  }
};

const writeRuntimeLog = (level, message) => {
  try {
    ensureRuntimeLogFile();
    if (!runtimeLogStream) return;
    const timestamp = new Date().toISOString();
    const lines = String(message ?? "").split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      runtimeLogStream.write(`[${timestamp}] [${level}] ${line}\n`);
    }
  } catch {
    // Never break app flow from diagnostics logging.
  }
};

const isPidAlive = (pid) => {
  if (!pid || Number.isNaN(Number(pid))) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
};

const maybeLaunchLogWindow = (enabled) => {
  if (!enabled) return;
  if (process.platform !== "win32") return;

  try {
    if (fs.existsSync(LOG_WINDOW_LOCK_PATH)) {
      const lock = JSON.parse(fs.readFileSync(LOG_WINDOW_LOCK_PATH, "utf-8"));
      if (isPidAlive(lock?.pid)) return;
    }
  } catch {}

  try {
    const escapedPath = RUNTIME_LOG_PATH.replace(/'/g, "''");
    const psCommand = [
      `$p='${escapedPath}'`,
      "if (!(Test-Path -LiteralPath $p)) { New-Item -ItemType File -Path $p -Force | Out-Null }",
      "$host.UI.RawUI.WindowTitle='BACKBONE Diagnostics'",
      "Write-Host 'BACKBONE diagnostics log stream' -ForegroundColor Cyan",
      "Write-Host ('File: ' + $p) -ForegroundColor DarkGray",
      "Get-Content -LiteralPath $p -Tail 120 -Wait"
    ].join("; ");

    const child = spawn("powershell.exe", [
      "-NoLogo",
      "-NoExit",
      "-ExecutionPolicy",
      "Bypass",
      "-WindowStyle",
      "Minimized",
      "-Command",
      psCommand
    ], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    child.unref();

    fs.writeFileSync(LOG_WINDOW_LOCK_PATH, JSON.stringify({
      pid: child.pid,
      launchedAt: new Date().toISOString(),
      logPath: RUNTIME_LOG_PATH
    }, null, 2));
  } catch (err) {
    writeRuntimeLog("WARN", `Failed to launch diagnostics window: ${err?.message || err}`);
  }
};

const initRuntimeLogRouting = () => {
  if (logRoutingInitialized) return;
  logRoutingInitialized = true;

  const settings = parseDiagnosticsSettings();
  const mirrorConsoleInMainWindow = process.env.BACKBONE_CONSOLE_MIRROR
    ? process.env.BACKBONE_CONSOLE_MIRROR === "1"
    : settings.mirrorConsoleInMainWindow;
  const separateLogWindow = process.env.BACKBONE_LOG_WINDOW
    ? process.env.BACKBONE_LOG_WINDOW === "1"
    : settings.separateLogWindow;

  ensureRuntimeLogFile();
  writeRuntimeLog("SYSTEM", "Runtime diagnostics logging initialized");
  writeRuntimeLog("SYSTEM", `Main console mirror: ${mirrorConsoleInMainWindow ? "enabled" : "disabled"}`);
  writeRuntimeLog("SYSTEM", `Separate log window: ${separateLogWindow ? "enabled" : "disabled"}`);

  originalConsoleMethods = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
  };

  const routeConsole = (level, originalMethod, args) => {
    const text = formatValue(...args);
    writeRuntimeLog(level, text);
    if (mirrorConsoleInMainWindow) {
      originalMethod(...args);
    }
  };

  console.log = (...args) => routeConsole("INFO", originalConsoleMethods.log, args);
  console.info = (...args) => routeConsole("INFO", originalConsoleMethods.info, args);
  console.warn = (...args) => routeConsole("WARN", originalConsoleMethods.warn, args);
  console.error = (...args) => routeConsole("ERROR", originalConsoleMethods.error, args);
  console.debug = (...args) => routeConsole("DEBUG", originalConsoleMethods.debug, args);

  originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, encoding, callback) => {
    const cb = typeof encoding === "function" ? encoding : callback;
    const enc = typeof encoding === "string" ? encoding : "utf8";
    const text = Buffer.isBuffer(chunk) ? chunk.toString(enc) : String(chunk);
    writeRuntimeLog("STDERR", text);

    if (mirrorConsoleInMainWindow) {
      return originalStderrWrite(chunk, encoding, callback);
    }
    if (typeof cb === "function") cb();
    return true;
  };

  maybeLaunchLogWindow(separateLogWindow);
};

initRuntimeLogRouting();

// Release lock on any exit
process.on("exit", releaseLock);
process.on("SIGINT", () => { releaseLock(); process.exit(0); });
process.on("SIGTERM", () => { releaseLock(); process.exit(0); });

// Force color support for Windows terminals
if (process.platform === "win32") {
  process.env.FORCE_COLOR = "1";
  process.env.TERM = process.env.TERM || "xterm-256color";
}

// ── Auto-start server if not running ────────────────────────────
const ensureServerRunning = async () => {
  const http = await import("http");

  const isServerUp = () =>
    new Promise((resolve) => {
      const req = http.default.get("http://localhost:3000/health", { timeout: 2000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
    });

  if (await isServerUp()) return; // Server already running

  // Start the server as a detached background process
  const { spawn } = await import("child_process");
  const serverPath = path.join(getEngineRoot(), "src", "server.js");

  const env = {
    ...process.env,
    BACKBONE_NO_BROWSER: "1",
    BACKBONE_PARENT_PID: String(process.pid),
  };
  const serverProc = spawn(process.execPath, [serverPath], {
    cwd: getEngineRoot(),
    detached: true,
    stdio: "ignore",
    env,
    windowsHide: true,
  });
  serverProc.unref();

  // Wait for server to be ready (up to 15s)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isServerUp()) return;
  }
  // Server didn't start in time — continue anyway, some features may be degraded
};

await ensureServerRunning();

// ── Server watchdog — restart server if it crashes ──────────────
const startServerWatchdog = async () => {
  const http = await import("http");

  const isServerUp = () =>
    new Promise((resolve) => {
      const req = http.default.get("http://localhost:3000/health", { timeout: 3000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
    });

  const restartServer = async () => {
    const { spawn } = await import("child_process");
    const serverPath = path.join(getEngineRoot(), "src", "server.js");
    const env = {
      ...process.env,
      BACKBONE_NO_BROWSER: "1",
      BACKBONE_PARENT_PID: String(process.pid),
    };
    const serverProc = spawn(process.execPath, [serverPath], {
      cwd: getEngineRoot(),
      detached: true,
      stdio: "ignore",
      env,
      windowsHide: true,
    });
    serverProc.unref();

    // Wait for it to come up
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await isServerUp()) return true;
    }
    return false;
  };

  // Check every 30 seconds
  setInterval(async () => {
    try {
      if (!(await isServerUp())) {
        console.log("[Watchdog] Server down — restarting...");
        const ok = await restartServer();
        if (ok) console.log("[Watchdog] Server restarted successfully");
        else console.log("[Watchdog] Server restart failed");
      }
    } catch {}
  }, 30_000);
};

startServerWatchdog();

/**
 * Center window on screen immediately on startup (before rendering)
 * This runs synchronously to position the window before any content is shown
 */
const centerWindowOnStart = () => {
  const platform = process.platform;
  const width = 1100;  // Onboarding window width
  const height = 700;  // Onboarding window height
  const cols = 120;
  const rows = 35;

  if (platform === "win32") {
    // Use PowerShell to center the console window immediately
    const psScript = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
          [DllImport("user32.dll")]
          public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
          [DllImport("kernel32.dll")]
          public static extern IntPtr GetConsoleWindow();
          [DllImport("user32.dll")]
          public static extern int GetSystemMetrics(int nIndex);
        }
"@
      $hwnd = [Win32]::GetConsoleWindow()
      $screenWidth = [Win32]::GetSystemMetrics(0)
      $screenHeight = [Win32]::GetSystemMetrics(1)
      $x = [Math]::Max(0, ($screenWidth - ${width}) / 2)
      $y = [Math]::Max(0, ($screenHeight - ${height}) / 2)
      [Win32]::MoveWindow($hwnd, $x, $y, ${width}, ${height}, $true)
    `.replace(/\n/g, " ");

    // Run synchronously-ish with spawn, but don't block
    exec(`powershell -NoProfile -Command "${psScript}"`, { windowsHide: true });

    // Also set terminal size via ANSI
    process.stdout.write(`\x1b[8;${rows};${cols}t`);
    process.stdout.write(`\x1b[4;${height};${width}t`);
  } else if (platform === "darwin") {
    // macOS - use ANSI escape and AppleScript
    process.stdout.write(`\x1b[8;${rows};${cols}t`);
    const script = `osascript -e 'tell application "System Events" to set frontApp to name of first application process whose frontmost is true' -e 'if frontApp is "Terminal" then' -e 'tell application "Terminal" to set bounds of front window to {400, 200, ${400 + width}, ${200 + height}}' -e 'end if'`;
    exec(script);
  } else {
    // Linux - use ANSI escape
    process.stdout.write(`\x1b[8;${rows};${cols}t`);
  }
};

// Center the window IMMEDIATELY before anything else
centerWindowOnStart();

// ANSI escape sequences
const ANSI = {
  ALTERNATE_SCREEN_ON: "\x1b[?1049h",
  ALTERNATE_SCREEN_OFF: "\x1b[?1049l",
  CLEAR_SCREEN: "\x1b[2J",
  CURSOR_HOME: "\x1b[H",
  CURSOR_HIDE: "\x1b[?25l",
  CURSOR_SHOW: "\x1b[?25h",
  CLEAR_LINE: "\x1b[2K",
  RESET: "\x1b[0m",
  // Synchronized output - prevents flickering (DEC private mode 2026)
  // Supported by: Windows Terminal, iTerm2, kitty, modern terminals
  // NOT supported by: cmd.exe, older terminals
  SYNC_START: "\x1b[?2026h",
  SYNC_END: "\x1b[?2026l",
};

// Detect if terminal likely supports DEC 2026 sync mode
// Windows Terminal sets WT_SESSION, modern terminals have TERM containing xterm/256color
const termSupportsSync = () => {
  // Windows Terminal supports it
  if (process.env.WT_SESSION) return true;
  // iTerm2 supports it
  if (process.env.TERM_PROGRAM === "iTerm.app") return true;
  // Check TERM for modern terminal indicators
  const term = process.env.TERM || "";
  if (term.includes("xterm") || term.includes("256color") || term.includes("kitty")) return true;
  // Default to disabled on plain Windows cmd
  if (process.platform === "win32" && !process.env.WT_SESSION) return false;
  return false;
};

const USE_SYNC_MODE = termSupportsSync();

/**
 * Synchronized stdout wrapper
 * - Wraps writes with terminal sync mode (DEC 2026) to prevent tearing
 * - Lets Ink handle its own cursor management and incremental rendering
 * - Only adds sync sequences, doesn't fight Ink's rendering
 */
class SyncedStdout extends Writable {
  constructor(target) {
    super();
    this.target = target;
    this.pendingWrites = [];
    this.flushScheduled = false;
    this.frameCount = 0;

    // Copy properties from target
    this.columns = target.columns;
    this.rows = target.rows;
    this.isTTY = target.isTTY;

    // Forward resize events
    if (target.on) {
      target.on("resize", () => {
        this.columns = target.columns;
        this.rows = target.rows;
        this.emit("resize");
      });
    }
  }

  _write(chunk, encoding, callback) {
    this.pendingWrites.push(chunk.toString());

    // Use microtask to batch rapid writes within same frame
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      queueMicrotask(() => this.flush());
    }

    callback();
  }

  flush() {
    this.flushScheduled = false;

    if (this.pendingWrites.length > 0) {
      const content = this.pendingWrites.join("");
      this.pendingWrites = [];

      // Wrap in sync sequences for atomic display (if terminal supports it)
      if (USE_SYNC_MODE) {
        this.target.write(ANSI.SYNC_START + content + ANSI.SYNC_END);
      } else {
        this.target.write(content);
      }
      this.frameCount++;
    }
  }

  // Force immediate flush (for cleanup)
  forceFlush() {
    this.flushScheduled = false;
    if (this.pendingWrites.length > 0) {
      const content = this.pendingWrites.join("");
      this.pendingWrites = [];
      if (USE_SYNC_MODE) {
        this.target.write(ANSI.SYNC_START + content + ANSI.SYNC_END);
      } else {
        this.target.write(content);
      }
    }
  }

  // Forward other methods to target
  write(chunk, encoding, callback) {
    return super.write(chunk, encoding, callback);
  }

  cursorTo(x, y) {
    if (this.target.cursorTo) return this.target.cursorTo(x, y);
  }

  moveCursor(dx, dy) {
    if (this.target.moveCursor) return this.target.moveCursor(dx, dy);
  }

  clearLine(dir) {
    if (this.target.clearLine) return this.target.clearLine(dir);
  }

  clearScreenDown() {
    if (this.target.clearScreenDown) return this.target.clearScreenDown();
  }

  getColorDepth() {
    return this.target.getColorDepth ? this.target.getColorDepth() : 24;
  }

  getWindowSize() {
    return [this.columns, this.rows];
  }
}

// Create synced stdout
const syncedStdout = new SyncedStdout(process.stdout);

// Enter alternate screen buffer
process.stdout.write(ANSI.ALTERNATE_SCREEN_ON);
process.stdout.write(ANSI.CURSOR_HIDE);
process.stdout.write(ANSI.CLEAR_SCREEN);
process.stdout.write(ANSI.CURSOR_HOME);

// Cleanup on exit
const cleanup = () => {
  syncedStdout.forceFlush(); // Flush any pending output immediately
  process.stdout.write(ANSI.CURSOR_SHOW);
  process.stdout.write(ANSI.ALTERNATE_SCREEN_OFF);
  process.stdout.write(ANSI.RESET);
  if (runtimeLogStream) {
    try { runtimeLogStream.end(); } catch {}
    runtimeLogStream = null;
  }
};

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("uncaughtException", (err) => {
  cleanup();
  console.error("Uncaught exception:", err);
  process.exit(1);
});

// Set console title — always use ANSI escape (process.title shows raw path on Windows)
const setConsoleTitle = (title) => {
  if (process.stdout.isTTY) {
    process.stdout.write(`\x1b]0;${title}\x07`);
  }
};

// Get user's first name for title display
const getUserFirstName = async () => {
  // Try LinkedIn profile first (most reliable)
  try {
    const { loadLinkedInProfile } = await import("../src/services/integrations/linkedin-scraper.js");
    const profile = loadLinkedInProfile();
    const fullName = profile?.profile?.name;
    if (fullName) return fullName.split(" ")[0];
  } catch {}

  // Try active-user.json (Firebase user)
  try {
    const activeUser = getActiveUser();
    if (activeUser?.displayName) return activeUser.displayName.split(" ")[0];
  } catch {}

  // Try user-settings.json
  try {
    const settingsPath = dataFile("user-settings.json");
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      if (settings.displayName) return settings.displayName.split(" ")[0];
    }
  } catch {}

  return null;
};

const userName = await getUserFirstName();
// Title format: BACKBONE · [FirstName]
// Singleton checks in launchers match on "BACKBONE" in the window title
setConsoleTitle(userName ? `BACKBONE · ${userName}` : "BACKBONE");

export const updateConsoleTitle = (name) => {
  setConsoleTitle(name ? `BACKBONE · ${name}` : "BACKBONE");
};

// --- Auto-update check (silent, before app loads) ---
// If BACKBONE_UPDATED env var is set, we just restarted after an update — skip check
if (process.env.BACKBONE_UPDATED !== "1") {
  try {
    // Show brief status on the raw terminal before Ink takes over
    process.stdout.write("\x1b[2J\x1b[H"); // clear + home
    process.stdout.write("\x1b[90mChecking for updates...\x1b[0m\r");
    const { checkForUpdates } = await import("../src/services/setup/auto-updater.js");
    await checkForUpdates({ silent: true });
    // If we get here, no update was applied (checkForUpdates exits on success)
    process.stdout.write("\x1b[2K"); // clear the line
  } catch {
    // Update check failed — continue normally
    process.stdout.write("\x1b[2K");
  }
}

// Check for post-update notification
const { consumeUpdateState } = await import("../src/services/setup/auto-updater.js");
const _updateState = consumeUpdateState();

const stdin = process.stdin;
if (!stdin.isTTY) {
  // Keep the process alive in non-TTY environments (e.g. when launched via wrappers).
  stdin.resume();
}

// Lazy-load App (heavy import tree) only when TUI is needed
const { default: App } = await import("../src/app.js");

// Render with optimized settings for smooth updates
const { unmount, clear } = render(createElement(App, { updateConsoleTitle, updateState: _updateState }), {
  stdin,
  stdout: syncedStdout, // Use synced stdout wrapper for DEC 2026 sync
  exitOnCtrlC: false,
  patchConsole: false, // Don't patch console to avoid interference
});

// Handle Ctrl+C
process.on("SIGINT", () => {
  clear();
  unmount();
  cleanup();
  process.exit(0);
});
