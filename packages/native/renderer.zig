// High-Performance Terminal Renderer in Zig
// Compile: zig build-lib -O ReleaseFast -target wasm32-freestanding renderer.zig
// Or for native: zig build-lib -O ReleaseFast -dynamic renderer.zig

const std = @import("std");

// Buffer for terminal output (double buffered)
const MAX_BUFFER_SIZE = 1024 * 64; // 64KB buffer
var front_buffer: [MAX_BUFFER_SIZE]u8 = undefined;
var back_buffer: [MAX_BUFFER_SIZE]u8 = undefined;
var buffer_len: usize = 0;

// Terminal dimensions
var term_width: u32 = 80;
var term_height: u32 = 24;

// Frame counter
var frame_count: u64 = 0;

// ANSI escape sequences
const ESC = "\x1b";
const CSI = ESC ++ "[";

// Synchronized output (prevents tearing)
const SYNC_START = CSI ++ "?2026h";
const SYNC_END = CSI ++ "?2026l";

// Cursor control
const CURSOR_HIDE = CSI ++ "?25l";
const CURSOR_SHOW = CSI ++ "?25h";
const CURSOR_HOME = CSI ++ "H";

// Export functions for Node.js FFI

/// Initialize the renderer with terminal dimensions
export fn init(width: u32, height: u32) void {
    term_width = width;
    term_height = height;
    buffer_len = 0;
    frame_count = 0;
    @memset(&front_buffer, ' ');
    @memset(&back_buffer, ' ');
}

/// Begin a new frame
export fn begin_frame() void {
    buffer_len = 0;
    // Start synchronized output
    append_string(SYNC_START);
    append_string(CURSOR_HIDE);
    append_string(CURSOR_HOME);
}

/// Write text at position
export fn write_at(row: u32, col: u32, text_ptr: [*]const u8, text_len: usize) void {
    if (row >= term_height or col >= term_width) return;

    // Move cursor to position
    move_cursor(row, col);

    // Calculate max length to prevent overflow
    const max_len = @min(text_len, term_width - col);

    // Append text
    if (buffer_len + max_len < MAX_BUFFER_SIZE) {
        @memcpy(back_buffer[buffer_len..][0..max_len], text_ptr[0..max_len]);
        buffer_len += max_len;
    }
}

/// Write a single character at position
export fn write_char(row: u32, col: u32, char: u8) void {
    if (row >= term_height or col >= term_width) return;
    if (buffer_len >= MAX_BUFFER_SIZE) return;

    move_cursor(row, col);
    back_buffer[buffer_len] = char;
    buffer_len += 1;
}

/// Clear the screen
export fn clear() void {
    append_string(CSI ++ "2J");
    append_string(CURSOR_HOME);
}

/// End frame and return buffer for output
export fn end_frame() usize {
    // End synchronized output
    append_string(CURSOR_SHOW);
    append_string(SYNC_END);

    // Swap buffers
    @memcpy(&front_buffer, &back_buffer);

    frame_count += 1;
    return buffer_len;
}

/// Get the output buffer pointer
export fn get_buffer() [*]const u8 {
    return &front_buffer;
}

/// Get current frame count
export fn get_frame_count() u64 {
    return frame_count;
}

/// Get buffer length
export fn get_buffer_len() usize {
    return buffer_len;
}

// Internal helpers

fn move_cursor(row: u32, col: u32) void {
    // Build escape sequence: ESC[row;colH
    var seq_buf: [16]u8 = undefined;
    const seq = std.fmt.bufPrint(&seq_buf, CSI ++ "{d};{d}H", .{ row + 1, col + 1 }) catch return;
    append_bytes(seq);
}

fn append_string(str: []const u8) void {
    append_bytes(str);
}

fn append_bytes(bytes: []const u8) void {
    if (buffer_len + bytes.len >= MAX_BUFFER_SIZE) return;
    @memcpy(back_buffer[buffer_len..][0..bytes.len], bytes);
    buffer_len += bytes.len;
}

// Color support
const Color = enum(u8) {
    black = 0,
    red = 1,
    green = 2,
    yellow = 3,
    blue = 4,
    magenta = 5,
    cyan = 6,
    white = 7,
    default = 9,
};

/// Set foreground color
export fn set_fg_color(color: u8) void {
    var buf: [8]u8 = undefined;
    const seq = std.fmt.bufPrint(&buf, CSI ++ "3{d}m", .{color}) catch return;
    append_bytes(seq);
}

/// Set background color
export fn set_bg_color(color: u8) void {
    var buf: [8]u8 = undefined;
    const seq = std.fmt.bufPrint(&buf, CSI ++ "4{d}m", .{color}) catch return;
    append_bytes(seq);
}

/// Set RGB foreground color
export fn set_fg_rgb(r: u8, g: u8, b: u8) void {
    var buf: [24]u8 = undefined;
    const seq = std.fmt.bufPrint(&buf, CSI ++ "38;2;{d};{d};{d}m", .{ r, g, b }) catch return;
    append_bytes(seq);
}

/// Set RGB background color
export fn set_bg_rgb(r: u8, g: u8, b: u8) void {
    var buf: [24]u8 = undefined;
    const seq = std.fmt.bufPrint(&buf, CSI ++ "48;2;{d};{d};{d}m", .{ r, g, b }) catch return;
    append_bytes(seq);
}

/// Reset colors and attributes
export fn reset_style() void {
    append_string(CSI ++ "0m");
}

/// Set bold
export fn set_bold() void {
    append_string(CSI ++ "1m");
}

/// Set dim
export fn set_dim() void {
    append_string(CSI ++ "2m");
}

// Test entry point (for standalone testing)
pub fn main() !void {
    const stdout = std.io.getStdOut().writer();

    init(80, 24);
    begin_frame();
    clear();

    // Write some test content
    const test_text = "Hello from Zig!";
    write_at(0, 0, test_text, test_text.len);

    set_fg_rgb(0, 255, 0);
    const green_text = "This is green";
    write_at(1, 0, green_text, green_text.len);

    reset_style();

    const len = end_frame();
    const buf = get_buffer();

    try stdout.writeAll(buf[0..len]);
}
