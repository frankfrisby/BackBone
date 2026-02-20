/**
 * BACKBONE Gateway Server
 *
 * Local WebSocket control plane that agents, CLI, and channels connect to.
 * Inspired by openclaw's gateway architecture but built for BACKBONE.
 *
 * Architecture:
 *   Clients (CLI, web, WhatsApp, etc.)
 *        │
 *        ▼
 *   Gateway (ws://127.0.0.1:18790)
 *        │
 *        ▼
 *   Agent Runtime (Claude SDK / CLI)
 *        │
 *        ▼
 *   Sessions (JSONL persistence)
 */

import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "events";
import http from "http";
import fs from "fs";
import path from "path";
import { getDataDir, dataFile } from "../paths.js";

const DEFAULT_PORT = 18790;
const HEARTBEAT_INTERVAL = 30_000;

// ── Message Types ─────────────────────────────────────────────

export const MSG = {
  // Client → Gateway
  AUTH: "auth",
  AGENT_REQUEST: "agent.request",       // Send task to agent
  AGENT_CANCEL: "agent.cancel",         // Cancel running agent
  SESSION_LIST: "session.list",         // List sessions
  SESSION_RESUME: "session.resume",     // Resume a session
  STATUS: "status",                     // Get gateway status
  PING: "ping",

  // Gateway → Client
  AUTH_OK: "auth.ok",
  AUTH_FAIL: "auth.fail",
  AGENT_STREAM: "agent.stream",         // Streaming token from agent
  AGENT_TOOL_USE: "agent.tool_use",     // Agent is using a tool
  AGENT_TOOL_RESULT: "agent.tool_result",// Tool result
  AGENT_DONE: "agent.done",            // Agent finished
  AGENT_ERROR: "agent.error",          // Agent errored
  SESSION_DATA: "session.data",        // Session list/details
  STATUS_DATA: "status.data",          // Status response
  PONG: "pong",
};

// ── Client Connection ─────────────────────────────────────────

class GatewayClient {
  constructor(ws, id) {
    this.ws = ws;
    this.id = id;
    this.authenticated = false;
    this.channel = "cli"; // cli | web | whatsapp | telegram | etc.
    this.connectedAt = Date.now();
    this.lastPing = Date.now();
    this.subscriptions = new Set(); // session IDs they're watching
  }

  send(type, payload = {}) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...payload, ts: Date.now() }));
    }
  }

  isAlive() {
    return Date.now() - this.lastPing < HEARTBEAT_INTERVAL * 2;
  }
}

// ── Gateway Server ────────────────────────────────────────────

export class GatewayServer extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.port = opts.port || DEFAULT_PORT;
    this.bind = opts.bind || "127.0.0.1"; // loopback only by default
    this.secret = opts.secret || process.env.BACKBONE_GATEWAY_SECRET || null;
    this.clients = new Map();      // id → GatewayClient
    this.sessions = new Map();     // sessionId → session state
    this.activeAgents = new Map(); // sessionId → agent handle
    this.server = null;
    this.wss = null;
    this._heartbeatTimer = null;
    this._clientCounter = 0;
    this._stateFile = dataFile("gateway-state.json");
  }

  async start() {
    // Check for port conflicts
    const inUse = await this._isPortInUse();
    if (inUse) {
      throw new Error(`Port ${this.port} already in use. Another gateway running?`);
    }

    this.server = http.createServer(this._handleHttp.bind(this));

    this.wss = new WebSocketServer({
      server: this.server,
      path: "/ws",
      maxPayload: 10 * 1024 * 1024, // 10MB max message
    });

    this.wss.on("connection", (ws, req) => this._onConnection(ws, req));
    this.wss.on("error", (err) => this.emit("error", err));

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, this.bind, () => {
        this._startHeartbeat();
        this._saveState();
        this.emit("started", { port: this.port, bind: this.bind });
        console.log(`[gateway] Listening on ws://${this.bind}:${this.port}/ws`);
        resolve();
      });
      this.server.on("error", reject);
    });
  }

  async stop() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }

    // Cancel all active agents
    for (const [sid, agent] of this.activeAgents) {
      try { agent.cancel?.(); } catch {}
    }
    this.activeAgents.clear();

    // Close all client connections
    for (const [, client] of this.clients) {
      client.ws.close(1001, "Gateway shutting down");
    }
    this.clients.clear();

    // Close servers
    if (this.wss) { this.wss.close(); this.wss = null; }
    if (this.server) {
      await new Promise(r => this.server.close(r));
      this.server = null;
    }

    this._clearState();
    this.emit("stopped");
    console.log("[gateway] Stopped");
  }

  // ── HTTP health endpoint ──────────────────────────────────

  _handleHttp(req, res) {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        uptime: process.uptime(),
        clients: this.clients.size,
        activeAgents: this.activeAgents.size,
        sessions: this.sessions.size,
      }));
    } else if (req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(this.getStatus()));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  }

  // ── WebSocket connection handling ─────────────────────────

  _onConnection(ws, req) {
    const id = `client_${++this._clientCounter}`;
    const client = new GatewayClient(ws, id);
    this.clients.set(id, client);

    const ip = req.socket.remoteAddress;
    console.log(`[gateway] Client connected: ${id} from ${ip}`);
    this.emit("client.connected", { id, ip });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this._handleMessage(client, msg);
      } catch (err) {
        client.send("error", { message: "Invalid JSON" });
      }
    });

    ws.on("close", (code, reason) => {
      this.clients.delete(id);
      console.log(`[gateway] Client disconnected: ${id} (${code})`);
      this.emit("client.disconnected", { id, code });
    });

    ws.on("error", (err) => {
      console.error(`[gateway] Client error ${id}:`, err.message);
    });

    ws.on("pong", () => { client.lastPing = Date.now(); });

    // Auto-auth if no secret configured (local-only mode)
    if (!this.secret) {
      client.authenticated = true;
      client.send(MSG.AUTH_OK, { clientId: id });
    }
  }

  _handleMessage(client, msg) {
    const { type } = msg;

    // Auth required for everything except auth and ping
    if (!client.authenticated && type !== MSG.AUTH && type !== MSG.PING) {
      client.send(MSG.AUTH_FAIL, { message: "Not authenticated" });
      return;
    }

    switch (type) {
      case MSG.AUTH:
        this._handleAuth(client, msg);
        break;

      case MSG.PING:
        client.lastPing = Date.now();
        client.send(MSG.PONG);
        break;

      case MSG.AGENT_REQUEST:
        this._handleAgentRequest(client, msg);
        break;

      case MSG.AGENT_CANCEL:
        this._handleAgentCancel(client, msg);
        break;

      case MSG.SESSION_LIST:
        this._handleSessionList(client, msg);
        break;

      case MSG.SESSION_RESUME:
        this._handleSessionResume(client, msg);
        break;

      case MSG.STATUS:
        client.send(MSG.STATUS_DATA, this.getStatus());
        break;

      default:
        // Forward to event system for custom handlers
        this.emit(`message.${type}`, { client, msg });
    }
  }

  // ── Auth ──────────────────────────────────────────────────

  _handleAuth(client, msg) {
    if (!this.secret || msg.secret === this.secret) {
      client.authenticated = true;
      client.channel = msg.channel || "cli";
      client.send(MSG.AUTH_OK, { clientId: client.id });
    } else {
      client.send(MSG.AUTH_FAIL, { message: "Invalid secret" });
    }
  }

  // ── Agent lifecycle ───────────────────────────────────────

  async _handleAgentRequest(client, msg) {
    const { sessionId, message, model, thinking } = msg;
    const sid = sessionId || `session_${Date.now()}`;

    // Track subscription
    client.subscriptions.add(sid);

    this.emit("agent.request", {
      sessionId: sid,
      message,
      model: model || "claude-sonnet-4-6",
      thinking: thinking || "normal",
      clientId: client.id,
      channel: client.channel,
    });

    // The actual agent execution is handled by whoever listens to "agent.request"
    // This allows plugging in different runtimes (Agent SDK, CLI, etc.)
  }

  _handleAgentCancel(client, msg) {
    const { sessionId } = msg;
    const agent = this.activeAgents.get(sessionId);
    if (agent) {
      agent.cancel?.();
      this.activeAgents.delete(sessionId);
      this._broadcastToSession(sessionId, MSG.AGENT_DONE, {
        sessionId,
        reason: "cancelled",
      });
    }
  }

  // ── Sessions ──────────────────────────────────────────────

  _handleSessionList(client, _msg) {
    const sessions = Array.from(this.sessions.entries()).map(([id, s]) => ({
      id,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
      messageCount: s.messageCount,
      model: s.model,
    }));
    client.send(MSG.SESSION_DATA, { sessions });
  }

  _handleSessionResume(client, msg) {
    const { sessionId } = msg;
    client.subscriptions.add(sessionId);
    const session = this.sessions.get(sessionId);
    if (session) {
      client.send(MSG.SESSION_DATA, { session });
    } else {
      client.send("error", { message: `Session ${sessionId} not found` });
    }
  }

  // ── Broadcasting ──────────────────────────────────────────

  /** Send to all clients subscribed to a session */
  _broadcastToSession(sessionId, type, payload) {
    for (const [, client] of this.clients) {
      if (client.subscriptions.has(sessionId)) {
        client.send(type, { sessionId, ...payload });
      }
    }
  }

  /** Send to all authenticated clients */
  broadcast(type, payload) {
    for (const [, client] of this.clients) {
      if (client.authenticated) {
        client.send(type, payload);
      }
    }
  }

  // ── Agent streaming hooks ─────────────────────────────────
  // Call these from your agent runtime to stream results to clients

  streamToken(sessionId, token) {
    this._broadcastToSession(sessionId, MSG.AGENT_STREAM, { token });
  }

  streamToolUse(sessionId, toolName, input) {
    this._broadcastToSession(sessionId, MSG.AGENT_TOOL_USE, { tool: toolName, input });
  }

  streamToolResult(sessionId, toolName, result) {
    this._broadcastToSession(sessionId, MSG.AGENT_TOOL_RESULT, { tool: toolName, result });
  }

  agentDone(sessionId, result) {
    this.activeAgents.delete(sessionId);
    this._broadcastToSession(sessionId, MSG.AGENT_DONE, { result });
  }

  agentError(sessionId, error) {
    this.activeAgents.delete(sessionId);
    this._broadcastToSession(sessionId, MSG.AGENT_ERROR, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // ── Status ────────────────────────────────────────────────

  getStatus() {
    return {
      running: true,
      port: this.port,
      bind: this.bind,
      uptime: process.uptime(),
      clients: Array.from(this.clients.values()).map(c => ({
        id: c.id,
        channel: c.channel,
        authenticated: c.authenticated,
        connectedAt: c.connectedAt,
      })),
      activeSessions: this.activeAgents.size,
      totalSessions: this.sessions.size,
      pid: process.pid,
    };
  }

  // ── Heartbeat ─────────────────────────────────────────────

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      for (const [id, client] of this.clients) {
        if (!client.isAlive()) {
          client.ws.terminate();
          this.clients.delete(id);
          continue;
        }
        client.ws.ping();
      }
    }, HEARTBEAT_INTERVAL);
  }

  // ── Port check ────────────────────────────────────────────

  _isPortInUse() {
    return new Promise((resolve) => {
      const srv = http.createServer();
      srv.once("error", (err) => {
        srv.close();
        resolve(err.code === "EADDRINUSE");
      });
      srv.once("listening", () => {
        srv.close();
        resolve(false);
      });
      srv.listen(this.port, this.bind);
    });
  }

  // ── State persistence ─────────────────────────────────────

  _saveState() {
    try {
      fs.writeFileSync(this._stateFile, JSON.stringify({
        pid: process.pid,
        port: this.port,
        bind: this.bind,
        startedAt: new Date().toISOString(),
      }, null, 2));
    } catch {}
  }

  _clearState() {
    try { fs.unlinkSync(this._stateFile); } catch {}
  }
}

// ── Gateway Client (for connecting TO a running gateway) ────

export class GatewayClient2 extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.url = opts.url || `ws://127.0.0.1:${opts.port || DEFAULT_PORT}/ws`;
    this.secret = opts.secret || process.env.BACKBONE_GATEWAY_SECRET || null;
    this.ws = null;
    this._reconnectTimer = null;
    this._reconnectDelay = 1000;
    this._maxReconnectDelay = 30000;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        this._reconnectDelay = 1000;
        if (this.secret) {
          this.send(MSG.AUTH, { secret: this.secret });
        }
        this.emit("connected");
        resolve();
      });

      this.ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.emit("message", msg);
          this.emit(msg.type, msg);
        } catch {}
      });

      this.ws.on("close", () => {
        this.emit("disconnected");
        this._scheduleReconnect();
      });

      this.ws.on("error", (err) => {
        if (!this.ws || this.ws.readyState === WebSocket.CONNECTING) {
          reject(err);
        }
        this.emit("error", err);
      });
    });
  }

  send(type, payload = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  sendAgentRequest(message, opts = {}) {
    this.send(MSG.AGENT_REQUEST, {
      message,
      sessionId: opts.sessionId,
      model: opts.model,
      thinking: opts.thinking,
    });
  }

  disconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  _scheduleReconnect() {
    this._reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxReconnectDelay);
  }
}

// ── Singleton ───────────────────────────────────────────────

let _gateway = null;

export function getGateway(opts) {
  if (!_gateway) _gateway = new GatewayServer(opts);
  return _gateway;
}

export function getGatewayClient(opts) {
  return new GatewayClient2(opts);
}

export default GatewayServer;
