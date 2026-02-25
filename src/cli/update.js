/**
 * backbone update — Self-update BACKBONE to the latest version
 *
 * Pulls the latest version from GitHub Packages registry.
 * Users must have authenticated with: npm login --registry=https://npm.pkg.github.com
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_PATH = path.join(__dirname, "../../package.json");

function getCurrentVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

function getLatestVersion() {
  try {
    const out = execSync("npm view @frankfrisby/backbone version --registry=https://npm.pkg.github.com", {
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out.trim();
  } catch {
    return null;
  }
}

export async function runUpdate(args) {
  const force = args.includes("--force") || args.includes("-f");
  const checkOnly = args.includes("--check") || args.includes("-c");

  const current = getCurrentVersion();
  console.log(`\n  Current version: \x1b[1mv${current}\x1b[0m`);

  console.log("  Checking for updates...");
  const latest = getLatestVersion();

  if (!latest) {
    console.log("  \x1b[31m✗\x1b[0m Could not reach registry. Are you authenticated?");
    console.log("");
    console.log("  To authenticate:");
    console.log("    npm login --registry=https://npm.pkg.github.com");
    console.log("    Username: your-github-username");
    console.log("    Password: your-personal-access-token (with read:packages scope)");
    console.log("");
    return;
  }

  console.log(`  Latest version:  \x1b[1mv${latest}\x1b[0m`);

  if (current === latest && !force) {
    console.log("  \x1b[32m✓\x1b[0m Already up to date.\n");
    return;
  }

  if (checkOnly) {
    if (current !== latest) {
      console.log(`  \x1b[33m↑\x1b[0m Update available: v${current} → v${latest}`);
      console.log("  Run \x1b[1mbackbone update\x1b[0m to install.\n");
    }
    return;
  }

  console.log(`\n  Updating v${current} → v${latest}...`);
  console.log("");

  try {
    execSync("npm install -g @frankfrisby/backbone@latest --registry=https://npm.pkg.github.com", {
      stdio: "inherit",
      timeout: 120000,
    });
    console.log("");
    console.log(`  \x1b[32m✓\x1b[0m Updated to v${latest}`);
    console.log("  Restart your terminal or run \x1b[1mbackbone\x1b[0m to use the new version.\n");
  } catch (err) {
    console.log(`  \x1b[31m✗\x1b[0m Update failed: ${err.message}`);
    console.log("  Try running manually: npm install -g @frankfrisby/backbone@latest\n");
  }
}
