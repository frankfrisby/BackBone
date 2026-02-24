/**
 * backbone config — Get/set user configuration
 *
 * Inspired by OpenClaw's `openclaw config get/set/list`.
 */

import fs from "fs";
import { dataFile } from "../services/paths.js";
import { section, label, ok, warn, theme } from "./theme.js";

const HELP = `
backbone config — Get/set user configuration

Usage: backbone config <action> [key] [value]

Actions:
  list                 List all config values
  get <key>            Get a specific config value (dot notation)
  set <key> <value>    Set a config value
  reset                Reset to defaults (requires --confirm)
  edit                 Print config file path for manual editing

Examples:
  backbone config list
  backbone config get theme
  backbone config set quietHoursStart 23
  backbone config set diagnostics.separateLogWindow false

Options:
  --json      Output machine-readable JSON
  --confirm   Required for reset
  --help      Show this help
`;

function getSettingsPath() {
  return dataFile("user-settings.json");
}

function readSettings() {
  const p = getSettingsPath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}

function getNestedValue(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

function setNestedValue(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  let target = obj;
  for (const k of keys) {
    if (typeof target[k] !== "object" || target[k] === null) target[k] = {};
    target = target[k];
  }
  // Auto-parse booleans and numbers
  if (value === "true") value = true;
  else if (value === "false") value = false;
  else if (!isNaN(value) && value !== "") value = Number(value);
  target[last] = value;
  return obj;
}

const SENSITIVE_KEYS = ["idToken", "token", "password", "secret", "apiKey", "refreshToken", "accessToken"];

function isSensitiveKey(key) {
  const lastPart = key.split(".").pop().toLowerCase();
  return SENSITIVE_KEYS.some(s => lastPart.toLowerCase().includes(s.toLowerCase()));
}

function redact(value) {
  const str = String(value);
  if (str.length <= 8) return "••••";
  return "••••" + str.slice(-4);
}

function flattenObject(obj, prefix = "") {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

export async function runConfig(args) {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.log(HELP);
    return;
  }

  const jsonMode = args.includes("--json");
  const action = args[0];

  switch (action) {
    case "list": {
      const settings = readSettings();
      if (jsonMode) {
        console.log(JSON.stringify(settings, null, 2));
        return;
      }
      console.log(theme.heading("\n  BACKBONE Configuration\n"));
      const flat = flattenObject(settings);
      const keys = Object.keys(flat).sort();
      if (keys.length === 0) {
        console.log(warn("No configuration set"));
        return;
      }
      for (const key of keys) {
        const val = flat[key];
        const displayVal = isSensitiveKey(key) ? redact(val) : val;
        const display = typeof displayVal === "string" ? theme.info(`"${displayVal}"`) :
                        typeof displayVal === "boolean" ? (displayVal ? theme.success(String(displayVal)) : theme.warn(String(displayVal))) :
                        theme.accent(String(displayVal));
        console.log(label(key, display));
      }
      console.log("");
      break;
    }

    case "get": {
      const key = args[1];
      if (!key) {
        console.error(theme.error("Usage: backbone config get <key>"));
        process.exit(1);
      }
      const settings = readSettings();
      const value = getNestedValue(settings, key);
      if (jsonMode) {
        console.log(JSON.stringify({ key, value }));
      } else if (value === undefined) {
        console.log(theme.muted(`${key} is not set`));
      } else {
        console.log(`${theme.muted(key + ":")} ${JSON.stringify(value)}`);
      }
      break;
    }

    case "set": {
      const key = args[1];
      let value = args[2];
      if (!key || value === undefined) {
        console.error(theme.error("Usage: backbone config set <key> <value>"));
        process.exit(1);
      }
      const settings = readSettings();
      setNestedValue(settings, key, value);
      writeSettings(settings);
      console.log(ok(`Set ${key} = ${JSON.stringify(getNestedValue(settings, key))}`));
      break;
    }

    case "reset": {
      if (!args.includes("--confirm")) {
        console.log(warn("This will reset all settings to defaults. Add --confirm to proceed."));
        return;
      }
      const defaults = { theme: "dark", quietHoursStart: 22, quietHoursEnd: 7 };
      writeSettings(defaults);
      console.log(ok("Configuration reset to defaults"));
      break;
    }

    case "edit": {
      const p = getSettingsPath();
      console.log(theme.muted("Config file:"));
      console.log(p);
      break;
    }

    default:
      console.error(theme.error(`Unknown action: ${action}`));
      console.log(HELP);
      process.exit(1);
  }
}
