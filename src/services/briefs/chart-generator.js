/**
 * Chart Generator Service
 *
 * Generates chart PNGs via QuickChart.io POST API and uploads them
 * to Firebase Storage for use as WhatsApp media attachments.
 *
 * Charts:
 * - Portfolio equity over time (line)
 * - Ticker scores (horizontal bar)
 * - Life dimension scores (radar)
 */

import { uploadBuffer } from "../firebase/firebase-storage.js";

const QUICKCHART_URL = "https://quickchart.io/chart";

/**
 * POST a chart config to QuickChart.io and return the PNG buffer.
 */
async function renderChart(chartConfig, width = 600, height = 400) {
  const body = {
    chart: chartConfig,
    width,
    height,
    backgroundColor: "#ffffff",
    format: "png"
  };

  const res = await fetch(QUICKCHART_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`QuickChart failed (${res.status}): ${await res.text()}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Upload a chart PNG to Firebase Storage and return its public URL.
 */
async function uploadChart(buffer, type) {
  const date = new Date().toISOString().split("T")[0];
  const remotePath = `backbone/charts/${type}-${date}.png`;

  const result = await uploadBuffer(buffer, remotePath, "image/png");
  return result.downloadUrl;
}

/**
 * Generate a portfolio equity line chart over the last 8 weeks.
 *
 * @param {Array} tradingHistory - Array of { date, equity } entries
 * @returns {{ success: boolean, url?: string }}
 */
export async function generatePortfolioChart(tradingHistory) {
  try {
    // Build data from trading history or use sample data
    let labels = [];
    let data = [];

    if (tradingHistory && tradingHistory.length > 0) {
      // Take last 56 days (8 weeks), sampled weekly
      const sorted = [...tradingHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
      const recent = sorted.slice(-56);

      // Sample every 7 days
      for (let i = 0; i < recent.length; i += 7) {
        const entry = recent[i];
        const d = new Date(entry.date);
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        data.push(parseFloat(entry.equity) || 0);
      }
      // Always include the latest point
      const last = recent[recent.length - 1];
      const lastLabel = `${new Date(last.date).getMonth() + 1}/${new Date(last.date).getDate()}`;
      if (labels[labels.length - 1] !== lastLabel) {
        labels.push(lastLabel);
        data.push(parseFloat(last.equity) || 0);
      }
    } else {
      // Fallback: try alpaca-cache for current equity as a single data point
      try {
        const fs = await import("fs");
        const { dataFile } = await import("./paths.js");
        const cachePath = dataFile("alpaca-cache.json");
        if (fs.default.existsSync(cachePath)) {
          const cache = JSON.parse(fs.default.readFileSync(cachePath, "utf-8"));
          if (cache.account?.equity) {
            const today = new Date();
            labels = [`${today.getMonth() + 1}/${today.getDate()}`];
            data = [parseFloat(cache.account.equity)];
          }
        }
      } catch { /* ignore */ }
    }

    if (data.length === 0) {
      return { success: false };
    }

    const chartConfig = {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Portfolio Equity ($)",
          data,
          fill: true,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34, 197, 94, 0.15)",
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: "#22c55e",
          tension: 0.3
        }]
      },
      options: {
        plugins: {
          title: { display: true, text: "Portfolio Equity — 8 Weeks", font: { size: 16 } },
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: { callback: (v) => "$" + v.toLocaleString() }
          }
        }
      }
    };

    const buffer = await renderChart(chartConfig);
    const url = await uploadChart(buffer, "portfolio");
    return { success: true, url };

  } catch (error) {
    console.error("[ChartGen] Portfolio chart failed:", error.message);
    return { success: false };
  }
}

/**
 * Generate a ticker scores bar chart (top 10 tickers).
 *
 * @param {Array} tickers - Array of { symbol, score } from tickers-cache
 * @returns {{ success: boolean, url?: string }}
 */
export async function generateTickerScoresChart(tickers) {
  try {
    let tickerData = tickers;

    if (!tickerData || tickerData.length === 0) {
      // Load from cache
      try {
        const fs = await import("fs");
        const { dataFile } = await import("./paths.js");
        const cachePath = dataFile("tickers-cache.json");
        if (fs.default.existsSync(cachePath)) {
          const cache = JSON.parse(fs.default.readFileSync(cachePath, "utf-8"));
          tickerData = cache.tickers || [];
        }
      } catch { /* ignore */ }
    }

    if (!tickerData || tickerData.length === 0) {
      return { success: false };
    }

    // Sort by score descending, take top 10
    const top = [...tickerData]
      .filter(t => t.score != null)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 10);

    if (top.length === 0) return { success: false };

    const labels = top.map(t => t.symbol);
    const scores = top.map(t => t.score || 0);
    const colors = scores.map(s => s >= 8 ? "#22c55e" : s >= 5 ? "#f59e0b" : "#ef4444");

    const chartConfig = {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Score",
          data: scores,
          backgroundColor: colors,
          borderWidth: 0
        }]
      },
      options: {
        indexAxis: "y",
        plugins: {
          title: { display: true, text: "Top Ticker Scores", font: { size: 16 } },
          legend: { display: false }
        },
        scales: {
          x: { min: 0, max: 10, ticks: { stepSize: 2 } }
        }
      }
    };

    const buffer = await renderChart(chartConfig, 600, 350);
    const url = await uploadChart(buffer, "ticker-scores");
    return { success: true, url };

  } catch (error) {
    console.error("[ChartGen] Ticker scores chart failed:", error.message);
    return { success: false };
  }
}

/**
 * Generate a life dimensions radar chart.
 *
 * @param {Object} lifeScores - { health: 75, wealth: 60, ... }
 * @returns {{ success: boolean, url?: string }}
 */
export async function generateLifeScoresChart(lifeScores) {
  try {
    let scores = lifeScores;

    if (!scores) {
      try {
        const fs = await import("fs");
        const { dataFile } = await import("./paths.js");
        const scoresPath = dataFile("life-scores.json");
        if (fs.default.existsSync(scoresPath)) {
          scores = JSON.parse(fs.default.readFileSync(scoresPath, "utf-8"));
        }
      } catch { /* ignore */ }
    }

    if (!scores) return { success: false };

    // Extract dimension names and values
    const dimensions = scores.categories || scores;
    const labels = Object.keys(dimensions);
    const data = Object.values(dimensions).map(v =>
      typeof v === "object" ? (v.score || v.value || 0) : (v || 0)
    );

    if (labels.length === 0) return { success: false };

    const chartConfig = {
      type: "radar",
      data: {
        labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
        datasets: [{
          label: "Life Score",
          data,
          fill: true,
          borderColor: "#6366f1",
          backgroundColor: "rgba(99, 102, 241, 0.2)",
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: "#6366f1"
        }]
      },
      options: {
        plugins: {
          title: { display: true, text: "Life Dimensions", font: { size: 16 } },
          legend: { display: false }
        },
        scales: {
          r: { min: 0, max: 100, ticks: { stepSize: 25 } }
        }
      }
    };

    const buffer = await renderChart(chartConfig, 500, 500);
    const url = await uploadChart(buffer, "life-scores");
    return { success: true, url };

  } catch (error) {
    console.error("[ChartGen] Life scores chart failed:", error.message);
    return { success: false };
  }
}

export default {
  generatePortfolioChart,
  generateTickerScoresChart,
  generateLifeScoresChart
};
