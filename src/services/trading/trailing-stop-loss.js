/**
 * Trailing Stop Loss Service
 *
 * Manages trailing stop loss orders for positions:
 * 1. Tracks high watermark for each position
 * 2. Calculates dynamic stop loss levels
 * 3. Triggers alerts when stop levels are approached
 * 4. Can auto-execute stop orders via Alpaca
 *
 * Philosophy: Protect gains while letting winners run.
 */

import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { getDataDir } from "../paths.js";
import {
  getAlpacaConfig,
  fetchPositions,
  submitOrder,
  getOrders
} from "./alpaca.js";

const DATA_DIR = getDataDir();
const STOP_LOSS_STATE_FILE = path.join(DATA_DIR, "trailing-stop-loss-state.json");

/**
 * Read JSON helper
 */
function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

/**
 * Write JSON helper
 */
function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Default trailing stop configurations
 */
const DEFAULT_CONFIGS = {
  // Conservative: 15% trailing stop
  conservative: {
    trailingPercent: 15,
    breakEvenThreshold: 10, // Move to break-even after 10% gain
    lockInPercent: 50,       // Lock in 50% of gains after threshold
    alertThreshold: 3        // Alert when within 3% of stop
  },
  // Moderate: 10% trailing stop
  moderate: {
    trailingPercent: 10,
    breakEvenThreshold: 8,
    lockInPercent: 60,
    alertThreshold: 2
  },
  // Aggressive: 7% trailing stop
  aggressive: {
    trailingPercent: 7,
    breakEvenThreshold: 5,
    lockInPercent: 70,
    alertThreshold: 1.5
  }
};

class TrailingStopLossService extends EventEmitter {
  constructor() {
    super();
    this.positions = new Map();  // symbol -> position data with stop info
    this.config = null;
    this.riskProfile = "moderate";
    this.initialized = false;
    this.checkInterval = null;
  }

  /**
   * Initialize the service
   */
  async initialize(riskProfile = "moderate") {
    this.riskProfile = riskProfile;
    this.config = getAlpacaConfig();

    // Load saved state
    const savedState = readJson(STOP_LOSS_STATE_FILE);
    if (savedState) {
      for (const [symbol, data] of Object.entries(savedState.positions || {})) {
        this.positions.set(symbol, data);
      }
    }

    // Sync with current positions
    if (this.config.ready) {
      await this.syncPositions();
    }

    this.initialized = true;
    console.log(`[TrailingStopLoss] Initialized with ${this.positions.size} tracked positions`);
    return this;
  }

  /**
   * Sync with current Alpaca positions
   */
  async syncPositions() {
    if (!this.config?.ready) return;

    try {
      const positions = await fetchPositions(this.config);

      // Update existing positions
      for (const pos of positions) {
        const symbol = pos.symbol;
        const currentPrice = parseFloat(pos.current_price);
        const avgEntry = parseFloat(pos.avg_entry_price);
        const qty = parseInt(pos.qty);
        const unrealizedPL = parseFloat(pos.unrealized_pl);
        const unrealizedPLPercent = parseFloat(pos.unrealized_plpc) * 100;

        const existing = this.positions.get(symbol);

        if (existing) {
          // Update high watermark if current price is higher
          if (currentPrice > existing.highWatermark) {
            existing.highWatermark = currentPrice;
            existing.highWatermarkDate = new Date().toISOString();
            this.emit("new-high", { symbol, price: currentPrice });
          }

          // Update current data
          existing.currentPrice = currentPrice;
          existing.unrealizedPL = unrealizedPL;
          existing.unrealizedPLPercent = unrealizedPLPercent;
          existing.lastUpdated = new Date().toISOString();

          // Recalculate stop level
          existing.stopLevel = this.calculateStopLevel(existing);

          // Check if approaching stop
          this.checkStopProximity(existing);

        } else {
          // New position - initialize tracking
          this.positions.set(symbol, {
            symbol,
            avgEntry,
            qty,
            currentPrice,
            highWatermark: currentPrice,
            highWatermarkDate: new Date().toISOString(),
            unrealizedPL,
            unrealizedPLPercent,
            stopLevel: null, // Will be calculated below
            stopOrderId: null,
            alerts: [],
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          });

          // Calculate initial stop level
          const newPos = this.positions.get(symbol);
          newPos.stopLevel = this.calculateStopLevel(newPos);

          this.emit("position-tracked", { symbol, position: newPos });
        }
      }

      // Remove positions that are no longer held
      const currentSymbols = new Set(positions.map(p => p.symbol));
      for (const symbol of this.positions.keys()) {
        if (!currentSymbols.has(symbol)) {
          this.positions.delete(symbol);
          this.emit("position-closed", { symbol });
        }
      }

      this.saveState();
    } catch (err) {
      console.error("[TrailingStopLoss] Sync error:", err.message);
    }
  }

  /**
   * Calculate stop level based on risk profile and position gains
   */
  calculateStopLevel(position) {
    const stopConfig = DEFAULT_CONFIGS[this.riskProfile];
    const { avgEntry, highWatermark, currentPrice } = position;
    const gainFromEntry = ((highWatermark - avgEntry) / avgEntry) * 100;

    let stopLevel;

    // If significant gain, use trailing from high watermark
    if (gainFromEntry >= stopConfig.breakEvenThreshold) {
      // Lock in a percentage of gains
      const lockedGain = gainFromEntry * (stopConfig.lockInPercent / 100);
      const lockedPrice = avgEntry * (1 + lockedGain / 100);

      // Trailing stop from high watermark
      const trailingStop = highWatermark * (1 - stopConfig.trailingPercent / 100);

      // Use the higher of locked price or trailing stop
      stopLevel = Math.max(lockedPrice, trailingStop);

      // Never set stop below entry (after hitting break-even threshold)
      stopLevel = Math.max(stopLevel, avgEntry);
    } else {
      // Standard trailing stop from high watermark
      stopLevel = highWatermark * (1 - stopConfig.trailingPercent / 100);
    }

    return parseFloat(stopLevel.toFixed(2));
  }

  /**
   * Check if position is approaching stop level
   */
  checkStopProximity(position) {
    const stopConfig = DEFAULT_CONFIGS[this.riskProfile];
    const { symbol, currentPrice, stopLevel, avgEntry } = position;

    if (!stopLevel) return;

    const distanceToStop = ((currentPrice - stopLevel) / currentPrice) * 100;

    // Alert if within threshold
    if (distanceToStop <= stopConfig.alertThreshold && distanceToStop > 0) {
      const alert = {
        type: "approaching_stop",
        symbol,
        currentPrice,
        stopLevel,
        distancePercent: distanceToStop.toFixed(2),
        timestamp: new Date().toISOString()
      };

      // Avoid duplicate alerts within 1 hour
      const recentAlert = position.alerts.find(
        a => a.type === "approaching_stop" &&
        Date.now() - new Date(a.timestamp).getTime() < 60 * 60 * 1000
      );

      if (!recentAlert) {
        position.alerts.push(alert);
        this.emit("stop-alert", alert);
      }
    }

    // Trigger if stop is breached
    if (currentPrice <= stopLevel) {
      const trigger = {
        type: "stop_triggered",
        symbol,
        currentPrice,
        stopLevel,
        avgEntry,
        gain: ((currentPrice - avgEntry) / avgEntry * 100).toFixed(2),
        timestamp: new Date().toISOString()
      };

      position.alerts.push(trigger);
      this.emit("stop-triggered", trigger);
    }
  }

  /**
   * Place a trailing stop order with Alpaca
   */
  async placeStopOrder(symbol, stopPrice = null) {
    const position = this.positions.get(symbol);
    if (!position) {
      return { success: false, error: "Position not found" };
    }

    if (!this.config?.ready) {
      return { success: false, error: "Alpaca not configured" };
    }

    const targetStop = stopPrice || position.stopLevel;

    try {
      const order = await submitOrder(this.config, {
        symbol,
        qty: position.qty,
        side: "sell",
        type: "stop",
        stop_price: targetStop,
        time_in_force: "gtc" // Good til cancelled
      });

      position.stopOrderId = order.id;
      this.saveState();

      this.emit("stop-order-placed", {
        symbol,
        orderId: order.id,
        stopPrice: targetStop,
        qty: position.qty
      });

      return { success: true, order };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Update stop order for a position
   */
  async updateStopOrder(symbol) {
    const position = this.positions.get(symbol);
    if (!position || !position.stopOrderId) {
      return { success: false, error: "No existing stop order" };
    }

    // Cancel existing and place new
    try {
      const { cancelOrder } = await import("./alpaca.js");
      await cancelOrder(this.config, position.stopOrderId);

      position.stopOrderId = null;
      return await this.placeStopOrder(symbol);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get stop loss status for all positions
   */
  getStatus() {
    const stopConfig = DEFAULT_CONFIGS[this.riskProfile];
    const positions = [];

    for (const [symbol, pos] of this.positions) {
      const distanceToStop = pos.stopLevel
        ? ((pos.currentPrice - pos.stopLevel) / pos.currentPrice * 100).toFixed(2)
        : null;

      positions.push({
        symbol,
        currentPrice: pos.currentPrice,
        avgEntry: pos.avgEntry,
        highWatermark: pos.highWatermark,
        stopLevel: pos.stopLevel,
        distanceToStop: distanceToStop ? `${distanceToStop}%` : null,
        unrealizedPL: pos.unrealizedPL,
        unrealizedPLPercent: pos.unrealizedPLPercent?.toFixed(2) + "%",
        hasStopOrder: !!pos.stopOrderId,
        status: this.getPositionStatus(pos)
      });
    }

    return {
      riskProfile: this.riskProfile,
      config: stopConfig,
      positions,
      totalPositions: positions.length,
      positionsWithStops: positions.filter(p => p.hasStopOrder).length
    };
  }

  /**
   * Get position status label
   */
  getPositionStatus(position) {
    const stopConfig = DEFAULT_CONFIGS[this.riskProfile];
    const { currentPrice, stopLevel, avgEntry } = position;

    if (!stopLevel) return "initializing";

    const distanceToStop = ((currentPrice - stopLevel) / currentPrice) * 100;
    const gainFromEntry = ((currentPrice - avgEntry) / avgEntry) * 100;

    if (currentPrice <= stopLevel) return "STOP_TRIGGERED";
    if (distanceToStop <= stopConfig.alertThreshold) return "APPROACHING_STOP";
    if (gainFromEntry >= stopConfig.breakEvenThreshold) return "GAINS_LOCKED";
    if (gainFromEntry > 0) return "PROFITABLE";
    return "UNDERWATER";
  }

  /**
   * Start automatic monitoring
   */
  startMonitoring(intervalMs = 60000) {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.syncPositions();
    }, intervalMs);

    console.log(`[TrailingStopLoss] Monitoring started (every ${intervalMs / 1000}s)`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Set risk profile
   */
  setRiskProfile(profile) {
    if (!DEFAULT_CONFIGS[profile]) {
      return { success: false, error: "Invalid profile. Use: conservative, moderate, aggressive" };
    }

    this.riskProfile = profile;

    // Recalculate all stop levels
    for (const position of this.positions.values()) {
      position.stopLevel = this.calculateStopLevel(position);
    }

    this.saveState();
    this.emit("risk-profile-changed", { profile });

    return { success: true, profile };
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const status = this.getStatus();

    return {
      riskProfile: status.riskProfile,
      totalPositions: status.totalPositions,
      positionsWithStops: status.positionsWithStops,
      positions: status.positions.map(p => ({
        symbol: p.symbol,
        price: p.currentPrice,
        stop: p.stopLevel,
        distance: p.distanceToStop,
        pl: p.unrealizedPLPercent,
        status: p.status
      }))
    };
  }

  /**
   * Save state to file
   */
  saveState() {
    const state = {
      riskProfile: this.riskProfile,
      positions: Object.fromEntries(this.positions),
      lastUpdated: new Date().toISOString()
    };
    writeJson(STOP_LOSS_STATE_FILE, state);
  }
}

// Singleton
let instance = null;

export const getTrailingStopLossService = () => {
  if (!instance) {
    instance = new TrailingStopLossService();
  }
  return instance;
};

export { DEFAULT_CONFIGS };
export default TrailingStopLossService;
