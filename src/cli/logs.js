/**
 * backbone logs — Tail runtime diagnostic log
 *
 * Inspired by OpenClaw's `openclaw logs --follow`.
 * Tails the runtime.log file with optional follow mode.
 */

import fs from "fs";
import { dataFile } from "../services/paths.js";
import { theme } from "./theme.js";

const HELP = `
backbone logs — Tail runtime diagnostic log

Usage: backbone logs [options]

Options:
  --follow, -f   Follow log output (like tail -f)
  --lines, -n    Number of lines to show (default: 50)
  --filter       Filter lines matching pattern
  --errors       Show only errors and warnings
  --json         Output as JSON
  --help         Show this help
`;

function parseLogLine(raw) {
  // Format: [2026-02-24T04:14:38.242Z] [INFO] message
  const match = raw.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/);
  if (!match) return { time: null, level: null, message: raw };
  return { time: match[1], level: match[2], message: match[3] };
}

function colorizeLevel(level) {
  switch (level) {
    case "ERROR": return theme.error(level.padEnd(6));
    case "WARN": return theme.warn(level.padEnd(6));
    case "STDERR": return theme.warn(level.padEnd(6));
    case "INFO": return theme.info(level.padEnd(6));
    case "DEBUG": return theme.muted(level.padEnd(6));
    case "SYSTEM": return theme.accent(level.padEnd(6));
    default: return theme.muted((level || "").padEnd(6));
  }
}

function formatLine(raw, opts = {}) {
  const { time, level, message } = parseLogLine(raw);
  if (opts.errors && level !== "ERROR" && level !== "WARN" && level !== "STDERR") return null;
  if (opts.filter && !raw.toLowerCase().includes(opts.filter.toLowerCase())) return null;

  if (opts.json) {
    return JSON.stringify({ time, level, message });
  }

  const timeStr = time ? theme.muted(time.slice(11, 19)) : theme.muted("--------");
  return `${timeStr} ${colorizeLevel(level)} ${message}`;
}

function tailFile(filePath, numLines) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  return lines.slice(-numLines);
}

export async function runLogs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  const follow = args.includes("--follow") || args.includes("-f");
  const errors = args.includes("--errors");
  const json = args.includes("--json");

  // Parse --lines or -n
  let numLines = 50;
  const linesIdx = args.indexOf("--lines");
  const nIdx = args.indexOf("-n");
  if (linesIdx >= 0 && args[linesIdx + 1]) numLines = parseInt(args[linesIdx + 1]) || 50;
  else if (nIdx >= 0 && args[nIdx + 1]) numLines = parseInt(args[nIdx + 1]) || 50;

  // Parse --filter
  let filter = null;
  const filterIdx = args.indexOf("--filter");
  if (filterIdx >= 0 && args[filterIdx + 1]) filter = args[filterIdx + 1];

  const logPath = dataFile("runtime.log");

  if (!fs.existsSync(logPath)) {
    console.log(theme.warn("No runtime.log found. Start backbone first."));
    return;
  }

  const opts = { errors, json, filter };

  // Show initial lines
  if (!json) {
    console.log(theme.muted(`Log file: ${logPath}`));
    console.log("");
  }

  const lines = tailFile(logPath, numLines);
  for (const line of lines) {
    const formatted = formatLine(line, opts);
    if (formatted !== null) console.log(formatted);
  }

  if (!follow) return;

  // Follow mode — watch for changes
  if (!json) console.log(theme.muted("\n--- Following log (Ctrl+C to stop) ---\n"));

  let lastSize = fs.statSync(logPath).size;

  const watcher = fs.watchFile(logPath, { interval: 500 }, () => {
    try {
      const stat = fs.statSync(logPath);
      if (stat.size <= lastSize) {
        lastSize = stat.size;
        return;
      }
      // Read only new content
      const fd = fs.openSync(logPath, "r");
      const buf = Buffer.alloc(stat.size - lastSize);
      fs.readSync(fd, buf, 0, buf.length, lastSize);
      fs.closeSync(fd);
      lastSize = stat.size;

      const newLines = buf.toString("utf-8").split("\n").filter(Boolean);
      for (const line of newLines) {
        const formatted = formatLine(line, opts);
        if (formatted !== null) console.log(formatted);
      }
    } catch {}
  });

  // Keep process alive
  await new Promise(() => {});
}
