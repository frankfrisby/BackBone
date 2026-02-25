/**
 * Popup Dismisser — Proactive popup/modal/overlay killer for browser automation
 *
 * Injects into every page via page.addInitScript() or page.evaluate().
 * Automatically detects and dismisses:
 *   - Cookie consent banners
 *   - "What's New" / changelog overlays
 *   - Welcome/onboarding modals
 *   - Upsell/upgrade prompts
 *   - Newsletter signup popups
 *   - GDPR/privacy notices
 *   - Session timeout warnings
 *   - App store prompts ("Get our app")
 *   - Chat widgets
 *   - Notification permission prompts
 *   - Generic modals with close/X buttons
 *
 * Usage:
 *   import { installPopupDismisser, dismissPopups } from "./popup-dismisser.js";
 *   await installPopupDismisser(page);  // Auto-dismiss on every navigation
 *   await dismissPopups(page);          // One-shot manual dismiss
 */

/**
 * The injected script that runs in the browser context.
 * Self-contained — no external dependencies.
 */
const DISMISS_SCRIPT = `
(function dismissPopups() {
  const TAG = "[PopupDismisser]";
  let dismissed = 0;

  // ── Helper: click an element safely ───────────────────────────
  function safeClick(el, reason) {
    if (!el || el.__popupDismissed) return false;
    try {
      // Don't click things that are invisible
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;

      el.__popupDismissed = true;
      el.click();
      dismissed++;
      console.log(TAG, "Dismissed:", reason, el.tagName, el.textContent?.slice(0, 40));
      return true;
    } catch { return false; }
  }

  // ── Helper: remove an element ─────────────────────────────────
  function safeRemove(el, reason) {
    if (!el || el.__popupDismissed) return false;
    try {
      el.__popupDismissed = true;
      el.remove();
      dismissed++;
      console.log(TAG, "Removed:", reason);
      return true;
    } catch { return false; }
  }

  // ── Strategy 1: Known close button text patterns ──────────────
  const CLOSE_TEXTS = [
    /^(accept|accept all|got it|i understand|i agree|okay|ok|no thanks)$/i,
    /^(dismiss|close|skip|later|maybe later|not now|no,? thanks)$/i,
    /^(continue|proceed|i accept|agree and continue)$/i,
    /^(reject all|decline|decline all)$/i,
    /^(don'?t show again|hide|remind me later)$/i,
  ];

  const buttons = document.querySelectorAll(
    'button, [role="button"], a.btn, a.button, input[type="button"], input[type="submit"]'
  );
  for (const btn of buttons) {
    const text = (btn.textContent || btn.value || "").trim();
    if (text.length > 50) continue; // Too long to be a close button
    for (const pattern of CLOSE_TEXTS) {
      if (pattern.test(text)) {
        // Only click if it's inside a modal/overlay/banner context
        const parent = btn.closest(
          '[class*="modal"], [class*="popup"], [class*="overlay"], [class*="banner"], ' +
          '[class*="cookie"], [class*="consent"], [class*="gdpr"], [class*="notice"], ' +
          '[class*="dialog"], [class*="toast"], [class*="snackbar"], [class*="interstitial"], ' +
          '[role="dialog"], [role="alertdialog"], [aria-modal="true"]'
        );
        if (parent) {
          safeClick(btn, "close-text: " + text);
          break;
        }
      }
    }
  }

  // ── Strategy 2: Close/X icon buttons ──────────────────────────
  const CLOSE_SELECTORS = [
    '[class*="close"] button',
    'button[class*="close"]',
    'button[class*="dismiss"]',
    '[class*="modal"] button[aria-label*="close" i]',
    '[class*="modal"] button[aria-label*="dismiss" i]',
    '[role="dialog"] button[aria-label*="close" i]',
    '[aria-modal="true"] button[aria-label*="close" i]',
    '[class*="overlay"] [class*="close"]',
    '[class*="banner"] [class*="close"]',
    '[class*="popup"] [class*="close"]',
    '[class*="cookie"] [class*="close"]',
    '[class*="consent"] [class*="close"]',
  ];

  for (const sel of CLOSE_SELECTORS) {
    try {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        // Verify it's in something that looks like an overlay
        const z = parseInt(getComputedStyle(el.closest('[class*="modal"], [class*="popup"], [class*="overlay"], [class*="banner"], [class*="cookie"], [role="dialog"]') || el).zIndex);
        if (z > 100 || el.closest('[role="dialog"]') || el.closest('[aria-modal="true"]')) {
          safeClick(el, "close-icon: " + sel);
        }
      }
    } catch {}
  }

  // ── Strategy 3: Remove blocking overlays by z-index/position ──
  const allElements = document.querySelectorAll("div, section, aside");
  for (const el of allElements) {
    try {
      const style = getComputedStyle(el);
      const isFixed = style.position === "fixed" || style.position === "sticky";
      const isAbsolute = style.position === "absolute";
      const z = parseInt(style.zIndex) || 0;
      const rect = el.getBoundingClientRect();

      // Cookie banners: fixed at top or bottom, full width
      if (isFixed && rect.width > window.innerWidth * 0.8 && rect.height < 300) {
        const classes = (el.className || "").toLowerCase();
        const id = (el.id || "").toLowerCase();
        const text = (el.textContent || "").toLowerCase();
        if (
          classes.match(/cookie|consent|gdpr|privacy|notice|banner/) ||
          id.match(/cookie|consent|gdpr|privacy/) ||
          (text.includes("cookie") && text.includes("accept"))
        ) {
          safeRemove(el, "cookie-banner");
          continue;
        }
      }

      // Full-screen backdrop overlays (z > 1000, covers most of viewport)
      if (
        z > 1000 &&
        (isFixed || isAbsolute) &&
        rect.width > window.innerWidth * 0.8 &&
        rect.height > window.innerHeight * 0.8 &&
        style.backgroundColor &&
        (style.backgroundColor.includes("rgba") || style.opacity < 1)
      ) {
        // This is likely a modal backdrop — don't remove it directly,
        // but look for a close button inside or press Escape
        const closeBtn = el.querySelector(
          'button[class*="close"], [aria-label*="close" i], [class*="dismiss"]'
        );
        if (closeBtn) {
          safeClick(closeBtn, "backdrop-close-btn");
        }
      }
    } catch {}
  }

  // ── Strategy 4: Site-specific popup handlers ──────────────────

  // Empower / Personal Capital
  try {
    // "What's New" modal
    const empowerWhatsNew = document.querySelector('.whats-new-modal .close, .whats-new-dialog .close, [class*="whatsnew"] button');
    if (empowerWhatsNew) safeClick(empowerWhatsNew, "empower-whats-new");

    // "Complete your profile" nudge
    const empowerProfile = document.querySelector('[class*="profile-complete"] button[class*="close"], [class*="profile-nudge"] [class*="dismiss"]');
    if (empowerProfile) safeClick(empowerProfile, "empower-profile-nudge");

    // Generic Empower overlay
    const empowerOverlay = document.querySelector('.pc-modal .pc-modal-close, .modal-dialog .close');
    if (empowerOverlay) safeClick(empowerOverlay, "empower-modal");
  } catch {}

  // Google / Gmail
  try {
    // "Use the Gmail app" prompt
    const gmailApp = document.querySelector('[data-action="cancel"][class*="app"]');
    if (gmailApp) safeClick(gmailApp, "gmail-app-prompt");
  } catch {}

  // Microsoft / Outlook
  try {
    const outlookBanner = document.querySelector('[class*="InfoBar"] button[class*="close"], [id*="notification"] button[class*="dismiss"]');
    if (outlookBanner) safeClick(outlookBanner, "outlook-banner");
  } catch {}

  // Generic "chat widget" removals
  try {
    const chatWidgets = document.querySelectorAll(
      '[class*="chat-widget"], [class*="chatbot"], [id*="intercom"], [id*="drift"], [id*="zendesk"], [id*="crisp"], [id*="hubspot-messages"]'
    );
    for (const w of chatWidgets) {
      if (w.style) w.style.display = "none";
    }
  } catch {}

  // ── Strategy 5: Kill scroll lock ──────────────────────────────
  // Modals often set overflow:hidden on body — restore it
  try {
    if (document.body.style.overflow === "hidden" && dismissed > 0) {
      document.body.style.overflow = "";
    }
    if (document.documentElement.style.overflow === "hidden" && dismissed > 0) {
      document.documentElement.style.overflow = "";
    }
  } catch {}

  return { dismissed };
})();
`;

/**
 * MutationObserver script — watches for dynamically added popups
 * and dismisses them as they appear.
 */
const OBSERVER_SCRIPT = `
(function installPopupObserver() {
  if (window.__popupObserverInstalled) return;
  window.__popupObserverInstalled = true;

  const POPUP_INDICATORS = /modal|popup|overlay|cookie|consent|gdpr|banner|dialog|interstitial|toast/i;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue; // Element nodes only

        const classes = node.className || "";
        const role = node.getAttribute?.("role") || "";
        const ariaModal = node.getAttribute?.("aria-modal");

        const isPopup = POPUP_INDICATORS.test(classes) ||
                         POPUP_INDICATORS.test(node.id || "") ||
                         role === "dialog" || role === "alertdialog" ||
                         ariaModal === "true";

        if (isPopup) {
          // Wait a moment for the popup to fully render, then dismiss
          setTimeout(() => {
            ${DISMISS_SCRIPT}
          }, 500);
          break; // One dismiss pass per mutation batch
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log("[PopupDismisser] Observer installed — watching for dynamic popups");
})();
`;

// ── Public API ────────────────────────────────────────────────────

/**
 * Install the popup dismisser on a Playwright page.
 * Runs on every navigation AND watches for dynamically added popups.
 *
 * @param {import('playwright').Page} page
 */
export async function installPopupDismisser(page) {
  // Run on every future navigation
  await page.addInitScript(DISMISS_SCRIPT);
  await page.addInitScript(OBSERVER_SCRIPT);

  // Also run right now if page is already loaded
  try {
    await page.evaluate(DISMISS_SCRIPT);
    await page.evaluate(OBSERVER_SCRIPT);
  } catch {} // May fail if page is about:blank
}

/**
 * One-shot: dismiss any visible popups right now
 * @param {import('playwright').Page} page
 * @returns {Promise<{dismissed: number}>}
 */
export async function dismissPopups(page) {
  try {
    return await page.evaluate(DISMISS_SCRIPT);
  } catch {
    return { dismissed: 0 };
  }
}

/**
 * Site-specific pre-navigation popup config.
 * Returns extra selectors/strategies for known sites.
 */
export function getSiteConfig(url) {
  const host = new URL(url).hostname.toLowerCase();

  const configs = {
    "participant.empower-retirement.com": {
      name: "Empower",
      extraDismissSelectors: [
        '.whats-new-modal .close',
        '.pc-modal .pc-modal-close',
        '[class*="whatsnew"] button',
        '.modal-dialog .close',
        '[class*="profile-complete"] button[class*="close"]',
      ],
      waitAfterLoad: 3000,  // Empower is slow to render popups
    },
    "mail.google.com": {
      name: "Gmail",
      extraDismissSelectors: ['[data-action="cancel"]'],
      waitAfterLoad: 2000,
    },
    "outlook.live.com": {
      name: "Outlook",
      extraDismissSelectors: ['[class*="InfoBar"] button[class*="close"]'],
      waitAfterLoad: 2000,
    },
    "robinhood.com": {
      name: "Robinhood",
      extraDismissSelectors: ['[data-testid="close-button"]', '[class*="ModalCloseButton"]'],
      waitAfterLoad: 2000,
    },
  };

  for (const [domain, config] of Object.entries(configs)) {
    if (host.includes(domain)) return config;
  }

  return null;
}

export default { installPopupDismisser, dismissPopups, getSiteConfig };
