/**
 * Right Sidecar Outcomes Limit Tests
 * Validates that outcomes are limited to 2 by default and expand to 5 based on terminal height
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const APP_PATH = path.join(process.cwd(), "src", "app.js");

describe("Sidecar Outcomes - Dynamic Height Limit", () => {
  const content = fs.readFileSync(APP_PATH, "utf-8");

  it("maxOutcomesToShow state defaults to 4 during loading", () => {
    expect(content).toContain("const [maxOutcomesToShow, setMaxOutcomesToShow] = useState(4)");
  });

  it("calculates height-based outcomes after loading", () => {
    expect(content).toContain("heightBasedOutcomes");
  });

  it("minimum outcomes is 2", () => {
    expect(content).toContain("Math.max(2,");
  });

  it("maximum outcomes is 5", () => {
    expect(content).toContain("Math.min(5,");
  });

  it("base threshold is 40 rows for 2 outcomes", () => {
    expect(content).toContain("(rows - 40)");
  });

  it("adds 1 outcome per 8 extra rows of height", () => {
    expect(content).toContain("/ 8)");
  });

  it("updates on terminal resize", () => {
    expect(content).toContain('process.stdout.on("resize", onResize)');
    expect(content).toContain('process.stdout.removeListener("resize", onResize)');
  });

  it("caps total outcomes (goals + observations) by maxOutcomesToShow", () => {
    expect(content).toContain("outcomeItems.length >= maxOutcomesToShow");
  });

  it("app height uses full terminal height", () => {
    expect(content).toContain("terminalHeight - 1");
  });
});

describe("Sidecar Outcomes - Height Calculation Logic", () => {
  // Test the formula: Math.min(5, Math.max(2, 2 + Math.floor((rows - 40) / 8)))
  const calc = (rows) => Math.min(5, Math.max(2, 2 + Math.floor((rows - 40) / 8)));

  it("30 rows = 2 outcomes (minimum)", () => {
    expect(calc(30)).toBe(2);
  });

  it("40 rows = 2 outcomes (base)", () => {
    expect(calc(40)).toBe(2);
  });

  it("48 rows = 3 outcomes", () => {
    expect(calc(48)).toBe(3);
  });

  it("56 rows = 4 outcomes", () => {
    expect(calc(56)).toBe(4);
  });

  it("64 rows = 5 outcomes (maximum)", () => {
    expect(calc(64)).toBe(5);
  });

  it("100 rows = 5 outcomes (capped at max)", () => {
    expect(calc(100)).toBe(5);
  });
});
