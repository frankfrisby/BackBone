import { chromium } from "playwright";
import Anthropic from "@anthropic-ai/sdk";
import { EventEmitter } from "events";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Browser Agent — Vision-Driven Browser Automation
 *
 * Opens a real Chrome browser (using the user's profile, already logged in),
 * takes a screenshot, sends it to Claude vision, gets back the next action
 * (click, type, scroll, etc.), executes it, screenshots again, and loops
 * until the goal is achieved.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");
const LOGS_DIR = path.join(DATA_DIR, "browser-agent-logs");
const DEFAULT_CHROME_USER_DATA_DIR = "C:\\Users\\frank\\AppData\\Local\\Google\\Chrome\\User Data";

const ensureDirs = () => {
  [DATA_DIR, SCREENSHOTS_DIR, LOGS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
};

const findChromeChannel = () => {
  const platform = os.platform();
  if (platform === "win32") {
    const chromePath = path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe");
    const chromeX86 = path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe");
    if (fs.existsSync(chromePath) || fs.existsSync(chromeX86)) return "chrome";
    const edgePath = path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe");
    if (fs.existsSync(edgePath)) return "msedge";
  }
  return "chrome";
};

const VISION_SYSTEM_PROMPT = `You are a browser automation agent. You see a screenshot of a browser and must decide the next action to accomplish the user's goal.

You MUST respond with ONLY valid JSON (no markdown, no backticks, no extra text). Use this exact format:

{
  "thinking": "Brief description of what you see and your reasoning",
  "action": "ACTION_TYPE",
  ...action-specific parameters
}

Available actions:

1. navigate — Go to a URL
   {"thinking": "...", "action": "navigate", "url": "https://example.com"}

2. click — Click at coordinates or a CSS selector
   {"thinking": "...", "action": "click", "x": 245, "y": 310}
   {"thinking": "...", "action": "click", "selector": "button.submit"}

3. type — Type text (optionally clear the field first)
   {"thinking": "...", "action": "type", "text": "Hello world", "clear": true}

4. scroll — Scroll the page
   {"thinking": "...", "action": "scroll", "direction": "down", "amount": 500}

5. pressKey — Press a keyboard key
   {"thinking": "...", "action": "pressKey", "key": "Enter"}

6. wait — Wait for content to load
   {"thinking": "...", "action": "wait", "ms": 2000}

7. select — Select from a dropdown
   {"thinking": "...", "action": "select", "selector": "select#country", "value": "US"}

8. done — Goal is achieved
   {"thinking": "...", "action": "done", "result": "Description of what was accomplished"}

9. fail — Goal cannot be achieved
   {"thinking": "...", "action": "fail", "reason": "Why the goal cannot be completed"}

Important:
- Click coordinates are in pixels relative to the viewport (1280x900).
- When typing, the text goes to the currently focused element. Click an input first if needed.
- Use "clear": true when replacing existing text in an input field.
- For keyboard shortcuts, use pressKey with modifiers like "Control+a" or "Control+c".
- If you see an error or unexpected state, adapt — don't repeat the same failed action.
- When the task is complete, use "done" with a summary of what was accomplished.
- If stuck after several attempts, use "fail" with a clear reason.`;

export class BrowserAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    this.browser = null;
    this.page = null;
    this.anthropic = null;
    this.model = options.model || "claude-sonnet-4-20250514";
    this.maxIterations = options.maxIterations || 25;
    this.downloadPath = options.downloadPath || path.join(os.homedir(), "Downloads");
    this.userDataDir = options.userDataDir || process.env.CHROME_USER_DATA_DIR || DEFAULT_CHROME_USER_DATA_DIR;
    this.profileDirectory = options.profileDirectory || process.env.CHROME_PROFILE_DIRECTORY || "Default";
    this.actionHistory = [];
    this.screenshots = [];
    this.downloads = [];
    this.runId = `run_${Date.now()}`;
  }

  /**
   * Initialize the Anthropic client
   */
  _initClient() {
    if (this.anthropic) return;
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable");
    }
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * Kill any existing Chrome processes so we can use the profile.
   * Chrome locks its user-data directory — only one process can use it at a time.
   * We close Chrome gracefully first, then force-kill if still running.
   */
  async _killExistingChrome() {
    const platform = os.platform();
    try {
      if (platform === "win32") {
        // Check if chrome.exe is running
        const list = execSync("tasklist /FI \"IMAGENAME eq chrome.exe\" /NH", { encoding: "utf-8", timeout: 5000 });
        if (!list.includes("chrome.exe")) return; // Not running

        console.log("[BrowserAgent] Chrome is running — closing it to free the profile lock...");
        // Graceful close first (sends WM_CLOSE)
        try {
          execSync("taskkill /IM chrome.exe", { encoding: "utf-8", timeout: 10000 });
        } catch {}
        // Wait a moment for graceful shutdown
        await new Promise(r => setTimeout(r, 2000));

        // Check again — force kill if still running
        const listAfter = execSync("tasklist /FI \"IMAGENAME eq chrome.exe\" /NH", { encoding: "utf-8", timeout: 5000 });
        if (listAfter.includes("chrome.exe")) {
          console.log("[BrowserAgent] Chrome still running — force killing...");
          try {
            execSync("taskkill /F /IM chrome.exe", { encoding: "utf-8", timeout: 10000 });
          } catch {}
          await new Promise(r => setTimeout(r, 1000));
        }
        console.log("[BrowserAgent] Chrome closed.");
      } else {
        // macOS / Linux
        try {
          execSync("pgrep -x 'Google Chrome' || pgrep -x chrome", { encoding: "utf-8", timeout: 5000 });
        } catch {
          return; // Not running
        }
        console.log("[BrowserAgent] Chrome is running — closing it to free the profile lock...");
        try {
          execSync("pkill -x 'Google Chrome' || pkill -x chrome", { encoding: "utf-8", timeout: 10000 });
        } catch {}
        await new Promise(r => setTimeout(r, 2000));
        console.log("[BrowserAgent] Chrome closed.");
      }
    } catch (err) {
      // Non-fatal — if we can't detect/kill, the launch will fail with a clear error anyway
      console.log(`[BrowserAgent] Could not check/close Chrome: ${err.message}`);
    }
  }

  /**
   * Launch browser with persistent Chrome profile
   */
  async _launchBrowser() {
    await this._killExistingChrome();

    this.browser = await chromium.launchPersistentContext(this.userDataDir, {
      headless: false,
      channel: findChromeChannel(),
      args: [
        `--profile-directory=${this.profileDirectory}`,
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-infobars",
      ],
      viewport: { width: 1280, height: 900 },
      ignoreDefaultArgs: ["--enable-automation"],
      acceptDownloads: true,
    });

    this.page = this.browser.pages()[0] || await this.browser.newPage();

    // Listen for downloads
    this.page.on("download", async (download) => {
      try {
        const fileName = download.suggestedFilename();
        const savePath = path.join(this.downloadPath, fileName);
        await download.saveAs(savePath);
        this.downloads.push({ fileName, savePath, time: new Date().toISOString() });
        this.emit("download-complete", { fileName, savePath });
      } catch (err) {
        this.emit("step-error", { error: `Download failed: ${err.message}` });
      }
    });
  }

  /**
   * Take a screenshot and save it
   */
  async _takeScreenshot(step) {
    ensureDirs();
    const fileName = `browser-agent_${this.runId}_step${step}.png`;
    const filePath = path.join(SCREENSHOTS_DIR, fileName);
    await this.page.screenshot({ path: filePath });
    this.screenshots.push(filePath);
    return filePath;
  }

  /**
   * Send screenshot to Claude vision and get the next action
   */
  async _analyzeScreenshot(screenshotPath, taskDescription, step) {
    const imageBase64 = fs.readFileSync(screenshotPath).toString("base64");

    // Build action history context (last 10 actions)
    const recentHistory = this.actionHistory.slice(-10);
    const historyText = recentHistory.length > 0
      ? "\n\nPrevious actions taken:\n" + recentHistory.map((h, i) =>
          `${i + 1}. [${h.action}] ${h.thinking}${h.error ? ` (ERROR: ${h.error})` : ""}`
        ).join("\n")
      : "";

    const userContent = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: imageBase64,
        },
      },
      {
        type: "text",
        text: `GOAL: ${taskDescription}\n\nThis is step ${step} of up to ${this.maxIterations}. Current page URL: ${this.page.url()}${historyText}\n\nAnalyze the screenshot and return the next action as JSON.`,
      },
    ];

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: VISION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const text = response.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("\n");

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Vision model returned non-JSON response: ${text.substring(0, 200)}`);
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Execute a single action on the page
   */
  async _executeAction(action) {
    switch (action.action) {
      case "navigate":
        await this.page.goto(action.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        break;

      case "click":
        if (action.selector) {
          await this.page.click(action.selector, { timeout: 5000 });
        } else if (action.x !== undefined && action.y !== undefined) {
          await this.page.mouse.click(action.x, action.y);
        } else {
          throw new Error("Click action requires 'selector' or 'x'/'y' coordinates");
        }
        break;

      case "type":
        if (action.clear) {
          await this.page.keyboard.press("Control+a");
          await this.page.keyboard.press("Backspace");
        }
        await this.page.keyboard.type(action.text, { delay: 30 });
        break;

      case "scroll":
        const direction = action.direction || "down";
        const amount = action.amount || 500;
        const deltaY = direction === "up" ? -amount : amount;
        await this.page.mouse.wheel(0, deltaY);
        break;

      case "pressKey":
        await this.page.keyboard.press(action.key);
        break;

      case "wait":
        await this.page.waitForTimeout(action.ms || 2000);
        break;

      case "select":
        await this.page.selectOption(action.selector, action.value);
        break;

      case "done":
      case "fail":
        // Terminal actions — handled by the loop
        break;

      default:
        throw new Error(`Unknown action: ${action.action}`);
    }
  }

  /**
   * Run the vision-action loop for a task
   */
  async run(taskDescription, options = {}) {
    ensureDirs();
    this._initClient();

    const startUrl = options.startUrl;
    const maxIterations = options.maxIterations || this.maxIterations;
    if (options.downloadPath) this.downloadPath = options.downloadPath;
    if (options.model) this.model = options.model;

    const runLog = {
      runId: this.runId,
      task: taskDescription,
      startUrl,
      model: this.model,
      startedAt: new Date().toISOString(),
      steps: [],
      result: null,
    };

    this.emit("task-started", { runId: this.runId, task: taskDescription, startUrl });

    try {
      await this._launchBrowser();

      if (startUrl) {
        await this.page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await this.page.waitForTimeout(2000);
        this.emit("navigation", { url: this.page.url(), startUrl });
      }

      for (let step = 1; step <= maxIterations; step++) {
        // 1. Take screenshot
        const screenshotPath = await this._takeScreenshot(step);

        // 2. Analyze with Claude vision
        let analysis;
        try {
          analysis = await this._analyzeScreenshot(screenshotPath, taskDescription, step);
        } catch (err) {
          const stepLog = { step, error: `Analysis failed: ${err.message}`, time: new Date().toISOString() };
          runLog.steps.push(stepLog);
          this.emit("step-error", stepLog);
          // Wait and retry on next iteration
          await this.page.waitForTimeout(2000);
          continue;
        }

        this.emit("step-analysis", { step, ...analysis });

        const stepLog = {
          step,
          thinking: analysis.thinking,
          action: analysis.action,
          params: { ...analysis },
          time: new Date().toISOString(),
          error: null,
        };
        delete stepLog.params.thinking;
        delete stepLog.params.action;

        // 3. Handle terminal actions
        if (analysis.action === "done") {
          stepLog.result = analysis.result;
          runLog.steps.push(stepLog);
          this.actionHistory.push(analysis);

          runLog.result = {
            success: true,
            message: analysis.result,
            steps: step,
            downloads: this.downloads,
            screenshots: this.screenshots,
            runId: this.runId
          };
          runLog.completedAt = new Date().toISOString();
          this._saveRunLog(runLog);

          this.emit("task-completed", runLog.result);
          await this._cleanup();
          return runLog.result;
        }

        if (analysis.action === "fail") {
          stepLog.result = analysis.reason;
          runLog.steps.push(stepLog);
          this.actionHistory.push(analysis);

          runLog.result = {
            success: false,
            error: analysis.reason,
            steps: step,
            downloads: this.downloads,
            screenshots: this.screenshots,
            runId: this.runId
          };
          runLog.completedAt = new Date().toISOString();
          this._saveRunLog(runLog);

          this.emit("task-failed", runLog.result);
          await this._cleanup();
          return runLog.result;
        }

        // 4. Execute action
        try {
          await this._executeAction(analysis);
          this.actionHistory.push(analysis);
          this.emit("step-executed", { step, action: analysis.action });
        } catch (err) {
          stepLog.error = err.message;
          analysis.error = err.message;
          this.actionHistory.push(analysis);
          this.emit("step-error", { step, action: analysis.action, error: err.message });
        }

        runLog.steps.push(stepLog);

        // Brief pause to let the page settle after an action
        await this.page.waitForTimeout(1500);
      }

      // Max iterations reached
      runLog.result = {
        success: false,
        error: `Max iterations (${maxIterations}) reached`,
        steps: maxIterations,
        downloads: this.downloads,
        screenshots: this.screenshots,
        runId: this.runId
      };
      runLog.completedAt = new Date().toISOString();
      this._saveRunLog(runLog);

      this.emit("task-failed", runLog.result);
      await this._cleanup();
      return runLog.result;

    } catch (err) {
      runLog.result = {
        success: false,
        error: err.message,
        downloads: this.downloads,
        screenshots: this.screenshots,
        runId: this.runId
      };
      runLog.completedAt = new Date().toISOString();
      this._saveRunLog(runLog);

      this.emit("task-failed", runLog.result);
      await this._cleanup();
      return runLog.result;
    }
  }

  /**
   * Save the run log to disk
   */
  _saveRunLog(runLog) {
    try {
      ensureDirs();
      const logPath = path.join(LOGS_DIR, `${this.runId}.json`);
      fs.writeFileSync(logPath, JSON.stringify(runLog, null, 2));
    } catch (err) {
      console.error(`[BrowserAgent] Failed to save run log: ${err.message}`);
    }
  }

  /**
   * Clean up browser resources
   */
  async _cleanup() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {}
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Abort a running task
   */
  async abort() {
    this.emit("task-failed", { success: false, error: "Aborted by user" });
    await this._cleanup();
  }
}

// --- Singleton & convenience API ---

let agentInstance = null;

export const getBrowserAgent = () => {
  if (!agentInstance) {
    agentInstance = new BrowserAgent();
  }
  return agentInstance;
};

/**
 * Run a browser automation task.
 *
 * @param {string} taskDescription - Natural language description of the goal
 * @param {object} [options]
 * @param {string} [options.startUrl] - URL to navigate to before starting
 * @param {string} [options.downloadPath] - Where to save downloaded files
 * @param {string} [options.model] - Claude model to use for vision
 * @param {number} [options.maxIterations] - Max vision-action loop iterations
 * @param {string} [options.userDataDir] - Chrome user data directory
 * @param {string} [options.profileDirectory] - Chrome profile directory name
 * @returns {Promise<{success: boolean, message?: string, error?: string, steps: number, downloads?: Array}>}
 */
export const runBrowserTask = async (taskDescription, options = {}) => {
  // Create a fresh agent per task so runs don't share state
  const agent = new BrowserAgent({
    userDataDir: options.userDataDir,
    profileDirectory: options.profileDirectory,
    model: options.model,
    maxIterations: options.maxIterations,
    downloadPath: options.downloadPath,
  });

  // Forward events so callers can listen
  const events = ["task-started", "navigation", "step-analysis", "step-executed", "step-error", "download-complete", "task-completed", "task-failed"];
  for (const evt of events) {
    agent.on(evt, (...args) => {
      if (typeof options.onEvent === "function") {
        try {
          options.onEvent(evt, ...args);
        } catch {}
      }
      // Log to console for visibility
      if (evt === "step-analysis") {
        const data = args[0];
        console.log(`[BrowserAgent] Step ${data.step}: ${data.thinking}`);
        console.log(`[BrowserAgent]   → ${data.action}${data.x ? ` (${data.x},${data.y})` : ""}${data.url ? ` ${data.url}` : ""}${data.text ? ` "${data.text}"` : ""}`);
      } else if (evt === "step-error") {
        console.log(`[BrowserAgent] Error: ${args[0].error}`);
      } else if (evt === "task-completed") {
        console.log(`[BrowserAgent] Task completed: ${args[0].message}`);
      } else if (evt === "task-failed") {
        console.log(`[BrowserAgent] Task failed: ${args[0].error}`);
      } else if (evt === "download-complete") {
        console.log(`[BrowserAgent] Downloaded: ${args[0].fileName} → ${args[0].savePath}`);
      }
    });
  }

  const result = await agent.run(taskDescription, options);
  return {
    ...result,
    screenshots: agent.screenshots,
    runId: agent.runId
  };
};
