/**
 * Playwright Computer Use Service
 *
 * Provides advanced browser automation capabilities for autonomous tasks:
 * - Screenshot-based computer vision
 * - Click, type, scroll interactions
 * - Form filling and submission
 * - Page navigation and waiting
 * - Multi-tab and window management
 * - Cookie and session management
 *
 * This service enables AI-driven browser automation for tasks like:
 * - Filling out job applications
 * - Checking account balances
 * - Booking appointments
 * - Web research and data extraction
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");
const SESSION_DIR = path.join(DATA_DIR, "browser-sessions");

// Lazy load playwright
let playwright = null;
let chromium = null;

const getPlaywright = async () => {
  if (playwright === null) {
    try {
      const module = await import("playwright");
      playwright = module;
      chromium = module.chromium;
    } catch (err) {
      console.log("[Playwright] Not installed. Run: npm install playwright");
      playwright = false;
    }
  }
  return playwright;
};

/**
 * Ensure directories exist
 */
const ensureDirs = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
};

/**
 * Playwright Computer Use Service
 */
export class PlaywrightService extends EventEmitter {
  constructor() {
    super();
    this.browser = null;
    this.context = null;
    this.page = null;
    this.sessionName = null;
    this.isHeadless = false; // Show browser by default for computer use
    this.viewport = { width: 1280, height: 720 };
    this.lastScreenshot = null;
  }

  /**
   * Initialize the browser
   */
  async initialize(options = {}) {
    const pw = await getPlaywright();
    if (!pw) {
      return { success: false, error: "Playwright not installed" };
    }

    ensureDirs();

    try {
      // Launch browser
      this.browser = await chromium.launch({
        headless: options.headless ?? this.isHeadless,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu"
        ]
      });

      // Create browser context with session persistence
      const contextOptions = {
        viewport: options.viewport || this.viewport,
        userAgent: options.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
      };

      // Load session if exists
      if (options.sessionName) {
        this.sessionName = options.sessionName;
        const sessionPath = path.join(SESSION_DIR, `${options.sessionName}.json`);

        if (fs.existsSync(sessionPath)) {
          const sessionData = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
          contextOptions.storageState = sessionData;
        }
      }

      this.context = await this.browser.newContext(contextOptions);
      this.page = await this.context.newPage();

      // Set up event listeners
      this.page.on("console", msg => {
        this.emit("console", { type: msg.type(), text: msg.text() });
      });

      this.page.on("pageerror", error => {
        this.emit("error", { type: "page", message: error.message });
      });

      this.emit("initialized");
      return { success: true };
    } catch (error) {
      console.error("[Playwright] Initialize failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if browser is ready
   */
  isReady() {
    return this.browser !== null && this.page !== null;
  }

  /**
   * Navigate to a URL
   */
  async navigate(url, options = {}) {
    if (!this.isReady()) {
      const init = await this.initialize();
      if (!init.success) return init;
    }

    try {
      const response = await this.page.goto(url, {
        waitUntil: options.waitUntil || "domcontentloaded",
        timeout: options.timeout || 30000
      });

      // Take screenshot after navigation
      const screenshot = await this.takeScreenshot();

      this.emit("navigated", { url, status: response?.status() });

      return {
        success: true,
        url: this.page.url(),
        title: await this.page.title(),
        status: response?.status(),
        screenshot: screenshot.path
      };
    } catch (error) {
      console.error("[Playwright] Navigate failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Take a screenshot of the current page
   */
  async takeScreenshot(options = {}) {
    if (!this.isReady()) {
      return { success: false, error: "Browser not initialized" };
    }

    ensureDirs();

    const filename = options.filename || `screenshot-${Date.now()}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);

    try {
      await this.page.screenshot({
        path: filepath,
        fullPage: options.fullPage || false
      });

      this.lastScreenshot = filepath;
      this.emit("screenshot", { path: filepath });

      return {
        success: true,
        path: filepath,
        filename
      };
    } catch (error) {
      console.error("[Playwright] Screenshot failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Click at coordinates or on an element
   */
  async click(target, options = {}) {
    if (!this.isReady()) {
      return { success: false, error: "Browser not initialized" };
    }

    try {
      if (typeof target === "object" && target.x !== undefined && target.y !== undefined) {
        // Click at coordinates
        await this.page.mouse.click(target.x, target.y, {
          button: options.button || "left",
          clickCount: options.clickCount || 1
        });
      } else {
        // Click on selector
        await this.page.click(target, {
          button: options.button || "left",
          clickCount: options.clickCount || 1,
          timeout: options.timeout || 5000
        });
      }

      // Small delay after click
      await this.page.waitForTimeout(500);

      // Take screenshot after click
      const screenshot = await this.takeScreenshot();

      this.emit("clicked", { target });

      return {
        success: true,
        target,
        screenshot: screenshot.path
      };
    } catch (error) {
      console.error("[Playwright] Click failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Type text into the focused element or a selector
   */
  async type(text, options = {}) {
    if (!this.isReady()) {
      return { success: false, error: "Browser not initialized" };
    }

    try {
      if (options.selector) {
        await this.page.fill(options.selector, text);
      } else {
        // Type into currently focused element
        await this.page.keyboard.type(text, {
          delay: options.delay || 50
        });
      }

      this.emit("typed", { text: text.substring(0, 20) + "..." });

      return { success: true };
    } catch (error) {
      console.error("[Playwright] Type failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Press a key or key combination
   */
  async pressKey(key, options = {}) {
    if (!this.isReady()) {
      return { success: false, error: "Browser not initialized" };
    }

    try {
      await this.page.keyboard.press(key);

      if (options.takeScreenshot !== false) {
        await this.page.waitForTimeout(300);
        await this.takeScreenshot();
      }

      this.emit("keyPressed", { key });

      return { success: true };
    } catch (error) {
      console.error("[Playwright] Key press failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Scroll the page
   */
  async scroll(direction = "down", amount = 500) {
    if (!this.isReady()) {
      return { success: false, error: "Browser not initialized" };
    }

    try {
      const delta = direction === "down" ? amount : -amount;
      await this.page.mouse.wheel(0, delta);

      // Wait for scroll to complete
      await this.page.waitForTimeout(300);

      // Take screenshot
      const screenshot = await this.takeScreenshot();

      this.emit("scrolled", { direction, amount });

      return {
        success: true,
        screenshot: screenshot.path
      };
    } catch (error) {
      console.error("[Playwright] Scroll failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fill a form with multiple fields
   */
  async fillForm(fields, options = {}) {
    if (!this.isReady()) {
      return { success: false, error: "Browser not initialized" };
    }

    const results = [];

    try {
      for (const [selector, value] of Object.entries(fields)) {
        try {
          await this.page.waitForSelector(selector, { timeout: 3000 });
          await this.page.fill(selector, value);
          results.push({ selector, success: true });
        } catch (err) {
          results.push({ selector, success: false, error: err.message });
        }
      }

      // Submit if selector provided
      if (options.submitSelector) {
        await this.page.click(options.submitSelector);
        await this.page.waitForTimeout(1000);
      }

      // Take screenshot
      const screenshot = await this.takeScreenshot();

      this.emit("formFilled", { fields: Object.keys(fields).length });

      return {
        success: true,
        results,
        screenshot: screenshot.path
      };
    } catch (error) {
      console.error("[Playwright] Fill form failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for a selector to appear
   */
  async waitForSelector(selector, options = {}) {
    if (!this.isReady()) {
      return { success: false, error: "Browser not initialized" };
    }

    try {
      await this.page.waitForSelector(selector, {
        timeout: options.timeout || 10000,
        state: options.state || "visible"
      });

      return { success: true };
    } catch (error) {
      console.error("[Playwright] Wait for selector failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(options = {}) {
    if (!this.isReady()) {
      return { success: false, error: "Browser not initialized" };
    }

    try {
      await this.page.waitForNavigation({
        waitUntil: options.waitUntil || "domcontentloaded",
        timeout: options.timeout || 30000
      });

      return {
        success: true,
        url: this.page.url()
      };
    } catch (error) {
      console.error("[Playwright] Wait for navigation failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get page content/text
   */
  async getContent(options = {}) {
    if (!this.isReady()) {
      return { success: false, error: "Browser not initialized" };
    }

    try {
      let content;

      if (options.selector) {
        const elements = await this.page.$$(options.selector);
        content = await Promise.all(
          elements.map(el => el.textContent())
        );
      } else {
        content = await this.page.evaluate(() => document.body.innerText);
      }

      const title = await this.page.title();
      const url = this.page.url();

      return {
        success: true,
        title,
        url,
        content: Array.isArray(content) ? content : content.substring(0, 10000)
      };
    } catch (error) {
      console.error("[Playwright] Get content failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all visible elements on the page
   */
  async getVisibleElements(options = {}) {
    if (!this.isReady()) {
      return { success: false, error: "Browser not initialized" };
    }

    try {
      const elements = await this.page.evaluate(() => {
        const visibleElements = [];
        const allElements = document.querySelectorAll("a, button, input, select, textarea, [role='button'], [onclick]");

        allElements.forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
            visibleElements.push({
              index,
              tag: el.tagName.toLowerCase(),
              type: el.type || null,
              text: (el.textContent || el.value || el.placeholder || "").trim().substring(0, 50),
              id: el.id || null,
              name: el.name || null,
              href: el.href || null,
              x: Math.round(rect.x + rect.width / 2),
              y: Math.round(rect.y + rect.height / 2)
            });
          }
        });

        return visibleElements.slice(0, 50);
      });

      return {
        success: true,
        elements,
        count: elements.length
      };
    } catch (error) {
      console.error("[Playwright] Get visible elements failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save current session (cookies, localStorage)
   */
  async saveSession(sessionName = this.sessionName) {
    if (!this.isReady() || !this.context) {
      return { success: false, error: "Browser not initialized" };
    }

    if (!sessionName) {
      sessionName = `session-${Date.now()}`;
    }

    ensureDirs();

    try {
      const sessionPath = path.join(SESSION_DIR, `${sessionName}.json`);
      const storageState = await this.context.storageState();

      fs.writeFileSync(sessionPath, JSON.stringify(storageState, null, 2));
      this.sessionName = sessionName;

      return {
        success: true,
        sessionName,
        path: sessionPath
      };
    } catch (error) {
      console.error("[Playwright] Save session failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute JavaScript in the page context
   */
  async evaluate(script) {
    if (!this.isReady()) {
      return { success: false, error: "Browser not initialized" };
    }

    try {
      const result = await this.page.evaluate(script);
      return { success: true, result };
    } catch (error) {
      console.error("[Playwright] Evaluate failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Close browser
   */
  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.context = null;
        this.page = null;
      }

      this.emit("closed");
      return { success: true };
    } catch (error) {
      console.error("[Playwright] Close failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get service status
   */
  async getStatus() {
    const pw = await getPlaywright();

    ensureDirs();

    let screenshotCount = 0;
    try {
      const files = fs.readdirSync(SCREENSHOTS_DIR);
      screenshotCount = files.filter(f => f.endsWith(".png")).length;
    } catch (err) {
      // Ignore
    }

    let sessionCount = 0;
    try {
      const files = fs.readdirSync(SESSION_DIR);
      sessionCount = files.filter(f => f.endsWith(".json")).length;
    } catch (err) {
      // Ignore
    }

    return {
      playwrightAvailable: !!pw,
      browserRunning: this.isReady(),
      currentUrl: this.page?.url() || null,
      sessionName: this.sessionName,
      screenshotCount,
      sessionCount,
      lastScreenshot: this.lastScreenshot,
      capabilities: {
        navigate: !!pw,
        screenshot: !!pw,
        click: !!pw,
        type: !!pw,
        scroll: !!pw,
        fillForm: !!pw,
        getContent: !!pw,
        saveSession: !!pw
      }
    };
  }
}

// Singleton instance
let serviceInstance = null;

export const getPlaywrightService = () => {
  if (!serviceInstance) {
    serviceInstance = new PlaywrightService();
  }
  return serviceInstance;
};

// Helper functions for common tasks
export const navigateTo = async (url) => {
  const service = getPlaywrightService();
  return await service.navigate(url);
};

export const clickElement = async (target) => {
  const service = getPlaywrightService();
  return await service.click(target);
};

export const typeText = async (text, selector) => {
  const service = getPlaywrightService();
  return await service.type(text, { selector });
};

export const getScreenshot = async () => {
  const service = getPlaywrightService();
  return await service.takeScreenshot();
};

export const getPageContent = async () => {
  const service = getPlaywrightService();
  return await service.getContent();
};

export default PlaywrightService;
