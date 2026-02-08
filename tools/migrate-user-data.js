#!/usr/bin/env node
/**
 * BACKBONE — Migrate User Data to ~/.backbone/
 *
 * Moves user data from the in-repo layout (legacy) to the new
 * BACKBONE_HOME directory (~/.backbone/ by default).
 *
 * What moves:
 *   data/       → ~/.backbone/data/
 *   memory/     → ~/.backbone/memory/
 *   projects/   → ~/.backbone/projects/
 *   screenshots/ → ~/.backbone/screenshots/
 *
 * What stays (engine code):
 *   src/, bin/, tools/, skills/, docs/, package.json, etc.
 *
 * Safety:
 *   - Copies first, then verifies, then removes originals
 *   - Never deletes without verification
 *   - Skips files that already exist at destination
 *   - Creates .gitkeep files in original dirs to keep git structure
 *   - Dry-run mode by default (use --execute to actually migrate)
 *
 * Usage:
 *   node tools/migrate-user-data.js             # Dry run (preview)
 *   node tools/migrate-user-data.js --execute   # Actually migrate
 *   node tools/migrate-user-data.js --target /path/to/home  # Custom target
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const EXECUTE = process.argv.includes("--execute");
const targetIdx = process.argv.indexOf("--target");
const TARGET = targetIdx >= 0 ? process.argv[targetIdx + 1] : path.join(os.homedir(), ".backbone");

const DIRS_TO_MIGRATE = ["data", "memory", "projects", "screenshots"];

let copied = 0;
let skipped = 0;
let errors = 0;

function log(msg) { console.log(msg); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }
function ok(msg) { console.log(`  ✓ ${msg}`); }

function walkFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

function verifyFile(src, dest) {
  if (!fs.existsSync(dest)) return false;
  const srcStat = fs.statSync(src);
  const destStat = fs.statSync(dest);
  return srcStat.size === destStat.size;
}

// ── Main ──────────────────────────────────────────────────────

log("");
log("═══════════════════════════════════════════════════");
log("  BACKBONE — User Data Migration");
log("═══════════════════════════════════════════════════");
log("");
log(`  From: ${REPO_ROOT}`);
log(`  To:   ${TARGET}`);
log(`  Mode: ${EXECUTE ? "EXECUTE (will move files)" : "DRY RUN (preview only)"}`);
log("");

// Pre-flight checks
for (const dir of DIRS_TO_MIGRATE) {
  const srcDir = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(srcDir)) {
    log(`  ${dir}/ — not found in repo (skipping)`);
    continue;
  }

  const files = walkFiles(srcDir);
  log(`  ${dir}/ — ${files.length} files to migrate`);

  for (const srcFile of files) {
    const relative = path.relative(path.join(REPO_ROOT, dir), srcFile);
    const destFile = path.join(TARGET, dir, relative);

    if (fs.existsSync(destFile)) {
      skipped++;
      if (!EXECUTE) {
        // Only show skips in verbose mode
      }
      continue;
    }

    if (EXECUTE) {
      try {
        copyFile(srcFile, destFile);
        if (verifyFile(srcFile, destFile)) {
          copied++;
        } else {
          warn(`Verification failed: ${relative}`);
          errors++;
        }
      } catch (err) {
        warn(`Copy failed: ${relative} — ${err.message}`);
        errors++;
      }
    } else {
      copied++;
    }
  }
}

log("");

if (!EXECUTE) {
  log(`  Would copy: ${copied} files`);
  log(`  Would skip: ${skipped} files (already exist at destination)`);
  log("");
  log("  Run with --execute to perform the migration.");
  log("");
  process.exit(0);
}

// ── Post-copy: verify and remove originals ──────────────────

if (errors > 0) {
  log(`  ✗ ${errors} errors occurred during copy. Aborting removal.`);
  log("    Fix the errors above and re-run the migration.");
  process.exit(1);
}

log(`  Copied: ${copied} files`);
log(`  Skipped: ${skipped} files (already existed)`);
log("");

// Remove originals and leave .gitkeep
log("  Removing originals from repo...");
for (const dir of DIRS_TO_MIGRATE) {
  const srcDir = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(srcDir)) continue;

  const files = walkFiles(srcDir);
  let removedCount = 0;

  for (const srcFile of files) {
    const relative = path.relative(path.join(REPO_ROOT, dir), srcFile);
    const destFile = path.join(TARGET, dir, relative);

    // Only remove if destination verified
    if (verifyFile(srcFile, destFile)) {
      try {
        fs.unlinkSync(srcFile);
        removedCount++;
      } catch (err) {
        warn(`Could not remove ${relative}: ${err.message}`);
      }
    }
  }

  // Clean up empty directories (bottom-up)
  const cleanEmptyDirs = (dirPath) => {
    if (!fs.existsSync(dirPath)) return;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        cleanEmptyDirs(path.join(dirPath, entry.name));
      }
    }
    // Remove if empty
    const remaining = fs.readdirSync(dirPath);
    if (remaining.length === 0 && dirPath !== srcDir) {
      fs.rmdirSync(dirPath);
    }
  };
  cleanEmptyDirs(srcDir);

  // Leave .gitkeep so git structure is maintained
  const gitkeep = path.join(srcDir, ".gitkeep");
  if (!fs.existsSync(gitkeep)) {
    fs.writeFileSync(gitkeep, "");
  }

  ok(`${dir}/ — removed ${removedCount} files, left .gitkeep`);
}

log("");
log("  Migration complete!");
log(`  BACKBONE_HOME: ${TARGET}`);
log("");
log("  To use the new location, either:");
log("    1. Set BACKBONE_HOME in your .env file:");
log(`       BACKBONE_HOME=${TARGET}`);
log("    2. Or just remove the data/ directory from the repo");
log("       (paths.js will auto-detect ~/.backbone/)");
log("");
