/**
 * BACKBONE — Centralized Path Resolution
 *
 * Single source of truth for all user-data directories.
 *
 * Resolution order for BACKBONE_HOME:
 *   1. BACKBONE_HOME env var  (explicit override)
 *   2. Legacy mode: data/ exists in process.cwd()  (backward compat)
 *   3. Default: ~/.backbone  (new installs)
 *
 * Every file that previously did:
 *   const DATA_DIR = path.join(process.cwd(), "data");
 * should now do:
 *   import { getDataDir } from "./paths.js";
 *   const DATA_DIR = getDataDir();
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

// ── Engine root (where the code lives) ──────────────────────────
// This is always the repo/package root, regardless of cwd.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _engineRoot = path.resolve(__dirname, "..", "..");

// ── Resolve BACKBONE_HOME once ──────────────────────────────────

let _backboneHome = null;
let _legacy = null;

function resolveBackboneHome() {
  if (_backboneHome !== null) return _backboneHome;

  // 1. Explicit env var
  if (process.env.BACKBONE_HOME) {
    _backboneHome = path.resolve(process.env.BACKBONE_HOME);
    _legacy = false;
    return _backboneHome;
  }

  // 2. Legacy mode — data/ exists alongside the code
  const cwdData = path.join(process.cwd(), "data");
  if (fs.existsSync(cwdData)) {
    _backboneHome = process.cwd();
    _legacy = true;
    return _backboneHome;
  }

  // 3. Default — ~/.backbone
  _backboneHome = path.join(os.homedir(), ".backbone");
  _legacy = false;
  return _backboneHome;
}

// ── Public API ──────────────────────────────────────────────────

/** Root of all user data (the BACKBONE_HOME directory) */
export function getBackboneHome() {
  return resolveBackboneHome();
}

/** True when running from the old in-repo layout */
export function isLegacyInstall() {
  resolveBackboneHome();
  return _legacy;
}

/**
 * Root of the engine installation (where src/, bin/, skills/, package.json live).
 * Use this instead of process.cwd() when locating engine code files.
 */
export function getEngineRoot() { return _engineRoot; }

/** engineFile("src/server.js") → full absolute path inside the engine install */
export function engineFile(relative) { return path.join(_engineRoot, relative); }

// ── Directory getters ───────────────────────────────────────────

export function getDataDir()        { return path.join(resolveBackboneHome(), "data"); }
export function getMemoryDir()      { return path.join(resolveBackboneHome(), "memory"); }
export function getProjectsDir()    { return path.join(resolveBackboneHome(), "projects"); }
export function getScreenshotsDir() { return path.join(resolveBackboneHome(), "screenshots"); }

// ── File helpers (avoid path.join boilerplate everywhere) ───────

/** dataFile("goals.json") → full absolute path inside data/ */
export function dataFile(relative)  { return path.join(getDataDir(), relative); }

/** memoryFile("thesis.md") → full absolute path inside memory/ */
export function memoryFile(relative) { return path.join(getMemoryDir(), relative); }

/** projectDir("market-analysis") → full absolute path inside projects/ */
export function projectDir(name)    { return path.join(getProjectsDir(), name); }

/** screenshotFile("capture.png") → full absolute path inside screenshots/ */
export function screenshotFile(name) { return path.join(getScreenshotsDir(), name); }

// ── Bootstrap — create dirs on first run ────────────────────────

const REQUIRED_DIRS = [
  "data",
  "data/goals",
  "data/user-skills",
  "data/spreadsheets",
  "data/contacts",
  "memory",
  "projects",
  "screenshots",
];

/**
 * Ensure all user-data directories exist.
 * Safe to call multiple times (no-ops if dirs already present).
 */
export function ensureUserDirs() {
  const home = resolveBackboneHome();
  for (const rel of REQUIRED_DIRS) {
    const full = path.join(home, rel);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  }
}

// ── Reset (for tests) ──────────────────────────────────────────

/** Reset cached resolution (only useful in tests) */
export function _resetForTest() {
  _backboneHome = null;
  _legacy = null;
}
