/**
 * BACKBONE — Encrypted Credential Vault
 *
 * AES-256-GCM encrypted credential store. Pure Node.js, no native deps.
 *
 * Master key: PBKDF2(machineId + auto-generated PIN)
 * Each credential: unique IV + auth tag
 * Storage: ~/.backbone/users/<uid>/data/.vault.enc
 *
 * Usage:
 *   const vault = await getCredentialVault();
 *   await vault.setCredential("ALPACA_KEY", value);
 *   const key = await vault.getCredential("ALPACA_KEY");
 *   await vault.hasCredential("ALPACA_KEY");  // boolean only
 *   vault.listKeys();  // key names only
 *   vault.exportMasked();  // { key, configured, preview: "****" }
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import { getDataDir } from "./paths.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32;

// ── Machine ID (deterministic per machine) ──────────────────

function getMachineId() {
  // Use MAC address + hostname + OS as machine fingerprint
  const nets = os.networkInterfaces();
  let mac = "";
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
        mac = iface.mac;
        break;
      }
    }
    if (mac) break;
  }
  const raw = `${mac}:${os.hostname()}:${os.platform()}:${os.arch()}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ── Vault Class ─────────────────────────────────────────────

class CredentialVault {
  constructor(vaultPath, pinPath) {
    this._vaultPath = vaultPath;
    this._pinPath = pinPath;
    this._credentials = {};  // decrypted cache
    this._masterKey = null;
    this._salt = null;
    this._initialized = false;
  }

  /** Initialize: derive master key and load vault */
  async init() {
    if (this._initialized) return this;

    const dir = path.dirname(this._vaultPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Get or create PIN
    const pin = this._loadOrCreatePin();
    const machineId = getMachineId();
    const passphrase = `${machineId}:${pin}`;

    // Load or create salt
    if (fs.existsSync(this._vaultPath)) {
      const raw = fs.readFileSync(this._vaultPath);
      this._salt = raw.subarray(0, SALT_LENGTH);
    } else {
      this._salt = crypto.randomBytes(SALT_LENGTH);
    }

    // Derive master key
    this._masterKey = crypto.pbkdf2Sync(
      passphrase, this._salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha512"
    );

    // Load existing vault
    if (fs.existsSync(this._vaultPath)) {
      this._loadVault();
    }

    this._initialized = true;
    return this;
  }

  /** Store a credential (encrypts and persists) */
  async setCredential(key, value) {
    this._ensureInit();
    this._credentials[key] = value;
    this._saveVault();
    // Also set in process.env for immediate use by legacy code
    process.env[key] = value;
  }

  /** Retrieve a credential (decrypted). Falls back to env/config. */
  async getCredential(key) {
    this._ensureInit();
    // 1. Vault
    if (this._credentials[key] !== undefined) {
      return this._credentials[key];
    }
    // 2. process.env (legacy fallback)
    if (process.env[key]) {
      return process.env[key];
    }
    // 3. JSON config file fallback for known keys
    const configValue = this._legacyConfigLookup(key);
    if (configValue) return configValue;
    return null;
  }

  /** Check if a credential exists (safe for AI — boolean only) */
  async hasCredential(key) {
    this._ensureInit();
    if (this._credentials[key] !== undefined) return true;
    if (process.env[key]) return true;
    if (this._legacyConfigLookup(key)) return true;
    return false;
  }

  /** List all stored key names (no values) */
  listKeys() {
    this._ensureInit();
    return Object.keys(this._credentials);
  }

  /** Export masked view (safe for AI display) */
  exportMasked() {
    this._ensureInit();
    const result = {};
    for (const key of Object.keys(this._credentials)) {
      const val = this._credentials[key];
      result[key] = {
        configured: true,
        preview: val ? `••••${val.slice(-4)}` : "****"
      };
    }
    return result;
  }

  /** Remove a credential */
  async removeCredential(key) {
    this._ensureInit();
    delete this._credentials[key];
    this._saveVault();
  }

  // ── Private helpers ───────────────────────────────────────

  _ensureInit() {
    if (!this._initialized) throw new Error("Vault not initialized. Call init() first.");
  }

  _loadOrCreatePin() {
    try {
      if (fs.existsSync(this._pinPath)) {
        // PIN file is encrypted with machine-specific key
        const raw = fs.readFileSync(this._pinPath);
        const machineKey = crypto.createHash("sha256").update(getMachineId()).digest();
        const iv = raw.subarray(0, IV_LENGTH);
        const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
        const enc = raw.subarray(IV_LENGTH + TAG_LENGTH);
        const decipher = crypto.createDecipheriv(ALGORITHM, machineKey, iv);
        decipher.setAuthTag(tag);
        const pin = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf-8");
        return pin;
      }
    } catch {
      // Corrupted pin file — regenerate
    }

    // Generate new PIN
    const pin = crypto.randomBytes(32).toString("hex");

    // Encrypt with machine-specific key
    const machineKey = crypto.createHash("sha256").update(getMachineId()).digest();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, machineKey, iv);
    const enc = Buffer.concat([cipher.update(pin, "utf-8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    const dir = path.dirname(this._pinPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this._pinPath, Buffer.concat([iv, tag, enc]));

    return pin;
  }

  _encrypt(plaintext) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this._masterKey, iv);
    const enc = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
  }

  _decrypt(buffer) {
    const iv = buffer.subarray(0, IV_LENGTH);
    const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const enc = buffer.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, this._masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf-8");
  }

  _loadVault() {
    try {
      const raw = fs.readFileSync(this._vaultPath);
      // Format: [salt 32B][encrypted JSON payload]
      const payload = raw.subarray(SALT_LENGTH);
      const json = this._decrypt(payload);
      this._credentials = JSON.parse(json);
    } catch (err) {
      console.warn("[Vault] Failed to load vault, starting fresh:", err.message);
      this._credentials = {};
    }
  }

  _saveVault() {
    const json = JSON.stringify(this._credentials);
    const encrypted = this._encrypt(json);
    // Format: [salt 32B][encrypted payload]
    const output = Buffer.concat([this._salt, encrypted]);
    fs.writeFileSync(this._vaultPath, output);
  }

  _legacyConfigLookup(key) {
    try {
      const dataDir = getDataDir();
      // Alpaca keys
      if (key === "ALPACA_KEY" || key === "ALPACA_SECRET") {
        const p = path.join(dataDir, "alpaca-config.json");
        if (fs.existsSync(p)) {
          const cfg = JSON.parse(fs.readFileSync(p, "utf-8"));
          if (key === "ALPACA_KEY") return cfg.apiKey || null;
          if (key === "ALPACA_SECRET") return cfg.apiSecret || null;
        }
      }
      // Oura token
      if (key === "OURA_ACCESS_TOKEN") {
        const p = path.join(dataDir, "oura-token.json");
        if (fs.existsSync(p)) {
          const cfg = JSON.parse(fs.readFileSync(p, "utf-8"));
          return cfg.token || cfg.accessToken || cfg.access_token || null;
        }
      }
      // Empower creds from .env
      if (key === "EMPOWER_EMAIL" || key === "EMPOWER_PASSWORD") {
        const envPath = path.join(path.dirname(dataDir), "..", ".env");
        if (fs.existsSync(envPath)) {
          const lines = fs.readFileSync(envPath, "utf-8").split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const eqIdx = trimmed.indexOf("=");
            if (eqIdx > 0 && trimmed.slice(0, eqIdx).trim() === key) {
              return trimmed.slice(eqIdx + 1).trim() || null;
            }
          }
        }
      }
    } catch { /* ignore */ }
    return null;
  }
}

// ── Singleton ───────────────────────────────────────────────

let _vaultInstance = null;

/**
 * Get the credential vault (singleton, lazy-initialized).
 * @returns {Promise<CredentialVault>}
 */
export async function getCredentialVault() {
  if (_vaultInstance) return _vaultInstance;

  const dataDir = getDataDir();
  const vaultPath = path.join(dataDir, ".vault.enc");
  const pinPath = path.join(dataDir, ".vault-pin");

  _vaultInstance = new CredentialVault(vaultPath, pinPath);
  await _vaultInstance.init();
  return _vaultInstance;
}

/**
 * Quick helper: get a credential with vault + env fallback.
 * Safe for use anywhere — initializes vault on first call.
 */
export async function getCredential(key) {
  const vault = await getCredentialVault();
  return vault.getCredential(key);
}

/**
 * Quick helper: check if a credential exists.
 */
export async function hasCredential(key) {
  const vault = await getCredentialVault();
  return vault.hasCredential(key);
}

export default { getCredentialVault, getCredential, hasCredential };
