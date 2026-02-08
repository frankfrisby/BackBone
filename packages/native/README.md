# Zig Native Renderer

High-performance terminal renderer written in Zig for flicker-free output.

## Features

- **Synchronized Output** - Uses terminal sync sequences (`\x1b[?2026h/l`) to prevent tearing
- **Double Buffering** - Renders to buffer, writes atomically
- **Zero-Copy** - Efficient memory management
- **Cross-Platform** - Compiles to Windows DLL, Linux .so, macOS .dylib, or WebAssembly

## Building

### Prerequisites

Download Zig from https://ziglang.org/download/

### Build Commands

```bash
# Build shared library (native)
cd native
zig build -Doptimize=ReleaseFast

# Build for specific target
zig build-lib -O ReleaseFast -target x86_64-windows renderer.zig  # Windows
zig build-lib -O ReleaseFast -target x86_64-linux renderer.zig    # Linux
zig build-lib -O ReleaseFast -target x86_64-macos renderer.zig    # macOS

# Build WebAssembly
zig build-lib -O ReleaseFast -target wasm32-freestanding renderer.zig
```

### Output

The compiled library will be in `zig-out/lib/`:
- Windows: `renderer.dll`
- Linux: `librenderer.so`
- macOS: `librenderer.dylib`
- WASM: `renderer.wasm`

## Usage

The JavaScript wrapper at `src/services/zig-renderer.js` will automatically detect and use the native library if available.

```javascript
import { getZigRenderer } from './services/zig-renderer.js';

const renderer = getZigRenderer();

// Render a frame
renderer.frame((r) => {
  r.writeAt(0, 0, "Hello from Zig!");
  r.writeColored(1, 0, "Green text", "#00ff00");
});

// Or start an animation loop
renderer.startLoop((r) => {
  r.clear();
  r.writeAt(0, 0, `Frame: ${r.frameCount}`);
});
```

## API

### Exported Functions

| Function | Description |
|----------|-------------|
| `init(width, height)` | Initialize renderer with terminal dimensions |
| `begin_frame()` | Start a new frame (enables sync mode) |
| `write_at(row, col, text, len)` | Write text at position |
| `write_char(row, col, char)` | Write single character |
| `clear()` | Clear screen |
| `end_frame()` | End frame and return buffer length |
| `get_buffer()` | Get pointer to output buffer |
| `set_fg_rgb(r, g, b)` | Set foreground color (24-bit) |
| `set_bg_rgb(r, g, b)` | Set background color (24-bit) |
| `reset_style()` | Reset all text attributes |

## Performance

The Zig renderer provides:
- ~10x faster escape sequence generation than JavaScript
- Zero GC pauses (no garbage collection)
- Minimal memory allocations
- Native SIMD optimizations (when available)

## Fallback

If the native library is not available, the system automatically falls back to an optimized JavaScript implementation that uses the same synchronized output techniques.
