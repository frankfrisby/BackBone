/**
 * PnL Display Tests
 * Validates that PnL (profit/loss) is correctly calculated and displayed
 * in both the portfolio data layer and the mini view ticker panel.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC_DIR = path.join(process.cwd(), "src");

// === PORTFOLIO DATA LAYER ===

describe("Portfolio PnL Calculation", () => {
  it("buildPortfolioFromAlpaca uses position-level P&L when equity change is 0", async () => {
    const { buildPortfolioFromAlpaca } = await import("../src/data/portfolio.js");

    // Simulate: equity equals last_equity (0% equity change) but positions have intraday P&L
    const account = {
      equity: "100000",
      last_equity: "100000",
      cash: "50000",
      buying_power: "100000"
    };
    const positions = [
      {
        symbol: "NVDA",
        qty: "10",
        avg_entry_price: "500",
        current_price: "510",
        unrealized_intraday_pl: "100",
        unrealized_intraday_plpc: "0.02",
        unrealized_plpc: "0.02",
        unrealized_pl: "100"
      }
    ];

    const portfolio = buildPortfolioFromAlpaca(account, positions);

    // dayChange should be derived from position intraday P&L, not 0
    expect(portfolio.dayChange).not.toBe(0);
    expect(portfolio.dayChange).toBeCloseTo(0.1, 1); // $100 / $100000 = 0.1%
  });

  it("buildPortfolioFromAlpaca calculates totalChange from cost basis, not equity", async () => {
    const { buildPortfolioFromAlpaca } = await import("../src/data/portfolio.js");

    const account = {
      equity: "110000",
      last_equity: "109000",
      cash: "50000",
      buying_power: "100000"
    };
    const positions = [
      {
        symbol: "AAPL",
        qty: "100",
        avg_entry_price: "500",
        current_price: "600",
        unrealized_intraday_pl: "500",
        unrealized_intraday_plpc: "0.0083",
        unrealized_plpc: "0.20",
        unrealized_pl: "10000"
      }
    ];

    const portfolio = buildPortfolioFromAlpaca(account, positions);

    // totalChange should be based on position cost basis P&L
    // Cost basis: 100 * 500 = 50000, Market value: 100 * 600 = 60000
    // P&L: 10000, Percent: 10000/50000 = 20%
    expect(portfolio.totalChange).toBeCloseTo(20, 0);
  });

  it("buildPortfolioFromAlpaca uses equity change when position data is 0", async () => {
    const { buildPortfolioFromAlpaca } = await import("../src/data/portfolio.js");

    const account = {
      equity: "101000",
      last_equity: "100000",
      cash: "50000",
      buying_power: "100000"
    };
    const positions = [
      {
        symbol: "TSLA",
        qty: "10",
        avg_entry_price: "100",
        current_price: "110",
        unrealized_intraday_pl: "0",
        unrealized_intraday_plpc: "0",
        unrealized_plpc: "0.10",
        unrealized_pl: "100"
      }
    ];

    const portfolio = buildPortfolioFromAlpaca(account, positions);

    // dayChange should use equity-level data since it's non-zero
    expect(portfolio.dayChange).toBeCloseTo(1.0, 1); // 1% equity change
  });

  it("filters out CVR positions", async () => {
    const { buildPortfolioFromAlpaca } = await import("../src/data/portfolio.js");

    const account = { equity: "100000", last_equity: "100000", cash: "50000", buying_power: "100000" };
    const positions = [
      { symbol: "NVDA", qty: "10", avg_entry_price: "500", current_price: "510", unrealized_intraday_pl: "0", unrealized_intraday_plpc: "0", unrealized_plpc: "0", unrealized_pl: "0" },
      { symbol: "ABC_CVR", qty: "5", avg_entry_price: "1", current_price: "0.5", unrealized_intraday_pl: "0", unrealized_intraday_plpc: "0", unrealized_plpc: "0", unrealized_pl: "0" }
    ];

    const portfolio = buildPortfolioFromAlpaca(account, positions);
    expect(portfolio.positions.length).toBe(1);
    expect(portfolio.positions[0].symbol).toBe("NVDA");
  });

  it("position has todayChange field from unrealized_intraday_plpc", async () => {
    const { buildPortfolioFromAlpaca } = await import("../src/data/portfolio.js");

    const account = { equity: "100000", last_equity: "100000", cash: "50000", buying_power: "100000" };
    const positions = [
      {
        symbol: "AMD",
        qty: "20",
        avg_entry_price: "150",
        current_price: "155",
        unrealized_intraday_pl: "30",
        unrealized_intraday_plpc: "0.015", // 1.5%
        unrealized_plpc: "0.0333",
        unrealized_pl: "100"
      }
    ];

    const portfolio = buildPortfolioFromAlpaca(account, positions);
    const amd = portfolio.positions[0];

    expect(amd.todayChange).toBeCloseTo(1.5, 1); // 0.015 * 100
    expect(amd.unrealizedPlPercent).toBeCloseTo(3.33, 1); // 0.0333 * 100
  });
});

// === MINI VIEW P&L DISPLAY ===

describe("Mini View - P&L Column in Structure", () => {
  const content = fs.readFileSync(path.join(SRC_DIR, "components", "ticker-scores-panel.js"), "utf-8");

  it("has P/L column header in mini view", () => {
    expect(content).toContain("P/L");
  });

  it("has VALUE column header in mini view", () => {
    expect(content).toContain("VALUE");
  });

  it("positions map includes todayPct", () => {
    expect(content).toContain("todayPct");
  });

  it("shows green color for positive P&L", () => {
    expect(content).toContain('"#22c55e"');
  });

  it("shows red color for negative P&L", () => {
    expect(content).toContain('"#ef4444"');
  });

  it("formats P&L with sign and percentage", () => {
    // The P&L display uses toFixed(1) with sign prefix
    expect(content).toContain(".toFixed(1)");
  });
});

// === PORTFOLIO PANEL P&L DISPLAY ===

describe("Portfolio Panel - DayPL Component", () => {
  const content = fs.readFileSync(path.join(SRC_DIR, "components", "portfolio-panel.js"), "utf-8");

  it("has DayPL component", () => {
    expect(content).toContain("DayPL");
  });

  it("shows day change dollar amount", () => {
    expect(content).toContain("portfolio.dayChangeDollar");
  });

  it("shows day change percentage", () => {
    expect(content).toContain("portfolio.dayChange");
  });

  it("colors based on positive/negative", () => {
    expect(content).toContain("getPLColor");
  });
});

// === PORTFOLIO DATA STRUCTURE ===

describe("Portfolio Data - Field Completeness", () => {
  const content = fs.readFileSync(path.join(SRC_DIR, "data", "portfolio.js"), "utf-8");

  it("calculates dayChange from position P&L when equity change is near-zero", () => {
    expect(content).toContain("positionDayPnl");
    expect(content).toContain("formattedPositions.reduce");
  });

  it("calculates totalChange from cost basis, not equity comparison", () => {
    expect(content).toContain("totalPnl");
    expect(content).toContain("totalCostBasis");
  });

  it("formats positions before using them for portfolio calculations", () => {
    // formattedPositions must be created before dayChange fallback
    expect(content).toContain("const formattedPositions = filteredPositions.map(formatPosition)");
  });

  it("includes todayChange in position data", () => {
    expect(content).toContain("todayChange");
    expect(content).toContain("unrealizedPLPCToday * 100");
  });

  it("includes unrealizedPlPercent in position data", () => {
    expect(content).toContain("unrealizedPlPercent");
    expect(content).toContain("unrealizedPlpc * 100");
  });
});
