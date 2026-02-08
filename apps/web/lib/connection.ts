/**
 * BackboneConnection — Hybrid localhost + Cloudflare Tunnel + Firebase relay
 *
 * Priority:
 * 1. Direct localhost WebSocket (same machine, zero latency)
 * 2. Direct localhost HTTP (same machine, fallback)
 * 3. Cloudflare Tunnel (remote, ~50ms latency, if configured)
 * 4. Firebase Firestore relay (remote/mobile, ~1s latency)
 */

type Transport = "ws" | "http" | "tunnel" | "firebase" | "disconnected";
type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
type ConnectionListener = (status: ConnectionStatus, transport: Transport) => void;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const LOCALHOST_PORT = 3000;
const WS_URL = `ws://localhost:${LOCALHOST_PORT}/ws`;
const HTTP_URL = `http://localhost:${LOCALHOST_PORT}`;
const REQUEST_TIMEOUT = 30000;
const TUNNEL_CONFIG_KEY = "backbone_tunnel_url";

export class BackboneConnection {
  private ws: WebSocket | null = null;
  private transport: Transport = "disconnected";
  private status: ConnectionStatus = "disconnected";
  private userId: string | null = null;
  private tunnelUrl: string | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private statusListeners = new Set<ConnectionListener>();
  private messageListeners = new Set<(data: any) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  getStatus() {
    return this.status;
  }

  getTransport() {
    return this.transport;
  }

  getTunnelUrl() {
    return this.tunnelUrl;
  }

  setTunnelUrl(url: string | null) {
    this.tunnelUrl = url;
    try {
      if (url) {
        localStorage.setItem(TUNNEL_CONFIG_KEY, url);
      } else {
        localStorage.removeItem(TUNNEL_CONFIG_KEY);
      }
    } catch { /* ignore */ }
  }

  onStatusChange(listener: ConnectionListener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onMessage(listener: (data: any) => void) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private setStatus(status: ConnectionStatus, transport: Transport) {
    this.status = status;
    this.transport = transport;
    this.statusListeners.forEach((l) => l(status, transport));
  }

  async connect(userId: string): Promise<void> {
    this.userId = userId;
    this.setStatus("connecting", "disconnected");

    // Load saved tunnel URL
    try {
      this.tunnelUrl = localStorage.getItem(TUNNEL_CONFIG_KEY);
    } catch { /* ignore */ }

    // Try localhost WebSocket first
    if (await this.tryWebSocket()) {
      this.setStatus("connected", "ws");
      this.startHeartbeat();
      return;
    }

    // Try localhost HTTP
    if (await this.tryHTTP()) {
      this.setStatus("connected", "http");
      return;
    }

    // Try Cloudflare Tunnel if configured
    if (this.tunnelUrl && (await this.tryTunnel())) {
      this.setStatus("connected", "tunnel");
      return;
    }

    // Fall back to Firebase relay
    this.setStatus("connected", "firebase");
  }

  private async tryTunnel(): Promise<boolean> {
    if (!this.tunnelUrl) return false;
    try {
      const url = this.tunnelUrl.replace(/\/$/, "");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${url}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      return resp.ok;
    } catch {
      return false;
    }
  }

  private tryWebSocket(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(WS_URL);
        const timeout = setTimeout(() => {
          ws.close();
          resolve(false);
        }, 3000);

        ws.onopen = () => {
          clearTimeout(timeout);
          this.ws = ws;
          // Authenticate
          ws.send(
            JSON.stringify({
              type: "auth",
              userId: this.userId,
            })
          );
          this.setupWSListeners(ws);
          resolve(true);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };
      } catch {
        resolve(false);
      }
    });
  }

  private async tryHTTP(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(`${HTTP_URL}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return resp.ok;
    } catch {
      return false;
    }
  }

  private setupWSListeners(ws: WebSocket) {
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle response to a pending request
        if (data.requestId && this.pendingRequests.has(data.requestId)) {
          const pending = this.pendingRequests.get(data.requestId)!;
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(data.requestId);
          if (data.error) {
            pending.reject(new Error(data.error));
          } else {
            pending.resolve(data.result);
          }
          return;
        }

        // Handle push messages
        this.messageListeners.forEach((l) => l(data));
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      this.ws = null;
      this.setStatus("disconnected", "disconnected");
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.userId && this.status === "disconnected") {
        await this.connect(this.userId);
      }
    }, 5000);
  }

  async send(command: string, payload?: any): Promise<any> {
    switch (this.transport) {
      case "ws":
        return this.sendViaWS(command, payload);
      case "http":
        return this.sendViaHTTP(command, payload);
      case "tunnel":
        return this.sendViaTunnel(command, payload);
      case "firebase":
        return this.sendViaHTTP(command, payload); // Try HTTP first even in firebase mode
      default:
        throw new Error("Not connected to BACKBONE server");
    }
  }

  private sendViaWS(command: string, payload?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return this.sendViaHTTP(command, payload).then(resolve).catch(reject);
      }

      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error("Request timeout"));
      }, REQUEST_TIMEOUT);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });
      this.ws.send(JSON.stringify({ requestId, command, ...payload }));
    });
  }

  private async sendViaHTTP(command: string, payload?: any): Promise<any> {
    const url = `${HTTP_URL}/api/${command}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    return resp.json();
  }

  private async sendViaTunnel(command: string, payload?: any): Promise<any> {
    if (!this.tunnelUrl) {
      throw new Error("No tunnel URL configured");
    }
    const baseUrl = this.tunnelUrl.replace(/\/$/, "");
    const url = `${baseUrl}/api/${command}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    if (!resp.ok) {
      throw new Error(`Tunnel HTTP ${resp.status}: ${resp.statusText}`);
    }
    return resp.json();
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.setStatus("disconnected", "disconnected");
  }
}

// Singleton
let instance: BackboneConnection | null = null;

export function getBackboneConnection(): BackboneConnection {
  if (!instance) {
    instance = new BackboneConnection();
  }
  return instance;
}
