/**
 * BACKBONE — Centralized Path Resolution (Multi-User)
 *
 * Single source of truth for all user-data directories.
 *
 * Structure:
 *   ~/.backbone/                    ← BACKBONE root (per OS user)
 *     active-user.json              ← which Google account is active
 *     users/
 *       <firebase-uid>/             ← isolated per Google account
 *         data/
 *         memory/
 *         projects/
 *         screenshots/
 *         skills/
 *         mcp/
 *         tools/
 *         agents/                   ← per-agent runtime memory
 *
 * Resolution:
 *   1. BACKBONE_HOME env var → override root (for custom deploys)
 *   2. Default: ~/.backbone
 *   3. Active user UID from active-user.json → user-scoped dirs
 *   4. No active user → "default" profile
 *
 * Usage:
 *   import { getDataDir, dataFile } from "./paths.js";
 *   const DATA_DIR = getDataDir();
 *   const goalsPath = dataFile("goals.json");
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

// ── Engine root (where the code lives) ──────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _engineRoot = path.resolve(__dirname, "..", "..");

// ── Resolve BACKBONE root once ──────────────────────────────────

let _backboneRoot = null;

function resolveBackboneRoot() {
  if (_backboneRoot !== null) return _backboneRoot;

  // 1. Explicit env var override
  if (process.env.BACKBONE_HOME) {
    _backboneRoot = path.resolve(process.env.BACKBONE_HOME);
    return _backboneRoot;
  }

  // 2. Default — ~/.backbone
  _backboneRoot = path.join(os.homedir(), ".backbone");
  return _backboneRoot;
}

// ── Active user resolution ──────────────────────────────────────

let _activeUserId = undefined; // undefined = not yet resolved, null = no user

/**
 * Read the active user UID from active-user.json at the BACKBONE root.
 * Returns the UID string, or "default" if no user is signed in.
 */
function resolveActiveUserId() {
  if (_activeUserId !== undefined) return _activeUserId || "default";

  const root = resolveBackboneRoot();
  const activeUserPath = path.join(root, "active-user.json");
  try {
    if (fs.existsSync(activeUserPath)) {
      const data = JSON.parse(fs.readFileSync(activeUserPath, "utf-8"));
      if (data.uid) {
        _activeUserId = data.uid;
        return _activeUserId;
      }
    }
  } catch {
    // Corrupt file — fall through to default
  }

  _activeUserId = null;
  return "default";
}

// ── Public API ──────────────────────────────────────────────────

/** Root of the BACKBONE installation (~/.backbone) */
export function getBackboneRoot() {
  return resolveBackboneRoot();
}

/** @deprecated Use getBackboneRoot(). Kept for backward compat. */
export function getBackboneHome() {
  return getUserHome();
}

/** The active user's UID (or "default" if not signed in) */
export function getActiveUserId() {
  return resolveActiveUserId();
}

/** Home directory for a specific user (or the active user) */
export function getUserHome(uid) {
  const root = resolveBackboneRoot();
  const id = uid || resolveActiveUserId();
  return path.join(root, "users", id);
}

/**
 * Set the active user. Call this on sign-in.
 * Writes active-user.json and resets cached resolution.
 */
export function setActiveUser(uid, email, displayName) {
  const root = resolveBackboneRoot();
  const activeUserPath = path.join(root, "active-user.json");
  fs.writeFileSync(activeUserPath, JSON.stringify({ uid, email, displayName, switchedAt: new Date().toISOString() }, null, 2));
  _activeUserId = uid;
}

/**
 * Clear the active user (sign-out). Resets to "default" profile.
 */
export function clearActiveUser() {
  const root = resolveBackboneRoot();
  const activeUserPath = path.join(root, "active-user.json");
  try { if (fs.existsSync(activeUserPath)) fs.unlinkSync(activeUserPath); } catch {}
  _activeUserId = null;
}

/**
 * Root of the engine installation (where src/, bin/, skills/, package.json live).
 */
export function getEngineRoot() { return _engineRoot; }

/** engineFile("src/server.js") → absolute path inside the engine install */
export function engineFile(relative) { return path.join(_engineRoot, relative); }

// ── Directory getters (user-scoped) ─────────────────────────────

export function getDataDir()        { return path.join(getUserHome(), "data"); }
export function getMemoryDir()      { return path.join(getUserHome(), "memory"); }
export function getProjectsDir()    { return path.join(getUserHome(), "projects"); }
export function getScreenshotsDir() { return path.join(getUserHome(), "screenshots"); }
export function getUserSkillsDir()  { return path.join(getUserHome(), "skills"); }
export function getUserMcpDir()     { return path.join(getUserHome(), "mcp"); }
export function getUserToolsDir()   { return path.join(getUserHome(), "tools"); }
export function getUserAgentsDir()  { return path.join(getUserHome(), "agents"); }

// ── File helpers ────────────────────────────────────────────────

/** dataFile("goals.json") → absolute path inside active user's data/ */
export function dataFile(relative)  { return path.join(getDataDir(), relative); }

/** memoryFile("thesis.md") → absolute path inside active user's memory/ */
export function memoryFile(relative) { return path.join(getMemoryDir(), relative); }

/** projectDir("market-analysis") → absolute path inside active user's projects/ */
export function projectDir(name)    { return path.join(getProjectsDir(), name); }

/** screenshotFile("capture.png") → absolute path inside active user's screenshots/ */
export function screenshotFile(name) { return path.join(getScreenshotsDir(), name); }

// ── Bootstrap — create dirs for a user ──────────────────────────

const USER_DIRS = [
  "data",
  "data/goals",
  "data/spreadsheets",
  "data/contacts",
  "memory",
  "projects",
  "screenshots",
  "skills",
  "mcp",
  "tools",
  "agents",
];

/**
 * Ensure all directories exist for the active user (or a specific UID).
 * Safe to call multiple times.
 */
export function ensureUserDirs(uid) {
  const home = getUserHome(uid);
  for (const rel of USER_DIRS) {
    const full = path.join(home, rel);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  }
  // Also ensure the root users/ dir exists
  const usersDir = path.join(resolveBackboneRoot(), "users");
  if (!fs.existsSync(usersDir)) fs.mkdirSync(usersDir, { recursive: true });
}

/**
 * Migrate flat ~/.backbone/data → ~/.backbone/users/default/data
 * Called once on upgrade. Merges root-level data/, memory/, projects/, screenshots/
 * into users/default/, then removes the root copies.
 */
export function migrateToUserScoped() {
  const root = resolveBackboneRoot();
  const defaultHome = path.join(root, "users", "default");

  const dirsToMigrate = ["data", "memory", "projects", "screenshots"];

  for (const dir of dirsToMigrate) {
    const src = path.join(root, dir);
    if (!fs.existsSync(src)) continue;

    const dest = path.join(defaultHome, dir);
    fs.mkdirSync(dest, { recursive: true });

    // Merge contents — copy each entry from src to dest (skip if already exists)
    for (const entry of fs.readdirSync(src)) {
      const srcEntry = path.join(src, entry);
      const destEntry = path.join(dest, entry);
      if (!fs.existsSync(destEntry)) {
        fs.renameSync(srcEntry, destEntry);
      }
    }

    // Remove the now-empty root dir (rmdir only removes empty dirs — safe)
    try { fs.rmdirSync(src); } catch { /* not empty yet, leave it */ }
  }
}

// ── Claim default profile on first sign-in ──────────────────────

/**
 * On first Google sign-in, rename users/default/ → users/<uid>/
 * so the pre-login data becomes this user's data. No-op if:
 *   - users/default/ doesn't exist (nothing to claim)
 *   - users/<uid>/ already exists (user already has their own folder)
 */
export function claimDefaultProfile(uid) {
  if (!uid || uid === "default") return;

  const root = resolveBackboneRoot();
  const defaultHome = path.join(root, "users", "default");
  const userHome = path.join(root, "users", uid);

  if (fs.existsSync(defaultHome) && !fs.existsSync(userHome)) {
    fs.renameSync(defaultHome, userHome);
  }
}

// ── Backward compat ─────────────────────────────────────────────

/** @deprecated Legacy detection removed. Always returns false. */
export function isLegacyInstall() { return false; }

// ── Reset (for tests) ──────────────────────────────────────────

/** Reset all cached resolution (only useful in tests) */
export function _resetForTest() {
  _backboneRoot = null;
  _activeUserId = undefined;
}
