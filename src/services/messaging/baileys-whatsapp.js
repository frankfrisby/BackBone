import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { trackUserQuery, QUERY_SOURCE } from "../memory/query-tracker.js";
import { showNotificationTitle } from "../ui/terminal-resize.js";
import { getDataDir } from "../paths.js";
import { ensureRuntimeDependency, isModuleNotFoundError } from "../runtime/dependency-installer.js";

const DATA_DIR = getDataDir();
const AUTH_DIR = path.join(DATA_DIR, "whatsapp-baileys-auth");
const CREDS_FILE = path.join(AUTH_DIR, "creds.json");
const CREDS_BACKUP = path.join(AUTH_DIR, "creds.json.bak");

/**
 * Atomic write — writes to a temp file then renames.
 * Prevents 0-byte creds.json if the process crashes mid-write.
 */
function atomicWriteFileSync(filePath, data) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

/**
 * Wraps Baileys' useMultiFileAuthState saveCreds with:
 * 1. Atomic writes (write to .tmp then rename)
 * 2. Backup before each save (creds.json → creds.json.bak)
 * 3. Auto-restore from backup if creds.json is empty/missing
 */
function wrapSaveCredsWithProtection(originalSaveCreds) {
  return async () => {
    // Back up current valid creds before overwriting
    try {
      if (fs.existsSync(CREDS_FILE)) {
        const current = fs.readFileSync(CREDS_FILE, "utf-8");
        if (current.length > 10) {
          fs.writeFileSync(CREDS_BACKUP, current);
        }
      }
    } catch {}

    // Call Baileys' original saveCreds
    await originalSaveCreds();

    // Post-write check: if creds.json got corrupted, restore from backup
    try {
      const written = fs.readFileSync(CREDS_FILE, "utf-8");
      if (written.length < 10) {
        console.warn("[WhatsApp:Baileys] creds.json corrupted after save — restoring from backup");
        if (fs.existsSync(CREDS_BACKUP)) {
          const backup = fs.readFileSync(CREDS_BACKUP, "utf-8");
          if (backup.length > 10) {
            fs.writeFileSync(CREDS_FILE, backup);
          }
        }
      }
    } catch {}
  };
}

/**
 * Restore creds.json from backup if it's empty/missing.
 * Called before initializing the socket.
 */
function restoreCredsIfCorrupted() {
  try {
    const credsExists = fs.existsSync(CREDS_FILE);
    const credsSize = credsExists ? fs.statSync(CREDS_FILE).size : 0;

    if (credsSize < 10 && fs.existsSync(CREDS_BACKUP)) {
      const backup = fs.readFileSync(CREDS_BACKUP, "utf-8");
      if (backup.length > 10) {
        console.log("[WhatsApp:Baileys] Restoring creds.json from backup (was empty/missing)");
        fs.writeFileSync(CREDS_FILE, backup);
        return true;
      }
    }
  } catch (err) {
    console.error("[WhatsApp:Baileys] Failed to restore creds:", err.message);
  }
  return false;
}

const INBOUND_SCOPE = {
  SELF: "self",
  CONTACTS: "contacts",
  ALL: "all"
};

const toError = (err) => err?.message || String(err || "Unknown error");

class BaileysWhatsAppService extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.saveCreds = null;
    this.module = null;
    this.initialized = false;
    this.connected = false;
    this.connectionState = "idle";
    this.lastError = null;
    this.lastDisconnectCode = null;
    this.lastDisconnectAt = null;
    this.qrPending = false;
    this.qrUpdatedAt = null;
    this.qrData = null;
    this.qrAscii = null;
    this.reconnectTimer = null;
    this.sentMessageIds = new Set();
    const scope = String(process.env.WHATSAPP_BAILEYS_INBOUND_SCOPE || INBOUND_SCOPE.SELF).toLowerCase();
    this.inboundScope = Object.values(INBOUND_SCOPE).includes(scope) ? scope : INBOUND_SCOPE.SELF;
    this.allowNonSelfSend = process.env.WHATSAPP_BAILEYS_ALLOW_NON_SELF_SEND === "1";
  }

  async initialize() {
    if (this.socket && this.connected) {
      return { success: true, connected: this.connected, requiresPairing: !this.connected };
    }

    try {
      this.lastError = null;
      this.connectionState = "connecting";
      if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

      const baileysMod = await this.loadBaileysModule();
      const makeWASocket = baileysMod?.default || baileysMod?.makeWASocket;
      const useMultiFileAuthState = baileysMod?.useMultiFileAuthState;
      const fetchLatestBaileysVersion = baileysMod?.fetchLatestBaileysVersion;

      if (!makeWASocket || !useMultiFileAuthState) {
        return { success: false, error: "Baileys exports missing" };
      }

      this.module = baileysMod;

      // Restore creds from backup if the file got corrupted (0-byte)
      restoreCredsIfCorrupted();

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      // Wrap saveCreds with backup + corruption detection
      this.saveCreds = wrapSaveCredsWithProtection(saveCreds);

      let version;
      try {
        const latest = await fetchLatestBaileysVersion?.();
        version = latest?.version;
      } catch {}

      this.socket = makeWASocket({
        auth: state,
        version,
        // We render our own compact QR (`small: true`) in `_printQr()`.
        // Leaving Baileys terminal printing on causes a second large QR that can
        // overlap the UI/log output and become unreadable.
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        browser: ["BACKBONE", "Desktop", "1.0.0"]
      });

      this.socket.ev.on("creds.update", async () => {
        try { await this.saveCreds?.(); } catch {}
      });

      this.socket.ev.on("connection.update", (update = {}) => {
        this._onConnectionUpdate(update);
      });

      this.socket.ev.on("messages.upsert", (payload = {}) => {
        this._onMessagesUpsert(payload);
      });

      this.initialized = true;
      this.lastError = null;
      return { success: true, connected: this.connected, requiresPairing: !this.connected };
    } catch (err) {
      this.lastError = toError(err);
      this.connectionState = "error";
      return {
        success: false,
        error: this.lastError,
        setupInstructions: this.getSetupInstructions()
      };
    }
  }

  async loadBaileysModule() {
    try {
      return await import("@whiskeysockets/baileys");
    } catch (err) {
      if (!isModuleNotFoundError(err, "@whiskeysockets/baileys")) {
        throw err;
      }

      console.log("[WhatsApp:Baileys] Missing package detected. Installing @whiskeysockets/baileys...");
      const installResult = await ensureRuntimeDependency("@whiskeysockets/baileys");
      if (!installResult.success) {
        throw new Error(`Auto-install failed for @whiskeysockets/baileys: ${installResult.error}`);
      }

      return import("@whiskeysockets/baileys");
    }
  }

  async _onConnectionUpdate(update) {
    const connection = update.connection;
    const qr = update.qr;

    if (qr) {
      this.connectionState = "pairing";
      this.qrPending = true;
      this.qrUpdatedAt = new Date().toISOString();
      this.qrData = qr;
      await this._printQr(qr);
    }

    if (connection === "open") {
      this._clearReconnectTimer();
      this.connected = true;
      this.qrPending = false;
      this.qrData = null;
      this.qrAscii = null;
      this.lastError = null;
      this.connectionState = "open";
      this.emit("connected");
      return;
    }

    if (connection === "close") {
      this.connected = false;
      this.connectionState = "closed";
      this.qrPending = false;
      this.qrData = null;
      this.qrAscii = null;
      const code =
        update?.lastDisconnect?.error?.output?.statusCode ||
        update?.lastDisconnect?.error?.statusCode ||
        null;
      this.lastDisconnectCode = code;
      this.lastDisconnectAt = new Date().toISOString();
      const disconnectReason = this.module?.DisconnectReason || {};
      const loggedOutCode = disconnectReason.loggedOut ?? 401;
      const requiresPairing = code === 401 || code === loggedOutCode;
      if (requiresPairing) {
        this.lastError = "Baileys session expired (401). Re-link in WhatsApp Linked Devices.";
      }
      this._resetSocketState();
      this.emit("disconnected", { code, requiresPairing });
      // Avoid reconnect loops after logged-out/pairing-required disconnects.
      // Reconnecting here can rotate session state and invalidate pairing attempts.
      if (!requiresPairing) {
        this._scheduleReconnect(3000);
      }
    }
  }

  _resetSocketState() {
    try {
      this.socket?.ev?.removeAllListeners?.("creds.update");
      this.socket?.ev?.removeAllListeners?.("connection.update");
      this.socket?.ev?.removeAllListeners?.("messages.upsert");
    } catch {}
    try {
      this.socket?.end?.();
    } catch {}
    this.socket = null;
    this.saveCreds = null;
    this.initialized = false;
  }

  _clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  _scheduleReconnect(delayMs = 3000) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.socket || this.connected) return;
      try {
        await this.initialize();
      } catch (err) {
        this.lastError = toError(err);
      }
    }, Math.max(1000, delayMs));
    if (typeof this.reconnectTimer.unref === "function") {
      this.reconnectTimer.unref();
    }
  }

  async _printQr(qr) {
    try {
      const qrTerminal = await import("qrcode-terminal");
      const generator = qrTerminal?.default || qrTerminal;
      console.log("\n[WhatsApp:Baileys] Scan this QR in WhatsApp > Linked Devices:\n");
      this.qrAscii = null;
      if (typeof generator?.generate === "function") {
        try {
          generator.generate(qr, { small: true }, (rendered) => {
            if (typeof rendered === "string" && rendered.trim()) {
              this.qrAscii = rendered;
              console.log(rendered);
            }
          });
          if (!this.qrAscii) {
            generator.generate(qr, { small: true });
          }
        } catch {
          generator.generate(qr, { small: true });
        }
      } else if (typeof generator === "function") {
        generator(qr, { small: true });
      } else {
        console.log(qr);
      }
      console.log("\n");
    } catch {
      console.log("[WhatsApp:Baileys] QR generated. Install qrcode-terminal for terminal rendering.");
    }
  }

  _onMessagesUpsert(payload) {
    const messages = payload?.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) return;

    for (const msg of messages) {
      const key = msg?.key || {};
      if (!msg?.message) continue;
      const jid = key.remoteJid || "";
      if (!jid.endsWith("@s.whatsapp.net")) continue;
      const messageId = key.id || `baileys_${Date.now()}`;
      if (!this.shouldProcessInboundMessage(key, jid, messageId)) continue;

      const from = this.jidToPhone(jid);
      if (!from) continue;

      const content = this._extractText(msg.message);
      const hasMedia = this._hasMedia(msg.message);

      const data = {
        from,
        to: null,
        userId: null,
        messageId,
        content: content || (hasMedia ? "[Media sent]" : ""),
        hasMedia,
        mediaUrls: [],
        provider: "baileys",
        timestamp: msg?.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString(),
        raw: msg
      };

      if (data.content?.trim()) {
        trackUserQuery(data.content, QUERY_SOURCE.WHATSAPP, { from, messageId });
        const preview = data.content.length > 25 ? `${data.content.slice(0, 25)}...` : data.content;
        showNotificationTitle("message", `WhatsApp: ${preview}`, 30000);
      }

      this.emit("message-received", data);
    }
  }

  normalizeJidUser(jid) {
    const raw = String(jid || "").split("@")[0].split(":")[0];
    return raw.replace(/[^\d]/g, "");
  }

  isSelfChatJid(jid) {
    const remote = this.normalizeJidUser(jid);
    const own = this.normalizeJidUser(this.socket?.user?.id || "");
    return Boolean(remote && own && remote === own);
  }

  isSelfPhone(phone) {
    const normalized = this.normalizePhone(phone);
    if (!normalized) return false;
    const target = normalized.replace(/[^\d]/g, "");
    const own = this.normalizeJidUser(this.socket?.user?.id || "");
    return Boolean(target && own && target === own);
  }

  enforceOutboundPrivacyLock(to) {
    if (this.allowNonSelfSend) return null;
    if (this.isSelfPhone(to)) return null;
    return "Baileys outbound privacy lock is enabled (self-chat only). Refusing to send to non-self number.";
  }

  shouldProcessInboundMessage(key, jid, messageId) {
    if (messageId && this.sentMessageIds.has(messageId)) {
      this.sentMessageIds.delete(messageId);
      return false;
    }

    const fromMe = key?.fromMe === true;
    const isSelfChat = this.isSelfChatJid(jid);

    if (this.inboundScope === INBOUND_SCOPE.CONTACTS) {
      return !fromMe;
    }

    if (this.inboundScope === INBOUND_SCOPE.ALL) {
      return !fromMe || isSelfChat;
    }

    // Default privacy mode: process only self-chat messages.
    // In self-chat, messages from the phone arrive with fromMe=true (same account).
    // Messages sent by BACKBONE are filtered out by sentMessageIds check above.
    return isSelfChat;
  }

  trackSentMessageId(messageId) {
    if (!messageId) return;
    this.sentMessageIds.add(messageId);
    if (this.sentMessageIds.size > 2000) {
      const first = this.sentMessageIds.values().next().value;
      if (first) this.sentMessageIds.delete(first);
    }

    const cleanup = setTimeout(() => this.sentMessageIds.delete(messageId), 2 * 60 * 1000);
    if (typeof cleanup.unref === "function") cleanup.unref();
  }

  _extractText(message = {}) {
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    if (message.buttonsResponseMessage?.selectedButtonId) return message.buttonsResponseMessage.selectedButtonId;
    if (message.listResponseMessage?.title) return message.listResponseMessage.title;
    if (message.templateButtonReplyMessage?.selectedId) return message.templateButtonReplyMessage.selectedId;
    return "";
  }

  _hasMedia(message = {}) {
    return Boolean(
      message.imageMessage ||
      message.videoMessage ||
      message.audioMessage ||
      message.documentMessage ||
      message.stickerMessage
    );
  }

  normalizePhone(phone) {
    if (!phone) return null;
    let normalized = String(phone).replace(/[^\d+]/g, "");
    if (!normalized.startsWith("+")) {
      if (normalized.length === 10) normalized = `+1${normalized}`;
      else if (normalized.length === 11 && normalized.startsWith("1")) normalized = `+${normalized}`;
      else normalized = `+${normalized}`;
    }
    return normalized.length >= 10 ? normalized : null;
  }

  jidToPhone(jid) {
    const raw = String(jid || "").split("@")[0] || "";
    const digits = raw.replace(/[^\d]/g, "");
    return digits ? `+${digits}` : null;
  }

  toJid(phone) {
    const normalized = this.normalizePhone(phone);
    if (!normalized) return null;
    return `${normalized.replace(/[^\d]/g, "")}@s.whatsapp.net`;
  }

  async sendMessage(to, body) {
    if (!this.socket || !this.connected) {
      return { success: false, error: "Baileys not connected" };
    }

    const jid = this.toJid(to);
    if (!jid) return { success: false, error: "Invalid phone number" };
    const outboundLockError = this.enforceOutboundPrivacyLock(to);
    if (outboundLockError) return { success: false, error: outboundLockError };

    try {
      const sent = await this.socket.sendMessage(jid, { text: body || "" });
      this.trackSentMessageId(sent?.key?.id || null);
      return { success: true, provider: "baileys", messageId: sent?.key?.id || null, status: "sent" };
    } catch (err) {
      return { success: false, error: toError(err) };
    }
  }

  async sendMediaMessage(to, body, mediaUrl) {
    if (!this.socket || !this.connected) {
      return { success: false, error: "Baileys not connected" };
    }

    const jid = this.toJid(to);
    if (!jid) return { success: false, error: "Invalid phone number" };
    const outboundLockError = this.enforceOutboundPrivacyLock(to);
    if (outboundLockError) return { success: false, error: outboundLockError };

    try {
      const sent = await this.socket.sendMessage(jid, {
        image: { url: mediaUrl },
        caption: body || ""
      });
      this.trackSentMessageId(sent?.key?.id || null);
      return { success: true, provider: "baileys", messageId: sent?.key?.id || null, status: "sent" };
    } catch (err) {
      return { success: false, error: toError(err) };
    }
  }

  async sendTypingIndicator(to, durationMs = 3500) {
    if (!this.socket || !this.connected) {
      return { success: false, error: "Baileys not connected" };
    }

    const jid = this.toJid(to);
    if (!jid) return { success: false, error: "Invalid phone number" };

    try {
      // Cancel any previous auto-pause timer so it doesn't kill our new "composing"
      if (this._typingPauseTimer) {
        clearTimeout(this._typingPauseTimer);
        this._typingPauseTimer = null;
      }

      await this.socket.sendPresenceUpdate("composing", jid);

      // If persistent flag is set, don't auto-pause (caller manages it)
      if (durationMs === -1) {
        return { success: true, provider: "baileys", persistent: true };
      }

      const waitMs = Math.max(1000, Math.min(Number(durationMs) || 3500, 10000));
      this._typingPauseTimer = setTimeout(() => {
        this.socket?.sendPresenceUpdate("paused", jid).catch(() => {});
        this._typingPauseTimer = null;
      }, waitMs);
      if (typeof this._typingPauseTimer.unref === "function") {
        this._typingPauseTimer.unref();
      }
      return { success: true, provider: "baileys" };
    } catch (err) {
      return { success: false, error: toError(err) };
    }
  }

  /**
   * Stop typing indicator immediately.
   */
  async stopTypingIndicator(to) {
    if (this._typingPauseTimer) {
      clearTimeout(this._typingPauseTimer);
      this._typingPauseTimer = null;
    }
    if (!this.socket || !this.connected) return;
    const jid = this.toJid(to);
    if (jid) {
      try { await this.socket.sendPresenceUpdate("paused", jid); } catch {}
    }
  }

  async requestPairingCode(phoneNumber) {
    if (!phoneNumber) return { success: false, error: "phoneNumber required" };
    if (!this.socket) {
      const init = await this.initialize();
      if (!init.success) return init;
    }
    if (!this.socket?.requestPairingCode) {
      return { success: false, error: "Baileys pairing code is not available in this build" };
    }

    try {
      const normalized = this.normalizePhone(phoneNumber);
      if (!normalized) return { success: false, error: "Invalid phone number" };
      const code = await this.socket.requestPairingCode(normalized.replace(/[^\d]/g, ""));
      return { success: true, pairingCode: code };
    } catch (err) {
      return { success: false, error: toError(err) };
    }
  }

  async clearAuthState() {
    try {
      this._clearReconnectTimer();
      this._resetSocketState();
      this.connected = false;
      this.connectionState = "idle";
      this.qrPending = false;
      this.qrData = null;
      this.qrAscii = null;
      this.lastError = null;
      this.lastDisconnectCode = null;
      this.lastDisconnectAt = null;
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: toError(err) };
    }
  }

  async restartSocket() {
    try {
      this._clearReconnectTimer();
      this._resetSocketState();
      this.connected = false;
      this.connectionState = "idle";
      this.qrPending = false;
      this.qrData = null;
      this.qrAscii = null;
      return this.initialize();
    } catch (err) {
      return { success: false, error: toError(err) };
    }
  }

  getStatus() {
    return {
      initialized: this.initialized,
      connected: this.connected,
      connectionState: this.connectionState,
      requiresPairing: !this.connected && this.lastDisconnectCode === 401,
      inboundScope: this.inboundScope,
      outboundPrivacyLock: !this.allowNonSelfSend,
      qrPending: this.qrPending,
      qrUpdatedAt: this.qrUpdatedAt,
      qrData: this.qrData,
      qrAscii: this.qrAscii,
      lastError: this.lastError,
      lastDisconnectCode: this.lastDisconnectCode,
      lastDisconnectAt: this.lastDisconnectAt,
      authDir: AUTH_DIR
    };
  }

  getSetupInstructions() {
    return `
BAILEYS WHATSAPP SETUP
======================
1. npm install @whiskeysockets/baileys
2. Start BACKBONE
3. Scan terminal QR in WhatsApp > Linked Devices
4. Keep BACKBONE running to maintain the linked session
`;
  }
}

let instance = null;
export const getBaileysWhatsApp = () => {
  if (!instance) instance = new BaileysWhatsAppService();
  return instance;
};

export default BaileysWhatsAppService;
