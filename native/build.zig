const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Build as shared library for Node.js FFI
    const lib = b.addSharedLibrary(.{
        .name = "renderer",
        .root_source_file = .{ .path = "renderer.zig" },
        .target = target,
        .optimize = optimize,
    });

    b.installArtifact(lib);

    // Also build as WASM for universal compatibility
    const wasm = b.addSharedLibrary(.{
        .name = "renderer-wasm",
        .root_source_file = .{ .path = "renderer.zig" },
        .target = .{
            .cpu_arch = .wasm32,
            .os_tag = .freestanding,
        },
        .optimize = .ReleaseFast,
    });

    // Export all functions
    wasm.export_symbol_names = &[_][]const u8{
        "init",
        "begin_frame",
        "write_at",
        "write_char",
        "clear",
        "end_frame",
        "get_buffer",
        "get_frame_count",
        "get_buffer_len",
        "set_fg_color",
        "set_bg_color",
        "set_fg_rgb",
        "set_bg_rgb",
        "reset_style",
        "set_bold",
        "set_dim",
    };

    b.installArtifact(wasm);

    // Test executable
    const exe = b.addExecutable(.{
        .name = "renderer-test",
        .root_source_file = .{ .path = "renderer.zig" },
        .target = target,
        .optimize = optimize,
    });

    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());

    const run_step = b.step("run", "Run the test");
    run_step.dependOn(&run_cmd.step);
}
