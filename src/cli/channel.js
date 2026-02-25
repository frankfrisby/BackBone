/**
 * backbone channel — Manage messaging channels (OpenClaw-style)
 *
 * Subcommands:
 *   list                  List all channels with status
 *   status                Channel router health overview
 *   enable <channel>      Enable a channel
 *   disable <channel>     Disable a channel
 *   restart <channel>     Restart a channel connection
 *   config <channel>      Show/set channel configuration
 *   add <channel>         Interactive setup for a new channel
 */

import fs from "fs";
import path from "path";
import http from "http";
import { getDataDir } from "../services/paths.js";

const HELP = `
backbone channel — Manage messaging channels

Usage: backbone channel <subcommand> [options]

Subcommands:
  list                  List all channels with connection status
  status                Router health overview
  enable <id>           Enable a channel
  disable <id>          Disable a channel
  restart <id>          Restart a channel connection
  config <id> [key=val] Show or set channel config
  add <id>              Set up a new channel (telegram, discord, slack, sms)

Channels:
  whatsapp              WhatsApp (Baileys + Twilio)
  telegram              Telegram Bot (grammY)
  discord               Discord Bot (discord.js)
  slack                 Slack App (Bolt, Socket Mode)
  sms                   SMS (Twilio)

Options:
  --json                Output machine-readable JSON
  --help                Show this help

Examples:
  backbone channel list
  backbone channel add telegram
  backbone channel config telegram token=123:ABC...
  backbone channel enable discord
  backbone channel restart whatsapp
`;

const CHANNEL_CONFIGS_FILE = path.join(getDataDir(), "channel-configs.json");
const ROUTER_CONFIG_FILE = path.join(getDataDir(), "channel-router.json");

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {}
  return null;
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function fetchJson(urlPath) {
  return new Promise((resolve) => {
    const req = http.get("http://localhost:3000" + urlPath, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

const STATUS_ICONS = {
  connected: "\x1b[32m●\x1b[0m",
  connecting: "\x1b[33m◌\x1b[0m",
  disconnected: "\x1b[90m○\x1b[0m",
  error: "\x1b[31m✗\x1b[0m",
  pairing: "\x1b[35m◎\x1b[0m",
  idle: "\x1b[90m○\x1b[0m",
};

const ALL_CHANNELS = [
  { id: "whatsapp", label: "WhatsApp", setup: "Scan QR code in WhatsApp > Linked Devices" },
  { id: "telegram", label: "Telegram", setup: "Get bot token from @BotFather on Telegram" },
  { id: "discord", label: "Discord", setup: "Create app at discord.com/developers → Bot → copy token" },
  { id: "slack", label: "Slack", setup: "Create app at api.slack.com → Socket Mode → get tokens" },
  { id: "sms", label: "SMS", setup: "Uses existing Twilio credentials" },
];

// ── Subcommands ─────────────────────────────────────────────────

async function cmdList(args) {
  const jsonMode = args.includes("--json");

  // Try server API first
  const serverData = await fetchJson("/api/channels/status");
  const routerConfig = readJson(ROUTER_CONFIG_FILE) || { enabledChannels: ["whatsapp"] };
  const channelConfigs = readJson(CHANNEL_CONFIGS_FILE) || {};

  const rows = ALL_CHANNELS.map((ch) => {
    const serverCh = serverData?.channels?.[ch.id];
    const enabled = (routerConfig.enabledChannels || []).includes(ch.id);
    const configured = !!channelConfigs[ch.id]?.token || !!channelConfigs[ch.id]?.botToken || ch.id === "whatsapp";

    return {
      id: ch.id,
      label: ch.label,
      enabled,
      configured,
      status: serverCh?.status || (enabled && configured ? "idle" : "disabled"),
      messages: serverCh?.messages || { in: 0, out: 0 },
    };
  });

  if (jsonMode) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log("\n  \x1b[1mMessaging Channels\x1b[0m\n");
  console.log("  " + pad("Channel", 14) + pad("Status", 16) + pad("Enabled", 10) + pad("Configured", 12) + "Messages");
  console.log("  " + "─".repeat(64));

  for (const r of rows) {
    const icon = STATUS_ICONS[r.status] || STATUS_ICONS.idle;
    const enabledStr = r.enabled ? "\x1b[32myes\x1b[0m" : "\x1b[90mno\x1b[0m";
    const configStr = r.configured ? "\x1b[32myes\x1b[0m" : "\x1b[33mno\x1b[0m";
    const msgStr = `${r.messages.in}↓ ${r.messages.out}↑`;
    console.log(`  ${icon} ${pad(r.label, 13)}${pad(r.status, 15)}${pad(enabledStr, 14)}${pad(configStr, 16)}${msgStr}`);
  }

  console.log("");
}

async function cmdStatus(args) {
  const serverData = await fetchJson("/api/channels/status");

  if (!serverData) {
    console.log("\n  \x1b[31m✗\x1b[0m Server not responding. Channel router status unavailable.\n");
    return;
  }

  if (args.includes("--json")) {
    console.log(JSON.stringify(serverData, null, 2));
    return;
  }

  console.log("\n  \x1b[1mChannel Router Status\x1b[0m\n");
  console.log(`  Router:     ${serverData.started ? "\x1b[32mrunning\x1b[0m" : "\x1b[31mstopped\x1b[0m"}`);
  console.log(`  Channels:   ${serverData.channelCount || 0} registered, ${serverData.connectedCount || 0} connected`);
  console.log("");
}

async function cmdEnable(args) {
  const channelId = args.find((a) => !a.startsWith("-"));
  if (!channelId) { console.log("Usage: backbone channel enable <id>"); return; }

  const config = readJson(ROUTER_CONFIG_FILE) || { enabledChannels: [] };
  if (!config.enabledChannels) config.enabledChannels = [];
  if (!config.enabledChannels.includes(channelId)) {
    config.enabledChannels.push(channelId);
    writeJson(ROUTER_CONFIG_FILE, config);
    console.log(`\x1b[32m✓\x1b[0m Channel '${channelId}' enabled. Restart server to connect.`);
  } else {
    console.log(`Channel '${channelId}' is already enabled.`);
  }
}

async function cmdDisable(args) {
  const channelId = args.find((a) => !a.startsWith("-"));
  if (!channelId) { console.log("Usage: backbone channel disable <id>"); return; }

  const config = readJson(ROUTER_CONFIG_FILE) || { enabledChannels: [] };
  config.enabledChannels = (config.enabledChannels || []).filter((c) => c !== channelId);
  writeJson(ROUTER_CONFIG_FILE, config);
  console.log(`\x1b[32m✓\x1b[0m Channel '${channelId}' disabled.`);
}

async function cmdRestart(args) {
  const channelId = args.find((a) => !a.startsWith("-"));
  if (!channelId) { console.log("Usage: backbone channel restart <id>"); return; }

  console.log(`Restarting ${channelId}...`);
  const res = await fetchJson(`/api/channels/restart?channel=${channelId}`);
  if (res?.success) {
    console.log(`\x1b[32m✓\x1b[0m ${channelId} restarted (status: ${res.status})`);
  } else {
    console.log(`\x1b[31m✗\x1b[0m Failed: ${res?.error || "Server not responding"}`);
  }
}

async function cmdConfig(args) {
  const channelId = args.find((a) => !a.startsWith("-") && !a.includes("="));
  if (!channelId) { console.log("Usage: backbone channel config <id> [key=value ...]"); return; }

  const configs = readJson(CHANNEL_CONFIGS_FILE) || {};
  if (!configs[channelId]) configs[channelId] = {};

  const setters = args.filter((a) => a.includes("="));
  if (setters.length > 0) {
    for (const s of setters) {
      const [key, ...valParts] = s.split("=");
      const val = valParts.join("=");
      configs[channelId][key] = val;
      console.log(`  ${key} = ${val.length > 8 ? val.slice(0, 4) + "••••" + val.slice(-4) : val}`);
    }
    writeJson(CHANNEL_CONFIGS_FILE, configs);
    console.log(`\x1b[32m✓\x1b[0m Config saved for '${channelId}'.`);
  } else {
    // Show config
    const chConf = configs[channelId] || {};
    const keys = Object.keys(chConf);
    if (keys.length === 0) {
      console.log(`  No config for '${channelId}'.`);
      const info = ALL_CHANNELS.find((c) => c.id === channelId);
      if (info) console.log(`  Setup: ${info.setup}`);
    } else {
      console.log(`\n  Config for '${channelId}':\n`);
      for (const [k, v] of Object.entries(chConf)) {
        const display = (k.includes("token") || k.includes("Token") || k.includes("secret"))
          ? String(v).slice(0, 4) + "••••" + String(v).slice(-4)
          : v;
        console.log(`  ${k} = ${display}`);
      }
      console.log("");
    }
  }
}

async function cmdAdd(args) {
  const channelId = args.find((a) => !a.startsWith("-"));
  if (!channelId) {
    console.log("Usage: backbone channel add <id>\n");
    console.log("Available channels:");
    for (const ch of ALL_CHANNELS) {
      console.log(`  ${pad(ch.id, 14)} ${ch.label} — ${ch.setup}`);
    }
    return;
  }

  const info = ALL_CHANNELS.find((c) => c.id === channelId);
  if (!info) {
    console.log(`Unknown channel: ${channelId}`);
    return;
  }

  console.log(`\n  \x1b[1mSetup: ${info.label}\x1b[0m\n`);
  console.log(`  ${info.setup}\n`);

  switch (channelId) {
    case "telegram":
      console.log("  Steps:");
      console.log("  1. Open Telegram, search for @BotFather");
      console.log("  2. Send /newbot and follow the prompts");
      console.log("  3. Copy the bot token");
      console.log("  4. Run: backbone channel config telegram token=YOUR_BOT_TOKEN");
      console.log("  5. Run: backbone channel config telegram ownerId=YOUR_TELEGRAM_USER_ID");
      console.log("  6. Run: backbone channel enable telegram");
      console.log("  7. Restart the server\n");
      console.log("  To find your user ID, message @userinfobot on Telegram.\n");
      break;

    case "discord":
      console.log("  Steps:");
      console.log("  1. Go to https://discord.com/developers/applications");
      console.log("  2. New Application → Bot tab → Add Bot → copy token");
      console.log("  3. Enable MESSAGE CONTENT INTENT in Bot settings");
      console.log("  4. OAuth2 → URL Generator → bot scope → Send Messages + Read History");
      console.log("  5. Use the generated URL to invite bot to your server");
      console.log("  6. Run: backbone channel config discord token=YOUR_BOT_TOKEN");
      console.log("  7. Run: backbone channel config discord ownerId=YOUR_DISCORD_USER_ID");
      console.log("  8. Run: backbone channel enable discord");
      console.log("  9. Restart the server\n");
      break;

    case "slack":
      console.log("  Steps:");
      console.log("  1. Go to https://api.slack.com/apps → Create New App");
      console.log("  2. Enable Socket Mode (Settings → Socket Mode)");
      console.log("  3. Add Bot Token Scopes: chat:write, im:history, app_mentions:read");
      console.log("  4. Enable Events: message.im, app_mention");
      console.log("  5. Install to Workspace → copy Bot Token (xoxb-...)");
      console.log("  6. Copy App-Level Token (xapp-...) from Basic Information");
      console.log("  7. Run: backbone channel config slack botToken=xoxb-YOUR-TOKEN");
      console.log("  8. Run: backbone channel config slack appToken=xapp-YOUR-TOKEN");
      console.log("  9. Run: backbone channel enable slack");
      console.log("  10. Restart the server\n");
      break;

    case "sms":
      console.log("  Steps:");
      console.log("  1. Uses existing Twilio credentials (same as WhatsApp)");
      console.log("  2. Run: backbone channel enable sms");
      console.log("  3. Restart the server\n");
      break;

    default:
      console.log(`  Configure with: backbone channel config ${channelId} key=value`);
      console.log(`  Enable with:    backbone channel enable ${channelId}\n`);
  }
}

function pad(s, w) {
  return String(s).padEnd(w);
}

// ── Entry Point ─────────────────────────────────────────────────

export async function runChannel(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  const sub = args[0];
  const rest = args.slice(1);

  switch (sub) {
    case "list":
    case "ls":
      return cmdList(rest);
    case "status":
      return cmdStatus(rest);
    case "enable":
      return cmdEnable(rest);
    case "disable":
      return cmdDisable(rest);
    case "restart":
      return cmdRestart(rest);
    case "config":
    case "set":
      return cmdConfig(rest);
    case "add":
    case "setup":
      return cmdAdd(rest);
    default:
      if (!sub || sub.startsWith("-")) return cmdList(args);
      console.log(`Unknown subcommand: ${sub}`);
      console.log(HELP);
  }
}
