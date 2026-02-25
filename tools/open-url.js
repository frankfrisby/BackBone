/**
 * Open URL — Opens a URL in the user's default system browser
 *
 * No dependencies. No API keys. Just opens the browser.
 * Uses: start (Windows), open (macOS), xdg-open (Linux)
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export default async function openUrl({ url }) {
  if (!url) {
    return { success: false, error: "URL is required" };
  }

  // Ensure URL has protocol
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  try {
    let command;
    switch (process.platform) {
      case "darwin":
        command = `open "${url}"`;
        break;
      case "win32":
        command = `start "" "${url}"`;
        break;
      default:
        command = `xdg-open "${url}"`;
    }

    await execAsync(command);
    return { success: true, url, message: `Opened ${url} in default browser` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// CLI support
if (process.argv[1] && process.argv[1].includes("open-url")) {
  const url = process.argv[2];
  if (!url) {
    console.log("Usage: node tools/open-url.js <url>");
    process.exit(1);
  }
  openUrl({ url }).then(r => console.log(JSON.stringify(r, null, 2)));
}
