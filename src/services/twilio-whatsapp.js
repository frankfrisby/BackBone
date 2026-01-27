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
import { fetchTwilioConfig } from "./firebase-config.js";
import { trackUserQuery, QUERY_SOURCE } from "./query-tracker.js";
import { showNotificationTitle } from "./terminal-resize.js";

const DATA_DIR = path.join(process.cwd(), "data");
const TWILIO_CONFIG_PATH = path.join(DATA_DIR, "twilio-config.json");

/**
 * Twilio WhatsApp Service
 */
export class TwilioWhatsAppService extends EventEmitter {
  constructor() {
    super();
    this.config = this.loadConfig();
    this.client = null;
    this.initialized = false;
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
          authToken: null
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
      registeredUsers: {} // phone -> userId mapping
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
        hasCredentials: !!(this.config.accountSid && this.config.authToken)
      };
      fs.writeFileSync(TWILIO_CONFIG_PATH, JSON.stringify(safeConfig, null, 2));
    } catch (err) {
      console.error("[TwilioWhatsApp] Failed to save config:", err.message);
    }
  }

  /**
   * Initialize the service
   * Fetches credentials from Firebase Firestore
   */
  async initialize(config = {}) {
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
      return {
        success: false,
        error: "Twilio credentials not found in Firebase. Add them to Firestore: config/config_twilio",
        setupInstructions: this.getSetupInstructions()
      };
    }

    try {
      // Dynamic import of Twilio (so it doesn't fail if not installed)
      const twilio = await import("twilio");
      this.client = twilio.default(this.config.accountSid, this.config.authToken);

      // Verify credentials by fetching account info
      const account = await this.client.api.accounts(this.config.accountSid).fetch();

      this.initialized = true;
      this.saveConfig();

      console.log("[TwilioWhatsApp] Initialized successfully");
      this.emit("initialized", { accountName: account.friendlyName });

      return {
        success: true,
        accountName: account.friendlyName,
        whatsappNumber: this.config.whatsappNumber
      };

    } catch (error) {
      if (error.code === "MODULE_NOT_FOUND" || error.message.includes("Cannot find module")) {
        return {
          success: false,
          error: "Twilio package not installed. Run: npm install twilio",
          setupInstructions: this.getSetupInstructions()
        };
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send a WhatsApp message
   */
  async sendMessage(to, body) {
    if (!this.initialized || !this.client) {
      return { success: false, error: "Service not initialized" };
    }

    const phoneNumber = this.normalizePhoneNumber(to);
    if (!phoneNumber) {
      return { success: false, error: "Invalid phone number" };
    }

    try {
      const message = await this.client.messages.create({
        from: `whatsapp:${this.config.whatsappNumber}`,
        to: `whatsapp:${phoneNumber}`,
        body: body
      });

      this.emit("message-sent", {
        to: phoneNumber,
        messageId: message.sid,
        status: message.status
      });

      return {
        success: true,
        messageId: message.sid,
        status: message.status
      };

    } catch (error) {
      console.error("[TwilioWhatsApp] Send error:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send a message with media (image, document, etc.)
   */
  async sendMediaMessage(to, body, mediaUrl) {
    if (!this.initialized || !this.client) {
      return { success: false, error: "Service not initialized" };
    }

    const phoneNumber = this.normalizePhoneNumber(to);
    if (!phoneNumber) {
      return { success: false, error: "Invalid phone number" };
    }

    try {
      const message = await this.client.messages.create({
        from: `whatsapp:${this.config.whatsappNumber}`,
        to: `whatsapp:${phoneNumber}`,
        body: body,
        mediaUrl: [mediaUrl]
      });

      return {
        success: true,
        messageId: message.sid,
        status: message.status
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a template message (for messages outside 24-hour window)
   * Note: Templates must be pre-approved by WhatsApp
   */
  async sendTemplateMessage(to, templateSid, variables = {}) {
    if (!this.initialized || !this.client) {
      return { success: false, error: "Service not initialized" };
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
        messageId: message.sid,
        status: message.status
      };

    } catch (error) {
      return { success: false, error: error.message };
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
  getSetupInstructions() {
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

  /**
   * Get service status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      hasCredentials: !!(this.config.accountSid && this.config.authToken),
      whatsappNumber: this.config.whatsappNumber,
      sandboxJoinWords: this.config.sandboxJoinWords,
      registeredUsers: Object.keys(this.config.registeredUsers).length
    };
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      configured: this.initialized,
      status: this.initialized ? "Active" : "Not configured",
      provider: "Twilio",
      whatsappNumber: this.initialized ? this.config.whatsappNumber : null,
      sandboxJoinWords: this.config.sandboxJoinWords,
      registeredUsers: Object.keys(this.config.registeredUsers).length,
      setupRequired: !this.initialized ? this.getSetupInstructions() : null
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
