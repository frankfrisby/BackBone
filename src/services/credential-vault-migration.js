/**
 * BACKBONE — Credential Vault Migration
 *
 * Detects legacy credentials in .env, alpaca-config.json, oura-token.json
 * and migrates them into the encrypted vault.
 *
 * Safe to run multiple times — skips already-migrated keys.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { getDataDir, getBackboneRoot } from "./paths.js";
import { getCredentialVault } from "./credential-vault.js";

/**
 * Run migration: detect legacy credentials and move to vault.
 * @returns {{ migrated: string[], skipped: string[], errors: string[] }}
 */
export async function migrateCredentialsToVault() {
  const vault = await getCredentialVault();
  const dataDir = getDataDir();
  const migrated = [];
  const skipped = [];
  const errors = [];

  // ── 1. Parse .env files ───────────────────────────────────
  const envPaths = [
    path.join(getBackboneRoot(), ".env"),
    path.join(os.homedir(), ".backbone", ".env"),
  ];

  const envKeys = [
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY",
    "ALPACA_KEY", "ALPACA_SECRET",
    "EMPOWER_EMAIL", "EMPOWER_PASSWORD",
    "OURA_ACCESS_TOKEN",
    "ELEVENLABS_API_KEY",
  ];

  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;
    try {
      const lines = fs.readFileSync(envPath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx <= 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!val || !envKeys.includes(key)) continue;

        if (vault.listKeys().includes(key)) {
          skipped.push(key);
        } else {
          try {
            await vault.setCredential(key, val);
            migrated.push(key);
          } catch (e) {
            errors.push(`${key}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      errors.push(`.env(${envPath}): ${e.message}`);
    }
  }

  // ── 2. Alpaca config ──────────────────────────────────────
  try {
    const alpacaPath = path.join(dataDir, "alpaca-config.json");
    if (fs.existsSync(alpacaPath)) {
      const cfg = JSON.parse(fs.readFileSync(alpacaPath, "utf-8"));
      const pairs = [
        ["ALPACA_KEY", cfg.apiKey],
        ["ALPACA_SECRET", cfg.apiSecret],
      ];
      for (const [key, val] of pairs) {
        if (!val || val.includes("PASTE")) continue;
        if (vault.listKeys().includes(key)) { skipped.push(key); continue; }
        await vault.setCredential(key, val);
        migrated.push(key);
      }
    }
  } catch (e) {
    errors.push(`alpaca-config: ${e.message}`);
  }

  // ── 3. Oura token ────────────────────────────────────────
  try {
    const ouraPath = path.join(dataDir, "oura-token.json");
    if (fs.existsSync(ouraPath)) {
      const cfg = JSON.parse(fs.readFileSync(ouraPath, "utf-8"));
      const token = cfg.token || cfg.accessToken || cfg.access_token;
      if (token && !vault.listKeys().includes("OURA_ACCESS_TOKEN")) {
        await vault.setCredential("OURA_ACCESS_TOKEN", token);
        migrated.push("OURA_ACCESS_TOKEN");
      } else if (token) {
        skipped.push("OURA_ACCESS_TOKEN");
      }
    }
  } catch (e) {
    errors.push(`oura-token: ${e.message}`);
  }

  // ── 4. Backup legacy files ────────────────────────────────
  if (migrated.length > 0) {
    const backupDir = path.join(dataDir, ".legacy-backup");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        const name = path.basename(envPath);
        const dest = path.join(backupDir, `${name}.${timestamp}.bak`);
        try { fs.copyFileSync(envPath, dest); } catch { /* ignore */ }
      }
    }

    // Log migration
    const logPath = path.join(backupDir, "migration-log.json");
    const log = { timestamp: new Date().toISOString(), migrated, skipped, errors };
    try {
      let existing = [];
      if (fs.existsSync(logPath)) existing = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      existing.push(log);
      fs.writeFileSync(logPath, JSON.stringify(existing, null, 2));
    } catch { /* ignore */ }
  }

  return { migrated, skipped, errors };
}

export default { migrateCredentialsToVault };
