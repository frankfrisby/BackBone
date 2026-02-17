#!/usr/bin/env node
"use strict";

/**
 * BACKBONE Runtime Bootstrap
 *
 * Ensures runtime dependencies are installed before launching the app UI.
 * This file intentionally uses Node built-ins only so it can run even when
 * node_modules is missing.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const APP_DIR = path.resolve(__dirname, "..");
const PACKAGE_JSON_PATH = path.join(APP_DIR, "package.json");
const PACKAGE_LOCK_PATH = path.join(APP_DIR, "package-lock.json");
const NODE_MODULES_DIR = path.join(APP_DIR, "node_modules");
const DATA_DIR = path.join(APP_DIR, "data");
const STAMP_PATH = path.join(DATA_DIR, ".runtime-deps-stamp.json");
const MIN_NODE_MAJOR = 20;
const CORE_RUNTIME_DEPENDENCIES = [
  "@whiskeysockets/baileys",
  "twilio",
  "qrcode-terminal"
];

const log = (message) => {
  console.log(`[BACKBONE][bootstrap] ${message}`);
};

const safeReadJson = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
};

const fileHash = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return "";
    const data = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(data).digest("hex");
  } catch {
    return "";
  }
};

const dependencyInstallPath = (depName) => {
  const segments = String(depName || "").split("/");
  return path.join(NODE_MODULES_DIR, ...segments);
};

const readDependencies = () => {
  const pkg = safeReadJson(PACKAGE_JSON_PATH);
  const deps = [
    ...Object.keys(pkg?.dependencies || {}),
    ...CORE_RUNTIME_DEPENDENCIES
  ];
  const unique = [...new Set(deps)];
  unique.sort();
  return unique;
};

const getNodeMajor = () => {
  const majorRaw = String(process.versions?.node || "0").split(".")[0];
  const major = Number.parseInt(majorRaw, 10);
  return Number.isFinite(major) ? major : 0;
};

const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const computeFingerprint = (dependencies) => {
  const payload = {
    nodeMajor: getNodeMajor(),
    packageJsonHash: fileHash(PACKAGE_JSON_PATH),
    packageLockHash: fileHash(PACKAGE_LOCK_PATH),
    dependencies
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
};

const readStamp = () => safeReadJson(STAMP_PATH);

const writeStamp = (fingerprint, dependencies) => {
  ensureDataDir();
  const stamp = {
    fingerprint,
    dependencyCount: dependencies.length,
    installedAt: new Date().toISOString(),
    nodeVersion: process.versions.node
  };
  fs.writeFileSync(STAMP_PATH, JSON.stringify(stamp, null, 2));
};

const missingDependencies = (dependencies) => {
  const missing = [];
  for (const dep of dependencies) {
    if (!fs.existsSync(dependencyInstallPath(dep))) {
      missing.push(dep);
    }
  }
  return missing;
};

const npmCommand = () => (process.platform === "win32" ? "npm.cmd" : "npm");

const runInstall = (packages = []) => {
  const env = {
    ...process.env,
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
    NPM_CONFIG_OFFLINE: "false",
    NPM_CONFIG_PREFER_ONLINE: "true"
  };

  let cmd;
  let args;
  const installExplicit = Array.isArray(packages) && packages.length > 0;
  if (process.platform === "win32") {
    cmd = "cmd.exe";
    const pkgArgs = installExplicit ? ` --no-save ${packages.join(" ")}` : "";
    args = ["/d", "/s", "/c", `npm install --no-audit --no-fund${pkgArgs}`];
    log(`Running dependency install: cmd.exe /c npm install --no-audit --no-fund${pkgArgs}`);
  } else {
    cmd = npmCommand();
    args = ["install", "--no-audit", "--no-fund"];
    if (installExplicit) {
      args.push("--no-save", ...packages);
    }
    log(`Running dependency install: ${cmd} ${args.join(" ")}`);
  }

  const result = spawnSync(cmd, args, {
    cwd: APP_DIR,
    stdio: "inherit",
    env
  });

  if (result.error) {
    throw new Error(`Failed to run ${cmd}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${cmd} install exited with code ${result.status}`);
  }
};

const determineInstallNeed = () => {
  if (!fs.existsSync(PACKAGE_JSON_PATH)) {
    return { shouldInstall: false, reason: "package.json not found (skipping bootstrap)" };
  }

  const nodeMajor = getNodeMajor();
  if (nodeMajor < MIN_NODE_MAJOR) {
    return {
      shouldInstall: false,
      fatal: true,
      reason: `Node.js ${MIN_NODE_MAJOR}+ is required (current: ${process.versions.node})`
    };
  }

  const deps = readDependencies();
  if (deps.length === 0) {
    return { shouldInstall: false, dependencies: deps, reason: "No runtime dependencies declared" };
  }

  const fingerprint = computeFingerprint(deps);
  const stamp = readStamp();
  const missing = missingDependencies(deps);

  if (!fs.existsSync(NODE_MODULES_DIR)) {
    return { shouldInstall: true, dependencies: deps, fingerprint, reason: "node_modules folder is missing" };
  }

  if (missing.length > 0) {
    return {
      shouldInstall: true,
      dependencies: deps,
      fingerprint,
      reason: `Missing dependencies (${missing.length}): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "..." : ""}`
    };
  }

  if (!stamp || stamp.fingerprint !== fingerprint) {
    return {
      shouldInstall: true,
      dependencies: deps,
      fingerprint,
      reason: "Dependency fingerprint changed"
    };
  }

  return {
    shouldInstall: false,
    dependencies: deps,
    fingerprint,
    reason: "Runtime dependencies are up to date"
  };
};

const verifyAfterInstall = (dependencies) => {
  const missing = missingDependencies(dependencies);
  if (missing.length > 0) {
    throw new Error(
      `Dependency verification failed. Still missing: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}`
    );
  }
};

const main = () => {
  const status = determineInstallNeed();

  if (status.fatal) {
    throw new Error(status.reason);
  }

  if (!status.shouldInstall) {
    return;
  }

  log(status.reason);
  runInstall();

  const missingAfterBaseInstall = missingDependencies(status.dependencies || []);
  if (missingAfterBaseInstall.length > 0) {
    log(`Installing still-missing runtime packages directly: ${missingAfterBaseInstall.slice(0, 10).join(", ")}${missingAfterBaseInstall.length > 10 ? "..." : ""}`);
    runInstall(missingAfterBaseInstall);
  }

  verifyAfterInstall(status.dependencies || []);
  writeStamp(status.fingerprint || computeFingerprint(status.dependencies || []), status.dependencies || []);
  log("Runtime dependency bootstrap complete.");
};

try {
  main();
} catch (error) {
  console.error(`[BACKBONE][bootstrap] ${error.message}`);
  process.exit(1);
}
