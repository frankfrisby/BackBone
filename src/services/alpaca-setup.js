import fs from "fs";
import path from "path";
import { openUrl } from "./open-url.js";

/**
 * Alpaca Setup Wizard Service
 * Interactive setup flow for Alpaca trading integration
 */

const DATA_DIR = path.join(process.cwd(), "data");
const ALPACA_CONFIG_PATH = path.join(DATA_DIR, "alpaca-config.json");

// Setup steps
export const SETUP_STEPS = {
  MODE: "mode",
  STRATEGY: "strategy",
  RISK: "risk",
  KEYS: "keys",
  COMPLETE: "complete"
};

// Mode options
export const MODES = {
  LIVE: { id: "live", label: "Live", description: "Real money trading" },
  PAPER: { id: "paper", label: "Paper (Recommended)", description: "Practice with fake money" }
};

// Strategy options
export const STRATEGIES = {
  SWING: { id: "swing", label: "Swing Trading", description: "Hold positions for days/weeks" },
  OPTIONS: { id: "options", label: "Options Trading", description: "Trade options contracts" }
};

// Risk options
export const RISK_LEVELS = {
  CONSERVATIVE: { id: "conservative", label: "Conservative (Recommended)", description: "Lower risk, steady gains" },
  RISKY: { id: "risky", label: "Risky", description: "Higher risk, potential for larger gains/losses" }
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
 * Load Alpaca config from disk
 */
export const loadAlpacaConfig = () => {
  try {
    ensureDataDir();
    if (fs.existsSync(ALPACA_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(ALPACA_CONFIG_PATH, "utf-8"));
    }
  } catch (error) {
    console.error("Failed to load Alpaca config:", error.message);
  }
  return getDefaultConfig();
};

/**
 * Save Alpaca config to disk
 */
export const saveAlpacaConfig = (config) => {
  try {
    ensureDataDir();
    fs.writeFileSync(ALPACA_CONFIG_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save Alpaca config:", error.message);
    return false;
  }
};

/**
 * Get default config
 */
export const getDefaultConfig = () => ({
  mode: "live",
  strategy: "swing",
  risk: "conservative",
  apiKey: null,
  apiSecret: null,
  configured: false,
  lastUpdated: null
});

/**
 * Open the config file in default editor for easy key pasting
 * Uses JSON format - only creates template if file doesn't exist
 */
export const openKeysFileInEditor = async (mode = "paper") => {
  ensureDataDir();

  // Load existing config or create new
  let config = loadAlpacaConfig();

  // Update mode
  config.mode = mode;

  // Add instructions as comments (JSON doesn't support comments, but we'll use _instructions)
  const fileContent = {
    _instructions: "PASTE YOUR ALPACA KEYS BELOW",
    _step1: "Go to: " + (mode === "live"
      ? "https://app.alpaca.markets/live/dashboard/overview"
      : "https://app.alpaca.markets/paper/dashboard/overview"),
    _step2: "Copy your API Key ID and paste it in apiKey below",
    _step3: "Copy your Secret Key and paste it in apiSecret below",
    _step4: "SAVE this file (Ctrl+S), then click Connect in BACKBONE",
    apiKey: config.apiKey || "PASTE_YOUR_API_KEY_HERE",
    apiSecret: config.apiSecret || "PASTE_YOUR_SECRET_KEY_HERE",
    mode: config.mode || "paper",
    risk: config.risk || "conservative",
    strategy: config.strategy || "swing"
  };

  fs.writeFileSync(ALPACA_CONFIG_PATH, JSON.stringify(fileContent, null, 2));

  const platform = process.platform;
  const { spawn } = await import("child_process");

  try {
    let editor;
    let args;

    if (platform === "win32") {
      editor = "notepad.exe";
      args = [ALPACA_CONFIG_PATH];
    } else if (platform === "darwin") {
      editor = "open";
      args = ["-e", ALPACA_CONFIG_PATH];
    } else {
      editor = "xdg-open";
      args = [ALPACA_CONFIG_PATH];
    }

    const child = spawn(editor, args, {
      detached: true,
      stdio: "ignore"
    });
    child.unref();

    return { success: true, filePath: ALPACA_CONFIG_PATH };
  } catch (error) {
    return { success: false, error: error.message, filePath: ALPACA_CONFIG_PATH };
  }
};

/**
 * Read keys from the config file
 */
export const readKeysFile = () => {
  try {
    const config = loadAlpacaConfig();

    // Check if keys are real (not placeholders)
    const key = config.apiKey && !config.apiKey.includes("PASTE") ? config.apiKey : null;
    const secret = config.apiSecret && !config.apiSecret.includes("PASTE") ? config.apiSecret : null;

    return { key, secret };
  } catch (error) {
    return { key: null, secret: null };
  }
};

/**
 * Watch keys file for changes
 */
export const watchKeysFile = (callback) => {
  ensureDataDir();

  if (!fs.existsSync(ALPACA_CONFIG_PATH)) {
    // Create default config
    saveAlpacaConfig(getDefaultConfig());
  }

  const watcher = fs.watch(ALPACA_CONFIG_PATH, (eventType) => {
    if (eventType === "change") {
      const keys = readKeysFile();
      if (keys.key && keys.secret) {
        callback(keys);
      }
    }
  });

  return watcher;
};

/**
 * Open Alpaca dashboard for keys
 */
export const openAlpacaForKeys = async (mode = "paper") => {
  const url = mode === "live"
    ? "https://app.alpaca.markets/live/dashboard/overview"
    : "https://app.alpaca.markets/paper/dashboard/overview";

  try {
    await openUrl(url);
    return { success: true, url };
  } catch (error) {
    return { success: false, error: error.message, url };
  }
};

/**
 * Test Alpaca connection with keys
 */
export const testAlpacaConnection = async (key, secret, mode = "paper") => {
  const baseUrl = mode === "live"
    ? "https://api.alpaca.markets"
    : "https://paper-api.alpaca.markets";

  try {
    const response = await fetch(`${baseUrl}/v2/account`, {
      headers: {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret
      }
    });

    if (response.ok) {
      const account = await response.json();
      return {
        success: true,
        account: {
          id: account.id,
          status: account.status,
          equity: account.equity,
          cash: account.cash,
          buyingPower: account.buying_power
        }
      };
    } else {
      const error = await response.text();
      return { success: false, error: `API error: ${response.status}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Save keys to .env file
 */
export const saveKeysToEnv = (key, secret) => {
  const envPath = path.join(process.cwd(), ".env");

  try {
    let content = "";
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf-8");
    }

    // Update or add ALPACA_KEY
    if (content.includes("ALPACA_KEY=")) {
      content = content.replace(/ALPACA_KEY=.*/g, `ALPACA_KEY=${key}`);
    } else {
      content += `\nALPACA_KEY=${key}`;
    }

    // Update or add ALPACA_SECRET
    if (content.includes("ALPACA_SECRET=")) {
      content = content.replace(/ALPACA_SECRET=.*/g, `ALPACA_SECRET=${secret}`);
    } else {
      content += `\nALPACA_SECRET=${secret}`;
    }

    fs.writeFileSync(envPath, content.trim() + "\n");

    // Also set in process.env for immediate use
    process.env.ALPACA_KEY = key;
    process.env.ALPACA_SECRET = secret;

    return true;
  } catch (error) {
    console.error("Failed to save keys to .env:", error.message);
    return false;
  }
};

/**
 * Get setup display for current step
 */
export const getSetupDisplay = (step, currentConfig = {}) => {
  const config = { ...getDefaultConfig(), ...currentConfig };

  switch (step) {
    case SETUP_STEPS.MODE:
      return formatModeSelection(config.mode);
    case SETUP_STEPS.STRATEGY:
      return formatStrategySelection(config.strategy);
    case SETUP_STEPS.RISK:
      return formatRiskSelection(config.risk);
    case SETUP_STEPS.KEYS:
      return formatKeysStep(config);
    case SETUP_STEPS.COMPLETE:
      return formatComplete(config);
    default:
      return formatOverview(config);
  }
};

const formatModeSelection = (current) => `
Alpaca Setup - Step 1/4: Trading Mode
${"═".repeat(45)}

Select your trading mode:

  ${current === "live" ? "▸" : " "} Live           Real money trading
  ${current === "paper" ? "▸" : " "} Paper (Recommended)  Practice with fake money

${"─".repeat(45)}
Commands:
  /alpaca live    - Select Live trading
  /alpaca paper   - Select Paper trading (recommended)

Current: ${current === "live" ? "Live" : "Paper"}
`;

const formatStrategySelection = (current) => `
Alpaca Setup - Step 2/4: Strategy
${"═".repeat(45)}

Select your trading strategy:

  ${current === "swing" ? "▸" : " "} Swing Trading    Hold positions for days/weeks
  ${current === "options" ? "▸" : " "} Options Trading  Trade options contracts

${"─".repeat(45)}
Commands:
  /alpaca swing   - Select Swing trading
  /alpaca options - Select Options trading

Current: ${current === "swing" ? "Swing Trading" : "Options Trading"}
`;

const formatRiskSelection = (current) => `
Alpaca Setup - Step 3/4: Risk Level
${"═".repeat(45)}

Select your risk tolerance:

  ${current === "conservative" ? "▸" : " "} Conservative (Recommended)  Lower risk, steady gains
  ${current === "risky" ? "▸" : " "} Risky                       Higher risk, larger swings

${"─".repeat(45)}
Commands:
  /alpaca conservative - Select Conservative (recommended)
  /alpaca risky        - Select Risky

Current: ${current === "conservative" ? "Conservative" : "Risky"}
`;

const formatKeysStep = (config) => `
Alpaca Setup - Step 4/4: API Keys
${"═".repeat(45)}

To connect to Alpaca, you need API keys.

Option 1: Open Alpaca Dashboard
  /alpaca keys    - Opens browser to get your keys

Option 2: Enter Keys Directly
  /alpaca key <your-key>
  /alpaca secret <your-secret>

${"─".repeat(45)}
After entering keys, BACKBONE will automatically connect.

Key:    ${config.apiKey ? "••••••" + config.apiKey.slice(-4) : "Not set"}
Secret: ${config.apiSecret ? "••••••" + config.apiSecret.slice(-4) : "Not set"}
`;

const formatComplete = (config) => `
Alpaca Setup Complete!
${"═".repeat(45)}

Your configuration:
  Mode:     ${config.mode === "live" ? "Live" : "Paper"}
  Strategy: ${config.strategy === "swing" ? "Swing Trading" : "Options"}
  Risk:     ${config.risk === "conservative" ? "Conservative" : "Risky"}
  Status:   ${config.configured ? "Connected" : "Waiting for keys..."}

${"─".repeat(45)}
To change settings:
  /alpaca live|paper       - Change mode
  /alpaca swing|options    - Change strategy
  /alpaca conservative|risky - Change risk level
  /alpaca status           - View current status
`;

const formatOverview = (config) => `
Alpaca Trading Configuration
${"═".repeat(45)}

Current Settings:
  Mode:     ${config.mode === "live" ? "● Live" : "○ Paper"} ${config.mode === "paper" ? "(Recommended)" : ""}
  Strategy: ${config.strategy === "swing" ? "● Swing" : "○ Options"}
  Risk:     ${config.risk === "conservative" ? "● Conservative" : "○ Risky"}
  Status:   ${config.configured ? "● Connected" : "○ Not connected"}

${"─".repeat(45)}
Quick Commands:
  /alpaca setup  - Run setup wizard
  /alpaca live   - Switch to Live mode
  /alpaca paper  - Switch to Paper mode
  /alpaca swing  - Switch to Swing trading
  /alpaca options - Switch to Options trading
  /alpaca conservative - Switch to Conservative
  /alpaca risky  - Switch to Risky
  /alpaca keys   - Open Alpaca to get API keys
  /alpaca status - View connection status
`;

/**
 * Get current settings display
 */
export const getCurrentSettings = () => {
  const config = loadAlpacaConfig();
  return formatOverview(config);
};

/**
 * Update single setting
 */
export const updateSetting = (setting, value) => {
  const config = loadAlpacaConfig();

  switch (setting) {
    case "mode":
      if (value === "live" || value === "paper") {
        config.mode = value;
      }
      break;
    case "strategy":
      if (value === "swing" || value === "options") {
        config.strategy = value;
      }
      break;
    case "risk":
      if (value === "conservative" || value === "risky") {
        config.risk = value;
      }
      break;
    case "key":
      config.apiKey = value;
      break;
    case "secret":
      config.apiSecret = value;
      break;
  }

  config.lastUpdated = new Date().toISOString();

  // Check if fully configured
  if (config.apiKey && config.apiSecret) {
    config.configured = true;
  }

  saveAlpacaConfig(config);
  return config;
};

/**
 * Get connection status
 */
export const getConnectionStatus = async () => {
  const config = loadAlpacaConfig();

  if (!config.apiKey || !config.apiSecret) {
    return {
      connected: false,
      message: "API keys not configured. Run /alpaca setup or /alpaca keys",
      config
    };
  }

  const result = await testAlpacaConnection(config.apiKey, config.apiSecret, config.mode);

  if (result.success) {
    return {
      connected: true,
      message: `Connected to Alpaca (${config.mode})`,
      account: result.account,
      config
    };
  } else {
    return {
      connected: false,
      message: `Connection failed: ${result.error}`,
      config
    };
  }
};

/**
 * Format status display
 */
export const formatStatus = async () => {
  const status = await getConnectionStatus();
  const config = status.config;

  if (status.connected) {
    return `
Alpaca Status: Connected
${"═".repeat(45)}

Account:
  ID:           ${status.account.id}
  Status:       ${status.account.status}
  Equity:       $${parseFloat(status.account.equity).toLocaleString()}
  Cash:         $${parseFloat(status.account.cash).toLocaleString()}
  Buying Power: $${parseFloat(status.account.buyingPower).toLocaleString()}

Settings:
  Mode:     ${config.mode === "live" ? "Live" : "Paper"}
  Strategy: ${config.strategy === "swing" ? "Swing" : "Options"}
  Risk:     ${config.risk === "conservative" ? "Conservative" : "Risky"}
`;
  } else {
    return `
Alpaca Status: Not Connected
${"═".repeat(45)}

${status.message}

Settings:
  Mode:     ${config.mode === "live" ? "Live" : "Paper"}
  Strategy: ${config.strategy === "swing" ? "Swing" : "Options"}
  Risk:     ${config.risk === "conservative" ? "Conservative" : "Risky"}

Run /alpaca setup to configure.
`;
  }
};
