/**
 * Firebase Authentication Service
 * Uses Firebase SDK for Google OAuth sign-in
 */

import fs from "fs";
import path from "path";
import http from "http";
import { URL } from "url";
import { openUrl } from "./open-url.js";

const DATA_DIR = path.join(process.cwd(), "data");
const FIREBASE_USER_PATH = path.join(DATA_DIR, "firebase-user.json");
const FIREBASE_CONFIG_PATH = path.join(DATA_DIR, "firebase-config.json");

const REDIRECT_PORT = 3847;

// Default Firebase configuration for BACKBONE
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBKLqcnFQwNSKqHXgTBLok3l74ZmNh6_y0",
  authDomain: "backboneai.firebaseapp.com",
  projectId: "backboneai",
  storageBucket: "backboneai.firebasestorage.app",
  messagingSenderId: "982482448797",
  appId: "1:982482448797:web:6dce8bd5ec86c341a4bf74",
  measurementId: "G-2Y3075VXX2"
};

/**
 * Ensure data directory exists
 */
const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Load Firebase config from file, environment, or use defaults
 */
export const loadFirebaseConfig = () => {
  // Try environment variables first (allows override)
  if (process.env.FIREBASE_API_KEY && process.env.FIREBASE_AUTH_DOMAIN) {
    return {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_AUTH_DOMAIN?.split('.')[0],
    };
  }

  // Try config file (allows override)
  try {
    if (fs.existsSync(FIREBASE_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, "utf-8"));
    }
  } catch (error) {
    // Ignore
  }

  // Use default BACKBONE Firebase config
  return DEFAULT_FIREBASE_CONFIG;
};

/**
 * Save Firebase config
 */
export const saveFirebaseConfig = (config) => {
  ensureDataDir();
  fs.writeFileSync(FIREBASE_CONFIG_PATH, JSON.stringify(config, null, 2));
};

/**
 * Generate the HTML page for Firebase sign-in
 */
const generateSignInPage = (firebaseConfig) => {
  const configJson = JSON.stringify(firebaseConfig);

  return `<!DOCTYPE html>
<html>
<head>
  <title>BACKBONE - Sign In</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f8f9fa;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #202124;
    }
    .container {
      text-align: center;
      padding: 36px 40px 32px;
      background: #fff;
      border: 1px solid #dadce0;
      border-radius: 12px;
      width: 360px;
      box-shadow: 0 2px 6px rgba(60, 64, 67, 0.15);
    }
    .brand {
      font-size: 22px;
      font-weight: 500;
      letter-spacing: 0.2px;
      margin-bottom: 6px;
    }
    .brand span:nth-child(1) { color: #4285f4; }
    .brand span:nth-child(2) { color: #ea4335; }
    .brand span:nth-child(3) { color: #fbbc05; }
    .brand span:nth-child(4) { color: #4285f4; }
    .brand span:nth-child(5) { color: #34a853; }
    .brand span:nth-child(6) { color: #ea4335; }
    .subtitle {
      color: #5f6368;
      font-size: 14px;
      margin-bottom: 18px;
    }
    .loading {
      font-size: 14px;
      color: #5f6368;
      margin-top: 8px;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e8eaed;
      border-top: 3px solid #1a73e8;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 16px auto 8px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .status { margin-top: 12px; font-size: 13px; }
    .status.success { color: #1e8e3e; }
    .status.error { color: #d93025; }
    .retry-btn {
      margin-top: 14px;
      padding: 10px 20px;
      background: #1a73e8;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    }
    .retry-btn:hover { background: #1557b0; }
    .primary-btn {
      margin-top: 14px;
      padding: 10px 16px;
      background: #fff;
      color: #3c4043;
      border: 1px solid #dadce0;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    .primary-btn:hover { background: #f8f9fa; }
    .g-icon {
      display: inline-flex;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: #4285f4;
      border: 1px solid #dadce0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand"><span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span></div>
    <div class="subtitle">Sign in to continue to BACKBONE</div>
    <div class="spinner" id="spinner" style="display:none;"></div>
    <p class="loading" id="loadingText">Use your Google account</p>
    <p class="status" id="status"></p>
    <button class="primary-btn" id="signInBtn" onclick="signIn()">
      <span class="g-icon">G</span>
      Continue with Google
    </button>
    <button class="retry-btn" id="retryBtn" style="display:none;" onclick="signIn()">Try Again</button>
  </div>

  <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js"></script>
  <script>
    const firebaseConfig = ${configJson};
    firebase.initializeApp(firebaseConfig);

    const statusEl = document.getElementById('status');
    const spinnerEl = document.getElementById('spinner');
    const loadingEl = document.getElementById('loadingText');
    const retryBtn = document.getElementById('retryBtn');
    const signInBtn = document.getElementById('signInBtn');

    async function handleUser(user) {
      if (!user) return;
      spinnerEl.style.display = 'none';
      loadingEl.textContent = 'Signed in as ' + (user.displayName || user.email);
      statusEl.textContent = 'Success! This tab will close automatically.';
      statusEl.className = 'status success';

      const userData = {
        id: user.uid,
        email: user.email,
        name: user.displayName,
        picture: user.photoURL,
        verified: user.emailVerified
      };

      await fetch('/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });

      setTimeout(() => window.close(), 1500);
    }

    async function checkRedirectResult() {
      try {
        const result = await firebase.auth().getRedirectResult();
        if (result && result.user) {
          await handleUser(result.user);
          return true;
        }
      } catch (error) {
        console.error('Redirect sign-in error:', error);
        spinnerEl.style.display = 'none';
        loadingEl.textContent = 'Sign-in failed';
        statusEl.textContent = error.message;
        statusEl.className = 'status error';
        retryBtn.style.display = 'inline-block';
      }
      return false;
    }

    async function signIn() {
      spinnerEl.style.display = 'block';
      loadingEl.textContent = 'Opening Google Sign-In...';
      statusEl.textContent = '';
      statusEl.className = 'status';
      retryBtn.style.display = 'none';
      signInBtn.style.display = 'none';

      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');

        const result = await firebase.auth().signInWithPopup(provider);
        await handleUser(result.user);

      } catch (error) {
        console.error('Sign-in error:', error);
        if (error && (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user')) {
          loadingEl.textContent = 'Popup blocked. Redirecting to Google Sign-In...';
          statusEl.textContent = '';
          await firebase.auth().signInWithRedirect(provider);
          return;
        }
        spinnerEl.style.display = 'none';
        loadingEl.textContent = 'Sign-in failed';
        statusEl.textContent = error.message;
        statusEl.className = 'status error';
        retryBtn.style.display = 'inline-block';
      }
    }

    // Auto-trigger sign-in when page loads
    window.onload = async () => {
      const handled = await checkRedirectResult();
      if (!handled) {
        spinnerEl.style.display = 'none';
        loadingEl.textContent = 'Sign in to continue';
        signInBtn.style.display = 'inline-block';
      }
    };
  </script>
</body>
</html>`;
};

/**
 * Generate setup instructions page when Firebase is not configured
 */
const generateSetupPage = () => {
  return `<!DOCTYPE html>
<html>
<head>
  <title>BACKBONE - Firebase Setup</title>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      padding: 48px 24px;
      color: #fff;
    }
    .container {
      max-width: 640px;
      margin: 0 auto;
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 48px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .logo { font-size: 48px; font-weight: bold; color: #f97316; margin-bottom: 16px; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #e2e8f0; }
    .subtitle { color: #94a3b8; margin-bottom: 32px; }
    .step {
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
      border-left: 3px solid #f97316;
    }
    .step-num {
      display: inline-block;
      width: 28px;
      height: 28px;
      background: #f97316;
      border-radius: 50%;
      text-align: center;
      line-height: 28px;
      font-weight: 600;
      margin-right: 12px;
    }
    .step h3 { display: inline; color: #e2e8f0; }
    .step p { color: #94a3b8; margin-top: 8px; margin-left: 40px; }
    .step a { color: #f97316; }
    code {
      background: rgba(0,0,0,0.3);
      padding: 2px 8px;
      border-radius: 4px;
      font-family: 'Consolas', monospace;
      color: #fbbf24;
    }
    .config-form {
      margin-top: 32px;
      padding: 24px;
      background: rgba(139,92,246,0.1);
      border-radius: 8px;
      border: 1px solid rgba(139,92,246,0.3);
    }
    .config-form h3 { color: #e2e8f0; margin-bottom: 16px; }
    .config-form input {
      width: 100%;
      padding: 12px;
      margin-bottom: 12px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(0,0,0,0.2);
      color: #fff;
      font-family: 'Consolas', monospace;
    }
    .config-form input::placeholder { color: #64748b; }
    .config-form button {
      width: 100%;
      padding: 14px;
      border-radius: 8px;
      border: none;
      background: #f97316;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }
    .config-form button:hover { background: #7c3aed; }
    .status { margin-top: 16px; padding: 12px; border-radius: 6px; }
    .status.success { background: rgba(34,197,94,0.1); color: #22c55e; }
    .status.error { background: rgba(239,68,68,0.1); color: #ef4444; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">B</div>
    <h1>Firebase Setup Required</h1>
    <p class="subtitle">Follow these steps to enable Google Sign-In</p>

    <div class="step">
      <span class="step-num">1</span>
      <h3>Create Firebase Project</h3>
      <p>Go to <a href="https://console.firebase.google.com" target="_blank">console.firebase.google.com</a> and create a new project (or use existing)</p>
    </div>

    <div class="step">
      <span class="step-num">2</span>
      <h3>Enable Google Sign-In</h3>
      <p>Go to <strong>Authentication</strong> → <strong>Sign-in method</strong> → Enable <strong>Google</strong></p>
    </div>

    <div class="step">
      <span class="step-num">3</span>
      <h3>Get Your Config</h3>
      <p>Go to <strong>Project Settings</strong> (gear icon) → <strong>General</strong> → <strong>Your apps</strong> → Add <strong>Web app</strong> → Copy the config values</p>
    </div>

    <div class="config-form">
      <h3>Enter Your Firebase Config</h3>
      <input type="text" id="apiKey" placeholder="apiKey (e.g., AIzaSy...)" />
      <input type="text" id="authDomain" placeholder="authDomain (e.g., your-app.firebaseapp.com)" />
      <input type="text" id="projectId" placeholder="projectId (e.g., your-app)" />
      <button onclick="saveConfig()">Save & Continue</button>
      <div id="status" class="status" style="display: none;"></div>
    </div>
  </div>

  <script>
    async function saveConfig() {
      const apiKey = document.getElementById('apiKey').value.trim();
      const authDomain = document.getElementById('authDomain').value.trim();
      const projectId = document.getElementById('projectId').value.trim();
      const statusEl = document.getElementById('status');

      if (!apiKey || !authDomain) {
        statusEl.textContent = 'Please enter apiKey and authDomain';
        statusEl.className = 'status error';
        statusEl.style.display = 'block';
        return;
      }

      try {
        const res = await fetch('/save-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey, authDomain, projectId: projectId || authDomain.split('.')[0] })
        });

        if (res.ok) {
          statusEl.textContent = 'Config saved! Redirecting to sign-in...';
          statusEl.className = 'status success';
          statusEl.style.display = 'block';
          setTimeout(() => window.location.reload(), 1500);
        } else {
          throw new Error('Failed to save');
        }
      } catch (err) {
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.className = 'status error';
        statusEl.style.display = 'block';
      }
    }
  </script>
</body>
</html>`;
};

/**
 * Sign in with Google using Firebase
 * Opens browser for sign-in flow
 */
export const signInWithGoogle = async () => {
  // Check if we have a valid saved session
  const existingUser = getCurrentFirebaseUser();
  if (existingUser && !existingUser.tokenExpired) {
    return { success: true, user: existingUser, cached: true };
  }

  return new Promise((resolve) => {
    let firebaseConfig = loadFirebaseConfig();

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);

      // Serve the sign-in page or setup page
      if (url.pathname === "/" || url.pathname === "/login") {
        res.writeHead(200, { "Content-Type": "text/html" });
        if (firebaseConfig) {
          res.end(generateSignInPage(firebaseConfig));
        } else {
          res.end(generateSetupPage());
        }
        return;
      }

      // Handle config save
      if (url.pathname === "/save-config" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
          try {
            const config = JSON.parse(body);
            saveFirebaseConfig(config);
            firebaseConfig = config;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Handle the auth callback with user data
      if (url.pathname === "/auth/callback" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
          try {
            const userData = JSON.parse(body);

            const user = {
              id: userData.id,
              email: userData.email,
              name: userData.name,
              picture: userData.picture,
              verified: userData.verified,
              signedInAt: new Date().toISOString()
            };

            // Save user
            saveFirebaseUser(user);

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));

            // Close server and resolve
            setTimeout(() => {
              server.close();
              resolve({ success: true, user });
            }, 500);
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // 404 for other paths
      res.writeHead(404);
      res.end("Not found");
    });

    server.listen(REDIRECT_PORT, () => {
      // Open browser to login page
      openUrl(`http://localhost:${REDIRECT_PORT}/login`);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      resolve({ success: false, error: "Sign-in timed out" });
    }, 5 * 60 * 1000);
  });
};

/**
 * Save Firebase user data to disk
 */
export const saveFirebaseUser = (userData) => {
  try {
    ensureDataDir();
    const toSave = {
      ...userData,
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(FIREBASE_USER_PATH, JSON.stringify(toSave, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save Firebase user:", error.message);
    return false;
  }
};

/**
 * Load Firebase user data from disk
 */
export const loadFirebaseUser = () => {
  try {
    ensureDataDir();
    if (fs.existsSync(FIREBASE_USER_PATH)) {
      return JSON.parse(fs.readFileSync(FIREBASE_USER_PATH, "utf-8"));
    }
  } catch (error) {
    console.error("Failed to load Firebase user:", error.message);
  }
  return null;
};

/**
 * Get current Firebase user
 */
export const getCurrentFirebaseUser = () => {
  return loadFirebaseUser();
};

/**
 * Sign out Firebase user
 */
export const signOutFirebase = () => {
  try {
    if (fs.existsSync(FIREBASE_USER_PATH)) {
      fs.unlinkSync(FIREBASE_USER_PATH);
    }
    return true;
  } catch (error) {
    console.error("Failed to sign out:", error.message);
    return false;
  }
};

/**
 * Check if user is signed in
 */
export const isSignedIn = () => {
  const user = getCurrentFirebaseUser();
  return !!user;
};

export default {
  signInWithGoogle,
  saveFirebaseUser,
  loadFirebaseUser,
  getCurrentFirebaseUser,
  signOutFirebase,
  isSignedIn,
  loadFirebaseConfig,
  saveFirebaseConfig
};
