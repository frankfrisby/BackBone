/**
 * backbone msg — Messaging CLI for BACKBONE
 *
 * Send and read WhatsApp messages from the terminal.
 */

import fs from "fs";
import http from "http";
import { dataFile } from "../services/paths.js";
import { section, label, ok, warn, info, fail, theme, symbols } from "./theme.js";

const HELP = `
backbone msg — Messaging CLI

Usage:
  backbone msg send <text>       Send a WhatsApp message to the user
  backbone msg history           Show recent message history
  backbone msg status            Show messaging status

Options:
  --json          Output machine-readable JSON
  --lines N       Number of messages to show (default: 20)
  --help          Show this help
`;

function postJson(urlPath, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      `http://localhost:3000${urlPath}`,
      {
        method: "POST",
        timeout: 5000,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, data: data }); }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

function fetchJson(urlPath) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:3000${urlPath}`, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function loadMessageLog() {
  const logPath = dataFile("unified-message-log.json");
  try {
    const raw = fs.readFileSync(logPath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.messages || [];
  } catch {
    return [];
  }
}

function truncate(str, len) {
  if (!str) return "";
  const oneLine = str.replace(/\n/g, " ").trim();
  return oneLine.length > len ? oneLine.slice(0, len) + "..." : oneLine;
}

function formatTimestamp(iso) {
  if (!iso) return "unknown";
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  if (isToday) return time;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + time;
}

// ── send ──────────────────────────────────────────────────────

async function cmdSend(text, flags) {
  if (!text) {
    console.log(fail("No message text provided."));
    console.log(theme.muted("  Usage: backbone msg send <text>"));
    process.exit(1);
  }

  const res = await postJson("/api/whatsapp/send", { message: text });

  if (!res) {
    if (flags.json) return console.log(JSON.stringify({ ok: false, error: "Server unreachable" }));
    console.log(fail("Server is not running (localhost:3000)."));
    return;
  }

  if (flags.json) return console.log(JSON.stringify({ ok: res.status < 300, status: res.status, data: res.data }));

  if (res.status < 300) {
    console.log(ok("Message sent via WhatsApp"));
    console.log(label("Content", truncate(text, 80)));
  } else {
    console.log(fail(`Send failed (HTTP ${res.status})`));
    if (res.data) console.log(label("Response", typeof res.data === "string" ? res.data : JSON.stringify(res.data)));
  }
}

// ── history ───────────────────────────────────────────────────

function cmdHistory(flags) {
  const messages = loadMessageLog();
  const lines = flags.lines || 20;
  const recent = messages.slice(-lines);

  if (flags.json) return console.log(JSON.stringify(recent, null, 2));

  if (recent.length === 0) {
    console.log(warn("No messages found."));
    return;
  }

  console.log(section(`Message History (last ${recent.length})`));
  console.log("");

  for (const msg of recent) {
    const time = theme.muted(formatTimestamp(msg.timestamp));
    const channel = msg.channel ? theme.muted(`[${msg.channel}]`) : "";
    const roleColor = msg.role === "user" ? theme.info : theme.success;
    const roleName = roleColor(msg.role === "user" ? "You" : "AI ");
    const preview = truncate(msg.content, 100);

    console.log(`  ${time} ${channel} ${roleName} ${preview}`);
  }

  console.log("");
  console.log(theme.muted(`  Total messages in log: ${messages.length}`));
}

// ── status ────────────────────────────────────────────────────

async function cmdStatus(flags) {
  const messages = loadMessageLog();
  const now = new Date();
  const todayStr = now.toDateString();
  const todayMessages = messages.filter((m) => new Date(m.timestamp).toDateString() === todayStr);
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;

  // Try server health
  const health = await fetchJson("/api/health");
  const serverUp = !!health;

  // Try WhatsApp status from server
  const waStatus = serverUp ? await fetchJson("/api/whatsapp/status") : null;
  const waConnected = waStatus?.connected ?? false;

  if (flags.json) {
    return console.log(
      JSON.stringify({
        server: serverUp,
        whatsapp: waConnected,
        totalMessages: messages.length,
        todayMessages: todayMessages.length,
        lastMessage: lastMsg ? { role: lastMsg.role, timestamp: lastMsg.timestamp, channel: lastMsg.channel } : null,
      }, null, 2)
    );
  }

  console.log(section("Messaging Status"));
  console.log("");
  console.log(serverUp ? ok("Server running") : fail("Server offline"));
  console.log(waConnected ? ok("WhatsApp connected") : warn("WhatsApp not connected"));
  console.log(label("Messages today", todayMessages.length));
  console.log(label("Total messages", messages.length));

  if (lastMsg) {
    const who = lastMsg.role === "user" ? "You" : "AI";
    console.log(label("Last message", `${who} ${symbols.dot} ${formatTimestamp(lastMsg.timestamp)}`));
    console.log(label("Preview", truncate(lastMsg.content, 80)));
  }
}

// ── main ──────────────────────────────────────────────────────

export async function runMsg(args) {
  const flags = { json: false, lines: 20 };
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") flags.json = true;
    else if (args[i] === "--lines" && args[i + 1]) { flags.lines = parseInt(args[++i], 10) || 20; }
    else if (args[i] === "--help" || args[i] === "-h") { console.log(HELP); return; }
    else positional.push(args[i]);
  }

  const sub = positional[0];

  switch (sub) {
    case "send":
      await cmdSend(positional.slice(1).join(" "), flags);
      break;
    case "history":
      cmdHistory(flags);
      break;
    case "status":
      await cmdStatus(flags);
      break;
    default:
      console.log(HELP);
  }
}
