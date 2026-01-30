#!/usr/bin/env node

/**
 * BACKBONE Setup Script
 *
 * Checks prerequisites, creates directories, and prepares the environment.
 * Run with: node scripts/setup.js
 * Or:       npm run setup
 *
 * Steps:
 * 1. Check Node.js version (>= 20 required)
 * 2. Check if Claude Code CLI is installed
 * 3. Check if Anthropic SDK is available
 * 4. Create required directories (data/, memory/, projects/, screenshots/)
 * 5. Copy .env.example to .env if missing
 * 6. Install npm dependencies if needed
 * 7. Optionally link globally (npm link)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// ANSI colors for output
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const ok = (msg) => console.log(`  ${GREEN}✓${RESET} ${msg}`);
const fail = (msg) => console.log(`  ${RED}✗${RESET} ${msg}`);
const warn = (msg) => console.log(`  ${YELLOW}!${RESET} ${msg}`);
const info = (msg) => console.log(`  ${CYAN}→${RESET} ${msg}`);
const heading = (msg) => console.log(`\n${BOLD}${msg}${RESET}`);

let errors = 0;
let warnings = 0;

// ─────────────────────────────────────────────
// 1. Node.js version check
// ─────────────────────────────────────────────
function checkNodeVersion() {
  heading("Checking Node.js...");
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0], 10);

  if (major >= 20) {
    ok(`Node.js ${version} (>= 20 required)`);
  } else {
    fail(`Node.js ${version} — version 20+ is required`);
    errors++;
  }
}

// ─────────────────────────────────────────────
// 2. Claude Code CLI check
// ─────────────────────────────────────────────
function checkClaudeCodeCLI() {
  heading("Checking Claude Code CLI...");

  try {
    const cmd = process.platform === "win32" ? "where claude" : "which claude";
    const result = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();

    if (result) {
      ok(`Claude Code CLI found: ${DIM}${result.split("\n")[0]}${RESET}`);

      // Try to get version
      try {
        const ver = execSync("claude --version", { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }).trim();
        ok(`Version: ${ver}`);
      } catch {
        info("Could not determine Claude Code version");
      }
    }
  } catch {
    fail("Claude Code CLI not found in PATH");
    info("Install: npm install -g @anthropic-ai/claude-code");
    info("Or visit: https://docs.anthropic.com/en/docs/claude-code");
    errors++;
  }
}

// ─────────────────────────────────────────────
// 3. Anthropic SDK check
// ─────────────────────────────────────────────
function checkAnthropicSDK() {
  heading("Checking Anthropic SDK...");

  const sdkPath = path.join(ROOT, "node_modules", "@anthropic-ai", "sdk");
  if (fs.existsSync(sdkPath)) {
    ok("@anthropic-ai/sdk is installed");
  } else {
    warn("@anthropic-ai/sdk not found — will be installed with npm install");
    warnings++;
  }

  // Check for MCP SDK
  const mcpPath = path.join(ROOT, "node_modules", "@modelcontextprotocol", "sdk");
  if (fs.existsSync(mcpPath)) {
    ok("@modelcontextprotocol/sdk is installed");
  } else {
    warn("@modelcontextprotocol/sdk not found — will be installed with npm install");
    warnings++;
  }
}

// ─────────────────────────────────────────────
// 4. Create required directories
// ─────────────────────────────────────────────
function createDirectories() {
  heading("Creating directories...");

  const dirs = [
    "data",
    "data/goals",
    "data/spreadsheets",
    "data/user-skills",
    "memory",
    "projects",
    "screenshots",
    "dist",
  ];

  for (const dir of dirs) {
    const fullPath = path.join(ROOT, dir);
    if (fs.existsSync(fullPath)) {
      ok(`${dir}/ exists`);
    } else {
      fs.mkdirSync(fullPath, { recursive: true });
      ok(`${dir}/ created`);
    }

    // Ensure .gitkeep exists for git tracking
    const gitkeep = path.join(fullPath, ".gitkeep");
    if (!fs.existsSync(gitkeep) && ["data", "memory", "projects", "screenshots"].includes(dir)) {
      fs.writeFileSync(gitkeep, "");
    }
  }
}

// ─────────────────────────────────────────────
// 5. Copy .env.example to .env
// ─────────────────────────────────────────────
function setupEnvFile() {
  heading("Checking environment...");

  const envPath = path.join(ROOT, ".env");
  const examplePath = path.join(ROOT, ".env.example");

  if (fs.existsSync(envPath)) {
    ok(".env file exists");
  } else if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    ok(".env created from .env.example");
    warn("Edit .env to add your API keys (ANTHROPIC_API_KEY at minimum)");
    warnings++;
  } else {
    fail(".env.example not found — cannot create .env");
    errors++;
  }
}

// ─────────────────────────────────────────────
// 6. Check npm dependencies
// ─────────────────────────────────────────────
function checkDependencies() {
  heading("Checking dependencies...");

  const nodeModules = path.join(ROOT, "node_modules");
  if (fs.existsSync(nodeModules)) {
    ok("node_modules/ exists");

    // Spot-check critical deps
    const criticalDeps = ["ink", "react", "express", "dotenv", "chalk"];
    let missing = 0;
    for (const dep of criticalDeps) {
      if (!fs.existsSync(path.join(nodeModules, dep))) {
        missing++;
      }
    }
    if (missing === 0) {
      ok("Critical dependencies present");
    } else {
      warn(`${missing} critical dependencies missing — run: npm install`);
      warnings++;
    }
  } else {
    warn("node_modules/ not found — run: npm install");
    warnings++;
  }
}

// ─────────────────────────────────────────────
// 7. Check .env for required keys
// ─────────────────────────────────────────────
function checkApiKeys() {
  heading("Checking API keys...");

  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    warn("No .env file — skipping key check");
    return;
  }

  const envContent = fs.readFileSync(envPath, "utf-8");

  // Check Anthropic key
  const anthropicMatch = envContent.match(/ANTHROPIC_API_KEY=(.+)/);
  if (anthropicMatch && anthropicMatch[1].trim()) {
    ok("ANTHROPIC_API_KEY is set");
  } else {
    warn("ANTHROPIC_API_KEY is not set — Claude AI features will not work");
    info("Get your key at: https://console.anthropic.com");
    warnings++;
  }
}

// ─────────────────────────────────────────────
// 8. Verify bin entry point
// ─────────────────────────────────────────────
function checkEntryPoint() {
  heading("Checking entry point...");

  const binPath = path.join(ROOT, "bin", "backbone.js");
  if (fs.existsSync(binPath)) {
    ok("bin/backbone.js exists");
  } else {
    fail("bin/backbone.js not found — app cannot start");
    errors++;
  }
}

// ─────────────────────────────────────────────
// Run all checks
// ─────────────────────────────────────────────
function run() {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  BACKBONE Engine — Setup${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════${RESET}`);

  checkNodeVersion();
  checkClaudeCodeCLI();
  checkAnthropicSDK();
  createDirectories();
  setupEnvFile();
  checkDependencies();
  checkApiKeys();
  checkEntryPoint();

  // Summary
  heading("Summary");
  if (errors === 0 && warnings === 0) {
    console.log(`  ${GREEN}${BOLD}All checks passed!${RESET}`);
    console.log(`\n  Start BACKBONE with: ${CYAN}npm start${RESET}`);
    console.log(`  Or globally:         ${CYAN}backbone${RESET} (after npm link)\n`);
  } else if (errors === 0) {
    console.log(`  ${YELLOW}${BOLD}Setup complete with ${warnings} warning(s)${RESET}`);
    console.log(`  Review the warnings above, then start with: ${CYAN}npm start${RESET}\n`);
  } else {
    console.log(`  ${RED}${BOLD}${errors} error(s), ${warnings} warning(s)${RESET}`);
    console.log(`  Fix the errors above before starting BACKBONE.\n`);
    process.exit(1);
  }
}

run();
