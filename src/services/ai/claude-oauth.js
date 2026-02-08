/**
 * Claude OAuth Service
 * Implements OAuth 2.0 with PKCE for Claude Pro/Max authentication
 * Falls back to API key if OAuth tokens are blocked
 */

import { createServer } from "http";
import { URL } from "url";
import crypto from "crypto";
import { openUrl } from "../open-url.js";
import fs from "fs";
import path from "path";

import { getDataDir } from "../paths.js";
// OAuth Configuration (same as Claude Code CLI)
const OAUTH_CONFIG = {
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  authorizeUrl: "https://claude.ai/oauth/authorize",
  tokenUrl: "https://console.anthropic.com/v1/oauth/token",
  profileUrl: "https://api.anthropic.com/api/oauth/profile",
  apiKeyUrl: "https://api.anthropic.com/v1/organizations/api_keys",
  scopes: ["org:create_api_key", "user:profile", "user:inference"],
  redirectPort: 35593,
  redirectUri: "http://localhost:35593/callback",
};

// Storage paths
const DATA_DIR = getDataDir();
const OAUTH_PATH = path.join(DATA_DIR, "claude-oauth.json");

/**
 * Generate PKCE code verifier and challenge
 */
const generatePKCE = () => {
  // Generate random 32-byte code verifier
  const verifier = crypto.randomBytes(32)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 43);

  // Generate SHA-256 challenge from verifier
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

  return { verifier, challenge };
};

/**
 * Generate random state for CSRF protection
 */
const generateState = () => {
  return crypto.randomBytes(16).toString("hex");
};

/**
 * Save OAuth tokens to disk
 */
const saveTokens = (tokens) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(OAUTH_PATH, JSON.stringify(tokens, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save OAuth tokens:", error.message);
    return false;
  }
};

/**
 * Load OAuth tokens from disk
 */
const loadTokens = () => {
  try {
    if (fs.existsSync(OAUTH_PATH)) {
      return JSON.parse(fs.readFileSync(OAUTH_PATH, "utf-8"));
    }
  } catch (error) {
    console.error("Failed to load OAuth tokens:", error.message);
  }
  return null;
};

/**
 * Clear OAuth tokens
 */
const clearTokens = () => {
  try {
    if (fs.existsSync(OAUTH_PATH)) {
      fs.unlinkSync(OAUTH_PATH);
    }
  } catch (error) {
    // Ignore
  }
};

/**
 * Start local HTTP server to receive OAuth callback
 */
const startCallbackServer = (expectedState, codeVerifier, timeout = 300000) => {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${OAUTH_CONFIG.redirectPort}`);

      if (url.pathname === "/callback") {
        // Parse the response - Anthropic uses code#state format sometimes
        let code = url.searchParams.get("code");
        let state = url.searchParams.get("state");

        // Handle code#state format in hash
        if (!code && url.hash) {
          const hashParams = new URLSearchParams(url.hash.substring(1));
          code = hashParams.get("code");
          state = hashParams.get("state");
        }

        // Also check if code contains #state
        if (code && code.includes("#")) {
          const parts = code.split("#");
          code = parts[0];
          state = state || parts[1];
        }

        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #ef4444;">Authentication Failed</h1>
                <p>${errorDescription || error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(errorDescription || error));
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #ef4444;">Missing Authorization Code</h1>
                <p>No authorization code received.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error("No authorization code received"));
          return;
        }

        // Validate state for CSRF protection
        if (state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #ef4444;">Invalid State</h1>
                <p>State mismatch - possible CSRF attack.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error("State mismatch"));
          return;
        }

        // Success response
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center; background: #0f172a; color: #e2e8f0;">
              <h1 style="color: #22c55e;">✓ Authentication Successful</h1>
              <p>You can close this window and return to BACKBONE.</p>
              <script>setTimeout(() => window.close(), 2000);</script>
            </body>
          </html>
        `);

        server.close();
        resolve({ code, codeVerifier });
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(OAUTH_CONFIG.redirectPort, "localhost", () => {
      // Server started
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${OAUTH_CONFIG.redirectPort} is already in use`));
      } else {
        reject(err);
      }
    });

    // Timeout
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timeout - no response received"));
    }, timeout);
  });
};

/**
 * Exchange authorization code for tokens
 */
const exchangeCodeForTokens = async (code, codeVerifier) => {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: OAUTH_CONFIG.clientId,
    code,
    redirect_uri: OAUTH_CONFIG.redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }

  const tokens = await response.json();
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    tokenType: tokens.token_type || "Bearer",
  };
};

/**
 * Refresh access token using refresh token
 */
const refreshAccessToken = async (refreshToken) => {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: OAUTH_CONFIG.clientId,
    refresh_token: refreshToken,
  });

  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const tokens = await response.json();
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || refreshToken,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    tokenType: tokens.token_type || "Bearer",
  };
};

/**
 * Get user profile using OAuth token
 */
const getUserProfile = async (accessToken) => {
  const response = await fetch(OAUTH_CONFIG.profileUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Profile fetch failed: ${response.status} - ${errorText}`);
  }

  return response.json();
};

/**
 * Test if OAuth token works for API calls
 */
const testOAuthToken = async (accessToken) => {
  try {
    // Try a simple API call to see if the token works
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    if (response.ok) {
      return { success: true };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.error?.message || `HTTP ${response.status}`,
      blocked: errorData.error?.message?.includes("only authorized for use with Claude Code"),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Create API key using OAuth token
 */
const createApiKey = async (accessToken, name = "BACKBONE App") => {
  try {
    const response = await fetch(OAUTH_CONFIG.apiKeyUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `${name} - ${new Date().toISOString().split("T")[0]}`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API key creation failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      apiKey: data.api_key || data.key || data.secret,
      keyId: data.id,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Main OAuth flow
 * Returns: { success, accessToken?, apiKey?, user?, error? }
 */
export const startOAuthFlow = async (onStatus = () => {}) => {
  try {
    onStatus("Generating PKCE challenge...");

    // Generate PKCE and state
    const { verifier, challenge } = generatePKCE();
    const state = generateState();

    // Build authorization URL
    const authUrl = new URL(OAUTH_CONFIG.authorizeUrl);
    authUrl.searchParams.set("client_id", OAUTH_CONFIG.clientId);
    authUrl.searchParams.set("redirect_uri", OAUTH_CONFIG.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", OAUTH_CONFIG.scopes.join(" "));
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    onStatus("Starting callback server...");

    // Start callback server
    const callbackPromise = startCallbackServer(state, verifier);

    onStatus("Opening browser for Claude login...");

    // Open browser
    await openUrl(authUrl.toString());

    onStatus("Waiting for authentication...");

    // Wait for callback
    const { code, codeVerifier } = await callbackPromise;

    onStatus("Exchanging code for tokens...");

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, codeVerifier);

    onStatus("Testing OAuth token...");

    // Test if OAuth token works directly
    const testResult = await testOAuthToken(tokens.accessToken);

    if (testResult.success) {
      // OAuth token works! Save and return
      onStatus("OAuth token works! Getting user profile...");

      let user = null;
      try {
        user = await getUserProfile(tokens.accessToken);
      } catch (e) {
        // Profile fetch is optional
      }

      saveTokens({ ...tokens, user });

      return {
        success: true,
        method: "oauth",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user,
      };
    }

    // OAuth token blocked - try to create API key
    if (testResult.blocked) {
      onStatus("OAuth token blocked for API use. Trying to create API key...");

      const apiKeyResult = await createApiKey(tokens.accessToken);

      if (apiKeyResult.success) {
        onStatus("API key created successfully!");

        // Save the API key
        saveTokens({
          ...tokens,
          apiKey: apiKeyResult.apiKey,
          method: "api_key_via_oauth",
        });

        return {
          success: true,
          method: "api_key_via_oauth",
          apiKey: apiKeyResult.apiKey,
          accessToken: tokens.accessToken,
        };
      }

      return {
        success: false,
        error: `OAuth token blocked and API key creation failed: ${apiKeyResult.error}`,
        needsApiKey: true,
      };
    }

    return {
      success: false,
      error: testResult.error,
      needsApiKey: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      needsApiKey: true,
    };
  }
};

/**
 * Check if we have valid OAuth credentials
 */
export const hasValidCredentials = () => {
  const tokens = loadTokens();
  if (!tokens) return false;

  // Check if we have an API key
  if (tokens.apiKey) return true;

  // Check if access token is still valid
  if (tokens.accessToken && tokens.expiresAt > Date.now()) {
    return true;
  }

  // Check if we have a refresh token
  if (tokens.refreshToken) return true;

  return false;
};

/**
 * Get current credentials (refreshing if needed)
 */
export const getCredentials = async () => {
  const tokens = loadTokens();
  if (!tokens) return null;

  // If we have an API key, return it
  if (tokens.apiKey) {
    return { type: "api_key", apiKey: tokens.apiKey };
  }

  // Check if access token is still valid
  if (tokens.accessToken && tokens.expiresAt > Date.now() + 60000) {
    return { type: "oauth", accessToken: tokens.accessToken };
  }

  // Try to refresh
  if (tokens.refreshToken) {
    try {
      const newTokens = await refreshAccessToken(tokens.refreshToken);
      saveTokens({ ...tokens, ...newTokens });
      return { type: "oauth", accessToken: newTokens.accessToken };
    } catch (error) {
      // Refresh failed - clear tokens
      clearTokens();
      return null;
    }
  }

  return null;
};

/**
 * Logout - clear all OAuth data
 */
export const logout = () => {
  clearTokens();
};

export default {
  startOAuthFlow,
  hasValidCredentials,
  getCredentials,
  logout,
  OAUTH_CONFIG,
};
