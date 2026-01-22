#!/usr/bin/env node
import "dotenv/config";
import { createElement } from "react";
import { render } from "ink";
import { Writable } from "stream";
import App from "../src/app.js";
import { loadLinkedInProfile } from "../src/services/linkedin-scraper.js";

// Force color support for Windows terminals
if (process.platform === "win32") {
  process.env.FORCE_COLOR = "1";
  process.env.TERM = process.env.TERM || "xterm-256color";
}

// ANSI escape sequences
const ANSI = {
  ALTERNATE_SCREEN_ON: "\x1b[?1049h",
  ALTERNATE_SCREEN_OFF: "\x1b[?1049l",
  CLEAR_SCREEN: "\x1b[2J",
  CURSOR_HOME: "\x1b[H",
  CURSOR_HIDE: "\x1b[?25l",
  CURSOR_SHOW: "\x1b[?25h",
  CLEAR_LINE: "\x1b[2K",
  RESET: "\x1b[0m"
};

// Double-buffered output stream to prevent flickering
// Collects all writes, strips clear sequences, and flushes atomically
class DoubleBufferedStream extends Writable {
  constructor(target) {
    super();
    this.target = target;
    this.buffer = "";
    this.lastOutput = "";
    this.flushScheduled = false;
    this.columns = target.columns || 80;
    this.rows = target.rows || 24;

    // Forward terminal size
    if (target.on) {
      target.on("resize", () => {
        this.columns = target.columns;
        this.rows = target.rows;
        this.emit("resize");
      });
    }
  }

  get isTTY() { return true; }

  _write(chunk, encoding, callback) {
    this.buffer += chunk.toString();

    // Schedule a flush on next tick to batch writes
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      setImmediate(() => this.flush());
    }

    callback();
  }

  flush() {
    this.flushScheduled = false;

    if (this.buffer.length === 0) return;

    // Strip all clear sequences to prevent flicker
    // Remove: clear screen (\x1b[2J), clear line (\x1b[2K), clear to end (\x1b[J), clear to end of line (\x1b[K)
    let cleanBuffer = this.buffer
      .replace(/\x1b\[2J/g, "")      // Clear screen
      .replace(/\x1b\[2K/g, "")      // Clear line
      .replace(/\x1b\[J/g, "")       // Clear to end of screen
      .replace(/\x1b\[K/g, "")       // Clear to end of line
      .replace(/\x1b\[\d*[AB]/g, "") // Remove cursor up/down (Ink uses these to reposition)
      .replace(/\x1b\[H/g, "");      // Remove home sequences (we add our own)

    // Only write if content changed
    if (cleanBuffer !== this.lastOutput) {
      // Move cursor home and write everything at once
      this.target.write(ANSI.CURSOR_HOME + cleanBuffer);
      this.lastOutput = cleanBuffer;
    }

    this.buffer = "";
  }

  cursorTo(x, y) {
    if (y !== undefined) {
      this.buffer += `\x1b[${y + 1};${x + 1}H`;
    } else {
      this.buffer += `\x1b[${x + 1}G`;
    }
  }

  moveCursor(dx, dy) {
    // No-op: we always render from cursor home
    // Ink uses these for repositioning but we handle that differently
  }

  clearLine(dir) {
    // No-op: we overwrite content instead of clearing
  }

  clearScreenDown() {
    // No-op: we overwrite content instead of clearing
  }
}

// Enter alternate screen buffer
process.stdout.write(ANSI.ALTERNATE_SCREEN_ON);
process.stdout.write(ANSI.CURSOR_HIDE);
process.stdout.write(ANSI.CLEAR_SCREEN);
process.stdout.write(ANSI.CURSOR_HOME);

// Cleanup on exit
const cleanup = () => {
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

// Create double-buffered stream for flicker-free rendering
const bufferedStdout = new DoubleBufferedStream(process.stdout);

const stdin = process.stdin.isTTY ? process.stdin : undefined;

// Render with double-buffered output
const { unmount, clear } = render(createElement(App, { updateConsoleTitle }), {
  stdin,
  stdout: bufferedStdout,
  exitOnCtrlC: false,
  patchConsole: true,
});

// Handle Ctrl+C
process.on("SIGINT", () => {
  clear();
  unmount();
  cleanup();
  process.exit(0);
});
