/**
 * SEC EDGAR K-8 Filing Service
 * Fetches 8-K filings for AI/Tech/Biotech companies in risky mode
 *
 * API: https://www.sec.gov/cgi-bin/browse-edgar
 * Rate limit: 10 requests per second (be respectful)
 */

import fs from "fs";
import path from "path";

import { dataFile } from "../paths.js";
const SEC_API_BASE = "https://data.sec.gov";
const SEC_SEARCH_BASE = "https://efts.sec.gov/LATEST/search-index";
const CACHE_FILE = dataFile("edgar-k8-cache.json");
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// AI/Tech/Biotech tickers to monitor for K-8 filings
const RISKY_TICKERS = [
  // AI & Tech
  "NVDA", "AMD", "INTC", "MSFT", "GOOGL", "META", "AMZN", "AAPL",
  "CRM", "PLTR", "AI", "PATH", "SNOW", "DDOG", "MDB",
  // Semiconductors
  "AVGO", "QCOM", "TSM", "ASML", "LRCX", "AMAT", "KLAC",
  // Biotech
  "MRNA", "BNTX", "REGN", "VRTX", "GILD", "BIIB", "ILMN",
  "CRSP", "EDIT", "NTLA", "BEAM",
  // Fintech
  "COIN", "SQ", "PYPL", "AFRM", "UPST", "SOFI",
  // Clean Energy
  "TSLA", "ENPH", "SEDG", "RUN", "FSLR"
];

// CIK mapping for common tickers (SEC uses CIK numbers)
const CIK_MAP = {
  "NVDA": "1045810",
  "AMD": "2488",
  "MSFT": "789019",
  "GOOGL": "1652044",
  "META": "1326801",
  "AMZN": "1018724",
  "AAPL": "320193",
  "TSLA": "1318605",
  "COIN": "1679788",
  "MRNA": "1682852",
  "PLTR": "1321655"
};

/**
 * Load cache from disk
 */
const loadCache = () => {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
      if (Date.now() - data.timestamp < CACHE_DURATION_MS) {
        return data.filings;
      }
    }
  } catch (error) {
    console.error("Error loading Edgar cache:", error.message);
  }
  return null;
};

/**
 * Save cache to disk
 */
const saveCache = (filings) => {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      timestamp: Date.now(),
      filings
    }, null, 2));
  } catch (error) {
    console.error("Error saving Edgar cache:", error.message);
  }
};

/**
 * Fetch recent 8-K filings for a ticker
 */
export const fetchK8Filings = async (ticker, limit = 5) => {
  const cik = CIK_MAP[ticker];
  if (!cik) {
    // Try to fetch without CIK mapping
    return [];
  }

  try {
    // SEC EDGAR API endpoint for company filings
    const url = `${SEC_API_BASE}/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=8-K&dateb=&owner=include&count=${limit}&output=json`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "BACKBONE-Trading-App/1.0 (educational@example.com)",
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const filings = data.filings?.recent || [];

    return filings.slice(0, limit).map(filing => ({
      ticker,
      type: filing.form || "8-K",
      date: filing.filingDate,
      description: filing.primaryDocument || "SEC Filing",
      url: `https://www.sec.gov/Archives/edgar/data/${cik}/${filing.accessionNumber?.replace(/-/g, "")}/${filing.primaryDocument}`
    }));
  } catch (error) {
    console.error(`Error fetching K-8 for ${ticker}:`, error.message);
    return [];
  }
};

/**
 * Fetch all recent 8-K filings for risky tickers
 */
export const fetchAllRiskyK8Filings = async () => {
  // Check cache first
  const cached = loadCache();
  if (cached) {
    return cached;
  }

  const allFilings = [];
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Fetch with rate limiting (10 req/sec = 100ms between requests)
  for (const ticker of RISKY_TICKERS.slice(0, 20)) { // Limit to 20 for performance
    try {
      const filings = await fetchK8Filings(ticker, 3);
      allFilings.push(...filings);
      await delay(150); // Rate limit
    } catch (error) {
      console.error(`Error fetching ${ticker}:`, error.message);
    }
  }

  // Sort by date (most recent first)
  allFilings.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Cache results
  saveCache(allFilings);

  return allFilings;
};

/**
 * Get tickers with recent significant 8-K filings
 * Significant: Filed within last 7 days
 */
export const getSignificantK8Tickers = async () => {
  const filings = await fetchAllRiskyK8Filings();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentFilings = filings.filter(f => new Date(f.date) >= sevenDaysAgo);

  // Get unique tickers with recent filings
  const tickersWithFilings = [...new Set(recentFilings.map(f => f.ticker))];

  return {
    tickers: tickersWithFilings,
    filings: recentFilings,
    lastUpdated: new Date().toISOString()
  };
};

/**
 * Check if risky mode should add a ticker
 * Returns true if ticker has recent 8-K filing
 */
export const shouldIncludeRiskyTicker = async (ticker) => {
  const { tickers } = await getSignificantK8Tickers();
  return tickers.includes(ticker);
};

/**
 * Get risky ticker list (static + dynamic from K-8)
 */
export const getRiskyTickers = async (includeK8 = true) => {
  const baseTickers = [...RISKY_TICKERS];

  if (includeK8) {
    try {
      const { tickers: k8Tickers } = await getSignificantK8Tickers();
      // Add K-8 tickers that aren't already in the list
      k8Tickers.forEach(t => {
        if (!baseTickers.includes(t)) {
          baseTickers.push(t);
        }
      });
    } catch (error) {
      console.error("Error getting K-8 tickers:", error.message);
    }
  }

  return baseTickers;
};

/**
 * Format K-8 filing for display
 */
export const formatK8Display = (filings, limit = 5) => {
  if (!filings || filings.length === 0) {
    return "No recent 8-K filings found.";
  }

  const lines = ["Recent SEC 8-K Filings:", "═".repeat(40)];

  filings.slice(0, limit).forEach(f => {
    lines.push(`${f.ticker.padEnd(6)} ${f.date}  ${f.description?.slice(0, 30) || "8-K Filing"}`);
  });

  return lines.join("\n");
};

export {
  RISKY_TICKERS,
  CIK_MAP
};

export default {
  fetchK8Filings,
  fetchAllRiskyK8Filings,
  getSignificantK8Tickers,
  shouldIncludeRiskyTicker,
  getRiskyTickers,
  formatK8Display,
  RISKY_TICKERS
};
