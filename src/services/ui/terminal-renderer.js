/**
 * High-Performance Terminal Renderer
 *
 * Implements the same techniques used by Zig-based renderers (OpenTUI):
 * 1. Synchronized Output - Uses terminal sync sequences to prevent tearing
 * 2. Double Buffering - Renders to buffer, writes atomically
 * 3. Differential Updates - Only updates changed content
 * 4. Cursor Management - Hides cursor during updates
 *
 * This provides flicker-free rendering without requiring Zig compilation.
 */

import { EventEmitter } from "events";

// Terminal escape sequences
const ESC = "\x1b";
const CSI = `${ESC}[`;

// Synchronized output (supported by modern terminals: iTerm2, Windows Terminal, etc.)
const SYNC_START = `${CSI}?2026h`;  // Begin synchronized update
const SYNC_END = `${CSI}?2026l`;    // End synchronized update

// Cursor control
const CURSOR_HIDE = `${CSI}?25l`;
const CURSOR_SHOW = `${CSI}?25h`;
const CURSOR_HOME = `${CSI}H`;
const CURSOR_SAVE = `${ESC}7`;
const CURSOR_RESTORE = `${ESC}8`;

// Screen control
const CLEAR_SCREEN = `${CSI}2J`;
const CLEAR_LINE = `${CSI}2K`;
const CLEAR_TO_END = `${CSI}0J`;

// Move cursor
const moveTo = (row, col) => `${CSI}${row};${col}H`;
const moveUp = (n = 1) => `${CSI}${n}A`;
const moveDown = (n = 1) => `${CSI}${n}B`;

class TerminalRenderer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.stdout = options.stdout || process.stdout;
    this.width = this.stdout.columns || 80;
    this.height = this.stdout.rows || 24;

    // Double buffer
    this.frontBuffer = [];
    this.backBuffer = [];

    // Frame timing
    this.targetFPS = options.fps || 30;
    this.frameInterval = 1000 / this.targetFPS;
    this.lastFrameTime = 0;
    this.frameCount = 0;

    // Dirty tracking
    this.isDirty = false;
    this.dirtyRegions = new Set();

    // Rendering state
    this.isRendering = false;
    this.pendingRender = null;

    // Initialize buffers
    this.initBuffers();

    // Handle terminal resize
    if (this.stdout.on) {
      this.stdout.on("resize", () => this.handleResize());
    }
  }

  /**
   * Initialize double buffers
   */
  initBuffers() {
    const size = this.width * this.height;
    this.frontBuffer = new Array(size).fill(" ");
    this.backBuffer = new Array(size).fill(" ");
  }

  /**
   * Handle terminal resize
   */
  handleResize() {
    this.width = this.stdout.columns || 80;
    this.height = this.stdout.rows || 24;
    this.initBuffers();
    this.isDirty = true;
    this.emit("resize", { width: this.width, height: this.height });
  }

  /**
   * Write a string at position (atomic buffer write)
   */
  write(row, col, text, maxWidth = null) {
    if (row < 0 || row >= this.height) return;
    if (col < 0 || col >= this.width) return;

    const width = maxWidth || (this.width - col);
    const truncated = text.slice(0, width);

    for (let i = 0; i < truncated.length && col + i < this.width; i++) {
      const idx = row * this.width + col + i;
      if (this.backBuffer[idx] !== truncated[i]) {
        this.backBuffer[idx] = truncated[i];
        this.dirtyRegions.add(row);
        this.isDirty = true;
      }
    }
  }

  /**
   * Clear a region
   */
  clearRegion(startRow, startCol, endRow, endCol) {
    for (let row = startRow; row <= endRow && row < this.height; row++) {
      for (let col = startCol; col <= endCol && col < this.width; col++) {
        const idx = row * this.width + col;
        if (this.backBuffer[idx] !== " ") {
          this.backBuffer[idx] = " ";
          this.dirtyRegions.add(row);
          this.isDirty = true;
        }
      }
    }
  }

  /**
   * Clear entire back buffer
   */
  clear() {
    for (let i = 0; i < this.backBuffer.length; i++) {
      this.backBuffer[i] = " ";
    }
    this.isDirty = true;
    for (let i = 0; i < this.height; i++) {
      this.dirtyRegions.add(i);
    }
  }

  /**
   * Render frame - uses synchronized output for flicker-free updates
   */
  render() {
    if (!this.isDirty) return;
    if (this.isRendering) {
      this.pendingRender = true;
      return;
    }

    this.isRendering = true;

    // Build output string atomically
    let output = "";

    // Start synchronized update (prevents tearing)
    output += SYNC_START;
    output += CURSOR_HIDE;
    output += CURSOR_SAVE;

    // Only update dirty rows (differential update)
    const sortedRows = Array.from(this.dirtyRegions).sort((a, b) => a - b);

    for (const row of sortedRows) {
      output += moveTo(row + 1, 1);

      // Build row content
      let rowContent = "";
      for (let col = 0; col < this.width; col++) {
        const idx = row * this.width + col;
        rowContent += this.backBuffer[idx];
        // Update front buffer
        this.frontBuffer[idx] = this.backBuffer[idx];
      }

      output += rowContent;
    }

    // End synchronized update
    output += CURSOR_RESTORE;
    output += CURSOR_SHOW;
    output += SYNC_END;

    // Atomic write to terminal
    this.stdout.write(output);

    // Reset dirty state
    this.isDirty = false;
    this.dirtyRegions.clear();
    this.frameCount++;
    this.lastFrameTime = Date.now();

    this.isRendering = false;

    // Process pending render
    if (this.pendingRender) {
      this.pendingRender = false;
      setImmediate(() => this.render());
    }

    this.emit("frame", this.frameCount);
  }

  /**
   * Request animation frame (throttled to target FPS)
   */
  requestFrame(callback) {
    const now = Date.now();
    const elapsed = now - this.lastFrameTime;
    const delay = Math.max(0, this.frameInterval - elapsed);

    setTimeout(() => {
      callback();
      this.render();
    }, delay);
  }

  /**
   * Start render loop
   */
  startLoop(renderCallback) {
    const loop = () => {
      renderCallback(this);
      this.render();
      this.loopId = setTimeout(loop, this.frameInterval);
    };
    loop();
  }

  /**
   * Stop render loop
   */
  stopLoop() {
    if (this.loopId) {
      clearTimeout(this.loopId);
      this.loopId = null;
    }
  }

  /**
   * Get performance stats
   */
  getStats() {
    return {
      fps: this.targetFPS,
      frameCount: this.frameCount,
      bufferSize: this.backBuffer.length,
      width: this.width,
      height: this.height
    };
  }
}

// Singleton instance
let instance = null;

export const getTerminalRenderer = (options) => {
  if (!instance) {
    instance = new TerminalRenderer(options);
  }
  return instance;
};

export default TerminalRenderer;
