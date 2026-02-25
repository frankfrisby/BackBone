/**
 * Computer Use — Full desktop control via vision + actions
 *
 * Takes a goal, then loops:
 *   1. SCREENSHOT — capture what's on screen
 *   2. THINK — send screenshot to Claude vision, get next action
 *   3. ACT — execute the action (click, type, key, launch, etc.)
 *   4. REPEAT — until goal is achieved or max steps reached
 *
 * All input control done via PowerShell (no npm dependencies).
 * Screenshots via System.Drawing, mouse via user32.dll, keyboard via SendKeys.
 */

import { execSync, exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAG = "[ComputerUse]";

// ── Output directory ─────────────────────────────────────────

function getOutputDir() {
  const home = process.env.HOME || process.env.USERPROFILE;
  try {
    const activeUserFile = path.join(home, ".backbone", "active-user.json");
    const { uid } = JSON.parse(fs.readFileSync(activeUserFile, "utf-8"));
    if (uid) {
      const dir = path.join(home, ".backbone", "users", uid, "screenshots");
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    }
  } catch {}
  const dir = path.join(home, ".backbone", "users", "default", "screenshots");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── PowerShell helpers ───────────────────────────────────────

import os from "os";

function ps(script, timeout = 15000) {
  // Write to temp file to avoid shell escaping nightmares with $, ", etc.
  const tmpFile = path.join(os.tmpdir(), `backbone-ps-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.ps1`);
  fs.writeFileSync(tmpFile, script);
  try {
    return execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { encoding: "utf-8", timeout, windowsHide: true }
    ).trim();
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// ── Screen primitives ────────────────────────────────────────

/**
 * Take a screenshot. Returns the file path.
 */
function screenshot() {
  const outputDir = getOutputDir();
  const filename = `screen_${Date.now()}.png`;
  const filepath = path.join(outputDir, filename);

  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save('${filepath.replace(/\\/g, "\\\\")}')
$g.Dispose()
$bmp.Dispose()
Write-Host 'OK'
`;
  ps(script, 10000);
  return filepath;
}

/**
 * Get screen resolution.
 */
function getScreenSize() {
  const result = ps(`
Add-Type -AssemblyName System.Windows.Forms
$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Host "$($s.Width)x$($s.Height)"
`);
  const [w, h] = result.split("x").map(Number);
  return { width: w, height: h };
}

// ── Mouse primitives ─────────────────────────────────────────

function mouseMove(x, y) {
  ps(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Mouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
}
'@
[Mouse]::SetCursorPos(${x}, ${y})
`);
}

function mouseClick(x, y, button = "left") {
  const down = button === "right" ? "0x0008" : "0x0002";
  const up = button === "right" ? "0x0010" : "0x0004";
  ps(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class MouseClick {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
'@
[MouseClick]::SetCursorPos(${x}, ${y})
Start-Sleep -Milliseconds 50
[MouseClick]::mouse_event(${down}, 0, 0, 0, 0)
[MouseClick]::mouse_event(${up}, 0, 0, 0, 0)
`);
}

function mouseDoubleClick(x, y) {
  ps(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class MouseDbl {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
'@
[MouseDbl]::SetCursorPos(${x}, ${y})
Start-Sleep -Milliseconds 50
[MouseDbl]::mouse_event(0x0002, 0, 0, 0, 0)
[MouseDbl]::mouse_event(0x0004, 0, 0, 0, 0)
Start-Sleep -Milliseconds 80
[MouseDbl]::mouse_event(0x0002, 0, 0, 0, 0)
[MouseDbl]::mouse_event(0x0004, 0, 0, 0, 0)
`);
}

// ── Keyboard primitives ──────────────────────────────────────

/**
 * Type text character by character. Handles special chars.
 */
function typeText(text) {
  // Use SendKeys for basic text, escape special SendKeys characters
  const escaped = text
    .replace(/\+/g, "{+}")
    .replace(/%/g, "{%}")
    .replace(/\^/g, "{^}")
    .replace(/~/g, "{~}")
    .replace(/\(/g, "{(}")
    .replace(/\)/g, "{)}")
    .replace(/\{/g, "{{}")
    .replace(/\}/g, "{}}");

  ps(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}')
`);
}

/**
 * Press a key combination (e.g., "ctrl+a", "enter", "alt+f4").
 */
function keyPress(combo) {
  const keyMap = {
    "enter": "{ENTER}",
    "return": "{ENTER}",
    "tab": "{TAB}",
    "escape": "{ESC}",
    "esc": "{ESC}",
    "backspace": "{BACKSPACE}",
    "delete": "{DELETE}",
    "del": "{DELETE}",
    "home": "{HOME}",
    "end": "{END}",
    "pageup": "{PGUP}",
    "pagedown": "{PGDN}",
    "up": "{UP}",
    "down": "{DOWN}",
    "left": "{LEFT}",
    "right": "{RIGHT}",
    "space": " ",
    "f1": "{F1}", "f2": "{F2}", "f3": "{F3}", "f4": "{F4}",
    "f5": "{F5}", "f6": "{F6}", "f7": "{F7}", "f8": "{F8}",
    "f9": "{F9}", "f10": "{F10}", "f11": "{F11}", "f12": "{F12}",
  };

  const parts = combo.toLowerCase().split("+").map(s => s.trim());
  let sendKeysStr = "";
  let hasModifier = false;

  for (const part of parts) {
    if (part === "ctrl" || part === "control") { sendKeysStr += "^"; hasModifier = true; }
    else if (part === "alt") { sendKeysStr += "%"; hasModifier = true; }
    else if (part === "shift") { sendKeysStr += "+"; hasModifier = true; }
    else if (part === "win" || part === "windows") {
      // Win key needs special handling
      ps(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
'@
[WinKey]::keybd_event(0x5B, 0, 0, 0)
Start-Sleep -Milliseconds 50
[WinKey]::keybd_event(0x5B, 0, 2, 0)
`);
      return;
    }
    else if (keyMap[part]) { sendKeysStr += keyMap[part]; }
    else if (part.length === 1) { sendKeysStr += part; }
    else { sendKeysStr += keyMap[part] || part; }
  }

  if (sendKeysStr) {
    ps(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${sendKeysStr.replace(/'/g, "''")}')
`);
  }
}

// ── App launching ────────────────────────────────────────────

/**
 * Launch an application by name or path.
 */
// Apps that need special launch commands (e.g. skip start screen)
const APP_LAUNCH = {
  "word":       { cmd: "winword", args: "/w", wait: 6 },
  "excel":      { cmd: "excel", args: "/e", wait: 6 },
  "powerpoint": { cmd: "powerpnt", args: "/B", wait: 6 },
  "notepad":    { cmd: "notepad.exe", args: null, wait: 2 },
  "explorer":   { cmd: "explorer", args: null, wait: 2 },
  "chrome":     { cmd: "chrome", args: null, wait: 3 },
  "edge":       { cmd: "msedge", args: null, wait: 3 },
  "firefox":    { cmd: "firefox", args: null, wait: 3 },
  "terminal":   { cmd: "wt", args: null, wait: 2 },
  "cmd":        { cmd: "cmd", args: null, wait: 2 },
  "powershell": { cmd: "powershell", args: null, wait: 2 },
  "calculator": { cmd: "calc", args: null, wait: 2 },
  "paint":      { cmd: "mspaint", args: null, wait: 2 },
  "outlook":    { cmd: "outlook", args: null, wait: 6 },
  "teams":      { cmd: "ms-teams", args: null, wait: 4 },
  "code":       { cmd: "code", args: null, wait: 3 },
  "vscode":     { cmd: "code", args: null, wait: 3 },
};

function launchApp(appNameOrPath) {
  const config = APP_LAUNCH[appNameOrPath.toLowerCase()];
  const cmd = config ? config.cmd : appNameOrPath;
  const args = config?.args;
  const wait = config?.wait || 2;

  try {
    if (args) {
      ps(`Start-Process '${cmd}' -ArgumentList '${args}'`);
    } else {
      ps(`Start-Process '${cmd}'`);
    }
    return { launched: true, app: cmd, wait };
  } catch (err) {
    // Try as full path
    try {
      ps(`Start-Process "${appNameOrPath}"`);
      return { launched: true, app: appNameOrPath, wait };
    } catch {
      return { launched: false, error: err.message, wait };
    }
  }
}

/**
 * Focus a window by title (partial match).
 */
function focusWindow(title) {
  ps(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Linq;
public class WinFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  public static void Focus(string title) {
    var procs = Process.GetProcesses()
      .Where(p => p.MainWindowTitle.IndexOf(title, StringComparison.OrdinalIgnoreCase) >= 0)
      .ToArray();
    if (procs.Length > 0) {
      ShowWindow(procs[0].MainWindowHandle, 9);
      SetForegroundWindow(procs[0].MainWindowHandle);
    }
  }
}
'@
[WinFocus]::Focus('${title.replace(/'/g, "''")}')
`);
}

/**
 * List visible windows.
 */
function listWindows() {
  const result = ps(`
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } |
  Select-Object ProcessName, MainWindowTitle, Id |
  ConvertTo-Json
`);
  try {
    const parsed = JSON.parse(result);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

/**
 * Wait for a window with given title to appear.
 */
function waitForWindow(title, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const windows = listWindows();
    const found = windows.find(w =>
      w.MainWindowTitle?.toLowerCase().includes(title.toLowerCase())
    );
    if (found) return true;
    ps("Start-Sleep -Seconds 1", 3000);
  }
  return false;
}

// ── Scroll ───────────────────────────────────────────────────

function scroll(direction = "down", amount = 3) {
  const delta = direction === "up" ? 120 * amount : -120 * amount;
  ps(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class MouseScroll {
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
'@
[MouseScroll]::mouse_event(0x0800, 0, 0, ${delta}, 0)
`);
}

// ── App knowledge ────────────────────────────────────────────

const APP_DB = [
  { names: ["notepad"], app: "notepad", process: "notepad", title: "Notepad" },
  { names: ["word", "winword", "microsoft word"], app: "word", process: "WINWORD", title: "Word" },
  { names: ["excel", "microsoft excel"], app: "excel", process: "EXCEL", title: "Excel" },
  { names: ["powerpoint", "pptx", "microsoft powerpoint"], app: "powerpoint", process: "POWERPNT", title: "PowerPoint" },
  { names: ["chrome", "google chrome"], app: "chrome", process: "chrome", title: "Chrome" },
  { names: ["edge", "microsoft edge"], app: "edge", process: "msedge", title: "Edge" },
  { names: ["firefox"], app: "firefox", process: "firefox", title: "Firefox" },
  { names: ["calculator", "calc"], app: "calculator", process: "CalculatorApp", title: "Calculator" },
  { names: ["paint"], app: "paint", process: "mspaint", title: "Paint" },
  { names: ["terminal", "powershell"], app: "terminal", process: "WindowsTerminal", title: "Terminal" },
  { names: ["cmd", "command prompt"], app: "cmd", process: "cmd", title: "cmd" },
  { names: ["outlook"], app: "outlook", process: "OUTLOOK", title: "Outlook" },
  { names: ["teams"], app: "teams", process: "ms-teams", title: "Teams" },
  { names: ["vscode", "vs code", "visual studio code", "code"], app: "code", process: "Code", title: "Visual Studio Code" },
  { names: ["explorer", "file explorer"], app: "explorer", process: "explorer", title: "Explorer" },
];

function findApp(text) {
  const t = text.toLowerCase().trim();
  return APP_DB.find(a => a.names.some(n => t.includes(n)));
}

// ── Goal parser ──────────────────────────────────────────────
// Extracts structured intent from natural language

function parseGoal(goal) {
  const g = goal.toLowerCase();
  const result = { apps: [], typeText: null, actions: [] };

  // Find app to open
  const openMatch = g.match(/(?:open|launch|start|run)\s+(.+?)(?:\s+and\s+|$)/);
  if (openMatch) {
    const app = findApp(openMatch[1]);
    if (app) result.apps.push(app);
    else result.apps.push({ app: openMatch[1].trim(), title: openMatch[1].trim(), process: null });
  }

  // Find text to type
  const typeMatch = goal.match(/(?:type|write|enter|input)\s+["""]?(.+?)["""]?\s*$/i);
  if (typeMatch) {
    result.typeText = typeMatch[1].replace(/^["'""]+|["'""]+$/g, "").trim();
  }

  // Special: "search for X" / "google X"
  const searchMatch = goal.match(/(?:search\s+(?:for\s+)?|google\s+)(.+)/i);
  if (searchMatch && result.apps.length === 0) {
    result.apps.push(APP_DB.find(a => a.app === "chrome"));
    result.actions.push("search");
    result.typeText = searchMatch[1].trim();
  }

  // Special: "close X"
  if (/(?:close|exit|quit)\s+/i.test(g)) {
    result.actions.push("close");
  }

  // Special: screenshot only
  if (/\b(screenshot|screen\s*shot|screen\s*cap)\b/.test(g)) {
    result.actions.push("screenshot");
  }

  return result;
}

// ── Vision via Claude CLI ────────────────────────────────────
// Writes prompt to a temp file to avoid all shell escaping issues

function callVision(screenshotPath, promptText) {
  const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";
  const tmpPrompt = path.join(os.tmpdir(), `backbone-vision-${Date.now()}.txt`);

  // Build env without CLAUDECODE to avoid nesting detection
  const env = { ...process.env };
  delete env.CLAUDECODE;
  if (process.platform === "win32") {
    const npmBin = path.join(process.env.APPDATA || "", "npm");
    const pathVal = env.PATH || env.Path || "";
    if (!pathVal.toLowerCase().includes(npmBin.toLowerCase())) {
      env.PATH = `${npmBin}${path.delimiter}${pathVal}`;
      env.Path = env.PATH;
    }
  }

  fs.writeFileSync(tmpPrompt, promptText);
  try {
    // Read prompt from stdin via file to avoid shell escaping
    const output = execSync(
      `${claudeCmd} --output-format text -p - < "${tmpPrompt}"`,
      { encoding: "utf-8", timeout: 120000, env, windowsHide: true, shell: true, maxBuffer: 2 * 1024 * 1024 }
    ).trim();

    const jsonMatch = output.match(/\{[^{}]*\}/);
    if (!jsonMatch) throw new Error(`No JSON in response: ${output.slice(0, 300)}`);
    return JSON.parse(jsonMatch[0]);
  } finally {
    try { fs.unlinkSync(tmpPrompt); } catch {}
  }
}

function askVision(screenshotPath, goal, history, step) {
  const historyText = history.length > 0
    ? `\nPrevious actions:\n${history.map(h => `  Step ${h.step}: ${h.action.action} → ${h.result}`).join("\n")}`
    : "";

  const prompt = `You are a desktop automation agent. Look at the screenshot and decide the SINGLE next action to achieve the goal.

Goal: "${goal}"
Step: ${step}${historyText}

IMPORTANT: Use the Read tool to look at the screenshot image at: ${screenshotPath}

Based on what you see, respond with ONLY a valid JSON object on a single line. Pick exactly ONE action:

{"action":"launch","app":"notepad"}
{"action":"click","x":500,"y":300}
{"action":"type","text":"hello world"}
{"action":"key","combo":"ctrl+a"}
{"action":"focus","title":"Notepad"}
{"action":"scroll","direction":"down"}
{"action":"wait","seconds":2}
{"action":"done","summary":"Goal completed - text was typed in Notepad"}

Rules:
- If an app needs to be opened, use "launch"
- If a window exists but isn't focused, use "focus" with part of its title
- If the right window is focused and ready for input, use "type"
- After typing, verify the text appeared before marking "done"
- Only use "done" when the goal is FULLY achieved
- Respond with the JSON object ONLY, no other text`;

  return callVision(screenshotPath, prompt);
}

// ── Execute a single action ──────────────────────────────────

function executeAction(action) {
  try {
    switch (action.action) {
      case "click":
        mouseClick(action.x, action.y, "left");
        return "clicked";

      case "double_click":
        mouseDoubleClick(action.x, action.y);
        return "double-clicked";

      case "right_click":
        mouseClick(action.x, action.y, "right");
        return "right-clicked";

      case "type":
        typeText(action.text);
        return `typed "${action.text.slice(0, 50)}"`;

      case "key":
        keyPress(action.combo);
        return `pressed ${action.combo}`;

      case "launch": {
        const result = launchApp(action.app);
        return result.launched ? `launched ${action.app}` : `failed: ${result.error}`;
      }

      case "focus":
        focusWindow(action.title);
        return `focused ${action.title}`;

      case "scroll":
        scroll(action.direction || "down", action.amount || 3);
        return `scrolled ${action.direction || "down"}`;

      case "wait": {
        const secs = action.seconds || 2;
        ps(`Start-Sleep -Seconds ${secs}`, secs * 1000 + 5000);
        return `waited ${secs}s`;
      }

      case "done":
        return "done";

      default:
        return `unknown action: ${action.action}`;
    }
  } catch (err) {
    return `error: ${err.message}`;
  }
}

// ── Verify + correct helpers ─────────────────────────────────

/**
 * Check if a window with the given process name or title fragment is running
 * and is the foreground window.
 */
function isAppReady(appInfo) {
  if (!appInfo || !appInfo.process) return false;
  try {
    const result = ps(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Linq;
public class FGCheck {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  public static string Check(string processName) {
    var fg = GetForegroundWindow();
    uint pid;
    GetWindowThreadProcessId(fg, out pid);
    var fgProc = Process.GetProcessById((int)pid);
    bool match = fgProc.ProcessName.IndexOf(processName, StringComparison.OrdinalIgnoreCase) >= 0;
    return match ? "YES" : "NO:" + fgProc.ProcessName;
  }
}
'@
Write-Host ([FGCheck]::Check('${appInfo.process.replace(/'/g, "''")}'))
`);
    return result.startsWith("YES");
  } catch {
    return false;
  }
}

/**
 * Wait for an app to become the foreground window.
 * Tries focusing it if it's running but not in front.
 */
function ensureAppFocused(appInfo, timeoutMs = 8000) {
  if (!appInfo) return false;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // Check if it's already focused
    if (isAppReady(appInfo)) return true;

    // Check if it's running at all
    const windows = listWindows();
    const found = windows.find(w => {
      const title = (w.MainWindowTitle || "").toLowerCase();
      const proc = (w.ProcessName || "").toLowerCase();
      return title.includes(appInfo.title.toLowerCase()) ||
             proc.includes((appInfo.process || "").toLowerCase());
    });

    if (found) {
      // It's running but not focused — bring it forward
      console.log(`${TAG}   Focusing: ${found.MainWindowTitle}`);
      focusWindow(found.MainWindowTitle);
      ps("Start-Sleep -Milliseconds 500", 3000);
      if (isAppReady(appInfo)) return true;
    }

    ps("Start-Sleep -Seconds 1", 3000);
  }
  return false;
}

// ── Main execution loop ──────────────────────────────────────

export async function execute({ goal, maxSteps = 15, useVision = false, keepOpen = false }) {
  if (!goal) return { success: false, error: "Goal is required" };

  console.log(`${TAG} Goal: "${goal}"`);
  console.log(`${TAG} Max steps: ${maxSteps}`);

  const parsed = parseGoal(goal);
  const history = [];
  let lastScreenshot = null;
  let step = 0;

  // ── Screenshot-only request ──
  if (parsed.actions.includes("screenshot")) {
    lastScreenshot = screenshot();
    console.log(`${TAG} Screenshot: ${lastScreenshot}`);
    return { success: true, summary: "Screenshot taken", stepsCompleted: 1, history, lastScreenshot };
  }

  // ── Close request ──
  if (parsed.actions.includes("close")) {
    keyPress("alt+f4");
    return { success: true, summary: "Sent close command", stepsCompleted: 1, history, lastScreenshot: null };
  }

  // ── Smart execution with verification ──
  // Phase 1: Launch the app if needed
  if (parsed.apps.length > 0) {
    const app = parsed.apps[0];
    step++;
    console.log(`${TAG} Step ${step}: Launching ${app.app}...`);
    const launchResult = launchApp(app.app);
    history.push({ step, action: { action: "launch", app: app.app }, result: launchResult.launched ? "launched" : "failed" });

    if (!launchResult.launched) {
      return { success: false, error: `Failed to launch ${app.app}`, stepsCompleted: step, history, lastScreenshot: null };
    }

    // Phase 2: Wait for app, dismiss popups, ensure focus
    const appWait = launchResult.wait || 2;
    step++;
    console.log(`${TAG} Step ${step}: Waiting ${appWait}s for ${app.title} to be ready...`);

    // Wait for the app to start (adaptive per-app)
    ps(`Start-Sleep -Seconds ${appWait}`, appWait * 1000 + 5000);

    // Dismiss "How do you want to open this file?" or similar dialogs
    try {
      const fgTitle = ps(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class FGTitle {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  public static string Get() {
    var hwnd = GetForegroundWindow();
    var sb = new StringBuilder(256);
    GetWindowText(hwnd, sb, 256);
    return sb.ToString();
  }
}
'@
Write-Host ([FGTitle]::Get())
`);
      if (fgTitle.toLowerCase().includes("how do you want to open") ||
          fgTitle.toLowerCase().includes("open with")) {
        console.log(`${TAG}   Dismissing dialog: "${fgTitle}"`);
        keyPress("escape");
        ps("Start-Sleep -Milliseconds 500", 3000);
      }
    } catch {}

    // Now try to focus the actual app (longer timeout for Office apps)
    const focusTimeout = appWait >= 5 ? 12000 : 5000;
    const ready = ensureAppFocused(app, focusTimeout);
    if (ready) {
      console.log(`${TAG}   ✓ ${app.title} is focused and ready`);
      history.push({ step, action: { action: "verify", check: "app_focused" }, result: "ready" });
    } else {
      // Try to find the window by process name in the window list
      const windows = listWindows();
      const appWindow = windows.find(w =>
        (w.ProcessName || "").toLowerCase() === (app.process || "").toLowerCase()
      );
      if (appWindow) {
        console.log(`${TAG}   Focusing by title: "${appWindow.MainWindowTitle}"`);
        focusWindow(appWindow.MainWindowTitle);
        ps("Start-Sleep -Milliseconds 500", 3000);
        history.push({ step, action: { action: "focus", title: appWindow.MainWindowTitle }, result: "focused by process match" });
      } else {
        console.log(`${TAG}   ⚠ ${app.title} window not found — proceeding anyway`);
        focusWindow(app.title);
        ps("Start-Sleep -Milliseconds 500", 3000);
        history.push({ step, action: { action: "focus", title: app.title }, result: "focused (best effort)" });
      }
    }
  }

  // Phase 3: Search mode
  if (parsed.actions.includes("search") && parsed.typeText) {
    await new Promise(r => setTimeout(r, 500));
    step++;
    keyPress("ctrl+l");
    history.push({ step, action: { action: "key", combo: "ctrl+l" }, result: "pressed ctrl+l" });
    await new Promise(r => setTimeout(r, 300));

    step++;
    typeText(parsed.typeText);
    history.push({ step, action: { action: "type", text: parsed.typeText }, result: "typed" });

    step++;
    keyPress("enter");
    history.push({ step, action: { action: "key", combo: "enter" }, result: "pressed enter" });

    lastScreenshot = screenshot();
    console.log(`${TAG} Done! Screenshot: ${lastScreenshot}`);
    return { success: true, summary: `Searched for: ${parsed.typeText}`, stepsCompleted: step, history, lastScreenshot };
  }

  // Phase 4: Type text if needed — click inside the app window first
  if (parsed.typeText) {
    await new Promise(r => setTimeout(r, 500));

    // Get the foreground window rect and click in its center
    step++;
    console.log(`${TAG} Step ${step}: Clicking inside app window to ensure text focus...`);
    try {
      const rect = ps(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinRect {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  public static string Get() {
    var hwnd = GetForegroundWindow();
    RECT r;
    GetWindowRect(hwnd, out r);
    return r.Left + "," + r.Top + "," + r.Right + "," + r.Bottom;
  }
}
'@
Write-Host ([WinRect]::Get())
`);
      const [left, top, right, bottom] = rect.split(",").map(Number);
      // Click in upper-middle area (where text editors usually have their content)
      const cx = Math.round((left + right) / 2);
      const cy = Math.round(top + (bottom - top) * 0.4);
      console.log(`${TAG}   Window rect: ${left},${top} → ${right},${bottom} — clicking ${cx},${cy}`);
      mouseClick(cx, cy, "left");
      history.push({ step, action: { action: "click", x: cx, y: cy }, result: "clicked inside window" });
    } catch {
      // Fallback to screen center
      const size = getScreenSize();
      mouseClick(Math.round(size.width / 2), Math.round(size.height / 2), "left");
      history.push({ step, action: { action: "click", x: size.width / 2, y: size.height / 2 }, result: "clicked center (fallback)" });
    }
    await new Promise(r => setTimeout(r, 300));

    step++;
    console.log(`${TAG} Step ${step}: Typing: "${parsed.typeText.slice(0, 60)}"`);
    typeText(parsed.typeText);
    history.push({ step, action: { action: "type", text: parsed.typeText }, result: "typed" });
  }

  // Phase 5: Verify — take screenshot, confirm goal looks achieved
  await new Promise(r => setTimeout(r, 500));
  lastScreenshot = screenshot();
  step++;
  console.log(`${TAG} Step ${step}: Verifying result...`);

  // If vision mode is enabled OR the planner can't determine success, use Claude
  if (useVision) {
    try {
      const verdict = askVision(lastScreenshot, goal, history, step);
      if (verdict.action === "done") {
        console.log(`${TAG} ✓ Vision confirmed: ${verdict.summary}`);
        return { success: true, summary: verdict.summary, stepsCompleted: step, history, lastScreenshot };
      } else {
        // Vision says more work needed — enter vision loop for remaining steps
        console.log(`${TAG} Vision says more work needed: ${JSON.stringify(verdict)}`);
        const visionResult = executeAction(verdict);
        history.push({ step, action: verdict, result: visionResult });

        // Continue with vision loop
        for (let vs = step + 1; vs <= maxSteps; vs++) {
          await new Promise(r => setTimeout(r, 500));
          lastScreenshot = screenshot();
          console.log(`${TAG} Step ${vs}: Vision analyzing...`);
          try {
            const action = askVision(lastScreenshot, goal, history, vs);
            console.log(`${TAG} Action: ${JSON.stringify(action)}`);
            if (action.action === "done") {
              return { success: true, summary: action.summary, stepsCompleted: vs, history, lastScreenshot };
            }
            const r2 = executeAction(action);
            console.log(`${TAG} Result: ${r2}`);
            history.push({ step: vs, action, result: r2 });
          } catch (err) {
            console.error(`${TAG} Vision error: ${err.message}`);
            break;
          }
        }
      }
    } catch (err) {
      console.log(`${TAG} Vision unavailable: ${err.message} — using heuristic verification`);
    }
  }

  // Heuristic verification: check if our target app is still focused
  if (parsed.apps.length > 0 && parsed.apps[0].process) {
    const stillFocused = isAppReady(parsed.apps[0]);
    if (stillFocused) {
      console.log(`${TAG} ✓ ${parsed.apps[0].title} still focused — likely succeeded`);
    } else {
      console.log(`${TAG} ⚠ ${parsed.apps[0].title} lost focus — result uncertain`);
    }
  }

  console.log(`${TAG} Done! Screenshot: ${lastScreenshot}`);

  // ── Auto-cleanup: close the app we opened (unless user wants it kept) ──
  if (parsed.apps.length > 0 && !keepOpen) {
    const app = parsed.apps[0];
    step++;
    console.log(`${TAG} Step ${step}: Closing ${app.title}...`);

    // Focus it first, then close
    try {
      const windows = listWindows();
      const appWindow = windows.find(w =>
        (w.ProcessName || "").toLowerCase() === (app.process || "").toLowerCase()
      );
      if (appWindow) {
        focusWindow(appWindow.MainWindowTitle);
        ps("Start-Sleep -Milliseconds 300", 3000);

        // Send Alt+F4 to close
        keyPress("alt+f4");
        ps("Start-Sleep -Milliseconds 500", 3000);

        // If it's an Office app, it may ask "Save?" — press N for Don't Save
        try {
          const fgTitle = ps(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class SaveCheck {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  public static string Get() {
    var hwnd = GetForegroundWindow();
    var sb = new StringBuilder(256);
    GetWindowText(hwnd, sb, 256);
    return sb.ToString();
  }
}
'@
Write-Host ([SaveCheck]::Get())
`);
          // Word/Excel save dialog or "Do you want to save" prompt
          if (fgTitle.toLowerCase().includes("save") ||
              fgTitle.toLowerCase().includes(app.title.toLowerCase())) {
            // Press "Don't Save" — typically N key or Tab+Enter
            keyPress("n");
            ps("Start-Sleep -Milliseconds 300", 3000);
          }
        } catch {}

        console.log(`${TAG}   ✓ ${app.title} closed`);
        history.push({ step, action: { action: "close", app: app.title }, result: "closed" });
      }
    } catch (err) {
      console.log(`${TAG}   ⚠ Could not close ${app.title}: ${err.message}`);
    }
  }

  return {
    success: true,
    summary: `Completed: ${goal}`,
    stepsCompleted: step,
    history,
    lastScreenshot,
  };
}

// ── Exported primitives (for direct use) ─────────────────────

export {
  screenshot,
  getScreenSize,
  mouseClick,
  mouseDoubleClick,
  mouseMove,
  typeText,
  keyPress,
  launchApp,
  focusWindow,
  listWindows,
  waitForWindow,
  scroll,
  executeAction,
};
