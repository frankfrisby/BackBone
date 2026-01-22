/**
 * Browser Service
 *
 * Provides browser access and automation capabilities for BACKBONE:
 * - Open URLs in default browser
 * - Web scraping with puppeteer
 * - Screenshot capture
 * - Form automation
 * - Content extraction
 */

import { exec, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

const DATA_DIR = path.join(process.cwd(), "data");
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");
const CACHE_DIR = path.join(DATA_DIR, "browser-cache");

// Lazy load puppeteer
let puppeteer = null;
const getPuppeteer = async () => {
  if (puppeteer === null) {
    try {
      const module = await import("puppeteer");
      puppeteer = module.default || module;
    } catch (err) {
      console.log("[Browser] puppeteer not installed. Run: npm install puppeteer");
      puppeteer = false;
    }
  }
  return puppeteer;
};

/**
 * Ensure directories exist
 */
const ensureDirs = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
};

/**
 * Open URL in default system browser
 */
export const openInBrowser = async (url) => {
  if (!url) {
    return { success: false, error: "URL is required" };
  }

  // Ensure URL has protocol
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  try {
    let command;
    switch (process.platform) {
      case "darwin":
        command = `open "${url}"`;
        break;
      case "win32":
        command = `start "" "${url}"`;
        break;
      default:
        command = `xdg-open "${url}"`;
    }

    await execAsync(command);
    console.log(`[Browser] Opened: ${url}`);
    return { success: true, url };
  } catch (error) {
    console.error("[Browser] Failed to open URL:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Open multiple URLs in browser tabs
 */
export const openMultipleUrls = async (urls) => {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { success: false, error: "URLs array is required" };
  }

  const results = [];
  for (const url of urls) {
    const result = await openInBrowser(url);
    results.push(result);
    // Small delay between tabs
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return {
    success: results.every(r => r.success),
    results
  };
};

/**
 * Fetch URL content (simple HTTP fetch)
 */
export const fetchUrl = async (url, options = {}) => {
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || {
        "User-Agent": "BACKBONE/1.0 (AI Life Operating System)"
      },
      ...options
    });

    const contentType = response.headers.get("content-type") || "";
    let data;

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      success: true,
      status: response.status,
      contentType,
      data
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Take screenshot of a URL using puppeteer
 */
export const takeScreenshot = async (url, options = {}) => {
  const pptr = await getPuppeteer();
  if (!pptr) {
    return { success: false, error: "puppeteer not installed. Run: npm install puppeteer" };
  }

  ensureDirs();

  const filename = options.filename || `screenshot-${Date.now()}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);

  let browser;
  try {
    browser = await pptr.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({
      width: options.width || 1280,
      height: options.height || 800
    });

    // Navigate to URL
    await page.goto(url, {
      waitUntil: options.waitUntil || "networkidle2",
      timeout: options.timeout || 30000
    });

    // Wait for selector if specified
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
    }

    // Take screenshot
    await page.screenshot({
      path: filepath,
      fullPage: options.fullPage || false
    });

    await browser.close();

    console.log(`[Browser] Screenshot saved: ${filename}`);
    return {
      success: true,
      path: filepath,
      filename
    };
  } catch (error) {
    if (browser) await browser.close();
    console.error("[Browser] Screenshot failed:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Extract text content from URL using puppeteer
 */
export const extractContent = async (url, options = {}) => {
  const pptr = await getPuppeteer();
  if (!pptr) {
    return { success: false, error: "puppeteer not installed. Run: npm install puppeteer" };
  }

  let browser;
  try {
    browser = await pptr.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.goto(url, {
      waitUntil: options.waitUntil || "domcontentloaded",
      timeout: options.timeout || 30000
    });

    // Extract content based on selector or all text
    let content;
    if (options.selector) {
      content = await page.$$eval(options.selector, elements =>
        elements.map(el => el.textContent?.trim()).filter(Boolean)
      );
    } else {
      content = await page.evaluate(() => {
        // Remove scripts and styles
        const scripts = document.querySelectorAll("script, style, noscript");
        scripts.forEach(el => el.remove());

        // Get visible text content
        return document.body?.innerText || "";
      });
    }

    // Get page title and meta description
    const title = await page.title();
    const description = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="description"]');
      return meta?.getAttribute("content") || "";
    });

    // Get all links
    const links = await page.$$eval("a[href]", anchors =>
      anchors.map(a => ({
        text: a.textContent?.trim().substring(0, 100),
        href: a.href
      })).filter(l => l.href && l.text)
    );

    await browser.close();

    return {
      success: true,
      title,
      description,
      content: Array.isArray(content) ? content : content.substring(0, 10000),
      links: links.slice(0, 50),
      url
    };
  } catch (error) {
    if (browser) await browser.close();
    console.error("[Browser] Content extraction failed:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Fill and submit a form on a webpage
 */
export const fillForm = async (url, formData, options = {}) => {
  const pptr = await getPuppeteer();
  if (!pptr) {
    return { success: false, error: "puppeteer not installed. Run: npm install puppeteer" };
  }

  let browser;
  try {
    browser = await pptr.launch({
      headless: options.headless !== false ? "new" : false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000
    });

    // Fill form fields
    for (const [selector, value] of Object.entries(formData)) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.type(selector, value);
      } catch (err) {
        console.warn(`[Browser] Could not fill field ${selector}:`, err.message);
      }
    }

    // Click submit if specified
    if (options.submitSelector) {
      await page.click(options.submitSelector);
      // Wait for navigation or timeout
      await Promise.race([
        page.waitForNavigation({ timeout: 10000 }),
        new Promise(resolve => setTimeout(resolve, 5000))
      ]);
    }

    // Get current URL after form submission
    const currentUrl = page.url();

    await browser.close();

    return {
      success: true,
      submittedUrl: url,
      resultUrl: currentUrl
    };
  } catch (error) {
    if (browser) await browser.close();
    console.error("[Browser] Form fill failed:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Monitor a URL for changes
 */
export const monitorUrl = async (url, selector, callback, interval = 60000) => {
  const pptr = await getPuppeteer();
  if (!pptr) {
    return { success: false, error: "puppeteer not installed" };
  }

  let lastContent = null;
  let isRunning = true;

  const check = async () => {
    try {
      const result = await extractContent(url, { selector });
      const currentContent = JSON.stringify(result.content);

      if (lastContent !== null && lastContent !== currentContent) {
        callback?.({
          type: "change",
          url,
          previous: lastContent,
          current: currentContent,
          timestamp: new Date().toISOString()
        });
      }

      lastContent = currentContent;
    } catch (error) {
      callback?.({
        type: "error",
        url,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    if (isRunning) {
      setTimeout(check, interval);
    }
  };

  // Start monitoring
  check();

  // Return control object
  return {
    success: true,
    stop: () => { isRunning = false; },
    isRunning: () => isRunning
  };
};

/**
 * Search Google and return results
 */
export const searchGoogle = async (query, numResults = 10) => {
  const pptr = await getPuppeteer();
  if (!pptr) {
    // Fallback to simple HTTP fetch with DuckDuckGo API
    try {
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`
      );
      const data = await response.json();

      return {
        success: true,
        query,
        results: data.RelatedTopics?.slice(0, numResults).map(topic => ({
          title: topic.Text?.split(" - ")[0] || topic.Text,
          snippet: topic.Text,
          url: topic.FirstURL
        })) || []
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  let browser;
  try {
    browser = await pptr.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    // Set user agent to avoid detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Navigate to Google search
    await page.goto(
      `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${numResults}`,
      { waitUntil: "networkidle2", timeout: 30000 }
    );

    // Extract search results
    const results = await page.evaluate(() => {
      const items = [];
      const searchResults = document.querySelectorAll("div.g");

      searchResults.forEach(result => {
        const titleEl = result.querySelector("h3");
        const linkEl = result.querySelector("a");
        const snippetEl = result.querySelector("div[data-sncf], div.VwiC3b");

        if (titleEl && linkEl) {
          items.push({
            title: titleEl.textContent,
            url: linkEl.href,
            snippet: snippetEl?.textContent || ""
          });
        }
      });

      return items;
    });

    await browser.close();

    return {
      success: true,
      query,
      results: results.slice(0, numResults)
    };
  } catch (error) {
    if (browser) await browser.close();
    console.error("[Browser] Search failed:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get browser status
 */
export const getBrowserStatus = async () => {
  const pptr = await getPuppeteer();

  ensureDirs();

  // Count screenshots
  let screenshotCount = 0;
  try {
    const files = fs.readdirSync(SCREENSHOTS_DIR);
    screenshotCount = files.filter(f => f.endsWith(".png") || f.endsWith(".jpg")).length;
  } catch (err) {
    // Ignore
  }

  return {
    puppeteerAvailable: !!pptr,
    screenshotsDir: SCREENSHOTS_DIR,
    screenshotCount,
    capabilities: {
      openUrl: true,
      screenshot: !!pptr,
      contentExtraction: !!pptr,
      formFill: !!pptr,
      urlMonitoring: !!pptr,
      search: true
    }
  };
};

/**
 * Quick actions for common browsing tasks
 */
export const QUICK_ACTIONS = {
  // Finance
  openYahooFinance: (symbol) => openInBrowser(`https://finance.yahoo.com/quote/${symbol}`),
  openAlpaca: () => openInBrowser("https://app.alpaca.markets"),
  openTradingView: (symbol) => openInBrowser(`https://www.tradingview.com/chart/?symbol=${symbol}`),
  openGoogleFinance: (symbol) => openInBrowser(`https://www.google.com/finance/quote/${symbol}:NASDAQ`),

  // Productivity
  openGmail: () => openInBrowser("https://mail.google.com"),
  openCalendar: () => openInBrowser("https://calendar.google.com"),
  openNotion: () => openInBrowser("https://www.notion.so"),
  openGitHub: () => openInBrowser("https://github.com"),

  // Social
  openLinkedIn: () => openInBrowser("https://www.linkedin.com"),
  openTwitter: () => openInBrowser("https://twitter.com"),

  // Search
  googleSearch: (query) => openInBrowser(`https://www.google.com/search?q=${encodeURIComponent(query)}`),

  // News
  openBloomberg: () => openInBrowser("https://www.bloomberg.com"),
  openCNBC: () => openInBrowser("https://www.cnbc.com"),
  openWSJ: () => openInBrowser("https://www.wsj.com")
};

export default {
  openInBrowser,
  openMultipleUrls,
  fetchUrl,
  takeScreenshot,
  extractContent,
  fillForm,
  monitorUrl,
  searchGoogle,
  getBrowserStatus,
  QUICK_ACTIONS
};
