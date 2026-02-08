/**
 * Market Brief Generator
 *
 * Generates executive-quality market intelligence briefs.
 * Pure market data - no personal information.
 *
 * Features:
 * - Recession score and market health
 * - Top signals with volume confirmation
 * - Catalyst calendar
 * - Market thesis
 * - Chart generation via QuickChart
 * - Firebase Storage for images
 * - WhatsApp delivery
 */

import fs from "fs";
import path from "path";
import https from "https";
import { getRecessionScore, getRecessionLabel, getRecessionColor } from "../trading/recession-score.js";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();

/**
 * Fetch tickers cache
 */
function getTickersData() {
  try {
    const cachePath = path.join(DATA_DIR, "tickers-cache.json");
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      return Array.isArray(data) ? data : (data.tickers || []);
    }
  } catch (e) {
    console.error("[MarketBrief] Error reading tickers:", e.message);
  }
  return [];
}

/**
 * Get SPY data
 */
function getSPYData(tickers) {
  return tickers.find(t => t.symbol === "SPY") || null;
}

/**
 * Generate score bar (ASCII)
 */
function scoreBar(score, max = 10, width = 10) {
  const filled = Math.round((score / max) * width);
  const empty = width - filled;
  return "■".repeat(filled) + "░".repeat(empty);
}

/**
 * Format price change with arrow
 */
function formatChange(change) {
  if (change == null) return "—";
  const arrow = change >= 0 ? "▲" : "▼";
  const sign = change >= 0 ? "+" : "";
  return `${arrow}${sign}${change.toFixed(1)}%`;
}

/**
 * Generate market brief text
 */
export async function generateMarketBrief() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });

  // Get data
  const tickers = getTickersData();
  const recession = getRecessionScore();
  const recessionScore = recession.score || 5;
  const marketHealth = 10 - recessionScore;
  const recessionLabel = getRecessionLabel(recessionScore);

  const spy = getSPYData(tickers);
  const spyChange = spy?.changePercent || 0;
  const spyPrice = spy?.price || 0;

  // Sort tickers by score
  const sorted = [...tickers]
    .filter(t => t.symbol && t.score != null && t.symbol !== "SPY")
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  // Categorize signals
  const extremeBuy = sorted.filter(t => t.score >= 9).slice(0, 4);
  const buyZone = sorted.filter(t => t.score >= 8 && t.score < 9).slice(0, 4);
  const caution = sorted.filter(t => t.score >= 5 && t.score < 8).slice(0, 4);

  // Build brief
  let brief = `*BACKBONE MARKET BRIEF*
_${dateStr} • ${timeStr}_

*MARKET PULSE*
`;

  brief += `Recession: ${recessionScore.toFixed(1)} ${scoreBar(recessionScore)} ${recessionLabel}
Health: ${marketHealth.toFixed(1)} ${scoreBar(marketHealth)} ${marketHealth >= 7 ? "STRONG" : marketHealth >= 4 ? "MODERATE" : "WEAK"}

SPY: $${spyPrice.toFixed(2)} ${formatChange(spyChange)}
`;

  // Extreme buy signals
  if (extremeBuy.length > 0) {
    brief += `
*EXTREME BUY (9+)*
`;
    for (const t of extremeBuy) {
      const vol = t.volumeSigma ? `${t.volumeSigma.toFixed(1)}σ` : "";
      brief += `${t.symbol} ${t.score.toFixed(1)} $${t.price?.toFixed(2) || "—"} ${formatChange(t.changePercent)} ${vol}
`;
    }
  }

  // Buy zone
  if (buyZone.length > 0) {
    brief += `
*BUY ZONE (8-9)*
`;
    for (const t of buyZone) {
      brief += `${t.symbol} ${t.score.toFixed(1)} $${t.price?.toFixed(2) || "—"} ${formatChange(t.changePercent)}
`;
    }
  }

  // Caution zone
  if (caution.length > 0) {
    brief += `
*WATCH LIST (5-8)*
`;
    for (const t of caution.slice(0, 3)) {
      brief += `${t.symbol} ${t.score.toFixed(1)} ${formatChange(t.changePercent)}
`;
    }
  }

  // Market thesis
  const bullishCount = sorted.filter(t => t.score >= 7).length;
  const bearishCount = sorted.filter(t => t.score < 4).length;
  const totalCount = sorted.length;

  let thesis = "";
  if (extremeBuy.length >= 2) {
    thesis = `${extremeBuy.length} extreme buy signals detected. Heavy selling creating opportunities in quality names. Volume confirmation suggests institutional interest.`;
  } else if (spyChange < -1) {
    thesis = `Market under pressure (SPY ${formatChange(spyChange)}). Watch for follow-through. Defensive rotation may accelerate if weakness continues.`;
  } else if (spyChange > 1) {
    thesis = `Risk-on day. Breadth ${bullishCount}/${totalCount} bullish. Momentum favors growth names.`;
  } else {
    thesis = `Mixed signals. ${bullishCount} bullish, ${bearishCount} bearish out of ${totalCount} tracked. Selective positioning recommended.`;
  }

  brief += `
*THESIS*
${thesis}

_Markets are forward-looking. Trade the setup, not the news._`;

  return {
    text: brief,
    data: {
      recessionScore,
      marketHealth,
      spyChange,
      extremeBuyCount: extremeBuy.length,
      buyZoneCount: buyZone.length,
      topTickers: extremeBuy.concat(buyZone).slice(0, 5).map(t => t.symbol)
    }
  };
}

/**
 * Generate chart for market brief
 */
export async function generateMarketChart(tickers) {
  try {
    const sorted = [...tickers]
      .filter(t => t.symbol && t.score != null)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 10);

    const labels = sorted.map(t => t.symbol);
    const scores = sorted.map(t => t.score || 0);
    const colors = scores.map(s =>
      s >= 9 ? "#22c55e" : s >= 8 ? "#4ade80" : s >= 5 ? "#eab308" : "#ef4444"
    );

    const chartConfig = {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Score",
          data: scores,
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: {
        plugins: {
          title: { display: true, text: "Top Ticker Scores", color: "#fff" },
          legend: { display: false }
        },
        scales: {
          y: { min: 0, max: 10, grid: { color: "#333" }, ticks: { color: "#999" } },
          x: { grid: { display: false }, ticks: { color: "#fff" } }
        }
      }
    };

    // POST to QuickChart
    const response = await postToQuickChart(chartConfig);
    if (response) {
      // Upload to Firebase Storage
      const { uploadBuffer, getDownloadUrl } = await import("./firebase-storage.js");
      const remotePath = `backbone/charts/market-${Date.now()}.png`;
      await uploadBuffer(response, remotePath, "image/png");
      return await getDownloadUrl(remotePath);
    }
  } catch (e) {
    console.error("[MarketBrief] Chart error:", e.message);
  }
  return null;
}

/**
 * POST to QuickChart.io
 */
function postToQuickChart(config) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      backgroundColor: "#1a1a2e",
      width: 600,
      height: 400,
      format: "png",
      chart: config
    });

    const req = https.request({
      hostname: "quickchart.io",
      port: 443,
      path: "/chart",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`QuickChart returned ${res.statusCode}`));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Send market brief via WhatsApp
 */
export async function sendMarketBrief() {
  try {
    const { text, data } = await generateMarketBrief();

    // Get phone number from phone-auth config
    const phoneAuthPath = path.join(DATA_DIR, "phone-auth.json");
    let phone = null;

    if (fs.existsSync(phoneAuthPath)) {
      const phoneData = JSON.parse(fs.readFileSync(phoneAuthPath, "utf-8"));
      // Find the first verified phone
      for (const [userId, userData] of Object.entries(phoneData)) {
        if (userData?.verification?.status === "verified" && userData?.phoneNumber) {
          phone = userData.phoneNumber;
          break;
        }
      }
    }

    if (!phone) {
      phone = process.env.USER_PHONE || process.env.TWILIO_TO_NUMBER;
    }

    if (!phone) {
      throw new Error("No verified phone number found");
    }

    // Initialize and send via Twilio
    const { getTwilioWhatsApp } = await import("./twilio-whatsapp.js");
    const whatsapp = getTwilioWhatsApp();

    // Initialize if not already done
    if (!whatsapp.initialized) {
      console.log("[MarketBrief] Initializing Twilio...");
      const initResult = await whatsapp.initialize();
      if (!initResult.success) {
        throw new Error(`Twilio init failed: ${initResult.error}`);
      }
    }

    const result = await whatsapp.sendMessage(phone, text);
    if (!result.success) {
      throw new Error(result.error);
    }

    console.log("[MarketBrief] Sent to", phone, "MessageID:", result.messageId);
    return { success: true, data, phone, messageId: result.messageId };
  } catch (e) {
    console.error("[MarketBrief] Send failed:", e.message);
    return { success: false, error: e.message };
  }
}

export default { generateMarketBrief, sendMarketBrief };
