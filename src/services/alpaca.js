// Use native fetch (Node 18+)
import fs from "fs";
import path from "path";

const buildHeaders = (config) => ({
  "APCA-API-KEY-ID": config.key,
  "APCA-API-SECRET-KEY": config.secret
});

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json();
};

/**
 * Load config from config file
 */
const loadFullConfigFile = () => {
  try {
    const configPath = path.join(process.cwd(), "data", "alpaca-config.json");
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch (error) {
    // Silently fail
  }
  return {};
};

/**
 * Load keys from config file as fallback
 */
const loadKeysFromConfigFile = () => {
  try {
    const config = loadFullConfigFile();
    // Check if keys are real (not placeholders)
    const key = config.apiKey && !config.apiKey.includes("PASTE") ? config.apiKey : null;
    const secret = config.apiSecret && !config.apiSecret.includes("PASTE") ? config.apiSecret : null;
    const mode = config.mode || "paper";
    return { key, secret, mode };
  } catch (error) {
    // Silently fail
  }
  return { key: null, secret: null, mode: "paper" };
};

/**
 * Get trading strategy and risk settings
 * Returns: { strategy: "swing"|"options", risk: "conservative"|"risky" }
 */
export const getTradingSettings = () => {
  const config = loadFullConfigFile();
  return {
    strategy: config.strategy || "swing",
    risk: config.risk || "conservative"
  };
};

export const getAlpacaConfig = () => {
  // Always load config file to get mode setting
  const fileConfig = loadKeysFromConfigFile();

  // Use env vars for keys if available, otherwise use config file
  const key = process.env.ALPACA_KEY || fileConfig.key;
  const secret = process.env.ALPACA_SECRET || fileConfig.secret;

  // Mode comes from config file (user's preference)
  const mode = fileConfig.mode || "paper";

  // Determine base URL based on mode
  const baseUrl = mode === "live"
    ? "https://api.alpaca.markets"
    : "https://paper-api.alpaca.markets";
  const dataUrl = process.env.ALPACA_DATA_URL || "https://data.alpaca.markets";

  return {
    key,
    secret,
    baseUrl,
    dataUrl,
    mode,
    ready: Boolean(key && secret)
  };
};

export const fetchAccount = async (config) => {
  return fetchJson(`${config.baseUrl}/v2/account`, {
    headers: buildHeaders(config)
  });
};

export const fetchPositions = async (config) => {
  return fetchJson(`${config.baseUrl}/v2/positions`, {
    headers: buildHeaders(config)
  });
};

export const fetchLatestQuotes = async (config, symbols) => {
  if (!symbols || symbols.length === 0) {
    return {};
  }

  // Use bars to calculate daily change (compare last 2 days)
  const joined = symbols.join(",");
  const url = `${config.dataUrl}/v2/stocks/bars?timeframe=1Day&limit=2&symbols=${joined}&feed=iex`;
  const payload = await fetchJson(url, { headers: buildHeaders(config) });
  const bars = payload.bars || {};

  return Object.entries(bars).reduce((acc, [symbol, symbolBars]) => {
    if (!symbolBars || symbolBars.length < 2) {
      acc[symbol] = 0;
      return acc;
    }

    // Get yesterday's close and today's close (or latest)
    const previousClose = symbolBars[symbolBars.length - 2]?.c;
    const currentClose = symbolBars[symbolBars.length - 1]?.c;

    const change = previousClose && currentClose
      ? ((currentClose - previousClose) / previousClose) * 100
      : 0;
    acc[symbol] = Number.isFinite(change) ? change : 0;
    return acc;
  }, {});
};

export const fetchLatestBars = async (config, symbols) => {
  if (!symbols || symbols.length === 0) {
    return {};
  }

  const joined = symbols.join(",");
  const url = `${config.dataUrl}/v2/stocks/bars?timeframe=1Day&limit=6&symbols=${joined}&feed=iex`;
  const payload = await fetchJson(url, { headers: buildHeaders(config) });
  return payload.bars || {};
};

/**
 * Submit an order to buy or sell a stock
 * @param {Object} config - Alpaca config with key, secret, baseUrl
 * @param {Object} order - Order details
 * @param {string} order.symbol - Stock symbol (e.g., "AAPL")
 * @param {number} order.qty - Number of shares
 * @param {string} order.side - "buy" or "sell"
 * @param {string} order.type - "market", "limit", "stop", "stop_limit"
 * @param {string} order.time_in_force - "day", "gtc", "ioc", "fok"
 * @param {number} [order.limit_price] - Limit price (required for limit orders)
 * @param {number} [order.stop_price] - Stop price (required for stop orders)
 */
export const submitOrder = async (config, order) => {
  const body = {
    symbol: order.symbol,
    qty: String(order.qty),
    side: order.side,
    type: order.type || "market",
    time_in_force: order.time_in_force || "day"
  };

  if (order.limit_price) body.limit_price = String(order.limit_price);
  if (order.stop_price) body.stop_price = String(order.stop_price);
  if (order.trail_percent) body.trail_percent = String(order.trail_percent);

  const response = await fetch(`${config.baseUrl}/v2/orders`, {
    method: "POST",
    headers: {
      ...buildHeaders(config),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let message;
    try {
      const errBody = await response.json();
      message = errBody.message || errBody.error || JSON.stringify(errBody);
    } catch {
      message = await response.text().catch(() => "");
    }
    throw new Error(message || `Order failed: ${response.status}`);
  }

  return response.json();
};

/**
 * Get all open orders
 */
export const getOrders = async (config, status = "open") => {
  return fetchJson(`${config.baseUrl}/v2/orders?status=${status}`, {
    headers: buildHeaders(config)
  });
};

/**
 * Cancel a specific order by ID
 */
export const cancelOrder = async (config, orderId) => {
  const response = await fetch(`${config.baseUrl}/v2/orders/${orderId}`, {
    method: "DELETE",
    headers: buildHeaders(config)
  });

  if (!response.ok && response.status !== 204) {
    const message = await response.text();
    throw new Error(message || `Cancel failed: ${response.status}`);
  }

  return { success: true, orderId };
};

/**
 * Cancel all open orders
 */
export const cancelAllOrders = async (config) => {
  const response = await fetch(`${config.baseUrl}/v2/orders`, {
    method: "DELETE",
    headers: buildHeaders(config)
  });

  if (!response.ok && response.status !== 204) {
    const message = await response.text();
    throw new Error(message || `Cancel all failed: ${response.status}`);
  }

  return { success: true };
};

/**
 * Close a specific position
 */
export const closePosition = async (config, symbol) => {
  const response = await fetch(`${config.baseUrl}/v2/positions/${symbol}`, {
    method: "DELETE",
    headers: buildHeaders(config)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Close position failed: ${response.status}`);
  }

  return response.json();
};

/**
 * Close all positions
 */
export const closeAllPositions = async (config) => {
  const response = await fetch(`${config.baseUrl}/v2/positions`, {
    method: "DELETE",
    headers: buildHeaders(config)
  });

  if (!response.ok && response.status !== 204) {
    const message = await response.text();
    throw new Error(message || `Close all failed: ${response.status}`);
  }

  return { success: true };
};

/**
 * Get asset info from Alpaca — validates if a ticker symbol exists and is tradeable
 * @param {Object} config - Alpaca config
 * @param {string} symbol - Ticker symbol (e.g., "AAPL")
 * @returns {{ tradable: boolean, symbol: string, name: string, exchange: string, status: string } | null}
 */
export const getAsset = async (config, symbol) => {
  try {
    const response = await fetch(`${config.baseUrl}/v2/assets/${encodeURIComponent(symbol)}`, {
      headers: buildHeaders(config)
    });
    if (response.status === 404) {
      // Definitively not found — truly invalid
      return null;
    }
    if (!response.ok) {
      // Rate limit, server error, etc. — don't assume invalid
      return { symbol, tradable: true, _uncertain: true };
    }
    const data = await response.json();
    return {
      symbol: data.symbol,
      name: data.name,
      exchange: data.exchange,
      status: data.status,
      tradable: data.tradable === true,
      shortable: data.shortable === true,
      fractionable: data.fractionable === true,
      assetClass: data.class
    };
  } catch {
    // Network error — don't assume invalid
    return { symbol, tradable: true, _uncertain: true };
  }
};

/**
 * Validate a list of ticker symbols against Alpaca's asset database.
 * Returns { valid: string[], invalid: string[], results: Map<string, asset|null> }
 *
 * Batches requests with concurrency limit to avoid rate limits.
 * @param {Object} config - Alpaca config
 * @param {string[]} symbols - Array of ticker symbols to validate
 * @param {{ tradeableOnly?: boolean, concurrency?: number }} options
 */
export const validateTickers = async (config, symbols, options = {}) => {
  const { tradeableOnly = true, concurrency = 10 } = options;
  const valid = [];
  const invalid = [];
  const results = new Map();

  // Process in batches to respect rate limits
  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const promises = batch.map(async (symbol) => {
      const asset = await getAsset(config, symbol);
      if (asset && (!tradeableOnly || asset.tradable)) {
        valid.push(symbol);
        results.set(symbol, asset);
      } else {
        invalid.push(symbol);
        results.set(symbol, null);
      }
    });
    await Promise.all(promises);

    // Small delay between batches to be polite to the API
    if (i + concurrency < symbols.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return { valid, invalid, results };
};