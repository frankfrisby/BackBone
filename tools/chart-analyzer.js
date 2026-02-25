#!/usr/bin/env node
/**
 * Tool: Chart Analyzer
 *
 * Opens TradingView for top-scoring tickers, screenshots charts,
 * scrapes financials/technicals, analyzes with Claude vision,
 * and adjusts research convictions accordingly.
 *
 * Usage:
 *   node tools/cli.js run chart-analyzer --count=5
 *   node tools/cli.js run chart-analyzer --symbols=NVDA,AAPL --headless=false
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { addConviction, removeConviction } from "../src/services/trading/yahoo-client.js";

// Resolve user data directory
function getUserDataDir() {
  const home = process.env.HOME || process.env.USERPROFILE;
  const activeUserFile = path.join(home, ".backbone", "active-user.json");
  let uid = "default";
  try {
    const { uid: u } = JSON.parse(fs.readFileSync(activeUserFile, "utf-8"));
    if (u) uid = u;
  } catch {}
  return path.join(home, ".backbone", "users", uid, "data");
}

const DATA_DIR = getUserDataDir();

export const metadata = {
  id: "chart-analyzer",
  name: "TradingView Chart Analyzer",
  description: "Visual chart analysis — screenshots TradingView charts, scrapes financials, uses AI vision to assess patterns and adjust convictions",
  category: "trading"
};

/**
 * Get top tickers from cache sorted by effective score
 */
function getTopTickers(count) {
  const cachePath = path.join(DATA_DIR, "tickers-cache.json");
  if (!fs.existsSync(cachePath)) return [];
  const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  const tickers = data.tickers || [];
  return tickers
    .filter(t => t.effectiveScore != null)
    .sort((a, b) => (b.effectiveScore || 0) - (a.effectiveScore || 0))
    .slice(0, count);
}

/**
 * Launch browser with Chrome cookies
 */
async function launchBrowser(headless) {
  const home = process.env.HOME || process.env.USERPROFILE;
  const chromeDefaultDir = path.join(home, "AppData", "Local", "Google", "Chrome", "User Data", "Default");
  const chromeUserDataDir = path.join(home, "AppData", "Local", "Google", "Chrome", "User Data");
  const hasChromeProfile = fs.existsSync(path.join(chromeDefaultDir, "Cookies"));

  let context, tempProfileDir = null;

  if (hasChromeProfile) {
    const os = await import("os");
    tempProfileDir = path.join(os.default.tmpdir(), `backbone-chart-${Date.now()}`);
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
    context = await chromium.launchPersistentContext(tempProfileDir, {
      headless, channel: "chrome",
      viewport: { width: 1440, height: 900 },
      args: ["--profile-directory=Default", "--no-sandbox"],
    });
  } else {
    const browser = await chromium.launch({ headless, channel: "chrome" });
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  }

  return { context, tempProfileDir };
}

/**
 * Capture chart screenshot from TradingView
 */
async function captureChart(page, symbol, outputDir) {
  const url = `https://www.tradingview.com/symbols/${symbol}/`;
  console.log(`  📊 Chart: ${url}`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000); // let chart render

    // Dismiss any popups/modals
    try {
      const closeBtn = page.locator('[class*="close"]').first();
      if (await closeBtn.isVisible({ timeout: 1000 })) await closeBtn.click();
    } catch {}

    const screenshotPath = path.join(outputDir, `${symbol}-chart.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`  ✅ Chart screenshot saved`);
    return screenshotPath;
  } catch (err) {
    console.log(`  ⚠️ Chart capture failed: ${err.message}`);
    return null;
  }
}

/**
 * Scrape financials from TradingView financials overview page
 */
async function scrapeFinancials(page, symbol) {
  const url = `https://www.tradingview.com/symbols/${symbol}/financials-overview/`;
  console.log(`  💰 Financials: ${url}`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    const financials = await page.evaluate(() => {
      const text = document.body.innerText;
      const result = {};

      // Extract key metrics using regex on page text
      const patterns = {
        marketCap: /Market\s*(?:cap|capitalization)[^\n]*?(\$[\d,.]+[BMTK]?)/i,
        peRatio: /P\/E[^\n]*?([\d,.]+)/i,
        eps: /(?:EPS|Earnings per share)[^\n]*?(\$?-?[\d,.]+)/i,
        revenue: /Revenue[^\n]*?(\$[\d,.]+[BMTK]?)/i,
        dividendYield: /Dividend\s*yield[^\n]*?([\d,.]+%)/i,
        week52High: /52[\s-]*(?:wee?k|w)\s*(?:high|range)[^\n]*?([\d,.]+)/i,
        week52Low: /52[\s-]*(?:wee?k|w)\s*(?:low|range)[^\n]*?([\d,.]+)/i,
        beta: /Beta[^\n]*?([\d,.]+)/i,
      };

      for (const [key, regex] of Object.entries(patterns)) {
        const match = text.match(regex);
        if (match) result[key] = match[1].trim();
      }

      // Grab raw text excerpt for AI context
      result._rawExcerpt = text.slice(0, 3000);
      return result;
    });

    console.log(`  ✅ Financials: ${Object.keys(financials).filter(k => !k.startsWith("_")).length} metrics found`);
    return financials;
  } catch (err) {
    console.log(`  ⚠️ Financials scrape failed: ${err.message}`);
    return { _rawExcerpt: "", error: err.message };
  }
}

/**
 * Scrape technicals gauge from TradingView technicals page
 */
async function scrapeTechnicals(page, symbol) {
  const url = `https://www.tradingview.com/symbols/${symbol}/technicals/`;
  console.log(`  📈 Technicals: ${url}`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    const technicals = await page.evaluate(() => {
      const text = document.body.innerText;
      const result = {};

      // Look for the summary gauge: "Strong Buy", "Buy", "Neutral", "Sell", "Strong Sell"
      const gaugeMatch = text.match(/(Strong\s*Buy|Buy|Neutral|Sell|Strong\s*Sell)/i);
      if (gaugeMatch) result.summary = gaugeMatch[1].trim();

      // Count buy/sell/neutral signals
      const buyCount = (text.match(/\bBuy\b/gi) || []).length;
      const sellCount = (text.match(/\bSell\b/gi) || []).length;
      const neutralCount = (text.match(/\bNeutral\b/gi) || []).length;
      result.signalCounts = { buy: buyCount, sell: sellCount, neutral: neutralCount };

      // Moving averages / oscillators sections
      const maMatch = text.match(/Moving\s*Averages[^\n]*\n([^\n]*(?:Buy|Sell|Neutral)[^\n]*)/i);
      if (maMatch) result.movingAverages = maMatch[1].trim();

      const oscMatch = text.match(/Oscillators[^\n]*\n([^\n]*(?:Buy|Sell|Neutral)[^\n]*)/i);
      if (oscMatch) result.oscillators = oscMatch[1].trim();

      result._rawExcerpt = text.slice(0, 2000);
      return result;
    });

    console.log(`  ✅ Technicals summary: ${technicals.summary || "unknown"}`);
    return technicals;
  } catch (err) {
    console.log(`  ⚠️ Technicals scrape failed: ${err.message}`);
    return { summary: null, error: err.message };
  }
}

/**
 * Analyze chart screenshot + data with Claude vision
 */
async function analyzeWithVision(chartPngPath, symbol, financials, technicals, currentScore) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(`  ⚠️ No ANTHROPIC_API_KEY — skipping vision analysis`);
    return null;
  }

  const client = new Anthropic();

  const imageData = fs.readFileSync(chartPngPath);
  const base64 = imageData.toString("base64");

  const financialsText = Object.entries(financials || {})
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n") || "No financials data";

  const techSummary = technicals?.summary || "Unknown";
  const signalCounts = technicals?.signalCounts
    ? `Buy: ${technicals.signalCounts.buy}, Sell: ${technicals.signalCounts.sell}, Neutral: ${technicals.signalCounts.neutral}`
    : "N/A";

  const prompt = `You are a technical chart analyst. Analyze this TradingView chart for ${symbol}.

Current algorithm score: ${currentScore?.toFixed(2) || "N/A"} / 10

**Financials:**
${financialsText}

**Technicals Gauge:** ${techSummary}
**Signal Counts:** ${signalCounts}

**Raw financials page text (excerpt):**
${(financials?._rawExcerpt || "").slice(0, 1500)}

Based on the chart pattern and data, return a JSON object (no markdown fences):
{
  "trend": "bullish" | "bearish" | "neutral",
  "conviction": 0.0-1.0,
  "direction": "long" | "short" | "hold",
  "support": "price level or N/A",
  "resistance": "price level or N/A",
  "pattern": "brief pattern name (e.g., ascending triangle, head and shoulders)",
  "reasoning": "2-3 sentence analysis"
}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
          { type: "text", text: prompt }
        ]
      }]
    });

    const text = response.content[0]?.text || "";
    // Parse JSON from response (handle potential markdown fences)
    const jsonStr = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const analysis = JSON.parse(jsonStr);
    console.log(`  🧠 Vision: ${analysis.trend} — conviction ${analysis.conviction} — ${analysis.pattern}`);
    return analysis;
  } catch (err) {
    console.log(`  ⚠️ Vision analysis failed: ${err.message}`);
    return null;
  }
}

/**
 * Adjust conviction based on analysis
 */
async function adjustConviction(symbol, analysis, adjustScores) {
  if (!adjustScores || !analysis) return { action: "skipped" };

  const { trend, conviction, direction, reasoning } = analysis;

  if (trend === "bullish" && conviction > 0.3) {
    const result = await addConviction(symbol, conviction, `[Chart Analysis] ${reasoning}`, { source: "chart-analyzer" });
    console.log(`  📈 Added conviction ${conviction} for ${symbol}`);
    return { action: "added", conviction, result };
  } else if (trend === "bearish") {
    const result = await removeConviction(symbol);
    console.log(`  📉 Removed conviction for ${symbol} (bearish chart)`);
    return { action: "removed", result };
  }

  console.log(`  ➖ No conviction change for ${symbol} (${trend})`);
  return { action: "none", trend };
}

/**
 * Main execution
 */
export async function execute(inputs = {}) {
  const {
    count = 5,
    symbols: symbolsStr,
    headless = true,
    adjustScores = true
  } = inputs;

  // Determine which tickers to analyze
  let tickers;
  if (symbolsStr) {
    const syms = symbolsStr.split(",").map(s => s.trim().toUpperCase());
    tickers = syms.map(s => ({ symbol: s, effectiveScore: null }));
  } else {
    tickers = getTopTickers(count);
    if (tickers.length === 0) {
      return { success: false, error: "No tickers found in cache. Run the trading server first." };
    }
  }

  console.log(`\n🔬 Chart Analyzer — analyzing ${tickers.length} tickers`);
  console.log(`   Tickers: ${tickers.map(t => t.symbol).join(", ")}`);
  console.log(`   Headless: ${headless} | Adjust scores: ${adjustScores}\n`);

  // Create output directory
  const dateStr = new Date().toISOString().slice(0, 10);
  const outputDir = path.join(DATA_DIR, "chart-analyses", dateStr);
  fs.mkdirSync(outputDir, { recursive: true });

  // Launch browser
  const { context, tempProfileDir } = await launchBrowser(headless);
  const page = await context.newPage();

  const results = [];

  for (const ticker of tickers) {
    const sym = ticker.symbol;
    console.log(`\n━━━ ${sym} (score: ${ticker.effectiveScore?.toFixed(2) || "N/A"}) ━━━`);

    const analysis = { symbol: sym, currentScore: ticker.effectiveScore };

    // 1. Chart screenshot
    const chartPath = await captureChart(page, sym, outputDir);
    analysis.chartPath = chartPath;

    // 2. Financials
    analysis.financials = await scrapeFinancials(page, sym);

    // 3. Technicals
    analysis.technicals = await scrapeTechnicals(page, sym);

    // 4. Vision analysis (only if we got a chart screenshot)
    if (chartPath) {
      analysis.vision = await analyzeWithVision(chartPath, sym, analysis.financials, analysis.technicals, ticker.effectiveScore);
    }

    // 5. Adjust convictions
    analysis.convictionAction = await adjustConviction(sym, analysis.vision, adjustScores);

    // 6. Save per-ticker JSON
    const jsonPath = path.join(outputDir, `${sym}.json`);
    const saveData = { ...analysis, analyzedAt: new Date().toISOString() };
    delete saveData.financials?._rawExcerpt;
    delete saveData.technicals?._rawExcerpt;
    fs.writeFileSync(jsonPath, JSON.stringify(saveData, null, 2));

    results.push(saveData);
  }

  // Cleanup
  await context.close();
  if (tempProfileDir) {
    try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch {}
  }

  // Summary
  const summary = results.map(r => ({
    symbol: r.symbol,
    score: r.currentScore?.toFixed(2),
    trend: r.vision?.trend || "unknown",
    conviction: r.vision?.conviction || 0,
    pattern: r.vision?.pattern || "N/A",
    action: r.convictionAction?.action || "skipped"
  }));

  console.log(`\n━━━ Summary ━━━`);
  for (const s of summary) {
    console.log(`  ${s.symbol}: ${s.trend} (${s.conviction}) — ${s.pattern} → ${s.action}`);
  }
  console.log(`\nResults saved to: ${outputDir}`);

  return {
    success: true,
    outputDir,
    analyzed: results.length,
    summary,
    results
  };
}

export default { metadata, execute };

// CLI entry point
const isMainModule = process.argv[1]?.replace(/\\/g, "/").includes("chart-analyzer");
if (isMainModule) {
  const args = process.argv.slice(2);
  const getArg = (name, def) => {
    const a = args.find(a => a.startsWith(`--${name}`));
    if (!a) return def;
    const val = a.split("=")[1];
    return val === "true" ? true : val === "false" ? false : isNaN(val) ? val : Number(val);
  };

  execute({
    count: getArg("count", 5),
    symbols: getArg("symbols", undefined),
    headless: getArg("headless", true),
    adjustScores: getArg("adjustScores", true),
  })
    .then(r => { console.log("\nDone:", JSON.stringify(r.summary, null, 2)); process.exit(0); })
    .catch(e => { console.error("Failed:", e.message); process.exit(1); });
}
