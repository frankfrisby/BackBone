#!/usr/bin/env node
import "dotenv/config";
import { createElement } from "react";
import { render } from "ink";
import { exec } from "child_process";
import App from "../src/app.js";
import { loadLinkedInProfile } from "../src/services/linkedin-scraper.js";
import { Writable } from "stream";

// Force color support for Windows terminals
if (process.platform === "win32") {
  process.env.FORCE_COLOR = "1";
  process.env.TERM = process.env.TERM || "xterm-256color";
}

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
};

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("uncaughtException", (err) => {
  cleanup();
  console.error("Uncaught exception:", err);
  process.exit(1);
});

// Set console title
const setConsoleTitle = (title) => {
  if (process.platform === "win32") {
    process.title = title;
  } else {
    process.stdout.write(`\x1b]0;${title}\x07`);
  }
};

// Get user name
const getUserName = () => {
  try {
    const profile = loadLinkedInProfile();
    return profile?.profile?.name || null;
  } catch {
    return null;
  }
};

const userName = getUserName();
setConsoleTitle(userName ? `backbone - ${userName}` : "backbone");

export const updateConsoleTitle = (name) => {
  setConsoleTitle(name ? `backbone - ${name}` : "backbone");
};

const stdin = process.stdin;
if (!stdin.isTTY) {
  // Keep the process alive in non-TTY environments (e.g. when launched via wrappers).
  stdin.resume();
}

// Render with optimized settings for smooth updates
const { unmount, clear } = render(createElement(App, { updateConsoleTitle }), {
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
