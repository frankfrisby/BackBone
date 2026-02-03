/**
 * Profile Manager Service
 * Archives and restores user profiles on logout/login for multi-user support.
 * Data is moved to _profiles/{uid}/ so another user can sign in fresh.
 */

import fs from "fs";
import path from "path";

const BASE_DIR = process.cwd();
const PROFILES_DIR = path.join(BASE_DIR, "_profiles");
const DATA_DIR = path.join(BASE_DIR, "data");

// Directories to archive per-user
const USER_DIRS = ["data", "memory", "projects", "screenshots"];

// Files in data/ that are shared across users (not archived)
const SHARED_FILES = ["firebase-config.json"];

// Files excluded from archive (regenerated on sign-in)
const EXCLUDED_FILES = ["firebase-user.json"];

/**
 * Recursively copy a directory (fallback when rename fails)
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively delete a directory
 */
function rmDirSync(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Move a directory: try rename first (O(1)), fall back to copy+delete
 */
function moveDirSync(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    // EPERM, EBUSY, EXDEV — fall back to recursive copy
    if (["EPERM", "EBUSY", "EXDEV"].includes(err.code)) {
      copyDirSync(src, dest);
      rmDirSync(src);
    } else {
      throw err;
    }
  }
}

/**
 * Read the current Firebase user from data/firebase-user.json
 */
function readFirebaseUser() {
  try {
    const userPath = path.join(DATA_DIR, "firebase-user.json");
    if (fs.existsSync(userPath)) {
      return JSON.parse(fs.readFileSync(userPath, "utf-8"));
    }
  } catch {}
  return null;
}

/**
 * Archive the current user's profile to _profiles/{uid}/
 * Moves data/, memory/, projects/, screenshots/ into the archive.
 * Preserves shared files (firebase-config.json) and recreates empty working dirs.
 */
export async function archiveCurrentProfile() {
  const user = readFirebaseUser();
  if (!user || !user.id) {
    // No Firebase user — nothing to archive
    return { success: false, reason: "no-user" };
  }

  const uid = user.id;
  const profileDir = path.join(PROFILES_DIR, uid);

  // If archive already exists, remove it (latest state wins)
  if (fs.existsSync(profileDir)) {
    rmDirSync(profileDir);
  }
  fs.mkdirSync(profileDir, { recursive: true });

  // Save shared files before moving data/
  const savedShared = {};
  for (const filename of SHARED_FILES) {
    const filePath = path.join(DATA_DIR, filename);
    try {
      if (fs.existsSync(filePath)) {
        savedShared[filename] = fs.readFileSync(filePath);
      }
    } catch {}
  }

  // Move each user directory into the archive
  for (const dirName of USER_DIRS) {
    const srcDir = path.join(BASE_DIR, dirName);
    const destDir = path.join(profileDir, dirName);
    if (!fs.existsSync(srcDir)) continue;

    if (dirName === "data") {
      // For data dir, skip excluded files during move
      fs.mkdirSync(destDir, { recursive: true });
      const entries = fs.readdirSync(srcDir, { withFileTypes: true });
      for (const entry of entries) {
        if (EXCLUDED_FILES.includes(entry.name)) continue;
        // backbone-chrome-profile may be locked — wrap in try/catch
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        try {
          if (entry.isDirectory()) {
            moveDirSync(srcPath, destPath);
          } else {
            fs.renameSync(srcPath, destPath);
          }
        } catch (err) {
          if (entry.name === "backbone-chrome-profile") {
            // Chrome profile may be locked — skip silently
            console.error(`[profile-manager] Skipped locked: ${entry.name}`);
          } else {
            // Try copy+delete fallback for files
            try {
              if (entry.isDirectory()) {
                copyDirSync(srcPath, destPath);
                rmDirSync(srcPath);
              } else {
                fs.copyFileSync(srcPath, destPath);
                fs.unlinkSync(srcPath);
              }
            } catch (fallbackErr) {
              console.error(`[profile-manager] Failed to archive ${entry.name}: ${fallbackErr.message}`);
            }
          }
        }
      }
    } else {
      try {
        moveDirSync(srcDir, destDir);
      } catch (err) {
        console.error(`[profile-manager] Failed to move ${dirName}: ${err.message}`);
      }
    }
  }

  // Write profile metadata
  const meta = {
    uid,
    email: user.email || null,
    name: user.name || null,
    archivedAt: new Date().toISOString(),
    version: 1,
  };
  fs.writeFileSync(
    path.join(profileDir, "profile-meta.json"),
    JSON.stringify(meta, null, 2)
  );

  // Recreate empty working directories
  for (const dirName of USER_DIRS) {
    const dir = path.join(BASE_DIR, dirName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Restore shared files to data/
  for (const [filename, content] of Object.entries(savedShared)) {
    try {
      fs.writeFileSync(path.join(DATA_DIR, filename), content);
    } catch {}
  }

  return { success: true, uid, profileDir };
}

/**
 * Restore an archived profile for the given UID.
 * Moves _profiles/{uid}/data|memory|projects|screenshots back to working dirs.
 */
export async function restoreProfile(uid) {
  const profileDir = path.join(PROFILES_DIR, uid);
  if (!fs.existsSync(profileDir)) {
    return { success: false, reason: "no-archive" };
  }

  // Save shared files from current data/ before overwriting
  const savedShared = {};
  for (const filename of SHARED_FILES) {
    const filePath = path.join(DATA_DIR, filename);
    try {
      if (fs.existsSync(filePath)) {
        savedShared[filename] = fs.readFileSync(filePath);
      }
    } catch {}
  }

  // Move each archived directory back
  for (const dirName of USER_DIRS) {
    const srcDir = path.join(profileDir, dirName);
    const destDir = path.join(BASE_DIR, dirName);
    if (!fs.existsSync(srcDir)) continue;

    // Remove existing (empty) working dir before restoring
    if (fs.existsSync(destDir)) {
      rmDirSync(destDir);
    }

    try {
      moveDirSync(srcDir, destDir);
    } catch (err) {
      console.error(`[profile-manager] Failed to restore ${dirName}: ${err.message}`);
      // Ensure destination exists even if restore fails
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
    }
  }

  // Restore shared files on top (they may have been overwritten by archive data)
  for (const [filename, content] of Object.entries(savedShared)) {
    try {
      fs.writeFileSync(path.join(DATA_DIR, filename), content);
    } catch {}
  }

  // Clean up the archive directory
  try {
    rmDirSync(profileDir);
  } catch (err) {
    console.error(`[profile-manager] Failed to clean archive: ${err.message}`);
  }

  return { success: true, uid };
}

/**
 * Check if an archived profile exists for the given UID
 */
export function hasArchivedProfile(uid) {
  if (!uid) return false;
  const profileDir = path.join(PROFILES_DIR, uid);
  return fs.existsSync(profileDir) && fs.existsSync(path.join(profileDir, "profile-meta.json"));
}

/**
 * List all archived profiles with their metadata
 */
export function listProfiles() {
  if (!fs.existsSync(PROFILES_DIR)) return [];

  const profiles = [];
  try {
    const entries = fs.readdirSync(PROFILES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(PROFILES_DIR, entry.name, "profile-meta.json");
      try {
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          profiles.push(meta);
        }
      } catch {}
    }
  } catch {}

  // Sort by archivedAt descending
  profiles.sort((a, b) => (b.archivedAt || "").localeCompare(a.archivedAt || ""));
  return profiles;
}
