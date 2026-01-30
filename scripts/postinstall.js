#!/usr/bin/env node

/**
 * BACKBONE Postinstall Script
 *
 * Runs automatically after `npm install` to create required directories.
 * Lightweight — no heavy checks, just directory creation.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const dirs = [
  "data",
  "data/goals",
  "data/spreadsheets",
  "data/user-skills",
  "memory",
  "projects",
  "screenshots",
];

let created = 0;

for (const dir of dirs) {
  const fullPath = path.join(ROOT, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    created++;
  }
}

// Copy .env.example to .env if missing
const envPath = path.join(ROOT, ".env");
const examplePath = path.join(ROOT, ".env.example");
if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
  fs.copyFileSync(examplePath, envPath);
  console.log("[BACKBONE] Created .env from .env.example — edit it to add your API keys");
}

if (created > 0) {
  console.log(`[BACKBONE] Created ${created} directories`);
}
