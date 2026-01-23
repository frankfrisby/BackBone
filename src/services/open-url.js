import { spawn } from "node:child_process";

export const openUrl = (url) => {
  const normalizedUrl = url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `https://${url}`;
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
