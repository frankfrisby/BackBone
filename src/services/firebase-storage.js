/**
 * Firebase Storage Service - Backup projects, memory, and data to Firebase Storage
 *
 * Uses the Firebase Storage REST API (no admin SDK required).
 * Backs up: projects/, memory/, data/user-skills/, data/spreadsheets/, data/goals/
 */
import fs from "fs";
import path from "path";
import { loadFirebaseConfig } from "./firebase-auth.js";

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_DIR = path.join(process.cwd(), "memory");
const PROJECTS_DIR = path.join(process.cwd(), "projects");
const USER_SKILLS_DIR = path.join(DATA_DIR, "user-skills");
const SPREADSHEETS_DIR = path.join(DATA_DIR, "spreadsheets");
const GOALS_DIR = path.join(DATA_DIR, "goals");
const SYNC_STATE_PATH = path.join(DATA_DIR, "firebase-sync-state.json");

// Directories to back up
const BACKUP_DIRS = [
  { local: PROJECTS_DIR, remote: "projects" },
  { local: MEMORY_DIR, remote: "memory" },
  { local: USER_SKILLS_DIR, remote: "user-skills" },
  { local: SPREADSHEETS_DIR, remote: "spreadsheets" },
  { local: GOALS_DIR, remote: "goals" }
];

// Also back up specific data files
const BACKUP_FILES = [
  "data/goals.json",
  "data/trades-log.json",
  "data/life-scores.json",
  "data/user-settings.json",
  "data/activity-log.json"
];

/**
 * Get Firebase Storage upload URL.
 */
function getUploadUrl(bucket, remotePath, token) {
  const encoded = encodeURIComponent(remotePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encoded}`;
}

/**
 * Get Firebase Storage download URL.
 */
function getDownloadUrl(bucket, remotePath) {
  const encoded = encodeURIComponent(remotePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media`;
}

/**
 * Get Firebase Storage list URL.
 */
function getListUrl(bucket, prefix) {
  const encoded = encodeURIComponent(prefix);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?prefix=${encoded}&maxResults=1000`;
}

/**
 * Load sync state (tracks what was last uploaded and when).
 */
function loadSyncState() {
  try {
    if (fs.existsSync(SYNC_STATE_PATH)) {
      return JSON.parse(fs.readFileSync(SYNC_STATE_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return { files: {}, lastSync: null };
}

function saveSyncState(state) {
  state.lastSync = new Date().toISOString();
  fs.writeFileSync(SYNC_STATE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Get a Firebase ID token for authenticated requests.
 * Uses the Firebase Auth REST API with the stored user session.
 */
async function getAuthToken() {
  const config = loadFirebaseConfig();
  if (!config?.apiKey) return null;

  // Try to read the stored user's refresh token
  const userPath = path.join(DATA_DIR, "firebase-user.json");
  if (!fs.existsSync(userPath)) return null;

  try {
    const userData = JSON.parse(fs.readFileSync(userPath, "utf-8"));
    if (userData.idToken) return userData.idToken;
    if (userData.refreshToken) {
      // Exchange refresh token for ID token
      const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${config.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "refresh_token", refresh_token: userData.refreshToken })
      });
      if (res.ok) {
        const data = await res.json();
        // Update stored token
        userData.idToken = data.id_token;
        userData.refreshToken = data.refresh_token;
        fs.writeFileSync(userPath, JSON.stringify(userData, null, 2));
        return data.id_token;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Get the storage bucket from Firebase config.
 */
function getBucket() {
  const config = loadFirebaseConfig();
  return config?.storageBucket || "backboneai.firebasestorage.app";
}

/**
 * Upload a Buffer to Firebase Storage (no local file needed).
 */
export async function uploadBuffer(buffer, remotePath, contentType = "application/octet-stream") {
  const token = await getAuthToken();
  const bucket = getBucket();
  const url = getUploadUrl(bucket, remotePath, token);

  const headers = { "Content-Type": contentType };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { method: "POST", headers, body: buffer });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed (${res.status}): ${err}`);
  }

  const meta = await res.json();
  return {
    ...meta,
    downloadUrl: getDownloadUrl(bucket, remotePath)
  };
}

/**
 * Upload a single file to Firebase Storage.
 */
export async function uploadFile(localPath, remotePath) {
  const token = await getAuthToken();
  const bucket = getBucket();
  const url = getUploadUrl(bucket, remotePath, token);

  const content = fs.readFileSync(localPath);
  const contentType = localPath.endsWith(".json") ? "application/json"
    : localPath.endsWith(".md") ? "text/markdown"
    : localPath.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "application/octet-stream";

  const headers = { "Content-Type": contentType };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { method: "POST", headers, body: content });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed (${res.status}): ${err}`);
  }
  return await res.json();
}

/**
 * Download a single file from Firebase Storage.
 */
export async function downloadFile(remotePath, localPath) {
  const token = await getAuthToken();
  const bucket = getBucket();
  const url = getDownloadUrl(bucket, remotePath);

  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Download failed (${res.status})`);
  }

  const dir = path.dirname(localPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(localPath, buffer);
  return { path: localPath, size: buffer.length };
}

/**
 * List files in a Firebase Storage prefix.
 */
export async function listRemoteFiles(prefix) {
  const token = await getAuthToken();
  const bucket = getBucket();
  const url = getListUrl(bucket, prefix);

  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) return [];

  const data = await res.json();
  return (data.items || []).map(item => ({
    name: item.name,
    size: parseInt(item.size || 0),
    updated: item.updated
  }));
}

/**
 * Collect all local files from the backup directories.
 */
function collectBackupFiles() {
  const files = [];

  for (const { local, remote } of BACKUP_DIRS) {
    if (!fs.existsSync(local)) continue;
    const walk = (dir, prefix) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        const remoteFull = `${prefix}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(fullPath, remoteFull);
        } else {
          files.push({ local: fullPath, remote: `backbone/${remoteFull}`, mtime: fs.statSync(fullPath).mtimeMs });
        }
      }
    };
    walk(local, remote);
  }

  // Add specific data files
  const base = process.cwd();
  for (const rel of BACKUP_FILES) {
    const fullPath = path.join(base, rel);
    if (fs.existsSync(fullPath)) {
      files.push({ local: fullPath, remote: `backbone/${rel}`, mtime: fs.statSync(fullPath).mtimeMs });
    }
  }

  return files;
}

/**
 * Backup all project data, memory, and spreadsheets to Firebase Storage.
 * Only uploads files that changed since last sync.
 *
 * @param {Object} [options]
 * @param {boolean} [options.force] - Upload all files regardless of sync state
 * @returns {Promise<{uploaded:number, skipped:number, errors:string[], duration:number}>}
 */
export async function backupToFirebase({ force = false } = {}) {
  const start = Date.now();
  const state = loadSyncState();
  const files = collectBackupFiles();

  let uploaded = 0;
  let skipped = 0;
  const errors = [];

  for (const file of files) {
    const lastSynced = state.files[file.remote];
    if (!force && lastSynced && file.mtime <= lastSynced) {
      skipped++;
      continue;
    }

    try {
      await uploadFile(file.local, file.remote);
      state.files[file.remote] = file.mtime;
      uploaded++;
    } catch (err) {
      errors.push(`${file.remote}: ${err.message}`);
    }
  }

  saveSyncState(state);
  return { uploaded, skipped, errors, total: files.length, duration: Date.now() - start };
}

/**
 * Restore data from Firebase Storage to local directories.
 *
 * @param {Object} [options]
 * @param {boolean} [options.overwrite] - Overwrite existing local files
 * @returns {Promise<{downloaded:number, skipped:number, errors:string[]}>}
 */
export async function restoreFromFirebase({ overwrite = false } = {}) {
  const remoteFiles = await listRemoteFiles("backbone/");
  let downloaded = 0;
  let skipped = 0;
  const errors = [];

  for (const rf of remoteFiles) {
    // Convert remote path to local path
    const relativePath = rf.name.replace(/^backbone\//, "");
    const localPath = path.join(process.cwd(), relativePath);

    if (!overwrite && fs.existsSync(localPath)) {
      skipped++;
      continue;
    }

    try {
      await downloadFile(rf.name, localPath);
      downloaded++;
    } catch (err) {
      errors.push(`${rf.name}: ${err.message}`);
    }
  }

  return { downloaded, skipped, errors, total: remoteFiles.length };
}

/**
 * Get backup status — what would be synced.
 */
export function getBackupStatus() {
  const state = loadSyncState();
  const files = collectBackupFiles();

  let pending = 0;
  let synced = 0;

  for (const file of files) {
    const lastSynced = state.files[file.remote];
    if (lastSynced && file.mtime <= lastSynced) {
      synced++;
    } else {
      pending++;
    }
  }

  return {
    total: files.length,
    synced,
    pending,
    lastSync: state.lastSync,
    bucket: getBucket()
  };
}

export { getDownloadUrl, getBucket };

export default {
  uploadFile,
  uploadBuffer,
  downloadFile,
  listRemoteFiles,
  backupToFirebase,
  restoreFromFirebase,
  getBackupStatus,
  getDownloadUrl,
  getBucket
};
