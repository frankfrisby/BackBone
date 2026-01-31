#!/usr/bin/env node

/**
 * BACKBONE Portable Build Script
 *
 * Creates a self-contained portable distribution that works without
 * any global Node.js install. Downloads a portable Node.js binary
 * and packages everything into dist/BackBone/.
 *
 * The result can be:
 * - Zipped and distributed
 * - Used by the Inno Setup installer
 * - Copied to any Windows machine and run via BackBone.cmd
 *
 * Usage: node scripts/build-portable.js [--no-node]
 *   --no-node: Skip downloading Node.js (user must have Node in PATH)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import https from "https";
import { createWriteStream, mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist", "BackBone");

const NODE_VERSION = "v22.13.0";
const NODE_URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`;

const skipNode = process.argv.includes("--no-node");

const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const log = (msg) => console.log(`${CYAN}[build]${RESET} ${msg}`);
const ok = (msg) => console.log(`  ${GREEN}✓${RESET} ${msg}`);

// Directories/files to include in the portable build
const INCLUDE_DIRS = ["bin", "src", "skills", "node_modules"];
const INCLUDE_FILES = [
  ".env.example",
  "CLAUDE.md",
  "LICENSE",
  "package.json",
  "backbone.bat",
];

// Directories to create (empty) for user data
const CREATE_DIRS = ["data", "memory", "projects", "screenshots"];

function cleanDist() {
  log("Cleaning dist/BackBone...");
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST, { recursive: true });
  ok("Clean");
}

// Directories to skip only at the project root level (not inside node_modules)
const ROOT_SKIP = new Set([".git", "dist", "coverage", ".cache", "zig"]);

function copyDir(src, dest, depth = 0) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      // Only skip .git/dist/etc at the top-level project root, not inside node_modules
      if (depth === 0 && ROOT_SKIP.has(entry.name)) continue;
      // Always skip .git inside any directory
      if (entry.name === ".git") continue;
      copyDir(srcPath, destPath, depth + 1);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copySourceFiles() {
  log("Copying source files...");

  for (const dir of INCLUDE_DIRS) {
    const src = path.join(ROOT, dir);
    const dest = path.join(DIST, dir);
    if (fs.existsSync(src)) {
      copyDir(src, dest);
      ok(dir + "/");
    }
  }

  for (const file of INCLUDE_FILES) {
    const src = path.join(ROOT, file);
    const dest = path.join(DIST, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      ok(file);
    }
  }

  // Create empty user data directories
  for (const dir of CREATE_DIRS) {
    const dest = path.join(DIST, dir);
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, ".gitkeep"), "");
    ok(dir + "/ (created empty)");
  }
}

function createLauncher() {
  log("Creating launcher...");

  // Windows CMD launcher
  const batContent = `@echo off
title BACKBONE ENGINE
chcp 65001 >nul 2>&1

REM Enable ANSI escape sequences
reg add HKCU\\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

REM Check for bundled Node.js first, then system Node.js
if exist "%~dp0node\\node.exe" (
  set "NODE_EXE=%~dp0node\\node.exe"
) else (
  where node >nul 2>&1
  if errorlevel 1 (
    echo.
    echo [BACKBONE] Node.js not found!
    echo [BACKBONE] Install Node.js 20+ from: https://nodejs.org
    echo.
    pause
    exit /b 1
  )
  set "NODE_EXE=node"
)

REM Set working directory to the BackBone folder
cd /d "%~dp0"

REM Launch BACKBONE
"%NODE_EXE%" bin/backbone.js %*
if errorlevel 1 (
  echo.
  echo [BACKBONE] Exited with error code %errorlevel%
  pause
)
`;

  fs.writeFileSync(path.join(DIST, "BackBone.cmd"), batContent);
  ok("BackBone.cmd");

  // Also create a .bat alias
  fs.writeFileSync(path.join(DIST, "BackBone.bat"), batContent);
  ok("BackBone.bat");

  // PowerShell launcher (for terminal users)
  const ps1Content = `#!/usr/bin/env pwsh
# BACKBONE Engine Launcher
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$nodeExe = if (Test-Path "$scriptDir\\node\\node.exe") { "$scriptDir\\node\\node.exe" } else { "node" }

try {
    & $nodeExe bin/backbone.js @args
} catch {
    Write-Error "BACKBONE failed: $_"
    Read-Host "Press Enter to exit"
}
`;

  fs.writeFileSync(path.join(DIST, "BackBone.ps1"), ps1Content);
  ok("BackBone.ps1");
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${response.statusCode}`));
      }

      const total = parseInt(response.headers["content-length"], 10);
      let downloaded = 0;

      response.on("data", (chunk) => {
        downloaded += chunk.length;
        if (total) {
          const pct = ((downloaded / total) * 100).toFixed(0);
          process.stdout.write(`\r  ↓ Downloading Node.js... ${pct}%   `);
        }
      });

      response.pipe(file);
      file.on("finish", () => {
        file.close();
        process.stdout.write("\n");
        resolve();
      });
    }).on("error", (err) => {
      file.close();
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function downloadNode() {
  if (skipNode) {
    log("Skipping Node.js download (--no-node)");
    return;
  }

  log(`Downloading portable Node.js ${NODE_VERSION}...`);

  const zipPath = path.join(ROOT, "dist", "node.zip");
  const nodeDir = path.join(DIST, "node");

  try {
    await downloadFile(NODE_URL, zipPath);
    ok("Downloaded node.zip");

    // Extract using PowerShell
    log("Extracting Node.js...");
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${path.join(ROOT, "dist", "node-temp")}' -Force"`,
      { stdio: "pipe" }
    );

    // Move the inner directory to dist/BackBone/node/
    const extractedDir = path.join(ROOT, "dist", "node-temp", `node-${NODE_VERSION}-win-x64`);
    if (fs.existsSync(extractedDir)) {
      fs.renameSync(extractedDir, nodeDir);
      ok(`Node.js extracted to node/`);
    }

    // Cleanup
    fs.rmSync(zipPath, { force: true });
    fs.rmSync(path.join(ROOT, "dist", "node-temp"), { recursive: true, force: true });
    ok("Cleaned up temp files");
  } catch (err) {
    console.error(`  ${YELLOW}!${RESET} Failed to download Node.js: ${err.message}`);
    console.error(`  ${YELLOW}!${RESET} The portable build will require Node.js in PATH`);
  }
}

function printSummary() {
  // Calculate size
  let totalSize = 0;
  function walkSize(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkSize(full);
        } else {
          totalSize += fs.statSync(full).size;
        }
      }
    } catch { /* ignore */ }
  }
  walkSize(DIST);

  const sizeMB = (totalSize / 1024 / 1024).toFixed(0);

  console.log(`\n${BOLD}${GREEN}═══════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${GREEN}  Build complete!${RESET}`);
  console.log(`${BOLD}${GREEN}═══════════════════════════════════════${RESET}`);
  console.log(`\n  ${CYAN}Location:${RESET}  dist/BackBone/`);
  console.log(`  ${CYAN}Size:${RESET}      ~${sizeMB} MB`);
  console.log(`  ${CYAN}Launch:${RESET}    BackBone.cmd (double-click)`);
  console.log(`\n  To distribute: zip the dist/BackBone/ folder`);
  console.log(`  User just extracts and runs BackBone.cmd\n`);
}

async function main() {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  BACKBONE Portable Build${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════${RESET}\n`);

  cleanDist();
  copySourceFiles();
  createLauncher();
  await downloadNode();
  printSummary();
}

main().catch((err) => {
  console.error("\nBuild failed:", err.message);
  process.exit(1);
});
