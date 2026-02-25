/**
 * backbone do — Unified computer use from the command line
 *
 * Smart enough to handle desktop apps AND websites.
 * Routes to the right tool based on the goal:
 *   - Desktop apps → computer-use.js (PowerShell primitives)
 *   - Websites → browser-agent.js (Playwright + vision)
 *   - Data queries → MCP tools (Empower, Robinhood, Gmail, etc.)
 *
 * Each target has a skill file that teaches the system how to navigate it.
 *
 * Usage:
 *   backbone do "open Word and type hello"
 *   backbone do "check my email on Gmail"
 *   backbone do "go to robinhood and check my portfolio"
 *   backbone do "check my net worth on Empower"
 */

import { theme } from "./theme.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, "../../skills");

const HELP = `
backbone do — Unified desktop + web computer use

Usage: backbone do "<goal>"

Desktop Examples:
  backbone do "open Notepad and type Hello World"
  backbone do "open Word and write a letter"
  backbone do "open Excel and create a budget"

Web Examples:
  backbone do "check my email on Gmail"
  backbone do "go to Robinhood and check my portfolio"
  backbone do "check my net worth on Empower"
  backbone do "search Google for best restaurants near me"
  backbone do "go to outlook.live.com and check my inbox"

Options:
  --steps <n>     Maximum steps (default: 15)
  --vision        Use AI vision for desktop apps (slower but smarter)
  --keep-open     Don't close app/browser when done
  --help          Show this help
`;

// ── Skill-based routing ──────────────────────────────────────

/**
 * Load all navigation skills and match against the goal.
 * Returns { type: "web"|"desktop"|"data", skill, url?, app? }
 */
function routeGoal(goal) {
  const g = goal.toLowerCase();

  // ── Web patterns (explicit URLs or site names) ──
  const webTargets = [
    { re: /\b(empower|personal\s*capital|net\s*worth)\b/, skill: "web-empower", url: "https://home.personalcapital.com/page/login/goHome", dataFirst: "empower" },
    { re: /\b(gmail|google\s*mail|check\s*(my\s*)?email)\b/, skill: "web-gmail", url: "https://mail.google.com", dataFirst: "gmail" },
    { re: /\b(outlook|live\.com|hotmail)\b/, skill: "web-outlook", url: "https://outlook.live.com/mail/0/" },
    { re: /\b(robinhood)\b/, skill: "web-robinhood", url: "https://robinhood.com/", dataFirst: "robinhood" },
    { re: /\b(google\s*drive)\b/, skill: "web-google", url: "https://drive.google.com" },
    { re: /\b(google\s*calendar)\b/, skill: "web-google", url: "https://calendar.google.com" },
    { re: /\b(youtube)\b/, skill: "web-google", url: "https://www.youtube.com" },
    { re: /\b(google|search\s+(for|the|on)\b)/i, skill: "web-google", url: "https://www.google.com" },
  ];

  // ── Desktop app patterns ──
  const desktopTargets = [
    { re: /\b(word|winword|write\s+a\s+(letter|document|report))\b/, skill: "app-word", app: "word" },
    { re: /\b(excel|spreadsheet|workbook)\b/, skill: "app-excel", app: "excel" },
    { re: /\b(powerpoint|presentation|slide)\b/, skill: null, app: "powerpoint" },
    { re: /\b(notepad)\b/, skill: null, app: "notepad" },
    { re: /\b(calculator|calc)\b/, skill: null, app: "calculator" },
    { re: /\b(paint)\b/, skill: null, app: "paint" },
    { re: /\b(chrome)\b/, skill: null, app: "chrome" },
    { re: /\b(terminal|powershell)\b/, skill: null, app: "terminal" },
    { re: /\b(vscode|vs\s*code)\b/, skill: null, app: "code" },
  ];

  // ── Explicit URL in goal ──
  const urlMatch = goal.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    return { type: "web", url: urlMatch[0], skill: null };
  }

  // ── Check web targets ──
  for (const t of webTargets) {
    if (t.re.test(g)) {
      return { type: "web", skill: t.skill, url: t.url, dataFirst: t.dataFirst };
    }
  }

  // ── Check desktop targets ──
  for (const t of desktopTargets) {
    if (t.re.test(g)) {
      return { type: "desktop", skill: t.skill, app: t.app };
    }
  }

  // ── Default: treat as desktop if "open/launch" detected, else web search ──
  if (/\b(open|launch|start|run)\b/i.test(g)) {
    return { type: "desktop", skill: null };
  }

  // Default to web search
  return { type: "web", skill: "web-google", url: "https://www.google.com" };
}

/**
 * Load a skill file's content for context.
 */
function loadSkill(skillName) {
  if (!skillName) return null;
  const skillPath = path.join(SKILLS_DIR, `${skillName}.md`);
  try {
    return fs.readFileSync(skillPath, "utf-8");
  } catch {
    return null;
  }
}

// ── Execution handlers ───────────────────────────────────────

async function executeDesktop(goal, options) {
  const { execute } = await import("../../tools/computer-use.js");
  return execute(options);
}

async function executeWeb(goal, route, options) {
  const { maxSteps, keepOpen } = options;
  const url = route.url;

  console.log(`  ${theme.muted("Mode:")} Web navigation`);
  if (url) console.log(`  ${theme.muted("URL:")} ${url}`);
  if (route.skill) console.log(`  ${theme.muted("Skill:")} ${route.skill}`);
  console.log("");

  // Try browser-agent first (autonomous web navigation)
  try {
    const browserAgent = await import("../../tools/browser-agent.js");
    if (browserAgent.execute) {
      const skillContent = loadSkill(route.skill);
      const enrichedGoal = skillContent
        ? `${goal}\n\nNavigation skill reference:\n${skillContent}`
        : goal;

      const result = await browserAgent.execute({
        goal: enrichedGoal,
        url: url || undefined,
        maxSteps: maxSteps || 20,
      });

      return result;
    }
  } catch (err) {
    console.log(`  ${theme.muted("browser-agent unavailable:")} ${err.message}`);
  }

  // Fallback: just open the URL in the default browser
  try {
    const { execute: openUrl } = await import("../../tools/open-url.js");
    if (openUrl) {
      const result = await openUrl({ url });
      return { success: true, summary: `Opened ${url}`, stepsCompleted: 1, lastScreenshot: null };
    }
  } catch {}

  // Last resort: use computer-use to launch Chrome with URL
  const { execute } = await import("../../tools/computer-use.js");
  const { launchApp, waitForWindow, keyPress, typeText } = await import("../../tools/computer-use.js");

  launchApp("chrome");
  const { execSync } = await import("child_process");
  execSync("powershell -NoProfile -c \"Start-Sleep -Seconds 3\"", { windowsHide: true });

  if (url) {
    keyPress("ctrl+l");
    execSync("powershell -NoProfile -c \"Start-Sleep -Milliseconds 300\"", { windowsHide: true });
    typeText(url);
    keyPress("enter");
    execSync("powershell -NoProfile -c \"Start-Sleep -Seconds 2\"", { windowsHide: true });
  }

  const { screenshot } = await import("../../tools/computer-use.js");
  const shot = screenshot();
  return { success: true, summary: `Opened ${url || "Chrome"}`, stepsCompleted: 3, lastScreenshot: shot };
}

async function executeDataQuery(goal, route) {
  // For data-first routes, try MCP tools before opening the browser
  console.log(`  ${theme.muted("Mode:")} Data query (trying MCP first)`);
  console.log("");

  // This would call the appropriate MCP tools
  // For now, signal that this should be handled by the main AI loop
  return {
    success: false,
    error: "Data queries should be handled through the main BACKBONE interface, not backbone do. Try asking in the TUI or via WhatsApp.",
    suggestion: route.dataFirst === "empower" ? "Ask: 'what is my net worth?'" :
                route.dataFirst === "robinhood" ? "Ask: 'show my Robinhood positions'" :
                route.dataFirst === "gmail" ? "Ask: 'check my email'" :
                "Ask your question in the BACKBONE TUI",
    stepsCompleted: 0,
  };
}

// ── Main entry point ─────────────────────────────────────────

export async function runDo(args) {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.log(HELP);
    return;
  }

  // Parse flags
  let maxSteps = 15;
  const stepsIdx = args.indexOf("--steps");
  if (stepsIdx >= 0 && args[stepsIdx + 1]) {
    maxSteps = parseInt(args[stepsIdx + 1]) || 15;
  }
  const useVision = args.includes("--vision");
  const keepOpen = args.includes("--keep-open");

  // Extract goal (everything that's not a flag)
  const flagWords = new Set(["--steps", "--vision", "--keep-open"]);
  const goal = args.filter((a, i) => {
    if (flagWords.has(a)) return false;
    if (i > 0 && args[i - 1] === "--steps") return false;
    return !a.startsWith("--");
  }).join(" ");

  if (!goal) {
    console.log(theme.error("Please provide a goal. Example: backbone do \"open Notepad\""));
    return;
  }

  console.log(theme.heading("\n  BACKBONE Do\n"));
  console.log(`  ${theme.muted("Goal:")} ${goal}`);

  // ── Route the goal ──
  const route = routeGoal(goal);
  console.log(`  ${theme.muted("Type:")} ${route.type}`);

  let result;
  try {
    switch (route.type) {
      case "desktop": {
        const skill = loadSkill(route.skill);
        if (skill) console.log(`  ${theme.muted("Skill:")} ${route.skill}`);
        console.log(`  ${theme.muted("Max steps:")} ${maxSteps}`);
        console.log("");
        result = await executeDesktop(goal, { goal, maxSteps, useVision, keepOpen });
        break;
      }

      case "web": {
        if (route.dataFirst && !args.includes("--browse")) {
          // Suggest using data tools instead of browser
          result = await executeDataQuery(goal, route);
          if (!result.success && result.suggestion) {
            console.log(`  ${theme.info("Tip:")} ${result.suggestion}`);
            console.log(`  ${theme.muted("Add --browse to force browser navigation")}`);
            console.log("");
            // Fall through to browser anyway
            result = await executeWeb(goal, route, { maxSteps, keepOpen });
          }
        } else {
          console.log(`  ${theme.muted("Max steps:")} ${maxSteps}`);
          result = await executeWeb(goal, route, { maxSteps, keepOpen });
        }
        break;
      }

      default:
        result = await executeDesktop(goal, { goal, maxSteps, useVision, keepOpen });
    }

    console.log("");
    if (result.success) {
      console.log(`  ${theme.success("✓")} ${result.summary}`);
      console.log(`  ${theme.muted(`Completed in ${result.stepsCompleted} steps`)}`);
    } else {
      console.log(`  ${theme.error("✗")} ${result.error}`);
      if (result.stepsCompleted > 0) {
        console.log(`  ${theme.muted(`Attempted ${result.stepsCompleted} steps`)}`);
      }
    }

    if (result.lastScreenshot) {
      console.log(`  ${theme.muted("Screenshot:")} ${result.lastScreenshot}`);
    }
    console.log("");
  } catch (err) {
    console.error(theme.error(`\n  Failed: ${err.message}`));
  }
}
