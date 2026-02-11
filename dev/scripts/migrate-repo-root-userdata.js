/**
 * One-time migration helper:
 * Move repo-root user-data dirs (data/, memory/, projects/) into ~/.backbone/users/<uid>/...
 *
 * Why this exists:
 * - The engine stores user data in BACKBONE_HOME (see src/services/paths.js).
 * - Older code / agents sometimes wrote user data repo-relative, creating drift.
 *
 * Default behavior:
 * - Move entries that don't exist in the destination.
 * - If a destination entry already exists, move the repo-root entry into a timestamped
 *   backup path inside the destination so nothing is lost.
 * - Special-case memory files:
 *   - memory/health.md -> memory/health-notes.md
 *   - memory/portfolio.md -> memory/portfolio-notes.md
 *   - memory/engine-work-log.md swaps into place (backs up the destination first)
 *
 * Usage:
 *   node dev/scripts/migrate-repo-root-userdata.js
 *   node dev/scripts/migrate-repo-root-userdata.js --dry-run
 */

import fs from "fs";
import path from "path";

import {
  getEngineRoot,
  getBackboneRoot,
  getDataDir,
  getMemoryDir,
  getProjectsDir,
} from "../../src/services/paths.js";

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has("--dry-run");

const nowStamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const ts = nowStamp();

const log = (msg) => console.log(msg);
const warn = (msg) => console.warn(msg);

const ensureDir = (dir) => {
  if (DRY_RUN) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const safeRename = (from, to) => {
  if (DRY_RUN) {
    log(`[dry-run] MOVE ${from} -> ${to}`);
    return;
  }
  ensureDir(path.dirname(to));
  fs.renameSync(from, to);
  log(`MOVE ${from} -> ${to}`);
};

const moveWithBackup = (srcPath, destPath, backupRoot) => {
  if (!fs.existsSync(destPath)) {
    safeRename(srcPath, destPath);
    return;
  }

  const rel = path.basename(srcPath);
  const backupPath = path.join(backupRoot, rel);
  safeRename(srcPath, backupPath);
};

const migrateDataDir = (srcDir, destDir) => {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(destDir);

  const backupRoot = path.join(destDir, "__repo_root_backup__", ts);
  log(`\n[Data] ${srcDir} -> ${destDir}`);

  for (const entry of fs.readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    moveWithBackup(srcPath, destPath, backupRoot);
  }
};

const migrateMemoryDir = (srcDir, destDir) => {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(destDir);

  const backupRoot = path.join(destDir, "__repo_root_backup__", ts);
  log(`\n[Memory] ${srcDir} -> ${destDir}`);

  const specialMap = new Map([
    ["health.md", "health-notes.md"],
    ["portfolio.md", "portfolio-notes.md"],
  ]);

  for (const entry of fs.readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, entry);

    if (entry === "engine-work-log.md") {
      const destPath = path.join(destDir, entry);
      if (fs.existsSync(destPath)) {
        const backup = path.join(destDir, `engine-work-log.backbone-template.${ts}.md`);
        safeRename(destPath, backup);
      }
      safeRename(srcPath, destPath);
      continue;
    }

    const mapped = specialMap.get(entry) || entry;
    const destPath = path.join(destDir, mapped);

    // If mapped target exists, back it up rather than overwriting.
    if (fs.existsSync(destPath)) {
      const backupPath = path.join(backupRoot, mapped);
      safeRename(srcPath, backupPath);
      continue;
    }

    safeRename(srcPath, destPath);
  }
};

const migrateProjectsDir = (srcDir, destDir) => {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(destDir);

  log(`\n[Projects] ${srcDir} -> ${destDir}`);

  for (const entry of fs.readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    if (!fs.existsSync(destPath)) {
      safeRename(srcPath, destPath);
      continue;
    }

    // Keep both; make the repo-root copy easy to find.
    let alt = path.join(destDir, `${entry}__repo_root_${ts}`);
    let i = 1;
    while (fs.existsSync(alt)) {
      i += 1;
      alt = path.join(destDir, `${entry}__repo_root_${ts}_${i}`);
    }
    safeRename(srcPath, alt);
  }
};

const maybeRemoveEmptyDir = (dir) => {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  if (entries.length !== 0) return;
  if (DRY_RUN) {
    log(`[dry-run] RMDIR ${dir}`);
    return;
  }
  fs.rmdirSync(dir);
  log(`RMDIR ${dir}`);
};

const main = () => {
  const engineRoot = getEngineRoot();
  const backboneRoot = getBackboneRoot();

  log(`[migrate] Engine root: ${engineRoot}`);
  log(`[migrate] Backbone root: ${backboneRoot}`);
  log(`[migrate] Target data dir: ${getDataDir()}`);
  log(`[migrate] Target memory dir: ${getMemoryDir()}`);
  log(`[migrate] Target projects dir: ${getProjectsDir()}`);
  if (DRY_RUN) log("[migrate] DRY RUN mode - no filesystem changes will be made.");

  const repoData = path.join(engineRoot, "data");
  const repoMemory = path.join(engineRoot, "memory");
  const repoProjects = path.join(engineRoot, "projects");

  migrateDataDir(repoData, getDataDir());
  migrateMemoryDir(repoMemory, getMemoryDir());
  migrateProjectsDir(repoProjects, getProjectsDir());

  // Clean up empty repo-root dirs so agents can't accidentally read stale copies.
  maybeRemoveEmptyDir(repoData);
  maybeRemoveEmptyDir(repoMemory);
  maybeRemoveEmptyDir(repoProjects);

  warn("\n[migrate] Done. If you still see repo-root data directories with files, re-run or inspect conflicts in __repo_root_backup__.");
};

main();

