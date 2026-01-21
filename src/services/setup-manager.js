import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import os from "os";

/**
 * Setup Manager Service
 * Handles opening config files, watching for changes, and managing setup state
 */

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * Ensure data directory exists
 */
const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Open a file in the system's default editor
 */
export const openFileInEditor = async (filePath) => {
  const platform = os.platform();

  try {
    let editor;
    let args;

    if (platform === "win32") {
      // Windows - use notepad or default editor
      editor = "notepad.exe";
      args = [filePath];
    } else if (platform === "darwin") {
      // macOS - use open command
      editor = "open";
      args = ["-e", filePath]; // -e opens in TextEdit
    } else {
      // Linux - try common editors
      const editors = ["code", "gedit", "nano", "vim", "vi"];
      for (const ed of editors) {
        try {
          const which = spawn("which", [ed]);
          await new Promise((resolve, reject) => {
            which.on("close", code => code === 0 ? resolve() : reject());
            which.on("error", reject);
          });
          editor = ed;
          args = [filePath];
          break;
        } catch {
          continue;
        }
      }
      if (!editor) {
        editor = "xdg-open";
        args = [filePath];
      }
    }

    const child = spawn(editor, args, {
      detached: true,
      stdio: "ignore"
    });

    child.unref();

    return { success: true, editor, filePath };
  } catch (error) {
    return { success: false, error: error.message, filePath };
  }
};

/**
 * Create Alpaca keys config file
 */
export const createAlpacaKeysFile = () => {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, "alpaca-keys.json");

  const template = {
    _instructions: "Fill in your Alpaca API keys below and save this file.",
    _help: "Get keys from: https://app.alpaca.markets/paper/dashboard/overview",
    key: "",
    secret: "",
    _note: "After saving, BACKBONE will automatically detect and connect."
  };

  fs.writeFileSync(filePath, JSON.stringify(template, null, 2));
  return filePath;
};

/**
 * Create Oura keys config file
 */
export const createOuraKeysFile = () => {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, "oura-keys.json");

  const template = {
    _instructions: "Fill in your Oura Personal Access Token below and save.",
    _help: "Get token from: https://cloud.ouraring.com/personal-access-tokens",
    accessToken: "",
    _note: "After saving, BACKBONE will automatically detect and connect."
  };

  fs.writeFileSync(filePath, JSON.stringify(template, null, 2));
  return filePath;
};

/**
 * Create LLM keys config file
 */
export const createLLMKeysFile = (provider = "claude") => {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, "llm-keys.json");

  const template = {
    _instructions: "Fill in your API key for your chosen provider.",
    provider: provider,
    claude: {
      _help: "Get from: https://console.anthropic.com/settings/keys",
      apiKey: ""
    },
    openai: {
      _help: "Get from: https://platform.openai.com/api-keys",
      apiKey: ""
    },
    gemini: {
      _help: "Get from: https://makersuite.google.com/app/apikey",
      apiKey: ""
    },
    _note: "After saving, BACKBONE will automatically detect and connect."
  };

  fs.writeFileSync(filePath, JSON.stringify(template, null, 2));
  return filePath;
};

/**
 * Read Alpaca keys from config file
 */
export const readAlpacaKeysFile = () => {
  const filePath = path.join(DATA_DIR, "alpaca-keys.json");

  try {
    if (fs.existsSync(filePath)) {
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return {
        key: content.key || null,
        secret: content.secret || null,
        hasKeys: Boolean(content.key && content.secret)
      };
    }
  } catch (error) {
    console.error("Failed to read Alpaca keys:", error.message);
  }

  return { key: null, secret: null, hasKeys: false };
};

/**
 * Read Oura keys from config file
 */
export const readOuraKeysFile = () => {
  const filePath = path.join(DATA_DIR, "oura-keys.json");

  try {
    if (fs.existsSync(filePath)) {
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return {
        accessToken: content.accessToken || null,
        hasToken: Boolean(content.accessToken)
      };
    }
  } catch (error) {
    console.error("Failed to read Oura keys:", error.message);
  }

  return { accessToken: null, hasToken: false };
};

/**
 * Read LLM keys from config file
 */
export const readLLMKeysFile = () => {
  const filePath = path.join(DATA_DIR, "llm-keys.json");

  try {
    if (fs.existsSync(filePath)) {
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return {
        provider: content.provider || "claude",
        claude: content.claude?.apiKey || null,
        openai: content.openai?.apiKey || null,
        gemini: content.gemini?.apiKey || null
      };
    }
  } catch (error) {
    console.error("Failed to read LLM keys:", error.message);
  }

  return { provider: "claude", claude: null, openai: null, gemini: null };
};

/**
 * Watch a keys file for changes
 */
export const watchKeysFile = (filePath, callback) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  let lastContent = fs.readFileSync(filePath, "utf-8");

  const watcher = fs.watch(filePath, (eventType) => {
    if (eventType === "change") {
      try {
        const newContent = fs.readFileSync(filePath, "utf-8");
        if (newContent !== lastContent) {
          lastContent = newContent;
          const parsed = JSON.parse(newContent);
          callback(parsed);
        }
      } catch (error) {
        // File might be in the middle of being written
      }
    }
  });

  return watcher;
};

/**
 * Save keys to .env file
 */
export const saveToEnv = (key, value) => {
  const envPath = path.join(process.cwd(), ".env");

  try {
    let content = "";
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf-8");
    }

    // Update or add the key
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (content.match(regex)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }

    fs.writeFileSync(envPath, content.trim() + "\n");

    // Also set in process.env
    process.env[key] = value;

    return true;
  } catch (error) {
    console.error(`Failed to save ${key} to .env:`, error.message);
    return false;
  }
};

/**
 * Open Alpaca keys file and return path
 */
export const openAlpacaKeys = async () => {
  const filePath = createAlpacaKeysFile();
  const result = await openFileInEditor(filePath);
  return { ...result, filePath };
};

/**
 * Open Oura keys file and return path
 */
export const openOuraKeys = async () => {
  const filePath = createOuraKeysFile();
  const result = await openFileInEditor(filePath);
  return { ...result, filePath };
};

/**
 * Open LLM keys file and return path
 */
export const openLLMKeys = async (provider = "claude") => {
  const filePath = createLLMKeysFile(provider);
  const result = await openFileInEditor(filePath);
  return { ...result, filePath };
};

/**
 * Setup state management
 */
export const SETUP_TYPES = {
  ALPACA: "alpaca",
  LINKEDIN: "linkedin",
  OURA: "oura",
  LLM: "llm",
  MODELS: "models",
  PROJECT: "project",
  EMAIL: "email",
  CALENDAR: "calendar"
};

/**
 * Get current setup state
 */
export const getSetupState = () => {
  const alpacaKeys = readAlpacaKeysFile();
  const ouraKeys = readOuraKeysFile();
  const llmKeys = readLLMKeysFile();

  return {
    alpaca: {
      configured: alpacaKeys.hasKeys,
      key: alpacaKeys.key,
      secret: alpacaKeys.secret
    },
    oura: {
      configured: ouraKeys.hasToken,
      token: ouraKeys.accessToken
    },
    llm: {
      configured: Boolean(llmKeys.claude || llmKeys.openai || llmKeys.gemini),
      provider: llmKeys.provider,
      keys: llmKeys
    }
  };
};
