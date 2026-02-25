#!/usr/bin/env node
/**
 * Browser Capture Tool
 *
 * Opens a real Chrome browser, navigates to a URL, captures:
 * - Screenshot (PNG)
 * - Full page text
 * - Page title & metadata
 * - All links
 *
 * Saves everything to ~/.backbone/users/<uid>/data/captures/<timestamp>/
 *
 * Usage:
 *   node tools/browser-capture.js <url>
 *   node tools/browser-capture.js https://example.com
 *   node tools/browser-capture.js https://finance.yahoo.com --wait 5000
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Resolve user data dir
function getCaptureDir() {
  const home = process.env.HOME || process.env.USERPROFILE;
  const activeUserFile = path.join(home, ".backbone", "active-user.json");
  let uid = "default";
  try {
    const { uid: u } = JSON.parse(fs.readFileSync(activeUserFile, "utf-8"));
    if (u) uid = u;
  } catch {}
  const dir = path.join(home, ".backbone", "users", uid, "data", "captures");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function capture(url, options = {}) {
  const { wait = 3000, headless = true } = options;
  const captureDir = getCaptureDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug = new URL(url).hostname.replace(/\./g, "-");
  const folder = path.join(captureDir, `${timestamp}_${slug}`);
  fs.mkdirSync(folder, { recursive: true });

  console.log(`Opening browser → ${url}`);

  // Use user's Chrome cookies (copy to temp dir to avoid lock conflicts)
  const home = process.env.HOME || process.env.USERPROFILE;
  const chromeDefaultDir = path.join(home, "AppData", "Local", "Google", "Chrome", "User Data", "Default");
  const chromeUserDataDir = path.join(home, "AppData", "Local", "Google", "Chrome", "User Data");
  const hasChromeProfile = fs.existsSync(path.join(chromeDefaultDir, "Cookies"));

  let browser, context;
  let tempProfileDir = null;

  if (hasChromeProfile) {
    const os = await import("os");
    tempProfileDir = path.join(os.default.tmpdir(), `backbone-capture-${Date.now()}`);
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
    console.log(`  Using Chrome cookies (logged-in sessions available)`);
    context = await chromium.launchPersistentContext(tempProfileDir, {
      headless, channel: "chrome",
      viewport: { width: 1440, height: 900 },
      args: ["--profile-directory=Default", "--no-sandbox"],
    });
    browser = null;
  } else {
    browser = await chromium.launch({ headless, channel: "chrome" });
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  }

  const page = await context.newPage();

  // Collect XHR/API responses
  const apiResponses = [];
  page.on("response", async (response) => {
    const ct = response.headers()["content-type"] || "";
    if (ct.includes("application/json")) {
      try {
        const body = await response.json();
        apiResponses.push({
          url: response.url(),
          status: response.status(),
          body,
        });
      } catch {}
    }
  });

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  } catch {
    // Fallback if networkidle times out
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  }

  // Extra wait for dynamic content
  if (wait > 0) await page.waitForTimeout(wait);

  // 1. Screenshot
  const screenshotPath = path.join(folder, "screenshot.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`  Screenshot → ${screenshotPath}`);

  // 2. Page text
  const pageText = await page.evaluate(() => document.body.innerText);
  const textPath = path.join(folder, "page-text.txt");
  fs.writeFileSync(textPath, pageText, "utf-8");
  console.log(`  Page text → ${textPath} (${pageText.length} chars)`);

  // 3. Page title & metadata
  const metadata = await page.evaluate(() => {
    const getMeta = (name) => {
      const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return el ? el.getAttribute("content") : null;
    };
    return {
      title: document.title,
      url: window.location.href,
      description: getMeta("description") || getMeta("og:description"),
      author: getMeta("author"),
      keywords: getMeta("keywords"),
      ogTitle: getMeta("og:title"),
      ogImage: getMeta("og:image"),
    };
  });
  const metaPath = path.join(folder, "metadata.json");
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf-8");
  console.log(`  Metadata → ${metaPath}`);

  // 4. All links
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a[href]")).map(a => ({
      text: a.innerText.trim().slice(0, 100),
      href: a.href,
    })).filter(l => l.href.startsWith("http"));
  });
  const linksPath = path.join(folder, "links.json");
  fs.writeFileSync(linksPath, JSON.stringify(links, null, 2), "utf-8");
  console.log(`  Links → ${linksPath} (${links.length} links)`);

  // 5. API/XHR responses captured
  if (apiResponses.length > 0) {
    const apiPath = path.join(folder, "api-responses.json");
    fs.writeFileSync(apiPath, JSON.stringify(apiResponses, null, 2), "utf-8");
    console.log(`  API responses → ${apiPath} (${apiResponses.length} captured)`);
  }

  // 6. Full HTML
  const html = await page.content();
  const htmlPath = path.join(folder, "page.html");
  fs.writeFileSync(htmlPath, html, "utf-8");
  console.log(`  HTML → ${htmlPath}`);

  // 7. Summary document
  const summary = `# Browser Capture: ${metadata.title}

**URL:** ${url}
**Captured:** ${new Date().toLocaleString()}
**Folder:** ${folder}

## Page Title
${metadata.title}

## Description
${metadata.description || "N/A"}

## Page Text (first 2000 chars)
${pageText.slice(0, 2000)}

## Links Found
${links.slice(0, 30).map(l => `- [${l.text || "link"}](${l.href})`).join("\n")}
${links.length > 30 ? `\n... and ${links.length - 30} more links` : ""}

## API Responses Captured
${apiResponses.length} JSON API responses intercepted.

## Files
- screenshot.png — Full page screenshot
- page-text.txt — All visible text
- metadata.json — Page title, description, OG tags
- links.json — All hyperlinks
- api-responses.json — Intercepted JSON API calls
- page.html — Full HTML source
`;
  const summaryPath = path.join(folder, "CAPTURE.md");
  fs.writeFileSync(summaryPath, summary, "utf-8");
  console.log(`  Summary → ${summaryPath}`);

  if (browser) await browser.close();
  else await context.close();
  if (tempProfileDir) {
    try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch {}
  }

  console.log(`\nCapture complete → ${folder}`);
  return { folder, metadata, linksCount: links.length, apiCount: apiResponses.length, textLength: pageText.length };
}

export { capture };

// CLI entry point — only runs when executed directly
const isMainModule = process.argv[1]?.replace(/\\/g, "/").includes("browser-capture");
if (isMainModule) {
  const args = process.argv.slice(2);
  const url = args.find(a => !a.startsWith("--"));
  const waitArg = args.find(a => a.startsWith("--wait"));
  const wait = waitArg ? parseInt(waitArg.split("=")[1] || waitArg.split(" ")[1] || "3000") : 3000;
  const headless = args.includes("--headless");

  if (!url) {
    console.log("Usage: node tools/browser-capture.js <url> [--wait=5000] [--headless]");
    console.log("Example: node tools/browser-capture.js https://finance.yahoo.com");
    process.exit(1);
  }

  capture(url, { wait, headless })
    .then(result => {
      console.log("\nDone:", JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error("Capture failed:", err.message);
      process.exit(1);
    });
}
