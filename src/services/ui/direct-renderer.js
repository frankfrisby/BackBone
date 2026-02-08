/**
 * Direct Terminal Renderer
 *
 * Bypasses React/Ink reconciliation for specific UI regions.
 * Uses synchronized output and double buffering for flicker-free rendering.
 *
 * Inspired by Zig-based terminal renderers like OpenTUI.
 */

import { createSignal, createEffect, batch } from "../trading/signals.js";

// ANSI escape sequences
const ESC = "\x1b";
const CSI = `${ESC}[`;

const ANSI = {
  // Cursor
  CURSOR_TO: (row, col) => `${CSI}${row};${col}H`,
  CURSOR_HIDE: `${CSI}?25l`,
  CURSOR_SHOW: `${CSI}?25h`,
  CURSOR_SAVE: `${ESC}7`,
  CURSOR_RESTORE: `${ESC}8`,

  // Clear
  CLEAR_LINE: `${CSI}2K`,
  CLEAR_TO_END: `${CSI}0K`,
  CLEAR_SCREEN: `${CSI}2J`,

  // Sync (prevents tearing)
  SYNC_START: `${CSI}?2026h`,
  SYNC_END: `${CSI}?2026l`,

  // Colors (24-bit)
  FG: (r, g, b) => `${CSI}38;2;${r};${g};${b}m`,
  BG: (r, g, b) => `${CSI}48;2;${r};${g};${b}m`,
  FG_HEX: (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${CSI}38;2;${r};${g};${b}m`;
  },
  BG_HEX: (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${CSI}48;2;${r};${g};${b}m`;
  },
  RESET: `${CSI}0m`,
  BOLD: `${CSI}1m`,
  DIM: `${CSI}2m`,
  ITALIC: `${CSI}3m`,
};

/**
 * Region - A specific area of the terminal that can be updated independently
 */
class Region {
  constructor(renderer, id, row, col, width, height) {
    this.renderer = renderer;
    this.id = id;
    this.row = row;
    this.col = col;
    this.width = width;
    this.height = height;
    this.lines = new Array(height).fill("");
    this.dirty = true;
  }

  /**
   * Clear the region
   */
  clear() {
    this.lines = new Array(this.height).fill("");
    this.dirty = true;
  }

  /**
   * Write text at a specific line within the region
   */
  writeLine(lineIndex, text, color = null, bold = false) {
    if (lineIndex < 0 || lineIndex >= this.height) return;

    let formatted = "";
    if (color) formatted += ANSI.FG_HEX(color);
    if (bold) formatted += ANSI.BOLD;
    formatted += text.slice(0, this.width);
    if (color || bold) formatted += ANSI.RESET;

    // Pad to width to clear old content
    const padding = " ".repeat(Math.max(0, this.width - text.length));

    if (this.lines[lineIndex] !== formatted + padding) {
      this.lines[lineIndex] = formatted + padding;
      this.dirty = true;
    }
  }

  /**
   * Write with multiple colors
   */
  writeStyled(lineIndex, segments) {
    if (lineIndex < 0 || lineIndex >= this.height) return;

    let formatted = "";
    let totalLength = 0;

    for (const seg of segments) {
      if (seg.color) formatted += ANSI.FG_HEX(seg.color);
      if (seg.bg) formatted += ANSI.BG_HEX(seg.bg);
      if (seg.bold) formatted += ANSI.BOLD;
      if (seg.dim) formatted += ANSI.DIM;
      if (seg.italic) formatted += ANSI.ITALIC;

      const text = seg.text?.slice(0, this.width - totalLength) || "";
      formatted += text;
      totalLength += text.length;

      formatted += ANSI.RESET;
    }

    const padding = " ".repeat(Math.max(0, this.width - totalLength));

    if (this.lines[lineIndex] !== formatted + padding) {
      this.lines[lineIndex] = formatted + padding;
      this.dirty = true;
    }
  }

  /**
   * Render this region to a buffer
   */
  render() {
    if (!this.dirty) return "";

    let output = "";
    for (let i = 0; i < this.height; i++) {
      output += ANSI.CURSOR_TO(this.row + i, this.col);
      output += this.lines[i] || " ".repeat(this.width);
    }

    this.dirty = false;
    return output;
  }
}

/**
 * Direct Renderer - Manages multiple regions with synchronized output
 */
class DirectRenderer {
  constructor(stdout = process.stdout) {
    this.stdout = stdout;
    this.regions = new Map();
    this.frameBuffer = "";
    this.lastFrame = "";
    this.frameCount = 0;
    this.isRendering = false;
    this.renderInterval = null;
    this.targetFps = 10; // 10fps max for stability

    // Terminal dimensions
    this.width = stdout.columns || 80;
    this.height = stdout.rows || 24;

    // Handle resize
    if (stdout.on) {
      stdout.on("resize", () => {
        this.width = stdout.columns || 80;
        this.height = stdout.rows || 24;
        this.markAllDirty();
      });
    }
  }

  /**
   * Create a region at a specific position
   */
  createRegion(id, row, col, width, height) {
    const region = new Region(this, id, row, col, width, height);
    this.regions.set(id, region);
    return region;
  }

  /**
   * Get a region by ID
   */
  getRegion(id) {
    return this.regions.get(id);
  }

  /**
   * Mark all regions as dirty (forces full redraw)
   */
  markAllDirty() {
    for (const region of this.regions.values()) {
      region.dirty = true;
    }
  }

  /**
   * Render all dirty regions
   */
  render() {
    let output = "";

    for (const region of this.regions.values()) {
      output += region.render();
    }

    // Only write if something changed
    if (output && output !== this.lastFrame) {
      // Use sync mode to prevent tearing
      this.stdout.write(
        ANSI.SYNC_START +
        ANSI.CURSOR_SAVE +
        output +
        ANSI.CURSOR_RESTORE +
        ANSI.SYNC_END
      );
      this.lastFrame = output;
      this.frameCount++;
    }
  }

  /**
   * Start the render loop
   */
  start() {
    if (this.isRendering) return;
    this.isRendering = true;

    const interval = Math.floor(1000 / this.targetFps);
    this.renderInterval = setInterval(() => {
      this.render();
    }, interval);
  }

  /**
   * Stop the render loop
   */
  stop() {
    this.isRendering = false;
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }
  }

  /**
   * Force immediate render
   */
  flush() {
    this.markAllDirty();
    this.render();
  }
}

// Singleton instance
let instance = null;

export const getDirectRenderer = (stdout) => {
  if (!instance) {
    instance = new DirectRenderer(stdout);
  }
  return instance;
};

export { ANSI, Region, DirectRenderer };
export default DirectRenderer;
