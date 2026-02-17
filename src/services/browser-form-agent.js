/**
 * browser-form-agent.js — Generic visual browser automation for forms, logins, and popups.
 *
 * Works with any Playwright page. Provides:
 *   - evaluatePage(page, label, screenshotsDir)  — screenshot + DOM state analysis
 *   - dismissOnePopup(page)                      — click one popup element, return what was clicked
 *   - clearAllPopups(page, screenshotsDir)        — repeatedly dismiss until clear
 *   - fillForm(page, fields)                      — fill visible form inputs by type/name/label
 *   - waitUntilClear(page, screenshotsDir, opts)  — wait until no popups block the page
 *   - loginFlow(page, opts)                       — full visual login loop (popups → creds → 2FA wait → dashboard)
 *   - scrollAndCapture(page, opts)                 — scroll down page in steps, screenshot + capture text at each
 *   - visitPages(page, pages, opts)                — navigate to multiple URLs, scroll+capture+scrape each one
 */

import fs from "node:fs";
import path from "node:path";

const TAG = "[FormAgent]";

// ─── Page Evaluation ──────────────────────────────────────────────

/**
 * Take a screenshot and evaluate the current page state.
 * Returns booleans for what's visible: popups, email/password fields, dollar amounts, etc.
 */
export async function evaluatePage(page, label = "eval", screenshotsDir = null) {
  let shotPath = null;
  if (screenshotsDir) {
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
    shotPath = path.join(screenshotsDir, `form-${label}-${Date.now()}.png`);
    await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {});
  }

  const state = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const url = window.location.href;
    const inputs = document.querySelectorAll("input:not([type=hidden])");
    const visibleInputs = [...inputs].filter(i => i.offsetParent !== null);
    const buttons = document.querySelectorAll("button, input[type=submit], a[role=button]");
    const visibleButtons = [...buttons].filter(b => b.offsetParent !== null);

    // Popup detection — require strong evidence (visible modal with z-index or role=dialog)
    const hasPopup = (() => {
      // role="dialog" that is visible
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog && dialog.offsetParent !== null && dialog.offsetWidth > 50) return true;

      // Fixed/absolute elements with high z-index covering significant screen area
      for (const el of document.querySelectorAll("div, section, aside")) {
        const s = getComputedStyle(el);
        const z = parseInt(s.zIndex) || 0;
        if ((s.position === "fixed" || s.position === "absolute") && z > 100 &&
            el.offsetWidth > window.innerWidth * 0.3 && el.offsetHeight > window.innerHeight * 0.3) {
          // Exclude navbars, headers, footers (thin or at top/bottom)
          const rect = el.getBoundingClientRect();
          if (rect.height < 100) continue; // thin bar, not a popup
          return true;
        }
      }

      // Visible modal/dialog with a close or dismiss button inside it
      for (const container of document.querySelectorAll('[class*="modal"], [class*="dialog"], [class*="popup"]')) {
        if (container.offsetParent === null || container.offsetWidth < 100) continue;
        const s = getComputedStyle(container);
        const z = parseInt(s.zIndex) || 0;
        if (z > 50 || s.position === "fixed" || s.position === "absolute") {
          // Check it has interactive content (not just a CSS class name false match)
          const hasCloseBtn = container.querySelector('button, [data-dismiss], [data-close], a[role="button"]');
          if (hasCloseBtn) return true;
        }
      }

      return false;
    })();

    const hasEmailField = visibleInputs.some(i =>
      i.type === "email" || i.name?.includes("email") || i.name?.includes("user") ||
      i.placeholder?.toLowerCase().includes("email") || i.placeholder?.toLowerCase().includes("user") ||
      i.id?.includes("email") || i.id?.includes("user")
    );
    const hasPasswordField = visibleInputs.some(i => i.type === "password");
    const hasDollarAmounts = /\$[\d,]{3,}/.test(text);
    const isLogin = url.includes("/login") || url.includes("/signin") || url.includes("/auth");
    const isDashboard = url.includes("/dashboard") || url.includes("/home") || url.includes("/account");
    const is2FA = url.includes("challenge") || url.includes("mfa") || url.includes("verify") ||
      text.toLowerCase().includes("verification code") || text.toLowerCase().includes("two-factor") ||
      text.toLowerCase().includes("security code");

    const buttonLabels = visibleButtons.slice(0, 10).map(b => b.textContent?.trim().slice(0, 30)).filter(Boolean);

    return {
      url, isLogin, isDashboard, is2FA, hasPopup,
      hasEmailField, hasPasswordField, hasDollarAmounts,
      inputCount: visibleInputs.length,
      buttonLabels,
      textSnippet: text.slice(0, 300).replace(/\n+/g, " | "),
    };
  }).catch(() => ({ url: page.url(), error: true }));

  console.log(`${TAG} [${label}] URL: ${state.url?.slice(0, 80)}`);
  console.log(`${TAG} [${label}] popup=${state.hasPopup} email=${state.hasEmailField} pass=${state.hasPasswordField} $=${state.hasDollarAmounts} login=${state.isLogin} 2fa=${state.is2FA}`);
  if (state.buttonLabels?.length) console.log(`${TAG} [${label}] Buttons: ${state.buttonLabels.join(", ")}`);
  if (shotPath) console.log(`${TAG} [${label}] Screenshot: ${shotPath}`);

  return { ...state, screenshot: shotPath };
}

// ─── Popup Dismissal ──────────────────────────────────────────────

/**
 * Try to dismiss ONE popup/modal/overlay. Clicks the first thing it finds.
 * Returns { clicked: boolean, what: string, text: string }
 */
export async function dismissOnePopup(page) {
  return await page.evaluate(() => {
    // Strategy 1: Close/dismiss buttons
    const closeSelectors = [
      'button[aria-label*="close" i]', 'button[aria-label*="dismiss" i]',
      'button[class*="close" i]', 'button[class*="dismiss" i]',
      '[class*="modal"] button[class*="close"]', '[role="dialog"] button[class*="close"]',
      '[class*="close-btn"]', '[class*="closeBtn"]', '[class*="close-button"]',
      '.modal-close', '.dialog-close', '[data-dismiss]', '[data-close]',
      'button:has(svg[class*="close"])', 'button:has([class*="icon-close"])',
      'button[aria-label="Close"]', '[class*="CloseButton"]',
    ];
    for (const sel of closeSelectors) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          if (el.offsetParent !== null) {
            el.click();
            return { clicked: true, what: `close-button: ${sel}`, text: el.textContent?.trim().slice(0, 30) };
          }
        }
      } catch {}
    }

    // Strategy 2: Text-based dismiss buttons
    const dismissWords = ["close", "dismiss", "accept", "got it", "no thanks", "not now", "skip", "maybe later", "i agree", "agree & continue", "ok", "okay", "×", "✕"];
    const skipWords = ["log in", "sign in", "submit", "register", "sign up", "create"];
    // "next" and "continue" are ambiguous — dismiss if inside a popup, skip if on main page
    const ambiguousWords = ["next", "continue"];
    for (const btn of document.querySelectorAll('button, a[role="button"], [role="button"], a.btn, a.button, a')) {
      const text = btn.textContent?.trim().toLowerCase() || "";
      if (text.length === 0 || text.length > 30 || btn.offsetParent === null) continue;

      const isInsidePopup = !!(
        btn.closest('[role="dialog"]') || btn.closest('[class*="modal"]') ||
        btn.closest('[class*="popup"]') || btn.closest('[class*="overlay"]') ||
        btn.closest('[class*="notice"]') || btn.closest('[class*="banner"]') ||
        btn.closest('[class*="alert"]') || btn.closest('[class*="notification"]') ||
        btn.closest('[class*="callout"]') || btn.closest('[class*="announcement"]')
      );

      // Always skip login-specific words
      if (skipWords.some(w => text.includes(w))) continue;

      // Click if it matches a dismiss word
      if (dismissWords.some(w => text.includes(w))) {
        btn.click();
        return { clicked: true, what: "text-button", text: btn.textContent?.trim().slice(0, 30) };
      }

      // Click ambiguous words ("next", "continue") only if inside a popup context
      if (isInsidePopup && ambiguousWords.some(w => text.includes(w))) {
        btn.click();
        return { clicked: true, what: "popup-next-button", text: btn.textContent?.trim().slice(0, 30) };
      }
    }

    // Strategy 2b removed — was too aggressive (clicked page nav links like "Security Center")

    // Strategy 2c: Floating/fixed divs with a single link or button (notification banners)
    // These are often maintenance notices, cookie banners, etc.
    for (const el of document.querySelectorAll("div, section, aside")) {
      const s = getComputedStyle(el);
      // Fixed or absolute position, visible, with limited text (banner-like)
      if ((s.position === "fixed" || s.position === "absolute") && el.offsetParent !== null && parseInt(s.zIndex || 0) > 0) {
        const links = el.querySelectorAll("a, button");
        const visibleLinks = [...links].filter(l => l.offsetParent !== null);
        // If it has 1-3 clickable elements and isn't a login form, click the last one (usually "Next" / "OK" / "Close")
        if (visibleLinks.length >= 1 && visibleLinks.length <= 3) {
          const hasForm = el.querySelector("input, select, textarea");
          if (!hasForm) {
            const target = visibleLinks[visibleLinks.length - 1];
            const text = target.textContent?.trim().toLowerCase() || "";
            if (!skipWords.some(w => text.includes(w))) {
              target.click();
              return { clicked: true, what: "floating-banner-link", text: target.textContent?.trim().slice(0, 30) };
            }
          }
        }
      }
    }

    // Strategy 3: X / close icons (small elements)
    for (const el of document.querySelectorAll("button, span, div, a, i")) {
      if (el.offsetParent === null) continue;
      const rect = el.getBoundingClientRect();
      const text = el.textContent?.trim();
      if ((text === "×" || text === "✕" || text === "X" || text === "x") && rect.width < 60 && rect.height < 60) {
        el.click();
        return { clicked: true, what: "x-icon", text };
      }
    }

    // Strategy 4: Remove blocking overlay elements from DOM
    for (const el of document.querySelectorAll('[class*="overlay"], [class*="backdrop"], [class*="modal-bg"], [class*="mask"]')) {
      const s = getComputedStyle(el);
      if (el.offsetParent !== null && (s.position === "fixed" || s.position === "absolute") && parseInt(s.zIndex) > 50) {
        el.remove();
        return { clicked: true, what: "removed-overlay", text: el.className?.slice(0, 40) };
      }
    }

    // Strategy 5: Remove fixed high-z-index divs covering >30% of screen
    for (const el of document.querySelectorAll("div, section, aside")) {
      const s = getComputedStyle(el);
      if (s.position === "fixed" && parseInt(s.zIndex) > 100 &&
          el.offsetWidth > window.innerWidth * 0.3 && el.offsetHeight > window.innerHeight * 0.3) {
        el.remove();
        return { clicked: true, what: "removed-big-overlay", text: el.className?.slice(0, 40) };
      }
    }

    return { clicked: false };
  }).catch(() => ({ clicked: false }));
}

/**
 * Keep dismissing popups one at a time until the page is clear.
 * Waits between each dismiss to let animations finish and new popups appear.
 * @param {import('playwright').Page} page
 * @param {string|null} screenshotsDir - optional directory to save progress screenshots
 * @param {{ maxAttempts?: number, waitMs?: number }} opts
 * @returns {Promise<number>} total number of popups dismissed
 */
export async function clearAllPopups(page, screenshotsDir = null, opts = {}) {
  const { maxAttempts = 6, waitMs = 3000 } = opts;
  let total = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // First check if there's actually a popup to dismiss
    const state = await evaluatePage(page, `popup-check-${attempt}`, null); // no screenshot for checks
    if (!state.hasPopup) {
      console.log(`${TAG} Page is clear after ${total} dismiss(es)`);
      break;
    }

    const result = await dismissOnePopup(page);
    if (result.clicked) {
      total++;
      console.log(`${TAG} Popup dismiss #${total}: ${result.what} — "${result.text || ""}"`);
      await page.waitForTimeout(waitMs);
      if (screenshotsDir) {
        const shotPath = path.join(screenshotsDir, `dismiss-${total}-${Date.now()}.png`);
        await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {});
        console.log(`${TAG} Post-dismiss screenshot: ${shotPath}`);
      }
    } else {
      console.log(`${TAG} Popup detected but nothing to click — removing overlays`);
      // Last resort: force-remove any blocking overlay from DOM
      await page.evaluate(() => {
        for (const el of document.querySelectorAll("div, section, aside")) {
          const s = getComputedStyle(el);
          if (s.position === "fixed" && parseInt(s.zIndex) > 50 &&
              el.offsetWidth > window.innerWidth * 0.25 && el.offsetHeight > window.innerHeight * 0.25) {
            el.remove();
          }
        }
      }).catch(() => {});
      await page.waitForTimeout(waitMs);
      break;
    }
  }
  return total;
}

/**
 * Wait until the page has no visible popups/modals blocking interaction.
 * Keeps checking and dismissing for up to `timeoutMs`.
 * @param {import('playwright').Page} page
 * @param {string|null} screenshotsDir
 * @param {{ timeoutMs?: number, checkIntervalMs?: number }} opts
 * @returns {Promise<boolean>} true if page is clear, false if timed out
 */
export async function waitUntilClear(page, screenshotsDir = null, opts = {}) {
  const { timeoutMs = 30000, checkIntervalMs = 2000 } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await evaluatePage(page, "clear-check", screenshotsDir);
    if (!state.hasPopup) {
      console.log(`${TAG} Page is clear`);
      return true;
    }
    console.log(`${TAG} Popup still present — dismissing...`);
    await clearAllPopups(page, screenshotsDir);
    await page.waitForTimeout(checkIntervalMs);
  }

  console.log(`${TAG} Timed out waiting for clear page`);
  return false;
}

// ─── Form Filling ─────────────────────────────────────────────────

/**
 * Fill visible form fields on the current page.
 * @param {import('playwright').Page} page
 * @param {Array<{ selector?: string, type?: string, name?: string, label?: string, value: string }>} fields
 *   Each field can match by:
 *   - `selector` — CSS selector (most specific)
 *   - `type` — input type ("email", "password", "text")
 *   - `name` — input name attribute (partial match)
 *   - `label` — associated label text (partial, case-insensitive)
 * @param {{ delayMs?: number }} opts - delay between filling each field
 * @returns {Promise<Array<{ field: object, filled: boolean, selector: string }>>}
 */
export async function fillForm(page, fields, opts = {}) {
  const { delayMs = 500 } = opts;
  const results = [];

  for (const field of fields) {
    let filled = false;
    let usedSelector = "";

    // Build candidate selectors
    const selectors = [];
    if (field.selector) selectors.push(field.selector);
    if (field.type) {
      selectors.push(`input[type="${field.type}"]`);
    }
    if (field.name) {
      selectors.push(`input[name*="${field.name}" i]`);
      selectors.push(`input[id*="${field.name}" i]`);
      selectors.push(`input[placeholder*="${field.name}" i]`);
    }

    for (const sel of selectors) {
      try {
        const el = await page.waitForSelector(sel, { timeout: 3000, state: "visible" }).catch(() => null);
        if (el) {
          await el.click({ clickCount: 3 }); // select all existing text
          await page.waitForTimeout(delayMs);
          await el.fill(field.value);
          filled = true;
          usedSelector = sel;
          console.log(`${TAG} Filled field: ${sel}`);
          await page.waitForTimeout(delayMs);
          break;
        }
      } catch {}
    }

    // Label-based matching as fallback
    if (!filled && field.label) {
      try {
        const el = await page.waitForSelector(
          `input:near(:text("${field.label}"))`,
          { timeout: 3000, state: "visible" }
        ).catch(() => null);
        if (el) {
          await el.click({ clickCount: 3 });
          await page.waitForTimeout(delayMs);
          await el.fill(field.value);
          filled = true;
          usedSelector = `label:${field.label}`;
          console.log(`${TAG} Filled field by label: ${field.label}`);
          await page.waitForTimeout(delayMs);
        }
      } catch {}
    }

    if (!filled) {
      console.log(`${TAG} Could not find field: ${JSON.stringify({ selector: field.selector, type: field.type, name: field.name, label: field.label })}`);
    }

    results.push({ field, filled, selector: usedSelector });
  }

  return results;
}

/**
 * Click a submit/action button on the current page.
 * @param {import('playwright').Page} page
 * @param {{ labels?: string[], selectors?: string[] }} opts
 * @returns {Promise<boolean>} true if a button was clicked
 */
export async function clickSubmit(page, opts = {}) {
  const {
    labels = ["Log In", "Sign In", "Submit", "Continue", "Next"],
    selectors = ['button[type="submit"]', 'input[type="submit"]']
  } = opts;

  // Try explicit selectors first
  for (const sel of selectors) {
    const btn = await page.waitForSelector(sel, { timeout: 2000, state: "visible" }).catch(() => null);
    if (btn) {
      await btn.click();
      console.log(`${TAG} Clicked: ${sel}`);
      return true;
    }
  }

  // Try text-based button matching
  for (const label of labels) {
    const btn = await page.waitForSelector(`button:has-text("${label}"), a:has-text("${label}")`, { timeout: 1500, state: "visible" }).catch(() => null);
    if (btn) {
      await btn.click();
      console.log(`${TAG} Clicked: "${label}"`);
      return true;
    }
  }

  console.log(`${TAG} No submit button found`);
  return false;
}

// ─── Login Flow ───────────────────────────────────────────────────

/**
 * Full visual login flow: clear popups → fill credentials → handle 2FA → wait for dashboard.
 *
 * @param {import('playwright').Page} page
 * @param {Object} opts
 * @param {string} opts.url - login page URL
 * @param {string} [opts.email] - email/username credential
 * @param {string} [opts.password] - password credential
 * @param {string} [opts.screenshotsDir] - directory for screenshots
 * @param {number} [opts.timeoutMs=600000] - total timeout (default 10 min)
 * @param {() => Promise<boolean>} [opts.isLoggedIn] - custom check for successful login
 * @param {{ labels?: string[] }} [opts.submitButton] - custom submit button labels
 * @returns {Promise<{ success: boolean, needs2FA?: boolean, state: object }>}
 */
export async function loginFlow(page, opts = {}) {
  const {
    url, email, password, screenshotsDir = null,
    timeoutMs = 600000, isLoggedIn, submitButton = {},
  } = opts;

  const hasCreds = !!(email && password);

  // Navigate
  if (url) {
    console.log(`${TAG} Navigating to ${url.slice(0, 80)}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  }

  // Phase 1: Wait for page to settle, clear popups
  console.log(`${TAG} Waiting for page to load...`);
  await page.waitForTimeout(5000);
  await evaluatePage(page, "initial-load", screenshotsDir);

  console.log(`${TAG} Clearing popups...`);
  await clearAllPopups(page, screenshotsDir);
  await page.waitForTimeout(3000);
  await clearAllPopups(page, screenshotsDir);

  const cleared = await waitUntilClear(page, screenshotsDir, { timeoutMs: 15000 });
  if (!cleared) console.log(`${TAG} Warning: popups may still be present`);
  console.log(`${TAG} Proceeding to login`);

  // Phase 2: Visual login loop
  const deadline = Date.now() + timeoutMs;
  let emailEntered = false;
  let passwordEntered = false;

  while (Date.now() < deadline) {
    const state = await evaluatePage(page, "login-loop", screenshotsDir);

    // Custom logged-in check
    if (isLoggedIn) {
      const done = await isLoggedIn().catch(() => false);
      if (done) {
        console.log(`${TAG} Custom isLoggedIn check passed`);
        return { success: true, state };
      }
    }

    // Dashboard with data = done
    if (state.hasDollarAmounts && (state.isDashboard || !state.isLogin)) {
      console.log(`${TAG} Dashboard loaded with data`);
      return { success: true, state };
    }

    // Dashboard but loading
    if (state.isDashboard && !state.hasDollarAmounts) {
      console.log(`${TAG} Dashboard loading — waiting...`);
      await page.waitForTimeout(5000);
      continue;
    }

    // Popup — clear it
    if (state.hasPopup) {
      console.log(`${TAG} Popup — clearing...`);
      await clearAllPopups(page, screenshotsDir);
      await page.waitForTimeout(2000);
      continue;
    }

    // 2FA
    if (state.is2FA) {
      console.log(`${TAG} 2FA detected — waiting for user...`);
      await page.bringToFront();
      await page.waitForTimeout(10000);
      continue;
    }

    // Email field
    if (state.hasEmailField && hasCreds && !emailEntered) {
      console.log(`${TAG} Filling email...`);
      const filled = await fillForm(page, [
        { type: "email", name: "email", value: email },
        { type: "text", name: "user", value: email },
      ]);
      emailEntered = filled.some(f => f.filled);

      // Same-page password?
      if (state.hasPasswordField && !passwordEntered) {
        const pf = await fillForm(page, [{ type: "password", value: password }]);
        passwordEntered = pf.some(f => f.filled);
      }

      await page.waitForTimeout(1000);
      await clickSubmit(page, submitButton);
      await page.waitForTimeout(5000);
      continue;
    }

    // Password field (second page)
    if (state.hasPasswordField && hasCreds && !passwordEntered) {
      console.log(`${TAG} Filling password...`);
      const pf = await fillForm(page, [{ type: "password", value: password }]);
      passwordEntered = pf.some(f => f.filled);
      await page.waitForTimeout(1000);
      await clickSubmit(page, submitButton);
      await page.waitForTimeout(5000);
      continue;
    }

    // Login page with fields already filled (browser autofill) — just click submit
    if (state.isLogin && (state.hasEmailField || state.hasPasswordField)) {
      const fieldsFilled = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="email"], input[type="text"], input[type="password"]');
        let filledCount = 0;
        for (const inp of inputs) {
          if (inp.offsetParent !== null && inp.value && inp.value.length > 0) filledCount++;
        }
        return filledCount;
      });
      if (fieldsFilled >= 1) {
        console.log(`${TAG} Fields already filled (autofill) — clicking submit...`);
        await clickSubmit(page, submitButton);
        await page.waitForTimeout(5000);
        continue;
      }
    }

    // No creds, on login page, fields empty — wait for manual login
    if (state.isLogin && !hasCreds) {
      console.log(`${TAG} Login page, no credentials — waiting for manual login...`);
      await page.bringToFront();
      await page.waitForTimeout(10000);
      continue;
    }

    // Fallback
    console.log(`${TAG} Unrecognized state — clearing popups, waiting...`);
    await clearAllPopups(page, screenshotsDir);
    await page.waitForTimeout(5000);
  }

  const finalState = await evaluatePage(page, "timeout", screenshotsDir);
  console.log(`${TAG} Login timed out`);
  return { success: false, state: finalState };
}

// ─── Page Scrolling & Multi-Page Capture ──────────────────────────

/**
 * Scroll down a page in steps, take a screenshot and capture page text at each position.
 * This ensures lazy-loaded / below-the-fold content is captured.
 *
 * @param {import('playwright').Page} page
 * @param {Object} opts
 * @param {string} opts.screenshotsDir — directory to save screenshots
 * @param {string} [opts.pageName="page"] — label for screenshot filenames
 * @param {number} [opts.scrollCount=5] — number of times to scroll down
 * @param {number} [opts.scrollWaitMs=2500] — ms to wait after each scroll for content to render
 * @returns {Promise<{ screenshots: string[], fullText: string }>}
 */
export async function scrollAndCapture(page, opts = {}) {
  const { screenshotsDir, pageName = "page", scrollCount = 5, scrollWaitMs = 2500 } = opts;
  if (!screenshotsDir) throw new Error("screenshotsDir is required");
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  const screenshots = [];
  const allTexts = [];

  // Screenshot at top of page
  console.log(`${TAG} [${pageName}] Capturing top of page...`);
  const topShot = path.join(screenshotsDir, `${pageName}-top-${Date.now()}.png`);
  await page.screenshot({ path: topShot, fullPage: false });
  screenshots.push(topShot);
  console.log(`${TAG} [${pageName}] Screenshot 0 (top): ${topShot}`);

  const topText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  allTexts.push(topText);

  // Scroll down in steps
  for (let i = 1; i <= scrollCount; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
    await page.waitForTimeout(scrollWaitMs);

    const shotPath = path.join(screenshotsDir, `${pageName}-scroll${i}-${Date.now()}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });
    screenshots.push(shotPath);
    console.log(`${TAG} [${pageName}] Screenshot ${i} (scroll ${i}/${scrollCount}): ${shotPath}`);

    // Capture text after scroll (may have new lazy-loaded content)
    const text = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    allTexts.push(text);
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Return longest text (most complete DOM state) + all screenshot paths
  const fullText = allTexts.sort((a, b) => b.length - a.length)[0] || "";
  console.log(`${TAG} [${pageName}] Done: ${screenshots.length} screenshots, ${fullText.length} chars of text captured`);
  return { screenshots, fullText };
}

/**
 * Visit multiple pages, and on each one: wait for content → clear popups → scroll+capture → run custom scraper.
 *
 * @param {import('playwright').Page} page
 * @param {Array<{ name: string, url: string, desc?: string }>} pages — URLs to visit
 * @param {Object} opts
 * @param {string} opts.screenshotsDir — directory to save screenshots
 * @param {number} [opts.scrollCount=5] — scrolls per page
 * @param {number} [opts.waitForDataMs=45000] — max ms to wait for content on each page
 * @param {(page: import('playwright').Page) => Promise<any>} [opts.scrapeFn] — custom scraper to run on each page after scrolling
 * @returns {Promise<{ pageResults: Array<{ name: string, url: string, text: string, screenshots: string[], scrapeData: any }> }>}
 */
export async function visitPages(page, pages, opts = {}) {
  const { screenshotsDir, scrollCount = 5, waitForDataMs = 45000, scrapeFn } = opts;
  if (!screenshotsDir) throw new Error("screenshotsDir is required");

  const pageResults = [];

  for (const pg of pages) {
    const result = { name: pg.name, url: pg.url, text: "", screenshots: [], scrapeData: null };
    try {
      console.log(`${TAG} ── Navigating to: ${pg.desc || pg.name} (${pg.url}) ──`);
      await page.goto(pg.url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Wait for content to appear (look for dollar amounts or any substantial text)
      const deadline = Date.now() + waitForDataMs;
      while (Date.now() < deadline) {
        const hasContent = await page.evaluate(() => {
          const text = document.body?.innerText || "";
          return text.length > 500 || /\$[\d,]{2,}/.test(text);
        }).catch(() => false);
        if (hasContent) break;
        await page.waitForTimeout(2000);
      }
      await page.waitForTimeout(3000); // extra settle time for XHR

      // Clear any popups on this page
      await clearAllPopups(page, screenshotsDir);

      // Scroll down the full page, screenshot at each position
      const { screenshots, fullText } = await scrollAndCapture(page, {
        screenshotsDir,
        pageName: pg.name,
        scrollCount,
      });
      result.screenshots = screenshots;
      result.text = fullText;

      // Run custom scraper if provided (after all content is loaded from scrolling)
      if (scrapeFn) {
        result.scrapeData = await scrapeFn(page).catch(e => {
          console.log(`${TAG} [${pg.name}] Scrape error: ${e.message?.slice(0, 80)}`);
          return null;
        });
      }

      console.log(`${TAG} [${pg.name}] Done: ${screenshots.length} screenshots, scrapeData=${result.scrapeData ? "yes" : "none"}`);
    } catch (e) {
      console.log(`${TAG} [${pg.name}] Error: ${e.message?.slice(0, 100)}`);
    }
    pageResults.push(result);
  }

  return { pageResults };
}
