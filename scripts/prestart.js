#!/usr/bin/env node

/**
 * BACKBONE Prestart Check
 *
 * Quick sanity check before launching. Runs on every `npm start`.
 * Exits with error if critical prerequisites are missing.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

let fatal = false;

// Node version
const major = parseInt(process.version.slice(1).split(".")[0], 10);
if (major < 20) {
  console.error(`${RED}[BACKBONE] Node.js 20+ required (found ${process.version})${RESET}`);
  fatal = true;
}

// .env file
if (!fs.existsSync(path.join(ROOT, ".env"))) {
  const example = path.join(ROOT, ".env.example");
  if (fs.existsSync(example)) {
    fs.copyFileSync(example, path.join(ROOT, ".env"));
    console.log(`${YELLOW}[BACKBONE] Created .env from .env.example — edit to add API keys${RESET}`);
  } else {
    console.error(`${RED}[BACKBONE] No .env file found. Run: npm run setup${RESET}`);
    fatal = true;
  }
}

// Critical directories
for (const dir of ["data", "memory", "projects"]) {
  const p = path.join(ROOT, dir);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

// Anthropic SDK
if (!fs.existsSync(path.join(ROOT, "node_modules", "@anthropic-ai", "sdk"))) {
  console.error(`${RED}[BACKBONE] Dependencies missing. Run: npm install${RESET}`);
  fatal = true;
}

if (fatal) {
  console.error(`\n${CYAN}Run 'npm run setup' for full diagnostics${RESET}\n`);
  process.exit(1);
}
