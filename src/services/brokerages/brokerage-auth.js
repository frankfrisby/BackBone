import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDataDir, getScreenshotsDir } from "../paths.js";
import { clearAllPopups, evaluatePage, loginFlow, scrollAndCapture, visitPages } from "../browser-form-agent.js";
import { getCredential } from "../credential-vault.js";

// Resolve per-call so it works across user switches
const getDataDirNow = () => getDataDir();

const BROKERAGES = {
  empower: {
    label: "Empower",
    loginUrl: "https://participant.empower-retirement.com/participant/#/login?accu=MYERIRA",
    successPatterns: ["/dashboard/", "/participant/#/articles", "/participant/#/dashboard", "/participant/#/home"],
    dataUrl: "https://participant.empower-retirement.com/dashboard/#/net-worth",
    holdingsUrl: "https://participant.empower-retirement.com/dashboard/#/portfolio/holdings",
    expiryDays: 30,
    authFile: "empower-auth.json",
    useChromeProfile: true,
    credentialKeys: { email: "EMPOWER_EMAIL", password: "EMPOWER_PASSWORD" },
    envFallback: { email: "PERSONAL_CAPITAL_EMAIL", password: "PERSONAL_CAPITAL_PASSWORD" },
    submitLabels: ["Log In", "Sign In", "Continue", "Next"]
  },
  robinhood: {
    label: "Robinhood",
    loginUrl: "https://robinhood.com/login",
    successPatterns: ["/", "/account", "/portfolio"],
    expiryDays: 1,
    authFile: "robinhood-auth.json",
    credentialKeys: { email: "ROBINHOOD_EMAIL", password: "ROBINHOOD_PASSWORD" },
    submitLabels: ["Log In", "Sign In", "Submit"]
  },
  fidelity: {
    label: "Fidelity",
    loginUrl: "https://digital.fidelity.com/prgw/digital/login/full-page",
    successPatterns: ["/portfolio/summary", "/portfolio/positions", "/summary"],
    expiryDays: 7,
    authFile: "fidelity-auth.json",
    credentialKeys: { email: "FIDELITY_USERNAME", password: "FIDELITY_PASSWORD" },
    submitLabels: ["Log In", "Sign In", "Submit"]
  }
};

function authFilePath(brokerageId) {
  return path.join(getDataDirNow(), BROKERAGES[brokerageId].authFile);
}

function loadAuth(brokerageId) {
  try {
    const p = authFilePath(brokerageId);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  } catch {}
  return null;
}

function saveAuth(brokerageId, data) {
  if (!fs.existsSync(getDataDirNow())) fs.mkdirSync(getDataDirNow(), { recursive: true });
  fs.writeFileSync(authFilePath(brokerageId), JSON.stringify(data, null, 2));
}

export function isExpired(brokerageId) {
  const auth = loadAuth(brokerageId);
  if (!auth?.capturedAt) return true;
  const expiryMs = (BROKERAGES[brokerageId]?.expiryDays || 7) * 86400000;
  return Date.now() - new Date(auth.capturedAt).getTime() > expiryMs;
}

export function getBrokerageStatuses() {
  const statuses = {};
  for (const [id, config] of Object.entries(BROKERAGES)) {
    const auth = loadAuth(id);
    // Empower is "connected" if it has cookies OR if personal-capital.json has data
    let connected = !!auth?.cookies?.length;
    if (!connected && id === "empower") {
      try {
        const pcPath = path.join(getDataDirNow(), "personal-capital.json");
        if (fs.existsSync(pcPath)) {
          const pc = JSON.parse(fs.readFileSync(pcPath, "utf-8"));
          connected = !!pc.authenticated;
        }
      } catch {}
    }
    const expired = connected && auth?.cookies?.length && isExpired(id);
    statuses[id] = {
      label: config.label,
      connected,
      expired,
      lastSync: auth?.capturedAt || null,
      accountCount: auth?.accountCount || 0
    };
  }
  return statuses;
}

export function getBrokerageStatus(brokerageId) {
  return getBrokerageStatuses()[brokerageId] || { connected: false, expired: false };
}

const TAG = "[BrokerageAuth]";

/**
 * Dismiss popups, overlays, cookie banners, and modals that block interaction.
 * Runs silently — never throws.
 */
// dismissPopups now uses browser-form-agent.js — see clearAllPopups import

/**
 * Save a screenshot to getDataDirNow() for debugging
 */
async function saveScreenshot(page, label) {
  try {
    const screenshotPath = path.join(getDataDirNow(), `brokerage-${label}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`${TAG} Screenshot: ${screenshotPath}`);
    return screenshotPath;
  } catch { return null; }
}

/**
 * Multi-step brokerage connection:
 *  1. Launch persistent browser (isolated app profile — avoids Chrome lock)
 *  2. Navigate to login URL
 *  3. Dismiss popups/overlays repeatedly
 *  4. Wait for user to log in (auto-fill or manual)
 *  5. Navigate to data pages (net worth, holdings)
 *  6. Scrape data
 *  7. Capture cookies and save
 */
export async function connectBrokerage(brokerageId, { notify } = {}) {
  const config = BROKERAGES[brokerageId];
  if (!config) return { success: false, message: `Unknown brokerage: ${brokerageId}` };

  let chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    return {
      success: false,
      message: "Playwright not installed. Run: npm install playwright && npx playwright install chromium"
    };
  }

  // Notify user we're starting
  if (notify) {
    try { await notify(`Opening ${config.label} login browser. Please log in when the window appears.`); } catch {}
  }

  let context = null;

  try {
    // Always use an isolated persistent profile — Chrome's own profile is usually locked
    const appProfile = path.join(getDataDirNow(), `chrome-${brokerageId}`);
    if (!fs.existsSync(appProfile)) fs.mkdirSync(appProfile, { recursive: true });

    context = await chromium.launchPersistentContext(appProfile, {
      headless: false,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
      ],
      viewport: { width: 1280, height: 900 },
      ignoreDefaultArgs: ["--enable-automation"],
      timeout: 30000,
    });

    const page = context.pages()[0] || await context.newPage();

    const ssDir = getScreenshotsDir();

    // For Robinhood, intercept OAuth tokens
    let oauthToken = null;
    if (brokerageId === "robinhood") {
      page.on("response", async (response) => {
        try {
          if (response.url().includes("/oauth2/token") && response.status() === 200) {
            const json = await response.json();
            if (json.access_token) oauthToken = json;
          }
        } catch {}
      });
    }

    // ── Load credentials (for login fallback) ──
    let email = null, password = null;
    if (config.credentialKeys) {
      try {
        email = await getCredential(config.credentialKeys.email);
        password = await getCredential(config.credentialKeys.password);
      } catch {}
      if (!email && config.envFallback) email = process.env[config.envFallback.email] || null;
      if (!password && config.envFallback) password = process.env[config.envFallback.password] || null;
    }

    // ── Helper: check if we got redirected to a login page ──
    const isOnLoginPage = () => {
      const url = page.url();
      return url.includes("/login") || url.includes("/signin") || url.includes("/sign-in") || url.includes("/auth");
    };

    // ── Helper: perform login if needed ──
    const doLoginIfNeeded = async () => {
      if (!isOnLoginPage()) return true; // already logged in
      console.log(`${TAG} Redirected to login — authenticating...`);
      const loginResult = await loginFlow(page, {
        url: config.loginUrl,
        email,
        password,
        screenshotsDir: ssDir,
        timeoutMs: 300000,
        submitButton: { labels: config.submitLabels || [] },
        isLoggedIn: async () => {
          if (oauthToken) return true;
          const u = page.url();
          const onLogin = u.includes("/login") || u.includes("/signin") || u.includes("/sign-in");
          return !onLogin && config.successPatterns.some(p => u.includes(p));
        },
      });
      return loginResult.success;
    };

    // ── Helper: scrape all dollar amounts, accounts, holdings from current page ──
    const scrapeCurrentPage = async () => {
      return page.evaluate(() => {
        const data = { dollarValues: [], accounts: [], holdings: [], bodyText: "" };

        // Grab all dollar amounts on the page
        const allText = document.body?.innerText || "";
        data.bodyText = allText.slice(0, 15000);
        const dollarMatches = allText.match(/\$[\d,]+\.?\d*/g) || [];
        data.dollarValues = [...new Set(dollarMatches)].map(m => ({
          raw: m, value: parseFloat(m.replace(/[$,]/g, ""))
        })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

        // Try to find account-like sections (name + balance pairs)
        for (const el of document.querySelectorAll('[class*="account"], [class*="Account"], [data-testid*="account"], [role="listitem"], .card, [class*="card"]')) {
          const text = el.innerText?.trim() || "";
          const nameMatch = text.match(/^([^\n$]+)/);
          const valMatch = text.match(/\$([\d,]+\.?\d*)/);
          if (nameMatch && valMatch) {
            const name = nameMatch[1].trim().slice(0, 80);
            const value = parseFloat(valMatch[1].replace(/,/g, ""));
            if (name.length > 2 && value > 0) {
              data.accounts.push({ name, value });
            }
          }
        }

        // Try table rows for holdings
        for (const row of document.querySelectorAll('table tbody tr, [class*="holding"], [role="row"]')) {
          const cells = row.querySelectorAll('td, [role="cell"], span, div');
          if (cells.length < 2) continue;
          const texts = Array.from(cells).map(c => c.textContent?.trim() || "");
          const name = texts.find(t => t.length > 2 && !/^\$/.test(t) && !/^[\d,.%]+$/.test(t));
          if (!name || name.toLowerCase().includes("total")) continue;
          let value = null, shares = null, price = null, pctReturn = null;
          for (const t of texts) {
            const dm = t.match(/^\$?([\d,]+\.?\d*)$/);
            if (dm) {
              const v = parseFloat(dm[1].replace(/,/g, ""));
              if (!price && v < 10000) price = v;
              else if (!value) value = v;
            }
            const sm = t.match(/^([\d,]+\.?\d*)$/);
            if (sm && !shares) {
              const v = parseFloat(sm[1].replace(/,/g, ""));
              if (v > 0 && v < 1e8) shares = v;
            }
            const pm = t.match(/([-+]?\d+\.?\d*)%/);
            if (pm) pctReturn = parseFloat(pm[1]);
          }
          if (name && (value || shares)) {
            data.holdings.push({ name: name.slice(0, 80), value, shares, price, pctReturn });
          }
        }
        return data;
      });
    };

    // ── Helper: parse structured text from Empower net worth page ──
    // The page text has a clear format: Category headers (Cash, Investment, Credit, Loan, Other Asset)
    // followed by account rows: Institution\nDescription\n\tType\t\n$Balance
    const parsePageText = (text) => {
      const accounts = [];
      const categoryPattern = /^(Cash|Investment|Credit|Loan|Mortgage|Other Asset)\s*$/gm;
      const categories = [];
      let match;
      while ((match = categoryPattern.exec(text)) !== null) {
        categories.push({ name: match[1], index: match.index });
      }

      for (let ci = 0; ci < categories.length; ci++) {
        const cat = categories[ci];
        const nextIndex = ci + 1 < categories.length ? categories[ci + 1].index : text.length;
        const section = text.slice(cat.index + cat.name.length, nextIndex);

        // Match lines: look for dollar amounts preceded by account info
        // Pattern: Institution\nDescription - Ending in XXXX\n\tType\t\n$Amount
        const lines = section.split("\n").map(l => l.trim()).filter(Boolean);

        let currentInstitution = "";
        let currentDescription = "";
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Skip category totals (just a dollar amount on its own after the category name)
          if (i === 0 && /^[-$\d,.\s]+$/.test(line)) continue;

          // Dollar amount line
          const balMatch = line.match(/^-?\$[\d,]+\.?\d*$/);
          if (balMatch && currentInstitution) {
            const balance = parseFloat(line.replace(/[$,]/g, ""));
            // Look back for the type (usually the line before the balance)
            let accountType = "";
            for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
              const prev = lines[j];
              if (["Savings", "Checking", "Investment", "IRA Roth", "IRA Traditional",
                   "401k Traditional", "401k Roth", "Personal", "Automobile", "Loan",
                   "Assets", "Mortgage", "Brokerage", "529"].some(t => prev.includes(t))) {
                accountType = prev;
                break;
              }
            }
            accounts.push({
              institution: currentInstitution,
              name: currentDescription || currentInstitution,
              category: cat.name.toLowerCase(),
              accountType: accountType || cat.name.toLowerCase(),
              balance,
            });
            currentInstitution = "";
            currentDescription = "";
            continue;
          }

          // Timestamp line (skip)
          if (/^\d{1,2}:\d{2}(AM|PM)$/i.test(line) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(line)) continue;

          // Account type line (skip, captured above)
          if (["Savings", "Checking", "Investment", "IRA Roth", "IRA Traditional",
               "401k Traditional", "401k Roth", "Personal", "Automobile", "Loan",
               "Assets", "Mortgage", "Brokerage", "529"].some(t => line.includes(t)) && line.length < 30) continue;

          // Institution or description line — skip if it looks like a dollar amount, number, or ticker
          if (/^[-+$\d,.%\s]+$/.test(line)) continue; // pure numbers/dollars
          if (/^[A-Z]{1,5}(\.[A-Z]+)?$/.test(line)) continue; // stock ticker
          if (line.length < 3) continue;
          if (!currentInstitution) {
            currentInstitution = line;
          } else if (!currentDescription) {
            currentDescription = line;
          }
        }
      }
      return accounts;
    };

    // ── Step 1: Try data pages directly (skip login) ──
    const dataPages = [];
    if (config.dataUrl) dataPages.push({ name: "networth", url: config.dataUrl, desc: "Net Worth" });
    if (config.holdingsUrl) dataPages.push({ name: "holdings", url: config.holdingsUrl, desc: "Holdings" });
    // If no data pages defined, use loginUrl as the starting point
    const startUrl = dataPages.length > 0 ? dataPages[0].url : config.loginUrl;

    console.log(`${TAG} Trying ${config.label} data page directly...`);
    await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);

    // ── Step 2: If redirected to login, authenticate ──
    const loggedIn = await doLoginIfNeeded();
    if (!loggedIn) {
      await saveScreenshot(page, `${brokerageId}-login-failed`);
      await context.close();
      return { success: false, message: "Login timed out (5 minutes). Try again." };
    }

    console.log(`${TAG} Authenticated! Scraping data pages...`);
    await saveScreenshot(page, `${brokerageId}-logged-in`);

    // ── Step 3: Visit each data page, scroll + capture thoroughly ──
    let scrapedData = { accounts: [], holdings: [], dollarValues: [], allText: "" };

    const pagesToVisit = dataPages.length > 0 ? dataPages : [{ name: "main", url: page.url(), desc: "Main" }];

    for (const pg of pagesToVisit) {
      console.log(`${TAG} ── Visiting: ${pg.desc} (${pg.url}) ──`);
      if (pg.url !== page.url()) {
        await page.goto(pg.url, { waitUntil: "domcontentloaded", timeout: 60000 });
      }

      // Wait for data to load (look for dollar amounts)
      const loadDeadline = Date.now() + 45000;
      while (Date.now() < loadDeadline) {
        const hasData = await page.evaluate(() => /\$[\d,]{2,}/.test(document.body?.innerText || "")).catch(() => false);
        if (hasData) break;
        // Check if we got kicked back to login
        if (isOnLoginPage()) {
          console.log(`${TAG} Session expired mid-scrape — re-authenticating...`);
          await doLoginIfNeeded();
          await page.goto(pg.url, { waitUntil: "domcontentloaded", timeout: 60000 });
        }
        await page.waitForTimeout(3000);
      }
      await page.waitForTimeout(3000);
      await clearAllPopups(page, ssDir);

      // Scroll through the entire page (5 scrolls, screenshot at each)
      await scrollAndCapture(page, { screenshotsDir: ssDir, pageName: `${brokerageId}-${pg.name}`, scrollCount: 5, scrollWaitMs: 3000 });

      // Scrape structured data from DOM
      const pageData = await scrapeCurrentPage();
      console.log(`${TAG} [${pg.desc}] Found: ${pageData.dollarValues.length} dollar values, ${pageData.accounts.length} accounts, ${pageData.holdings.length} holdings`);

      // Merge results
      scrapedData.accounts.push(...pageData.accounts);
      scrapedData.holdings.push(...pageData.holdings);
      scrapedData.dollarValues.push(...pageData.dollarValues);
      scrapedData.allText += `\n\n=== ${pg.desc} ===\n${pageData.bodyText}`;
    }

    // Deduplicate accounts and holdings by name
    const dedup = (arr) => {
      const seen = new Map();
      for (const item of arr) {
        const key = item.name?.toLowerCase();
        if (key && (!seen.has(key) || (item.value && item.value > (seen.get(key).value || 0)))) {
          seen.set(key, item);
        }
      }
      return [...seen.values()];
    };
    scrapedData.accounts = dedup(scrapedData.accounts);
    scrapedData.holdings = dedup(scrapedData.holdings);

    // ── Parse structured text for categories (only from net worth page, not holdings) ──
    // Split at === Holdings === or === RETRY to avoid mixing stock data into accounts
    const nwText = scrapedData.allText.split(/===\s*(Holdings|RETRY)/i)[0] || scrapedData.allText;
    const textParsedAccounts = parsePageText(nwText);
    if (textParsedAccounts.length > 0) {
      console.log(`${TAG} Text parser found ${textParsedAccounts.length} categorized accounts`);
      // Replace generic DOM-scraped accounts with categorized ones
      scrapedData.accounts = textParsedAccounts;
    } else {
      console.log(`${TAG} Text parser found 0 accounts — keeping DOM-scraped data`);
    }

    // Net worth = largest dollar value found
    const netWorth = scrapedData.dollarValues.length > 0 ? scrapedData.dollarValues[0].value : null;

    // ── Step 4: If data is thin, retry once ──
    if (!netWorth && scrapedData.holdings.length === 0 && scrapedData.accounts.length === 0) {
      console.log(`${TAG} Data is thin — retrying all pages...`);
      await page.waitForTimeout(5000);
      for (const pg of pagesToVisit) {
        await page.goto(pg.url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(8000);
        await clearAllPopups(page, ssDir);
        await scrollAndCapture(page, { screenshotsDir: ssDir, pageName: `${brokerageId}-${pg.name}-retry`, scrollCount: 5, scrollWaitMs: 3000 });
        const retryData = await scrapeCurrentPage();
        scrapedData.accounts.push(...retryData.accounts);
        scrapedData.holdings.push(...retryData.holdings);
        scrapedData.dollarValues.push(...retryData.dollarValues);
        scrapedData.allText += `\n\n=== RETRY ${pg.desc} ===\n${retryData.bodyText}`;
      }
      scrapedData.accounts = dedup(scrapedData.accounts);
      scrapedData.holdings = dedup(scrapedData.holdings);
    }

    // Final net worth
    const finalNetWorth = scrapedData.dollarValues.length > 0
      ? scrapedData.dollarValues.sort((a, b) => b.value - a.value)[0].value
      : null;

    console.log(`${TAG} FINAL: Net worth=${finalNetWorth}, accounts=${scrapedData.accounts.length}, holdings=${scrapedData.holdings.length}`);

    // ── Capture cookies & save ──
    console.log(`${TAG} Step 6: Capturing session cookies...`);
    const cookies = await context.cookies();
    await context.close();

    const authData = {
      cookies,
      capturedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + config.expiryDays * 86400000).toISOString(),
      accountCount: scrapedData.accounts.length,
      ...(finalNetWorth && { netWorth: finalNetWorth }),
      ...(scrapedData.accounts.length && { accounts: scrapedData.accounts }),
      ...(scrapedData.holdings.length && { holdings: scrapedData.holdings }),
      dollarValues: scrapedData.dollarValues.slice(0, 20).map(d => d.raw),
    };

    // Always save full page text for AI analysis
    const textPath = path.join(getDataDirNow(), `${brokerageId}-page-text.txt`);
    fs.writeFileSync(textPath, scrapedData.allText);

    // For Robinhood: save OAuth token in compatible format
    if (oauthToken) {
      authData.oauthToken = oauthToken.access_token;
      authData.refreshToken = oauthToken.refresh_token;
      authData.tokenExpiresIn = oauthToken.expires_in;

      const rhTokenPath = path.join(getDataDirNow(), ".robinhood-token.json");
      fs.writeFileSync(rhTokenPath, JSON.stringify({
        token: oauthToken.access_token,
        expiresAt: Date.now() + (oauthToken.expires_in || 86400) * 1000,
        savedAt: new Date().toISOString()
      }, null, 2));
    }

    saveAuth(brokerageId, authData);

    // ── Bridge: save structured data so MCP tools and AI can read it ──
    // Each brokerage gets its own data file + Empower also writes personal-capital.json for legacy MCP
    try {
      const categorizedAccounts = scrapedData.accounts.map(a => ({
        name: a.name || a.institution,
        institution: a.institution || "",
        balance: a.balance ?? a.value ?? 0,
        type: a.accountType || "",
        category: a.category || "other",
      }));

      const categories = {};
      for (const acc of categorizedAccounts) {
        const cat = acc.category || "other";
        if (!categories[cat]) categories[cat] = { accounts: [], total: 0 };
        categories[cat].accounts.push(acc);
        categories[cat].total += acc.balance || 0;
      }

      const holdingsFormatted = scrapedData.holdings.map(h => ({
        name: h.name, ticker: h.name, value: h.value,
        shares: h.shares, price: h.price, gainPercent: h.pctReturn
      }));

      const brokerageData = {
        brokerage: brokerageId,
        label: config.label,
        accounts: categorizedAccounts,
        categories,
        holdings: holdingsFormatted,
        netWorth: finalNetWorth,
        lastUpdated: new Date().toISOString(),
      };

      // Per-brokerage data file (works for any brokerage)
      const brokerageDataPath = path.join(getDataDirNow(), `${brokerageId}-data.json`);
      fs.writeFileSync(brokerageDataPath, JSON.stringify(brokerageData, null, 2));
      console.log(`${TAG} Wrote ${brokerageDataPath} (${categorizedAccounts.length} accounts, ${Object.keys(categories).length} categories)`);

      // Empower also writes personal-capital.json for legacy MCP tools
      if (brokerageId === "empower") {
        const pcPath = path.join(getDataDirNow(), "personal-capital.json");
        const existing = fs.existsSync(pcPath) ? JSON.parse(fs.readFileSync(pcPath, "utf-8")) : {};
        const pcData = {
          ...existing,
          accounts: categorizedAccounts,
          categories,
          holdings: holdingsFormatted,
          netWorth: finalNetWorth ? { total: finalNetWorth, date: new Date().toISOString() } : existing.netWorth,
          lastUpdated: new Date().toISOString(),
          authenticated: true,
        };
        fs.writeFileSync(pcPath, JSON.stringify(pcData, null, 2));
      }
    } catch (err) {
      console.log(`${TAG} Failed to save brokerage data: ${err.message}`);
    }

    // ── Save to SQLite knowledge DB for AI retrieval ──
    try {
      const { getKnowledgeDB } = await import("../memory/knowledge-db.js");
      const db = getKnowledgeDB();

      // Build a rich text document for the knowledge DB
      const categoryLines = [];
      const categories = {};
      for (const acc of scrapedData.accounts) {
        const cat = acc.category || "other";
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(acc);
      }
      for (const [cat, accs] of Object.entries(categories)) {
        const total = accs.reduce((s, a) => s + (a.balance || a.value || 0), 0);
        categoryLines.push(`\n## ${cat.charAt(0).toUpperCase() + cat.slice(1)} ($${total.toLocaleString()})`);
        for (const a of accs) {
          const bal = a.balance || a.value || 0;
          categoryLines.push(`- ${a.institution || ""} ${a.name}: $${bal.toLocaleString()} (${a.accountType || cat})`);
        }
      }

      const docText = [
        `# ${config.label} Financial Summary`,
        `Updated: ${new Date().toISOString()}`,
        finalNetWorth ? `Net Worth: $${finalNetWorth.toLocaleString()}` : "",
        ...categoryLines,
        scrapedData.holdings.length ? `\n## Holdings (${scrapedData.holdings.length})` : "",
        ...scrapedData.holdings.slice(0, 30).map(h => `- ${h.name}: $${(h.value || 0).toLocaleString()}`),
      ].filter(Boolean).join("\n");

      // Use indexDocument if available, otherwise insert directly
      if (db.indexDocument) {
        db.indexDocument(`brokerage-${brokerageId}`, docText, { type: "brokerage", source: brokerageId });
      } else {
        // Direct insert into chunks table
        const insertChunk = db.prepare?.("INSERT OR REPLACE INTO chunks (doc_id, chunk_index, text) VALUES (?, 0, ?)");
        const insertDoc = db.prepare?.("INSERT OR REPLACE INTO documents (id, path, type, hash) VALUES (?, ?, ?, ?)");
        if (insertDoc && insertChunk) {
          const docId = `brokerage-${brokerageId}`;
          insertDoc.run(docId, `brokerage/${brokerageId}`, "brokerage", Date.now().toString());
          insertChunk.run(docId, 0, docText);
        }
      }
      console.log(`${TAG} Indexed brokerage data in knowledge DB (${docText.length} chars)`);
    } catch (err) {
      console.log(`${TAG} Knowledge DB indexing skipped: ${err.message?.slice(0, 80)}`);
    }

    const parts = [];
    if (finalNetWorth) parts.push(`Net worth: $${finalNetWorth.toLocaleString()}`);
    if (scrapedData.accounts.length) parts.push(`${scrapedData.accounts.length} accounts`);
    if (scrapedData.holdings.length) parts.push(`${scrapedData.holdings.length} holdings`);
    const detail = parts.length ? ` | ${parts.join(", ")}` : "";
    const resultMsg = `${config.label} connected successfully${detail}`;

    // Notify user with a rich summary
    if (notify) {
      try {
        const catSummary = {};
        for (const acc of scrapedData.accounts) {
          const cat = acc.category || "other";
          if (!catSummary[cat]) catSummary[cat] = 0;
          catSummary[cat] += acc.balance || acc.value || 0;
        }
        const catLines = Object.entries(catSummary)
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .map(([cat, total]) => `  ${cat.charAt(0).toUpperCase() + cat.slice(1)}: $${total.toLocaleString()}`);

        const msg = [
          `*${config.label} Updated* ✅`,
          finalNetWorth ? `\n💰 *Net Worth: $${finalNetWorth.toLocaleString()}*` : "",
          catLines.length ? `\n📊 *By Category:*\n${catLines.join("\n")}` : "",
          scrapedData.accounts.length ? `\n🏦 ${scrapedData.accounts.length} accounts` : "",
          scrapedData.holdings.length ? `📈 ${scrapedData.holdings.length} holdings` : "",
        ].filter(Boolean).join("\n");

        await notify(msg);
      } catch {}
    }

    return {
      success: true,
      message: resultMsg,
      cookieCount: cookies.length,
      netWorth: finalNetWorth,
      accounts: scrapedData.accounts,
      holdings: scrapedData.holdings
    };
  } catch (err) {
    if (context) try { await context.close(); } catch {}
    if (notify) {
      try { await notify(`${config.label} connection failed: ${err.message}`); } catch {}
    }
    return { success: false, message: err.message };
  }
}

export function disconnectBrokerage(brokerageId) {
  try {
    const p = authFilePath(brokerageId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    // Clean up Robinhood token file too
    if (brokerageId === "robinhood") {
      const rhToken = path.join(getDataDirNow(), ".robinhood-token.json");
      if (fs.existsSync(rhToken)) fs.unlinkSync(rhToken);
    }
    return { success: true, message: `${BROKERAGES[brokerageId]?.label || brokerageId} disconnected` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Get saved cookies for a brokerage (for use by integration services)
 */
export function getSavedCookies(brokerageId) {
  const auth = loadAuth(brokerageId);
  if (!auth?.cookies?.length) return null;
  if (isExpired(brokerageId)) return null;
  return auth.cookies;
}

/**
 * Get saved OAuth token (Robinhood)
 */
export function getSavedToken(brokerageId) {
  const auth = loadAuth(brokerageId);
  return auth?.oauthToken || null;
}

export { BROKERAGES };
