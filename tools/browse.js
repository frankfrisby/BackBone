/**
 * Browse — Open a website using Chrome with the user's cookies/passwords.
 *
 * NO API keys needed. No Anthropic key. No Google OAuth. Nothing.
 * Just opens the page like the user would — Chrome cookies handle login.
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const TAG = "[Browse]";

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
 * Launch Chrome using the user's real cookies and saved passwords.
 * Copies cookie/login files to a temp dir to avoid lock conflicts with running Chrome.
 */
async function launchChromeWithCookies(headless = false) {
  const home = process.env.HOME || process.env.USERPROFILE;
  const chromeDefaultDir = path.join(home, "AppData", "Local", "Google", "Chrome", "User Data", "Default");
  const chromeUserDataDir = path.join(home, "AppData", "Local", "Google", "Chrome", "User Data");
  const hasChromeProfile = fs.existsSync(path.join(chromeDefaultDir, "Cookies"));

  let browser = null, context, tempProfileDir = null;

  if (hasChromeProfile) {
    const os = await import("os");
    tempProfileDir = path.join(os.default.tmpdir(), `backbone-browse-${Date.now()}`);
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
 * Open a URL, wait for it to load, return the page content.
 */
export async function execute({ url, headless = false, wait = 3000 }) {
  if (!url) return { success: false, error: "URL is required" };

  // Ensure protocol
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  const outputDir = getOutputDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const screenshotPath = path.join(outputDir, `browse_${timestamp}.png`);

  console.log(`${TAG} Opening ${url}...`);
  const { browser, context, tempProfileDir } = await launchChromeWithCookies(headless);
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (wait > 0) await page.waitForTimeout(wait);

    const title = await page.title();
    const text = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log(`${TAG} Page: ${title} (${text.length} chars)`);
    return {
      success: true,
      url: page.url(),
      title,
      text: text.slice(0, 10000), // Cap at 10K chars for MCP response
      screenshotPath,
      fullTextLength: text.length,
    };
  } catch (err) {
    return { success: false, error: err.message, url };
  } finally {
    if (browser) await browser.close();
    else await context.close();
    if (tempProfileDir) try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch {}
  }
}
