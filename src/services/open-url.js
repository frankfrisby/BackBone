import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const normalizeUrl = (url) => (
  url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `https://${url}`
);

const findChromeExecutableWin32 = () => {
  const candidates = [
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
};

export const openUrl = (url) => {
  const normalizedUrl = normalizeUrl(url);
  if (process.platform === "win32") {
    spawn("rundll32.exe", ["url.dll,FileProtocolHandler", normalizedUrl], { stdio: "ignore", detached: true });
    return;
  }
  if (process.platform === "darwin") {
    spawn("open", [normalizedUrl], { stdio: "ignore", detached: true });
    return;
  }
  spawn("xdg-open", [normalizedUrl], { stdio: "ignore", detached: true });
};

// Prefer Chrome when available. Useful for flows that require DevTools "Copy as cURL" from Chrome.
export const openUrlPreferChrome = (url) => {
  const normalizedUrl = normalizeUrl(url);

  if (process.platform === "win32") {
    const chrome = findChromeExecutableWin32();
    if (chrome) {
      spawn(chrome, ["--new-tab", normalizedUrl], { stdio: "ignore", detached: true });
      return;
    }
  }

  // Fallback to default browser.
  openUrl(normalizedUrl);
};
