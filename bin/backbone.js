#!/usr/bin/env node
import "dotenv/config";
import { createElement } from "react";
import { render } from "ink";
import App from "../src/app.js";
import { loadLinkedInProfile } from "../src/services/linkedin-scraper.js";
import { Writable } from "stream";

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
  RESET: "\x1b[0m",
  // Synchronized output - prevents flickering
  SYNC_START: "\x1b[?2026h",
  SYNC_END: "\x1b[?2026l",
};

/**
 * Double-buffered synchronized stdout wrapper
 * - Batches all writes into frames
 * - Only flushes at controlled intervals (like vsync)
 * - Uses terminal sync mode to prevent tearing
 * - Compares buffers to skip unchanged frames
 */
class SyncedStdout extends Writable {
  constructor(target) {
    super();
    this.target = target;
    this.currentBuffer = "";
    this.lastRendered = "";
    this.flushTimeout = null;
    this.flushInterval = 50; // 20fps max - stable, no flicker
    this.lastFlush = 0;
    this.frameCount = 0;
    this.skippedFrames = 0;

    // Copy properties from target
    this.columns = target.columns;
    this.rows = target.rows;
    this.isTTY = target.isTTY;

    // Forward resize events
    if (target.on) {
      target.on("resize", () => {
        this.columns = target.columns;
        this.rows = target.rows;
        this.lastRendered = ""; // Force full redraw on resize
        this.emit("resize");
      });
    }
  }

  _write(chunk, encoding, callback) {
    const str = chunk.toString();
    this.currentBuffer += str;

    // Schedule a flush if not already scheduled
    if (!this.flushTimeout) {
      const now = Date.now();
      const elapsed = now - this.lastFlush;
      const delay = Math.max(0, this.flushInterval - elapsed);

      this.flushTimeout = setTimeout(() => {
        this.flush();
      }, delay);
    }

    callback();
  }

  flush() {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.currentBuffer.length > 0) {
      // Only render if content changed (double buffering)
      if (this.currentBuffer !== this.lastRendered) {
        // Use sync sequences to prevent tearing
        this.target.write(
          ANSI.SYNC_START +
          ANSI.CURSOR_HOME +
          this.currentBuffer +
          ANSI.SYNC_END
        );
        this.lastRendered = this.currentBuffer;
        this.frameCount++;
      } else {
        this.skippedFrames++;
      }
      this.currentBuffer = "";
      this.lastFlush = Date.now();
    }
  }

  // Force immediate flush (for cleanup)
  forceFlush() {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
    if (this.currentBuffer.length > 0) {
      this.target.write(ANSI.SYNC_START + this.currentBuffer + ANSI.SYNC_END);
      this.currentBuffer = "";
    }
  }

  // Forward other methods
  write(chunk, encoding, callback) {
    return super.write(chunk, encoding, callback);
  }

  cursorTo(x, y) {
    if (this.target.cursorTo) {
      return this.target.cursorTo(x, y);
    }
  }

  moveCursor(dx, dy) {
    if (this.target.moveCursor) {
      return this.target.moveCursor(dx, dy);
    }
  }

  clearLine(dir) {
    if (this.target.clearLine) {
      return this.target.clearLine(dir);
    }
  }

  clearScreenDown() {
    if (this.target.clearScreenDown) {
      return this.target.clearScreenDown();
    }
  }

  getColorDepth() {
    if (this.target.getColorDepth) {
      return this.target.getColorDepth();
    }
    return 24; // Assume true color
  }

  getWindowSize() {
    return [this.columns, this.rows];
  }

  getStats() {
    return {
      frames: this.frameCount,
      skipped: this.skippedFrames,
      fps: this.flushInterval ? Math.round(1000 / this.flushInterval) : 0
    };
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

const stdin = process.stdin.isTTY ? process.stdin : undefined;

// Render with synced stdout to prevent flickering
const { unmount, clear } = render(createElement(App, { updateConsoleTitle }), {
  stdin,
  stdout: syncedStdout, // Use synced stdout wrapper
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
