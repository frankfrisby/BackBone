/**
 * Tests for Market Benchmark Service
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Alpaca
vi.mock("../src/services/alpaca.js", () => ({
  fetchLatestBars: vi.fn(() => Promise.resolve({
    SPY: [
      { c: 500, o: 498, h: 505, l: 495, v: 50000000, t: "2026-01-27T20:00:00Z" },
      { c: 505, o: 500, h: 510, l: 499, v: 55000000, t: "2026-01-28T20:00:00Z" }
    ],
    QQQ: [
      { c: 440, o: 438, h: 445, l: 435, v: 30000000, t: "2026-01-27T20:00:00Z" },
      { c: 448, o: 440, h: 450, l: 439, v: 32000000, t: "2026-01-28T20:00:00Z" }
    ]
  }))
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

import MarketBenchmarkService, { BENCHMARKS } from "../src/services/market-benchmark.js";

describe("MarketBenchmarkService", () => {
  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MarketBenchmarkService();
  });

  describe("BENCHMARKS constant", () => {
    it("should have S&P 500 benchmark", () => {
      expect(BENCHMARKS.SP500).toBeDefined();
      expect(BENCHMARKS.SP500.symbol).toBe("SPY");
    });

    it("should have NASDAQ benchmark", () => {
      expect(BENCHMARKS.NASDAQ).toBeDefined();
      expect(BENCHMARKS.NASDAQ.symbol).toBe("QQQ");
    });

    it("should have DOW benchmark", () => {
      expect(BENCHMARKS.DOW).toBeDefined();
      expect(BENCHMARKS.DOW.symbol).toBe("DIA");
    });

    it("should have VIX benchmark", () => {
      expect(BENCHMARKS.VIX).toBeDefined();
    });
  });

  describe("initialize", () => {
    it("should initialize without config", async () => {
      await service.initialize(null);
      expect(service.initialized).toBe(true);
    });

    it("should initialize with config", async () => {
      await service.initialize({ ready: true });
      expect(service.initialized).toBe(true);
    });
  });

  describe("fetchBenchmarks", () => {
    it("should skip fetch when no config", async () => {
      await service.initialize(null);
      await service.fetchBenchmarks();

      expect(service.benchmarks.size).toBe(0);
    });

    it("should fetch and store benchmarks with config", async () => {
      await service.initialize({ ready: true });
      await service.fetchBenchmarks();

      expect(service.benchmarks.size).toBeGreaterThan(0);
    });
  });

  describe("getSP500", () => {
    it("should return null when no data", () => {
      const sp500 = service.getSP500();
      expect(sp500).toBeNull();
    });

    it("should return data after fetch", async () => {
      await service.initialize({ ready: true });
      await service.fetchBenchmarks();

      const sp500 = service.getSP500();
      expect(sp500).not.toBeNull();
      expect(sp500.symbol).toBe("SPY");
    });
  });

  describe("getMarketSentiment", () => {
    it("should return unknown when no data", () => {
      const sentiment = service.getMarketSentiment();

      expect(sentiment.sentiment).toBe("unknown");
      expect(sentiment.confidence).toBe(0);
    });

    it("should analyze sentiment after fetch", async () => {
      await service.initialize({ ready: true });
      await service.fetchBenchmarks();

      const sentiment = service.getMarketSentiment();

      expect(sentiment.sentiment).not.toBe("unknown");
      expect(sentiment.confidence).toBeGreaterThan(0);
    });
  });

  describe("compareToBenchmark", () => {
    it("should return error when no benchmark data", () => {
      const result = service.compareToBenchmark(5);

      expect(result.alpha).toBeNull();
      expect(result.error).toBeDefined();
    });

    it("should calculate alpha after fetch", async () => {
      await service.initialize({ ready: true });
      await service.fetchBenchmarks();

      const result = service.compareToBenchmark(2); // Portfolio up 2%

      expect(result.alpha).toBeDefined();
      expect(result.portfolioReturn).toBe("2.00");
      expect(result.outperforming).toBeDefined();
    });
  });

  describe("getCompactDisplay", () => {
    it("should return placeholder when no data", () => {
      const display = service.getCompactDisplay();

      expect(display.text).toBe("S&P: --");
      expect(display.color).toBe("#64748b");
    });

    it("should format data after fetch", async () => {
      await service.initialize({ ready: true });
      await service.fetchBenchmarks();

      const display = service.getCompactDisplay();

      expect(display.text).toContain("S&P:");
      expect(display.text).not.toBe("S&P: --");
      expect(display.price).toBeDefined();
    });
  });

  describe("getDisplayData", () => {
    it("should return valid structure", () => {
      const data = service.getDisplayData();

      expect(data).toHaveProperty("sp500");
      expect(data).toHaveProperty("nasdaq");
      expect(data).toHaveProperty("dow");
      expect(data).toHaveProperty("sentiment");
    });

    it("should have formatted benchmarks after fetch", async () => {
      await service.initialize({ ready: true });
      await service.fetchBenchmarks();

      const data = service.getDisplayData();

      expect(data.sp500).not.toBeNull();
      expect(data.sp500.name).toBe("S&P 500");
    });
  });
});
