/**
 * Terminal Resize Service
 * Controls terminal window size at different app stages
 */

import { spawn, exec } from "child_process";

// Size presets (in characters - columns x rows)
// 2200x1100 pixels approx 240 columns x 64 rows (assuming ~9px char width, ~17px char height)
export const TERMINAL_SIZES = {
  onboarding: { cols: 120, rows: 35 },  // Compact for onboarding
  main: { cols: 240, rows: 64 }          // Full size for main app (approx 2200x1100px)
};

/**
 * Resize terminal window on Windows
 * Uses PowerShell to resize the console window in pixels
 */
const resizeWindowsTerminal = async (cols, rows) => {
  // Target pixel dimensions
  const targetWidth = 2200;
  const targetHeight = 1100;

  return new Promise((resolve) => {
    const psScript = `
      try {
        $host.UI.RawUI.WindowSize = New-Object System.Management.Automation.Host.Size(${cols}, ${rows});
        $host.UI.RawUI.BufferSize = New-Object System.Management.Automation.Host.Size(${cols}, ${rows + 500});
      } catch {}
    `;

    const runResize = () => {
      process.stdout.write(`\x1b[8;${rows};${cols}t`);
      process.stdout.write(`\x1b[4;${targetHeight};${targetWidth}t`);
      exec(`powershell -NoProfile -Command "${psScript.replace(/\n/g, " ")}"`, () => {});
    };

    const delays = [0, 500, 1100, 1900];
    delays.forEach((delay, index) => {
      setTimeout(() => {
        runResize();
        if (index === delays.length - 1) {
          resolve(true);
        }
      }, delay);
    });
  });
};

/**
 * Resize terminal window on macOS
 */
const resizeMacTerminal = async (cols, rows) => {
  return new Promise((resolve) => {
    // Use AppleScript to resize Terminal.app or iTerm2
    const appleScript = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
      end tell

      if frontApp is "Terminal" then
        tell application "Terminal"
          set bounds of front window to {100, 100, ${100 + cols * 8}, ${100 + rows * 18}}
        end tell
      else if frontApp is "iTerm2" then
        tell application "iTerm2"
          tell current session of current window
            set columns to ${cols}
            set rows to ${rows}
          end tell
        end tell
      end if
    `;

    exec(`osascript -e '${appleScript.replace(/'/g, "'\"'\"'")}'`, (error) => {
      resolve(!error);
    });
  });
};

/**
 * Resize terminal window on Linux
 */
const resizeLinuxTerminal = async (cols, rows) => {
  return new Promise((resolve) => {
    // Use ANSI escape sequence (works with most modern terminals)
    // ESC[8;rows;colst - resize window to rows x cols
    process.stdout.write(`\x1b[8;${rows};${cols}t`);

    // Also try xdotool if available
    exec(`which xdotool && xdotool getactivewindow windowsize ${cols * 8} ${rows * 18}`, () => {
      resolve(true);
    });
  });
};

/**
 * Resize terminal to specified size
 * @param {string} preset - 'onboarding' or 'main'
 * @returns {Promise<boolean>} - Success status
 */
export const resizeTerminal = async (preset = "main") => {
  const size = TERMINAL_SIZES[preset] || TERMINAL_SIZES.main;
  const { cols, rows } = size;

  try {
    if (preset === "main") {
      const current = getCurrentSize();
      if (current.cols >= cols && current.rows >= rows) {
        return true;
      }
    }

    const platform = process.platform;

    if (platform === "win32") {
      return await resizeWindowsTerminal(cols, rows);
    } else if (platform === "darwin") {
      return await resizeMacTerminal(cols, rows);
    } else {
      return await resizeLinuxTerminal(cols, rows);
    }
  } catch (error) {
    // Silently fail - terminal resize is nice-to-have
    return false;
  }
};

/**
 * Resize to onboarding size
 */
export const resizeForOnboarding = () => resizeTerminal("onboarding");

/**
 * Resize to main app size
 */
export const resizeForMainApp = () => resizeTerminal("main");

/**
 * Get current terminal size
 */
export const getCurrentSize = () => ({
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 24
});

/**
 * Check if terminal supports resizing
 */
export const supportsResize = () => {
  // Most modern terminals support resizing
  return process.stdout.isTTY;
};

export default {
  TERMINAL_SIZES,
  resizeTerminal,
  resizeForOnboarding,
  resizeForMainApp,
  getCurrentSize,
  supportsResize
};




