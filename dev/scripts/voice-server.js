#!/usr/bin/env node

/**
 * BACKBONE Voice Server
 *
 * Express + WebSocket server that proxies between browser and OpenAI Realtime API.
 * Browser captures mic audio, server relays to OpenAI, OpenAI audio relayed back.
 * API key stays server-side.
 *
 * Usage: node scripts/voice-server.js
 */

import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = 3100;

const REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";

function readFile(relPath) {
  try {
    const full = path.join(ROOT, relPath);
    if (fs.existsSync(full)) return fs.readFileSync(full, "utf-8");
  } catch {}
  return "";
}

function buildSystemPrompt() {
  const profile = readFile("memory/profile.md");
  const goals = readFile("memory/goals.md");
  const health = readFile("memory/health.md");
  const backbone = readFile("memory/BACKBONE.md");

  let scoresText = "";
  try {
    const scores = JSON.parse(readFile("data/life-scores.json") || "{}");
    if (scores && typeof scores === "object") {
      const entries = Object.entries(scores).filter(([k]) => k !== "lastUpdated");
      if (entries.length) {
        scoresText = "\n## Life Scores\n" + entries.map(([k, v]) => `- ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n");
      }
    }
  } catch {}

  return `You are BACKBONE, a personal life optimization AI. You know this user well. Be conversational, warm, and concise. This is a voice conversation — keep responses short (1-3 sentences usually).

${profile ? `## User Profile\n${profile}` : ""}
${goals ? `## Goals\n${goals}` : ""}
${health ? `## Health\n${health}` : ""}
${scoresText}

Start by greeting the user by name. Ask about their day, goals, or whatever seems most relevant right now.`;
}

// Express app
const app = express();
const server = createServer(app);

// Serve the HTML UI
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "voice-ui.html"));
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (browserWs) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    browserWs.send(JSON.stringify({ type: "error", message: "No OpenAI API key configured" }));
    browserWs.close();
    return;
  }

  console.log("[voice] Browser connected, opening OpenAI Realtime connection...");

  const openaiWs = new WebSocket(REALTIME_URL, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1"
    }
  });

  let sessionReady = false;

  openaiWs.on("open", () => {
    console.log("[voice] Connected to OpenAI Realtime API");

    // Configure session with audio modalities and user context
    openaiWs.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions: buildSystemPrompt(),
        voice: "alloy",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: {
          model: "whisper-1"
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        }
      }
    }));
  });

  openaiWs.on("message", (data) => {
    try {
      const event = JSON.parse(data.toString());

      // When session is ready, trigger the AI to speak first
      if (event.type === "session.updated" && !sessionReady) {
        sessionReady = true;
        console.log("[voice] Session configured, triggering initial greeting...");
        openaiWs.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text", "audio"]
          }
        }));
      }

      // Relay all events to browser
      if (browserWs.readyState === WebSocket.OPEN) {
        browserWs.send(data.toString());
      }

      // Log key events
      if (event.type === "error") {
        console.log("[voice] OpenAI error:", event.error?.message || JSON.stringify(event.error));
      }
    } catch {}
  });

  openaiWs.on("error", (err) => {
    console.log("[voice] OpenAI WS error:", err.message);
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: "error", message: err.message }));
    }
  });

  openaiWs.on("close", () => {
    console.log("[voice] OpenAI connection closed");
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: "session.closed" }));
      browserWs.close();
    }
  });

  // Relay browser messages to OpenAI
  browserWs.on("message", (data) => {
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(data.toString());
    }
  });

  browserWs.on("close", () => {
    console.log("[voice] Browser disconnected");
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });
});

// Kill any previous instance on this port, then start
function killPort(port) {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      exec(`netstat -aon | findstr :${port} | findstr LISTENING`, (err, stdout) => {
        if (!stdout) return resolve();
        const lines = stdout.trim().split("\n");
        for (const line of lines) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && pid !== "0") exec(`taskkill /F /PID ${pid}`);
        }
        setTimeout(resolve, 500);
      });
    } else {
      exec(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, () => setTimeout(resolve, 500));
    }
  });
}

killPort(PORT).then(() => {
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`[voice] Server running at ${url}`);

    // Open as standalone app window (no URL bar, no browser chrome)
    const platform = process.platform;
    if (platform === "win32") {
      // Try Edge first (always on Windows), fall back to Chrome
      exec(`start msedge --app=${url} --window-size=360,640`, (err) => {
        if (err) exec(`start chrome --app=${url} --window-size=360,640`);
      });
    } else if (platform === "darwin") {
      exec(`open -na "Google Chrome" --args --app=${url} --window-size=360,640`, (err) => {
        if (err) exec(`open ${url}`);
      });
    } else {
      exec(`google-chrome --app=${url} --window-size=360,640 2>/dev/null || xdg-open ${url}`);
    }
  });
});
