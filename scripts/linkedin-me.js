import fs from "node:fs";
import path from "node:path";
import fetch from "node-fetch";
import { chromium } from "playwright";
import * as cheerio from "cheerio";

const OUTPUT_DIR = path.join(process.cwd(), "data");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "linkedin-me.json");

const ensureOutputDir = () => {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = () => {
  const args = process.argv.slice(2);
  const modelIndex = args.findIndex((arg) => arg === "--model");
  if (modelIndex >= 0 && args[modelIndex + 1]) {
    return { model: args[modelIndex + 1] };
  }
  return { model: null };
};

const normalizeText = (text) => text.replace(/\s+/g, " ").trim();

const truncate = (text, limit) => {
  if (!text) {
    return "";
  }
  return text.length > limit ? text.slice(0, limit) : text;
};

const extractMeta = (html) => {
  const $ = cheerio.load(html);
  const meta = (property) => $("meta[property=\"" + property + "\"]").attr("content") || null;
  const name = $("title").text().trim() || null;

  return {
    title: meta("og:title") || name,
    description: meta("og:description"),
    image: meta("og:image"),
    canonical: $("link[rel=canonical]").attr("href") || null,
    name
  };
};

const extractTextSnapshot = (html, limit) => {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const text = normalizeText($("body").text());
  return truncate(text, limit);
};

const analyzeScreenshot = async ({ model, imagePath, finalUrl }) => {
  if (!model) {
    return { status: "skipped", reason: "model-not-set" };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const imageBase64 = fs.readFileSync(imagePath, "base64");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Extract profile details from the LinkedIn screenshot. Reply only in JSON with keys: name, headline, location, company, education, followers, summary, notes."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this LinkedIn profile screenshot. URL: ${finalUrl}`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${imageBase64}`
              }
            }
          ]
        }
      ]
    })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(bodyText || `OpenAI request failed: ${response.status}`);
  }

  const data = JSON.parse(bodyText);
  const content = data?.choices?.[0]?.message?.content || null;
  let parsed = null;
  if (content) {
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      parsed = null;
    }
  }

  return {
    model,
    raw: content,
    parsed
  };
};

const analyzeHtml = async ({ model, textSnapshot, finalUrl }) => {
  if (!model) {
    return { status: "skipped", reason: "model-not-set" };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Extract a structured LinkedIn profile summary from the provided page text. Reply only in JSON with keys: name, headline, location, currentRole, company, about, experience, education, skills, links, notes."
        },
        {
          role: "user",
          content: `Profile URL: ${finalUrl}\n\nPAGE_TEXT:\n${textSnapshot}`
        }
      ]
    })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(bodyText || `OpenAI request failed: ${response.status}`);
  }

  const data = JSON.parse(bodyText);
  const content = data?.choices?.[0]?.message?.content || null;
  let parsed = null;
  if (content) {
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      parsed = null;
    }
  }

  return {
    model,
    raw: content,
    parsed
  };
};

const run = async () => {
  const { model: cliModel } = parseArgs();
  const model = cliModel || process.env.LINKEDIN_IMAGE_MODEL || null;
  const userDataDir =
    process.env.CHROME_USER_DATA_DIR ||
    "C:\\Users\\frank\\AppData\\Local\\Google\\Chrome\\User Data";
  const profileDirectory = process.env.CHROME_PROFILE_DIRECTORY || "Default";
  const waitMs = Number.parseInt(process.env.LINKEDIN_ME_WAIT_MS || "5000", 10);

  ensureOutputDir();

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: "chrome",
    args: [`--profile-directory=${profileDirectory}`]
  });

  const page = await context.newPage();
  await page.goto("https://www.linkedin.com/in/me", { waitUntil: "domcontentloaded" });

  await wait(waitMs);
  const finalUrl = page.url();
  const html = await page.content();

  const screenshotPath = path.join(OUTPUT_DIR, "linkedin-me.png");
  const htmlPath = path.join(OUTPUT_DIR, "linkedin-me.html");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  fs.writeFileSync(htmlPath, html, "utf-8");

  await context.close();

  const meta = extractMeta(html);
  const textSnapshot = extractTextSnapshot(html, 6000);
  const vision = await analyzeScreenshot({ model, imagePath: screenshotPath, finalUrl });
  const htmlSummary = await analyzeHtml({ model, textSnapshot, finalUrl });

  const payload = {
    finalUrl,
    capturedAt: new Date().toISOString(),
    htmlPath,
    screenshotPath,
    meta,
    textSnapshot,
    vision,
    htmlSummary
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");

  console.log(`Captured LinkedIn URL: ${finalUrl}`);
  console.log(`Saved data to ${OUTPUT_PATH}`);
};

run().catch((error) => {
  console.error("LinkedIn capture failed:", error.message);
  process.exit(1);
});
