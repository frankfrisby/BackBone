/**
 * Terminal Resize Service
 * Controls terminal window size and position at different app stages
 */

import { spawn, exec } from "child_process";

// Size presets (in characters - columns x rows)
// 2200x1100 pixels approx 240 columns x 64 rows (assuming ~9px char width, ~17px char height)
export const TERMINAL_SIZES = {
  onboarding: { cols: 120, rows: 35, width: 1100, height: 700 },  // Compact for onboarding, centered
  main: { cols: 240, rows: 64, width: 2200, height: 1100 }        // Full size for main app (maximized)
};

/**
 * Resize terminal window on Windows
 * Uses PowerShell to resize and position the console window
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 * @param {Object} options - Additional options
 * @param {boolean} options.center - Center the window on the screen
 * @param {boolean} options.maximize - Maximize the window
 * @param {number} options.width - Target width in pixels
 * @param {number} options.height - Target height in pixels
 */
const resizeWindowsTerminal = async (cols, rows, options = {}) => {
  const { center = false, maximize = false, width = 2200, height = 1100 } = options;

  return new Promise((resolve) => {
    // Build PowerShell script based on options
    let psScript = "";

    if (maximize) {
      // Maximize the window using SendKeys or window API
      psScript = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class Win32 {
            [DllImport("user32.dll")]
            public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
            [DllImport("kernel32.dll")]
            public static extern IntPtr GetConsoleWindow();
          }
"@
        try {
          $hwnd = [Win32]::GetConsoleWindow();
          [Win32]::ShowWindow($hwnd, 3);
          $host.UI.RawUI.WindowSize = New-Object System.Management.Automation.Host.Size(${cols}, ${rows});
          $host.UI.RawUI.BufferSize = New-Object System.Management.Automation.Host.Size(${cols}, ${rows + 500});
        } catch {}
      `;
    } else if (center) {
      // Center the window on the primary monitor
      psScript = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class Win32 {
            [DllImport("user32.dll")]
            public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
            [DllImport("user32.dll")]
            public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
            [DllImport("kernel32.dll")]
            public static extern IntPtr GetConsoleWindow();
            [DllImport("user32.dll")]
            public static extern int GetSystemMetrics(int nIndex);
            public struct RECT { public int Left, Top, Right, Bottom; }
          }
"@
        try {
          $hwnd = [Win32]::GetConsoleWindow();
          $screenWidth = [Win32]::GetSystemMetrics(0);
          $screenHeight = [Win32]::GetSystemMetrics(1);
          $winWidth = ${width};
          $winHeight = ${height};
          $x = [Math]::Max(0, ($screenWidth - $winWidth) / 2);
          $y = [Math]::Max(0, ($screenHeight - $winHeight) / 2);
          [Win32]::MoveWindow($hwnd, $x, $y, $winWidth, $winHeight, $true);
          $host.UI.RawUI.WindowSize = New-Object System.Management.Automation.Host.Size(${cols}, ${rows});
          $host.UI.RawUI.BufferSize = New-Object System.Management.Automation.Host.Size(${cols}, ${rows + 500});
        } catch {}
      `;
    } else {
      // Just resize
      psScript = `
        try {
          $host.UI.RawUI.WindowSize = New-Object System.Management.Automation.Host.Size(${cols}, ${rows});
          $host.UI.RawUI.BufferSize = New-Object System.Management.Automation.Host.Size(${cols}, ${rows + 500});
        } catch {}
      `;
    }

    const runResize = () => {
      // Use ANSI escape sequences for terminal resize
      process.stdout.write(`\x1b[8;${rows};${cols}t`);
      process.stdout.write(`\x1b[4;${height};${width}t`);
      // Run PowerShell for Windows-specific positioning
      exec(`powershell -NoProfile -Command "${psScript.replace(/\n/g, " ").replace(/"/g, '\\"')}"`, () => {});
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
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 * @param {Object} options - Additional options
 * @param {boolean} options.center - Center the window on the screen
 * @param {boolean} options.maximize - Maximize the window
 * @param {number} options.width - Target width in pixels
 * @param {number} options.height - Target height in pixels
 */
const resizeMacTerminal = async (cols, rows, options = {}) => {
  const { center = false, maximize = false, width = 2200, height = 1100 } = options;

  return new Promise((resolve) => {
    let appleScript = "";

    if (maximize) {
      // Maximize/zoom the window
      appleScript = `
        tell application "System Events"
          set frontApp to name of first application process whose frontmost is true
        end tell

        if frontApp is "Terminal" then
          tell application "Terminal"
            set zoomed of front window to true
          end tell
        else if frontApp is "iTerm2" then
          tell application "iTerm2"
            tell current window to set zoomed to true
          end tell
        end if
      `;
    } else if (center) {
      // Center the window on screen
      appleScript = `
        tell application "System Events"
          set frontApp to name of first application process whose frontmost is true
        end tell

        set screenWidth to (do shell script "system_profiler SPDisplaysDataType | grep Resolution | head -1 | awk '{print $2}'") as integer
        set screenHeight to (do shell script "system_profiler SPDisplaysDataType | grep Resolution | head -1 | awk '{print $4}'") as integer
        set winWidth to ${width}
        set winHeight to ${height}
        set xPos to (screenWidth - winWidth) / 2
        set yPos to (screenHeight - winHeight) / 2
        if xPos < 0 then set xPos to 0
        if yPos < 0 then set yPos to 0

        if frontApp is "Terminal" then
          tell application "Terminal"
            set bounds of front window to {xPos, yPos, xPos + winWidth, yPos + winHeight}
          end tell
        else if frontApp is "iTerm2" then
          tell application "iTerm2"
            tell current window
              set bounds to {xPos, yPos, xPos + winWidth, yPos + winHeight}
            end tell
          end tell
        end if
      `;
    } else {
      // Just resize
      appleScript = `
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
    }

    exec(`osascript -e '${appleScript.replace(/'/g, "'\"'\"'")}'`, (error) => {
      resolve(!error);
    });
  });
};

/**
 * Resize terminal window on Linux
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 * @param {Object} options - Additional options
 * @param {boolean} options.center - Center the window on the screen
 * @param {boolean} options.maximize - Maximize the window
 * @param {number} options.width - Target width in pixels
 * @param {number} options.height - Target height in pixels
 */
const resizeLinuxTerminal = async (cols, rows, options = {}) => {
  const { center = false, maximize = false, width = 2200, height = 1100 } = options;

  return new Promise((resolve) => {
    // Use ANSI escape sequence (works with most modern terminals)
    // ESC[8;rows;colst - resize window to rows x cols
    process.stdout.write(`\x1b[8;${rows};${cols}t`);

    if (maximize) {
      // Try wmctrl for maximize
      exec(`which wmctrl && wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`, () => {
        resolve(true);
      });
    } else if (center) {
      // Try xdotool for centering
      const script = `
        if command -v xdotool &> /dev/null && command -v xrandr &> /dev/null; then
          SCREEN_W=$(xrandr | grep -oP 'current \\K\\d+(?= x)')
          SCREEN_H=$(xrandr | grep -oP 'current \\d+ x \\K\\d+')
          WIN_W=${width}
          WIN_H=${height}
          X=$(( ($SCREEN_W - $WIN_W) / 2 ))
          Y=$(( ($SCREEN_H - $WIN_H) / 2 ))
          [ $X -lt 0 ] && X=0
          [ $Y -lt 0 ] && Y=0
          xdotool getactivewindow windowsize $WIN_W $WIN_H windowmove $X $Y
        fi
      `;
      exec(script, () => {
        resolve(true);
      });
    } else {
      // Also try xdotool if available for resize only
      exec(`which xdotool && xdotool getactivewindow windowsize ${cols * 8} ${rows * 18}`, () => {
        resolve(true);
      });
    }
  });
};

/**
 * Resize terminal to specified size
 * @param {string} preset - 'onboarding' or 'main'
 * @returns {Promise<boolean>} - Success status
 */
export const resizeTerminal = async (preset = "main") => {
  const size = TERMINAL_SIZES[preset] || TERMINAL_SIZES.main;
  const { cols, rows, width = 2200, height = 1100 } = size;

  // Options based on preset
  const options = {
    width,
    height,
    center: preset === "onboarding",  // Center for onboarding
    maximize: preset === "main"        // Maximize for main app
  };

  try {
    if (preset === "main" && !options.maximize) {
      const current = getCurrentSize();
      if (current.cols >= cols && current.rows >= rows) {
        return true;
      }
    }

    const platform = process.platform;

    if (platform === "win32") {
      return await resizeWindowsTerminal(cols, rows, options);
    } else if (platform === "darwin") {
      return await resizeMacTerminal(cols, rows, options);
    } else {
      return await resizeLinuxTerminal(cols, rows, options);
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




