/**
 * Overlay Renderer - targeted row/column updates using the Zig renderer
 *
 * Keeps Ink layout static while updating only the regions that change.
 */

import { getZigRenderer } from "./zig-renderer.js";

const buildLineKey = (segments) =>
  segments.map((seg) => `${seg.color || ""}:${seg.text}`).join("");

const padRight = (value, width) => {
  if (value.length >= width) return value.slice(0, width);
  return value + " ".repeat(width - value.length);
};

class OverlayRenderer {
  constructor({ fps = 8, silent = true } = {}) {
    this.renderer = getZigRenderer({ fps, silent });
    this.regions = new Map();
    this.nextLines = new Map();
    this.lastLineKeys = new Map();
    this.isRunning = false;
    this.intervalId = null;
  }

  setRegion(name, region) {
    this.regions.set(name, region);
  }

  clearRegion(name) {
    const region = this.regions.get(name);
    if (!region) return;
    const lineKeys = new Array(region.height).fill("");
    this.lastLineKeys.set(name, lineKeys);
    this.nextLines.set(name, new Array(region.height).fill([{ text: "" }]));
  }

  updateRegion(name, lines) {
    this.nextLines.set(name, lines);
  }

  render() {
    if (this.nextLines.size === 0) return;

    this.renderer.beginFrame();

    for (const [name, lines] of this.nextLines.entries()) {
      const region = this.regions.get(name);
      if (!region) continue;

      const lastKeys = this.lastLineKeys.get(name) || [];
      const nextKeys = [];

      for (let i = 0; i < region.height; i++) {
        const row = region.row + i;
        const segments = lines[i] || [];
        const key = buildLineKey(segments);
        nextKeys.push(key);

        if (lastKeys[i] === key) continue;

        // Clear line region
        this.renderer.writeAt(row, region.col, padRight("", region.width));

        // Render segments
        let col = region.col;
        for (const seg of segments) {
          if (!seg || !seg.text) continue;
          const text = seg.text;
          if (seg.color) {
            this.renderer.writeColored(row, col, text, seg.color);
          } else {
            this.renderer.writeAt(row, col, text);
          }
          col += text.length;
          if (col >= region.col + region.width) break;
        }
      }

      this.lastLineKeys.set(name, nextKeys);
    }

    this.renderer.endFrame();
    this.nextLines.clear();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    const interval = 1000 / this.renderer.targetFPS;
    this.intervalId = setInterval(() => this.render(), interval);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

let instance = null;

export const getOverlayRenderer = (options) => {
  if (!instance) {
    instance = new OverlayRenderer(options);
  }
  return instance;
};

export const buildLineSegments = (text, color = null) => [{ text, color }];

export default OverlayRenderer;
