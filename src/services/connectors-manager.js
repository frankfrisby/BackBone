/**
 * Connectors Manager - External service connections (11 Labs, Twilio, etc.)
 */
import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const DATA_DIR = path.join(process.cwd(), "data");
const CONNECTORS_PATH = path.join(DATA_DIR, "connectors.json");

export const CONNECTOR_STATUS = {
  NOT_CONFIGURED: "not_configured",
  CONFIGURED: "configured",
  CONNECTED: "connected",
  ERROR: "error"
};

const AVAILABLE_CONNECTORS = {
  "elevenlabs": {
    id: "elevenlabs", name: "ElevenLabs", shortName: "11Labs",
    description: "AI voice and phone calls", icon: "🎙️",
    requiredFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "voiceId", label: "Voice ID", type: "text", required: false }
    ],
    capabilities: ["voice_generation", "phone_calls", "text_to_speech"]
  },
  "twilio": {
    id: "twilio", name: "Twilio", shortName: "Twilio",
    description: "Phone calls and SMS", icon: "📞",
    requiredFields: [
      { key: "accountSid", label: "Account SID", type: "text", required: true },
      { key: "authToken", label: "Auth Token", type: "password", required: true },
      { key: "phoneNumber", label: "Phone Number", type: "text", required: true }
    ],
    capabilities: ["phone_calls", "sms"]
  },
  "slack": {
    id: "slack", name: "Slack", shortName: "Slack",
    description: "Team messaging", icon: "💬",
    requiredFields: [{ key: "botToken", label: "Bot Token", type: "password", required: true }],
    capabilities: ["messaging", "notifications"]
  },
  "notion": {
    id: "notion", name: "Notion", shortName: "Notion",
    description: "Notes and projects", icon: "📝",
    requiredFields: [{ key: "apiKey", label: "Token", type: "password", required: true }],
    capabilities: ["pages", "databases"]
  },
  "github": {
    id: "github", name: "GitHub", shortName: "GitHub",
    description: "Code and issues", icon: "🐙",
    requiredFields: [{ key: "token", label: "PAT", type: "password", required: true }],
    capabilities: ["repos", "issues"]
  }
};

class ConnectorsManager extends EventEmitter {
  constructor() {
    super();
    this.connectors = new Map();
    this.credentials = new Map();
    this._loadState();
    this._initializeConnectors();
  }

  _loadState() {
    try {
      if (fs.existsSync(CONNECTORS_PATH)) {
        const data = JSON.parse(fs.readFileSync(CONNECTORS_PATH, "utf8"));
        if (data.connectors) Object.entries(data.connectors).forEach(([id, c]) => this.connectors.set(id, c));
        if (data.credentials) Object.entries(data.credentials).forEach(([id, c]) => this.credentials.set(id, c));
      }
    } catch (e) { /* ignore */ }
  }

  _saveState() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(CONNECTORS_PATH, JSON.stringify({
        connectors: Object.fromEntries(this.connectors),
        credentials: Object.fromEntries(this.credentials)
      }, null, 2));
    } catch (e) { /* ignore */ }
  }

  _initializeConnectors() {
    Object.entries(AVAILABLE_CONNECTORS).forEach(([id, def]) => {
      if (!this.connectors.has(id)) {
        this.connectors.set(id, { ...def, status: CONNECTOR_STATUS.NOT_CONFIGURED, enabled: false });
      }
    });
  }

  getAllConnectors() { return Array.from(this.connectors.values()); }
  getConnector(id) { return this.connectors.get(id) || null; }
  getConfiguredConnectors() { return this.getAllConnectors().filter(c => c.status === CONNECTOR_STATUS.CONFIGURED || c.status === CONNECTOR_STATUS.CONNECTED); }
  isConfigured(id) { return this.credentials.has(id); }
  getCredentials(id) { return this.credentials.get(id) || null; }

  configureConnector(id, creds) {
    const connector = this.connectors.get(id);
    if (!connector) throw new Error(`Connector ${id} not found`);
    this.credentials.set(id, { ...creds, configuredAt: new Date().toISOString() });
    connector.status = CONNECTOR_STATUS.CONFIGURED;
    connector.enabled = true;
    this.connectors.set(id, connector);
    this._saveState();
    this.emit("connector:configured", { id, connector });
    return connector;
  }

  removeConnector(id) {
    this.credentials.delete(id);
    const connector = this.connectors.get(id);
    if (connector) { connector.status = CONNECTOR_STATUS.NOT_CONFIGURED; connector.enabled = false; this.connectors.set(id, connector); }
    this._saveState();
    return true;
  }

  requestConfiguration(id, reason) {
    const connector = this.connectors.get(id);
    if (!connector) return null;
    this.emit("connector:request", { id, connector, reason, requiredFields: connector.requiredFields });
    return connector;
  }

  getDisplayData() {
    return {
      total: this.connectors.size,
      configured: this.getConfiguredConnectors().length,
      connectors: this.getAllConnectors().map(c => ({ id: c.id, name: c.name, shortName: c.shortName, icon: c.icon, status: c.status, enabled: c.enabled }))
    };
  }
}

let instance = null;
export const getConnectorsManager = () => { if (!instance) instance = new ConnectorsManager(); return instance; };
export default getConnectorsManager;
