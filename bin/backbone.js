#!/usr/bin/env node
import "dotenv/config";
import { createElement } from "react";
import { render } from "ink";
import App from "../src/app.js";
import { loadLinkedInProfile } from "../src/services/linkedin-scraper.js";

// Force color support for Windows terminals
if (process.platform === "win32") {
  process.env.FORCE_COLOR = "1";
  // Enable ANSI escape code support
  process.env.TERM = process.env.TERM || "xterm-256color";
}

// Set initial console title
const setConsoleTitle = (title) => {
  if (process.platform === "win32") {
    process.title = title;
  } else {
    // ANSI escape sequence for setting terminal title
    process.stdout.write(`\x1b]0;${title}\x07`);
  }
};

// Get user name from LinkedIn profile if available
const getUserName = () => {
  try {
    const profile = loadLinkedInProfile();
    if (profile?.profile?.name) {
      return profile.profile.name;
    }
  } catch {
    // Ignore errors
  }
  return null;
};

// Set title with user name if available
const userName = getUserName();
const title = userName ? `backbone - ${userName}` : "backbone";
setConsoleTitle(title);

// Export function to update title (can be called from app)
export const updateConsoleTitle = (name) => {
  const newTitle = name ? `backbone - ${name}` : "backbone";
  setConsoleTitle(newTitle);
};

const stdin = process.stdin.isTTY ? process.stdin : undefined;
const stdout = process.stdout.isTTY ? process.stdout : process.stdout;

// Render with optimized settings for smooth updates
render(createElement(App, { updateConsoleTitle }), {
  stdin,
  stdout,
  exitOnCtrlC: true,
  patchConsole: false,        // Don't intercept console - reduces overhead
  // Note: incrementalRendering is available in newer Ink versions
});
