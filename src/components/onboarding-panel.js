/**
 * Onboarding Panel Component
 * Full-screen onboarding wizard with spinning B logo and step checklist
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { signInWithGoogle, signOutFirebase, getCurrentFirebaseUser, isSignedIn } from "../services/firebase-auth.js";
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
} from "../services/model-key-setup.js";
import {
  loadAlpacaConfig,
  openKeysFileInEditor as openAlpacaKeysFile,
  openAlpacaForKeys,
  testAlpacaConnection,
  saveKeysToEnv as saveAlpacaKeysToEnv,
  readKeysFile as readAlpacaKeysFile
} from "../services/alpaca-setup.js";
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
} from "../services/oura-service.js";
import {
  isGoogleEmailConfigured,
  isMicrosoftConfigured,
  isEmailConfigured,
  getConfiguredProviders,
  startOAuthFlow,
  syncEmailCalendar
} from "../services/email-calendar-service.js";
import { getPersonalCapitalService } from "../services/personal-capital.js";
import {
  getPlaidService,
  isPlaidConfigured,
  hasPlaidCredentials,
  syncPlaidData
} from "../services/plaid-service.js";
import { loadUserSettings, updateSetting, updateSettings } from "../services/user-settings.js";
import { openUrl } from "../services/open-url.js";
import { requestPhoneCode, verifyPhoneCode, getPhoneRecord } from "../services/phone-auth.js";
import { getMobileService } from "../services/mobile.js";
import { startOAuthFlow as startClaudeOAuth, hasValidCredentials as hasClaudeCredentials } from "../services/claude-oauth.js";

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
  { id: "google", label: "Google Account", required: true, description: "Sign in with Google" },
  {
    id: "phone",
    label: "Phone & Messaging",
    required: true,
    description: "Add a phone number for alerts and SMS jobs"
  },
  { id: "model", label: "AI Model", required: true, description: "Choose your AI assistant" },
  { id: "alpaca", label: "Trading (Alpaca)", required: false, description: "Auto-trading" },
  { id: "oura", label: "Health (Oura)", required: false, description: "Health tracking" },
  { id: "email", label: "Email & Calendar", required: false, description: "Email access" },
  { id: "personalCapital", label: "Personal Wealth", required: false, description: "Empower integration", disabled: true },
  { id: "plaid", label: "Banking (Plaid)", required: false, description: "Banks, cards & investments" }
];

// Status colors
const STATUS_COLORS = {
  pending: "#64748b",    // Gray
  active: "#f97316",     // Orange
  complete: "#22c55e",   // Green
  error: "#ef4444"       // Red
};

// Brand color (orange)
const BRAND_COLOR = "#f97316";

// Model provider options
// Model options in priority order for fallback chain
const MODEL_OPTIONS = [
  { id: "claude-oauth", label: "Claude Pro/Max", description: "Login with your Claude subscription", oauth: true, priority: 1 },
  { id: "openai-codex", label: "OpenAI Codex", description: "Code-optimized GPT model", priority: 2 },
  { id: "openai", label: "OpenAI API", description: "GPT-4 and ChatGPT family", priority: 3 },
  { id: "anthropic", label: "Claude API", description: "Anthropic API key", priority: 4 },
  { id: "google", label: "Gemini (Google)", description: "Google AI - Optional", priority: 5, optional: true }
];

// Check if a specific model is connected
const isModelConnected = (modelId) => {
  switch (modelId) {
    case "claude-oauth":
      return hasClaudeCredentials();
    case "openai-codex":
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
const StepItem = ({ step, status, isActive, isSelected }) => {
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
    indicatorPrefix = "▶ ";
  } else if (isActive) {
    // Selected but not complete: orange highlight
    labelColor = "#ffffff";  // White text
    bgColor = "#f97316";     // Orange background
    indicatorPrefix = "▶ ";
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
        !step.required && !isComplete && !isDisabled && !isActive && e(Text, { color: "#475569", dimColor: true }, "(Optional)"),
        isComplete && !isDisabled && !isActive && e(Text, { color: "#22c55e", dimColor: true }, "✓")
      ),
      // Show description when selected
      isActive && !isDisabled && e(Text, { color: isComplete ? "#166534" : descColor }, step.description),
      isDisabled && isActive && e(Text, { color: "#475569", dimColor: true }, step.description)
    )
  );
};

/**
 * Google Login Step Component
 * Opens browser for Google OAuth sign-in
 */
const GoogleLoginStep = ({ onComplete, onError, onLogout }) => {
  const [status, setStatus] = useState("ready"); // ready, waiting, success, error, signed-in
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);

  useEffect(() => {
    const existingUser = getCurrentFirebaseUser();
    if (existingUser) {
      setUser(existingUser);
      setStatus("signed-in");
      setMessage(`Signed in as ${existingUser.email}`);
    }
  }, []);

  const handleSignIn = useCallback(async () => {
    setStatus("waiting");
    setMessage("Opening Google sign-in in your browser...");

    try {
      const result = await signInWithGoogle();

      if (result.success) {
        setUser(result.user);
        setStatus("success");
        setMessage(`Signed in as ${result.user.email}`);
        setTimeout(() => onComplete(result.user), 1000);
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
  }, [onComplete, onError]);

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
        onComplete(user);
      }
      if (lower === "o") {
        handleLogout();
      }
      return;
    }
    if (key.return || lower === "l") {
      if (status === "ready" || status === "error") {
        handleSignIn();
      }
    }
  });

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
 * Captures a phone number to receive SMS updates and alerts
 */
const PhoneVerificationStep = ({ onComplete, onError }) => {
  const user = getCurrentFirebaseUser();
  const userId = user?.id;
  const [phase, setPhase] = useState(userId ? "phoneEntry" : "waiting");
  const [phoneEntry, setPhoneEntry] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [status, setStatus] = useState(userId ? "ready" : "pending");
  const [message, setMessage] = useState(
    userId ? "Enter your phone number to receive verification codes." : "Sign in with Google first to add your phone."
  );
    const completedRef = useRef(false);
    const mobileService = useMemo(() => getMobileService(), []);

  useEffect(() => {
    if (!userId) {
      setPhase("waiting");
      setStatus("pending");
      setMessage("Sign in with Google first to add your phone.");
      return;
    }

    const record = getPhoneRecord(userId);
    if (record?.verification?.verifiedAt && !completedRef.current) {
      completedRef.current = true;
      setPhoneEntry(record.phoneNumber || "");
      setStatus("success");
      setPhase("success");
      setMessage("Phone already verified.");
      setTimeout(() => onComplete({ existing: true, phone: record.phoneNumber }), 800);
      return;
    }

    if (!completedRef.current) {
      setPhase("phoneEntry");
      setStatus("ready");
      setMessage("Enter your phone number to receive SMS updates.");
    }
  }, [userId, onComplete]);

  const sendCode = useCallback(
    async (value) => {
      if (!userId) {
        setPhase("waiting");
        setStatus("pending");
        setMessage("Sign in with Google first.");
        return;
      }

      const normalized = value.replace(/[^0-9+]/g, "");
      if (normalized.length < 10) {
        setStatus("error");
        setMessage("Enter at least 10 digits so we can reach you.");
        return;
      }

      try {
        const code = requestPhoneCode(userId, normalized);
        setPhoneEntry(normalized);
        setCodeInput("");
        setPhase("codeEntry");
        setStatus("codeSent");
        const smsResult = await mobileService.sendSMS(
          `Your BACKBONE verification code is ${code}`,
          normalized
        );
        const smsNote = smsResult.success
          ? "Check your phone for the SMS."
          : `SMS not sent: ${smsResult.error || "Twilio not configured"}`;
        setMessage(`Verification code stored locally (code: ${code}). ${smsNote}`);
      } catch (error) {
        setStatus("error");
        setMessage(error?.message || "Failed to generate verification code.");
        if (onError) onError(error?.message || "Phone code error");
      }
    },
    [userId, onError, mobileService]
  );

  const verifyCode = useCallback(
    (value) => {
      if (!userId) {
        setMessage("Sign in with Google first.");
        setPhase("waiting");
        setStatus("pending");
        return;
      }

      if (!phoneEntry) {
        setMessage("Send a code first so we know which number to verify.");
        setPhase("phoneEntry");
        return;
      }

      setStatus("verifying");
      const valid = verifyPhoneCode(userId, value.trim());

      if (valid) {
        setStatus("success");
        setPhase("success");
        setMessage("Phone verified! Ready for SMS updates.");
        if (!completedRef.current) {
          completedRef.current = true;
          setTimeout(() => onComplete({ phone: phoneEntry }), 600);
        }
        setCodeInput("");
      } else {
        setStatus("codeSent");
        setPhase("codeEntry");
        setMessage("Code invalid or expired. Try again.");
      }
    },
    [userId, phoneEntry, onComplete]
  );

  if (!userId) {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Phone Verification"),
      e(Text, { color: "#64748b" }, "Sign in with Google first to continue."),
      e(Text, { color: "#94a3b8" }, "We'll prompt for your phone number after you authorize.")
    );
  }

  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#e2e8f0", bold: true }, "Phone Verification"),
    e(Text, { color: "#64748b" }, "Add a phone number so BACKBONE can send updates and alerts."),
    message && e(Text, { color: status === "error" ? "#ef4444" : "#94a3b8" }, message),
    phase === "phoneEntry" && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: "#64748b" }, "Phone:"),
      e(TextInput, {
        value: phoneEntry,
        onChange: setPhoneEntry,
        placeholder: "+1 (555) 555-5555",
        onSubmit: sendCode
      }),
      e(Text, { color: "#64748b", dimColor: true }, "Press Enter to send a verification code")
    ),
    phase === "codeEntry" && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: "#64748b" }, `Number: ${phoneEntry}`),
      e(TextInput, {
        value: codeInput,
        onChange: setCodeInput,
        placeholder: "123456",
        mask: "*",
        onSubmit: (value) => {
          setCodeInput(value);
          verifyCode(value);
        }
      }),
      e(Text, { color: "#64748b", dimColor: true }, "Enter the 6-digit code and press Enter")
    ),
    status === "success" && e(Text, { color: "#22c55e", marginTop: 1 }, "\u2713 Phone verified")
  );
};

/**
 * Model Selection Step Component
 * Two-panel navigation:
 * - Left/Right arrows switch between main list and sub-options
 * - Up/Down arrows navigate within current panel
 * - Enter confirms selection
 */
const ModelSelectionStep = ({ onComplete, onError }) => {
  const [selectedProvider, setSelectedProvider] = useState(0);
  const [subStep, setSubStep] = useState("select"); // select, pro-check, api-key, validating, oauth
  const [activePanel, setActivePanel] = useState("main"); // "main" or "sub"
  const [selectedSubOption, setSelectedSubOption] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [message, setMessage] = useState("");
  const [oauthStatus, setOauthStatus] = useState("");
  const fileWatcherRef = useRef(null);
  const proCheckTimeoutRef = useRef(null);
  const useInlineKeyEntry = isModernTerminal();

  // Get sub-options for currently selected provider
  const getSubOptions = (providerId) => {
    switch (providerId) {
      case "claude-oauth":
        return [
          { id: "login", label: "Login with Browser", action: "oauth" },
          { id: "switch-api", label: "Use API Key Instead", action: "switch", target: "anthropic" },
        ];
      case "openai-codex":
        return [
          { id: "setup", label: "Setup API Key", action: "api-key" },
          { id: "switch-gpt", label: "Use GPT API Instead", action: "switch", target: "openai" },
        ];
      case "openai":
        return [
          { id: "setup", label: "Setup API Key", action: "api-key" },
          { id: "switch-codex", label: "Use Codex Instead", action: "switch", target: "openai-codex" },
        ];
      case "anthropic":
        return [
          { id: "setup", label: "Setup API Key", action: "api-key" },
          { id: "switch-oauth", label: "Login with Claude Pro/Max", action: "switch", target: "claude-oauth" },
        ];
      case "google":
        return [
          { id: "setup", label: "Setup API Key", action: "api-key" },
          { id: "skip", label: "Skip (Optional)", action: "skip" },
        ];
      default:
        return [{ id: "setup", label: "Setup", action: "api-key" }];
    }
  };

  // Check if any provider is already configured
  useEffect(() => {
    // First check Claude OAuth credentials
    if (hasClaudeCredentials()) {
      setMessage("Claude Pro/Max already connected!");
      setTimeout(() => onComplete({ provider: "claude-oauth", existing: true }), 1000);
      return;
    }

    // Check other providers - map model IDs to provider IDs
    const providerMap = {
      "openai-codex": "openai",
      "openai": "openai",
      "anthropic": "anthropic",
      "google": "google",
    };

    for (const opt of MODEL_OPTIONS) {
      if (opt.id === "claude-oauth") continue;
      const providerId = providerMap[opt.id] || opt.id;
      if (isProviderConfigured(providerId)) {
        setMessage(`${opt.label} already configured!`);
        setTimeout(() => onComplete({ provider: opt.id, existing: true }), 1000);
        return;
      }
    }
  }, [onComplete]);

  // Handle Claude OAuth flow
  const handleClaudeOAuth = async () => {
    setSubStep("oauth");
    setOauthStatus("Starting OAuth flow...");

    try {
      const result = await startClaudeOAuth((status) => {
        setOauthStatus(status);
      });

      if (result.success) {
        if (result.method === "oauth") {
          setMessage("Claude Pro/Max connected via OAuth!");
        } else if (result.method === "api_key_via_oauth") {
          // Save the API key to env
          saveApiKeyToEnv("anthropic", result.apiKey);
          setMessage("Claude API key created successfully!");
        }
        setTimeout(() => onComplete({ provider: "anthropic", method: result.method }), 1500);
      } else {
        // OAuth failed - offer to fall back to API key
        setMessage(`OAuth failed: ${result.error}`);
        setOauthStatus("Falling back to API key...");
        setTimeout(() => {
          setSubStep("api-key");
          setSelectedProvider(1); // Select "Claude (API Key)" option
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

  // Execute a sub-option action
  const executeSubOption = (subOption, provider) => {
    switch (subOption.action) {
      case "oauth":
        handleClaudeOAuth();
        break;
      case "switch":
        // Switch to a different provider
        const targetIndex = MODEL_OPTIONS.findIndex(m => m.id === subOption.target);
        if (targetIndex >= 0) {
          setSelectedProvider(targetIndex);
          setActivePanel("main");
          setSelectedSubOption(0);
        }
        break;
      case "skip":
        onComplete({ provider: provider.id, skipped: true });
        break;
      case "api-key":
      default:
        // Start API key flow
        const providerId = provider.id === "openai-codex" ? "openai" : provider.id;
        setSubStep("api-key");
        openProviderKeyPage(providerId);
        if (useInlineKeyEntry) {
          setMessage(`Paste your ${provider.label} API key below.`);
        } else {
          createApiKeyFile(providerId);
          setMessage(`Opening ${provider.label} API key page...`);
          setTimeout(() => openApiKeyInEditor(), 500);
          // Start watching for file changes
          fileWatcherRef.current = watchApiKeyFile(async (key) => {
            setSubStep("validating");
            setMessage("Validating API key...");
            const result = await validateApiKey(providerId, key);
            if (result.valid) {
              saveApiKeyToEnv(providerId, key);
              cleanupApiKeyFile();
              setMessage("API key validated!");
              setTimeout(() => onComplete({ provider: provider.id }), 1000);
            } else {
              setSubStep("api-key");
              setMessage(`Invalid key: ${result.error}. Try again.`);
            }
          });
        }
        break;
    }
  };

  useInput((input, key) => {
    if (subStep === "api-key" && useInlineKeyEntry) {
      return;
    }
    if (subStep === "oauth") {
      // Don't handle input during OAuth flow
      return;
    }
    if (subStep === "select") {
      const provider = MODEL_OPTIONS[selectedProvider];
      const subOptions = getSubOptions(provider.id);

      if (activePanel === "main") {
        // Main panel navigation
        if (key.upArrow) {
          setSelectedProvider((p) => (p - 1 + MODEL_OPTIONS.length) % MODEL_OPTIONS.length);
          setSelectedSubOption(0); // Reset sub-option when changing provider
        } else if (key.downArrow) {
          setSelectedProvider((p) => (p + 1) % MODEL_OPTIONS.length);
          setSelectedSubOption(0);
        } else if (key.rightArrow) {
          // Move to sub-options panel
          setActivePanel("sub");
          setSelectedSubOption(0);
        } else if (key.return) {
          // Quick action - execute first sub-option (usually "setup" or "login")
          executeSubOption(subOptions[0], provider);
        }
      } else if (activePanel === "sub") {
        // Sub-options panel navigation
        if (key.upArrow) {
          setSelectedSubOption((s) => (s - 1 + subOptions.length) % subOptions.length);
        } else if (key.downArrow) {
          setSelectedSubOption((s) => (s + 1) % subOptions.length);
        } else if (key.leftArrow) {
          // Move back to main panel
          setActivePanel("main");
        } else if (key.return) {
          // Execute selected sub-option
          executeSubOption(subOptions[selectedSubOption], provider);
        }
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
    const currentProvider = MODEL_OPTIONS[selectedProvider];
    const subOptions = getSubOptions(currentProvider.id);
    const isInSubMenu = activePanel === "sub";

    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Select AI Provider"),
      e(Text, { color: "#64748b", marginBottom: 1 },
        isInSubMenu ? "↑↓ Select Option  ← Back  Enter Confirm" : "↑↓ Navigate  → Options  Enter Setup"
      ),

      // Single box with all providers - same box always
      e(
        Box,
        {
          flexDirection: "column",
          borderStyle: "single",
          borderColor: "#334155",
          paddingX: 1,
          paddingY: 0
        },

        // Provider list - always visible
        ...MODEL_OPTIONS.map((opt, i) => {
          const isConnected = isModelConnected(opt.id);
          const isSelected = i === selectedProvider;
          const isActiveInSubMenu = isSelected && isInSubMenu;
          const optSubOptions = getSubOptions(opt.id);

          return e(
            Box,
            { key: opt.id, flexDirection: "column" },
            // Provider row
            e(
              Box,
              {
                flexDirection: "row",
                gap: 1,
                borderStyle: isActiveInSubMenu ? "single" : undefined,
                borderColor: isActiveInSubMenu ? "#f97316" : undefined,
                paddingX: isActiveInSubMenu ? 1 : 0
              },
              // Selection arrow (only when in main mode)
              !isInSubMenu && e(Text, { color: isSelected ? "#f97316" : "#1e293b" },
                isSelected ? "▶" : " "
              ),
              // Status dot
              e(Text, { color: isConnected ? "#22c55e" : "#475569" },
                isConnected ? "●" : "○"
              ),
              // Label
              e(Text, {
                color: isConnected ? "#22c55e" : (isSelected ? "#e2e8f0" : "#94a3b8"),
                bold: isSelected
              }, opt.label),
              // Connected indicator
              isConnected && e(Text, { color: "#22c55e", dimColor: true }, " Connected"),
              // Arrow hint when selected in main mode
              !isInSubMenu && isSelected && e(Text, { color: "#64748b" }, " →")
            ),

            // Sub-options - only show for selected provider when in sub-menu
            isActiveInSubMenu && e(
              Box,
              { flexDirection: "column", paddingLeft: 2, marginBottom: 1 },
              ...optSubOptions.map((sub, si) => {
                const isSubSelected = si === selectedSubOption;
                return e(
                  Box,
                  { key: sub.id, flexDirection: "row", gap: 1 },
                  e(Text, { color: isSubSelected ? "#f97316" : "#1e293b" },
                    isSubSelected ? "▶" : " "
                  ),
                  e(Text, {
                    color: isSubSelected ? "#e2e8f0" : "#94a3b8",
                    bold: isSubSelected
                  }, sub.label)
                );
              })
            )
          );
        })
      )
    );
  }

  if (subStep === "oauth") {
    return e(
      Box,
      { flexDirection: "column", paddingX: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, "Claude Pro/Max Login"),
      e(Text, { color: "#f97316" }, oauthStatus || "Starting..."),
      message && e(Text, { color: message.includes("failed") || message.includes("error") ? "#ef4444" : "#22c55e" }, message),
      e(Text, { color: "#64748b", dimColor: true, marginTop: 1 }, "A browser window will open for you to log in."),
      e(Text, { color: "#64748b", dimColor: true }, "After logging in, you'll be redirected back automatically.")
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
          setSubStep("validating");
          setMessage("Validating API key...");
          const result = await validateApiKey(provider.id, value);
          if (result.valid) {
            saveApiKeyToEnv(provider.id, value);
            setMessage("API key validated!");
            setTimeout(() => onComplete({ provider: provider.id }), 1000);
          } else {
            setSubStep("api-key");
            setMessage(`Invalid key: ${result.error}. Try again.`);
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
const PersonalWealthDisabledStep = ({ onSkip }) => {
  useInput((input, key) => {
    // Auto-skip since this step is disabled
    if (key.return || input.toLowerCase() === "s") {
      onSkip();
    }
  });

  return e(
    Box,
    { flexDirection: "column", paddingX: 1 },
    e(Text, { color: "#475569", bold: true, dimColor: true }, "Personal Wealth (Empower)"),
    e(Text, { color: "#475569", dimColor: true }, "Investment tracking via Empower"),
    e(Box, { marginTop: 1 },
      e(Text, { color: "#64748b" }, "\u231B Coming Soon"),
      e(Text, { color: "#475569", dimColor: true }, "Empower integration is under development.")
    ),
    e(Text, { color: "#64748b", marginTop: 1 }, "Press Enter or S to continue")
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
export const OnboardingPanel = ({ onComplete, userDisplay = "" }) => {
  const { exit } = useApp();

  // Initialize step statuses based on existing configuration
  const [stepStatuses, setStepStatuses] = useState(() => {
    const statuses = {};
    for (const step of ONBOARDING_STEPS) {
      statuses[step.id] = "pending";
    }

    // Check existing configurations
    if (isSignedIn()) {
      statuses.google = "complete";
    }
    if (isProviderConfigured("anthropic") || isProviderConfigured("openai") || isProviderConfigured("google")) {
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
    const firebaseUser = getCurrentFirebaseUser();
    if (firebaseUser) {
      const phoneRecord = getPhoneRecord(firebaseUser.id);
      if (phoneRecord?.verification?.verifiedAt) {
        statuses.phone = "complete";
      }
    }
    // Check Plaid configuration
    if (isPlaidConfigured()) {
      statuses.plaid = "complete";
    }

    return statuses;
  });

  // Find the first incomplete step to use as default
  const getFirstIncompleteIndex = useCallback((statuses) => {
    // First check required steps
    for (let i = 0; i < ONBOARDING_STEPS.length; i++) {
      const step = ONBOARDING_STEPS[i];
      if (step.disabled) continue;
      if (statuses[step.id] !== "complete" && step.required) {
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

  // Current selected step index - default to first incomplete
  const [currentStepIndex, setCurrentStepIndex] = useState(() => getFirstIncompleteIndex(stepStatuses));
  const [errorMessage, setErrorMessage] = useState(null);

  // Track if user is manually navigating (to prevent auto-advance)
  const [userNavigating, setUserNavigating] = useState(false);

  const currentStep = ONBOARDING_STEPS[currentStepIndex];

  const handleStepComplete = useCallback((stepId, data) => {
    setStepStatuses((prev) => {
      const newStatuses = { ...prev, [stepId]: "complete" };

      // Auto-advance to next incomplete step after a short delay
      // (unless user is manually navigating)
      if (!userNavigating) {
        setTimeout(() => {
          const nextIndex = getFirstIncompleteIndex(newStatuses);
          setCurrentStepIndex(nextIndex);
        }, 500);
      }

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
  }, [userNavigating, getFirstIncompleteIndex]);

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
    updateSetting("onboardingComplete", true);
    onComplete();
  }, [onComplete]);

  // Check if required steps are complete (login and model)
  const requiredStepsComplete = stepStatuses.google === "complete" && stepStatuses.model === "complete";

  // Handle keyboard shortcuts including arrow navigation
  useInput((input, key) => {
    // Arrow Up - navigate to previous step
    if (key.upArrow) {
      setUserNavigating(true);
      setCurrentStepIndex((prev) => {
        const newIndex = prev > 0 ? prev - 1 : ONBOARDING_STEPS.length - 1;
        return newIndex;
      });
      return;
    }

    // Arrow Down - navigate to next step
    if (key.downArrow) {
      setUserNavigating(true);
      setCurrentStepIndex((prev) => {
        const newIndex = prev < ONBOARDING_STEPS.length - 1 ? prev + 1 : 0;
        return newIndex;
      });
      return;
    }

    // Ctrl+M or 'x' to go to main (only if required steps done)
    if ((key.ctrl && input === "m") || input.toLowerCase() === "x") {
      if (requiredStepsComplete) {
        handleComplete();
      }
      return;
    }

    // Escape or 'q' to quit the program
    if (key.escape || input.toLowerCase() === "q") {
      exit();
    }
  });

  // Render current step component
  const renderCurrentStep = () => {
    if (!currentStep) return null;

    switch (currentStep.id) {
      case "google":
        return e(GoogleLoginStep, {
          onComplete: (user) => handleStepComplete("google", user),
          onLogout: () => handleStepLogout("google"),
          onError: (err) => handleStepError("google", err)
        });
      case "phone":
        return e(PhoneVerificationStep, {
          onComplete: (data) => handleStepComplete("phone", data),
          onError: (err) => handleStepError("phone", err)
        });
      case "model":
        return e(ModelSelectionStep, {
          onComplete: (data) => handleStepComplete("model", data),
          onError: (err) => handleStepError("model", err)
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
      case "personalCapital":
        // Personal Wealth step is disabled - show coming soon message
        return e(PersonalWealthDisabledStep, {
          onSkip: () => handleStepSkip("personalCapital")
        });
      case "plaid":
        return e(PlaidSetupStep, {
          onComplete: (data) => handleStepComplete("plaid", data),
          onSkip: () => handleStepSkip("plaid"),
          onError: (err) => handleStepError("plaid", err)
        });
      default:
        return e(OptionalSetupStep, {
          step: currentStep,
          onComplete: () => handleStepComplete(currentStep.id),
          onSkip: () => handleStepSkip(currentStep.id)
        });
    }
  };

  // Calculate progress
  const completedCount = Object.values(stepStatuses).filter((s) => s === "complete").length;
  const requiredCount = ONBOARDING_STEPS.filter((s) => s.required).length;
  const requiredComplete = ONBOARDING_STEPS.filter((s) => s.required && stepStatuses[s.id] === "complete").length;
  const googleUser = getCurrentFirebaseUser();
  const showLogoutHint = currentStep?.id === "google" && !!googleUser;

  return e(
    Box,
    {
      flexDirection: "column",
      width: "100%",
      padding: 1,
      borderStyle: "round",
      borderColor: BRAND_COLOR
    },
    // Header with logo
    e(
      Box,
      { flexDirection: "row", justifyContent: "center", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "row", alignItems: "center", gap: 3 },
        e(SpinningBLogo, { color: BRAND_COLOR }),
        e(
          Box,
          { flexDirection: "column" },
          e(Text, { color: "#e2e8f0", bold: true }, "BACKBONE"),
          e(Text, { color: "#64748b" }, "Setup Wizard"),
          userDisplay && e(Text, { color: "#94a3b8" }, userDisplay)
        )
      )
    ),

    // Divider
    e(Text, { color: "#334155" }, "\u2500".repeat(56)),

    // Main content area
    e(
      Box,
      { flexDirection: "row", marginTop: 1 },
      // Step checklist (left side)
      e(
        Box,
        { flexDirection: "column", width: 30, marginRight: 2 },
        ...ONBOARDING_STEPS.map((step, i) =>
          e(StepItem, {
            key: step.id,
            step,
            status: stepStatuses[step.id],
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
          width: 40,
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
    e(Text, { color: "#334155", marginTop: 1 }, "\u2500".repeat(56)),

    // Footer with controls
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginTop: 1 },
      e(
        Box,
        { flexDirection: "row", gap: 2 },
        e(Text, { color: "#f97316" }, "[↑↓] Navigate"),
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
        `${completedCount}/${ONBOARDING_STEPS.length} steps`
      )
    )
  );
};

export default OnboardingPanel;
