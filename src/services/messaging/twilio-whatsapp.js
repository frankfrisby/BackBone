/**
 * Twilio WhatsApp Service
 *
 * Simple WhatsApp messaging through Twilio's API.
 * Credentials are fetched from Firebase Firestore (not stored in code).
 *
 * SETUP:
 * 1. Create Twilio account: twilio.com/try-twilio
 * 2. Go to Console > Messaging > Try WhatsApp
 * 3. Join sandbox: Send "join <sandbox-word>" to the Twilio number
 * 4. Add credentials to Firebase Firestore:
 *    Collection: config
 *    Document: config_twilio
 *    Fields:
 *      - accountSid: "ACxxxxxxxxx..."
 *      - authToken: "your_auth_token"
 *      - whatsappNumber: "+14155238886"
 *
 * For production:
 * - Request access to Twilio's WhatsApp Business API
 * - Get your own WhatsApp-enabled number
 *
 * Cost: ~$0.005-0.05 per message
 */

import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { fetchTwilioConfig } from "../firebase/firebase-config.js";
import { trackUserQuery, QUERY_SOURCE } from "../memory/query-tracker.js";
import { showNotificationTitle } from "../ui/terminal-resize.js";
import { getBaileysWhatsApp } from "./baileys-whatsapp.js";
import { ensureRuntimeDependency, isModuleNotFoundError } from "../runtime/dependency-installer.js";

import { getDataDir } from "../paths.js";
import { isDuplicateSend, logOutgoing, logIncoming } from "./whatsapp-conversation-log.js";
const DATA_DIR = getDataDir();
const TWILIO_CONFIG_PATH = path.join(DATA_DIR, "twilio-config.json");
const formatTwilioError = (error) => ({
  message: error?.message || String(error || "Unknown error"),
  code: error?.code ?? null,
  status: error?.status ?? null,
  moreInfo: error?.moreInfo || null
});

/**
 * Twilio WhatsApp Service
 */
export class TwilioWhatsAppService extends EventEmitter {
  constructor() {
    super();
    this.config = this.loadConfig();
    this.client = null;
    this.activeProvider = null;
    this.twilioHealth = {
      checkedAt: null,
      authOk: null,
      accountName: null,
      lastError: null,
      errorCode: null,
      errorStatus: null,
      moreInfo: null
    };
    this.baileysService = getBaileysWhatsApp();

    // Forward Baileys inbound events through this legacy facade.
    this.baileysService.on("message-received", (data) => {
      const userId = data?.from ? this.getUserIdForPhone(data.from) : null;
      logIncoming(data?.content || data?.body || "", { from: data?.from });
      this.emit("message-received", {
        ...data,
        userId
      });
    });

    this.initialized = false;
  }

  setProviderPreference(provider) {
    const next = String(provider || "").toLowerCase() === "twilio" ? "twilio" : "baileys";
    this.config.providerPreference = next;
    this.saveConfig();
    return {
      success: true,
      providerPreference: next,
      activeProvider: this.activeProvider
    };
  }

  /**
   * Load configuration from local cache
   * Firebase credentials are fetched during initialize()
   */
  loadConfig() {
    try {
      if (fs.existsSync(TWILIO_CONFIG_PATH)) {
        const cached = JSON.parse(fs.readFileSync(TWILIO_CONFIG_PATH, "utf-8"));
        return {
          ...cached,
          // Don't cache credentials - fetch fresh from Firebase
          accountSid: null,
          authToken: null,
          providerPreference: cached.providerPreference || process.env.WHATSAPP_PROVIDER || "baileys",
          enableBaileys: typeof cached.enableBaileys === "boolean"
            ? cached.enableBaileys
            : process.env.WHATSAPP_DISABLE_BAILEYS !== "1"
        };
      }
    } catch (err) {
      console.error("[TwilioWhatsApp] Failed to load config:", err.message);
    }

    return {
      accountSid: null,
      authToken: null,
      whatsappNumber: "+14155238886", // Sandbox default
      sandboxJoinWords: null, // e.g., "join funny-elephant" - fetched from Firebase
      webhookUrl: null,
      registeredUsers: {}, // phone -> userId mapping
      providerPreference: process.env.WHATSAPP_PROVIDER || "baileys",
      enableBaileys: process.env.WHATSAPP_DISABLE_BAILEYS !== "1"
    };
  }

  /**
   * Save configuration
   */
  saveConfig() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      // Don't save sensitive tokens to file - keep in env vars
      const safeConfig = {
        whatsappNumber: this.config.whatsappNumber,
        webhookUrl: this.config.webhookUrl,
        registeredUsers: this.config.registeredUsers,
        hasCredentials: !!(this.config.accountSid && this.config.authToken),
        providerPreference: this.config.providerPreference || "baileys",
        enableBaileys: this.config.enableBaileys !== false,
        activeProvider: this.activeProvider,
        baileys: this.baileysService.getStatus()
      };
      fs.writeFileSync(TWILIO_CONFIG_PATH, JSON.stringify(safeConfig, null, 2));
    } catch (err) {
      console.error("[TwilioWhatsApp] Failed to save config:", err.message);
    }
  }

  /**
   * Initialize the service
   * Provider order:
   * 1. Baileys (if enabled and preferred)
   * 2. Twilio
   * 3. Baileys fallback (if Twilio preferred but unavailable)
   */
  async initialize(config = {}) {
    if (typeof config.enableBaileys === "boolean") {
      this.config.enableBaileys = config.enableBaileys;
    }
    if (config.providerPreference) {
      this.config.providerPreference = String(config.providerPreference).toLowerCase();
    }

    const prefer = String(this.config.providerPreference || "baileys").toLowerCase();
    const baileysEnabled = this.config.enableBaileys !== false && process.env.WHATSAPP_DISABLE_BAILEYS !== "1";
    const tryBaileysFirst = baileysEnabled && prefer !== "twilio";

    if (tryBaileysFirst) {
      const baileys = await this.baileysService.initialize();
      if (baileys.success) {
        this.initialized = true;
        this.activeProvider = "baileys";
        this.saveConfig();
        return {
          success: true,
          provider: "baileys",
          connected: this.baileysService.connected,
          requiresPairing: !this.baileysService.connected,
          setupInstructions: !this.baileysService.connected
            ? this.baileysService.getSetupInstructions()
            : null
        };
      }
    }

    const twilioResult = await this.initializeTwilio(config);
    if (twilioResult.success) {
      this.initialized = true;
      this.activeProvider = "twilio";
      this.saveConfig();
      return twilioResult;
    }

    // If Twilio was preferred but failed, still try Baileys fallback.
    if (!tryBaileysFirst && baileysEnabled) {
      const baileys = await this.baileysService.initialize();
      if (baileys.success) {
        this.initialized = true;
        this.activeProvider = "baileys";
        this.saveConfig();
        return {
          success: true,
          provider: "baileys",
          connected: this.baileysService.connected,
          requiresPairing: !this.baileysService.connected,
          setupInstructions: !this.baileysService.connected
            ? this.baileysService.getSetupInstructions()
            : null
        };
      }
    }

    return {
      ...twilioResult,
      setupInstructions: this.getSetupInstructions()
    };
  }

  /**
   * Twilio-only initialization.
   */
  async initializeTwilio(config = {}) {
    const activateProvider = config.activateProvider !== false;
    this.twilioHealth.checkedAt = new Date().toISOString();
    // Fetch credentials from Firebase Firestore
    console.log("[TwilioWhatsApp] Fetching credentials from Firebase...");

    try {
      const firebaseConfig = await fetchTwilioConfig();

      if (firebaseConfig) {
        this.config.accountSid = firebaseConfig.accountSid || this.config.accountSid;
        this.config.authToken = firebaseConfig.authToken || this.config.authToken;
        this.config.whatsappNumber = firebaseConfig.whatsappNumber || this.config.whatsappNumber;
        this.config.sandboxJoinWords = firebaseConfig.sandboxJoinWords || this.config.sandboxJoinWords;
      }
    } catch (err) {
      console.warn("[TwilioWhatsApp] Could not fetch from Firebase:", err.message);
    }

    // Override with passed config if provided
    if (config.accountSid) this.config.accountSid = config.accountSid;
    if (config.authToken) this.config.authToken = config.authToken;
    if (config.whatsappNumber) this.config.whatsappNumber = config.whatsappNumber;

    // Check required credentials
    if (!this.config.accountSid || !this.config.authToken) {
      this.twilioHealth.authOk = false;
      this.twilioHealth.accountName = null;
      this.twilioHealth.lastError = "Twilio credentials not found in Firebase. Add them to Firestore: config/config_twilio";
      this.twilioHealth.errorCode = null;
      this.twilioHealth.errorStatus = null;
      this.twilioHealth.moreInfo = null;
      return {
        success: false,
        error: "Twilio credentials not found in Firebase. Add them to Firestore: config/config_twilio",
        setupInstructions: this.getSetupInstructions()
      };
    }

    try {
      // Dynamic import of Twilio (so it doesn't fail if not installed)
      let twilio;
      try {
        twilio = await import("twilio");
      } catch (importErr) {
        if (!isModuleNotFoundError(importErr, "twilio")) {
          throw importErr;
        }

        console.log("[TwilioWhatsApp] Missing package detected. Installing twilio...");
        const installResult = await ensureRuntimeDependency("twilio");
        if (!installResult.success) {
          this.twilioHealth.authOk = false;
          this.twilioHealth.accountName = null;
          this.twilioHealth.lastError = `Twilio package missing and auto-install failed: ${installResult.error}`;
          this.twilioHealth.errorCode = null;
          this.twilioHealth.errorStatus = null;
          this.twilioHealth.moreInfo = null;
          return {
            success: false,
            error: `Twilio package missing and auto-install failed: ${installResult.error}`,
            setupInstructions: this.getTwilioSetupInstructions()
          };
        }

        twilio = await import("twilio");
      }
      this.client = twilio.default(this.config.accountSid, this.config.authToken);

      // Verify credentials by fetching account info
      const account = await this.client.api.accounts(this.config.accountSid).fetch();

      this.initialized = true;
      if (activateProvider) {
        this.activeProvider = "twilio";
      }
      this.twilioHealth.authOk = true;
      this.twilioHealth.accountName = account?.friendlyName || null;
      this.twilioHealth.lastError = null;
      this.twilioHealth.errorCode = null;
      this.twilioHealth.errorStatus = null;
      this.twilioHealth.moreInfo = null;
      this.saveConfig();

      console.log("[TwilioWhatsApp] Initialized successfully");
      this.emit("initialized", { accountName: account.friendlyName });

      return {
        success: true,
        provider: "twilio",
        accountName: account.friendlyName,
        whatsappNumber: this.config.whatsappNumber
      };

    } catch (error) {
      if (isModuleNotFoundError(error, "twilio")) {
        this.twilioHealth.authOk = false;
        this.twilioHealth.accountName = null;
        this.twilioHealth.lastError = "Twilio package not installed and could not be loaded.";
        this.twilioHealth.errorCode = null;
        this.twilioHealth.errorStatus = null;
        this.twilioHealth.moreInfo = null;
        return {
          success: false,
          error: "Twilio package not installed and could not be loaded.",
          setupInstructions: this.getTwilioSetupInstructions()
        };
      }

      const details = formatTwilioError(error);
      this.twilioHealth.authOk = false;
      this.twilioHealth.accountName = null;
      this.twilioHealth.lastError = details.message;
      this.twilioHealth.errorCode = details.code;
      this.twilioHealth.errorStatus = details.status;
      this.twilioHealth.moreInfo = details.moreInfo;

      return {
        success: false,
        error: details.message,
        code: details.code,
        status: details.status,
        moreInfo: details.moreInfo
      };
    }
  }

  async testTwilioConnection(config = {}) {
    return this.initializeTwilio({
      ...config,
      activateProvider: false
    });
  }

  /**
   * Send a WhatsApp message
   */
  async sendMessage(to, body, options = {}) {
    const phoneNumber = this.normalizePhoneNumber(to);
    if (!phoneNumber) {
      return { success: false, error: "Invalid phone number" };
    }

    // Dedup guard — block identical messages within 30 seconds
    if (!options.skipDedup) {
      const dupCheck = isDuplicateSend(body);
      if (dupCheck.isDuplicate) {
        console.log(`[TwilioWhatsApp] DEDUP BLOCKED: ${dupCheck.reason}`);
        return { success: true, dedupBlocked: true, reason: dupCheck.reason };
      }
    }

    const forcedProvider = String(options.forceProvider || "").toLowerCase();
    const forceTwilio = forcedProvider === "twilio";
    const forceBaileys = forcedProvider === "baileys";
    const preserveProvider = options.preserveProvider === true;
    const prefer = forceTwilio
      ? "twilio"
      : forceBaileys
        ? "baileys"
        : String(this.activeProvider || this.config.providerPreference || "baileys").toLowerCase();
    const baileysEnabled = this.config.enableBaileys !== false && process.env.WHATSAPP_DISABLE_BAILEYS !== "1";
    const tryBaileysFirst = baileysEnabled && !forceTwilio && prefer !== "twilio";
    let baileysError = null;

    if (tryBaileysFirst) {
      const baileysResult = await this.baileysService.sendMessage(phoneNumber, body);
      if (baileysResult.success) {
        this.initialized = true;
        this.activeProvider = "baileys";
        logOutgoing(body, { source: options.source || "baileys" });
        this.emit("message-sent", {
          to: phoneNumber,
          messageId: baileysResult.messageId,
          status: baileysResult.status || "sent",
          provider: "baileys"
        });
        return baileysResult;
      }
      baileysError = baileysResult.error || "Baileys send failed";
    }

    if (!this.client) {
      const init = await this.initializeTwilio({ activateProvider: !preserveProvider });
      if (!init.success) {
        // If Twilio fails and Baileys wasn't attempted first, try it now.
        if (!forceTwilio && !tryBaileysFirst && baileysEnabled) {
          const baileysResult = await this.baileysService.sendMessage(phoneNumber, body);
          if (baileysResult.success) {
            this.initialized = true;
            this.activeProvider = "baileys";
            return {
              ...baileysResult,
              fallbackUsed: true
            };
          }
          baileysError = baileysResult.error || baileysError;
        }

        return {
          success: false,
          error: [baileysError, init.error].filter(Boolean).join(" | ")
        };
      }
    }

    try {
      const message = await this.client.messages.create({
        from: `whatsapp:${this.config.whatsappNumber}`,
        to: `whatsapp:${phoneNumber}`,
        body: body
      });

      this.initialized = true;
      if (!preserveProvider) {
        this.activeProvider = "twilio";
      }

      logOutgoing(body, { source: options.source || "twilio" });
      this.emit("message-sent", {
        to: phoneNumber,
        messageId: message.sid,
        status: message.status,
        provider: "twilio"
      });

      return {
        success: true,
        provider: "twilio",
        fallbackUsed: Boolean(baileysError),
        messageId: message.sid,
        status: message.status
      };
    } catch (error) {
      console.error("[TwilioWhatsApp] Send error:", error.message);
      return {
        success: false,
        error: [baileysError, error.message].filter(Boolean).join(" | ")
      };
    }
  }

  /**
   * Send a message with media (image, document, etc.)
   */
  async sendMediaMessage(to, body, mediaUrl) {
    const phoneNumber = this.normalizePhoneNumber(to);
    if (!phoneNumber) {
      return { success: false, error: "Invalid phone number" };
    }

    // Dedup guard — block identical media messages within 30 seconds
    const dupCheck = isDuplicateSend(body, mediaUrl);
    if (dupCheck.isDuplicate) {
      console.log(`[TwilioWhatsApp] DEDUP BLOCKED (media): ${dupCheck.reason}`);
      return { success: true, dedupBlocked: true, reason: dupCheck.reason };
    }

    const prefer = String(this.activeProvider || this.config.providerPreference || "baileys").toLowerCase();
    const baileysEnabled = this.config.enableBaileys !== false && process.env.WHATSAPP_DISABLE_BAILEYS !== "1";
    const tryBaileysFirst = baileysEnabled && prefer !== "twilio";
    let baileysError = null;

    if (tryBaileysFirst) {
      const baileysResult = await this.baileysService.sendMediaMessage(phoneNumber, body, mediaUrl);
      if (baileysResult.success) {
        this.initialized = true;
        this.activeProvider = "baileys";
        logOutgoing(body, { mediaUrl, type: "media", source: "baileys" });
        return baileysResult;
      }
      baileysError = baileysResult.error || "Baileys media send failed";
    }

    if (!this.client) {
      const init = await this.initializeTwilio();
      if (!init.success) {
        return {
          success: false,
          error: [baileysError, init.error].filter(Boolean).join(" | ")
        };
      }
    }

    try {
      const message = await this.client.messages.create({
        from: `whatsapp:${this.config.whatsappNumber}`,
        to: `whatsapp:${phoneNumber}`,
        body: body,
        mediaUrl: [mediaUrl]
      });

      this.initialized = true;
      this.activeProvider = "twilio";

      logOutgoing(body, { mediaUrl, type: "media", source: "twilio" });
      return {
        success: true,
        provider: "twilio",
        fallbackUsed: Boolean(baileysError),
        messageId: message.sid,
        status: message.status
      };

    } catch (error) {
      return {
        success: false,
        error: [baileysError, error.message].filter(Boolean).join(" | ")
      };
    }
  }

  /**
   * Send a template message (for messages outside 24-hour window)
   * Note: Templates must be pre-approved by WhatsApp
   */
  async sendTemplateMessage(to, templateSid, variables = {}) {
    if (!this.client) {
      const init = await this.initializeTwilio();
      if (!init.success) return { success: false, error: init.error || "Twilio not initialized" };
    }

    const phoneNumber = this.normalizePhoneNumber(to);
    if (!phoneNumber) {
      return { success: false, error: "Invalid phone number" };
    }

    try {
      const message = await this.client.messages.create({
        from: `whatsapp:${this.config.whatsappNumber}`,
        to: `whatsapp:${phoneNumber}`,
        contentSid: templateSid,
        contentVariables: JSON.stringify(variables)
      });

      return {
        success: true,
        provider: "twilio",
        messageId: message.sid,
        status: message.status
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a typing indicator for WhatsApp.
   * Twilio route requires inbound message SID.
   */
  async sendTypingIndicator(messageSidOrOptions, maybeOptions = {}) {
    const options = typeof messageSidOrOptions === "object" && messageSidOrOptions !== null
      ? messageSidOrOptions
      : maybeOptions;
    const messageSid = typeof messageSidOrOptions === "string"
      ? messageSidOrOptions
      : options.messageSid || options.sid || null;
    const to = options.to || options.phone || null;
    const providerHint = String(options.provider || "").toLowerCase();

    // Baileys typing indicator (phone-linked WhatsApp)
    if (providerHint === "baileys" || (to && this.baileysService?.connected)) {
      return this.baileysService.sendTypingIndicator(to, options.durationMs);
    }

    if (!messageSid) {
      return { success: false, error: "messageSid is required for Twilio typing indicator" };
    }

    if (!this.config.accountSid || !this.config.authToken) {
      const init = await this.initializeTwilio();
      if (!init.success) return { success: false, error: init.error || "Twilio not initialized" };
    }

    try {
      const url = "https://messaging.twilio.com/v2/Indicators/Typing.json";
      const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          messageId: messageSid,
          channel: "whatsapp",
        }),
      });

      if (response.ok) return { success: true, provider: "twilio" };
      const text = await response.text();
      return { success: false, error: text };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch a Twilio message by SID.
   */
  async fetchMessage(messageSid) {
    if (!messageSid) return null;
    if (!this.client) {
      const init = await this.initializeTwilio();
      if (!init.success) return null;
    }

    try {
      const msg = await this.client.messages(messageSid).fetch();
      return {
        body: msg.body || "",
        from: msg.from?.replace("whatsapp:", "") || "",
        dateSent: msg.dateSent,
        sid: msg.sid,
      };
    } catch {
      return null;
    }
  }

  /**
   * Handle incoming webhook from Twilio
   * Set up webhook URL in Twilio Console > Messaging > Settings
   */
  handleWebhook(body) {
    // Twilio sends form-urlencoded data
    const from = body.From?.replace("whatsapp:", "") || null;
    const to = body.To?.replace("whatsapp:", "") || null;
    const messageBody = body.Body || "";
    const messageSid = body.MessageSid || null;
    const numMedia = parseInt(body.NumMedia) || 0;

    // Get user ID if registered
    const userId = from ? this.getUserIdForPhone(from) : null;

    const messageData = {
      from,
      to,
      userId,
      messageId: messageSid,
      content: messageBody,
      hasMedia: numMedia > 0,
      mediaUrls: [],
      provider: "twilio",
      timestamp: new Date().toISOString()
    };

    // Extract media URLs if present
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = body[`MediaUrl${i}`];
      if (mediaUrl) {
        messageData.mediaUrls.push(mediaUrl);
      }
    }

    // Track WhatsApp query for goals/insights analysis
    if (messageBody && messageBody.trim()) {
      trackUserQuery(messageBody, QUERY_SOURCE.WHATSAPP, {
        from,
        userId,
        messageId: messageSid
      });

      // Show WhatsApp message notification in terminal title
      const preview = messageBody.length > 25 ? messageBody.slice(0, 25) + "..." : messageBody;
      showNotificationTitle("message", `WhatsApp: ${preview}`, 30000);
    }

    this.emit("message-received", messageData);

    return messageData;
  }

  /**
   * Generate TwiML response for webhook
   * Use this to automatically respond to incoming messages
   */
  generateResponse(message) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${this.escapeXml(message)}</Message>
</Response>`;
  }

  /**
   * Escape XML special characters
   */
  escapeXml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Register a user's phone number
   */
  registerUser(phoneNumber, userId) {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    if (!normalized) {
      return { success: false, error: "Invalid phone number" };
    }

    this.config.registeredUsers[normalized] = userId;
    this.saveConfig();

    this.emit("user-registered", { phoneNumber: normalized, userId });
    return { success: true, phoneNumber: normalized };
  }

  /**
   * Get user ID for a phone number
   */
  getUserIdForPhone(phoneNumber) {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    return this.config.registeredUsers[normalized] || null;
  }

  /**
   * Normalize phone number to E.164 format
   */
  normalizePhoneNumber(phone) {
    if (!phone) return null;

    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, "");

    // Ensure it starts with +
    if (!normalized.startsWith("+")) {
      // Assume US number if 10 digits
      if (normalized.length === 10) {
        normalized = "+1" + normalized;
      } else if (normalized.length === 11 && normalized.startsWith("1")) {
        normalized = "+" + normalized;
      } else {
        normalized = "+" + normalized;
      }
    }

    // Basic validation
    if (normalized.length < 10) return null;

    return normalized;
  }

  /**
   * Get setup instructions
   */
  getBaileysSetupInstructions() {
    return `
BAILEYS WHATSAPP SETUP (PHONE-LINKED)
=====================================

1. INSTALL BAILEYS
   npm install @whiskeysockets/baileys

2. START BACKBONE
   - BACKBONE prints a QR in terminal
   - WhatsApp on phone -> Settings -> Linked Devices -> Link a device
   - Scan QR

3. KEEP BACKBONE RUNNING
   - Session keys are stored locally
   - If logged out, link again from phone
`;
  }

  getTwilioSetupInstructions() {
    const joinWords = this.config.sandboxJoinWords || "join <your-sandbox-word>";
    const whatsappNumber = this.config.whatsappNumber || "+14155238886";

    return `
TWILIO WHATSAPP SETUP (5 minutes)
=================================

1. CREATE TWILIO ACCOUNT
   Go to: twilio.com/try-twilio
   - Sign up (free trial includes $15 credit)
   - Verify your phone number

2. ACTIVATE WHATSAPP SANDBOX
   Go to: Console > Messaging > Try it out > Send a WhatsApp message
   - Follow instructions to join sandbox
   - Send "${joinWords}" to ${whatsappNumber}

3. GET YOUR CREDENTIALS
   Go to: Console Dashboard (twilio.com/console)
   - Copy "Account SID" (starts with AC...)
   - Copy "Auth Token" (click to reveal)
   - Note your sandbox join words (e.g., "join funny-elephant")

4. ADD CREDENTIALS TO FIREBASE FIRESTORE
   Go to: Firebase Console > Firestore Database

   Create document:
     Collection: config
     Document ID: config_twilio

   Add fields:
     accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
     authToken: "your_auth_token_here"
     whatsappNumber: "+14155238886"
     sandboxJoinWords: "join your-sandbox-words"

5. INSTALL TWILIO PACKAGE (if not already)
   npm install twilio

SANDBOX LIMITATIONS:
- Users must first send "${joinWords}" to opt-in
- Messages expire after 72 hours of inactivity
- For production, apply for WhatsApp Business API access

COST:
- Sandbox: Free (limited)
- Production: ~$0.005-0.05 per message
`;
  }

  getSetupInstructions() {
    return `${this.getBaileysSetupInstructions()}\n${this.getTwilioSetupInstructions()}`;
  }

  async requestPairingCode(phoneNumber, options = {}) {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    if (!normalized) {
      return { success: false, error: "Invalid phone number" };
    }
    if (!/^\+1\d{10}$/.test(normalized)) {
      return { success: false, error: "Baileys pairing currently supports US numbers only (+1XXXXXXXXXX)." };
    }

    const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
    const resetOnLoggedOut = options.resetOnLoggedOut !== false;
    const freshAuth = options.freshAuth === true;
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let lastResult = null;

    const initialStatus = this.baileysService.getStatus?.();
    if (freshAuth && !initialStatus?.connected && typeof this.baileysService.clearAuthState === "function") {
      const cleared = await this.baileysService.clearAuthState();
      if (!cleared?.success) {
        return {
          success: false,
          error: cleared?.error || "Failed to reset Baileys auth state."
        };
      }
    }

    const preStatus = this.baileysService.getStatus?.();
    if (resetOnLoggedOut && preStatus?.lastDisconnectCode === 401 && typeof this.baileysService.clearAuthState === "function") {
      const reset = await this.baileysService.clearAuthState();
      if (!reset?.success) {
        return {
          success: false,
          error: reset?.error || "Failed to reset stale Baileys auth state."
        };
      }
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (!this.baileysService.socket) {
        const init = await this.baileysService.initialize();
        if (!init?.success) {
          return {
            success: false,
            error: init?.error || "Failed to initialize Baileys for pairing."
          };
        }
      }

      // Give the websocket a moment to become ready before requesting a code.
      const statusBefore = this.baileysService.getStatus();
      if (!statusBefore?.connected && statusBefore?.connectionState === "connecting") {
        await delay(Math.min(1200, attempt * 400));
      }

      const result = await this.baileysService.requestPairingCode(normalized);
      if (result?.success) {
        return result;
      }
      lastResult = result || { success: false, error: "Failed to generate pairing code." };

      const status = this.baileysService.getStatus();
      const errText = String(lastResult.error || "");
      const loggedOut = status?.lastDisconnectCode === 401;
      const isRecoverable =
        loggedOut ||
        /connection\s*closed|timed?\s*out|socket|stream\s*erro|not\s*connected|connection terminated/i.test(errText);

      if (!isRecoverable || attempt >= maxAttempts) {
        break;
      }

      if (loggedOut && resetOnLoggedOut && typeof this.baileysService.clearAuthState === "function") {
        const reset = await this.baileysService.clearAuthState();
        if (!reset?.success) {
          return {
            success: false,
            error: reset?.error || "Failed to reset stale Baileys auth state."
          };
        }
      } else {
        // Force a fresh socket on transient transport failures.
        const restart = await this.baileysService.restartSocket?.();
        if (restart && restart.success === false) {
          return {
            success: false,
            error: restart.error || "Failed to restart Baileys socket."
          };
        }
      }

      await this.baileysService.initialize();
      await delay(Math.min(2000, attempt * 600));
    }

    return lastResult || { success: false, error: "Failed to generate pairing code." };
  }

  isEventDrivenProvider() {
    return this.activeProvider === "baileys";
  }

  /**
   * Get service status
   */
  getStatus() {
    const baileysStatus = this.baileysService.getStatus();
    return {
      initialized: this.initialized,
      provider: this.activeProvider,
      hasCredentials: !!(this.config.accountSid && this.config.authToken),
      whatsappNumber: this.config.whatsappNumber,
      sandboxJoinWords: this.config.sandboxJoinWords,
      registeredUsers: Object.keys(this.config.registeredUsers).length,
      providerPreference: this.config.providerPreference || "baileys",
      providers: {
        baileys: baileysStatus,
        twilio: {
          initialized: !!this.client,
          hasCredentials: !!(this.config.accountSid && this.config.authToken),
          whatsappNumber: this.config.whatsappNumber,
          authOk: this.twilioHealth.authOk,
          accountName: this.twilioHealth.accountName,
          lastError: this.twilioHealth.lastError,
          errorCode: this.twilioHealth.errorCode,
          errorStatus: this.twilioHealth.errorStatus,
          moreInfo: this.twilioHealth.moreInfo,
          checkedAt: this.twilioHealth.checkedAt
        }
      }
    };
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const status = this.getStatus();
    return {
      configured: status.initialized,
      status: status.initialized ? "Active" : "Not configured",
      provider: status.provider || "none",
      whatsappNumber: status.whatsappNumber,
      sandboxJoinWords: this.config.sandboxJoinWords,
      registeredUsers: Object.keys(this.config.registeredUsers).length,
      setupRequired: !status.initialized ? this.getSetupInstructions() : null,
      baileys: status.providers?.baileys,
      twilio: status.providers?.twilio
    };
  }
}

// Singleton instance
let instance = null;

export const getTwilioWhatsApp = () => {
  if (!instance) {
    instance = new TwilioWhatsAppService();
  }
  return instance;
};

export default TwilioWhatsAppService;
