/**
 * Tests for Trailing Stop Manager
 *
 * Validates the reference formula:
 *   gainThreshold = floor(gain / 2) * 2
 *   stopPercent   = gainThreshold * 0.5
 *   minimum 1% for winners, 2% base stop for losers
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auto-trader (isMarketOpen)
vi.mock("../src/services/auto-trader.js", () => ({
  isMarketOpen: vi.fn(() => ({ open: true, reason: "Market open" })),
}));

// Mock alpaca
vi.mock("../src/services/alpaca.js", () => ({
  getAlpacaConfig: vi.fn(() => ({
    key: "test-key",
    secret: "test-secret",
    baseUrl: "https://paper-api.alpaca.markets",
    dataUrl: "https://data.alpaca.markets",
    ready: true,
  })),
  fetchPositions: vi.fn(() => Promise.resolve([])),
  getOrders: vi.fn(() => Promise.resolve([])),
  cancelOrder: vi.fn(() => Promise.resolve({ success: true })),
  submitOrder: vi.fn(() => Promise.resolve({ id: "order_123", status: "accepted" })),
}));

import {
  calculateStopLossPercent,
  shouldUpdateStops,
  applyStopToPosition,
  applyStopsToAllPositions,
} from "../src/services/trading/trailing-stop-manager.js";

import { getOrders, submitOrder, cancelOrder, fetchPositions, getAlpacaConfig } from "../src/services/trading/alpaca.js";

describe("Trailing Stop Manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Formula Tests ──────────────────────────────────────────────────
  describe("calculateStopLossPercent", () => {
    it("returns 2% base stop for losing positions", () => {
      expect(calculateStopLossPercent(-5)).toBe(2);
      expect(calculateStopLossPercent(-10)).toBe(2);
      expect(calculateStopLossPercent(-0.5)).toBe(2);
    });

    it("returns 2% base stop for flat positions", () => {
      expect(calculateStopLossPercent(0)).toBe(2);
    });

    it("returns 1% minimum for small gains (gain < 2%)", () => {
      // gain=1 → threshold=floor(1/2)*2=0 → stop=0 → max(1,0)=1
      expect(calculateStopLossPercent(1)).toBe(1);
      expect(calculateStopLossPercent(0.5)).toBe(1);
      expect(calculateStopLossPercent(1.9)).toBe(1);
    });

    it("returns 1% for 2% gain", () => {
      // gain=2 → threshold=floor(2/2)*2=2 → stop=1 → max(1,1)=1
      expect(calculateStopLossPercent(2)).toBe(1);
    });

    it("returns 1% for 3% gain", () => {
      // gain=3 → threshold=floor(3/2)*2=2 → stop=1
      expect(calculateStopLossPercent(3)).toBe(1);
    });

    it("returns 2% for 4% gain", () => {
      // gain=4 → threshold=floor(4/2)*2=4 → stop=2
      expect(calculateStopLossPercent(4)).toBe(2);
    });

    it("returns 2% for 5% gain", () => {
      // gain=5 → threshold=floor(5/2)*2=4 → stop=2
      expect(calculateStopLossPercent(5)).toBe(2);
    });

    it("returns 3% for 6% gain", () => {
      // gain=6 → threshold=floor(6/2)*2=6 → stop=3
      expect(calculateStopLossPercent(6)).toBe(3);
    });

    it("returns 4% for 8% gain", () => {
      // gain=8 → threshold=floor(8/2)*2=8 → stop=4
      expect(calculateStopLossPercent(8)).toBe(4);
    });

    it("returns 5% for 10% gain", () => {
      // gain=10 → threshold=floor(10/2)*2=10 → stop=5
      expect(calculateStopLossPercent(10)).toBe(5);
    });

    it("returns 6% for 12% gain", () => {
      // gain=12 → threshold=floor(12/2)*2=12 → stop=6
      expect(calculateStopLossPercent(12)).toBe(6);
    });

    it("returns 10% for 20% gain", () => {
      // gain=20 → threshold=floor(20/2)*2=20 → stop=10
      expect(calculateStopLossPercent(20)).toBe(10);
    });

    it("handles odd thresholds correctly (discretizes first)", () => {
      // gain=9 → threshold=floor(9/2)*2=8 → stop=4
      expect(calculateStopLossPercent(9)).toBe(4);
      // gain=11 → threshold=floor(11/2)*2=10 → stop=5
      expect(calculateStopLossPercent(11)).toBe(5);
      // gain=15 → threshold=floor(15/2)*2=14 → stop=7
      expect(calculateStopLossPercent(15)).toBe(7);
    });
  });

  // ─── applyStopToPosition Tests ──────────────────────────────────────
  describe("applyStopToPosition", () => {
    it("creates a new trailing stop order when none exists", async () => {
      getOrders.mockResolvedValue([]);
      submitOrder.mockResolvedValue({ id: "order_new", status: "accepted" });

      const result = await applyStopToPosition("AAPL", 10, 100, 110);

      expect(result.action).toBe("created");
      expect(result.symbol).toBe("AAPL");
      expect(result.trailPercent).toBe(5); // 10% gain → 5% stop
      expect(result.orderId).toBe("order_new");

      expect(submitOrder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          symbol: "AAPL",
          qty: 10,
          side: "sell",
          type: "trailing_stop",
          trail_percent: 5,
          time_in_force: "gtc",
        })
      );
    });

    it("keeps existing order when trail percent matches", async () => {
      const existingOrders = [
        { id: "order_existing", symbol: "AAPL", type: "trailing_stop", side: "sell", trail_percent: "5" },
      ];

      const result = await applyStopToPosition("AAPL", 10, 100, 110, existingOrders);

      expect(result.action).toBe("keep");
      expect(result.orderId).toBe("order_existing");
      expect(cancelOrder).not.toHaveBeenCalled();
      expect(submitOrder).not.toHaveBeenCalled();
    });

    it("replaces existing order when trail percent differs", async () => {
      const existingOrders = [
        { id: "order_old", symbol: "AAPL", type: "trailing_stop", side: "sell", trail_percent: "3" },
      ];
      submitOrder.mockResolvedValue({ id: "order_replaced", status: "accepted" });

      const result = await applyStopToPosition("AAPL", 10, 100, 110, existingOrders);

      expect(result.action).toBe("replaced");
      expect(cancelOrder).toHaveBeenCalledWith(expect.anything(), "order_old");
      expect(submitOrder).toHaveBeenCalled();
    });

    it("uses 2% base stop for losing positions", async () => {
      getOrders.mockResolvedValue([]);
      submitOrder.mockResolvedValue({ id: "order_loss", status: "accepted" });

      const result = await applyStopToPosition("TSLA", 5, 200, 190);

      expect(result.action).toBe("created");
      expect(result.trailPercent).toBe(2); // losing → 2% base
    });

    it("skips when Alpaca not configured", async () => {
      getAlpacaConfig.mockReturnValueOnce({ ready: false });

      const result = await applyStopToPosition("AAPL", 10, 100, 110);

      expect(result.action).toBe("skip");
      expect(result.error).toContain("not configured");
    });

    it("skips with invalid qty or price", async () => {
      const result = await applyStopToPosition("AAPL", 0, 100, 110);
      expect(result.action).toBe("skip");

      const result2 = await applyStopToPosition("AAPL", 10, 0, 110);
      expect(result2.action).toBe("skip");
    });
  });

  // ─── applyStopsToAllPositions Tests ─────────────────────────────────
  describe("applyStopsToAllPositions", () => {
    it("applies stops to all positions", async () => {
      fetchPositions.mockResolvedValue([
        { symbol: "AAPL", qty: "10", avg_entry_price: "150", current_price: "165" },
        { symbol: "MSFT", qty: "5", avg_entry_price: "300", current_price: "290" },
      ]);
      getOrders.mockResolvedValue([]);
      submitOrder.mockResolvedValue({ id: "order_auto", status: "accepted" });

      const result = await applyStopsToAllPositions();

      expect(result.summary.total).toBe(2);
      expect(result.summary.created).toBe(2);
      expect(submitOrder).toHaveBeenCalledTimes(2);
    });

    it("returns early when no positions", async () => {
      fetchPositions.mockResolvedValue([]);
      getOrders.mockResolvedValue([]);

      const result = await applyStopsToAllPositions();

      expect(result.results).toEqual([]);
      expect(result.message).toBe("No positions");
    });

    it("skips positions with missing price data", async () => {
      fetchPositions.mockResolvedValue([
        { symbol: "BAD", qty: "10", avg_entry_price: "0", current_price: "0" },
      ]);
      getOrders.mockResolvedValue([]);

      const result = await applyStopsToAllPositions();

      expect(result.results[0].action).toBe("skip");
    });
  });
});
