/**
 * No Secondary Window Tests
 * Validates that the app does not spawn secondary CLI windows on startup
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const APP_PATH = path.join(process.cwd(), "src", "app.js");

describe("No Secondary CLI Window on Startup", () => {
  const content = fs.readFileSync(APP_PATH, "utf-8");

  it("does not spawn QR code window on startup", () => {
    // The old code spawned "wt" or "cmd /c start" to show QR code
    expect(content).not.toContain('spawn("wt", ["-w", "0", "sp"');
    expect(content).not.toContain('spawn("cmd", ["/c", "start", "BACKBONE Connect"');
  });

  it("does not spawn any secondary terminal on startup", () => {
    // Ensure no auto-spawning of visible CLI windows on app start
    expect(content).not.toContain("show-connect-qr.js");
  });

  it("has comment explaining the removal", () => {
    expect(content).toContain("no secondary window");
  });
});
