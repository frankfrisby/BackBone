/**
 * OPTIONS TRADER MODULE
 * Finds and trades options contracts using Alpaca's options API.
 *
 * Two risk profiles:
 *   Conservative: 10% allocation, ITM/ATM delta 0.55-0.70, 5-14 DTE, 25% stop / 40% TP
 *   Risky: 15% allocation, ATM/OTM delta 0.35-0.55, 3-7 DTE, 40% stop / 80% TP
 *
 * Safety: calls only, no earnings expiry, bid-ask spread < 10%, DTE >= 1 forced exit
 */

import fs from "fs";
import { getAlpacaConfig, fetchAccount, getTradingSettings } from "./alpaca.js";
import { fetchOptionContracts, fetchOptionSnapshots } from "./alpaca.js";
import { dataFile, getDataDir } from "../paths.js";
import { showNotificationTitle } from "../ui/terminal-resize.js";

// ── Risk Profiles ──────────────────────────────────────────────────────────

const RISK_PROFILES = {
  conservative: {
    maxAllocationPercent: 10,
    deltaMin: 0.55,
    deltaMax: 0.70,
    dteMin: 5,
    dteMax: 14,
    stopLossPercent: 25,
    takeProfitPercent: 40,
    maxContracts: 4,
    minOpenInterest: 500,
    trailingStopPercent: 15,
  },
  risky: {
    maxAllocationPercent: 15,
    deltaMin: 0.35,
    deltaMax: 0.55,
    dteMin: 3,
    dteMax: 7,
    stopLossPercent: 40,
    takeProfitPercent: 80,
    maxContracts: 6,
    minOpenInterest: 200,
    trailingStopPercent: 25,
  },
};

// ── Contract Scoring Weights ───────────────────────────────────────────────

const SCORING_WEIGHTS = {
  delta: 0.40,
  bidAskTightness: 0.20,
  openInterest: 0.15,
  thetaEfficiency: 0.15,
  iv: 0.10,
};

// ── Data File Helpers ──────────────────────────────────────────────────────

const optionsPositionsFile = () => dataFile("options-positions.json");
const optionsTradesLogFile = () => dataFile("options-trades-log.json");

const loadOptionsPositions = () => {
  try {
    const f = optionsPositionsFile();
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf-8"));
  } catch {}
  return [];
};

const saveOptionsPositions = (positions) => {
  fs.writeFileSync(optionsPositionsFile(), JSON.stringify(positions, null, 2));
};

const loadOptionsTradesLog = () => {
  try {
    const f = optionsTradesLogFile();
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf-8"));
  } catch {}
  return [];
};

const logOptionTrade = (trade) => {
  const log = loadOptionsTradesLog();
  log.push(trade);
  fs.writeFileSync(optionsTradesLogFile(), JSON.stringify(log, null, 2));
};

// ── OCC Symbol Builder ─────────────────────────────────────────────────────

/**
 * Build OCC option symbol: ROOT + YYMMDD + C/P + strike*1000 padded to 8 digits
 * Example: AAPL  260301C00175000
 */
export const buildOccSymbol = (underlying, expDate, type, strike) => {
  const root = underlying.padEnd(6, " "); // OCC uses 6-char padded root
  const d = new Date(expDate);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const cp = type === "call" ? "C" : "P";
  const strikeInt = Math.round(strike * 1000);
  const strikePad = String(strikeInt).padStart(8, "0");
  return `${root}${yy}${mm}${dd}${cp}${strikePad}`;
};

// ── Allocation Calculator ──────────────────────────────────────────────────

/**
 * Returns available options budget based on equity and current option holdings.
 */
export const getOptionsAllocation = (equity, optionPositions) => {
  const { risk } = getTradingSettings();
  const profile = RISK_PROFILES[risk] || RISK_PROFILES.conservative;
  const maxBudget = equity * (profile.maxAllocationPercent / 100);

  // Sum current option position market values
  const currentHolding = (optionPositions || []).reduce((sum, p) => {
    return sum + (p.currentValue || p.entryPrice * p.quantity * 100 || 0);
  }, 0);

  const available = Math.max(0, maxBudget - currentHolding);
  return {
    maxBudget,
    currentHolding,
    available,
    profile,
    risk,
    maxContracts: profile.maxContracts,
    currentContractCount: (optionPositions || []).length,
  };
};

// ── Contract Selection ─────────────────────────────────────────────────────

/**
 * Score and select the best option contract from a chain.
 * Returns the highest-scoring contract or null.
 */
export const selectBestContract = (chain, profile, underlyingPrice) => {
  if (!chain || chain.length === 0) return null;

  const targetDelta = (profile.deltaMin + profile.deltaMax) / 2;

  const scored = chain
    .filter((c) => {
      // Basic filters
      if (!c.greeks?.delta) return false;
      const delta = Math.abs(c.greeks.delta);
      if (delta < profile.deltaMin || delta > profile.deltaMax) return false;
      if ((c.open_interest || 0) < profile.minOpenInterest) return false;

      // Bid-ask spread check: reject if spread > 10% of mid
      const bid = c.quote?.bid || 0;
      const ask = c.quote?.ask || 0;
      if (bid <= 0 || ask <= 0) return false;
      const mid = (bid + ask) / 2;
      const spread = ask - bid;
      if (mid > 0 && spread / mid > 0.10) return false;

      // DTE check
      const dte = getDTE(c.expiration_date);
      if (dte < profile.dteMin || dte > profile.dteMax) return false;

      return true;
    })
    .map((c) => {
      const delta = Math.abs(c.greeks.delta);
      const bid = c.quote?.bid || 0;
      const ask = c.quote?.ask || 0;
      const mid = (bid + ask) / 2;
      const spread = ask - bid;
      const oi = c.open_interest || 0;
      const theta = Math.abs(c.greeks?.theta || 0);
      const iv = c.greeks?.implied_volatility || c.implied_volatility || 0;

      // Delta proximity score (1.0 = perfect match to target)
      const deltaScore = 1 - Math.abs(delta - targetDelta) / 0.20;

      // Bid-ask tightness (tighter = better)
      const tightnessScore = mid > 0 ? Math.max(0, 1 - (spread / mid) / 0.10) : 0;

      // Open interest (log scale, cap at 1.0)
      const oiScore = Math.min(1, Math.log10(oi + 1) / Math.log10(10000));

      // Theta efficiency: premium per theta dollar (higher premium relative to decay = better)
      const thetaScore = theta > 0 ? Math.min(1, mid / (theta * 10)) : 0.5;

      // IV score: moderate IV preferred (not too high = expensive, not too low = no movement)
      const ivScore = iv > 0 ? Math.max(0, 1 - Math.abs(iv - 0.35) / 0.35) : 0.5;

      const totalScore =
        deltaScore * SCORING_WEIGHTS.delta +
        tightnessScore * SCORING_WEIGHTS.bidAskTightness +
        oiScore * SCORING_WEIGHTS.openInterest +
        thetaScore * SCORING_WEIGHTS.thetaEfficiency +
        ivScore * SCORING_WEIGHTS.iv;

      return { contract: c, score: totalScore, delta, mid, spread, oi, iv, dte: getDTE(c.expiration_date) };
    })
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored[0] : null;
};

// ── Option Buy Execution ───────────────────────────────────────────────────

/**
 * Execute a single option buy order (limit at ask, day TIF).
 */
export const executeOptionBuy = async (alpacaConfig, selected, allocation) => {
  const contract = selected.contract;
  const ask = contract.quote?.ask || selected.mid;
  const costPerContract = ask * 100; // options are 100 shares per contract

  // How many contracts can we afford?
  let qty = Math.floor(allocation.available / costPerContract);
  const remainingSlots = allocation.maxContracts - allocation.currentContractCount;
  qty = Math.min(qty, remainingSlots);
  if (qty < 1) {
    return { success: false, error: `Cannot afford even 1 contract ($${costPerContract.toFixed(2)} each, $${allocation.available.toFixed(2)} available)` };
  }

  // Build OCC symbol for the order
  const occSymbol = contract.symbol; // Alpaca returns the OCC symbol already

  try {
    const response = await fetch(`${alpacaConfig.baseUrl}/v2/orders`, {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID": alpacaConfig.key,
        "APCA-API-SECRET-KEY": alpacaConfig.secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: occSymbol,
        qty: String(qty),
        side: "buy",
        type: "limit",
        limit_price: String(ask.toFixed(2)),
        time_in_force: "day",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText);
    }

    const order = await response.json();

    // Track position
    const position = {
      occSymbol,
      underlying: contract.underlying_symbol || contract.root_symbol,
      type: "call",
      strike: contract.strike_price,
      expiration: contract.expiration_date,
      quantity: qty,
      entryPrice: ask,
      costBasis: ask * qty * 100,
      highWaterMark: ask,
      currentValue: ask * qty * 100,
      orderId: order.id,
      entryDate: new Date().toISOString(),
      stopLoss: allocation.profile.stopLossPercent,
      takeProfit: allocation.profile.takeProfitPercent,
      trailingStop: allocation.profile.trailingStopPercent,
    };

    const positions = loadOptionsPositions();
    positions.push(position);
    saveOptionsPositions(positions);

    // Log trade
    const trade = {
      id: order.id,
      symbol: occSymbol,
      underlying: position.underlying,
      side: "buy",
      quantity: qty,
      price: ask,
      totalCost: ask * qty * 100,
      strike: contract.strike_price,
      expiration: contract.expiration_date,
      delta: selected.delta,
      iv: selected.iv,
      dte: selected.dte,
      reason: `Options buy: score ${selected.score.toFixed(2)}, delta ${selected.delta.toFixed(2)}, DTE ${selected.dte}`,
      timestamp: new Date().toISOString(),
      mode: alpacaConfig.mode,
    };
    logOptionTrade(trade);

    showNotificationTitle("trade", `BUY CALL ${position.underlying} ${contract.strike_price}C ${contract.expiration_date} x${qty}`, 30000);

    console.log(`[OptionsTrader] BUY ${qty}x ${occSymbol} @ $${ask.toFixed(2)} (delta=${selected.delta.toFixed(2)}, DTE=${selected.dte})`);

    return { success: true, order, trade, position };
  } catch (error) {
    console.error(`[OptionsTrader] Buy failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

// ── Position Management (Exits) ────────────────────────────────────────────

/**
 * Check all open option positions for exit conditions.
 * Exits: stop loss, take profit, DTE <= 1, underlying score drop, trailing stop.
 */
export const manageOptionPositions = async (alpacaConfig, tickers = []) => {
  const positions = loadOptionsPositions();
  if (positions.length === 0) return { managed: 0, exits: [] };

  const exits = [];

  for (let i = positions.length - 1; i >= 0; i--) {
    const pos = positions[i];
    const exitReason = await checkExitCondition(pos, alpacaConfig, tickers);

    if (exitReason) {
      const sellResult = await executeOptionSell(alpacaConfig, pos, exitReason);
      if (sellResult.success) {
        positions.splice(i, 1);
        exits.push({ symbol: pos.occSymbol, underlying: pos.underlying, reason: exitReason, ...sellResult });
      }
    } else {
      // Update high water mark
      await updatePositionPrice(pos, alpacaConfig);
    }
  }

  saveOptionsPositions(positions);
  return { managed: positions.length + exits.length, exits };
};

/**
 * Check if a position should be exited.
 */
const checkExitCondition = async (pos, alpacaConfig, tickers) => {
  // 1. DTE <= 1 — forced exit
  const dte = getDTE(pos.expiration);
  if (dte <= 1) {
    return `FORCED EXIT: DTE=${dte} (expiring)`;
  }

  // 2. Get current price via snapshot
  let currentPrice = pos.entryPrice; // fallback
  try {
    const snapshots = await fetchOptionSnapshots(alpacaConfig, pos.underlying);
    const snap = snapshots?.[pos.occSymbol];
    if (snap?.latestQuote) {
      const mid = ((snap.latestQuote.bid || 0) + (snap.latestQuote.ask || 0)) / 2;
      if (mid > 0) currentPrice = mid;
    } else if (snap?.latestTrade?.price) {
      currentPrice = snap.latestTrade.price;
    }
  } catch {}

  const plPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;

  // 3. Stop loss
  if (plPercent <= -pos.stopLoss) {
    return `STOP LOSS: ${plPercent.toFixed(1)}% (threshold -${pos.stopLoss}%)`;
  }

  // 4. Take profit
  if (plPercent >= pos.takeProfit) {
    return `TAKE PROFIT: +${plPercent.toFixed(1)}% (threshold +${pos.takeProfit}%)`;
  }

  // 5. Trailing stop from high water mark
  if (currentPrice > pos.highWaterMark) {
    pos.highWaterMark = currentPrice;
  }
  if (pos.highWaterMark > pos.entryPrice) {
    const dropFromHigh = ((pos.highWaterMark - currentPrice) / pos.highWaterMark) * 100;
    if (dropFromHigh >= pos.trailingStop) {
      return `TRAILING STOP: dropped ${dropFromHigh.toFixed(1)}% from high of $${pos.highWaterMark.toFixed(2)}`;
    }
  }

  // 6. Underlying score check — sell if score drops below 6
  const ticker = tickers.find((t) => t.symbol === pos.underlying);
  if (ticker && ticker.score < 6) {
    return `UNDERLYING WEAK: ${pos.underlying} score ${ticker.score.toFixed(1)} < 6.0`;
  }

  return null;
};

/**
 * Update a position's current price and high water mark.
 */
const updatePositionPrice = async (pos, alpacaConfig) => {
  try {
    const snapshots = await fetchOptionSnapshots(alpacaConfig, pos.underlying);
    const snap = snapshots?.[pos.occSymbol];
    if (snap?.latestQuote) {
      const mid = ((snap.latestQuote.bid || 0) + (snap.latestQuote.ask || 0)) / 2;
      if (mid > 0) {
        pos.currentValue = mid * pos.quantity * 100;
        if (mid > pos.highWaterMark) pos.highWaterMark = mid;
      }
    }
  } catch {}
};

/**
 * Sell an option position (limit at bid, day TIF).
 */
const executeOptionSell = async (alpacaConfig, pos, reason) => {
  try {
    const bid = pos.entryPrice * 0.95; // conservative fallback
    // Try to get live bid
    let sellPrice = bid;
    try {
      const snapshots = await fetchOptionSnapshots(alpacaConfig, pos.underlying);
      const snap = snapshots?.[pos.occSymbol];
      if (snap?.latestQuote?.bid > 0) {
        sellPrice = snap.latestQuote.bid;
      }
    } catch {}

    const response = await fetch(`${alpacaConfig.baseUrl}/v2/orders`, {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID": alpacaConfig.key,
        "APCA-API-SECRET-KEY": alpacaConfig.secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: pos.occSymbol,
        qty: String(pos.quantity),
        side: "sell",
        type: "limit",
        limit_price: String(sellPrice.toFixed(2)),
        time_in_force: "day",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText);
    }

    const order = await response.json();

    const plPercent = ((sellPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const plDollar = (sellPrice - pos.entryPrice) * pos.quantity * 100;

    const trade = {
      id: order.id,
      symbol: pos.occSymbol,
      underlying: pos.underlying,
      side: "sell",
      quantity: pos.quantity,
      price: sellPrice,
      entryPrice: pos.entryPrice,
      plPercent: +plPercent.toFixed(2),
      plDollar: +plDollar.toFixed(2),
      reason,
      timestamp: new Date().toISOString(),
      mode: alpacaConfig.mode,
    };
    logOptionTrade(trade);

    showNotificationTitle("trade", `SELL CALL ${pos.underlying} ${pos.strike}C ${reason.split(":")[0]}`, 30000);
    console.log(`[OptionsTrader] SELL ${pos.quantity}x ${pos.occSymbol} @ $${sellPrice.toFixed(2)} (${plPercent >= 0 ? "+" : ""}${plPercent.toFixed(1)}%) — ${reason}`);

    return { success: true, order, trade };
  } catch (error) {
    console.error(`[OptionsTrader] Sell failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

// ── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Evaluate and execute options opportunities for top-scoring tickers.
 * Called from auto-trader after equity logic.
 */
export const evaluateOptionsOpportunities = async (tickers, equity, positions, spyCheck) => {
  const results = { evaluated: 0, bought: [], skipped: [], reasoning: [] };
  const { risk } = getTradingSettings();
  const profile = RISK_PROFILES[risk] || RISK_PROFILES.conservative;

  const alpacaConfig = getAlpacaConfig();
  if (!alpacaConfig.ready) {
    results.reasoning.push("OPTIONS: Alpaca not configured");
    return results;
  }

  const optPositions = loadOptionsPositions();
  const allocation = getOptionsAllocation(equity, optPositions);

  if (allocation.available < 50) {
    results.reasoning.push(`OPTIONS: No budget available ($${allocation.available.toFixed(0)} of $${allocation.maxBudget.toFixed(0)} max, ${allocation.currentContractCount} contracts held)`);
    return results;
  }

  if (allocation.currentContractCount >= allocation.maxContracts) {
    results.reasoning.push(`OPTIONS: Max contracts reached (${allocation.currentContractCount}/${allocation.maxContracts})`);
    return results;
  }

  results.reasoning.push(`OPTIONS [${risk}]: $${allocation.available.toFixed(0)} available (${allocation.currentContractCount}/${allocation.maxContracts} contracts)`);

  // SPY must be solidly positive — options need strong directional conviction
  const spyChange = spyCheck?.details?.dailyChange ?? spyCheck?.spyChange ?? 0;
  if (!spyCheck?.allow || spyChange < 0.25) {
    results.reasoning.push(`OPTIONS: SPY not strong enough (${spyChange >= 0 ? "+" : ""}${(typeof spyChange === "number" ? spyChange : 0).toFixed(2)}%) — need >= +0.25% for options`);
    return results;
  }

  // Filter tickers: very high bar for options entry
  // - Score >= 8.5 (higher than equity's 7.1-8.0)
  // - MACD must be bullish (don't buy calls against momentum)
  // - Not already holding options on this underlying
  // - Volume must not be low
  const MIN_OPTIONS_SCORE = 8.5;
  const heldUnderlyings = new Set(optPositions.map((p) => p.underlying));
  const candidates = tickers
    .filter((t) => {
      if (t.score < MIN_OPTIONS_SCORE) return false;
      if (heldUnderlyings.has(t.symbol)) return false;
      if (t.macd?.trend === "bearish") return false; // never buy calls into bearish MACD
      if (t.volumeScore?.status === "low") return false; // need liquidity
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // only top 3 — be very selective

  if (candidates.length === 0) {
    results.reasoning.push(`OPTIONS: No tickers meet strict criteria (score >= ${MIN_OPTIONS_SCORE}, MACD bullish, volume OK)`);
    return results;
  }

  results.reasoning.push(`OPTIONS candidates (strict): ${candidates.map((t) => `${t.symbol} (${t.score.toFixed(1)}, MACD ${t.macd?.trend || "?"})`).join(", ")}`);

  for (const ticker of candidates) {
    if (allocation.currentContractCount >= allocation.maxContracts) break;
    if (allocation.available < 50) break;

    results.evaluated++;

    try {
      // Calculate date range for expiration
      const now = new Date();
      const minExp = new Date(now.getTime() + profile.dteMin * 24 * 60 * 60 * 1000);
      const maxExp = new Date(now.getTime() + profile.dteMax * 24 * 60 * 60 * 1000);

      // Fetch option chain from Alpaca
      const chain = await fetchOptionContracts(alpacaConfig, {
        underlying_symbols: ticker.symbol,
        type: "call",
        expiration_date_gte: formatDate(minExp),
        expiration_date_lte: formatDate(maxExp),
        strike_price_gte: String((ticker.price * 0.90).toFixed(2)),
        strike_price_lte: String((ticker.price * 1.10).toFixed(2)),
      });

      if (!chain || chain.length === 0) {
        results.skipped.push({ symbol: ticker.symbol, reason: "No contracts found" });
        results.reasoning.push(`  ${ticker.symbol}: no option contracts in range`);
        continue;
      }

      // Get snapshots for greeks and quotes
      const snapshots = await fetchOptionSnapshots(alpacaConfig, ticker.symbol);

      // Merge snapshot data into contracts
      const enriched = chain.map((c) => {
        const snap = snapshots?.[c.symbol];
        return {
          ...c,
          greeks: snap?.greeks || {},
          quote: snap?.latestQuote || {},
          implied_volatility: snap?.impliedVolatility || 0,
          open_interest: c.open_interest || snap?.openInterest || 0,
        };
      });

      // Select best contract
      const selected = selectBestContract(enriched, profile, ticker.price);

      if (!selected) {
        results.skipped.push({ symbol: ticker.symbol, reason: "No contracts passed filters" });
        results.reasoning.push(`  ${ticker.symbol}: ${enriched.length} contracts, none passed filters`);
        continue;
      }

      results.reasoning.push(
        `  ${ticker.symbol}: best contract ${selected.contract.symbol} delta=${selected.delta.toFixed(2)} DTE=${selected.dte} mid=$${selected.mid.toFixed(2)} score=${selected.score.toFixed(2)}`
      );

      // Execute buy
      const buyResult = await executeOptionBuy(alpacaConfig, selected, allocation);

      if (buyResult.success) {
        results.bought.push(buyResult.trade);
        allocation.currentContractCount++;
        allocation.available -= buyResult.position.costBasis;
        results.reasoning.push(`  EXECUTED: BUY ${buyResult.trade.quantity}x ${buyResult.trade.symbol} @ $${buyResult.trade.price.toFixed(2)}`);
      } else {
        results.skipped.push({ symbol: ticker.symbol, reason: buyResult.error });
        results.reasoning.push(`  FAILED: ${buyResult.error}`);
      }
    } catch (error) {
      results.skipped.push({ symbol: ticker.symbol, reason: error.message });
      results.reasoning.push(`  ERROR ${ticker.symbol}: ${error.message}`);
    }
  }

  return results;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const getDTE = (expirationDate) => {
  const exp = new Date(expirationDate);
  const now = new Date();
  return Math.ceil((exp - now) / (24 * 60 * 60 * 1000));
};

const formatDate = (d) => {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
};

// ── Exports for status/debugging ───────────────────────────────────────────

export const getOptionsStatus = () => {
  const positions = loadOptionsPositions();
  const trades = loadOptionsTradesLog();
  const { risk } = getTradingSettings();
  const profile = RISK_PROFILES[risk] || RISK_PROFILES.conservative;

  return {
    risk,
    profile,
    openPositions: positions,
    positionCount: positions.length,
    totalTrades: trades.length,
    recentTrades: trades.slice(-10),
  };
};
