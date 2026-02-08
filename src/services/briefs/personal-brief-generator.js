/**
 * Personal Status Brief Generator
 *
 * Generates executive-quality personal status briefs.
 * Includes portfolio, life scores, goals, and trajectory.
 *
 * Features:
 * - Life score dashboard
 * - Portfolio status with positions
 * - Journey to $1M visualization
 * - Health snapshot
 * - Active goals tracking
 * - Timeline with ASCII visualization
 * - WhatsApp delivery
 */

import fs from "fs";
import path from "path";
import https from "https";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();

/**
 * Load JSON file safely
 */
function loadJSON(filename) {
  try {
    const filepath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, "utf-8"));
    }
  } catch (e) {
    console.error(`[PersonalBrief] Error loading ${filename}:`, e.message);
  }
  return null;
}

/**
 * Generate progress bar (ASCII)
 */
function progressBar(current, max, width = 10) {
  const pct = Math.min(1, Math.max(0, current / max));
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Generate score bar with value
 */
function scoreBar(score, max = 100, width = 10) {
  const pct = Math.min(1, Math.max(0, score / max));
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Format currency
 */
function formatMoney(val) {
  if (val == null || isNaN(val)) return "$—";
  return "$" + Number(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format percentage
 */
function formatPct(val) {
  if (val == null || isNaN(val)) return "—";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${(val * 100).toFixed(1)}%`;
}

/**
 * Get trend arrow
 */
function trendArrow(trend) {
  if (trend === "up") return "▲";
  if (trend === "down") return "▼";
  return "→";
}

/**
 * Generate personal brief text
 */
export async function generatePersonalBrief() {
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

  // Load data
  const lifeScores = loadJSON("life-scores.json") || { overall: 0, categories: {} };
  const alpacaCache = loadJSON("alpaca-cache.json") || {};
  const goals = loadJSON("goals.json")?.goals || [];
  const ouraData = loadJSON("oura-data.json") || {};

  // Portfolio data
  const account = alpacaCache.account || {};
  const positions = alpacaCache.positions || [];
  const equity = parseFloat(account.equity) || 0;
  const cash = parseFloat(account.cash) || 0;
  const lastEquity = parseFloat(account.last_equity) || equity;
  const dayPL = equity - lastEquity;
  const dayPLPct = lastEquity > 0 ? (dayPL / lastEquity) : 0;

  // Filter real positions (not CVR)
  const realPositions = positions.filter(p =>
    p.symbol && !p.symbol.includes("CVR") && p.market_value != null
  );

  // Life scores
  const categories = lifeScores.categories || {};
  const overall = lifeScores.overall || 0;

  // Build brief
  let brief = `*BACKBONE STATUS BRIEF*
_${dateStr} • ${timeStr}_

*LIFE SCORE: ${overall}/100*
`;

  // Life categories
  const catOrder = ["finance", "health", "career", "family", "growth", "education"];
  for (const cat of catOrder) {
    const c = categories[cat] || { score: 0, trend: "stable" };
    const score = c.score || 0;
    const trend = trendArrow(c.trend);
    let extra = "";
    if (cat === "finance" && c.dayPL != null) {
      extra = c.dayPL >= 0 ? ` +${formatMoney(c.dayPL)}` : ` ${formatMoney(c.dayPL)}`;
    }
    brief += `${cat.charAt(0).toUpperCase() + cat.slice(1).padEnd(8)} ${scoreBar(score, 100)} ${String(score).padStart(2)} ${trend}${extra}
`;
  }

  // Portfolio
  brief += `
*PORTFOLIO*
Equity: ${formatMoney(equity)} | Cash: ${formatMoney(cash)}
Day P&L: ${dayPL >= 0 ? "+" : ""}${formatMoney(dayPL)} (${formatPct(dayPLPct)})
`;

  if (realPositions.length > 0) {
    brief += `
Positions:
`;
    for (const pos of realPositions) {
      const qty = parseInt(pos.qty) || 0;
      const value = parseFloat(pos.market_value) || 0;
      const pl = parseFloat(pos.unrealized_pl) || 0;
      const plPct = parseFloat(pos.unrealized_plpc) || 0;
      brief += `• ${pos.symbol}: ${qty} shares @ ${formatMoney(value)}
  P&L: ${pl >= 0 ? "+" : ""}${formatMoney(pl)} (${formatPct(plPct)})
`;
    }
  }

  // Journey to $1M
  const startValue = 1000;
  const targetValue = 1000000;
  const progress = ((equity - startValue) / (targetValue - startValue)) * 100;
  const milestonePcts = [
    { label: "$10K", value: 10000 },
    { label: "$50K", value: 50000 },
    { label: "$100K", value: 100000 },
    { label: "$1M", value: 1000000 }
  ];

  brief += `
*JOURNEY TO $1M*
Start: $1,000 → Now: ${formatMoney(equity)} → Goal: $1M

`;

  // ASCII timeline
  brief += `$1K        $10K       $100K      $1M
├──────────┼──────────┼──────────┤
`;

  const journeyWidth = 32;
  const journeyPct = Math.min(1, (equity - startValue) / (targetValue - startValue));
  const journeyFilled = Math.max(1, Math.round(journeyPct * journeyWidth));
  brief += "█".repeat(journeyFilled) + "░".repeat(journeyWidth - journeyFilled) + `
↑ YOU ARE HERE (+${((equity / startValue - 1) * 100).toFixed(1)}%)
`;

  // Milestones
  brief += `
Milestones:
`;
  for (const m of milestonePcts) {
    const pct = Math.min(100, (equity / m.value) * 100);
    brief += `${m.label.padEnd(6)} ${progressBar(pct, 100, 15)} ${pct.toFixed(1)}%
`;
  }

  // Health snapshot
  const latestOura = ouraData.latest || ouraData.history?.[ouraData.history?.length - 1] || {};
  const sleepData = latestOura.sleep || [];
  const lastSleep = sleepData[sleepData.length - 1];

  brief += `
*HEALTH*
`;
  if (lastSleep) {
    brief += `Sleep: ${lastSleep.score} (${lastSleep.day})
`;
    if (sleepData.length > 1) {
      brief += `Trend: `;
      for (const s of sleepData.slice(-7)) {
        brief += `${s.score} `;
      }
      brief += `
`;
    }
  } else {
    brief += `⚠ Oura data not available
`;
  }

  // Active goals
  const activeGoals = goals.filter(g => g.status === "active" || g.status === "in_progress").slice(0, 5);
  const completedRecent = goals.filter(g => g.status === "completed").slice(0, 3);

  if (activeGoals.length > 0 || completedRecent.length > 0) {
    brief += `
*GOALS*
`;
    for (const g of completedRecent.slice(0, 2)) {
      brief += `✓ ${g.title.slice(0, 50)}${g.title.length > 50 ? "..." : ""}
`;
    }
    for (const g of activeGoals.slice(0, 3)) {
      brief += `○ ${g.title.slice(0, 50)}${g.title.length > 50 ? "..." : ""}
`;
    }
  }

  // Trajectory / direction
  const monthsToTarget = 17; // July 2027
  const requiredCAGR = Math.pow(targetValue / equity, 12 / monthsToTarget) - 1;

  brief += `
*TRAJECTORY*
Target: July 2027 (${monthsToTarget} months)
Required growth: ${(requiredCAGR * 100).toFixed(0)}% CAGR

`;

  // Closing message
  let closing = "";
  if (dayPL < 0) {
    closing = "Red day. Stay disciplined. Trust the process.";
  } else if (dayPL > 50) {
    closing = "Strong day. Lock in gains where appropriate.";
  } else {
    closing = "Steady progress. Small wins compound.";
  }

  brief += `_${closing}_`;

  return {
    text: brief,
    data: {
      equity,
      dayPL,
      overall,
      positions: realPositions.length,
      activeGoals: activeGoals.length
    }
  };
}

/**
 * Generate portfolio chart
 */
export async function generatePortfolioChart() {
  try {
    // For now, create a simple equity display
    // In production, this would pull historical data
    const alpacaCache = loadJSON("alpaca-cache.json") || {};
    const equity = parseFloat(alpacaCache.account?.equity) || 1000;

    const chartConfig = {
      type: "doughnut",
      data: {
        labels: ["Current", "To $10K"],
        datasets: [{
          data: [equity, Math.max(0, 10000 - equity)],
          backgroundColor: ["#22c55e", "#1f2937"],
          borderWidth: 0
        }]
      },
      options: {
        plugins: {
          title: { display: true, text: `Portfolio: $${equity.toFixed(0)}`, color: "#fff", font: { size: 18 } },
          legend: { display: true, position: "bottom", labels: { color: "#999" } }
        }
      }
    };

    const response = await postToQuickChart(chartConfig);
    if (response) {
      const { uploadBuffer, getDownloadUrl } = await import("./firebase-storage.js");
      const remotePath = `backbone/charts/portfolio-${Date.now()}.png`;
      await uploadBuffer(response, remotePath, "image/png");
      return await getDownloadUrl(remotePath);
    }
  } catch (e) {
    console.error("[PersonalBrief] Chart error:", e.message);
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
      width: 500,
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
 * Send personal brief via WhatsApp
 */
export async function sendPersonalBrief() {
  try {
    const { text, data } = await generatePersonalBrief();

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
      console.log("[PersonalBrief] Initializing Twilio...");
      const initResult = await whatsapp.initialize();
      if (!initResult.success) {
        throw new Error(`Twilio init failed: ${initResult.error}`);
      }
    }

    const result = await whatsapp.sendMessage(phone, text);
    if (!result.success) {
      throw new Error(result.error);
    }

    console.log("[PersonalBrief] Sent to", phone, "MessageID:", result.messageId);
    return { success: true, data, phone, messageId: result.messageId };
  } catch (e) {
    console.error("[PersonalBrief] Send failed:", e.message);
    return { success: false, error: e.message };
  }
}

export default { generatePersonalBrief, sendPersonalBrief };
