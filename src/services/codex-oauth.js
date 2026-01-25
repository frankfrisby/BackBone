/**
 * OpenAI Codex OAuth Service
 * Implements browser-based login for Codex authentication
 * Similar to Claude OAuth - opens browser, receives token
 */

import { createServer } from "http";
import { URL } from "url";
import crypto from "crypto";
import { openUrl } from "./open-url.js";
import fs from "fs";
import path from "path";
import os from "os";

// Codex stores auth in ~/.codex/auth.json
const CODEX_AUTH_DIR = path.join(os.homedir(), ".codex");
const CODEX_AUTH_PATH = path.join(CODEX_AUTH_DIR, "auth.json");

// Also store in our data dir for tracking
const DATA_DIR = path.join(process.cwd(), "data");
const LOCAL_AUTH_PATH = path.join(DATA_DIR, "codex-oauth.json");

/**
 * Check if Codex CLI auth file exists and has valid tokens
 */
const hasCodexCliAuth = () => {
  try {
    if (fs.existsSync(CODEX_AUTH_PATH)) {
      const data = JSON.parse(fs.readFileSync(CODEX_AUTH_PATH, "utf-8"));
      // Codex stores tokens in a nested "tokens" object
      const tokens = data.tokens || data;
      return !!(tokens.access_token || tokens.accessToken);
    }
  } catch (error) {
    // Ignore
  }
  return false;
};

/**
 * Load Codex auth from CLI or local storage
 */
const loadCodexAuth = () => {
  // First try Codex CLI auth
  try {
    if (fs.existsSync(CODEX_AUTH_PATH)) {
      const data = JSON.parse(fs.readFileSync(CODEX_AUTH_PATH, "utf-8"));
      // Codex stores tokens in a nested "tokens" object
      const tokens = data.tokens || data;
      if (tokens.access_token || tokens.accessToken) {
        return {
          accessToken: tokens.access_token || tokens.accessToken,
          refreshToken: tokens.refresh_token || tokens.refreshToken,
          idToken: tokens.id_token || tokens.idToken,
          accountId: tokens.account_id || data.account_id,
          lastRefresh: data.last_refresh,
          source: "codex-cli"
        };
      }
    }
  } catch (error) {
    // Continue to check local
  }

  // Try local auth
  try {
    if (fs.existsSync(LOCAL_AUTH_PATH)) {
      const data = JSON.parse(fs.readFileSync(LOCAL_AUTH_PATH, "utf-8"));
      return { ...data, source: "local" };
    }
  } catch (error) {
    // Ignore
  }

  return null;
};

/**
 * Save Codex auth locally
 */
const saveCodexAuth = (auth) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_AUTH_PATH, JSON.stringify(auth, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save Codex auth:", error.message);
    return false;
  }
};

/**
 * Check if we have valid Codex credentials
 */
export const hasValidCredentials = () => {
  const auth = loadCodexAuth();
  if (!auth) return false;

  // Check if we have a valid token
  if (auth.accessToken) {
    // If there's an expiry, check it
    if (auth.expiresAt && Date.now() > auth.expiresAt) {
      return !!auth.refreshToken; // Can refresh
    }
    return true;
  }

  return false;
};

/**
 * Get Codex credentials
 */
export const getCredentials = async () => {
  const auth = loadCodexAuth();
  if (!auth) return null;

  return {
    type: "bearer",
    accessToken: auth.accessToken,
    source: auth.source
  };
};

/**
 * Start Codex OAuth flow
 * Opens browser to OpenAI login page
 */
export const startOAuthFlow = async (onStatus = () => {}) => {
  try {
    onStatus("Checking for existing Codex CLI auth...");

    // First check if Codex CLI already has auth
    if (hasCodexCliAuth()) {
      const auth = loadCodexAuth();
      if (auth) {
        onStatus("Found existing Codex CLI credentials!");
        saveCodexAuth(auth);
        return {
          success: true,
          method: "codex-cli",
          accessToken: auth.accessToken,
        };
      }
    }

    onStatus("Opening OpenAI login page...");

    // Open the Codex login URL
    // This is the standard OpenAI login that Codex uses
    const loginUrl = "https://platform.openai.com/login?next=/codex";
    await openUrl(loginUrl);

    onStatus("Please log in to OpenAI in your browser...");
    onStatus("After logging in, run 'codex' CLI to complete auth.");

    // We can't directly capture the OAuth callback since Codex uses its own flow
    // The user needs to complete the login in the browser
    // Then either:
    // 1. The Codex CLI will store the token in ~/.codex/auth.json
    // 2. Or they need to manually run `codex` to complete the flow

    // Wait and check for auth file to appear
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        attempts++;

        if (hasCodexCliAuth()) {
          clearInterval(checkInterval);
          const auth = loadCodexAuth();
          saveCodexAuth(auth);
          onStatus("Codex authentication successful!");
          resolve({
            success: true,
            method: "codex-cli",
            accessToken: auth.accessToken,
          });
          return;
        }

        if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          onStatus("Timeout waiting for Codex auth.");
          resolve({
            success: false,
            error: "Timeout - please run 'codex' CLI to complete authentication",
            needsManualAuth: true,
          });
        }

        if (attempts % 10 === 0) {
          onStatus(`Waiting for authentication... (${attempts}s)`);
        }
      }, 1000);
    });
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Logout - clear Codex auth
 */
export const logout = () => {
  try {
    if (fs.existsSync(LOCAL_AUTH_PATH)) {
      fs.unlinkSync(LOCAL_AUTH_PATH);
    }
  } catch (error) {
    // Ignore
  }
};

export default {
  startOAuthFlow,
  hasValidCredentials,
  getCredentials,
  logout,
};
