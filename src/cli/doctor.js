/**
 * backbone doctor — Health check & diagnostics
 *
 * Inspired by OpenClaw's `openclaw doctor`. Checks:
 * - Server health (localhost:3000)
 * - Lock file status
 * - Credential vault
 * - MCP server configs
 * - Memory files
 * - Data integrity
 * - Node.js version
 */

import fs from "fs";
import path from "path";
import http from "http";
import { execSync } from "child_process";
import { ensureUserDirs, dataFile, memoryFile, getDataDir, getBackboneHome, getEngineRoot, getActiveUserId } from "../services/paths.js";
import { section, label, ok, fail, warn, info, theme, symbols } from "./theme.js";

const HELP = `
backbone doctor — Health check & diagnostics

Usage: backbone doctor [options]

Options:
  --fix       Attempt to fix detected issues
  --json      Output machine-readable JSON
  --help      Show this help

Checks:
  Node.js version, server health, lock file, credential vault,
  MCP configs, memory files, data files, proactive scheduler
`;

async function checkServer() {
  return new Promise((resolve) => {
    const req = http.get("http://localhost:3000/health", { timeout: 3000 }, (res) => {
      res.resume();
      resolve({ up: res.statusCode === 200, statusCode: res.statusCode });
    });
    req.on("error", () => resolve({ up: false, statusCode: null }));
    req.on("timeout", () => { req.destroy(); resolve({ up: false, statusCode: null }); });
  });
}

function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1));
  return { version, ok: major >= 20 };
}

function checkLockFile() {
  const lockPath = dataFile(".backbone.lock");
  if (!fs.existsSync(lockPath)) return { exists: false, stale: false, pid: null };
  try {
    const data = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    let alive = false;
    try { process.kill(data.pid, 0); alive = true; } catch {}
    // On Windows check it's actually node
    let isNode = true;
    if (alive && process.platform === "win32") {
      try {
        const name = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${data.pid} -ErrorAction SilentlyContinue).ProcessName"`, { encoding: "utf-8", timeout: 3000 }).trim().toLowerCase();
        isNode = name === "node";
      } catch { isNode = false; }
    }
    return { exists: true, stale: alive && !isNode, pid: data.pid, alive: alive && isNode };
  } catch {
    return { exists: true, stale: true, pid: null };
  }
}

function checkDataFiles() {
  const required = [
    "goals.json", "core-beliefs.json", "life-scores.json",
    "user-settings.json", "backlog.json"
  ];
  const results = [];
  for (const file of required) {
    const p = dataFile(file);
    const exists = fs.existsSync(p);
    let valid = false;
    if (exists) {
      try { JSON.parse(fs.readFileSync(p, "utf-8")); valid = true; } catch {}
    }
    results.push({ file, exists, valid });
  }
  return results;
}

function checkMemoryFiles() {
  const files = [
    "BACKBONE.md", "thesis.md", "profile.md", "goals.md",
    "health.md", "portfolio.md", "tickers.md"
  ];
  const results = [];
  for (const file of files) {
    const p = memoryFile(file);
    const exists = fs.existsSync(p);
    let size = 0;
    if (exists) {
      try { size = fs.statSync(p).size; } catch {}
    }
    results.push({ file, exists, size });
  }
  return results;
}

function checkCredentialVault() {
  const vaultPath = dataFile(".vault.enc");
  const pinPath = dataFile(".vault-pin");
  return {
    vaultExists: fs.existsSync(vaultPath),
    pinExists: fs.existsSync(pinPath),
    vaultSize: fs.existsSync(vaultPath) ? fs.statSync(vaultPath).size : 0,
  };
}

function checkMcpConfig() {
  const mcpPath = path.join(getEngineRoot(), ".mcp.json");
  if (!fs.existsSync(mcpPath)) return { exists: false, servers: [] };
  try {
    const config = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
    const servers = Object.keys(config.mcpServers || {});
    return { exists: true, servers };
  } catch {
    return { exists: true, servers: [], error: "Parse error" };
  }
}

function checkProactiveScheduler() {
  const stateFile = dataFile("proactive-scheduler.json");
  if (!fs.existsSync(stateFile)) return { exists: false };
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    const jobs = Object.entries(state.jobs || {});
    const lastRun = jobs.reduce((latest, [_, j]) => {
      const t = j.lastRun ? new Date(j.lastRun).getTime() : 0;
      return t > latest ? t : latest;
    }, 0);
    return {
      exists: true,
      jobCount: jobs.length,
      messagesDelivered: state.stats?.messagesDelivered || 0,
      lastRun: lastRun ? new Date(lastRun).toISOString() : null,
    };
  } catch {
    return { exists: true, error: "Parse error" };
  }
}

export async function runDoctor(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  const jsonMode = args.includes("--json");
  const fixMode = args.includes("--fix");
  const results = {};

  console.log(theme.heading("\n  BACKBONE Doctor\n"));

  // 1. Node version
  const node = checkNodeVersion();
  results.node = node;
  if (!jsonMode) {
    console.log(section("Runtime"));
    console.log(node.ok ? ok(`Node.js ${node.version}`) : fail(`Node.js ${node.version} (need >= 20)`));
    console.log(label("Platform", `${process.platform} ${process.arch}`));
    console.log(label("User", getActiveUserId()));
  }

  // 2. Server health
  const server = await checkServer();
  results.server = server;
  if (!jsonMode) {
    console.log(section("Server"));
    console.log(server.up ? ok("Server running on :3000") : fail("Server not responding on :3000"));
  }

  // 3. Lock file
  const lock = checkLockFile();
  results.lock = lock;
  if (!jsonMode) {
    console.log(section("Lock File"));
    if (!lock.exists) {
      console.log(info("No lock file (no instance running)"));
    } else if (lock.stale) {
      console.log(warn(`Stale lock file (PID ${lock.pid} is not backbone)`));
      if (fixMode) {
        try {
          fs.unlinkSync(dataFile(".backbone.lock"));
          console.log(ok("Removed stale lock file"));
        } catch (e) {
          console.log(fail(`Could not remove lock: ${e.message}`));
        }
      } else {
        console.log(info("Run with --fix to remove"));
      }
    } else if (lock.alive) {
      console.log(ok(`Active instance (PID ${lock.pid})`));
    } else {
      console.log(warn(`Lock exists but PID ${lock.pid} is dead`));
      if (fixMode) {
        try {
          fs.unlinkSync(dataFile(".backbone.lock"));
          console.log(ok("Removed dead lock file"));
        } catch {}
      }
    }
  }

  // 4. Credential vault
  const vault = checkCredentialVault();
  results.vault = vault;
  if (!jsonMode) {
    console.log(section("Credential Vault"));
    console.log(vault.vaultExists ? ok(`Vault exists (${vault.vaultSize} bytes)`) : warn("No vault file"));
    console.log(vault.pinExists ? ok("PIN file present") : warn("No PIN file"));
  }

  // 5. MCP config
  const mcp = checkMcpConfig();
  results.mcp = mcp;
  if (!jsonMode) {
    console.log(section("MCP Servers"));
    if (mcp.exists) {
      console.log(ok(`${mcp.servers.length} servers configured`));
      for (const s of mcp.servers) {
        console.log(label("  " + s, theme.success("registered")));
      }
    } else {
      console.log(warn("No .mcp.json found"));
    }
  }

  // 6. Data files
  const data = checkDataFiles();
  results.data = data;
  if (!jsonMode) {
    console.log(section("Data Files"));
    for (const d of data) {
      if (!d.exists) console.log(fail(`${d.file} missing`));
      else if (!d.valid) console.log(warn(`${d.file} exists but invalid JSON`));
      else console.log(ok(d.file));
    }
  }

  // 7. Memory files
  const memory = checkMemoryFiles();
  results.memory = memory;
  if (!jsonMode) {
    console.log(section("Memory Files"));
    for (const m of memory) {
      if (!m.exists) console.log(theme.muted(`  ${symbols.dot} ${m.file} (not created yet)`));
      else console.log(ok(`${m.file} (${(m.size / 1024).toFixed(1)}KB)`));
    }
  }

  // 8. Proactive scheduler
  const scheduler = checkProactiveScheduler();
  results.scheduler = scheduler;
  if (!jsonMode) {
    console.log(section("Proactive Scheduler"));
    if (!scheduler.exists) {
      console.log(info("No scheduler state yet"));
    } else if (scheduler.error) {
      console.log(warn("Scheduler state corrupt"));
    } else {
      console.log(ok(`${scheduler.jobCount} jobs configured`));
      console.log(label("Messages delivered", String(scheduler.messagesDelivered)));
      console.log(label("Last run", scheduler.lastRun || "never"));
    }
  }

  // Summary
  if (!jsonMode) {
    const issues = [
      !node.ok, !server.up, lock.stale,
      ...data.filter(d => !d.exists || !d.valid).map(() => true),
    ].filter(Boolean).length;
    console.log("");
    if (issues === 0) {
      console.log(theme.success("  All checks passed.\n"));
    } else {
      console.log(theme.warn(`  ${issues} issue(s) found.${fixMode ? "" : " Run backbone doctor --fix to repair."}\n`));
    }
  }

  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
  }
}
