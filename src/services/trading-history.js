/**
 * Trading History Service
 * Calculates 8-week performance, SPY comparison, and growth projections
 * Stores computed data to avoid recalculation
 */

import { getAlpacaConfig } from "./alpaca.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WEEKS_TO_SHOW = 8;
const DATA_FILE = path.join(__dirname, "../../data/trading-history.json");

/**
 * Load stored trading history from disk
 */
const loadStoredHistory = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    // Ignore errors, will recalculate
  }
  return null;
};

/**
 * Save trading history to disk
 */
const saveStoredHistory = (history) => {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(history, null, 2));
  } catch (error) {
    // Ignore save errors
  }
};

/**
 * Get the most recent Saturday (start of current week)
 * Week runs Saturday 00:00:00 to following Friday 23:59:59
 */
const getMostRecentSaturday = () => {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

  // Calculate days since last Saturday
  // If today is Saturday (6), days back = 0
  // If today is Sunday (0), days back = 1
  // If today is Monday (1), days back = 2
  // etc.
  const daysSinceSaturday = currentDay === 6 ? 0 : currentDay + 1;

  const saturday = new Date(now);
  saturday.setDate(now.getDate() - daysSinceSaturday);
  saturday.setHours(0, 0, 0, 0);

  return saturday;
};

/**
 * Get the Saturday boundaries for 8 weeks (current week + 7 past weeks)
 * Returns weeks in descending order (most recent first)
 */
const getWeekBoundaries = (weeksBack = WEEKS_TO_SHOW) => {
  const weeks = [];
  const currentWeekStart = getMostRecentSaturday();

  // Build weeks from most recent to oldest
  for (let i = 0; i < weeksBack; i++) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() - (i * 7));

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Friday
    weekEnd.setHours(23, 59, 59, 999);

    weeks.push({
      start: weekStart,
      end: weekEnd,
      startStr: weekStart.toISOString().split("T")[0],
      endStr: weekEnd.toISOString().split("T")[0],
      label: formatWeekLabel(weekStart, weekEnd)
    });
  }

  return weeks; // Already in descending order (most recent first)
};

/**
 * Format week label with fixed width (e.g., "Jan 11-17" or "Dec 28-Jan 3")
 */
const formatWeekLabel = (start, end) => {
  const startMonth = start.toLocaleDateString("en-US", { month: "short" });
  const startDay = start.getDate();
  const endMonth = end.toLocaleDateString("en-US", { month: "short" });
  const endDay = end.getDate();

  // Same month: "Jan 11-17"
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`;
  }
  // Cross month: "Dec 28-Jan 3"
  return `${startMonth} ${startDay}-${endMonth} ${endDay}`;
};

/**
 * Fetch portfolio history from Alpaca
 */
const fetchPortfolioHistory = async (config, period = "3M", timeframe = "1D") => {
  const url = `${config.baseUrl}/v2/account/portfolio/history?period=${period}&timeframe=${timeframe}`;

  const response = await fetch(url, {
    headers: {
      "APCA-API-KEY-ID": config.key,
      "APCA-API-SECRET-KEY": config.secret
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch portfolio history: ${response.status}`);
  }

  return response.json();
};

/**
 * Fetch SPY historical bars
 */
const fetchSPYHistory = async (config, startDate, endDate) => {
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  // Use IEX feed for free tier access
  const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=SPY&timeframe=1Day&start=${start}&end=${end}&feed=iex`;

  const response = await fetch(url, {
    headers: {
      "APCA-API-KEY-ID": config.key,
      "APCA-API-SECRET-KEY": config.secret
    }
  });

  if (!response.ok) {
    // If IEX fails, return empty - we'll just show portfolio data without SPY comparison
    return [];
  }

  const data = await response.json();
  return data.bars?.SPY || [];
};

/**
 * Calculate weekly P&L from portfolio history
 * For each week: find equity on Saturday (start) and Friday (end)
 */
const calculateWeeklyPnL = (portfolioHistory, weeks) => {
  const { timestamp, equity } = portfolioHistory;

  if (!timestamp || !equity || timestamp.length === 0) {
    return weeks.map(week => ({
      ...week,
      startEquity: 0,
      endEquity: 0,
      pnl: 0,
      pnlPercent: 0
    }));
  }

  // Convert timestamps to dates and create lookup
  const equityByDate = {};
  timestamp.forEach((ts, i) => {
    const date = new Date(ts * 1000).toISOString().split("T")[0];
    equityByDate[date] = equity[i];
  });

  return weeks.map(week => {
    // Find start equity - look for Saturday or nearest trading day after
    let startEquity = null;
    for (let d = new Date(week.start); d <= week.end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      if (equityByDate[dateStr] !== undefined) {
        startEquity = equityByDate[dateStr];
        break;
      }
    }

    // Find end equity - look for Friday or nearest trading day before
    let endEquity = null;
    for (let d = new Date(week.end); d >= week.start; d.setDate(d.getDate() - 1)) {
      const dateStr = d.toISOString().split("T")[0];
      if (equityByDate[dateStr] !== undefined) {
        endEquity = equityByDate[dateStr];
        break;
      }
    }

    const pnl = (startEquity && endEquity) ? endEquity - startEquity : 0;
    const pnlPercent = startEquity ? (pnl / startEquity) * 100 : 0;

    return {
      ...week,
      startEquity: startEquity || 0,
      endEquity: endEquity || 0,
      pnl,
      pnlPercent
    };
  });
};

/**
 * Calculate SPY weekly returns
 */
const calculateSPYWeeklyReturns = (spyBars, weeks) => {
  if (!spyBars || spyBars.length === 0) {
    return weeks.map(() => ({ spyReturn: 0 }));
  }

  // Create price lookup by date
  const priceByDate = {};
  spyBars.forEach(bar => {
    const date = bar.t.split("T")[0];
    priceByDate[date] = { open: bar.o, close: bar.c };
  });

  return weeks.map(week => {
    let startPrice = null;
    let endPrice = null;

    // Find start price
    for (let d = new Date(week.start); d <= week.end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      if (priceByDate[dateStr]) {
        startPrice = priceByDate[dateStr].open;
        break;
      }
    }

    // Find end price
    for (let d = new Date(week.end); d >= week.start; d.setDate(d.getDate() - 1)) {
      const dateStr = d.toISOString().split("T")[0];
      if (priceByDate[dateStr]) {
        endPrice = priceByDate[dateStr].close;
        break;
      }
    }

    const spyReturn = (startPrice && endPrice) ? ((endPrice - startPrice) / startPrice) * 100 : 0;

    return { spyReturn };
  });
};

/**
 * Calculate average weekly growth rate from 8 weeks of returns
 * Returns the average weekly percentage
 */
const calculateWeeklyGrowthRate = (weeklyData) => {
  if (weeklyData.length === 0) return 0;

  // Average all weekly returns: sum of P&L % / 8 weeks
  const totalPercent = weeklyData.reduce((sum, w) => sum + w.pnlPercent, 0);
  const averageWeeklyReturn = totalPercent / weeklyData.length;

  return averageWeeklyReturn;
};

/**
 * Calculate projected value over 1 year (221 trading days)
 * Daily rate = weekly rate / 5 trading days
 * Projection = currentEquity * (1 + dailyRate)^221
 */
const calculateProjectedValue = (currentEquity, weeklyGrowthRate) => {
  if (currentEquity <= 0) return 0;

  // Convert weekly rate to daily rate (5 trading days per week)
  const dailyRate = weeklyGrowthRate / 5;

  // Compound over 221 trading days in a year
  const projectedValue = currentEquity * Math.pow(1 + dailyRate / 100, 221);

  return projectedValue;
};

/**
 * Get next trading times (every 10 minutes during market hours)
 */
export const getNextTradingTime = () => {
  const now = new Date();
  const marketOpen = new Date(now);
  marketOpen.setHours(9, 30, 0, 0);

  const marketClose = new Date(now);
  marketClose.setHours(16, 0, 0, 0);

  const lastTrade = new Date(now);
  lastTrade.setHours(15, 57, 0, 0);

  // Check if market is open today (weekday)
  const dayOfWeek = now.getDay();
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

  if (!isWeekday) {
    // Find next Monday
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(9, 33, 0, 0); // First trade at 9:33
    return {
      time: nextMonday,
      formatted: formatTradeTime(nextMonday),
      isMarketOpen: false
    };
  }

  // Before market open
  if (now < marketOpen) {
    const firstTrade = new Date(marketOpen);
    firstTrade.setMinutes(33); // 9:33 AM
    return {
      time: firstTrade,
      formatted: formatTradeTime(firstTrade),
      isMarketOpen: false
    };
  }

  // After last trade time
  if (now > lastTrade) {
    // Next trading day
    let nextDay = new Date(now);
    nextDay.setDate(now.getDate() + 1);

    // Skip weekend
    while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
      nextDay.setDate(nextDay.getDate() + 1);
    }

    nextDay.setHours(9, 33, 0, 0);
    return {
      time: nextDay,
      formatted: formatTradeTime(nextDay),
      isMarketOpen: false
    };
  }

  // During market hours - find next 10-minute interval
  // Trading times: 9:33, 9:43, 9:53, 10:03, ... until 15:53, last at 15:57
  const minutes = now.getMinutes();
  const currentHour = now.getHours();

  // Find next trade time
  let nextTradeMinute;
  if (minutes < 3) {
    nextTradeMinute = 3;
  } else if (minutes < 13) {
    nextTradeMinute = 13;
  } else if (minutes < 23) {
    nextTradeMinute = 23;
  } else if (minutes < 33) {
    nextTradeMinute = 33;
  } else if (minutes < 43) {
    nextTradeMinute = 43;
  } else if (minutes < 53) {
    nextTradeMinute = 53;
  } else {
    nextTradeMinute = 3;
  }

  const nextTrade = new Date(now);
  if (nextTradeMinute <= minutes) {
    nextTrade.setHours(currentHour + 1);
  }
  nextTrade.setMinutes(nextTradeMinute, 0, 0);

  // Check if past last trade
  if (nextTrade > lastTrade) {
    nextTrade.setTime(lastTrade.getTime());
  }

  return {
    time: nextTrade,
    formatted: formatTradeTime(nextTrade),
    isMarketOpen: true
  };
};

const formatTradeTime = (date) => {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });

  if (isToday) {
    return timeStr;
  }

  const dayStr = date.toLocaleDateString("en-US", { weekday: "short" });
  return `${dayStr} ${timeStr}`;
};

/**
 * Format "X minutes ago" or "X hours ago"
 */
export const formatTimeAgo = (date) => {
  if (!date) return "--";

  const now = new Date();
  const diffMs = now - new Date(date);
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) {
    return "just now";
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
};

/**
 * Check if stored data is still valid (same week boundaries and correct structure)
 */
const isStoredDataValid = (stored) => {
  if (!stored || !stored.weeks || stored.weeks.length === 0) {
    return false;
  }

  // Check for required fields (growthRate, not annualGrowthRate)
  if (stored.annualGrowthRate !== undefined && stored.growthRate === undefined) {
    return false; // Old data structure
  }

  // Get current week boundaries
  const currentWeeks = getWeekBoundaries(WEEKS_TO_SHOW);

  // Check if the most recent week matches
  const storedFirstWeek = stored.weeks[0];
  const currentFirstWeek = currentWeeks[0];

  return storedFirstWeek.startStr === currentFirstWeek.startStr;
};

/**
 * Main function to get trading history data
 * Loads from storage if valid, otherwise fetches and calculates
 */
export const getTradingHistory = async () => {
  const config = getAlpacaConfig();

  if (!config.ready) {
    process.stderr.write("[Trading History] Config not ready\n");
    return null;
  }

  process.stderr.write("[Trading History] Fetching data...\n");

  // Try to load stored data first
  const stored = loadStoredHistory();
  if (isStoredDataValid(stored)) {
    return {
      ...stored,
      lastUpdated: new Date(stored.lastUpdated)
    };
  }

  try {
    const weeks = getWeekBoundaries(WEEKS_TO_SHOW);
    const startDate = weeks[weeks.length - 1].start; // Oldest week start
    const endDate = weeks[0].end; // Most recent week end

    // Fetch data in parallel
    const [portfolioHistory, spyBars] = await Promise.all([
      fetchPortfolioHistory(config, "3M", "1D"),
      fetchSPYHistory(config, startDate, endDate)
    ]);

    // Calculate weekly P&L
    const weeklyPnL = calculateWeeklyPnL(portfolioHistory, weeks);

    // Calculate SPY returns
    const spyReturns = calculateSPYWeeklyReturns(spyBars, weeks);

    // Merge data
    const weeklyData = weeklyPnL.map((week, i) => ({
      label: week.label,
      startStr: week.startStr,
      endStr: week.endStr,
      startEquity: week.startEquity,
      endEquity: week.endEquity,
      pnl: week.pnl,
      pnlPercent: week.pnlPercent,
      spyReturn: spyReturns[i]?.spyReturn || 0,
      beatSpy: week.pnlPercent > (spyReturns[i]?.spyReturn || 0)
    }));

    // Calculate totals from oldest week's start equity
    const oldestWeek = weeklyData[weeklyData.length - 1];
    const totalPnL = weeklyData.reduce((sum, w) => sum + w.pnl, 0);
    const totalPnLPercent = oldestWeek && oldestWeek.startEquity > 0
      ? (totalPnL / oldestWeek.startEquity) * 100
      : 0;

    // Calculate growth rate and projection
    const currentEquity = portfolioHistory.equity?.[portfolioHistory.equity.length - 1] || 0;
    const growthRate = calculateWeeklyGrowthRate(weeklyData);
    const projectedValue = calculateProjectedValue(currentEquity, growthRate);

    const result = {
      weeks: weeklyData,
      totalPnL,
      totalPnLPercent,
      currentEquity,
      growthRate,  // Average weekly growth rate
      projectedValue,
      lastUpdated: new Date().toISOString()
    };

    // Save to disk
    saveStoredHistory(result);

    process.stderr.write(`[Trading History] Loaded ${result.weeks.length} weeks, growth rate: ${result.growthRate.toFixed(2)}%\n`);

    return {
      ...result,
      lastUpdated: new Date(result.lastUpdated)
    };
  } catch (error) {
    process.stderr.write(`[Trading History] Error: ${error.message}\n`);
    // Return stored data if available, even if stale
    if (stored) {
      return {
        ...stored,
        lastUpdated: new Date(stored.lastUpdated)
      };
    }
    return null;
  }
};

/**
 * Force refresh trading history (bypass cache)
 */
export const refreshTradingHistory = async () => {
  // Delete stored file to force recalculation
  try {
    if (fs.existsSync(DATA_FILE)) {
      fs.unlinkSync(DATA_FILE);
    }
  } catch (error) {
    // Ignore
  }
  return getTradingHistory();
};

/**
 * Format currency - negative values use parentheses: ($500)
 */
export const formatMoney = (value) => {
  if (value === null || value === undefined) return "--";
  const absValue = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  if (value < 0) {
    return `($${absValue})`;
  }
  return `$${absValue}`;
};

/**
 * Format percent
 */
export const formatPct = (value) => {
  if (value === null || value === undefined) return "--";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
};
