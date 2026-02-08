/**
 * SPY Indicator Tests
 * Validates that SPY market direction indicator shows with arrows in ticker views
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const TICKER_PANEL = path.join(process.cwd(), "src", "components", "ticker-scores-panel.js");

describe("SPY Indicator - Mini View", () => {
  const content = fs.readFileSync(TICKER_PANEL, "utf-8");

  it("shows SPY with arrow indicator", () => {
    expect(content).toContain('SPY ${spyPositive ? "▲" : "▼"}');
  });

  it("uses green color for positive SPY", () => {
    // Check that spyPositive === true maps to green
    expect(content).toContain('color: spyPositive ? "#22c55e" : "#ef4444"');
  });

  it("SPY indicator is bold", () => {
    expect(content).toContain("bold: true");
  });

  it("shows SPY percentage with sign", () => {
    expect(content).toContain('spyChange >= 0 ? "+" : ""');
  });

  it("uses toFixed for percentage formatting", () => {
    // Mini view uses 1 decimal, full view uses 2 decimals
    expect(content).toContain("spyChange?.toFixed(1)");
    expect(content).toContain("spyChange?.toFixed(2)");
  });
});

describe("SPY Indicator - Full View", () => {
  const content = fs.readFileSync(TICKER_PANEL, "utf-8");

  it("full view also has SPY with arrow", () => {
    // Should have arrow in both mini and full views
    const arrowMatches = content.match(/SPY \$\{spyPositive \? "▲" : "▼"\}/g);
    expect(arrowMatches).not.toBeNull();
    expect(arrowMatches.length).toBeGreaterThanOrEqual(2);
  });
});

describe("SPY Indicator - Props Flow", () => {
  const leftColumnContent = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "left-column.js"), "utf-8"
  );

  it("left column passes spyPositive to ticker panel", () => {
    expect(leftColumnContent).toContain("spyPositive:");
  });

  it("left column passes spyChange to ticker panel", () => {
    expect(leftColumnContent).toContain("spyChange:");
  });

  it("left column memo compares SPY data", () => {
    expect(leftColumnContent).toContain("prevProps.spyPositive !== nextProps.spyPositive");
    expect(leftColumnContent).toContain("prevProps.spyChange !== nextProps.spyChange");
  });
});

describe("SPY Indicator - Portfolio Panel", () => {
  const portfolioContent = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "portfolio-panel.js"), "utf-8"
  );
  const rightColumnContent = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "right-column.js"), "utf-8"
  );

  it("portfolio panel accepts spyData prop", () => {
    expect(portfolioContent).toContain("spyData = null");
  });

  it("portfolio panel shows SPY with arrow on its own row", () => {
    expect(portfolioContent).toContain('SPY ${spyData.positive ? "▲" : "▼"}');
    expect(portfolioContent).toContain("SPY MARKET INDICATOR");
  });

  it("portfolio panel colors SPY green/red", () => {
    expect(portfolioContent).toContain('spyData.positive ? "#22c55e" : "#ef4444"');
  });

  it("portfolio panel shows Gained/Lost label for day P/L", () => {
    expect(portfolioContent).toContain('"Gained"');
    expect(portfolioContent).toContain('"Lost"');
  });

  it("right column computes spyData from tickers", () => {
    expect(rightColumnContent).toContain('tickers?.find(t => t.symbol === "SPY")');
  });

  it("right column passes spyData to portfolio panel", () => {
    expect(rightColumnContent).toContain("spyData,");
  });
});
