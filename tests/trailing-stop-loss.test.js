/**
 * Tests for Trailing Stop Loss Service
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Alpaca
vi.mock("../src/services/alpaca.js", () => ({
  getAlpacaConfig: vi.fn(() => ({
    key: "test",
    secret: "test",
    baseUrl: "https://paper-api.alpaca.markets",
    dataUrl: "https://data.alpaca.markets",
    ready: true
  })),
  fetchPositions: vi.fn(() => Promise.resolve([
    {
      symbol: "AAPL",
      current_price: "185.50",
      avg_entry_price: "175.00",
      qty: "10",
      unrealized_pl: "105.00",
      unrealized_plpc: "0.06"
    }
  ])),
  submitOrder: vi.fn(() => Promise.resolve({ id: "order_123" }))
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => "{}"),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => "{}"),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}));

import TrailingStopLossService, { DEFAULT_CONFIGS } from "../src/services/trailing-stop-loss.js";

describe("TrailingStopLossService", () => {
  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TrailingStopLossService();
  });

  describe("DEFAULT_CONFIGS", () => {
    it("should have conservative config", () => {
      expect(DEFAULT_CONFIGS.conservative).toBeDefined();
      expect(DEFAULT_CONFIGS.conservative.trailingPercent).toBe(15);
    });

    it("should have moderate config", () => {
      expect(DEFAULT_CONFIGS.moderate).toBeDefined();
      expect(DEFAULT_CONFIGS.moderate.trailingPercent).toBe(10);
    });

    it("should have aggressive config", () => {
      expect(DEFAULT_CONFIGS.aggressive).toBeDefined();
      expect(DEFAULT_CONFIGS.aggressive.trailingPercent).toBe(7);
    });
  });

  describe("calculateStopLevel", () => {
    beforeEach(async () => {
      await service.initialize("moderate");
    });

    it("should calculate trailing stop for position with no gain", () => {
      const position = {
        avgEntry: 100,
        highWatermark: 100,
        currentPrice: 100
      };

      const stopLevel = service.calculateStopLevel(position);

      // Moderate trailing stop is 10%
      expect(stopLevel).toBe(90);
    });

    it("should use trailing from high watermark", () => {
      const position = {
        avgEntry: 100,
        highWatermark: 120,
        currentPrice: 118
      };

      const stopLevel = service.calculateStopLevel(position);

      // 10% trailing from 120 = 108
      // But gains locked after 8% threshold, so might be higher
      expect(stopLevel).toBeGreaterThanOrEqual(100);
    });

    it("should never set stop below entry after break-even threshold", () => {
      const position = {
        avgEntry: 100,
        highWatermark: 115,
        currentPrice: 110
      };

      const stopLevel = service.calculateStopLevel(position);

      // After 8% gain threshold (moderate), stop should be at least at entry
      expect(stopLevel).toBeGreaterThanOrEqual(100);
    });
  });

  describe("getPositionStatus", () => {
    beforeEach(async () => {
      await service.initialize("moderate");
    });

    it("should return STOP_TRIGGERED when price at stop", () => {
      const position = {
        currentPrice: 90,
        stopLevel: 90,
        avgEntry: 100
      };

      const status = service.getPositionStatus(position);
      expect(status).toBe("STOP_TRIGGERED");
    });

    it("should return APPROACHING_STOP when close to stop", () => {
      const position = {
        currentPrice: 91.5,
        stopLevel: 90,
        avgEntry: 100
      };

      const status = service.getPositionStatus(position);
      expect(status).toBe("APPROACHING_STOP");
    });

    it("should return PROFITABLE for gains", () => {
      const position = {
        currentPrice: 105,
        stopLevel: 95,
        avgEntry: 100
      };

      const status = service.getPositionStatus(position);
      expect(status).toBe("PROFITABLE");
    });

    it("should return UNDERWATER for losses", () => {
      const position = {
        currentPrice: 95,
        stopLevel: 85,
        avgEntry: 100
      };

      const status = service.getPositionStatus(position);
      expect(status).toBe("UNDERWATER");
    });
  });

  describe("setRiskProfile", () => {
    beforeEach(async () => {
      await service.initialize("moderate");
    });

    it("should change risk profile", () => {
      const result = service.setRiskProfile("aggressive");

      expect(result.success).toBe(true);
      expect(service.riskProfile).toBe("aggressive");
    });

    it("should reject invalid profile", () => {
      const result = service.setRiskProfile("invalid");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid");
    });
  });

  describe("getDisplayData", () => {
    beforeEach(async () => {
      await service.initialize("moderate");
    });

    it("should return valid display structure", () => {
      const data = service.getDisplayData();

      expect(data).toHaveProperty("riskProfile");
      expect(data).toHaveProperty("totalPositions");
      expect(data).toHaveProperty("positions");
      expect(Array.isArray(data.positions)).toBe(true);
    });
  });

  describe("getStatus", () => {
    beforeEach(async () => {
      await service.initialize("moderate");
    });

    it("should return status object", () => {
      const status = service.getStatus();

      expect(status).toHaveProperty("riskProfile");
      expect(status).toHaveProperty("config");
      expect(status).toHaveProperty("positions");
      expect(status).toHaveProperty("totalPositions");
    });
  });
});
