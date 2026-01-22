#!/usr/bin/env node
import "dotenv/config";
import { createElement } from "react";
import { render } from "ink";
import App from "../src/app.js";
import { loadLinkedInProfile } from "../src/services/linkedin-scraper.js";

// Force color support for Windows terminals
if (process.platform === "win32") {
  process.env.FORCE_COLOR = "1";
  process.env.TERM = process.env.TERM || "xterm-256color";
}

// ANSI escape sequences for terminal control
const ANSI = {
  ALTERNATE_SCREEN_ON: "\x1b[?1049h",   // Switch to alternate screen buffer
  ALTERNATE_SCREEN_OFF: "\x1b[?1049l",  // Switch back to main screen buffer
  CLEAR_SCREEN: "\x1b[2J",              // Clear entire screen
  CURSOR_HOME: "\x1b[H",                // Move cursor to top-left
  CURSOR_HIDE: "\x1b[?25l",             // Hide cursor
  CURSOR_SHOW: "\x1b[?25h",             // Show cursor
  RESET: "\x1b[0m"                      // Reset all attributes
};

// Enter alternate screen buffer (full-screen mode)
// This prevents the scrolling/regeneration issue
process.stdout.write(ANSI.ALTERNATE_SCREEN_ON);
process.stdout.write(ANSI.CURSOR_HIDE);
process.stdout.write(ANSI.CLEAR_SCREEN);
process.stdout.write(ANSI.CURSOR_HOME);

// Cleanup on exit - restore normal terminal
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

// Get user name from LinkedIn profile
const getUserName = () => {
  try {
    const profile = loadLinkedInProfile();
    if (profile?.profile?.name) {
      return profile.profile.name;
    }
  } catch {
    // Ignore
  }
  return null;
};

const userName = getUserName();
setConsoleTitle(userName ? `backbone - ${userName}` : "backbone");

export const updateConsoleTitle = (name) => {
  setConsoleTitle(name ? `backbone - ${name}` : "backbone");
};

const stdin = process.stdin.isTTY ? process.stdin : undefined;
const stdout = process.stdout.isTTY ? process.stdout : process.stdout;

// Render with full-screen mode settings
const { unmount, clear } = render(createElement(App, { updateConsoleTitle }), {
  stdin,
  stdout,
  exitOnCtrlC: false,  // We handle exit ourselves for cleanup
  patchConsole: true,  // Capture console output
});

// Handle Ctrl+C with proper cleanup
process.on("SIGINT", () => {
  clear();
  unmount();
  cleanup();
  process.exit(0);
});
