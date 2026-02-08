/**
 * Auto-Updater Service
 *
 * Checks Firebase for newer versions at startup, downloads update zips,
 * verifies SHA-256 integrity, backs up current files, extracts updates,
 * and signals the launcher to restart.
 *
 * Protected directories (NEVER touched): data/, memory/, projects/, .env, screenshots/, node/
 * Updatable: bin/, src/, skills/, node_modules/, package.json, CLAUDE.md, launcher scripts
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { loadFirebaseConfig } from "../firebase/firebase-auth.js";

import { getEngineRoot, getDataDir } from "../paths.js";
const ROOT = getEngineRoot();
const DATA_DIR = getDataDir();
const UPDATE_STATE_PATH = path.join(DATA_DIR, "update-state.json");
const RESTART_SIGNAL_PATH = path.join(ROOT, "_restart_signal");
const BACKUP_DIR = path.join(ROOT, "_backup");
const TEMP_DIR = path.join(ROOT, "_update_temp");

// Firebase config
const FIRESTORE_BASE = "https://firestore.googleapis.com/v1/projects/backboneai/databases/(default)/documents";
const STORAGE_BASE = "https://firebasestorage.googleapis.com/v0/b/backboneai.firebasestorage.app/o";

// Directories that are safe to replace during updates
const UPDATABLE_DIRS = ["bin", "src", "skills", "node_modules"];
const UPDATABLE_FILES = ["package.json", "CLAUDE.md", "BackBone.cmd", "BackBone.bat", "BackBone.ps1", "backbone.bat"];

// Directories that must NEVER be touched
const PROTECTED = new Set(["data", "memory", "projects", "screenshots", "node", ".env", ".firebase"]);

/**
 * Get a Firebase ID token for authenticated requests.
 */
async function getAuthToken() {
  const config = loadFirebaseConfig();
  if (!config?.apiKey) return null;

  const userPath = path.join(DATA_DIR, "firebase-user.json");
  if (!fs.existsSync(userPath)) return null;

  try {
    const userData = JSON.parse(fs.readFileSync(userPath, "utf-8"));
    if (userData.idToken) return userData.idToken;
    if (userData.refreshToken) {
      const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${config.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "refresh_token", refresh_token: userData.refreshToken })
      });
      if (res.ok) {
        const data = await res.json();
        userData.idToken = data.id_token;
        userData.refreshToken = data.refresh_token;
        fs.writeFileSync(userPath, JSON.stringify(userData, null, 2));
        return data.id_token;
      }
    }
  } catch { /* silent */ }
  return null;
}

/**
 * Parse Firestore document fields to plain object.
 */
function parseFirestoreFields(fields) {
  const result = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value.stringValue !== undefined) result[key] = value.stringValue;
    else if (value.integerValue !== undefined) result[key] = parseInt(value.integerValue, 10);
    else if (value.doubleValue !== undefined) result[key] = value.doubleValue;
    else if (value.booleanValue !== undefined) result[key] = value.booleanValue;
    else if (value.mapValue !== undefined) result[key] = parseFirestoreFields(value.mapValue.fields);
    else if (value.arrayValue !== undefined) {
      result[key] = (value.arrayValue.values || []).map(v => {
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
        return v;
      });
    }
  }
  return result;
}

/**
 * Fetch the latest update metadata from Firestore.
 */
async function fetchLatestUpdate() {
  try {
    const token = await getAuthToken();
    const config = loadFirebaseConfig();
    const url = `${FIRESTORE_BASE}/updates/latest?key=${config?.apiKey || ""}`;
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;

    const doc = await res.json();
    return parseFirestoreFields(doc.fields);
  } catch {
    return null;
  }
}

/**
 * Get local version from package.json.
 */
function getLocalVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Compare semver versions. Returns true if remote > local.
 */
function isNewer(remote, local) {
  const r = remote.split(".").map(Number);
  const l = local.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

/**
 * Download the update zip from Firebase Storage.
 */
async function downloadUpdate(remotePath, destPath) {
  const token = await getAuthToken();
  const encoded = encodeURIComponent(remotePath);
  const url = `${STORAGE_BASE}/${encoded}?alt=media`;
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(300000) }); // 5min timeout
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return buffer.length;
}

/**
 * Compute SHA-256 hash of a file.
 */
function computeSHA256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Back up current updatable files to _backup/.
 */
function backupCurrentFiles() {
  if (fs.existsSync(BACKUP_DIR)) {
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // Backup directories
  for (const dir of UPDATABLE_DIRS) {
    const src = path.join(ROOT, dir);
    if (fs.existsSync(src)) {
      copyDirRecursive(src, path.join(BACKUP_DIR, dir));
    }
  }

  // Backup individual files
  for (const file of UPDATABLE_FILES) {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(BACKUP_DIR, file));
    }
  }
}

/**
 * Recursively copy a directory.
 */
function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Extract the update zip and replace files.
 * Uses PowerShell on Windows, unzip on Unix.
 */
function extractAndReplace(zipPath) {
  const extractDir = path.join(TEMP_DIR, "extracted");
  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
  fs.mkdirSync(extractDir, { recursive: true });

  // Extract zip
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
      { stdio: "pipe", timeout: 120000 }
    );
  } else {
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe", timeout: 120000 });
  }

  // The zip may contain files at root or inside a subdirectory
  // Detect: if extracted dir has a single subdirectory, use that as root
  let sourceDir = extractDir;
  const topEntries = fs.readdirSync(extractDir, { withFileTypes: true });
  if (topEntries.length === 1 && topEntries[0].isDirectory()) {
    sourceDir = path.join(extractDir, topEntries[0].name);
  }

  // Replace updatable directories
  for (const dir of UPDATABLE_DIRS) {
    const src = path.join(sourceDir, dir);
    const dest = path.join(ROOT, dir);
    if (fs.existsSync(src)) {
      // Remove current, replace with new
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      copyDirRecursive(src, dest);
    }
  }

  // Replace updatable files
  for (const file of UPDATABLE_FILES) {
    const src = path.join(sourceDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(ROOT, file));
    }
  }

  // Also check for any other root-level files in the zip that aren't protected
  const rootEntries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (PROTECTED.has(entry.name)) continue;
    if (UPDATABLE_DIRS.includes(entry.name)) continue; // already handled
    if (UPDATABLE_FILES.includes(entry.name)) continue; // already handled

    // Copy additional non-protected files/dirs from the update
    const src = path.join(sourceDir, entry.name);
    const dest = path.join(ROOT, entry.name);
    if (entry.isDirectory()) {
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
      copyDirRecursive(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

/**
 * Rollback from backup if update fails.
 */
function rollback() {
  if (!fs.existsSync(BACKUP_DIR)) return;

  for (const dir of UPDATABLE_DIRS) {
    const backup = path.join(BACKUP_DIR, dir);
    const dest = path.join(ROOT, dir);
    if (fs.existsSync(backup)) {
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
      copyDirRecursive(backup, dest);
    }
  }

  for (const file of UPDATABLE_FILES) {
    const backup = path.join(BACKUP_DIR, file);
    if (fs.existsSync(backup)) {
      fs.copyFileSync(backup, path.join(ROOT, file));
    }
  }
}

/**
 * Clean up temporary files.
 */
function cleanup() {
  try {
    if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch { /* ignore */ }
}

/**
 * Write update state for post-update notification.
 */
function writeUpdateState(state) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(UPDATE_STATE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Read and clear update state (called after restart to show notification).
 */
export function consumeUpdateState() {
  try {
    if (fs.existsSync(UPDATE_STATE_PATH)) {
      const state = JSON.parse(fs.readFileSync(UPDATE_STATE_PATH, "utf-8"));
      fs.unlinkSync(UPDATE_STATE_PATH);
      return state;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Check for updates. Called at startup or manually via /update.
 *
 * @param {Object} [options]
 * @param {boolean} [options.silent=true] - If true, don't log unless updating
 * @param {function} [options.onStatus] - Callback for status messages (for UI)
 * @returns {Promise<{updated: boolean, version?: string, error?: string}>}
 */
export async function checkForUpdates({ silent = true, onStatus } = {}) {
  const log = (msg) => {
    if (onStatus) onStatus(msg);
    else if (!silent) process.stderr.write(`[update] ${msg}\n`);
  };

  // Skip if we just updated (prevent infinite loop)
  if (process.env.BACKBONE_UPDATED === "1") {
    return { updated: false };
  }

  try {
    const localVersion = getLocalVersion();
    log(`Current version: v${localVersion}`);

    // Fetch latest from Firestore
    const latest = await fetchLatestUpdate();
    if (!latest || !latest.version) {
      return { updated: false };
    }

    // Check if we need a minimum version
    if (latest.minVersion && isNewer(latest.minVersion, localVersion)) {
      // We're below minimum — force update
      log(`Below minimum version (${latest.minVersion}), updating...`);
    } else if (!isNewer(latest.version, localVersion)) {
      // Already up to date
      return { updated: false, version: localVersion };
    }

    log(`New version available: v${latest.version}`);

    // Download the update zip
    const zipPath = path.join(TEMP_DIR, `BackBone-${latest.version}.zip`);
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    log(`Downloading update...`);
    const downloadSize = await downloadUpdate(latest.downloadUrl, zipPath);
    log(`Downloaded ${(downloadSize / 1024 / 1024).toFixed(1)} MB`);

    // Verify SHA-256
    if (latest.sha256) {
      log(`Verifying integrity...`);
      const hash = computeSHA256(zipPath);
      if (hash !== latest.sha256) {
        cleanup();
        const error = "SHA-256 mismatch — download may be corrupted";
        log(error);
        return { updated: false, error };
      }
      log(`Integrity verified`);
    }

    // Backup current files
    log(`Backing up current version...`);
    backupCurrentFiles();

    // Extract and replace
    log(`Installing v${latest.version}...`);
    try {
      extractAndReplace(zipPath);
    } catch (extractErr) {
      log(`Extraction failed, rolling back: ${extractErr.message}`);
      rollback();
      cleanup();
      return { updated: false, error: extractErr.message };
    }

    // Write update state for post-restart notification
    writeUpdateState({
      previousVersion: localVersion,
      newVersion: latest.version,
      changelog: latest.changelog || "",
      updatedAt: new Date().toISOString()
    });

    // Clean up temp files (keep backup for safety until next update)
    cleanup();

    // Signal launcher to restart
    log(`Update complete. Restarting...`);
    fs.writeFileSync(RESTART_SIGNAL_PATH, latest.version);

    // Exit — the launcher script will detect _restart_signal and re-launch
    process.exit(0);

  } catch (err) {
    // Any unexpected error — skip silently
    if (!silent) log(`Update check failed: ${err.message}`);
    cleanup();
    return { updated: false, error: err.message };
  }
}

/**
 * Force update — triggered by /update command.
 * Same as checkForUpdates but not silent.
 */
export async function forceUpdate(onStatus) {
  return checkForUpdates({ silent: false, onStatus });
}

/**
 * Check for available update without applying it.
 * Returns version info for display.
 */
export async function checkVersion() {
  try {
    const localVersion = getLocalVersion();
    const latest = await fetchLatestUpdate();

    if (!latest || !latest.version) {
      return { current: localVersion, latest: null, updateAvailable: false };
    }

    return {
      current: localVersion,
      latest: latest.version,
      updateAvailable: isNewer(latest.version, localVersion),
      changelog: latest.changelog || "",
      sizeBytes: latest.sizeBytes || 0,
      releaseDate: latest.releaseDate || null
    };
  } catch {
    return { current: getLocalVersion(), latest: null, updateAvailable: false };
  }
}

export default {
  checkForUpdates,
  forceUpdate,
  checkVersion,
  consumeUpdateState
};
