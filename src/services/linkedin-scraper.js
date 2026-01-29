import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";
import fetch from "node-fetch";

/**
 * LinkedIn Profile Scraper using Playwright
 * - Opens browser headful
 * - Navigates to /in/me
 * - Captures real URL after redirect
 * - Takes screenshot
 * - Extracts profile data
 * - Uses GPT-4o vision for analysis
 */

const DATA_DIR = path.join(process.cwd(), "data");
const SCREENSHOTS_DIR = path.join(process.cwd(), "screenshots");
const PROFILE_PATH = path.join(DATA_DIR, "linkedin-profile.json");
const CHROME_PROFILE_DIR = path.join(process.cwd(), "data", "chrome-profile");

const DEFAULT_CHROME_USER_DATA_DIR = "C:\\Users\\frank\\AppData\\Local\\Google\\Chrome\\User Data";

// Ensure directories exist
const ensureDirs = () => {
  [DATA_DIR, SCREENSHOTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
};

/**
 * Find Chrome on this system
 */
const findChromeChannel = () => {
  const platform = os.platform();
  if (platform === "win32") {
    // Check for Chrome
    const chromePath = path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe");
    const chromeX86 = path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe");
    if (fs.existsSync(chromePath) || fs.existsSync(chromeX86)) return "chrome";

    // Check for Edge
    const edgePath = path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe");
    if (fs.existsSync(edgePath)) return "msedge";
  }
  return "chrome"; // Default
};

/**
 * Scrape LinkedIn profile
 */
export const scrapeLinkedInProfile = async (options = {}) => {
  ensureDirs();

  const { headless = false, timeout = 180000 } = options;
  let browser = null;

  try {
    console.log("Launching browser...");

    const userDataDir =
      options.userDataDir ||
      process.env.CHROME_USER_DATA_DIR ||
      DEFAULT_CHROME_USER_DATA_DIR ||
      CHROME_PROFILE_DIR;
    const profileDirectory = options.profileDirectory || process.env.CHROME_PROFILE_DIRECTORY || "Default";

    // Launch with persistent profile to keep login
    browser = await chromium.launchPersistentContext(userDataDir, {
      headless,
      channel: findChromeChannel(),
      args: [
        `--profile-directory=${profileDirectory}`,
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-infobars"
      ],
      viewport: { width: 1280, height: 900 },
      ignoreDefaultArgs: ["--enable-automation"]
    });

    const page = browser.pages()[0] || await browser.newPage();

    // Navigate to LinkedIn
    console.log("Opening LinkedIn...");
    await page.goto("https://www.linkedin.com/feed", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check if logged in
    const url = page.url();
    if (url.includes("/login") || url.includes("/authwall") || url.includes("/checkpoint")) {
      console.log("Not logged in. Please log in to LinkedIn...");
      console.log("Waiting up to 3 minutes for login...");

      try {
        await page.waitForURL(url => !url.includes("/login") && !url.includes("/authwall"), { timeout });
      } catch {
        // Check current URL
        const currentUrl = page.url();
        if (currentUrl.includes("/login") || currentUrl.includes("/authwall")) {
          throw new Error("Login timeout. Please log in when browser opens.");
        }
      }
    }

    console.log("Logged in. Navigating to profile...");

    // Navigate to /in/me - this redirects to user's actual profile
    await page.goto("https://www.linkedin.com/in/me", { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for redirect to complete
    await page.waitForTimeout(3000);

    // Get the real profile URL
    const profileUrl = page.url();
    console.log(`Profile URL: ${profileUrl}`);

    // SCROLL DOWN to load all sections (Experience, Education, Skills)
    console.log("Scrolling to load full profile...");
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(800);
    }
    // Scroll back up slowly to trigger any lazy-loaded content
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, -1000));
      await page.waitForTimeout(500);
    }

    // Click all "See more" and "Show all" buttons to expand content
    console.log("Expanding collapsed sections...");
    const expandButtons = await page.$$('button:has-text("see more"), button:has-text("Show all"), button:has-text("more")');
    for (const btn of expandButtons.slice(0, 10)) {
      try {
        await btn.click();
        await page.waitForTimeout(500);
      } catch {}
    }

    // Scroll back to top for screenshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // IMMEDIATELY save the URL
    const partialData = {
      profileUrl,
      capturedAt: new Date().toISOString(),
      status: "capturing"
    };
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(partialData, null, 2));
    console.log("URL saved to data/linkedin-profile.json");

    // Take FULL PAGE screenshot to capture all sections
    const timestamp = Date.now();
    const screenshotPath = path.join(SCREENSHOTS_DIR, `linkedin-${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Full-page screenshot saved: ${screenshotPath}`);

    // Extract profile data from page - updated selectors for 2026 LinkedIn
    console.log("Extracting profile data...");
    const profileData = await page.evaluate(() => {
      const getText = (selectors) => {
        for (const sel of selectors) {
          try {
            const el = document.querySelector(sel);
            if (el && el.innerText.trim()) return el.innerText.trim();
          } catch {}
        }
        return null;
      };

      const getTextByContains = (tag, text) => {
        const els = document.querySelectorAll(tag);
        for (const el of els) {
          if (el.innerText && el.innerText.includes(text)) {
            return el.innerText.trim();
          }
        }
        return null;
      };

      const getAll = (selectors) => {
        const results = [];
        for (const sel of selectors) {
          try {
            const elements = Array.from(document.querySelectorAll(sel));
            elements.forEach(el => {
              const text = el.innerText?.trim();
              if (text && !results.includes(text)) results.push(text);
            });
          } catch {}
        }
        return results;
      };

      // Multiple selector strategies for robustness
      const nameSelectors = [
        "h1",
        "[data-generated-suggestion-target] h1",
        ".pv-text-details__left-panel h1",
        ".text-heading-xlarge",
        ".artdeco-entity-lockup__title"
      ];

      const headlineSelectors = [
        ".text-body-medium.break-words",
        "[data-generated-suggestion-target] .text-body-medium",
        ".pv-text-details__left-panel .text-body-medium",
        ".pv-top-card--list-bullet + div"
      ];

      const locationSelectors = [
        ".pv-text-details__left-panel .text-body-small",
        ".text-body-small.inline.t-black--light.break-words",
        "[data-generated-suggestion-target] .text-body-small",
        "span.text-body-small"
      ];

      const connectionsSelectors = [
        ".pv-top-card--list-bullet .t-bold",
        "a[href*='connections'] span.t-bold",
        ".t-bold:contains('connections')"
      ];

      const aboutSelectors = [
        "#about ~ .display-flex .inline-show-more-text",
        ".pv-shared-text-with-see-more span",
        "[data-generated-suggestion-target*='aboutSection']",
        "#about-section .pv-about__summary-text"
      ];

      // Extract page content as fallback
      const pageText = document.body?.innerText || "";
      const h1 = document.querySelector("h1")?.innerText?.trim();

      return {
        name: getText(nameSelectors) || h1,
        headline: getText(headlineSelectors),
        location: getText(locationSelectors),
        connections: getText(connectionsSelectors),
        about: getText(aboutSelectors),
        currentTitle: getText(headlineSelectors),
        experienceSection: getText(["#experience ~ .pvs-list__outer-container", "[id*='experience'] ~ div"]),
        educationSection: getText(["#education ~ .pvs-list__outer-container", "[id*='education'] ~ div"]),
        skillsSection: getAll([".pv-skill-category-entity__name-text", ".hoverable-link-text", "[data-field='skill_card_skill_topic']"]),
        // Fallback: extract first significant text from page
        fallbackName: h1,
        pageTextPreview: pageText.substring(0, 500)
      };
    });

    // Close browser
    await browser.close();
    browser = null;

    // Build final result
    const result = {
      success: true,
      profileUrl,
      screenshotPath,
      profile: {
        name: profileData.name,
        headline: profileData.headline,
        location: profileData.location,
        connections: profileData.connections,
        about: profileData.about,
        currentTitle: profileData.currentTitle
      },
      rawData: profileData,
      capturedAt: new Date().toISOString()
    };

    // Save complete data
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(result, null, 2));
    console.log("Profile data saved to data/linkedin-profile.json");

    return result;

  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    return { success: false, error: error.message };
  }
};

/**
 * Analyze screenshot with GPT-4o Vision
 */
export const analyzeWithGPT4o = async (screenshotPath) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "OPENAI_API_KEY not set" };
  }

  if (!fs.existsSync(screenshotPath)) {
    return { success: false, error: "Screenshot not found" };
  }

  try {
    const imageBase64 = fs.readFileSync(screenshotPath).toString("base64");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Extract LinkedIn profile info from this screenshot. Return ONLY valid JSON, no markdown."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract ALL visible information from this LinkedIn profile screenshot. Be thorough and extract every detail you can see.

Return ONLY valid JSON in this format:
{
  "name": "Full name visible on profile",
  "headline": "Professional headline/tagline under the name",
  "location": "City, State/Country",
  "connections": "Number of connections if visible",
  "followers": "Number of followers if visible",
  "about": "The full About/Summary section text if visible",
  "currentRole": "Current job title from Experience section",
  "currentCompany": "Current company name",
  "experience": [
    {"title": "Job Title", "company": "Company Name", "duration": "Date range", "description": "Role description if visible"}
  ],
  "education": [
    {"school": "School name", "degree": "Degree type", "field": "Field of study", "years": "Date range"}
  ],
  "skills": ["skill1", "skill2", "skill3"],
  "certifications": ["cert1", "cert2"],
  "languages": ["language1", "language2"],
  "openToWork": true/false,
  "isCreator": true/false,
  "profileStrength": "Profile strength indicator if visible",
  "summary": "A 2-3 sentence professional summary based on what you see"
}

Extract EVERYTHING visible. If a section is not visible, use null. Be thorough!`
              },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" }
              }
            ]
          }
        ],
        max_tokens: 2500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return { success: true, profile: JSON.parse(jsonMatch[0]) };
    }

    return { success: false, error: "Could not parse response" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Full extraction flow
 */
export const extractLinkedInProfile = async (options = {}) => {
  console.log("=== LinkedIn Profile Extraction ===\n");

  // Step 1: Scrape profile
  const scrapeResult = await scrapeLinkedInProfile(options);

  if (!scrapeResult.success) {
    return scrapeResult;
  }

  // Step 2: Analyze with GPT-4o if OpenAI key is set
  if (process.env.OPENAI_API_KEY && scrapeResult.screenshotPath) {
    console.log("\nAnalyzing with GPT-4o...");
    const analysis = await analyzeWithGPT4o(scrapeResult.screenshotPath);

    if (analysis.success) {
      scrapeResult.gpt4oAnalysis = analysis.profile;

      // Merge GPT-4o data with scraped data
      scrapeResult.profile = {
        ...scrapeResult.profile,
        ...analysis.profile
      };

      // Update saved file
      fs.writeFileSync(PROFILE_PATH, JSON.stringify(scrapeResult, null, 2));
      console.log("GPT-4o analysis added to profile");
    } else {
      console.log(`GPT-4o analysis failed: ${analysis.error}`);
    }
  }

  return scrapeResult;
};

/**
 * Load saved profile
 */
export const loadLinkedInProfile = () => {
  try {
    if (fs.existsSync(PROFILE_PATH)) {
      return JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
    }
  } catch {}
  return null;
};

/**
 * Save profile data
 */
export const saveLinkedInProfile = (data) => {
  ensureDirs();
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(data, null, 2));
  return { success: true, path: PROFILE_PATH };
};

/**
 * Check if profile data is incomplete (all fields null)
 */
export const isProfileIncomplete = (profile) => {
  if (!profile || !profile.success) return true;
  const p = profile.profile || {};
  return !p.name && !p.headline && !p.location && !p.about && !p.currentTitle;
};

/**
 * Refresh LinkedIn profile data by analyzing existing screenshot
 * Used when we have a screenshot but DOM extraction failed
 */
export const refreshLinkedInFromScreenshot = async () => {
  const profile = loadLinkedInProfile();

  if (!profile || !profile.screenshotPath) {
    return { success: false, error: "No screenshot available" };
  }

  if (!fs.existsSync(profile.screenshotPath)) {
    return { success: false, error: "Screenshot file not found" };
  }

  // Analyze with GPT-4o
  const analysis = await analyzeWithGPT4o(profile.screenshotPath);

  if (!analysis.success) {
    return { success: false, error: analysis.error };
  }

  // Merge analysis with existing profile
  const updatedProfile = {
    ...profile,
    profile: {
      ...profile.profile,
      ...analysis.profile
    },
    gpt4oAnalysis: analysis.profile,
    refreshedAt: new Date().toISOString()
  };

  // Save updated profile
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(updatedProfile, null, 2));

  return { success: true, profile: updatedProfile };
};

/**
 * Generate linkedin.md file from profile data using LLM
 */
export const generateLinkedInMarkdown = async (profile) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "OPENAI_API_KEY not set" };
  }

  const profileData = profile?.profile || profile?.gpt4oAnalysis || {};
  const profileUrl = profile?.profileUrl || "";

  // Build profile summary for LLM
  const profileSummary = JSON.stringify({
    url: profileUrl,
    name: profileData.name,
    headline: profileData.headline,
    location: profileData.location,
    currentRole: profileData.currentRole,
    currentCompany: profileData.currentCompany,
    about: profileData.about,
    isStudent: profileData.isStudent,
    education: profileData.education,
    skills: profileData.skills,
    summary: profileData.summary,
    capturedAt: profile?.capturedAt
  }, null, 2);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a professional profile writer. Convert the provided LinkedIn profile data into a clean, well-formatted Markdown document. Include all available information organized into clear sections.`
          },
          {
            role: "user",
            content: `Convert this LinkedIn profile data into a professional Markdown document:

${profileSummary}

Create a clean markdown document with these sections (only include sections with data):
- Header with name and headline
- Profile URL
- Location
- Current Position
- About/Summary
- Education
- Skills
- Last Updated timestamp

Use proper markdown formatting with headers, bullet points, and emphasis where appropriate. Make it readable and professional.`
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    const markdown = data.choices?.[0]?.message?.content || "";

    // Save to linkedin.md
    const mdPath = path.join(DATA_DIR, "linkedin.md");
    fs.writeFileSync(mdPath, markdown, "utf-8");

    return { success: true, path: mdPath, content: markdown };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Full LinkedIn refresh and markdown generation
 * Called on app load if LinkedIn is connected but data is incomplete
 */
export const refreshAndGenerateLinkedInMarkdown = async () => {
  console.log("Checking LinkedIn profile data...");

  const profile = loadLinkedInProfile();

  // Check if we need to refresh
  if (!profile || !profile.success) {
    return { success: false, error: "No LinkedIn profile saved" };
  }

  let currentProfile = profile;

  // If profile data is incomplete, try to refresh from screenshot
  if (isProfileIncomplete(profile)) {
    console.log("Profile data incomplete, analyzing screenshot...");
    const refreshResult = await refreshLinkedInFromScreenshot();
    if (refreshResult.success) {
      currentProfile = refreshResult.profile;
      console.log("Profile data refreshed from screenshot");
    } else {
      console.log(`Screenshot analysis failed: ${refreshResult.error}`);
    }
  }

  // Generate markdown if we have any profile data
  const hasData = currentProfile?.profile?.name ||
                  currentProfile?.gpt4oAnalysis?.name ||
                  currentProfile?.profileUrl;

  if (hasData) {
    console.log("Generating linkedin.md...");
    const mdResult = await generateLinkedInMarkdown(currentProfile);
    if (mdResult.success) {
      console.log(`LinkedIn markdown saved to ${mdResult.path}`);
      return { success: true, profile: currentProfile, markdownPath: mdResult.path };
    } else {
      console.log(`Markdown generation failed: ${mdResult.error}`);
      return { success: false, error: mdResult.error, profile: currentProfile };
    }
  }

  return { success: false, error: "No profile data available", profile: currentProfile };
};

/**
 * Scrape recent LinkedIn posts from a profile
 * Navigates to the activity page and extracts post data
 */
export const scrapeLinkedInPosts = async (profileUrl, options = {}) => {
  ensureDirs();

  const { headless = true, maxPosts = 20, timeout = 120000 } = options;
  let browser = null;

  try {
    const userDataDir = options.userDataDir || process.env.CHROME_USER_DATA_DIR || DEFAULT_CHROME_USER_DATA_DIR;
    const profileDirectory = options.profileDirectory || process.env.CHROME_PROFILE_DIRECTORY || "Default";

    browser = await chromium.launchPersistentContext(userDataDir, {
      headless,
      channel: findChromeChannel(),
      args: [
        `--profile-directory=${profileDirectory}`,
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-infobars"
      ],
      viewport: { width: 1280, height: 900 },
      ignoreDefaultArgs: ["--enable-automation"]
    });

    const page = browser.pages()[0] || await browser.newPage();

    // Navigate to activity page
    const activityUrl = profileUrl.replace(/\/$/, "") + "/recent-activity/all/";
    console.log(`[LinkedIn] Navigating to ${activityUrl}`);
    await page.goto(activityUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    // Check if logged in
    const url = page.url();
    if (url.includes("/login") || url.includes("/authwall")) {
      await browser.close();
      return { success: false, error: "Not logged in to LinkedIn" };
    }

    // Scroll to load more posts
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }

    // Extract posts from page
    const posts = await page.evaluate((max) => {
      const postElements = document.querySelectorAll(".feed-shared-update-v2, .occludable-update");
      const results = [];

      for (const el of postElements) {
        if (results.length >= max) break;

        const textEl = el.querySelector(".feed-shared-text, .break-words, .feed-shared-update-v2__description");
        const content = textEl?.innerText?.trim() || "";

        // Detect repost
        const headerText = el.querySelector(".feed-shared-actor__sub-description, .update-components-header")?.innerText || "";
        const isRepost = headerText.toLowerCase().includes("repost") ||
                         headerText.toLowerCase().includes("shared") ||
                         !!el.querySelector(".feed-shared-reshared-update");
        const type = isRepost ? "repost" : "original";

        // Date
        const timeEl = el.querySelector("time, .feed-shared-actor__sub-description time, span.visually-hidden");
        const date = timeEl?.getAttribute("datetime") || timeEl?.innerText?.trim() || null;

        // Engagement
        const likesEl = el.querySelector(".social-details-social-counts__reactions-count, .social-details-social-counts__social-proof-text");
        const commentsEl = el.querySelector("button[aria-label*='comment'] span, .social-details-social-counts__comments");
        const likes = parseInt(likesEl?.innerText?.replace(/[^0-9]/g, "") || "0", 10);
        const comments = parseInt(commentsEl?.innerText?.replace(/[^0-9]/g, "") || "0", 10);

        // Post URL
        const linkEl = el.querySelector("a[href*='/feed/update/']");
        const postUrl = linkEl?.href || null;

        if (content || postUrl) {
          results.push({ content: content.substring(0, 500), type, date, likes, comments, url: postUrl });
        }
      }
      return results;
    }, maxPosts);

    await browser.close();
    browser = null;

    const originalCount = posts.filter(p => p.type === "original").length;
    const repostCount = posts.filter(p => p.type === "repost").length;

    console.log(`[LinkedIn] Scraped ${posts.length} posts (${originalCount} original, ${repostCount} reposts)`);

    return { success: true, posts, originalCount, repostCount, scrapedAt: new Date().toISOString() };
  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    return { success: false, error: error.message, posts: [] };
  }
};
