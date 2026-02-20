/**
 * Browser Agent — Autonomous AI browser agent
 *
 * Takes a natural language request, figures out what to do,
 * opens a browser, navigates to the right place, and reports back
 * with a plan before taking any actions.
 *
 * Flow:
 *   1. User says: "pay my electric bill" or "find flights to Tokyo"
 *   2. Agent PLANS: figures out what website to use, what steps to take
 *   3. Agent sends plan to user for approval (via WhatsApp or CLI)
 *   4. On approval: executes the steps, takes screenshots at each step
 *   5. Reports results back
 *
 * Usage:
 *   import { browserAgent } from "./tools/browser-agent.js";
 *   const result = await browserAgent({
 *     request: "pay my electric bill at Duke Energy",
 *     onPlan: async (plan) => { ... show to user, return true/false },
 *     onStep: async (step) => { ... log progress },
 *   });
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAG = "[BrowserAgent]";
const MAX_STEPS = 25;

// Load API key
function ensureApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    try {
      const dotenvPath = path.resolve(__dirname, "..", ".env");
      if (fs.existsSync(dotenvPath)) {
        const content = fs.readFileSync(dotenvPath, "utf-8");
        for (const line of content.split("\n")) {
          const match = line.match(/^ANTHROPIC_API_KEY=(.+)/);
          if (match) { process.env.ANTHROPIC_API_KEY = match[1].trim(); break; }
        }
      }
    } catch {}
    // Try vault
    if (!process.env.ANTHROPIC_API_KEY) {
      try {
        const home = process.env.HOME || process.env.USERPROFILE;
        const vaultPin = path.join(home, ".backbone", "users");
        // The key should be in env by the time server starts — this is fallback
      } catch {}
    }
  }
}

function getOutputDir() {
  const home = process.env.HOME || process.env.USERPROFILE;
  try {
    const activeUserFile = path.join(home, ".backbone", "active-user.json");
    const { uid } = JSON.parse(fs.readFileSync(activeUserFile, "utf-8"));
    if (uid) {
      const dir = path.join(home, ".backbone", "users", uid, "data", "browser-sessions");
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    }
  } catch {}
  const dir = path.join(home, ".backbone", "users", "default", "data", "browser-sessions");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Call Claude AI with optional screenshot.
 * Uses BACKBONE's multi-ai module (handles key from vault/env/config).
 */
async function askAI(systemPrompt, userPrompt, screenshotBase64 = null) {
  // Try BACKBONE's multi-ai first (has vault integration)
  try {
    const { sendMessage } = await import(path.resolve(__dirname, "..", "src", "services", "ai", "multi-ai.js"));
    // multi-ai doesn't support images, so for image tasks use Anthropic SDK
    if (!screenshotBase64) {
      const result = await sendMessage(userPrompt, { systemPrompt }, "instant");
      return result?.response || result?.text || "";
    }
  } catch {}

  // For image tasks or fallback: use Anthropic SDK directly
  ensureApiKey();
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const content = [];
  if (screenshotBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: screenshotBase64 },
    });
  }
  content.push({ type: "text", text: userPrompt });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content }],
  });

  return response.content[0]?.text || "";
}

/**
 * Phase 1: PLAN — Figure out what to do from the user's request.
 * Returns a structured plan with steps.
 */
async function createPlan(request, context = {}) {
  const systemPrompt = `You are BACKBONE's browser agent planner. The user has a request that requires browsing the web.

Your job is to create a PLAN — figure out:
1. What website(s) to visit
2. What steps to take on those websites
3. What information you need from the user (if any)

RESPOND IN THIS EXACT JSON FORMAT:
{
  "understanding": "What the user wants in one sentence",
  "website": "https://...",
  "websiteReason": "Why this website",
  "needsInfo": ["list of questions if you need more info from user"],
  "steps": [
    {"action": "navigate", "detail": "Go to the website"},
    {"action": "look", "detail": "Find the login/account section"},
    {"action": "read", "detail": "Read account balance and payment options"},
    ...
  ],
  "riskyActions": ["List any actions that need user approval (payments, form submissions, etc.)"],
  "estimatedTime": "2-3 minutes"
}

RULES:
- Be specific about which website. Search for the company if needed.
- ALWAYS list risky actions (payments, purchases, account changes) separately
- If the user hasn't given enough info (which company, what account), put questions in needsInfo
- Steps should be concrete: "Click the 'Pay Bill' button", not "do the thing"
- For payments/purchases: ALWAYS stop before the final submit and report back`;

  const userPrompt = `User request: "${request}"

${context.previousMessages ? `Recent conversation:\n${context.previousMessages}` : ""}
${context.userProfile ? `User context: ${context.userProfile}` : ""}

Create a plan to accomplish this using a web browser.`;

  const response = await askAI(systemPrompt, userPrompt);

  // Parse JSON from response
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {}

  // Fallback: return raw response as understanding
  return {
    understanding: response.slice(0, 200),
    website: null,
    needsInfo: ["I couldn't parse a plan. Could you be more specific?"],
    steps: [],
    riskyActions: [],
  };
}

/**
 * Launch browser with user's Chrome cookies (temp copy to avoid lock conflicts).
 */
async function launchBrowser(headless = false) {
  const home = process.env.HOME || process.env.USERPROFILE;
  const chromeDefaultDir = path.join(home, "AppData", "Local", "Google", "Chrome", "User Data", "Default");
  const chromeUserDataDir = path.join(home, "AppData", "Local", "Google", "Chrome", "User Data");
  const hasChromeProfile = fs.existsSync(path.join(chromeDefaultDir, "Cookies"));

  let browser = null, context, tempProfileDir = null;

  if (hasChromeProfile) {
    const os = await import("os");
    tempProfileDir = path.join(os.default.tmpdir(), `backbone-browser-${Date.now()}`);
    const tempDefault = path.join(tempProfileDir, "Default");
    fs.mkdirSync(tempDefault, { recursive: true });

    for (const file of ["Cookies", "Login Data", "Web Data", "Preferences", "Secure Preferences"]) {
      try {
        const src = path.join(chromeDefaultDir, file);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tempDefault, file));
      } catch {}
    }
    try {
      const ls = path.join(chromeUserDataDir, "Local State");
      if (fs.existsSync(ls)) fs.copyFileSync(ls, path.join(tempProfileDir, "Local State"));
    } catch {}

    console.log(`${TAG} Using Chrome cookies (logged-in sessions available)`);
    context = await chromium.launchPersistentContext(tempProfileDir, {
      headless, channel: "chrome",
      viewport: { width: 1440, height: 900 },
      args: ["--profile-directory=Default", "--no-sandbox"],
    });
  } else {
    console.log(`${TAG} No Chrome profile found, using clean browser`);
    browser = await chromium.launch({ headless, channel: "chrome" });
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  }

  return { browser, context, tempProfileDir };
}

/**
 * Phase 2: EXECUTE — Run the plan steps in the browser.
 * Takes screenshots at each step. Stops before risky actions.
 */
async function executePlan(plan, options = {}) {
  const { maxSteps = MAX_STEPS, headless = false, onStep } = options;
  const outputDir = getOutputDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const sessionFolder = path.join(outputDir, `session_${timestamp}`);
  fs.mkdirSync(sessionFolder, { recursive: true });

  const { browser, context, tempProfileDir } = await launchBrowser(headless);
  const page = await context.newPage();
  const stepLog = [];
  let finalResult = null;

  const systemPrompt = `You are a browser automation agent executing a plan.

PLAN: ${JSON.stringify(plan)}

You see a screenshot and page text. Decide the SINGLE next action.

RESPOND IN THIS EXACT FORMAT:
ACTION: click | type | press | scroll | navigate | wait | read | done
SELECTOR: CSS selector or visible text (for click/type)
VALUE: text to type or key to press (for type/press)
URL: full URL (for navigate)
RESULT: information gathered or summary (for read/done)
REASON: why this action

RULES:
- ONE action per response
- Use simple selectors: input[name="email"], button:has-text("Sign In")
- If you see a login page and the user should already be logged in, note it
- For ANY payment/purchase/submit: use ACTION: done and explain what you found — DO NOT click submit
- When you have the information the user wanted, use ACTION: done with RESULT`;

  try {
    // Navigate to starting URL
    if (plan.website) {
      await page.goto(plan.website, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(2000);
      stepLog.push({ step: 0, action: `Navigated to ${plan.website}`, success: true });
      if (onStep) await onStep({ step: 0, action: `Opened ${plan.website}` });
    }

    for (let step = 0; step < maxSteps; step++) {
      // Screenshot
      const screenshotPath = path.join(sessionFolder, `step_${step + 1}.png`);
      const screenshotBuffer = await page.screenshot({ path: screenshotPath });
      const screenshotBase64 = screenshotBuffer.toString("base64");

      // Page text
      let pageText = "";
      try { pageText = await page.evaluate(() => document.body.innerText); } catch {}
      const pageUrl = page.url();
      const pageTitle = await page.title();

      const history = stepLog.map((s, i) => `${i + 1}. ${s.action} → ${s.success ? "OK" : "FAILED"}`).join("\n");

      const aiResponse = await askAI(systemPrompt,
        `Page: ${pageTitle} (${pageUrl})\n\nVisible text (first 3000 chars):\n${pageText.slice(0, 3000)}\n\nPrevious steps:\n${history || "None"}\n\nNext action?`,
        screenshotBase64
      );

      // Parse action
      const actionMap = {};
      for (const line of aiResponse.split("\n")) {
        const m = line.match(/^(ACTION|SELECTOR|VALUE|URL|RESULT|REASON):\s*(.+)/i);
        if (m) actionMap[m[1].toLowerCase()] = m[2].trim();
      }

      const actionType = (actionMap.action || "done").toLowerCase();
      console.log(`${TAG} Step ${step + 1}: ${actionType} ${actionMap.selector || actionMap.url || ""}`);
      if (onStep) await onStep({ step: step + 1, action: `${actionType}: ${actionMap.reason || ""}` });

      if (actionType === "done" || actionType === "read") {
        finalResult = actionMap.result || aiResponse;
        stepLog.push({ step: step + 1, action: "done", success: true, result: finalResult });
        break;
      }

      // Execute
      let success = false;
      try {
        switch (actionType) {
          case "click":
            try { await page.click(actionMap.selector, { timeout: 5000 }); success = true; }
            catch {
              try { await page.getByText(actionMap.selector?.replace(/['"]/g, ""), { exact: false }).first().click({ timeout: 5000 }); success = true; }
              catch { success = false; }
            }
            break;
          case "type":
            try { await page.fill(actionMap.selector, actionMap.value || "", { timeout: 5000 }); success = true; }
            catch { success = false; }
            break;
          case "press":
            await page.keyboard.press(actionMap.value || "Enter"); success = true;
            break;
          case "scroll":
            await page.evaluate(() => window.scrollBy(0, 600)); success = true;
            break;
          case "navigate":
            if (actionMap.url) { await page.goto(actionMap.url, { waitUntil: "domcontentloaded", timeout: 15000 }); success = true; }
            break;
          case "wait":
            await page.waitForTimeout(2000); success = true;
            break;
        }
      } catch (e) {
        console.log(`${TAG}   Failed: ${e.message}`);
      }

      stepLog.push({ step: step + 1, action: `${actionType}: ${actionMap.selector || actionMap.url || ""}`, success });
      await page.waitForTimeout(1500);
    }

    // Final screenshot
    await page.screenshot({ path: path.join(sessionFolder, "final.png"), fullPage: true });
    let finalText = "";
    try { finalText = await page.evaluate(() => document.body.innerText); } catch {}
    fs.writeFileSync(path.join(sessionFolder, "final-text.txt"), finalText, "utf-8");

    // If no result yet, ask AI to summarize what it found
    if (!finalResult && finalText) {
      finalResult = await askAI(
        "Summarize what you found on this page in relation to the user's original request.",
        `Original request context: ${plan.understanding}\n\nPage text:\n${finalText.slice(0, 4000)}`,
        null
      );
    }

  } catch (err) {
    console.error(`${TAG} Error:`, err.message);
    finalResult = `Browser error: ${err.message}`;
  } finally {
    if (browser) await browser.close();
    else await context.close();
    if (tempProfileDir) try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch {}
  }

  // Save session
  fs.writeFileSync(path.join(sessionFolder, "session.json"), JSON.stringify({
    plan, steps: stepLog, result: finalResult, timestamp: new Date().toISOString(),
  }, null, 2), "utf-8");

  return { success: !!finalResult, result: finalResult, steps: stepLog, sessionFolder };
}

/**
 * Main entry point — takes natural language, plans, asks for approval, executes.
 *
 * @param {object} opts
 * @param {string} opts.request - Natural language request
 * @param {function} [opts.onPlan] - Called with plan, return true to approve
 * @param {function} [opts.onStep] - Called at each execution step
 * @param {function} [opts.onNeedInfo] - Called when agent needs more info from user
 * @param {object} [opts.context] - Extra context (conversation history, profile)
 * @param {boolean} [opts.autoApprove] - Skip plan approval (for read-only tasks)
 * @param {boolean} [opts.headless] - Run browser without GUI
 */
export async function browserAgent(opts) {
  const { request, onPlan, onStep, onNeedInfo, context = {}, autoApprove = false, headless = false } = opts;

  console.log(`${TAG} Request: "${request}"`);

  // Phase 1: Create plan
  console.log(`${TAG} Planning...`);
  const plan = await createPlan(request, context);
  console.log(`${TAG} Plan: ${plan.understanding}`);
  console.log(`${TAG} Website: ${plan.website || "TBD"}`);
  console.log(`${TAG} Steps: ${plan.steps?.length || 0}`);

  // Check if we need more info
  if (plan.needsInfo?.length > 0 && onNeedInfo) {
    const info = await onNeedInfo(plan.needsInfo);
    if (info) {
      // Re-plan with new info
      return browserAgent({ ...opts, request: `${request}. Additional info: ${info}`, context });
    }
  }

  // Show plan for approval
  if (!autoApprove && onPlan) {
    const approved = await onPlan(plan);
    if (!approved) {
      return { success: false, result: "Plan not approved by user", plan };
    }
  }

  // Check if we have a website
  if (!plan.website) {
    return {
      success: false,
      result: "I couldn't determine which website to use. " +
        (plan.needsInfo?.length ? `I need: ${plan.needsInfo.join(", ")}` : "Could you be more specific?"),
      plan,
    };
  }

  // Phase 2: Execute
  console.log(`${TAG} Executing plan...`);
  const result = await executePlan(plan, { headless, onStep });

  return { ...result, plan };
}

// Convenience export
export { browserAgent as browseWithGoal };

// CLI entry point
const isMainModule = process.argv[1]?.replace(/\\/g, "/").includes("browser-agent");
if (isMainModule) {
  const args = process.argv.slice(2);
  const request = args.filter(a => !a.startsWith("--")).join(" ");

  if (!request) {
    console.log("Usage: node tools/browser-agent.js <natural language request>");
    console.log('Example: node tools/browser-agent.js "check the S&P 500 price on Yahoo Finance"');
    console.log('Example: node tools/browser-agent.js "find flights from NYC to Tokyo next month"');
    process.exit(1);
  }

  browserAgent({
    request,
    autoApprove: args.includes("--auto"),
    headless: args.includes("--headless"),
    onPlan: async (plan) => {
      console.log("\n=== PLAN ===");
      console.log(`Goal: ${plan.understanding}`);
      console.log(`Website: ${plan.website}`);
      console.log(`Steps:`);
      plan.steps?.forEach((s, i) => console.log(`  ${i + 1}. ${s.detail}`));
      if (plan.riskyActions?.length) {
        console.log(`\nRisky actions (need your approval):`);
        plan.riskyActions.forEach(a => console.log(`  ⚠ ${a}`));
      }
      console.log("\nAuto-approving for CLI test...");
      return true;
    },
    onStep: async (step) => {
      console.log(`  → Step ${step.step}: ${step.action}`);
    },
    onNeedInfo: async (questions) => {
      console.log("\nAgent needs more info:");
      questions.forEach(q => console.log(`  ? ${q}`));
      return null; // Can't get input in non-interactive mode
    },
  })
    .then(result => {
      console.log("\n=== RESULT ===");
      console.log(result.result?.slice(0, 1000));
      process.exit(0);
    })
    .catch(err => {
      console.error("Agent failed:", err.message);
      process.exit(1);
    });
}
