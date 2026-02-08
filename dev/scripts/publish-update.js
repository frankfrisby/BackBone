#!/usr/bin/env node

/**
 * BACKBONE Update Publisher
 *
 * Creates and publishes an update package to Firebase.
 *
 * Usage:
 *   node scripts/publish-update.js [--bump patch|minor|major] [--changelog "text"]
 *
 * Steps:
 *   1. Bumps version in package.json
 *   2. Creates zip of updatable files (NOT node/, data/, memory/, projects/)
 *   3. Computes SHA-256 of zip
 *   4. Uploads zip to Firebase Storage: updates/BackBone-{version}.zip
 *   5. Writes Firestore document: updates/latest
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const log = (msg) => console.log(`${CYAN}[release]${RESET} ${msg}`);
const ok = (msg) => console.log(`  ${GREEN}+${RESET} ${msg}`);
const warn = (msg) => console.log(`  ${YELLOW}!${RESET} ${msg}`);
const err = (msg) => console.log(`  ${RED}x${RESET} ${msg}`);

// Firebase configuration
const FIREBASE_API_KEY = "AIzaSyBKLqcnFQwNSKqHXgTBLok3l74ZmNh6_y0";
const FIREBASE_PROJECT_ID = "backboneai";
const STORAGE_BUCKET = "backboneai.firebasestorage.app";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const STORAGE_BASE = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o`;

// Files/dirs to include in update zip
const INCLUDE_DIRS = ["bin", "src", "skills", "node_modules"];
const INCLUDE_FILES = ["package.json", "CLAUDE.md", "backbone.bat", "BackBone.cmd", "BackBone.bat", "BackBone.ps1"];

/**
 * Parse CLI arguments.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = { bump: "patch", changelog: "" };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--bump" && args[i + 1]) {
      result.bump = args[i + 1];
      i++;
    } else if (args[i] === "--changelog" && args[i + 1]) {
      result.changelog = args[i + 1];
      i++;
    }
  }

  if (!["patch", "minor", "major"].includes(result.bump)) {
    err(`Invalid bump type: ${result.bump}. Must be patch, minor, or major.`);
    process.exit(1);
  }

  return result;
}

/**
 * Bump version in package.json.
 */
function bumpVersion(type) {
  const pkgPath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const parts = pkg.version.split(".").map(Number);

  if (type === "major") { parts[0]++; parts[1] = 0; parts[2] = 0; }
  else if (type === "minor") { parts[1]++; parts[2] = 0; }
  else { parts[2]++; }

  const oldVersion = pkg.version;
  pkg.version = parts.join(".");
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  return { oldVersion, newVersion: pkg.version };
}

/**
 * Create zip of updatable files.
 */
function createZip(version) {
  const zipName = `BackBone-${version}.zip`;
  const zipPath = path.join(ROOT, "dist", zipName);

  // Ensure dist/ exists
  const distDir = path.join(ROOT, "dist");
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  // Clean old zip if exists
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  // Build the list of items to include
  const items = [];
  for (const dir of INCLUDE_DIRS) {
    if (fs.existsSync(path.join(ROOT, dir))) items.push(dir);
  }
  for (const file of INCLUDE_FILES) {
    if (fs.existsSync(path.join(ROOT, file))) items.push(file);
  }

  if (items.length === 0) {
    throw new Error("No files found to package");
  }

  // Use PowerShell on Windows, zip on Unix
  if (process.platform === "win32") {
    // Create a temp directory with just the files we want
    const tempDir = path.join(distDir, `_release_temp_${version}`);
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });

    // Copy items to temp dir
    for (const item of items) {
      const src = path.join(ROOT, item);
      const dest = path.join(tempDir, item);
      if (fs.statSync(src).isDirectory()) {
        copyDirRecursive(src, dest);
      } else {
        fs.copyFileSync(src, dest);
      }
    }

    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${zipPath}' -Force"`,
      { stdio: "pipe", timeout: 300000 }
    );

    // Clean up temp
    fs.rmSync(tempDir, { recursive: true, force: true });
  } else {
    const itemList = items.join(" ");
    execSync(`cd "${ROOT}" && zip -r "${zipPath}" ${itemList}`, { stdio: "pipe", timeout: 300000 });
  }

  const stats = fs.statSync(zipPath);
  return { zipPath, zipName, sizeBytes: stats.size };
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
      if (entry.name === ".git") continue;
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Compute SHA-256 hash of a file.
 */
function computeSHA256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Get Firebase auth token from local user file.
 */
async function getAuthToken() {
  const userPath = path.join(ROOT, "data", "firebase-user.json");
  if (!fs.existsSync(userPath)) {
    throw new Error("Not authenticated. Run the app and sign in with /account first.");
  }

  const userData = JSON.parse(fs.readFileSync(userPath, "utf-8"));

  // Try refresh if we have a refresh token
  if (userData.refreshToken) {
    try {
      const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "refresh_token", refresh_token: userData.refreshToken })
      });
      if (res.ok) {
        const data = await res.json();
        userData.idToken = data.id_token;
        userData.refreshToken = data.refresh_token;
        fs.writeFileSync(userPath, JSON.stringify(userData, null, 2));
        return { token: data.id_token, uid: userData.localId };
      }
    } catch { /* fall through */ }
  }

  if (!userData.idToken) {
    throw new Error("No valid auth token. Run the app and sign in with /account.");
  }

  return { token: userData.idToken, uid: userData.localId };
}

/**
 * Upload zip to Firebase Storage.
 */
async function uploadToStorage(zipPath, remoteName, token) {
  const content = fs.readFileSync(zipPath);
  const encoded = encodeURIComponent(remoteName);
  const url = `${STORAGE_BASE}?uploadType=media&name=${encoded}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/zip",
      "Authorization": `Bearer ${token}`
    },
    body: content
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Storage upload failed (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Write update metadata to Firestore.
 */
async function writeFirestoreDoc(version, sha256, sizeBytes, changelog, token) {
  const url = `${FIRESTORE_BASE}/updates/latest?key=${FIREBASE_API_KEY}`;

  const body = {
    fields: {
      version: { stringValue: version },
      downloadUrl: { stringValue: `updates/BackBone-${version}.zip` },
      sha256: { stringValue: sha256 },
      sizeBytes: { integerValue: String(sizeBytes) },
      changelog: { stringValue: changelog },
      releaseDate: { stringValue: new Date().toISOString() },
      minVersion: { stringValue: "2.0.0" }
    }
  };

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore write failed (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Main release flow.
 */
async function main() {
  console.log(`\n${BOLD}${CYAN}=====================================${RESET}`);
  console.log(`${BOLD}${CYAN}  BACKBONE Update Publisher${RESET}`);
  console.log(`${BOLD}${CYAN}=====================================${RESET}\n`);

  const args = parseArgs();

  // 1. Bump version
  log(`Bumping version (${args.bump})...`);
  const { oldVersion, newVersion } = bumpVersion(args.bump);
  ok(`${oldVersion} -> ${newVersion}`);

  // 2. Create zip
  log("Creating update package...");
  const { zipPath, zipName, sizeBytes } = createZip(newVersion);
  ok(`${zipName} (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`);

  // 3. Compute SHA-256
  log("Computing SHA-256...");
  const sha256 = computeSHA256(zipPath);
  ok(sha256);

  // 4. Authenticate
  log("Authenticating with Firebase...");
  const { token, uid } = await getAuthToken();
  ok(`Authenticated as ${uid}`);

  // 5. Upload to Storage
  log("Uploading to Firebase Storage...");
  const remotePath = `updates/${zipName}`;
  await uploadToStorage(zipPath, remotePath, token);
  ok(`Uploaded to ${remotePath}`);

  // 6. Write Firestore metadata
  log("Writing update metadata to Firestore...");
  await writeFirestoreDoc(newVersion, sha256, sizeBytes, args.changelog, token);
  ok("Firestore updates/latest written");

  // Summary
  console.log(`\n${BOLD}${GREEN}=====================================${RESET}`);
  console.log(`${BOLD}${GREEN}  Release v${newVersion} Published!${RESET}`);
  console.log(`${BOLD}${GREEN}=====================================${RESET}`);
  console.log(`\n  ${CYAN}Version:${RESET}    ${oldVersion} -> ${newVersion}`);
  console.log(`  ${CYAN}Package:${RESET}    ${zipName}`);
  console.log(`  ${CYAN}Size:${RESET}       ${(sizeBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  ${CYAN}SHA-256:${RESET}    ${sha256.substring(0, 16)}...`);
  console.log(`  ${CYAN}Storage:${RESET}    ${remotePath}`);
  console.log(`  ${CYAN}Changelog:${RESET}  ${args.changelog || "(none)"}`);
  console.log(`\n  Users will receive this update on next app launch.\n`);

  // Clean up zip from dist/
  // (Optional: keep it for reference)
  // fs.unlinkSync(zipPath);
}

main().catch((error) => {
  err(`Release failed: ${error.message}`);
  process.exit(1);
});
