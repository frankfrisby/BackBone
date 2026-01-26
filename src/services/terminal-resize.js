/**
 * Terminal Resize Service
 * Controls terminal window size and position at different app stages
 */

import { spawn, exec } from "child_process";

// Size presets (in characters - columns x rows)
// 2200x1100 pixels approx 240 columns x 64 rows (assuming ~9px char width, ~17px char height)
export const TERMINAL_SIZES = {
  mini: { cols: 90, rows: 24, width: 800, height: 600 },          // Compact size
  onboarding: { cols: 120, rows: 45, width: 1100, height: 900 },  // Taller for onboarding, centered
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
  const { center = false, maximize = false, forceSize = false, width = 2200, height = 1100 } = options;

  return new Promise((resolve) => {
    // Detect if running in Windows Terminal (has WT_SESSION env var)
    const isWindowsTerminal = !!process.env.WT_SESSION;

    const runResize = () => {
      // Method 1: ANSI escape sequences (works with Windows Terminal)
      process.stdout.write(`\x1b[8;${rows};${cols}t`);

      if (maximize) {
        // For maximize, use pixel-based ANSI sequence with large values
        // This effectively maximizes by requesting a size larger than the screen
        process.stdout.write(`\x1b[4;9999;9999t`);

        // Also try PowerShell to maximize the window
        const maximizeScript = `
          Add-Type -Name Win -Namespace Native -MemberDefinition '
            [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
            [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          ';
          $hwnd = [Native.Win]::GetForegroundWindow();
          [Native.Win]::ShowWindow($hwnd, 3)
        `.replace(/\n/g, " ");

        exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${maximizeScript}"`, { windowsHide: true }, () => {});
      } else if (center || forceSize) {
        // Set specific pixel size (and center if requested)
        process.stdout.write(`\x1b[4;${height};${width}t`);

        // Use PowerShell to resize (and optionally center) the window
        const resizeScript = `
          Add-Type -Name Win -Namespace Native -MemberDefinition '
            [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int W, int H, bool repaint);
            [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
            [DllImport("user32.dll")] public static extern int GetSystemMetrics(int n);
            [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
            [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
          ';
          $hwnd = [Native.Win]::GetForegroundWindow();
          ${center ? `
          $sw = [Native.Win]::GetSystemMetrics(0);
          $sh = [Native.Win]::GetSystemMetrics(1);
          $x = [Math]::Max(0, ($sw - ${width}) / 2);
          $y = [Math]::Max(0, ($sh - ${height}) / 2);
          ` : `
          $rect = New-Object Native.Win+RECT;
          [Native.Win]::GetWindowRect($hwnd, [ref]$rect) | Out-Null;
          $x = $rect.Left;
          $y = $rect.Top;
          `}
          [Native.Win]::MoveWindow($hwnd, $x, $y, ${width}, ${height}, $true)
        `.replace(/\n/g, " ");

        exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${resizeScript}"`, { windowsHide: true }, () => {});
      } else {
        // Just set pixel size
        process.stdout.write(`\x1b[4;${height};${width}t`);
      }

      // Method 2: For legacy console, also use mode con (doesn't hurt)
      if (!isWindowsTerminal) {
        exec(`mode con: cols=${cols} lines=${rows}`, { windowsHide: true }, () => {});
      }
    };

    // Run resize with delays to ensure it takes effect
    const delays = [0, 300, 800];
    delays.forEach((delay, index) => {
      setTimeout(() => {
        runResize();
        if (index === delays.length - 1) {
          // Emit resize event to notify the app
          setTimeout(() => {
            process.stdout.emit("resize");
            resolve(true);
          }, 200);
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
    maximize: preset === "main",       // Maximize for main app
    forceSize: preset === "mini"       // Force specific size for mini
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
 * Resize to mini size
 */
export const resizeForMini = () => resizeTerminal("mini");

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

// Store the base title to restore after temporary titles
let baseTitle = "Backbone";
let tempTitleTimeout = null;

/**
 * Set terminal title using ANSI escape sequence
 * Works on Windows Terminal, iTerm2, most Linux terminals
 * @param {string} title - The title to set
 */
export const setTerminalTitle = (title) => {
  if (process.stdout.isTTY) {
    // Use OSC escape sequence to set window title
    // \x1b]0; - Set both icon name and window title
    // \x07 - Bell character (terminator)
    process.stdout.write(`\x1b]0;${title}\x07`);
  }
};

/**
 * Set the base title (persists across views)
 * @param {string} userName - User's name to include in title
 */
export const setBaseTitle = (userName) => {
  baseTitle = userName ? `Backbone · ${userName}` : "Backbone";
  setTerminalTitle(baseTitle);
};

/**
 * Get the current base title
 */
export const getBaseTitle = () => baseTitle;

/**
 * Show temporary title for a duration, then restore base title
 * @param {string} title - Temporary title to show
 * @param {number} duration - Duration in milliseconds (default 30000 = 30 seconds)
 */
export const showTemporaryTitle = (title, duration = 30000) => {
  // Clear any existing timeout
  if (tempTitleTimeout) {
    clearTimeout(tempTitleTimeout);
  }

  // Set the temporary title
  setTerminalTitle(title);

  // Restore base title after duration
  tempTitleTimeout = setTimeout(() => {
    setTerminalTitle(baseTitle);
    tempTitleTimeout = null;
  }, duration);
};

/**
 * Show activity in title (e.g., "Backbone · Frank · Working on: Find jobs")
 * @param {string} activity - Activity description
 * @param {number} duration - Duration in milliseconds
 */
export const showActivityTitle = (activity, duration = 30000) => {
  const title = `${baseTitle} · ${activity}`;
  showTemporaryTitle(title, duration);
};

/**
 * Show notification in title (for trades, messages, errors)
 * @param {string} type - "trade" | "message" | "error"
 * @param {string} text - Notification text
 * @param {number} duration - Duration in milliseconds
 */
export const showNotificationTitle = (type, text, duration = 30000) => {
  const icons = {
    trade: "📈",
    message: "💬",
    error: "⚠️",
    goal: "🎯"
  };
  const icon = icons[type] || "●";
  const title = `${icon} ${text} · ${baseTitle}`;
  showTemporaryTitle(title, duration);
};

/**
 * Restore base title immediately
 */
export const restoreBaseTitle = () => {
  if (tempTitleTimeout) {
    clearTimeout(tempTitleTimeout);
    tempTitleTimeout = null;
  }
  setTerminalTitle(baseTitle);
};

export default {
  TERMINAL_SIZES,
  resizeTerminal,
  resizeForMini,
  resizeForOnboarding,
  resizeForMainApp,
  getCurrentSize,
  supportsResize,
  setTerminalTitle,
  setBaseTitle,
  getBaseTitle,
  showTemporaryTitle,
  showActivityTitle,
  showNotificationTitle,
  restoreBaseTitle
};




