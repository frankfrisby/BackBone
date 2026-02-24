/**
 * Terminal theme utilities for CLI output.
 * Inspired by OpenClaw's theme.js — consistent ANSI styling.
 */

const isRich = () => process.stdout.isTTY && !process.env.NO_COLOR;

const c = (code) => (text) => isRich() ? `\x1b[${code}m${text}\x1b[0m` : text;

export const theme = {
  heading: c("1;36"),     // bold cyan
  success: c("32"),       // green
  warn: c("33"),          // yellow
  error: c("31"),         // red
  info: c("34"),          // blue
  muted: c("90"),         // gray
  accent: c("35"),        // magenta
  bold: c("1"),           // bold
  dim: c("2"),            // dim
};

export const symbols = {
  check: isRich() ? "✓" : "[OK]",
  cross: isRich() ? "✗" : "[FAIL]",
  warn: isRich() ? "⚠" : "[WARN]",
  info: isRich() ? "●" : "[INFO]",
  dot: isRich() ? "·" : "-",
  arrow: isRich() ? "→" : "->",
};

export function label(key, value) {
  return `  ${theme.muted(key + ":")} ${value}`;
}

export function section(title) {
  return `\n${theme.heading(title)}`;
}

export function ok(text) {
  return `  ${theme.success(symbols.check)} ${text}`;
}

export function fail(text) {
  return `  ${theme.error(symbols.cross)} ${text}`;
}

export function warn(text) {
  return `  ${theme.warn(symbols.warn)} ${text}`;
}

export function info(text) {
  return `  ${theme.info(symbols.info)} ${text}`;
}
