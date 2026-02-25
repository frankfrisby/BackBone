/**
 * Onboarding Panel Component
 * Full-screen onboarding wizard with spinning B logo and step checklist
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { execSync } from "child_process";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { signInWithGoogle, signOutFirebase, getCurrentFirebaseUser, isSignedIn } from "../services/firebase/firebase-auth.js";
import {
  PROVIDERS,
  createApiKeyFile,
  openApiKeyInEditor,
  openProviderKeyPage,
  readApiKeyFile,
  watchApiKeyFile,
  validateApiKey,
  saveApiKeyToEnv,
  cleanupApiKeyFile,
  isProviderConfigured
} from "../services/setup/model-key-setup.js";
import {
  loadAlpacaConfig,
  openKeysFileInEditor as openAlpacaKeysFile,
  openAlpacaForKeys,
  testAlpacaConnection,
  saveKeysToEnv as saveAlpacaKeysToEnv,
  readKeysFile as readAlpacaKeysFile
} from "../services/setup/alpaca-setup.js";
import {
  isOuraConfigured,
  openOuraTokenPage,
  createOuraSetupFile,
  openOuraSetupInEditor,
  readOuraSetupFile,
  watchOuraSetupFile,
  cleanupOuraSetupFile,
  validateOuraToken,
  saveOuraToken,
  syncOuraData
} from "../services/health/oura-service.js";
import {
  isGoogleEmailConfigured,
  isMicrosoftConfigured,
  isEmailConfigured,
  getConfiguredProviders,
  startOAuthFlow,
  syncEmailCalendar
} from "../services/integrations/email-calendar-service.js";
import { getPersonalCapitalService } from "../services/integrations/personal-capital.js";
import {
  getPlaidService,
  isPlaidConfigured,
  hasPlaidCredentials,
  syncPlaidData
} from "../services/integrations/plaid-service.js";
import { loadUserSettings, updateSetting, updateSettings } from "../services/user-settings.js";
import { openUrl } from "../services/open-url.js";
import { requestPhoneCode, verifyPhoneCode, getPhoneRecord, getAnyVerifiedPhoneRecord, sendWhatsAppMessage, syncPhoneFromFirestore } from "../services/firebase/phone-auth.js";
import { fetchTwilioConfig } from "../services/firebase/firebase-config.js";
import { getTwilioWhatsApp } from "../services/messaging/twilio-whatsapp.js";
import { getMobileService } from "../services/mobile.js";
import { startOAuthFlow as startClaudeOAuth, hasValidCredentials as hasClaudeCredentials } from "../services/ai/claude-oauth.js";
import { startOAuthFlow as startCodexOAuth, hasValidCredentials as hasCodexCredentials } from "../services/ai/codex-oauth.js";
import {
  isClaudeCodeInstalled,
  isClaudeCodeInstalledAsync,
  isClaudeCodeLoggedIn,
  getClaudeCodeStatus,
  spawnClaudeCodeLogin,
  getInstallInstructions as getClaudeCodeInstallInstructions
} from "../services/ai/claude-code-cli.js";
import { startSetupWizard, stopSetupWizard, getSetupWizard } from "../services/setup/setup-wizard.js";
import { scrapeLinkedInProfile } from "../services/integrations/linkedin-scraper.js";
import { hasArchivedProfile, restoreProfile } from "../services/profile-manager.js";
import { getBrokerageStatuses, connectBrokerage } from "../services/brokerages/brokerage-auth.js";

const e = React.createElement;

const isModernTerminal = () => {
  if (process.platform === "win32") {
    if (process.env.WT_SESSION || process.env.WT_PROFILE_ID) return true; // Windows Terminal
    if (process.env.TERM_PROGRAM === "vscode") return true; // VS Code terminal
    if (process.env.TERM && process.env.TERM !== "dumb") return true; // xterm-256color on modern shells
    return false; // Legacy cmd.exe / conhost.exe
  }
  return process.env.TERM && process.env.TERM !== "dumb";
};

const BACKBONE_LOCAL_SERVER = process.env.BACKBONE_SERVER_URL || "http://localhost:3000";

const fetchServerWhatsAppStatus = async ({ autoPair = false, phone = null } = {}) => {
  const params = new URLSearchParams();
  if (autoPair) params.set("autoPair", "1");
  if (phone) params.set("phone", phone);
  const query = params.toString();
  const url = `${BACKBONE_LOCAL_SERVER}/api/whatsapp/status${query ? `?${query}` : ""}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Could not load WhatsApp status");
  return data;
};

const requestServerBaileysPairingCode = async (phoneNumber) => {
  const res = await fetch(`${BACKBONE_LOCAL_SERVER}/api/whatsapp/baileys/pairing-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Failed to generate pairing code.");
  return data;
};

// Spinning B logo frames (bone-style ASCII art)
const B_LOGO_FRAMES = [
  // Frame 0: Front view (full)
  [
    "  \u2588\u2588\u2588\u2588\u2588\u2588\u2557  ",
    "  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557 ",
    "  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D ",
    "  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557 ",
    "  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D ",
    "  \u255A\u2550\u2550\u2550\u2550\u2550\u255D  "
  ],
  // Frame 1: Slight turn right
  [
    "  \u2593\u2593\u2593\u2593\u2593\u2593\u2557  ",
    "  \u2593\u2593\u2554\u2550\u2550\u2593\u2593\u2557 ",
    "  \u2593\u2593\u2593\u2593\u2593\u2593\u2554\u255D ",
    "  \u2593\u2593\u2554\u2550\u2550\u2593\u2593\u2557 ",
    "  \u2593\u2593\u2593\u2593\u2593\u2593\u2554\u255D ",
    "  \u255A\u2550\u2550\u2550\u2550\u2550\u255D  "
  ],
  // Frame 2: Side view (thin)
  [
    "     \u2551\u2551    ",
    "     \u2551\u2551    ",
    "     \u2551\u2551    ",
    "     \u2551\u2551    ",
    "     \u2551\u2551    ",
    "     \u255A\u255D    "
  ],
  // Frame 3: Slight turn left (back coming)
  [
    "  \u2591\u2591\u2591\u2591\u2591\u2591\u2557  ",
    "  \u2591\u2591\u2554\u2550\u2550\u2591\u2591\u2557 ",
    "  \u2591\u2591\u2591\u2591\u2591\u2591\u2554\u255D ",
    "  \u2591\u2591\u2554\u2550\u2550\u2591\u2591\u2557 ",
    "  \u2591\u2591\u2591\u2591\u2591\u2591\u2554\u255D ",
    "  \u255A\u2550\u2550\u2550\u2550\u2550\u255D  "
  ],
  // Frame 4: Back view
  [
    "  \u2592\u2592\u2592\u2592\u2592\u2592\u2557  ",
    "  \u2592\u2592\u2554\u2550\u2550\u2592\u2592\u2557 ",
    "  \u2592\u2592\u2592\u2592\u2592\u2592\u2554\u255D ",
    "  \u2592\u2592\u2554\u2550\u2550\u2592\u2592\u2557 ",
    "  \u2592\u2592\u2592\u2592\u2592\u2592\u2554\u255D ",
    "  \u255A\u2550\u2550\u2550\u2550\u2550\u255D  "
  ],
  // Frame 5: Slight turn right (front coming)
  [
    "  \u2591\u2591\u2591\u2591\u2591\u2591\u2557  ",
    "  \u2591\u2591\u2554\u2550\u2550\u2591\u2591\u2557 ",
    "  \u2591\u2591\u2591\u2591\u2591\u2591\u2554\u255D ",
    "  \u2591\u2591\u2554\u2550\u2550\u2591\u2591\u2557 ",
    "  \u2591\u2591\u2591\u2591\u2591\u2591\u2554\u255D ",
    "  \u255A\u2550\u2550\u2550\u2550\u2550\u255D  "
  ],
  // Frame 6: Side view (thin) - opposite direction
  [
    "    \u2551\u2551     ",
    "    \u2551\u2551     ",
    "    \u2551\u2551     ",
    "    \u2551\u2551     ",
    "    \u2551\u2551     ",
    "    \u255A\u255D     "
  ],
  // Frame 7: Almost front again
  [
    "  \u2593\u2593\u2593\u2593\u2593\u2593\u2557  ",
    "  \u2593\u2593\u2554\u2550\u2550\u2593\u2593\u2557 ",
    "  \u2593\u2593\u2593\u2593\u2593\u2593\u2554\u255D ",
    "  \u2593\u2593\u2554\u2550\u2550\u2593\u2593\u2557 ",
    "  \u2593\u2593\u2593\u2593\u2593\u2593\u2554\u255D ",
    "  \u255A\u2550\u2550\u2550\u2550\u2550\u255D  "
  ]
];

// Onboarding steps configuration
const ONBOARDING_STEPS = [
  { id: "prerequisites", label: "Prerequisites", required: true, description: "Node.js & Claude/Codex CLI" },
  { id: "google", label: "Google Account", required: true, description: "Sign in with Google" },
  {
    id: "phone",
    label: "WhatsApp Verification",
    required: true,
    description: "Required for notifications and AI messaging"
  },
  {
    id: "communicationsWhatsapp",
    label: "Communications (WhatsApp)",
    required: false,
    description: "WhatsApp channel for messaging and notifications"
  },
  { id: "model", label: "AI Model", required: true, description: "Choose your AI assistant" },
  { id: "mobileApp", label: "Mobile App", required: false, description: "Install PWA for push notifications" },
  { id: "coreGoals", label: "Core Goals", required: true, description: "What matters to you (40+ words)" },
  { id: "linkedin", label: "LinkedIn Profile", required: false, description: "Connect your professional identity" },
  { id: "alpaca", label: "Trading (Alpaca)", required: false, description: "Auto-trading" },
  { id: "oura", label: "Health (Oura)", required: false, description: "Health tracking" },
  { id: "email", label: "Email & Calendar", required: false, description: "Email access" },
  { id: "brokerages", label: "Brokerages", required: false, description: "Connect Empower, Robinhood, or Fidelity (optional)" }
];

// Status colors
const STATUS_COLORS = {
  pending: "#64748b",    // Gray
  active: "#f97316",     // Orange
  complete: "#22c55e",   // Green
  error: "#ef4444"       // Red
};

const isStepRequired = (step, statuses = {}) => {
  if (!step || step.disabled) return false;
  if (step.id === "communicationsWhatsapp") {
    return statuses.phone === "complete";
  }
  return !!step.required;
};

// Brand color (orange)
const BRAND_COLOR = "#f97316";

// Model provider options
// Model options in priority order for fallback chain
// OpenAI Codex (Pro/Max) is the recommended option - uses the latest Codex model
const MODEL_OPTIONS = [
  { id: "openai-codex", label: "OpenAI Codex (Pro/Max)", description: "Login with OpenAI Pro/Max - Codex (latest)", oauth: true, priority: 0, recommended: true },
  { id: "claude-code", label: "Claude Code CLI", description: "CLI with Pro/Max subscription", cli: true, priority: 1 },
  { id: "claude-oauth", label: "Claude Pro/Max (Browser)", description: "OAuth login via browser", oauth: true, priority: 2 },
  { id: "openai", label: "OpenAI API Key", description: "OpenAI GPT (latest) via API key", priority: 3 },
  { id: "anthropic", label: "Claude API Key", description: "Anthropic API key", priority: 4 },
  { id: "google", label: "Gemini (Google)", description: "Google AI - Optional", priority: 5, optional: true }
];

// Check if a specific model is connected
const isModelConnected = (modelId) => {
  switch (modelId) {
    case "claude-code": {
      const status = isClaudeCodeInstalled();
      if (!status.installed) return false;
      const auth = isClaudeCodeLoggedIn();
      return auth.loggedIn;
    }
    case "claude-oauth":
      return hasClaudeCredentials();
    case "openai-codex":
      return hasCodexCredentials();
    case "openai":
      return isProviderConfigured("openai");
    case "anthropic":
      return isProviderConfigured("anthropic");
    case "google":
      return isProviderConfigured("google");
    default:
      return false;
  }
};

// Get connection label for display
const getConnectionLabel = (modelId) => {
  switch (modelId) {
    case "claude-code": {
      const status = isClaudeCodeInstalled();
      if (!status.installed) return "Not Installed";
      const auth = isClaudeCodeLoggedIn();
      return auth.loggedIn ? "CLI Logged In" : "Not Logged In";
    }
    case "claude-oauth":
      return hasClaudeCredentials() ? "Browser OAuth" : null;
    case "openai-codex":
      return hasCodexCredentials() ? "Codex Logged In" : null;
    case "openai":
      return isProviderConfigured("openai") ? "API Key" : null;
    case "anthropic":
      return isProviderConfigured("anthropic") ? "API Key" : null;
    case "google":
      return isProviderConfigured("google") ? "API Key" : null;
    default:
      return null;
  }
};

// Get all connected models in priority order
const getConnectedModels = () => {
  return MODEL_OPTIONS.filter(m => isModelConnected(m.id)).sort((a, b) => a.priority - b.priority);
};

/**
 * Spinning B Logo Component
 */
const SpinningBLogo = ({ color = "#f97316" }) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % B_LOGO_FRAMES.length);
    }, 150);
    return () => clearInterval(interval);
  }, []);

  return e(
    Box,
    { flexDirection: "column", alignItems: "center" },
    ...B_LOGO_FRAMES[frame].map((line, i) =>
      e(Text, { key: i, color }, line)
    )
  );
};

/**
 * Step Status Indicator
 */
const StepIndicator = ({ status, isActive }) => {
  if (status === "complete") {
    return e(Text, { color: STATUS_COLORS.complete }, "\u2713"); // Green check mark
  }
  if (status === "error") {
    return e(Text, { color: STATUS_COLORS.error }, "\u2717"); // Red X
  }
  if (status === "disabled") {
    return e(Text, { color: "#475569", dimColor: true }, "\u25CB"); // Grayed out circle
  }
  const color = isActive ? STATUS_COLORS.active : STATUS_COLORS.pending;
  return e(Text, { color }, "\u25CB"); // Empty circle for pending
};

/**
 * Onboarding Step Item
 * Highlights the currently selected step with appropriate colors:
 * - Selected + Complete: Light green background
 * - Selected + Pending: Orange highlight
 * - Not selected: Normal colors
 */
const StepItem = ({ step, status, isActive, isSelected, isRequired = step.required }) => {
  const isComplete = status === "complete";
  const isError = status === "error";
  const isDisabled = step.disabled;

  // Colors based on state
  // When selected (isActive): show highlight
  // When complete: green tones
  // When pending: orange/gray tones
  let labelColor, bgColor, indicatorPrefix;

  if (isDisabled) {
    labelColor = "#475569";
    bgColor = undefined;
    indicatorPrefix = "  ";
  } else if (isActive && isComplete) {
    // Selected AND complete: light green background
    labelColor = "#166534";  // Dark green text
    bgColor = "#86efac";     // Light green background
    indicatorPrefix = "> ";
  } else if (isActive) {
    // Selected but not complete: orange highlight
    labelColor = "#ffffff";  // White text
    bgColor = "#f97316";     // Orange background
    indicatorPrefix = "> ";
  } else if (isComplete) {
    // Complete but not selected: normal green
    labelColor = "#22c55e";
    bgColor = undefined;
    indicatorPrefix = "  ";
  } else if (isError) {
    labelColor = "#ef4444";
    bgColor = undefined;
    indicatorPrefix = "  ";
  } else {
    // Pending, not selected
    labelColor = "#94a3b8";
    bgColor = undefined;
    indicatorPrefix = "  ";
  }

  const descColor = "#64748b";

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    // Selection indicator arrow
    e(Text, { color: isActive ? (isComplete ? "#166534" : "#f97316") : "#1e293b" }, indicatorPrefix),
    e(StepIndicator, { status: isDisabled ? "disabled" : status, isActive: isActive && !isDisabled }),
    e(
      Box,
      { flexDirection: "column" },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        // Main label with background highlight when selected
        bgColor
          ? e(Text, { color: labelColor, backgroundColor: bgColor, bold: true }, ` ${step.label} `)
          : e(Text, { color: labelColor, bold: (isActive || isComplete) && !isDisabled, dimColor: isDisabled }, step.label),
        isDisabled && e(Text, { color: "#475569", dimColor: true }, "(Coming Soon)"),
        !isRequired && !isComplete && !isDisabled && !isActive && e(Text, { color: "#475569", dimColor: true }, "(Optional)"),
        isComplete && !isDisabled && !isActive && e(Text, { color: "#22c55e", dimColor: true }, "OK")
      ),
      // Show description when selected
      isActive && !isDisabled && e(Text, { color: isComplete ? "#166534" : descColor }, step.description),
      isDisabled && isActive && e(Text, { color: "#475569", dimColor: true }, step.description)
    )
  );
};

/**
 * Prerequisites Step Component
 * Checks Node.js and Claude/Codex CLI installation
 */
const PrerequisitesStep = ({ onComplete, onError }) => {
  const [nodeStatus, setNodeStatus] = useState(null);
  const [claudeStatus, setClaudeStatus] = useState(null);
  const [codexStatus, setCodexStatus] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Node.js - we're running, so it's always present
    const nodeVer = process.version;
    const nodeMajor = parseInt(nodeVer.slice(1), 10);
    setNodeStatus({
      installed: true,
      version: nodeVer,
      ok: nodeMajor >= 18
    });

    // Claude Code CLI
    const cliCheck = isClaudeCodeInstalled();
    if (cliCheck.installed) {
      const auth = isClaudeCodeLoggedIn();
      setClaudeStatus({
        installed: true,
        version: cliCheck.version,
        loggedIn: auth.loggedIn
      });
    } else {
      setClaudeStatus({ installed: false, version: null, loggedIn: false });
    }

    // Codex CLI
    try {
      const codexVersion = execSync("codex --version", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000
      }).trim();
      setCodexStatus({ installed: true, version: codexVersion });
    } catch {
      setCodexStatus({ installed: false, version: null });
    }

    setChecking(false);
  }, []);

  // Auto-complete if Node is OK and at least one CLI is installed
  useEffect(() => {
    if (!checking && nodeStatus?.ok && (claudeStatus?.installed || codexStatus?.installed)) {
      const timer = setTimeout(() => onComplete({ node: nodeStatus, claude: claudeStatus, codex: codexStatus }), 1000);
      return () => clearTimeout(timer);
    }
  }, [checking, nodeStatus, claudeStatus, codexStatus]);

  const allGood = nodeStatus?.ok && (claudeStatus?.installed || codexStatus?.installed);

  return e(
    Box,
    { flexDirection: "column", paddingX: 2, paddingY: 1 },
    e(Text, { bold: true, color: "#e2e8f0" }, "System Prerequisites"),
    e(Text, { color: "#94a3b8", dimColor: true }, "Checking required software..."),
    e(Box, { marginTop: 1, flexDirection: "column" },

      // Node.js check
      e(Box, { flexDirection: "row", marginTop: 1 },
        e(Text, { color: nodeStatus?.ok ? "#22c55e" : checking ? "#64748b" : "#ef4444" },
          nodeStatus?.ok ? "  \u2714 " : checking ? "  \u25CB " : "  \u2718 "),
        e(Text, { color: "#e2e8f0" }, "Node.js "),
        nodeStatus
          ? e(Text, { color: nodeStatus.ok ? "#22c55e" : "#ef4444" },
              `${nodeStatus.version} ${nodeStatus.ok ? "" : "(v18+ required)"}`)
          : e(Text, { color: "#64748b" }, "checking...")
      ),

      // Claude Code CLI check
      e(Box, { flexDirection: "row", marginTop: 1 },
        e(Text, { color: claudeStatus?.installed ? "#22c55e" : checking ? "#64748b" : "#f97316" },
          claudeStatus?.installed ? "  \u2714 " : checking ? "  \u25CB " : "  \u2718 "),
        e(Text, { color: "#e2e8f0" }, "Claude Code CLI "),
        claudeStatus
          ? claudeStatus.installed
            ? e(Text, { color: "#22c55e" },
                `${claudeStatus.version}${claudeStatus.loggedIn ? " (logged in)" : " (not logged in)"}`)
            : e(Text, { color: "#f97316" }, "not installed")
          : e(Text, { color: "#64748b" }, "checking...")
      ),

      // Codex CLI check
      e(Box, { flexDirection: "row", marginTop: 1 },
        e(Text, { color: codexStatus?.installed ? "#22c55e" : checking ? "#64748b" : "#f97316" },
          codexStatus?.installed ? "  \u2714 " : checking ? "  \u25CB " : "  \u2718 "),
        e(Text, { color: "#e2e8f0" }, "Codex CLI "),
        codexStatus
          ? codexStatus.installed
            ? e(Text, { color: "#22c55e" }, `${codexStatus.version}`)
            : e(Text, { color: "#f97316" }, "not installed")
          : e(Text, { color: "#64748b" }, "checking...")
      ),

      // Instructions if Claude missing
      !checking && !claudeStatus?.installed && !codexStatus?.installed && e(Box, { flexDirection: "column", marginTop: 1, paddingX: 2 },
        e(Text, { color: "#f97316", bold: true }, "To install Claude Code CLI:"),
        e(Text, { color: "#94a3b8" }, ""),
        e(Text, { color: "#e2e8f0" }, "  npm install -g @anthropic-ai/claude-code"),
        e(Text, { color: "#94a3b8" }, ""),
        e(Text, { color: "#94a3b8" }, "Then run 'claude' in your terminal to log in with your"),
        e(Text, { color: "#94a3b8" }, "Anthropic Pro or Max subscription."),
        e(Text, { color: "#94a3b8", marginTop: 1 }, "Or install and login with Codex CLI for fallback."),
        e(Text, { color: "#94a3b8", marginTop: 1 }, "Press Enter to re-check, or S to skip for now")
      ),

      // Node too old
      !checking && nodeStatus && !nodeStatus.ok && e(Box, { flexDirection: "column", marginTop: 1, paddingX: 2 },
        e(Text, { color: "#ef4444", bold: true }, "Node.js v18+ is required."),
        e(Text, { color: "#94a3b8" }, "Download from: https://nodejs.org")
      ),

      // All good
      allGood && e(Box, { marginTop: 1 },
        e(Text, { color: "#22c55e" }, "  All prerequisites met! Continuing...")
      )
    )
  );
};

// Handle input for prerequisites step (re-check or skip)
const PrerequisitesStepWrapper = ({ onComplete, onError }) => {
  const wrapperRef = useRef({ onComplete });
  wrapperRef.current.onComplete = onComplete;

  useInput((input, key) => {
    if (key.return) {
      // Re-check by re-rendering - trigger via error then re-mount
      // Simplest: just call onComplete if prerequisites now met
      const cli = isClaudeCodeInstalled();
      let codex = { installed: false, version: null };
      try {
        const codexVersion = execSync("codex --version", {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 5000
        }).trim();
        codex = { installed: true, version: codexVersion };
      } catch {}
      if (cli.installed || codex.installed) {
        wrapperRef.current.onComplete({ node: process.version, claude: cli, codex });
      }
    }
    if (input.toLowerCase() === "s") {
      // Skip - Claude Code is optional (other AI models work too)
      wrapperRef.current.onComplete({ skipped: true });
    }
  });

  return e(PrerequisitesStep, { onComplete, onError });
};

/**
 * Google Login Step Component
 * Opens browser for Google OAuth sign-in
 */
const GoogleLoginStep = ({ onComplete, onError, onLogout, onProfileRestored }) => {
  const [status, setStatus] = useState("ready"); // ready, waiting, success, error, signed-in, restoring
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);

  // Check for archived profile and either restore or pass through
  const handleSignInSuccess = useCallback(async (signedInUser) => {
    if (onProfileRestored && signedInUser?.id && hasArchivedProfile(signedInUser.id)) {
      setStatus("restoring");
      setMessage("Restoring your profile...");
      try {
        const result = await restoreProfile(signedInUser.id);
        if (result.success) {
          onProfileRestored(signedInUser);
          return;
        }
      } catch (err) {
        console.error("[onboarding] Profile restore failed:", err.message);
      }
      // If restore failed, fall through to normal onComplete
    }
    onComplete(signedInUser);
  }, [onComplete, onProfileRestored]);

  useEffect(() => {
    const existingUser = getCurrentFirebaseUser();
    if (existingUser) {
      setUser(existingUser);
      setStatus("signed-in");
      setMessage(`Signed in as ${existingUser.email}`);
      // Auto-complete after brief delay if already signed in
      setTimeout(() => handleSignInSuccess(existingUser), 800);
    }
  }, [handleSignInSuccess]);

  const handleSignIn = useCallback(async () => {
    setStatus("waiting");
    setMessage("Opening Google sign-in in your browser...");

    try {
      const result = await signInWithGoogle();

      if (result.success) {
        setUser(result.user);
        setStatus("success");
        setMessage(`Signed in as ${result.user.email}`);
        setTimeout(() => handleSignInSuccess(result.user), 1000);
      } else {
        setStatus("error");
        setMessage(result.error || "Sign-in failed. Press Enter to retry.");
        if (onError) onError(result.error);
      }
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Sign-in failed. Press Enter to retry.");
      if (onError) onError(err.message);
    }
  }, [handleSignInSuccess, onError]);

  const handleLogout = useCallback(() => {
    signOutFirebase();
    setUser(null);
    setStatus("ready");
    setMessage("Signed out.");
    if (onLogout) onLogout();
  }, [onLogout]);

  useInput((input, key) => {
    const lower = input.toLowerCase();
    if (status === "signed-in") {
      if (key.return && user) {
        handleSignInSuccess(user);
      }
      if (lower === "o") {
        handleLogout();
      }
      return;
    }
    if (status === "restoring") return; // Don't accept input while restoring
    if (key.return || lower === "l") {
      if (status === "ready" || status === "error") {
        handleSignIn();
      }
    }
  });

  if (status === "restoring") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#f97316", bold: true }, "Restoring Profile..."),
      e(Text, { color: "#e2e8f0" }, `Welcome back, ${user?.name || user?.email}!`),
      e(Text, { color: "#64748b" }, "Loading your data, goals, and settings...")
    );
  }

  if (status === "success") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#22c55e", bold: true }, "\u2713 Google Account Connected"),
      e(Text, { color: "#e2e8f0" }, `Welcome, ${user?.name || user?.email}!`)
    );
  }

  if (status === "signed-in") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#22c55e", bold: true }, "Google Account Connected"),
      e(Text, { color: "#e2e8f0" }, user?.name || "User"),
      e(Text, { color: "#94a3b8" }, user?.email || ""),
      e(Text, { color: "#64748b", dimColor: true }, "Press Enter to continue"),
      e(Text, { color: "#f97316" }, "Press O to log out")
    );
  }

  if (status === "waiting") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Google Sign-In"),
      e(Text, { color: "#f97316" }, message),
      e(Text, { color: "#64748b" }, "Complete sign-in in your browser..."),
      e(Text, { color: "#64748b", dimColor: true }, "Waiting for authentication...")
    );
  }

  if (status === "error") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Google Sign-In"),
      e(Text, { color: "#ef4444" }, message),
            e(Text, { color: "#64748b" }, "Press Enter to try again")
    );
  }

    // Ready state
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Google Sign-In"),
      e(Text, { color: "#64748b" }, "Connect your Google account to BACKBONE"),
      message && e(Text, { color: "#94a3b8" }, message),
      e(Text, { color: "#f97316" }, "\u25B6 Press Enter or L to sign in with Google"),
      e(Text, { color: "#64748b", dimColor: true }, "A browser window will open for secure sign-in")
    );
  };

/**
 * Phone Verification Step
 * Captures a phone number and verifies via WhatsApp OTP
 * Required step - user must verify phone to receive notifications
 */
const PhoneVerificationStep = ({ onComplete, onError }) => {
  const user = getCurrentFirebaseUser();
  const userId = user?.id;
  const PROVIDERS = {
    BAILEYS: "baileys",
    TWILIO: "twilio"
  };
  // Phases: waiting (need login), ready (can start), phoneEntry, codeEntry, pairingEntry, success
  const [phase, setPhase] = useState(userId ? "checking" : "waiting");
  const [provider, setProvider] = useState(PROVIDERS.BAILEYS);
  const [phoneEntry, setPhoneEntry] = useState("+1 ");
  const [codeInput, setCodeInput] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [status, setStatus] = useState(userId ? "ready" : "pending");
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [existingPhone, setExistingPhone] = useState(null);
  const [message, setMessage] = useState("");
  const [testCode, setTestCode] = useState(null);
  const completedRef = useRef(false);
  // Twilio sandbox config from Firebase
  const [sandboxJoinWords, setSandboxJoinWords] = useState("join <sandbox-words>");
  const [twilioWhatsAppNumber, setTwilioWhatsAppNumber] = useState("+1 415 523 8886");

  // Fetch Twilio config from Firebase on mount
  useEffect(() => {
    const loadTwilioConfig = async () => {
      try {
        const config = await fetchTwilioConfig();
        if (config?.sandboxJoinWords) {
          setSandboxJoinWords(config.sandboxJoinWords);
        }
        if (config?.whatsappNumber) {
          // Format number for display
          const num = config.whatsappNumber.replace(/^\+/, "");
          const formatted = `+${num.slice(0, 1)} ${num.slice(1, 4)} ${num.slice(4, 7)} ${num.slice(7)}`;
          setTwilioWhatsAppNumber(formatted);
        }
      } catch (err) {
        // Use defaults if fetch fails
        console.warn("[Onboarding] Could not fetch Twilio config:", err.message);
      }
    };
    loadTwilioConfig();
  }, []);

  const completeStep = useCallback((payload) => {
    if (completedRef.current) return;
    completedRef.current = true;
    setTimeout(() => onComplete(payload), 600);
  }, [onComplete]);

  useEffect(() => {
    if (!userId) {
      setPhase("waiting");
      setStatus("pending");
      setMessage("Sign in with Google first.");
      return;
    }

    let cancelled = false;

    const updateFromRecord = (record) => {
      if (record?.verification?.verifiedAt || record?.verification?.status === "verified") {
        const verifiedPhone = record.phoneNumber;
        setExistingPhone(verifiedPhone);
        setProvider(PROVIDERS.TWILIO);
        setPhase("ready");
        setStatus("verified");
        setMessage(`Verified: ${verifiedPhone}`);
        completeStep({ existing: true, phone: verifiedPhone, provider: PROVIDERS.TWILIO });
        return true;
      }
      return false;
    };

    const initialize = async () => {
      const record = getPhoneRecord(userId);
      if (updateFromRecord(record)) return;

      // If no local record, try Firestore (other machines / web)
      const synced = await syncPhoneFromFirestore(userId).catch(() => null);
      if (updateFromRecord(synced)) return;

      // Also treat an already-linked Baileys session as connected.
      try {
        const waStatus = await fetchServerWhatsAppStatus();
        const linked = Boolean(waStatus?.providers?.baileys?.connected);
        if (linked) {
          const settings = loadUserSettings();
          const linkedPhone = settings?.phoneNumber || settings?.phone || null;
          setExistingPhone(linkedPhone || "Baileys linked");
          setProvider(PROVIDERS.BAILEYS);
          setPhase("ready");
          setStatus("verified");
          setMessage(linkedPhone ? `Baileys linked: ${linkedPhone}` : "Baileys linked.");
          completeStep({ existing: true, phone: linkedPhone, provider: PROVIDERS.BAILEYS });
          return;
        }
      } catch (err) {
        // Keep onboarding usable even if status probe fails.
      }

      if (!cancelled) {
        // Not verified - ready to start
        setPhase("ready");
        setStatus("ready");
        setMessage("Choose a WhatsApp connection method.");
      }
    };

    initialize();
    return () => {
      cancelled = true;
    };
  }, [userId, completeStep]);

  // Validate phone number format (+1 required)
  const validatePhone = (phone) => {
    const cleaned = phone.replace(/[^0-9+]/g, "");
    if (!cleaned.startsWith("+1")) {
      return { valid: false, error: "Phone must start with +1 (US number)" };
    }
    if (cleaned.length < 12) { // +1 + 10 digits
      return { valid: false, error: "Enter full 10-digit number after +1" };
    }
    if (cleaned.length > 12) {
      return { valid: false, error: "Too many digits" };
    }
    return { valid: true, normalized: cleaned };
  };

  // Handle phone input change - auto-format
  const handlePhoneChange = (value) => {
    // Ensure +1 prefix stays
    if (!value.startsWith("+1")) {
      if (value.startsWith("+")) {
        value = "+1" + value.slice(1).replace(/[^0-9]/g, "");
      } else if (value.startsWith("1")) {
        value = "+1" + value.slice(1).replace(/[^0-9]/g, "");
      } else {
        value = "+1 " + value.replace(/[^0-9]/g, "");
      }
    }
    setPhoneEntry(value);
  };

  const sendCode = useCallback(
    async (value) => {
      if (!userId) {
        setMessage("Sign in with Google first.");
        return;
      }

      const validation = validatePhone(value);
      if (!validation.valid) {
        setStatus("error");
        setMessage(validation.error);
        return;
      }

      setStatus("sending");
      setPairingCode("");
      setMessage(
        provider === PROVIDERS.BAILEYS
          ? "Generating Baileys pairing code..."
          : "Sending code to WhatsApp..."
      );

      try {
        if (provider === PROVIDERS.BAILEYS) {
          const pairing = await requestServerBaileysPairingCode(validation.normalized);
          if (!pairing?.pairingCode) {
            const errorText = pairing?.error || "Failed to generate pairing code.";
            setStatus("error");
            setMessage(errorText);
            if (onError) onError(errorText);
            return;
          }

          setPhoneEntry(validation.normalized);
          setPairingCode(pairing.pairingCode || "");
          setPhase("pairingEntry");
          setStatus("pairingCode");
          setMessage("On your phone: WhatsApp > Settings > Linked Devices > Link a device > Link with phone number instead, then enter this code and press Enter to confirm.");
          return;
        }

        const result = await requestPhoneCode(userId, validation.normalized);

        if (!result.success) {
          setStatus("error");
          setMessage(result.error || "Failed to send code.");
          if (onError) onError(result.error);
          return;
        }

        setPhoneEntry(validation.normalized);
        setCodeInput("");
        setPhase("codeEntry");
        setStatus("codeSent");
        setAttemptsRemaining(result.attemptsRemaining || 3);

        if (result.testMode) {
          setTestCode(result.code);
          setMessage(`Test mode - Code: ${result.code}`);
        } else {
          setTestCode(null);
          setMessage("Check your WhatsApp for the 6-digit code.");
        }
      } catch (error) {
        setStatus("error");
        setMessage(error?.message || "Failed to send code.");
        if (onError) onError(error?.message);
      }
    },
    [userId, provider, onError]
  );

  const handleVerifyCode = useCallback(
    async (value) => {
      if (!userId || !phoneEntry) return;

      setStatus("verifying");
      const result = await verifyPhoneCode(userId, value.trim());

      if (result.success) {
        setStatus("success");
        setPhase("success");
        setMessage("Phone verified!");
        setTestCode(null);

        // Send welcome message via WhatsApp
        const welcomeMessage = `Hey! You're all set up with Backbone.

If you need me to do anything, just let me know. Help me help you!

Some things I can help with:
(a) Help you save money and invest more
(b) Help with your career growth
(c) Improve your home life

Just reply with a, b, or c - or tell me what's on your mind!`;

        try {
          await sendWhatsAppMessage(userId, welcomeMessage);
        } catch (e) {
          // Don't block onboarding if welcome message fails
          console.error("[Onboarding] Failed to send welcome message:", e.message);
        }

        if (!completedRef.current) {
          completeStep({ phone: result.phoneNumber || phoneEntry, provider: PROVIDERS.TWILIO });
        }
      } else {
        setAttemptsRemaining(result.attemptsRemaining ?? 0);
        if (result.attemptsRemaining === 0) {
          setStatus("failed");
          setMessage("Too many attempts. Press Enter to retry.");
        } else {
          setStatus("codeSent");
          setMessage(`Wrong code. ${result.attemptsRemaining} attempts left.`);
        }
        setCodeInput("");
      }
    },
    [userId, phoneEntry, completeStep]
  );

  const checkBaileysConnection = useCallback(async () => {
    if (!phoneEntry) return;
    setStatus("verifying");
    setMessage("Checking Baileys connection...");

    try {
      const waStatus = await fetchServerWhatsAppStatus();
      const linked = Boolean(waStatus?.providers?.baileys?.connected);

      if (!linked) {
        setStatus("pairingCode");
        setMessage(
          waStatus?.providers?.baileys?.lastError ||
          "Still waiting for link. Enter the code in WhatsApp, then press Enter again."
        );
        return;
      }

      setStatus("success");
      setPhase("success");
      setMessage("Baileys linked!");

      const settings = loadUserSettings();
      updateSettings({
        phoneNumber: phoneEntry,
        phone: phoneEntry,
        connections: {
          ...(settings?.connections || {}),
          phone: true
        }
      });

      const welcomeMessage = `Hey! You're all set up with Backbone.

If you need me to do anything, just tell me here.

I can help with:
(a) saving and investing
(b) career growth
(c) home and life organization`;

      try {
        const wa = getTwilioWhatsApp();
        if (!wa.initialized) {
          await wa.initialize({ providerPreference: "baileys" });
        }
        await wa.sendMessage(phoneEntry, welcomeMessage, { forceProvider: "baileys" });
      } catch (sendErr) {
        // Non-fatal.
      }

      completeStep({ phone: phoneEntry, provider: PROVIDERS.BAILEYS });
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "Failed to check Baileys status.");
      if (onError) onError(error?.message);
    }
  }, [phoneEntry, completeStep, onError]);

  const enterPhoneEntry = useCallback(() => {
    completedRef.current = false;
    setPhase("phoneEntry");
    setPhoneEntry("+1 ");
    setCodeInput("");
    setPairingCode("");
    setTestCode(null);
    setAttemptsRemaining(3);
    setStatus("ready");
    setMessage(
      provider === PROVIDERS.BAILEYS
        ? "Enter your US phone number (+1) for Baileys pairing."
        : "Enter your US phone number (+1)"
    );
  }, [provider]);

  const handleContinue = useCallback(() => {
    if (existingPhone && !completedRef.current) {
      completeStep({ existing: true, phone: existingPhone, provider });
    }
  }, [existingPhone, completeStep, provider]);

  // Keyboard handler
  useInput((input, key) => {
    // Waiting for login - no actions
    if (phase === "waiting") return;

    // Ready phase - Enter or Right arrow to start verification
    if (phase === "ready") {
      const lower = String(input || "").toLowerCase();
      if (lower === "b") {
        setProvider(PROVIDERS.BAILEYS);
        if (status !== "verified") {
          setMessage("Baileys selected. Press Enter to link your WhatsApp.");
        }
        return;
      }
      if (lower === "t") {
        setProvider(PROVIDERS.TWILIO);
        if (status !== "verified") {
          setMessage("Twilio OTP selected. Press Enter to verify your phone.");
        }
        return;
      }
      if (key.return || key.rightArrow) {
        if (status === "verified" && existingPhone) {
          // Already verified - Enter continues, Right re-verifies
          if (key.return) {
            handleContinue();
          } else {
            enterPhoneEntry();
          }
        } else {
          enterPhoneEntry();
        }
        return;
      }
    }

    // Phone entry phase - Escape to go back
    if (phase === "phoneEntry" && key.escape) {
      setPhase("ready");
      setMessage(existingPhone ? `Verified: ${existingPhone}` : "Verify your phone for WhatsApp notifications.");
      setStatus(existingPhone ? "verified" : "ready");
      return;
    }

    // Code entry phase - Escape to go back to phone entry
    if (phase === "codeEntry" && key.escape) {
      enterPhoneEntry();
      return;
    }

    // Pairing code phase - Enter checks link, Escape edits phone
    if (phase === "pairingEntry") {
      if (key.return) {
        checkBaileysConnection();
        return;
      }
      if (key.escape) {
        enterPhoneEntry();
        return;
      }
    }

    // Failed - Enter to retry
    if (status === "failed" && key.return) {
      enterPhoneEntry();
      return;
    }
  });

  // Waiting for Google login
  if (!userId || phase === "waiting") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "WhatsApp Verification"),
      e(Text, { color: "#64748b" }, "Sign in with Google first."),
      e(Text, { color: "#64748b", dimColor: true, marginTop: 1 }, "[Up/Down] navigate steps")
    );
  }
  // Ready phase - show prompt to enter verification
  if (phase === "ready") {
    const isVerified = status === "verified" && existingPhone;
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "WhatsApp Verification"),
      isVerified
        ? e(Text, { color: "#22c55e", marginTop: 1 }, `Connected: ${existingPhone}`)
        : e(
            Box,
            { flexDirection: "column" },
            e(Text, { color: "#64748b" }, "Choose how to connect WhatsApp:"),
            e(
              Box,
              { marginTop: 1, flexDirection: "column" },
              e(
                Text,
                { color: provider === PROVIDERS.BAILEYS ? "#22c55e" : "#94a3b8" },
                `[B] Baileys (recommended)${provider === PROVIDERS.BAILEYS ? "  <- selected" : ""}`
              ),
              e(
                Text,
                { color: provider === PROVIDERS.TWILIO ? "#22c55e" : "#94a3b8" },
                `[T] Twilio OTP${provider === PROVIDERS.TWILIO ? "  <- selected" : ""}`
              )
            ),
            provider === PROVIDERS.TWILIO
              ? e(
                  Box,
                  { marginTop: 1, flexDirection: "column" },
                  e(Text, { color: "#f59e0b", dimColor: true }, `First, text ${twilioWhatsAppNumber}:`),
                  e(Text, { color: "#f97316", bold: true }, sandboxJoinWords)
                )
              : e(
                  Box,
                  { marginTop: 1, flexDirection: "column" },
                  e(Text, { color: "#94a3b8" }, "Baileys links your own WhatsApp directly."),
                  e(Text, { color: "#64748b", dimColor: true }, "No Twilio account required.")
                )
          ),
      e(
        Box,
        { marginTop: 1 },
        isVerified
          ? e(Text, { color: "#64748b" }, "[Enter] Continue  [Right] Re-verify")
          : e(Text, { color: "#f97316" }, "[Enter or Right] Start verification")
      ),
      e(Text, { color: "#64748b", dimColor: true }, "Use B/T to switch provider")
    );
  }

  // Phone entry phase
  if (phase === "phoneEntry") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Enter Phone Number"),
      e(Text, { color: "#64748b" }, "US numbers only (+1)"),
      provider === PROVIDERS.TWILIO &&
        e(
          Box,
          { marginTop: 1, flexDirection: "column" },
          e(Text, { color: "#f59e0b", dimColor: true }, `First, text ${twilioWhatsAppNumber} on WhatsApp:`),
          e(Text, { color: "#f97316", bold: true }, sandboxJoinWords)
        ),
      provider === PROVIDERS.BAILEYS &&
        e(
          Box,
          { marginTop: 1, flexDirection: "column" },
          e(Text, { color: "#94a3b8" }, "We will generate a pairing code for WhatsApp Linked Devices."),
          e(Text, { color: "#64748b", dimColor: true }, "On your phone: WhatsApp > Settings > Linked Devices > Link a device > Link with phone number instead")
        ),
      message &&
        e(
          Text,
          { color: status === "error" ? "#ef4444" : "#94a3b8", marginTop: 1 },
          message
        ),
      e(
        Box,
        { marginTop: 1 },
        e(TextInput, {
          value: phoneEntry,
          onChange: handlePhoneChange,
          placeholder: "+1 555 123 4567",
          onSubmit: sendCode
        })
      ),
      e(
        Text,
        { color: "#64748b", dimColor: true },
        provider === PROVIDERS.BAILEYS ? "[Enter] Get pairing code  [Esc] Back" : "[Enter] Send code  [Esc] Back"
      )
    );
  }

  // Code entry phase
  if (phase === "codeEntry") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Enter Verification Code"),
      e(Text, { color: "#64748b" }, `Sent to: ${phoneEntry}`),
      message &&
        e(
          Text,
          { color: status === "error" || status === "failed" ? "#ef4444" : "#94a3b8", marginTop: 1 },
          message
        ),
      e(
        Box,
        { marginTop: 1 },
        e(TextInput, {
          value: codeInput,
          onChange: setCodeInput,
          placeholder: "123456",
          onSubmit: handleVerifyCode
        })
      ),
      e(Text, { color: "#f59e0b", dimColor: true }, `${attemptsRemaining} attempts remaining`),
      testCode && e(Text, { color: "#f97316" }, `Test code: ${testCode}`),
      e(Text, { color: "#64748b", dimColor: true }, "[Enter] Verify  [Esc] Back")
    );
  }

  // Baileys pairing phase
  if (phase === "pairingEntry") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Baileys Pairing"),
      e(Text, { color: "#64748b" }, `Phone: ${phoneEntry}`),
      pairingCode && e(Text, { color: "#22c55e", bold: true, marginTop: 1 }, `Pairing code: ${pairingCode}`),
      e(Text, { color: "#94a3b8", marginTop: 1 }, "On your phone, open WhatsApp Linked Devices, choose Link with phone number instead, enter this code, then press Enter to check."),
      message && e(Text, { color: status === "error" ? "#ef4444" : "#94a3b8", marginTop: 1 }, message),
      e(Text, { color: "#64748b", dimColor: true }, "[Enter] Check connection  [Esc] Back")
    );
  }

  // Success phase
  if (phase === "success") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "WhatsApp Verification"),
      e(Text, { color: "#22c55e", marginTop: 1 }, "Connected"),
      e(Text, { color: "#64748b" }, provider === PROVIDERS.BAILEYS ? "Baileys is now linked." : "You'll receive WhatsApp notifications.")
    );
  }

  // Default fallback
  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#e2e8f0", bold: true }, "WhatsApp Verification"),
    e(Text, { color: "#64748b" }, message || "Loading...")
  );
};

const CommunicationsWhatsAppStep = ({ phoneConnected, onComplete }) => {
  const settings = loadUserSettings();
  const connectedPhone = settings?.phoneNumber || settings?.phone || null;
  const normalizedPhone = useMemo(() => {
    const raw = String(connectedPhone || "").trim();
    const normalized = raw.replace(/[^\d+]/g, "");
    if (!normalized) return null;
    const withCountry = normalized.startsWith("+")
      ? normalized
      : normalized.length === 10
        ? `+1${normalized}`
        : normalized.length === 11 && normalized.startsWith("1")
          ? `+${normalized}`
          : normalized;
    return /^\+1\d{10}$/.test(withCountry) ? withCountry : null;
  }, [connectedPhone]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [qrAscii, setQrAscii] = useState("");
  const [baileysStatus, setBaileysStatus] = useState(null);

  const refreshBaileys = useCallback(async ({ autoPair = false, silent = false } = {}) => {
    if (!phoneConnected) {
      if (!silent) setMessage("Complete WhatsApp Verification first.");
      return false;
    }
    if (!normalizedPhone) {
      if (!silent) setMessage("No valid +1 phone found. Return to WhatsApp Verification.");
      return false;
    }

    if (!silent) {
      setMessage("Checking Baileys status...");
    }
    setLoading(true);

    try {
      let status = await fetchServerWhatsAppStatus({ autoPair: false, phone: normalizedPhone });
      let providerState = status?.providers?.baileys || {};
      setBaileysStatus(providerState);

      if (providerState.connected) {
        setPairingCode("");
        setQrAscii("");
        if (!silent) {
          setMessage("Baileys is linked. Press Enter to confirm this communication channel.");
        }
        return true;
      }

      let nextPairingCode = "";
      if (autoPair) {
        const pairing = await requestServerBaileysPairingCode(normalizedPhone);
        if (pairing?.pairingCode) {
          nextPairingCode = pairing.pairingCode;
          setPairingCode(pairing.pairingCode);
        } else setPairingCode("");
      }

      status = await fetchServerWhatsAppStatus({ autoPair: false, phone: normalizedPhone });
      providerState = status?.providers?.baileys || {};
      setBaileysStatus(providerState);

      const qr = typeof providerState.qrAscii === "string" ? providerState.qrAscii.trim() : "";
      setQrAscii(qr);

      if (providerState.connected) {
        setPairingCode("");
        setQrAscii("");
        if (!silent) {
          setMessage("Baileys is linked. Press Enter to confirm this communication channel.");
        }
        return true;
      }

      if (!silent) {
        if (qr) {
          setMessage("QR ready. On your phone, scan this from WhatsApp > Settings > Linked Devices > Link a device, then press Enter to re-check.");
        } else if (nextPairingCode) {
          setMessage("Pairing code ready. On your phone: WhatsApp > Settings > Linked Devices > Link a device > Link with phone number instead, enter this code, then press Enter to re-check.");
        } else {
          setMessage(
            providerState.lastError ||
            "Still waiting for link. Press Enter to re-check, or press G to generate a new pairing code."
          );
        }
      }
      return false;
    } catch (error) {
      if (!silent) {
        setMessage(error?.message || "Failed to check Baileys status.");
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [phoneConnected, normalizedPhone]);

  useEffect(() => {
    refreshBaileys({ autoPair: false, silent: false });
  }, [refreshBaileys]);

  useInput((input, key) => {
    const lower = String(input || "").toLowerCase();
    if (lower === "g") {
      if (!phoneConnected) {
        setMessage("Complete WhatsApp Verification first.");
        return;
      }
      refreshBaileys({ autoPair: true });
      return;
    }
    if (!key.return) return;
    if (!phoneConnected) {
      setMessage("Complete WhatsApp Verification first.");
      return;
    }
    if (baileysStatus?.connected) {
      setMessage("");
      onComplete({ provider: "whatsapp", phone: normalizedPhone || connectedPhone || null });
      return;
    }
    refreshBaileys({ autoPair: false });
  });

  const connected = baileysStatus?.connected === true;
  const requiresPairing = baileysStatus?.requiresPairing === true || baileysStatus?.lastDisconnectCode === 401;
  const phoneLabel = normalizedPhone || connectedPhone || "not set";

  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#e2e8f0", bold: true }, "Communications (WhatsApp)"),
    phoneConnected
      ? e(Text, { color: "#94a3b8", marginTop: 1 }, `Phone: ${phoneLabel}`)
      : e(Text, { color: "#f59e0b", marginTop: 1 }, "Pending: complete WhatsApp Verification first"),
    phoneConnected && e(Text, { color: connected ? "#22c55e" : "#f59e0b" }, `Baileys: ${connected ? "Connected" : "Not connected"}`),
    phoneConnected && requiresPairing && e(Text, { color: "#f59e0b" }, "Pairing required on your phone: WhatsApp > Settings > Linked Devices"),
    pairingCode && e(Text, { color: "#22c55e", bold: true, marginTop: 1 }, `Pairing code: ${pairingCode}`),
    pairingCode && e(Text, { color: "#94a3b8" }, "Use your phone: Link a device > Link with phone number instead, then enter the code above."),
    qrAscii && e(Text, { color: "#22c55e", marginTop: 1 }, "QR ready: use your phone to scan below from WhatsApp Linked Devices"),
    qrAscii && e(Text, { color: "#22c55e" }, qrAscii),
    loading && e(Text, { color: "#64748b", marginTop: 1 }, "Loading WhatsApp status..."),
    message && e(Text, { color: connected ? "#64748b" : "#f59e0b", marginTop: 1 }, message),
    phoneConnected && e(
      Text,
      { color: "#64748b", dimColor: true, marginTop: 1 },
      connected
        ? "[Enter] Confirm channel"
        : "[Enter] Re-check link  [G] New pairing code"
    )
  );
};

/**
 * Model Selection Step Component
 * Two-panel navigation:
 * - Left/Right arrows switch between main list and sub-options
 * - Up/Down arrows navigate within current panel
 * - Enter confirms selection
 */
const ModelSelectionStep = ({ onComplete, onError, onNavigationLockChange, initialProviderId = null, autoOpenProvider = false }) => {
  const [selectedProvider, setSelectedProvider] = useState(0);
  const [subStep, setSubStep] = useState("select"); // select, api-key, validating, oauth, success
  const [activePanel, setActivePanel] = useState("main"); // "main" = gray border, "sub" = orange border
  const [apiKey, setApiKey] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [message, setMessage] = useState("");
  const [oauthStatus, setOauthStatus] = useState("");
  const fileWatcherRef = useRef(null);
  const proCheckTimeoutRef = useRef(null);
  const autoOpenedRef = useRef(false);
  const useInlineKeyEntry = isModernTerminal();

  // Cache model connection status to avoid expensive sync calls on every render
  const [modelStatus, setModelStatus] = useState({});
  const [statusLoading, setStatusLoading] = useState(true);

  // Load model connection status asynchronously on mount
  useEffect(() => {
    const loadModelStatus = async () => {
      const status = {};

      // Check Claude Code CLI (async)
      const cliCheck = await isClaudeCodeInstalledAsync();
      const cliAuth = cliCheck.installed ? isClaudeCodeLoggedIn() : { loggedIn: false };

      status["claude-code"] = {
        connected: cliAuth.loggedIn,
        label: !cliCheck.installed ? "Not Installed" : (cliAuth.loggedIn ? "CLI Logged In" : "Not Logged In")
      };

      // Check Claude OAuth
      status["claude-oauth"] = {
        connected: hasClaudeCredentials(),
        label: hasClaudeCredentials() ? "Browser OAuth" : null
      };

      // Check OpenAI Codex
      status["openai-codex"] = {
        connected: hasCodexCredentials(),
        label: hasCodexCredentials() ? "Codex Logged In" : null
      };

      // Check API key providers
      for (const id of ["openai", "anthropic", "google"]) {
        const configured = isProviderConfigured(id);
        status[id] = {
          connected: configured,
          label: configured ? "API Key" : null
        };
      }

      setModelStatus(status);
      setStatusLoading(false);
    };

    loadModelStatus();
  }, []);

  // Check if any provider is already configured (after status loads)
  useEffect(() => {
    if (statusLoading) return;

    // First check Claude Code CLI (best option)
    if (modelStatus["claude-code"]?.connected) {
      const authStatus = isClaudeCodeLoggedIn();
      setMessage(`Claude Code connected! (${authStatus.model || "Opus 4.6"})`);
      setTimeout(() => onComplete({ provider: "claude-code", existing: true, model: authStatus.model }), 1000);
      return;
    }

    // Then check Claude OAuth credentials
    if (modelStatus["claude-oauth"]?.connected) {
      setMessage("Claude Pro/Max already connected!");
      setTimeout(() => onComplete({ provider: "claude-oauth", existing: true }), 1000);
      return;
    }

    // Check Codex credentials
    if (modelStatus["openai-codex"]?.connected) {
      setMessage("OpenAI Codex already connected!");
      setTimeout(() => onComplete({ provider: "openai-codex", existing: true }), 1000);
      return;
    }

    // Check other providers
    for (const opt of MODEL_OPTIONS) {
      if (opt.id === "claude-code" || opt.id === "claude-oauth" || opt.id === "openai-codex") continue;
      if (modelStatus[opt.id]?.connected) {
        setMessage(`${opt.label} already configured!`);
        setTimeout(() => onComplete({ provider: opt.id, existing: true }), 1000);
        return;
      }
    }
  }, [onComplete, statusLoading, modelStatus]);

  useEffect(() => {
    if (!autoOpenProvider || autoOpenedRef.current) return;
    if (!initialProviderId) return;
    if (isProviderConfigured(initialProviderId)) {
      autoOpenedRef.current = true;
      return;
    }
    const index = MODEL_OPTIONS.findIndex((opt) => opt.id === initialProviderId);
    if (index < 0) return;
    const provider = MODEL_OPTIONS[index];
    autoOpenedRef.current = true;
    setSelectedProvider(index);
    setActivePanel("sub");
    executeProviderSetup(provider);
  }, [autoOpenProvider, initialProviderId]);

  // Handle Claude Code CLI login (opens terminal)
  const handleClaudeCodeLogin = async () => {
    // Use cached status to check if installed (avoid slow sync call)
    const cachedStatus = modelStatus["claude-code"];
    if (cachedStatus?.label === "Not Installed") {
      // Claude Code not installed - show instructions
      setSubStep("oauth");
      setOauthStatus("Claude Code CLI not installed");
      setMessage(`Run: npm install -g @anthropic-ai/claude-code`);
      setTimeout(() => {
        setSubStep("select");
        setSelectedProvider(1); // Fall back to browser OAuth
      }, 3000);
      return;
    }

    // Check if already logged in
    if (cachedStatus?.connected) {
      const authStatus = isClaudeCodeLoggedIn();
      setMessage(`Claude Code already connected! (${authStatus.model || "Opus 4.6"})`);
      setTimeout(() => onComplete({ provider: "claude-code", existing: true, model: authStatus.model }), 1000);
      return;
    }

    // Spawn Claude Code login terminal
    setSubStep("oauth");
    setOauthStatus("Opening Claude Code login terminal...");

    try {
      const result = await spawnClaudeCodeLogin((status) => {
        setOauthStatus(status);
      });

      if (result.success) {
        setMessage(`Claude Code connected! User: ${result.user || "Pro/Max"}`);
        setTimeout(() => onComplete({ provider: "claude-code", method: "cli", model: result.model }), 1500);
      } else {
        setMessage(`Login failed: ${result.error}`);
        setOauthStatus("You can try browser OAuth instead");
        setTimeout(() => {
          setSubStep("select");
          setSelectedProvider(1); // Fall back to browser OAuth
        }, 2000);
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
      setSubStep("select");
    }
  };

  // Handle Claude OAuth flow (browser)
  const handleClaudeOAuth = async () => {
    setSubStep("oauth");
    setOauthStatus("Starting browser OAuth flow...");

    try {
      const result = await startClaudeOAuth((status) => {
        setOauthStatus(status);
      });

      if (result.success) {
        if (result.method === "oauth") {
          setMessage("Claude Pro/Max connected via browser OAuth!");
        } else if (result.method === "api_key_via_oauth") {
          // Save the API key to env
          saveApiKeyToEnv("anthropic", result.apiKey);
          setMessage("Claude API key created successfully!");
        }
        setTimeout(() => onComplete({ provider: "claude-oauth", method: result.method }), 1500);
      } else {
        // OAuth failed - offer to fall back to API key
        setMessage(`OAuth failed: ${result.error}`);
        setOauthStatus("Falling back to API key...");
        setTimeout(() => {
          setSubStep("api-key");
          setSelectedProvider(4); // Select "Claude API" option
          openProviderKeyPage("anthropic");
          if (useInlineKeyEntry) {
            setMessage("Paste your Anthropic API key below.");
          } else {
            createApiKeyFile("anthropic");
            setMessage("Opening Anthropic console...");
            setTimeout(() => openApiKeyInEditor(), 500);
          }
        }, 2000);
      }
    } catch (error) {
      setMessage(`OAuth error: ${error.message}`);
      setSubStep("select");
    }
  };

  // Handle Codex OAuth flow
  const handleCodexOAuth = async () => {
    setSubStep("oauth");
    setOauthStatus("Starting Codex login...");

    try {
      const result = await startCodexOAuth((status) => {
        setOauthStatus(status);
      });

      if (result.success) {
        setMessage("OpenAI Codex (Pro/Max) connected! Codex (latest) ready.");
        setTimeout(() => onComplete({ provider: "openai-codex", method: result.method }), 1500);
      } else {
        setMessage(`Codex login: ${result.error}`);
        setOauthStatus("");
        setTimeout(() => {
          setSubStep("select");
        }, 2000);
      }
    } catch (error) {
      setMessage(`Codex error: ${error.message}`);
      setSubStep("select");
    }
  };

  // Execute setup for a provider
  const executeProviderSetup = (provider) => {
    if (provider.id === "claude-code") {
      // Claude Code CLI - spawn terminal for login
      handleClaudeCodeLogin();
    } else if (provider.id === "claude-oauth") {
      // Claude Pro/Max - open browser for OAuth
      handleClaudeOAuth();
    } else if (provider.id === "openai-codex") {
      // OpenAI Codex - open browser for OAuth
      handleCodexOAuth();
    } else if (provider.id === "google" && provider.optional) {
      // Google is optional - can skip
      onComplete({ provider: provider.id, skipped: true });
    } else {
      // API key flow for other providers
      setSubStep("api-key");
      openProviderKeyPage(provider.id);
      if (useInlineKeyEntry) {
        setMessage(`Paste your ${provider.label} API key below.`);
      } else {
        createApiKeyFile(provider.id);
        setMessage(`Opening ${provider.label} API key page...`);
        setTimeout(() => openApiKeyInEditor(), 500);
        fileWatcherRef.current = watchApiKeyFile(async (key) => {
          const saveResult = saveApiKeyToEnv(provider.id, key);
          cleanupApiKeyFile();
          if (!saveResult.success) {
            setMessage(`Save failed: ${saveResult.error}`);
            setSubStep("api-key");
            return;
          }
          setMessage(`API key saved to ${saveResult.envKey}`);
          setSubStep("success");
          onComplete({ provider: provider.id });
          setTimeout(() => {
            setActivePanel("sub");
            setSubStep("select");
          }, 3000);

          try {
            const result = await validateApiKey(provider.id, key);
            if (!result.valid) {
              setMessage(`Key saved, but validation failed: ${result.error}`);
            }
          } catch (error) {
            setMessage(`Key saved, but validation failed: ${error.message}`);
          }
        });
      }
    }
  };

  useInput((input, key) => {
    if (subStep === "api-key" && useInlineKeyEntry) {
      return;
    }
    if (subStep === "oauth") {
      return;
    }
    if (subStep === "select") {
      const isInProviderMode = activePanel === "sub";

      // Up/Down navigation - ONLY when in provider selection mode
      if (isInProviderMode) {
        if (key.upArrow) {
          setSelectedProvider((p) => (p - 1 + MODEL_OPTIONS.length) % MODEL_OPTIONS.length);
          return;
        }
        if (key.downArrow) {
          setSelectedProvider((p) => (p + 1) % MODEL_OPTIONS.length);
          return;
        }
      }

      // Enter or Right arrow - enter provider selection mode (or execute if already in)
      if (key.return || key.rightArrow) {
        if (!isInProviderMode) {
          // Enter provider selection mode
          setActivePanel("sub");
        } else {
          // Execute setup for selected provider
          const provider = MODEL_OPTIONS[selectedProvider];
          executeProviderSetup(provider);
        }
        return;
      }

      // Escape or Left arrow - exit provider selection mode
      if (key.escape || key.leftArrow) {
        if (isInProviderMode) {
          setActivePanel("main");
        }
        return;
      }
    } else if (subStep === "pro-check") {
      if (key.return) {
        const provider = MODEL_OPTIONS[selectedProvider];
        if (proCheckTimeoutRef.current) {
          clearTimeout(proCheckTimeoutRef.current);
          proCheckTimeoutRef.current = null;
        }
        setSubStep("api-key");
        openProviderKeyPage(provider.id);
        if (useInlineKeyEntry) {
          setMessage("Paste your OpenAI API key below.");
        } else {
          createApiKeyFile(provider.id);
          setMessage("Opening API keys...");
          setTimeout(() => openApiKeyInEditor(), 500);
        }
      }
    }
  });

  useEffect(() => {
    const lockNeeded = subStep !== "select" || activePanel === "sub";
    if (onNavigationLockChange) {
      onNavigationLockChange(lockNeeded);
    }
  }, [subStep, activePanel, onNavigationLockChange]);

  // Cleanup watcher on unmount
  useEffect(() => {
    return () => {
      if (fileWatcherRef.current) {
        fileWatcherRef.current.close();
      }
      if (proCheckTimeoutRef.current) {
        clearTimeout(proCheckTimeoutRef.current);
      }
    };
  }, []);

  if (subStep === "select") {
    const isInOptionsMode = activePanel === "sub";

    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "AI Model"),
      isInOptionsMode
        ? e(Text, { color: "#f97316", marginBottom: 1 }, "[Up/Down] Select Provider  Enter Confirm  Esc Back")
        : e(Text, { color: "#64748b", marginBottom: 1 }, "Press Enter to select a provider"),

      // Single box with orange border when in options mode
      e(
        Box,
        {
          flexDirection: "column",
          borderStyle: "single",
          borderColor: isInOptionsMode ? "#f97316" : "#334155",
          paddingX: 1,
          paddingY: 0
        },

        // Provider list (use cached modelStatus to avoid expensive sync calls)
        ...(statusLoading
          ? [e(Text, { key: "loading", color: "#f59e0b" }, "Loading providers...")]
          : MODEL_OPTIONS.map((opt, i) => {
              const status = modelStatus[opt.id] || {};
              const isConnected = status.connected;
              const connectionLabel = status.label;
              const isSelected = i === selectedProvider;

              // Special handling for Claude Code CLI
              const isCLI = opt.cli;
              let labelColor = "#22c55e";
              if (isCLI && connectionLabel === "Not Installed") {
                labelColor = "#ef4444"; // Red for not installed
              } else if (isCLI && connectionLabel === "Not Logged In") {
                labelColor = "#f59e0b"; // Orange for installed but not logged in
              }

              return e(
                Box,
                { key: opt.id, flexDirection: "row", gap: 1 },
                // Selection arrow
                e(Text, { color: isSelected ? "#f97316" : "#1e293b" },
                  isSelected ? ">" : " "
                ),
                // Status dot
                e(Text, { color: isConnected ? "#22c55e" : "#475569" },
                  isConnected ? "*" : "o"
                ),
                // Label
                e(Text, {
                  color: isConnected ? "#22c55e" : (isSelected ? "#e2e8f0" : "#94a3b8"),
                  bold: isSelected
                }, opt.label),
                // Recommended badge for first/best option
                opt.recommended && !isConnected && e(Text, { color: "#f59e0b", bold: true }, " (Recommended)"),
                // Connection type label (API Key, Logged In, etc.)
                connectionLabel && e(Text, { color: labelColor, dimColor: !isConnected }, ` (${connectionLabel})`)
              );
            }))
      )
    );
  }

  if (subStep === "oauth") {
    const currentProvider = MODEL_OPTIONS[selectedProvider];
    const isCLI = currentProvider?.cli;

    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, `${currentProvider.label} Login`),
      e(Text, { color: "#f97316" }, oauthStatus || "Starting..."),
      message && e(Text, { color: message.includes("failed") || message.includes("error") || message.includes("not installed") ? "#ef4444" : "#22c55e" }, message),
      isCLI
        ? e(
            Box,
            { flexDirection: "column", marginTop: 1 },
            e(Text, { color: "#64748b", dimColor: true }, "A terminal window will open for Claude Code login."),
            e(Text, { color: "#64748b", dimColor: true }, "Complete the login in the terminal, then return here.")
          )
        : e(
            Box,
            { flexDirection: "column", marginTop: 1 },
            e(Text, { color: "#64748b", dimColor: true }, "A browser window will open for you to log in."),
            e(Text, { color: "#64748b", dimColor: true }, "After logging in, you'll be redirected back automatically.")
          )
    );
  }

  if (subStep === "validating") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Validating API Key"),
      e(Text, { color: "#f97316" }, message || "Validating..."),
      e(Text, { color: "#64748b", dimColor: true }, "Please wait")
    );
  }

  if (subStep === "success") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "API Key Saved"),
      e(Text, { color: "#22c55e" }, message || "API key validated!"),
      e(Text, { color: "#64748b", dimColor: true }, "Returning to providers...")
    );
  }

  if (subStep === "api-key" && useInlineKeyEntry) {
    const provider = MODEL_OPTIONS[selectedProvider];
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, `${provider.label} API Key`),
      e(Text, { color: "#64748b" }, message || "Paste your API key below"),
      e(TextInput, {
        value: apiKeyInput,
        onChange: setApiKeyInput,
        mask: "*",
        onSubmit: async (value) => {
          const saveResult = saveApiKeyToEnv(provider.id, value);
          if (!saveResult.success) {
            setMessage(`Save failed: ${saveResult.error}`);
            setSubStep("api-key");
            return;
          }
          setMessage(`API key saved to ${saveResult.envKey}`);
          setSubStep("success");
          onComplete({ provider: provider.id });
          setTimeout(() => {
            setApiKeyInput("");
            setActivePanel("sub");
            setSubStep("select");
          }, 3000);

          try {
            const result = await validateApiKey(provider.id, value);
            if (!result.valid) {
              setMessage(`Key saved, but validation failed: ${result.error}`);
            }
          } catch (error) {
            setMessage(`Key saved, but validation failed: ${error.message}`);
          }
        }
      }),
      e(Text, { color: "#64748b", dimColor: true }, "Press Enter to validate")
    );
  }

  if (subStep === "pro-check") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "OpenAI Pro/Max Check"),
      e(Text, { color: "#f97316" }, message || "Opening ChatGPT..."),
      e(Text, { color: "#64748b" }, "If you have Pro/Max, keep the ChatGPT tab open."),
      e(Text, { color: "#64748b" }, "We will open API keys in 4 seconds."),
      e(Text, { color: "#94a3b8" }, "Press Enter to open API keys now")
    );
  }

  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#e2e8f0", bold: true }, `Setting up ${MODEL_OPTIONS[selectedProvider].label}`),
    e(Text, { color: "#64748b" }, message),
    subStep === "api-key" && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: "#94a3b8" }, "1. Browser opened to get your API key"),
      e(Text, { color: "#94a3b8" }, "2. Notepad opened - paste key there and save"),
      e(Text, { color: "#f97316" }, "Waiting for API key...")
    ),
    subStep === "validating" && e(Text, { color: "#f97316" }, "Validating...")
  );
};

/**
 * Mobile App Step Component
 * Shows QR code to install BACKBONE PWA on phone for push notifications
 * Optional step - user can skip
 */
const MobileAppStep = ({ onComplete, onSkip, onError }) => {
  const [qrLines, setQrLines] = useState(null);
  const [status, setStatus] = useState("ready"); // ready, done

  const pwaUrl = "https://backboneai.web.app";

  // Generate QR code on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qrcode = await import("qrcode-terminal");
        const code = await new Promise((resolve) => {
          qrcode.default.generate(pwaUrl, { small: true }, (qr) => resolve(qr));
        });
        if (!cancelled) {
          const lines = code.split("\n");
          while (lines.length && lines[0].trim() === "") lines.shift();
          while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
          setQrLines(lines);
        }
      } catch {
        if (!cancelled) {
          setQrLines(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useInput((input, key) => {
    const lower = input.toLowerCase();
    if (lower === "s") {
      onSkip();
      return;
    }
    if (key.return) {
      updateSetting("mobileAppInstalled", true);
      onComplete({ installed: true });
      return;
    }
  });

  if (status === "done") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#22c55e", bold: true }, "\u2713 Mobile App Configured")
    );
  }

  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#e2e8f0", bold: true }, "Install BACKBONE on Your Phone"),

    // QR code (render early to avoid top clipping in small terminals)
    ...(qrLines
      ? qrLines.map((line, i) =>
          e(Text, { key: `qr-${i}`, color: "#ffffff" }, line)
        )
      : [e(Text, { key: "qr-loading", color: "#64748b" }, "Generating QR code...")]
    ),

    e(Text, { color: "#f97316" }, `URL: ${pwaUrl}`),
    e(Text, { color: "#94a3b8" }, "Steps: open link, sign in, enable notifications, add to home screen."),
    e(
      Box,
      { flexDirection: "row", gap: 2 },
      e(Text, { color: "#22c55e" }, "[Enter] Done"),
      e(Text, { color: "#64748b" }, "[S] Skip")
    )
  );
};

/**
 * Core Goals Step Component
 * User describes what matters to them - beliefs, goals, ideology
 * Minimum 40 words required
 * Auto-saves as user types (new entry) or requires Enter to save (editing)
 */
const CoreGoalsStep = ({ onComplete, onError }) => {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saveStatus, setSaveStatus] = useState(""); // "", "saving", "saved"
  const loadedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const saveTimeoutRef = useRef(null);
  const lastSavedRef = useRef("");

  // Keep onComplete ref updated
  onCompleteRef.current = onComplete;

  // Load existing core goals ONCE on mount only
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const settings = loadUserSettings();
    if (settings.coreGoals) {
      setText(settings.coreGoals);
      lastSavedRef.current = settings.coreGoals;
      // Auto-complete if already has 40+ words
      const existingWordCount = settings.coreGoals.trim().split(/\s+/).filter(w => w.length > 0).length;
      if (existingWordCount >= 40) {
        setTimeout(() => onCompleteRef.current({ coreGoals: settings.coreGoals, existing: true }), 800);
      }
    }
  }, []);

  // Cleanup save timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const wordsNeeded = Math.max(0, 40 - wordCount);
  const isValid = wordCount >= 40;

  // Debounced auto-save (1000ms after typing stops)
  const debouncedSave = useCallback((newText) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Only save if text actually changed
    if (newText === lastSavedRef.current) return;

    saveTimeoutRef.current = setTimeout(() => {
      if (newText && newText !== lastSavedRef.current) {
        setSaveStatus("saving");
        updateSetting("coreGoals", newText);
        lastSavedRef.current = newText;
        setSaveStatus("saved");
        // Clear "saved" status after 2 seconds
        setTimeout(() => setSaveStatus(""), 2000);
      }
    }, 1000);
  }, []);

  // Text change handler - update state and trigger debounced save
  const handleTextChange = useCallback((newText) => {
    setText(newText);
    debouncedSave(newText);
  }, [debouncedSave]);

  // Handle submit via TextInput's onSubmit
  const handleSubmit = useCallback(() => {
    if (!isValid) return;
    // Clear any pending debounced save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setSubmitted(true);
    updateSetting("coreGoals", text);
    setTimeout(() => onCompleteRef.current({ coreGoals: text }), 500);
  }, [isValid, text]);

  if (submitted) {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#22c55e", bold: true }, "Core Goals Saved!"),
      e(Text, { color: "#94a3b8" }, "The AI will use this to guide its actions on your behalf.")
    );
  }

  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#e2e8f0", bold: true }, "Core Goals"),
    e(Text, { color: "#94a3b8" },
      "Describe what matters to you - your beliefs, goals, values, and priorities."
    ),
    e(Text, { color: "#94a3b8" },
      "The AI uses this to help with finances, projects, health, and decisions."
    ),
    e(Box, { marginTop: 1 }),
    e(
      Box,
      {
        borderStyle: "single",
        borderColor: isValid ? "#22c55e" : "#f97316",
        paddingX: 1,
        width: 65
      },
      e(TextInput, {
        value: text,
        onChange: handleTextChange,
        onSubmit: handleSubmit,
        placeholder: "Type what matters to you..."
      })
    ),
    e(Box, { marginTop: 1, flexDirection: "row", gap: 2 },
      e(Text, { color: isValid ? "#22c55e" : "#f59e0b" },
        `Words: ${wordCount}/40`
      ),
      !isValid && e(Text, { color: "#f59e0b" }, `(${wordsNeeded} more needed)`),
      isValid && e(Text, { color: "#22c55e" }, "Ready!"),
      saveStatus === "saving" && e(Text, { color: "#f59e0b", dimColor: true }, " Saving..."),
      saveStatus === "saved" && e(Text, { color: "#22c55e", dimColor: true }, " Saved")
    ),
    // Instructions
    e(Text, { color: isValid ? "#22c55e" : "#64748b" },
      isValid ? "Press Enter to continue" : "Write at least 40 words to continue"
    )
  );
};

/**
 * LinkedIn Profile Step Component
 * Optional - allows user to connect their LinkedIn profile
 */
const LinkedInStep = ({ onComplete, onSkip, onError }) => {
  const [status, setStatus] = useState("ready"); // ready, connecting, connected, error
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState(null); // Full profile data

  // Load existing LinkedIn data if any (from linkedin-profile.json)
  useEffect(() => {
    const loadExisting = async () => {
      try {
        const fs = await import("fs");
        const { dataFile } = await import("../services/paths.js");
        const profilePath = dataFile("linkedin-profile.json");
        if (fs.default.existsSync(profilePath)) {
          const profileData = JSON.parse(fs.default.readFileSync(profilePath, "utf-8"));
          if (profileData.success && profileData.profileUrl) {
            setProfile(profileData);
            setStatus("connected");
            // Save to settings for consistency
            updateSetting("linkedInUrl", profileData.profileUrl);
            updateSetting("linkedInName", profileData.profile?.name || "");
            updateSetting("connections", { ...loadUserSettings().connections, linkedin: true });
          }
        }
      } catch {}
    };

    loadExisting();
  }, []);

  const handleConnect = useCallback(async () => {
    setStatus("connecting");
    setMessage("Opening browser to LinkedIn...");

    try {
      const result = await scrapeLinkedInProfile({ headless: false });

      if (result && result.success && result.profileUrl) {
        setProfile(result);
        updateSetting("linkedInUrl", result.profileUrl);
        updateSetting("linkedInName", result.profile?.name || "");
        updateSetting("connections", { ...loadUserSettings().connections, linkedin: true });
        setStatus("connected");
        setMessage("Profile captured!");
      } else {
        setStatus("error");
        setMessage(result?.error || "Could not capture profile. Try again or skip.");
      }
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Failed to connect. Try again or skip.");
    }
  }, []);

  useInput((input, key) => {
    if (status === "connecting") return;

    const lower = input.toLowerCase();

    if (lower === "s" && status !== "connected") {
      onSkip();
      return;
    }

    // Update profile (U key when connected)
    if (lower === "u" && status === "connected") {
      handleConnect();
      return;
    }

    // Continue to next step (Enter when connected)
    if (key.return && status === "connected") {
      onComplete({ linkedInUrl: profile?.profileUrl, profile: profile?.profile, existing: true });
      return;
    }

    if (key.return && status === "ready") {
      handleConnect();
      return;
    }

    if (key.return && status === "error") {
      setStatus("ready");
      setMessage("");
      return;
    }
  });

  if (status === "connected" && profile) {
    const p = profile.profile || {};
    const skills = p.skills?.slice(0, 3) || [];
    const capturedDate = profile.capturedAt ? new Date(profile.capturedAt).toLocaleDateString() : "";

    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#22c55e", bold: true }, "LinkedIn Connected"),
      e(Box, { marginTop: 1 }),
      // Name
      p.name && e(Text, { color: "#e2e8f0", bold: true }, p.name),
      // Headline/Title
      p.headline && e(Text, { color: "#94a3b8" }, p.headline),
      // Current role & company
      (p.currentRole || p.currentCompany) && e(Text, { color: "#64748b" },
        [p.currentRole, p.currentCompany].filter(Boolean).join(" at ")
      ),
      // Location
      p.location && e(Text, { color: "#64748b", dimColor: true }, p.location),
      // Skills
      skills.length > 0 && e(Box, { marginTop: 1 },
        e(Text, { color: "#64748b" }, "Skills: "),
        e(Text, { color: "#94a3b8" }, skills.join(", "))
      ),
      // Last updated & cron info
      e(Box, { marginTop: 1 }),
      capturedDate && e(Text, { color: "#64748b", dimColor: true }, `Last updated: ${capturedDate}`),
      e(Text, { color: "#3b82f6", dimColor: true }, "Auto-updates weekly (Mondays 9 AM)"),
      // Actions
      e(Box, { marginTop: 1 }),
      e(Text, { color: "#22c55e" }, "Enter Continue  "),
      e(Text, { color: "#f59e0b" }, "U Update Now")
    );
  }

  if (status === "connecting") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "LinkedIn Profile (Optional)"),
      e(Text, { color: "#f59e0b" }, message || "Opening browser..."),
      e(Box, { marginTop: 1 }),
      e(Text, { color: "#94a3b8" }, "1. Browser will open to LinkedIn"),
      e(Text, { color: "#94a3b8" }, "2. Log in if prompted"),
      e(Text, { color: "#94a3b8" }, "3. Your profile URL will be captured automatically"),
      e(Box, { marginTop: 1 }),
      e(Text, { color: "#64748b", dimColor: true }, "Please wait...")
    );
  }

  if (status === "error") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "LinkedIn Profile (Optional)"),
      e(Text, { color: "#ef4444" }, message),
      e(Box, { marginTop: 1 }),
      e(Text, { color: "#64748b" }, "Press Enter to try again"),
      e(Text, { color: "#64748b", dimColor: true }, "Press S to skip")
    );
  }

  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#e2e8f0", bold: true }, "LinkedIn Profile (Optional)"),
    e(Text, { color: "#94a3b8" },
      "Connect your LinkedIn to help the AI understand your professional background."
    ),
    e(Box, { marginTop: 1 }),
    e(Text, { color: "#94a3b8" }, "A browser will open and navigate to your LinkedIn profile."),
    e(Text, { color: "#94a3b8" }, "Log in if needed - your profile will be captured automatically."),
    e(Box, { marginTop: 1 }),
    e(Text, { color: "#3b82f6", dimColor: true }, "Auto-updates weekly (Mondays 9 AM)"),
    e(Box, { marginTop: 1 }),
    e(Text, { color: "#22c55e" }, "Press Enter to connect"),
    e(Text, { color: "#64748b", dimColor: true }, "Press S to skip")
  );
};

/**
 * Alpaca Setup Step Component
 */
const AlpacaSetupStep = ({ onComplete, onSkip, onError }) => {
  const [status, setStatus] = useState("ready");
  const [message, setMessage] = useState("Press Enter to set up trading, or S to skip");

  useInput(async (input, key) => {
    if (status !== "ready") return;

    if (input.toLowerCase() === "s") {
      onSkip();
      return;
    }

    if (key.return) {
      setStatus("loading");
      setMessage("Opening Alpaca setup...");

      // Open Alpaca dashboard and keys file
      await openAlpacaForKeys("paper");
      await openAlpacaKeysFile("paper");

      setMessage("Paste your Alpaca keys in the file and save");
      setStatus("waiting");
    }
  });

  // Check for existing configuration
  useEffect(() => {
    const config = loadAlpacaConfig();
    if (config.apiKey && config.apiSecret && !config.apiKey.includes("PASTE")) {
      setStatus("success");
      setMessage("Alpaca already configured!");
      setTimeout(() => onComplete({ existing: true }), 1000);
    }
  }, [onComplete]);

  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#e2e8f0", bold: true }, "Trading Setup (Alpaca)"),
    e(Text, { color: status === "error" ? "#ef4444" : "#64748b" }, message),
    status === "waiting" && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: "#94a3b8" }, "1. Create account at alpaca.markets"),
      e(Text, { color: "#94a3b8" }, "2. Get API keys from Paper Trading"),
      e(Text, { color: "#94a3b8" }, "3. Paste in the opened file and save"),
      e(Text, { color: "#f97316" }, "Waiting for keys...")
    ),
    status === "success" && e(Text, { color: "#22c55e" }, "\u2713 Connected!")
  );
};

/**
 * Oura Ring Setup Step Component
 */
const OuraSetupStep = ({ onComplete, onSkip, onError }) => {
  const [status, setStatus] = useState("ready"); // ready, waiting, validating, success, error
  const [message, setMessage] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const fileWatcherRef = useRef(null);
  const useInlineEntry = isModernTerminal();

  // Check if already configured
  useEffect(() => {
    if (isOuraConfigured()) {
      setStatus("success");
      setMessage("Oura Ring already connected!");
      setTimeout(() => onComplete({ existing: true }), 1000);
    }
  }, [onComplete]);

  const startSetup = useCallback(() => {
    setStatus("waiting");
    openOuraTokenPage();

    if (useInlineEntry) {
      setMessage("Paste your Personal Access Token below.");
    } else {
      createOuraSetupFile();
      setMessage("Opening Oura token page...");
      setTimeout(() => openOuraSetupInEditor(), 500);

      // Watch for file changes
      fileWatcherRef.current = watchOuraSetupFile(async (token) => {
        setStatus("validating");
        setMessage("Validating token...");

        const result = await validateOuraToken(token);
        if (result.valid) {
          saveOuraToken(token);
          cleanupOuraSetupFile();
          setStatus("success");
          setMessage("Oura Ring connected!");

          // Sync initial data
          await syncOuraData();
          setTimeout(() => onComplete({ user: result.user }), 1000);
        } else {
          setStatus("waiting");
          setMessage(`Invalid token: ${result.error}. Try again.`);
        }
      });
    }
  }, [onComplete, useInlineEntry]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fileWatcherRef.current) {
        fileWatcherRef.current.close();
      }
    };
  }, []);

  useInput((input, key) => {
    if (status === "waiting" && useInlineEntry) return; // Let TextInput handle input

    const lower = input.toLowerCase();
    if (lower === "s") {
      onSkip();
      return;
    }

    if (key.return) {
      if (status === "ready" || status === "error") {
        startSetup();
      }
    }
  });

  if (status === "success") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#22c55e", bold: true }, "\u2713 Oura Ring Connected"),
      e(Text, { color: "#e2e8f0" }, message)
    );
  }

  if (status === "validating") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Oura Ring Setup"),
      e(Text, { color: "#f97316" }, "Validating token..."),
      e(Text, { color: "#64748b", dimColor: true }, "Please wait")
    );
  }

  if (status === "waiting" && useInlineEntry) {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Oura Ring Setup"),
      e(Text, { color: "#64748b" }, message || "Paste your Personal Access Token"),
      e(TextInput, {
        value: tokenInput,
        onChange: setTokenInput,
        mask: "*",
        onSubmit: async (value) => {
          setStatus("validating");
          setMessage("Validating token...");
          const result = await validateOuraToken(value);
          if (result.valid) {
            saveOuraToken(value);
            setStatus("success");
            setMessage("Oura Ring connected!");
            await syncOuraData();
            setTimeout(() => onComplete({ user: result.user }), 1000);
          } else {
            setStatus("waiting");
            setMessage(`Invalid token: ${result.error}. Try again.`);
          }
        }
      }),
      e(Text, { color: "#64748b", dimColor: true }, "Press Enter to validate, S to skip")
    );
  }

  if (status === "waiting") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Oura Ring Setup"),
      e(Text, { color: "#f97316" }, message),
      e(Text, { color: "#64748b" }, "1. Create a Personal Access Token on the Oura page"),
      e(Text, { color: "#64748b" }, "2. Paste it in the text file that opened"),
      e(Text, { color: "#64748b" }, "3. Save the file"),
      e(Text, { color: "#64748b", dimColor: true }, "Press S to skip")
    );
  }

  // Ready state
  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#e2e8f0", bold: true }, "Oura Ring (Optional)"),
    e(Text, { color: "#64748b" }, "Connect your Oura Ring for health tracking"),
    e(Text, { color: "#64748b" }, "Sleep, readiness, and activity data"),
    e(Text, { color: "#f97316" }, "\u25B6 Press Enter to connect Oura Ring"),
    e(Text, { color: "#64748b", dimColor: true }, "Press S to skip")
  );
};

/**
 * Email & Calendar Setup Step Component
 * Supports Google (Gmail/Calendar) and Microsoft (Outlook/Calendar)
 */
const EmailCalendarSetupStep = ({ onComplete, onSkip, onError }) => {
  const [status, setStatus] = useState("ready"); // ready, select, connecting, success, error
  const [selectedProvider, setSelectedProvider] = useState(0);
  const [message, setMessage] = useState("");
  const [connectedProviders, setConnectedProviders] = useState(() => getConfiguredProviders());

  const PROVIDERS_LIST = [
    { id: "google", label: "Google", description: "Gmail & Google Calendar" }
  ];

  // Check if already configured
  useEffect(() => {
    const configured = getConfiguredProviders();
    if (configured.length > 0) {
      setConnectedProviders(configured);
      if (configured.length === 2) {
        setStatus("success");
        setMessage("Both providers already connected!");
        setTimeout(() => onComplete({ providers: configured }), 1000);
      }
    }
  }, [onComplete]);

  const connectProvider = useCallback(async (provider) => {
    setStatus("connecting");
    setMessage(`Connecting to ${provider === "google" ? "Google" : "Microsoft"}...`);

    try {
      const result = await startOAuthFlow(provider);
      if (result.success) {
        const newProviders = [...new Set([...connectedProviders, provider])];
        setConnectedProviders(newProviders);
        setMessage(`${provider === "google" ? "Google" : "Microsoft"} connected!`);

        // Sync data
        await syncEmailCalendar();

        setStatus("success");
        setTimeout(() => onComplete({ providers: newProviders }), 1500);
      }
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Connection failed");
      if (onError) onError(err.message);
    }
  }, [connectedProviders, selectedProvider, onComplete, onError]);

  useInput((input, key) => {
    const lower = input.toLowerCase();

    if (lower === "s") {
      onSkip();
      return;
    }

    if (status === "ready") {
      if (key.return) {
        setStatus("select");
      }
    } else if (status === "select") {
      if (key.upArrow) {
        setSelectedProvider((p) => (p - 1 + PROVIDERS_LIST.length) % PROVIDERS_LIST.length);
      } else if (key.downArrow) {
        setSelectedProvider((p) => (p + 1) % PROVIDERS_LIST.length);
      } else if (key.return) {
        const provider = PROVIDERS_LIST[selectedProvider];
        connectProvider(provider.id);
      } else if (lower === "g") {
        connectProvider("google");
      } else if (key.escape) {
        setStatus("ready");
      }
    } else if (status === "error") {
      if (key.return) {
        setStatus("select");
        setMessage("");
      }
    }
  });

  if (status === "success") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#22c55e", bold: true }, "\u2713 Email & Calendar Connected"),
      e(Text, { color: "#e2e8f0" }, message),
      connectedProviders.map(p =>
        e(Text, { key: p, color: "#64748b" }, `  \u2022 ${p === "google" ? "Google" : "Microsoft"}`)
      )
    );
  }

  if (status === "connecting") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Email & Calendar Setup"),
      e(Text, { color: "#f97316" }, message || "Connecting..."),
      e(Text, { color: "#64748b" }, "Complete sign-in in your browser..."),
      e(Text, { color: "#64748b", dimColor: true }, "Waiting for authorization...")
    );
  }

  if (status === "error") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Email & Calendar Setup"),
      e(Text, { color: "#ef4444" }, message),
      e(Text, { color: "#64748b" }, "Press Enter to try again, S to skip")
    );
  }

  if (status === "select") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Select Provider"),
      e(Text, { color: "#64748b" }, "Choose which email/calendar to connect:"),
      ...PROVIDERS_LIST.map((provider, i) =>
        e(
          Box,
          { key: provider.id, flexDirection: "row", gap: 1 },
          e(Text, { color: i === selectedProvider ? "#f97316" : "#64748b" }, i === selectedProvider ? "\u25B6" : " "),
          e(Text, { color: i === selectedProvider ? "#e2e8f0" : "#94a3b8", bold: i === selectedProvider }, provider.label),
          e(Text, { color: "#64748b", dimColor: true }, `- ${provider.description}`),
          connectedProviders.includes(provider.id) && e(Text, { color: "#22c55e" }, " \u2713")
        )
      ),
      e(Text, { color: "#64748b", dimColor: true }, "Use arrows or G, Enter to connect, Esc to go back")
    );
  }

  // Ready state
  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#e2e8f0", bold: true }, "Email & Calendar (Optional)"),
    e(Text, { color: "#64748b" }, "Connect your email and calendar"),
    e(Text, { color: "#64748b" }, "Supports Google"),
    connectedProviders.length > 0 && e(
      Box,
      { flexDirection: "column" },
      e(Text, { color: "#22c55e" }, "Already connected:"),
      connectedProviders.map(p =>
        e(Text, { key: p, color: "#64748b" }, `  \u2022 ${p === "google" ? "Google" : "Microsoft"}`)
      )
    ),
    e(Text, { color: "#f97316" }, "\u25B6 Press Enter to choose a provider"),
    e(Text, { color: "#64748b", dimColor: true }, "Press S to skip")
  );
};

/**
 * Personal Capital (Empower) Setup Step Component
 * Connects to Personal Capital for net worth and portfolio tracking
 *
 * Note: Personal Capital does NOT have a public OAuth API.
 * This uses the unofficial personal-capital-sdk which requires email/password.
 * The SDK must be installed: npm install personal-capital-sdk
 */
const PersonalCapitalSetupStep = ({ onComplete, onSkip, onError }) => {
  const [status, setStatus] = useState("ready"); // ready, credentials, authenticating, twoFactor, success, error
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [activeField, setActiveField] = useState("email"); // email, password, twoFactor
  const pcService = useRef(null);
  const useInlineEntry = isModernTerminal();

  // Initialize service - NO auto-complete, always require user action
  useEffect(() => {
    pcService.current = getPersonalCapitalService();
  }, []);

  const handleAuthenticate = useCallback(async () => {
    if (!email || !password) {
      setMessage("Email and password required");
      return;
    }

    setStatus("authenticating");
    setMessage("Connecting to Personal Capital...");

    // Set credentials in process.env for the SDK
    process.env.PERSONAL_CAPITAL_EMAIL = email;
    process.env.PERSONAL_CAPITAL_PASSWORD = password;

    try {
      // Initialize the SDK client
      await pcService.current.initClient();

      // Authenticate with Personal Capital
      const result = await pcService.current.authenticate();

      if (result.success) {
        setMessage("Fetching your account data...");

        // Fetch actual financial data to verify connection works
        const fetchResult = await pcService.current.fetchAll();

        if (fetchResult.success || fetchResult.accounts?.success) {
          const displayData = pcService.current.getDisplayData();
          if (displayData.accountCount > 0) {
            setStatus("success");
            setMessage(`Connected! Found ${displayData.accountCount} accounts`);
            setTimeout(() => onComplete({ success: true, accountCount: displayData.accountCount }), 1500);
          } else {
            setStatus("error");
            setMessage("Authenticated but no accounts found. Check your Personal Capital account has linked accounts.");
          }
        } else {
          setStatus("error");
          const errorMsg = fetchResult.errors?.length > 0 ? fetchResult.errors.join(", ") : "Failed to fetch account data";
          setMessage(errorMsg);
        }
      } else if (result.needsTwoFactor) {
        setStatus("twoFactor");
        setMessage("Check your phone for the verification code");
      } else {
        setStatus("error");
        setMessage(result.message || "Authentication failed. Check your credentials.");
      }
    } catch (err) {
      setStatus("error");
      if (err.message?.includes("ERR_MODULE_NOT_FOUND") || err.message?.includes("personal-capital-sdk")) {
        setMessage("SDK not installed. Run: npm install personal-capital-sdk");
      } else {
        setMessage(err.message || "Connection failed");
      }
      if (onError) onError(err.message);
    }
  }, [email, password, onComplete, onError]);

  const handleTwoFactor = useCallback(async () => {
    if (!twoFactorCode || twoFactorCode.length < 4) {
      setMessage("Please enter the verification code");
      return;
    }

    setStatus("authenticating");
    setMessage("Verifying code...");

    try {
      const result = await pcService.current.completeTwoFactor(twoFactorCode);

      if (result.success) {
        setMessage("Fetching your account data...");
        const fetchResult = await pcService.current.fetchAll();

        if (fetchResult.success || fetchResult.accounts?.success) {
          const displayData = pcService.current.getDisplayData();
          if (displayData.accountCount > 0) {
            setStatus("success");
            setMessage(`Connected! Found ${displayData.accountCount} accounts`);
            setTimeout(() => onComplete({ success: true, accountCount: displayData.accountCount }), 1500);
          } else {
            setStatus("error");
            setMessage("Authenticated but no accounts found.");
          }
        } else {
          setStatus("error");
          setMessage(fetchResult.errors?.join(", ") || "Failed to fetch data");
        }
      } else {
        setStatus("twoFactor");
        setMessage(result.message || "Invalid code, try again");
        setTwoFactorCode("");
      }
    } catch (err) {
      setStatus("error");
      setMessage(err.message);
    }
  }, [twoFactorCode, onComplete]);

  useInput((input, key) => {
    const lower = input.toLowerCase();

    // Skip with S key
    if (lower === "s" && (status === "ready" || status === "credentials" || status === "error")) {
      onSkip();
      return;
    }

    if (status === "ready") {
      if (key.return) {
        setStatus("credentials");
        setActiveField("email");
      }
    } else if (status === "credentials" && !useInlineEntry) {
      if (key.return) {
        if (activeField === "email") {
          setActiveField("password");
        } else if (email && password) {
          handleAuthenticate();
        }
      } else if (key.tab) {
        setActiveField(activeField === "email" ? "password" : "email");
      }
    } else if (status === "twoFactor" && !useInlineEntry) {
      if (key.return && twoFactorCode) {
        handleTwoFactor();
      }
    } else if (status === "error") {
      if (key.return) {
        setStatus("credentials");
        setMessage("");
        setEmail("");
        setPassword("");
      }
    }
  });

  if (status === "success") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#22c55e", bold: true }, "\u2713 Personal Capital Connected"),
      e(Text, { color: "#e2e8f0" }, message)
    );
  }

  if (status === "authenticating") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Connecting to Personal Capital..."),
      e(Text, { color: "#f97316" }, message || "Please wait..."),
      e(Text, { color: "#64748b", dimColor: true }, "This may take a moment")
    );
  }

  if (status === "twoFactor") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Two-Factor Authentication"),
      e(Text, { color: "#f97316" }, message || "Enter the SMS code sent to your phone"),
      e(Box, { marginTop: 1 },
        e(Text, { color: "#64748b" }, "Code: "),
        useInlineEntry
          ? e(TextInput, {
              value: twoFactorCode,
              onChange: setTwoFactorCode,
              onSubmit: handleTwoFactor,
              placeholder: "123456"
            })
          : e(Text, { color: "#e2e8f0" }, twoFactorCode || "(enter code)")
      ),
      e(Text, { color: "#64748b", dimColor: true, marginTop: 1 }, "Press Enter to verify")
    );
  }

  if (status === "error") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Connection Failed"),
      e(Text, { color: "#ef4444" }, message),
      e(Text, { color: "#64748b", marginTop: 1 }, "Press Enter to try again"),
      e(Text, { color: "#64748b", dimColor: true }, "Press S to skip")
    );
  }

  if (status === "credentials") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Personal Capital / Empower Login"),
      e(Text, { color: "#64748b" }, "Enter your credentials to connect"),
      e(Box, { flexDirection: "column", marginTop: 1 },
        e(Box, { flexDirection: "row" },
          e(Text, { color: activeField === "email" ? "#f97316" : "#64748b" }, "Email: "),
          useInlineEntry
            ? e(TextInput, {
                value: email,
                onChange: setEmail,
                placeholder: "your@email.com",
                focus: activeField === "email",
                onSubmit: () => setActiveField("password")
              })
            : e(Text, { color: "#e2e8f0" }, email || "(enter email)")
        ),
        e(Box, { flexDirection: "row", marginTop: 1 },
          e(Text, { color: activeField === "password" ? "#f97316" : "#64748b" }, "Password: "),
          useInlineEntry
            ? e(TextInput, {
                value: password,
                onChange: setPassword,
                mask: "*",
                placeholder: "password",
                focus: activeField === "password",
                onSubmit: handleAuthenticate
              })
            : e(Text, { color: "#e2e8f0" }, password ? "*".repeat(password.length) : "(enter password)")
        )
      ),
      e(Text, { color: "#64748b", dimColor: true, marginTop: 1 }, "Press Enter to connect, S to skip")
    );
  }

  // Ready state - user must press Enter to start
  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#e2e8f0", bold: true }, "Personal Capital / Empower (Optional)"),
    e(Text, { color: "#64748b" }, "Connect to track your net worth and investments"),
    e(Text, { color: "#64748b" }, "Requires your Empower login credentials"),
    e(Text, { color: "#f97316", marginTop: 1 }, "\u25B6 Press Enter to connect"),
    e(Text, { color: "#64748b", dimColor: true }, "Press S to skip this step")
  );
};

/**
 * Personal Wealth (Empower) Disabled Step Component
 * Shows grayed out step with "Coming Soon" message
 */
const BrokeragesSetupStep = ({ onComplete, onSkip, focused, onReleaseFocus }) => {
  const [statuses, setStatuses] = useState(() => {
    try { return getBrokerageStatuses(); } catch { return {}; }
  });
  const [selected, setSelected] = useState(0);
  const [connecting, setConnecting] = useState(null);
  const [message, setMessage] = useState("");
  const brokerageIds = ["empower", "robinhood", "fidelity"];

  useInput((input, key) => {
    if (!focused) return; // parent controls navigation until we're focused
    if (connecting) return;
    if (key.escape || key.leftArrow) { if (onReleaseFocus) onReleaseFocus(); return; }
    if (input.toLowerCase() === "s") { onSkip(); return; }
    if (key.upArrow) { setSelected(prev => Math.max(0, prev - 1)); return; }
    if (key.downArrow) { setSelected(prev => Math.min(brokerageIds.length, prev + 1)); return; }
    // "u" key — update/reconnect an already-connected brokerage
    if (input.toLowerCase() === "u" && selected < brokerageIds.length) {
      const id = brokerageIds[selected];
      const s = statuses[id];
      if (!s?.connected) return; // only update connected ones
      setConnecting(id);
      setMessage(`Updating ${s?.label || id}...`);
      connectBrokerage(id).then(result => {
        setStatuses(getBrokerageStatuses());
        setMessage(result.message);
        setConnecting(null);
      });
      return;
    }
    if (key.return) {
      if (selected === brokerageIds.length) {
        const anyConnected = Object.values(statuses).some(s => s.connected);
        anyConnected ? onComplete({ brokerages: statuses }) : onSkip();
        return;
      }
      const id = brokerageIds[selected];
      const s = statuses[id];
      if (s?.connected && !s?.expired) return;
      setConnecting(id);
      setMessage(`Opening ${s?.label || id} login...`);
      connectBrokerage(id).then(result => {
        setStatuses(getBrokerageStatuses());
        setMessage(result.message);
        setConnecting(null);
      });
    }
  });

  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#f59e0b", bold: true }, "Brokerages"),
    e(Text, { color: "#94a3b8" }, "Connect your brokerage accounts (optional)"),
    e(Box, { marginTop: 1, flexDirection: "column" },
      ...brokerageIds.map((id, i) => {
        const s = statuses[id] || {};
        const icon = s.connected ? "\u2713" : "\u25CB";
        const color = s.connected ? "#22c55e" : "#64748b";
        const isActive = i === selected;
        return e(
          Box,
          { key: id, flexDirection: "row", gap: 1 },
          e(Text, { color: isActive ? "#f59e0b" : "#334155" }, isActive ? "\u25B8" : " "),
          e(Text, { color }, `${icon} ${s.label || id}`),
          e(Text, { color: "#64748b" }, s.connected ? (isActive && focused ? " Connected [U to update]" : " Connected") : isActive && focused ? " [Enter to connect]" : "")
        );
      }),
      e(
        Box,
        { key: "done", flexDirection: "row", gap: 1, marginTop: 1 },
        e(Text, { color: selected === brokerageIds.length ? "#f59e0b" : "#334155" }, selected === brokerageIds.length ? "\u25B8" : " "),
        e(Text, { color: "#22c55e" }, "[Done / Skip]")
      )
    ),
    connecting && e(Box, { marginTop: 1 }, e(Text, { color: "#f59e0b" }, `\u23F3 ${message}`)),
    !connecting && message && e(Text, { color: "#94a3b8", marginTop: 1 }, message),
    focused
      ? e(Text, { color: "#64748b", marginTop: 1 }, "\u2191\u2193 navigate \u00B7 Enter connect \u00B7 U update \u00B7 \u2190 back \u00B7 S skip")
      : e(Text, { color: "#64748b", marginTop: 1 }, "\u2192 or Enter to browse brokerages")
  );
};

/**
 * Plaid Setup Step Component
 * Connects to banks, credit cards, and investments via Plaid
 */
const PlaidSetupStep = ({ onComplete, onSkip, onError }) => {
  const [status, setStatus] = useState("ready"); // ready, connecting, fetching, success, error
  const [message, setMessage] = useState("");
  const plaidService = useRef(null);

  // Initialize service and load config from Firebase
  useEffect(() => {
    plaidService.current = getPlaidService();

    const initService = async () => {
      // Load credentials from Firebase
      await plaidService.current.initFromFirebase();

      // Check if already configured with accounts
      if (plaidService.current.isConfigured()) {
        setStatus("fetching");
        setMessage("Verifying existing connection...");

        const result = await plaidService.current.fetchAccounts();
        if (result.success && result.accounts?.length > 0) {
          setStatus("success");
          const netWorth = plaidService.current.formatCurrency(result.netWorth?.total || 0);
          setMessage(`Connected! ${result.accounts.length} accounts, Net Worth: ${netWorth}`);
          setTimeout(() => onComplete({ existing: true }), 1000);
        } else {
          // Has credentials but no accounts - let user add accounts
          setStatus("ready");
          setMessage("Press Enter to connect your bank accounts.");
        }
      } else if (plaidService.current.hasCredentials()) {
        // Has credentials but no accounts
        setStatus("ready");
        setMessage("Press Enter to connect your bank accounts.");
      }
    };

    initService();
  }, [onComplete]);

  const startSetup = useCallback(async () => {
    // Ensure credentials are loaded from Firebase
    await plaidService.current.initFromFirebase();

    if (!plaidService.current.hasCredentials()) {
      // Keys not configured - show error
      setStatus("error");
      setMessage("Plaid keys not loaded. Check Firebase rules allow read access to config/config_plaid");
      return;
    }
    // Credentials exist - go straight to bank connection
    await startLinkFlow();
  }, []);

  const startLinkFlow = async () => {
    setStatus("connecting");
    setMessage("Opening Plaid Link in your browser...");

    try {
      const result = await plaidService.current.startLinkFlow();

      if (result.success) {
        setStatus("fetching");
        setMessage(`Connected to ${result.institution}! Fetching accounts...`);

        const fetchResult = await plaidService.current.fetchAccounts();

        if (fetchResult.success) {
          setStatus("success");
          const netWorth = plaidService.current.formatCurrency(fetchResult.netWorth?.total || 0);
          setMessage(`${fetchResult.accounts.length} accounts connected. Net Worth: ${netWorth}`);
          setTimeout(() => onComplete({ accounts: fetchResult.accounts, netWorth: fetchResult.netWorth }), 1500);
        } else {
          setStatus("error");
          setMessage(fetchResult.error || "Failed to fetch accounts");
        }
      }
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Connection failed");
      if (onError) onError(error.message);
    }
  };

  useInput((input, key) => {
    const lower = input.toLowerCase();

    if (lower === "s") {
      onSkip();
      return;
    }

    if (key.return) {
      if (status === "ready" || status === "error") {
        startSetup();
      }
    }

    // Allow adding more accounts after success
    if (status === "success" && lower === "a") {
      startLinkFlow();
    }
  });

  if (status === "success") {
    const institutions = plaidService.current?.getConnectedInstitutions() || [];
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#22c55e", bold: true }, "\u2713 Plaid Connected"),
      e(Text, { color: "#e2e8f0" }, message),
      institutions.length > 0 && e(
        Box,
        { flexDirection: "column", marginTop: 1 },
        e(Text, { color: "#64748b" }, "Connected accounts:"),
        ...institutions.map(inst =>
          e(Text, { key: inst.itemId, color: "#94a3b8" }, `  \u2022 ${inst.name}`)
        )
      ),
      e(Text, { color: "#f97316", marginTop: 1 }, "Press A to add another bank"),
      e(Text, { color: "#64748b", dimColor: true }, "Press S to continue")
    );
  }

  if (status === "fetching") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Plaid Setup"),
      e(Text, { color: "#f97316" }, message || "Please wait..."),
      e(Text, { color: "#64748b", dimColor: true }, "Loading...")
    );
  }

  if (status === "connecting") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Connecting to Plaid"),
      e(Text, { color: "#f97316" }, message),
      e(Text, { color: "#64748b" }, "Complete the connection in your browser..."),
      e(Text, { color: "#64748b", dimColor: true }, "Waiting for authorization...")
    );
  }

  if (status === "error") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Plaid Setup"),
      e(Text, { color: "#ef4444" }, message),
      e(Text, { color: "#64748b", marginTop: 1 }, "Press Enter to try again"),
      e(Text, { color: "#64748b", dimColor: true }, "Press S to skip")
    );
  }

  // Ready state
  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#e2e8f0", bold: true }, "Banking - Plaid (Optional)"),
    e(Text, { color: "#64748b" }, "Connect banks, credit cards & investments"),
    e(Text, { color: "#64748b" }, "Free sandbox, 100 free dev items"),
    message && e(Text, { color: "#94a3b8" }, message),
    e(Text, { color: "#f97316", marginTop: 1 }, "\u25B6 Press Enter to connect accounts"),
    e(Text, { color: "#64748b", dimColor: true }, "Press S to skip")
  );
};

/**
 * Generic Optional Step Component (Oura, Email, etc.)
 */
const OptionalSetupStep = ({ step, onComplete, onSkip }) => {
  const [status, setStatus] = useState("ready");

  useInput((input, key) => {
    if (status !== "ready") return;

    if (input.toLowerCase() === "s") {
      onSkip();
    } else if (key.return) {
      // For now, just skip optional steps - they can be configured later
      onSkip();
    }
  });

  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#e2e8f0", bold: true }, `${step.label} (Optional)`),
    e(Text, { color: "#64748b" }, step.description),
    e(Text, { color: "#94a3b8", marginTop: 1 }, "Press S to skip, or Enter to configure later via /setup")
  );
};

/**
 * Main Onboarding Panel Component
 */
export const OnboardingPanel = ({ onComplete, onProfileRestored, userDisplay = "", initialStepId = null, notice = null, modelProviderId = null, autoOpenProvider = false }) => {
  const { exit } = useApp();

  // Loading state - shown immediately while checking configurations
  const [loading, setLoading] = useState(true);

  // Initialize step statuses with just pending - heavy checks done in useEffect
  const [stepStatuses, setStepStatuses] = useState(() => {
    const statuses = {};
    for (const step of ONBOARDING_STEPS) {
      statuses[step.id] = "pending";
    }
    return statuses;
  });

  // Run heavy configuration checks after first render
  useEffect(() => {
    const checkConfigurations = async () => {
      const statuses = {};
      for (const step of ONBOARDING_STEPS) {
        statuses[step.id] = "pending";
      }

      // Check prerequisites: Node.js is guaranteed (we're running), check Claude Code CLI
      // Use async version to avoid blocking
      const claudeCliCheck = await isClaudeCodeInstalledAsync();
      if (claudeCliCheck.installed) {
        statuses.prerequisites = "complete";
      }

      // Load settings early for fallback checks
      const settings = loadUserSettings();

      // Check existing configurations - use both direct checks AND settings fallback
      // This handles cases where firebase-user.json is missing but connection was made
      if (isSignedIn() || settings?.connections?.google) {
        statuses.google = "complete";
      }

      // Check model connections (Claude Code CLI, OAuth, or API keys)
      const cliAuth = claudeCliCheck.installed ? isClaudeCodeLoggedIn() : { loggedIn: false };
      const hasClaudeCode = cliAuth.loggedIn;
      const hasClaudeOAuth = hasClaudeCredentials();
      const hasCodex = hasCodexCredentials();
      const hasApiKey = isProviderConfigured("anthropic") || isProviderConfigured("openai") || isProviderConfigured("google");

      if (hasClaudeCode || hasClaudeOAuth || hasCodex || hasApiKey) {
        statuses.model = "complete";
      }
      const alpacaConfig = loadAlpacaConfig();
      if (alpacaConfig.apiKey && !alpacaConfig.apiKey.includes("PASTE")) {
        statuses.alpaca = "complete";
      }
      if (isOuraConfigured()) {
        statuses.oura = "complete";
      }
      if (isEmailConfigured()) {
        statuses.email = "complete";
      }

      // Check phone verification - try multiple sources
      // 1. Firebase user + phone record (ideal path)
      // 2. Any verified phone record (when firebase-user.json missing)
      // 3. Settings fallback (for legacy/manual verification)
      const firebaseUser = getCurrentFirebaseUser();
      let phoneVerified = false;
      if (firebaseUser) {
        const phoneRecord = getPhoneRecord(firebaseUser.id);
        if (phoneRecord?.verification?.verifiedAt) {
          phoneVerified = true;
        }
      }
      if (!phoneVerified) {
        // Fallback: check if ANY phone record is verified
        const anyVerified = getAnyVerifiedPhoneRecord();
        if (anyVerified) {
          phoneVerified = true;
          // Sync settings to match reality
          if (!settings?.connections?.phone || !settings?.phoneNumber) {
            updateSettings({
              connections: { ...settings?.connections, phone: true },
              phoneNumber: anyVerified.phoneNumber
            });
          }
        }
      }
      if (!phoneVerified && (settings?.connections?.phone || settings?.phoneNumber)) {
        // Legacy fallback: settings say phone is connected
        phoneVerified = true;
      }
      if (phoneVerified) {
        statuses.phone = "complete";
        statuses.communicationsWhatsapp = "complete";
      }

      // Check brokerage connections
      try {
        const bs = getBrokerageStatuses();
        if (Object.values(bs).some(s => s.connected)) {
          statuses.brokerages = "complete";
        }
      } catch {}

      // Check Core Goals (required - must have 40+ words)

      // Check Mobile App (optional) - check if user has PWA/push configured
      if (settings.mobileAppInstalled) {
        statuses.mobileApp = "complete";
      }
      if (settings.coreGoals) {
        const wordCount = settings.coreGoals.trim().split(/\s+/).filter(w => w.length > 0).length;
        if (wordCount >= 40) {
          statuses.coreGoals = "complete";
        }
      }
      // Also check core-beliefs.json - user may have set beliefs through the system
      if (statuses.coreGoals !== "complete") {
        try {
          const fs = await import("fs");
          const { dataFile } = await import("../services/paths.js");
          const beliefsPath = dataFile("core-beliefs.json");
          if (fs.default.existsSync(beliefsPath)) {
            const beliefsData = JSON.parse(fs.default.readFileSync(beliefsPath, "utf-8"));
            if (beliefsData.beliefs && beliefsData.beliefs.length >= 1) {
              statuses.coreGoals = "complete";
            }
          }
        } catch {}
      }

      // Check LinkedIn (optional) - check both settings and linkedin-profile.json
      if (settings.linkedInUrl) {
        statuses.linkedin = "complete";
      } else {
        // Also check if linkedin-profile.json exists with valid data
        try {
          const fs = await import("fs");
          const { dataFile } = await import("../services/paths.js");
          const profilePath = dataFile("linkedin-profile.json");
          if (fs.default.existsSync(profilePath)) {
            const profileData = JSON.parse(fs.default.readFileSync(profilePath, "utf-8"));
            if (profileData.success && profileData.profileUrl) {
              statuses.linkedin = "complete";
              // Also save to settings for consistency
              updateSetting("linkedInUrl", profileData.profileUrl);
              updateSetting("linkedInName", profileData.profile?.name || "");
            }
          }
        } catch {}
      }

      setStepStatuses(statuses);
      setLoading(false);
    };

    checkConfigurations();
  }, []);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;

    const applyStatuses = (googleConnected, phoneVerified) => {
      if (cancelled) return;
      setStepStatuses((prev) => {
        const next = { ...prev };
        if (googleConnected) {
          next.google = "complete";
        } else if (prev.google === "complete") {
          next.google = "pending";
        }
        if (phoneVerified) {
          next.phone = "complete";
          next.communicationsWhatsapp = "complete";
        } else if (prev.phone === "complete") {
          next.phone = "pending";
          if (prev.communicationsWhatsapp === "complete") {
            next.communicationsWhatsapp = "pending";
          }
        }
        return next;
      });
    };

    const refreshConnectionStatus = () => {
      const firebaseUser = getCurrentFirebaseUser();
      const settings = loadUserSettings();
      const settingsGoogle = !!settings?.connections?.google || !!settings?.firebaseUser;
      const settingsPhone = !!settings?.connections?.phone || !!settings?.phoneNumber;

      const googleConnected = isSignedIn() || !!firebaseUser || settingsGoogle;
      const localPhoneVerified = firebaseUser
        ? !!getPhoneRecord(firebaseUser.id)?.verification?.verifiedAt
        : false;

      applyStatuses(googleConnected, localPhoneVerified || settingsPhone);

      if (firebaseUser?.id) {
        syncPhoneFromFirestore(firebaseUser.id).then((synced) => {
          const syncedVerified = !!synced?.verification?.verifiedAt;
          applyStatuses(googleConnected, syncedVerified || localPhoneVerified || settingsPhone);
        }).catch(() => {});
      }
    };

    refreshConnectionStatus();
    const interval = setInterval(refreshConnectionStatus, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loading]);

  // Find the first incomplete step to use as default
  const getFirstIncompleteIndex = useCallback((statuses) => {
    // First check required steps
    for (let i = 0; i < ONBOARDING_STEPS.length; i++) {
      const step = ONBOARDING_STEPS[i];
      if (step.disabled) continue;
      if (statuses[step.id] !== "complete" && isStepRequired(step, statuses)) {
        return i;
      }
    }
    // Then check optional steps
    for (let i = 0; i < ONBOARDING_STEPS.length; i++) {
      const step = ONBOARDING_STEPS[i];
      if (step.disabled) continue;
      if (statuses[step.id] !== "complete") {
        return i;
      }
    }
    return 0; // Default to first if all complete
  }, []);

  // Current selected step index - default to 0, updated when loading completes
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [wizardActive, setWizardActive] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [navigationLock, setNavigationLock] = useState(false);

  // Set initial step ONLY ONCE when loading completes (not on every status change)
  useEffect(() => {
    if (!loading && !initialLoadDone) {
      setCurrentStepIndex(getFirstIncompleteIndex(stepStatuses));
      setInitialLoadDone(true);
    }
  }, [loading, initialLoadDone, stepStatuses, getFirstIncompleteIndex]);

  const getStepIndexById = useCallback((stepId) => {
    if (!stepId) return -1;
    return ONBOARDING_STEPS.findIndex((step) => step.id === stepId);
  }, []);

  useEffect(() => {
    if (!loading && initialStepId) {
      const targetIndex = getStepIndexById(initialStepId);
      if (targetIndex >= 0) {
        setCurrentStepIndex(targetIndex);
        setInitialLoadDone(true);
      }
    }
  }, [loading, initialStepId, getStepIndexById]);

  useEffect(() => {
    const isModelStep = ONBOARDING_STEPS[currentStepIndex]?.id === "model";
    if (!isModelStep) {
      setNavigationLock(false);
    }
  }, [currentStepIndex]);

  // Handle launching the Full Setup wizard in browser
  const handleLaunchWizard = useCallback(async () => {
    if (wizardActive) return; // Already running

    setWizardActive(true);
    setErrorMessage(null);

    try {
      const firebaseUser = getCurrentFirebaseUser();
      const userId = firebaseUser?.id || null;
      await startSetupWizard(userId);

      // Listen for step completions from the wizard
      const wizard = getSetupWizard();
      if (wizard) {
        wizard.on("stepComplete", (stepId, data) => {
          // Map wizard step IDs to onboarding step IDs
          const stepMap = {
            google: "google",
            whatsapp: "phone",
            ai: "model",
            alpaca: "alpaca",
            oura: "oura",
            email: "email",
            brokerages: "brokerages"
          };
          const onboardingStepId = stepMap[stepId];
          if (onboardingStepId) {
            setStepStatuses((prev) => {
              const next = { ...prev, [onboardingStepId]: "complete" };
              if (onboardingStepId === "phone") {
                next.communicationsWhatsapp = "complete";
              }
              return next;
            });
          }
        });

        wizard.on("stopped", () => {
          setWizardActive(false);
        });
      }
    } catch (err) {
      setErrorMessage(`Failed to start wizard: ${err.message}`);
      setWizardActive(false);
    }
  }, [wizardActive]);

  const currentStep = ONBOARDING_STEPS[currentStepIndex];

  const handleStepComplete = useCallback((stepId, data) => {
    setStepStatuses((prev) => {
      const newStatuses = { ...prev, [stepId]: "complete" };
      if (stepId === "phone") {
        newStatuses.communicationsWhatsapp = "complete";
      }
      // No auto-advance - let user navigate freely
      return newStatuses;
    });
    setErrorMessage(null);

    // Update user settings
    if (stepId === "google" && data) {
      updateSetting("firebaseUser", data);
      updateSetting("connections", { ...loadUserSettings().connections, google: true });
    }
    if (stepId === "model" && data) {
      updateSetting("coreModelProvider", data.provider);
    }
    if (stepId === "alpaca") {
      updateSetting("connections", { ...loadUserSettings().connections, alpaca: true });
    }
    if (stepId === "phone" && data?.phone) {
      updateSetting("phoneNumber", data.phone);
      updateSetting("connections", { ...loadUserSettings().connections, phone: true });
    }
  }, []);

  const handleStepLogout = useCallback((stepId) => {
    setStepStatuses((prev) => ({ ...prev, [stepId]: "pending" }));
    setErrorMessage(null);
    if (stepId === "google") {
      updateSetting("firebaseUser", null);
      updateSetting("connections", { ...loadUserSettings().connections, google: false });
    }
  }, []);

  const handleStepSkip = useCallback((stepId) => {
    setStepStatuses((prev) => ({ ...prev, [stepId]: "complete" })); // Mark as "skipped" by setting complete
    setErrorMessage(null);
  }, []);

  const handleStepError = useCallback((stepId, error) => {
    setStepStatuses((prev) => ({ ...prev, [stepId]: "error" }));
    setErrorMessage(error);
  }, []);

  const handleComplete = useCallback(() => {
    // Clear screen before transition to prevent layout artifacts
    process.stdout.write("\x1b[2J\x1b[1;1H");
    updateSetting("onboardingComplete", true);
    onComplete();
  }, [onComplete]);

  const handleProfileRestored = useCallback((user) => {
    // Profile was restored from archive - mark all steps complete and skip onboarding
    process.stdout.write("\x1b[2J\x1b[1;1H");
    updateSetting("onboardingComplete", true);
    updateSetting("firebaseUser", user);
    updateSetting("connections", { ...loadUserSettings().connections, google: true });
    if (onProfileRestored) {
      onProfileRestored(user);
    } else {
      onComplete();
    }
  }, [onComplete, onProfileRestored]);

  // Check if required steps are complete (supports conditional requirements)
  const activeSteps = ONBOARDING_STEPS.filter((s) => !s.disabled);
  const requiredStepIds = activeSteps
    .filter((step) => isStepRequired(step, stepStatuses))
    .map((step) => step.id);
  const requiredStepsComplete = requiredStepIds.every((stepId) => stepStatuses[stepId] === "complete");

  // Auto-save onboardingComplete when all required steps are done
  useEffect(() => {
    if (requiredStepsComplete && !loading) {
      updateSetting("onboardingComplete", true);
    }
  }, [requiredStepsComplete, loading]);

  // Handle keyboard shortcuts including arrow navigation
  useInput((input, key) => {
    // Steps that handle their own up/down navigation (for selecting providers)
    // No steps block main navigation - user can always navigate between steps
    // Individual steps handle their own internal navigation when focused
    const currentStepNeedsArrows = navigationLock;

    // Arrow Up - navigate to previous step (unless current step handles arrows)
    if (key.upArrow && !currentStepNeedsArrows) {
      setCurrentStepIndex(prev => {
        let next = prev > 0 ? prev - 1 : ONBOARDING_STEPS.length - 1;
        // Skip disabled steps
        while (ONBOARDING_STEPS[next]?.disabled && next !== prev) {
          next = next > 0 ? next - 1 : ONBOARDING_STEPS.length - 1;
        }
        return next;
      });
      return;
    }

    // Arrow Down - navigate to next step (unless current step handles arrows)
    if (key.downArrow && !currentStepNeedsArrows) {
      setCurrentStepIndex(prev => {
        let next = prev < ONBOARDING_STEPS.length - 1 ? prev + 1 : 0;
        // Skip disabled steps
        while (ONBOARDING_STEPS[next]?.disabled && next !== prev) {
          next = next < ONBOARDING_STEPS.length - 1 ? next + 1 : 0;
        }
        return next;
      });
      return;
    }

    // Right arrow or Enter focuses into steps that have sub-navigation (e.g. brokerages)
    if ((key.rightArrow || key.return) && currentStep?.id === "brokerages") {
      setNavigationLock(true);
      return;
    }

    // Ctrl+M or 'x' to go to main (only if required steps done)
    if ((key.ctrl && input === "m") || input.toLowerCase() === "x") {
      if (requiredStepsComplete) {
        handleComplete();
      }
      return;
    }

    // 'w' to launch the Full Setup wizard in browser (DISABLED FOR NOW)
    // if (input.toLowerCase() === "w") {
    //   handleLaunchWizard();
    //   return;
    // }

    // 'q' to quit the program (Escape is handled by individual steps)
    if (input.toLowerCase() === "q") {
      exit();
    }
  });

  // Render current step component
  const renderCurrentStep = () => {
    if (!currentStep) return null;

    switch (currentStep.id) {
      case "prerequisites":
        return e(PrerequisitesStepWrapper, {
          onComplete: (data) => handleStepComplete("prerequisites", data),
          onError: (err) => handleStepError("prerequisites", err)
        });
      case "google":
        return e(GoogleLoginStep, {
          onComplete: (user) => handleStepComplete("google", user),
          onLogout: () => handleStepLogout("google"),
          onError: (err) => handleStepError("google", err),
          onProfileRestored: handleProfileRestored
        });
      case "phone":
        return e(PhoneVerificationStep, {
          onComplete: (data) => handleStepComplete("phone", data),
          onError: (err) => handleStepError("phone", err)
        });
      case "communicationsWhatsapp":
        return e(CommunicationsWhatsAppStep, {
          phoneConnected: stepStatuses.phone === "complete",
          onComplete: (data) => handleStepComplete("communicationsWhatsapp", data)
        });
      case "model":
        return e(ModelSelectionStep, {
          onComplete: (data) => handleStepComplete("model", data),
          onError: (err) => handleStepError("model", err),
          onNavigationLockChange: setNavigationLock,
          initialProviderId: modelProviderId,
          autoOpenProvider
        });
      case "mobileApp":
        return e(MobileAppStep, {
          onComplete: (data) => handleStepComplete("mobileApp", data),
          onSkip: () => handleStepSkip("mobileApp"),
          onError: (err) => handleStepError("mobileApp", err)
        });
      case "coreGoals":
        return e(CoreGoalsStep, {
          onComplete: (data) => handleStepComplete("coreGoals", data),
          onError: (err) => handleStepError("coreGoals", err)
        });
      case "linkedin":
        return e(LinkedInStep, {
          onComplete: (data) => handleStepComplete("linkedin", data),
          onSkip: () => handleStepSkip("linkedin"),
          onError: (err) => handleStepError("linkedin", err)
        });
      case "alpaca":
        return e(AlpacaSetupStep, {
          onComplete: (data) => handleStepComplete("alpaca", data),
          onSkip: () => handleStepSkip("alpaca"),
          onError: (err) => handleStepError("alpaca", err)
        });
      case "oura":
        return e(OuraSetupStep, {
          onComplete: (data) => handleStepComplete("oura", data),
          onSkip: () => handleStepSkip("oura"),
          onError: (err) => handleStepError("oura", err)
        });
      case "email":
        return e(EmailCalendarSetupStep, {
          onComplete: (data) => handleStepComplete("email", data),
          onSkip: () => handleStepSkip("email"),
          onError: (err) => handleStepError("email", err)
        });
      case "brokerages":
        return e(BrokeragesSetupStep, {
          focused: navigationLock,
          onReleaseFocus: () => setNavigationLock(false),
          onComplete: (data) => handleStepComplete("brokerages", data),
          onSkip: () => handleStepSkip("brokerages")
        });
      default:
        return e(OptionalSetupStep, {
          step: currentStep,
          onComplete: () => handleStepComplete(currentStep.id),
          onSkip: () => handleStepSkip(currentStep.id)
        });
    }
  };

  // Calculate progress (exclude disabled steps from counts)
  const completedCount = activeSteps.filter((s) => stepStatuses[s.id] === "complete").length;
  const requiredCount = requiredStepIds.length;
  const requiredComplete = requiredStepIds.filter((stepId) => stepStatuses[stepId] === "complete").length;
  const googleUser = getCurrentFirebaseUser();
  const showLogoutHint = currentStep?.id === "google" && !!googleUser;

  // Show loading screen while checking configurations
  if (loading) {
    return e(
      Box,
      {
        flexDirection: "column",
        padding: 2,
        borderStyle: "round",
        borderColor: BRAND_COLOR,
        alignItems: "center",
        justifyContent: "center",
        height: 20
      },
      e(Text, { color: BRAND_COLOR, bold: true }, "BACKBONE"),
      e(Text, { color: "#64748b" }, "Setup Wizard"),
      e(Box, { marginTop: 2 }),
      e(Text, { color: "#f59e0b" }, "Loading configuration..."),
      e(Text, { color: "#94a3b8", dimColor: true }, "Checking integrations")
    );
  }

  return e(
    Box,
    {
      flexDirection: "column",
      padding: 2,
      borderStyle: "round",
      borderColor: BRAND_COLOR
    },
    // Header with text only (no spinning B - that's on splash screen)
    e(
      Box,
      { flexDirection: "row", justifyContent: "center", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "column", alignItems: "center" },
        e(Text, { color: BRAND_COLOR, bold: true }, "BACKBONE"),
        e(Text, { color: "#64748b" }, "Setup Wizard"),
        userDisplay && e(Text, { color: "#94a3b8" }, userDisplay)
      )
    ),

    // Divider
    e(Text, { color: "#334155" }, "\u2500".repeat(110)),

    notice && e(
      Box,
      {
        flexDirection: "column",
        marginTop: 1,
        marginBottom: 1,
        borderStyle: "round",
        borderColor: "#f59e0b",
        paddingX: 1
      },
      e(Text, { color: "#f59e0b", bold: true }, "Action needed"),
      e(Text, { color: "#e2e8f0" }, notice)
    ),

    // Main content area
    e(
      Box,
      { flexDirection: "row", marginTop: 1 },
      // Step checklist (left side)
      e(
        Box,
        { flexDirection: "column", width: 34, marginRight: 3 },
        // Full Setup button - opens wizard in browser (HIDDEN FOR NOW)
        // e(
        //   Box,
        //   {
        //     flexDirection: "row",
        //     paddingY: 0,
        //     marginBottom: 1,
        //     borderStyle: "single",
        //     borderColor: wizardActive ? "#22c55e" : BRAND_COLOR,
        //     paddingX: 1
        //   },
        //   e(Text, { color: wizardActive ? "#22c55e" : BRAND_COLOR, bold: true },
        //     wizardActive ? "  Wizard Running...  " : "  [W] Full Setup  "
        //   )
        // ),
        // Individual steps
        ...ONBOARDING_STEPS.map((step, i) =>
          e(StepItem, {
            key: step.id,
            step,
            status: stepStatuses[step.id],
            isRequired: isStepRequired(step, stepStatuses),
            isActive: i === currentStepIndex,
            isSelected: i === currentStepIndex
          })
        )
      ),

      // Current step panel (right side)
      e(
        Box,
        {
          flexDirection: "column",
          width: 72,
          borderStyle: "single",
          borderColor: "#334155",
          paddingX: 1
        },
        renderCurrentStep()
      )
    ),

    // Error message
    errorMessage && e(
      Box,
      { marginTop: 1 },
      e(Text, { color: "#ef4444" }, `Error: ${errorMessage}`)
    ),

    // Divider
    e(Text, { color: "#334155", marginTop: 1 }, "\u2500".repeat(110)),

    // Footer with controls
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginTop: 1 },
      e(
        Box,
        { flexDirection: "row", gap: 2 },
        e(Text, { color: "#f97316" }, "[Up/Down] Navigate"),
        e(Text, { color: "#64748b" }, "[Enter] Continue"),
        e(Text, { color: "#64748b" }, "[S] Skip"),
        // Exit to main - only show if required steps done
        requiredComplete >= requiredCount
          ? e(Text, { color: "#22c55e" }, "[X] Main")
          : e(Text, { color: "#475569", dimColor: true }, "[X] Main"),
        e(Text, { color: "#64748b" }, "[Q] Quit"),
        showLogoutHint && e(Text, { color: "#f59e0b" }, "[O] Logout")
      ),
      e(
        Text,
        { color: requiredComplete === requiredCount ? "#22c55e" : "#64748b" },
        `${completedCount}/${activeSteps.length} steps`
      )
    )
  );
};

export default OnboardingPanel;
