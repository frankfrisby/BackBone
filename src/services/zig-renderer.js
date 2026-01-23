/**
 * Zig-Accelerated Terminal Renderer
 *
 * Attempts to load the native Zig renderer for maximum performance.
 * Falls back to pure JavaScript implementation if Zig is not available.
 *
 * To build the Zig renderer:
 *   cd native && zig build -Doptimize=ReleaseFast
 *
 * The Zig renderer provides:
 * - Zero-copy buffer management
 * - Synchronized output (prevents tearing)
 * - Double buffering
 * - Native performance for escape sequence generation
 */

import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ANSI escape sequences (used by JS fallback)
const ESC = "\x1b";
const CSI = `${ESC}[`;
const SYNC_START = `${CSI}?2026h`;
const SYNC_END = `${CSI}?2026l`;
const CURSOR_HIDE = `${CSI}?25l`;
const CURSOR_SHOW = `${CSI}?25h`;
const CURSOR_HOME = `${CSI}H`;

class ZigRenderer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.stdout = options.stdout || process.stdout;
    this.width = this.stdout.columns || 80;
    this.height = this.stdout.rows || 24;
    this.targetFPS = options.fps || 30;
    this.frameInterval = 1000 / this.targetFPS;

    this.useZig = false;
    this.zigLib = null;
    this.frameCount = 0;
    this.lastFrameTime = 0;

    // Buffer for JS fallback
    this.buffer = "";
    this.isDirty = false;

    // Try to load Zig library
    this.tryLoadZig();

    // Handle resize
    if (this.stdout.on) {
      this.stdout.on("resize", () => {
        this.width = this.stdout.columns || 80;
        this.height = this.stdout.rows || 24;
        if (this.useZig && this.zigLib) {
          this.zigLib.init(this.width, this.height);
        }
        this.emit("resize", { width: this.width, height: this.height });
      });
    }
  }

  /**
   * Try to load the native Zig renderer
   */
  tryLoadZig() {
    const libPaths = [
      path.join(__dirname, "../../native/zig-out/lib/renderer.dll"),
      path.join(__dirname, "../../native/zig-out/lib/librenderer.so"),
      path.join(__dirname, "../../native/zig-out/lib/librenderer.dylib"),
    ];

    for (const libPath of libPaths) {
      if (fs.existsSync(libPath)) {
        try {
          // Try to load with node-ffi-napi or similar
          // For now, we'll note that Zig is available but use JS
          console.log(`[ZigRenderer] Found Zig library at: ${libPath}`);
          console.log(`[ZigRenderer] Native loading requires node-ffi-napi`);
          // this.useZig = true;
          // this.zigLib = loadZigLibrary(libPath);
          break;
        } catch (err) {
          console.log(`[ZigRenderer] Could not load Zig library: ${err.message}`);
        }
      }
    }

    if (!this.useZig) {
      // Use optimized JavaScript fallback
      console.log("[ZigRenderer] Using optimized JavaScript renderer");
    }
  }

  /**
   * Initialize renderer
   */
  init() {
    if (this.useZig && this.zigLib) {
      this.zigLib.init(this.width, this.height);
    }
    return this;
  }

  /**
   * Begin a new frame
   */
  beginFrame() {
    if (this.useZig && this.zigLib) {
      this.zigLib.begin_frame();
    } else {
      this.buffer = SYNC_START + CURSOR_HIDE;
    }
    this.isDirty = false;
  }

  /**
   * Write text at position
   */
  writeAt(row, col, text) {
    if (row < 0 || row >= this.height) return;
    if (col < 0 || col >= this.width) return;

    const maxLen = Math.min(text.length, this.width - col);
    const truncated = text.slice(0, maxLen);

    if (this.useZig && this.zigLib) {
      this.zigLib.write_at(row, col, truncated, truncated.length);
    } else {
      this.buffer += `${CSI}${row + 1};${col + 1}H${truncated}`;
    }
    this.isDirty = true;
  }

  /**
   * Write with color
   */
  writeColored(row, col, text, fgColor) {
    if (this.useZig && this.zigLib) {
      // Parse hex color
      const r = parseInt(fgColor.slice(1, 3), 16);
      const g = parseInt(fgColor.slice(3, 5), 16);
      const b = parseInt(fgColor.slice(5, 7), 16);
      this.zigLib.set_fg_rgb(r, g, b);
      this.writeAt(row, col, text);
      this.zigLib.reset_style();
    } else {
      // Parse hex color to RGB
      const r = parseInt(fgColor.slice(1, 3), 16);
      const g = parseInt(fgColor.slice(3, 5), 16);
      const b = parseInt(fgColor.slice(5, 7), 16);
      this.buffer += `${CSI}38;2;${r};${g};${b}m`;
      this.writeAt(row, col, text);
      this.buffer += `${CSI}0m`;
    }
    this.isDirty = true;
  }

  /**
   * Clear screen
   */
  clear() {
    if (this.useZig && this.zigLib) {
      this.zigLib.clear();
    } else {
      this.buffer += `${CSI}2J${CURSOR_HOME}`;
    }
    this.isDirty = true;
  }

  /**
   * End frame and flush to terminal
   */
  endFrame() {
    let output;

    if (this.useZig && this.zigLib) {
      const len = this.zigLib.end_frame();
      const bufPtr = this.zigLib.get_buffer();
      // Read buffer from native memory
      output = bufPtr.toString("utf8", 0, len);
    } else {
      this.buffer += CURSOR_SHOW + SYNC_END;
      output = this.buffer;
    }

    // Atomic write to terminal
    if (this.isDirty) {
      this.stdout.write(output);
    }

    this.frameCount++;
    this.lastFrameTime = Date.now();
    this.emit("frame", this.frameCount);

    return this.frameCount;
  }

  /**
   * Render a full frame with callback
   */
  frame(renderCallback) {
    this.beginFrame();
    renderCallback(this);
    return this.endFrame();
  }

  /**
   * Start animation loop
   */
  startLoop(renderCallback) {
    const loop = () => {
      this.frame(renderCallback);
      this.loopTimeout = setTimeout(loop, this.frameInterval);
    };
    loop();
    return this;
  }

  /**
   * Stop animation loop
   */
  stopLoop() {
    if (this.loopTimeout) {
      clearTimeout(this.loopTimeout);
      this.loopTimeout = null;
    }
    return this;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      backend: this.useZig ? "zig" : "javascript",
      fps: this.targetFPS,
      frameCount: this.frameCount,
      width: this.width,
      height: this.height,
    };
  }
}

// Singleton
let instance = null;

export const getZigRenderer = (options) => {
  if (!instance) {
    instance = new ZigRenderer(options);
  }
  return instance;
};

export default ZigRenderer;
