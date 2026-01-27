/**
 * Phone Authentication Service
 *
 * Verifies user phone numbers via WhatsApp OTP.
 * Integrates with Twilio WhatsApp for sending verification codes.
 *
 * FLOW:
 * 1. User enters phone number (required in onboarding)
 * 2. Code is sent to user's WhatsApp
 * 3. User enters 6-digit code
 * 4. 3 attempts allowed, then must retry
 * 5. Once verified, phone is locked in for messaging
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getTwilioWhatsApp } from "./twilio-whatsapp.js";
import { getRealtimeMessaging } from "./realtime-messaging.js";

const DATA_DIR = path.join(process.cwd(), "data");
const PHONE_DATA_PATH = path.join(DATA_DIR, "phone-auth.json");

/**
 * Configuration
 */
const CONFIG = {
  CODE_LENGTH: 6,
  CODE_EXPIRY_MS: 10 * 60 * 1000,    // 10 minutes
  MAX_ATTEMPTS: 3,
  MAX_CODES_PER_HOUR: 3,
  RATE_LIMIT_WINDOW_MS: 60 * 60 * 1000  // 1 hour
};

/**
 * Verification status
 */
export const VERIFICATION_STATUS = {
  PENDING: "pending",
  VERIFIED: "verified",
  EXPIRED: "expired",
  FAILED: "failed",
  RATE_LIMITED: "rate_limited"
};

const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const readData = () => {
  ensureDataDir();
  if (!fs.existsSync(PHONE_DATA_PATH)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(PHONE_DATA_PATH, "utf-8");
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error("phone auth read failed:", error.message);
    return {};
  }
};

const writeData = (payload) => {
  ensureDataDir();
  fs.writeFileSync(PHONE_DATA_PATH, JSON.stringify(payload, null, 2), "utf-8");
};

const buildUserRecord = (userId, overrides = {}) => {
  const store = readData();
  const current = store[userId] || { messages: [], meta: {} };
  const next = { ...current, ...overrides };
  store[userId] = next;
  writeData(store);
  return next;
};

const logMessage = (userId, text, source = "system") => {
  const entry = {
    id: crypto.randomUUID(),
    text,
    source,
    timestamp: new Date().toISOString()
  };
  const record = buildUserRecord(userId, {
    messages: [entry, ...(readData()[userId]?.messages || [])].slice(0, 40)
  });
  return entry;
};

/**
 * Normalize phone number to E.164 format
 */
const normalizePhone = (phone) => {
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

  return normalized;
};

/**
 * Generate a secure 6-digit code
 */
const generateCode = () => {
  const buffer = crypto.randomBytes(4);
  const num = buffer.readUInt32BE(0);
  const code = (num % 900000) + 100000;
  return code.toString();
};

/**
 * Check if user is rate limited
 */
const isRateLimited = (userId) => {
  const data = readData()[userId];
  if (!data?.codeHistory) return false;

  const now = Date.now();
  const windowStart = now - CONFIG.RATE_LIMIT_WINDOW_MS;
  const recentCodes = data.codeHistory.filter(c => c.sentAt > windowStart);

  return recentCodes.length >= CONFIG.MAX_CODES_PER_HOUR;
};

/**
 * Request a phone verification code
 * Sends code via WhatsApp
 *
 * @param {string} userId - User's ID
 * @param {string} phoneNumber - Phone number to verify
 * @returns {Promise<Object>} Result with success status
 */
export const requestPhoneCode = async (userId, phoneNumber) => {
  const normalized = normalizePhone(phoneNumber);

  if (!normalized || normalized.length < 10) {
    return {
      success: false,
      error: "Invalid phone number format"
    };
  }

  // Check rate limiting
  if (isRateLimited(userId)) {
    return {
      success: false,
      status: VERIFICATION_STATUS.RATE_LIMITED,
      error: "Too many verification attempts. Please try again in 1 hour."
    };
  }

  // Generate code
  const code = generateCode();
  const now = Date.now();

  // Initialize WhatsApp service
  const whatsapp = getTwilioWhatsApp();

  // Check if WhatsApp is configured
  if (!whatsapp.initialized) {
    const initResult = await whatsapp.initialize();
    if (!initResult.success) {
      // Fall back to storing code locally (for testing without Twilio)
      console.warn("[PhoneAuth] WhatsApp not configured, storing code locally");

      buildUserRecord(userId, {
        phoneNumber: normalized,
        verification: {
          code,
          sentAt: now,
          expiresAt: now + CONFIG.CODE_EXPIRY_MS,
          attempts: 0,
          status: VERIFICATION_STATUS.PENDING
        },
        codeHistory: [
          ...(readData()[userId]?.codeHistory || []).slice(-10),
          { sentAt: now }
        ],
        meta: {
          ...(readData()[userId]?.meta || {}),
          lastPhoneUpdated: new Date().toISOString()
        }
      });

      logMessage(userId, `[TEST MODE] Verification code: ${code}`, "otp");

      return {
        success: true,
        testMode: true,
        code, // Only return code in test mode!
        message: "WhatsApp not configured. Code stored locally for testing.",
        attemptsRemaining: CONFIG.MAX_ATTEMPTS
      };
    }
  }

  // Send code via WhatsApp
  const message = `Your BACKBONE verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, please ignore this message.`;

  const sendResult = await whatsapp.sendMessage(normalized, message);

  if (!sendResult.success) {
    return {
      success: false,
      error: `Failed to send code: ${sendResult.error}`
    };
  }

  // Store verification data
  buildUserRecord(userId, {
    phoneNumber: normalized,
    verification: {
      code,
      sentAt: now,
      expiresAt: now + CONFIG.CODE_EXPIRY_MS,
      attempts: 0,
      status: VERIFICATION_STATUS.PENDING,
      messageId: sendResult.messageId
    },
    codeHistory: [
      ...(readData()[userId]?.codeHistory || []).slice(-10),
      { sentAt: now }
    ],
    meta: {
      ...(readData()[userId]?.meta || {}),
      lastPhoneUpdated: new Date().toISOString()
    }
  });

  logMessage(userId, `Verification code sent to WhatsApp: ${normalized}`, "otp");

  return {
    success: true,
    phoneNumber: normalized,
    attemptsRemaining: CONFIG.MAX_ATTEMPTS,
    expiresAt: now + CONFIG.CODE_EXPIRY_MS
  };
};

/**
 * Verify the code entered by user
 *
 * @param {string} userId - User's ID
 * @param {string} code - The 6-digit code entered by user
 * @returns {Promise<Object>} Result with status
 */
export const verifyPhoneCode = async (userId, code) => {
  const data = readData()[userId];

  if (!data?.verification) {
    return {
      success: false,
      status: VERIFICATION_STATUS.EXPIRED,
      error: "No verification in progress. Please request a new code."
    };
  }

  const verification = data.verification;

  // Check if already verified
  if (verification.status === VERIFICATION_STATUS.VERIFIED) {
    return {
      success: true,
      status: VERIFICATION_STATUS.VERIFIED,
      phoneNumber: data.phoneNumber,
      message: "Phone already verified"
    };
  }

  // Check if failed (used all attempts)
  if (verification.status === VERIFICATION_STATUS.FAILED) {
    return {
      success: false,
      status: VERIFICATION_STATUS.FAILED,
      error: "Verification failed. Please hit Retry to request a new code.",
      attemptsRemaining: 0
    };
  }

  // Check if expired
  if (Date.now() > verification.expiresAt) {
    buildUserRecord(userId, {
      verification: {
        ...verification,
        status: VERIFICATION_STATUS.EXPIRED
      }
    });

    return {
      success: false,
      status: VERIFICATION_STATUS.EXPIRED,
      error: "Code expired. Please request a new code."
    };
  }

  // Increment attempts
  const attempts = (verification.attempts || 0) + 1;

  // Check if code matches
  if (verification.code === code.trim()) {
    // Success!
    buildUserRecord(userId, {
      verification: {
        ...verification,
        attempts,
        status: VERIFICATION_STATUS.VERIFIED,
        verifiedAt: new Date().toISOString()
      },
      meta: {
        ...(data.meta || {}),
        phoneVerifiedAt: new Date().toISOString(),
        whatsappEnabled: true
      }
    });

    logMessage(userId, `Phone verified: ${data.phoneNumber}`, "system");

    // Sync phone to Firebase Firestore so webhook can route messages
    try {
      const messaging = getRealtimeMessaging();
      if (!messaging.userId) {
        await messaging.initialize(userId);
      }
      const registerResult = await messaging.registerUserPhone(data.phoneNumber);
      if (registerResult.success) {
        console.log(`[PhoneAuth] Phone synced to Firestore for user ${userId}`);
      } else {
        console.warn(`[PhoneAuth] Failed to sync phone to Firestore: ${registerResult.error}`);
      }
    } catch (syncError) {
      // Don't fail verification if sync fails - can retry later
      console.warn("[PhoneAuth] Firestore sync error:", syncError.message);
    }

    return {
      success: true,
      status: VERIFICATION_STATUS.VERIFIED,
      phoneNumber: data.phoneNumber,
      message: "Phone number verified successfully!"
    };
  }

  // Wrong code
  const attemptsRemaining = CONFIG.MAX_ATTEMPTS - attempts;

  if (attemptsRemaining <= 0) {
    // No more attempts
    buildUserRecord(userId, {
      verification: {
        ...verification,
        attempts,
        status: VERIFICATION_STATUS.FAILED
      }
    });

    return {
      success: false,
      status: VERIFICATION_STATUS.FAILED,
      error: "Too many incorrect attempts. Please hit Retry to request a new code.",
      attemptsRemaining: 0
    };
  }

  // Still have attempts remaining
  buildUserRecord(userId, {
    verification: {
      ...verification,
      attempts
    }
  });

  return {
    success: false,
    status: VERIFICATION_STATUS.PENDING,
    error: `Incorrect code. ${attemptsRemaining} attempt${attemptsRemaining > 1 ? 's' : ''} remaining.`,
    attemptsRemaining
  };
};

/**
 * Retry verification (request new code)
 */
export const retryVerification = async (userId) => {
  const data = readData()[userId];
  const phoneNumber = data?.phoneNumber;

  if (!phoneNumber) {
    return {
      success: false,
      error: "No phone number on record. Please enter your number again."
    };
  }

  return requestPhoneCode(userId, phoneNumber);
};

/**
 * Get user's phone record
 */
export const getPhoneRecord = (userId) => readData()[userId] || null;

/**
 * Check if phone is verified
 */
export const isPhoneVerified = (userId) => {
  const data = readData()[userId];
  return data?.verification?.status === VERIFICATION_STATUS.VERIFIED;
};

/**
 * Get verified phone number
 */
export const getVerifiedPhone = (userId) => {
  const data = readData()[userId];
  if (data?.verification?.status === VERIFICATION_STATUS.VERIFIED) {
    return data.phoneNumber;
  }
  return null;
};

/**
 * Get verification status for UI
 */
export const getVerificationStatus = (userId) => {
  const data = readData()[userId];

  if (!data?.verification) {
    return {
      status: null,
      phoneNumber: null,
      attemptsRemaining: CONFIG.MAX_ATTEMPTS
    };
  }

  const verification = data.verification;

  // Check if expired
  if (verification.status === VERIFICATION_STATUS.PENDING &&
      Date.now() > verification.expiresAt) {
    return {
      status: VERIFICATION_STATUS.EXPIRED,
      phoneNumber: data.phoneNumber,
      attemptsRemaining: 0
    };
  }

  return {
    status: verification.status,
    phoneNumber: data.phoneNumber,
    attemptsRemaining: CONFIG.MAX_ATTEMPTS - (verification.attempts || 0),
    isVerified: verification.status === VERIFICATION_STATUS.VERIFIED,
    verifiedAt: verification.verifiedAt
  };
};

/**
 * Send a message to verified user via WhatsApp
 */
export const sendWhatsAppMessage = async (userId, message) => {
  const data = readData()[userId];

  if (!data?.verification?.status === VERIFICATION_STATUS.VERIFIED) {
    return { success: false, error: "Phone not verified" };
  }

  const whatsapp = getTwilioWhatsApp();
  if (!whatsapp.initialized) {
    await whatsapp.initialize();
  }

  return whatsapp.sendMessage(data.phoneNumber, message);
};

/**
 * Sync verified phone to Firestore
 * Call this at app startup to ensure the phone is registered in Firestore
 * (Useful for users who verified before Firestore sync was added)
 *
 * @param {string} userId - User's Firebase UID
 * @returns {Promise<Object>} Result with success status
 */
export const syncPhoneToFirestore = async (userId) => {
  const data = readData()[userId];

  if (!data?.verification?.status === VERIFICATION_STATUS.VERIFIED) {
    return { success: false, error: "Phone not verified" };
  }

  if (!data.phoneNumber) {
    return { success: false, error: "No phone number on record" };
  }

  try {
    const messaging = getRealtimeMessaging();
    if (!messaging.userId) {
      await messaging.initialize(userId);
    }
    const result = await messaging.registerUserPhone(data.phoneNumber);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Legacy exports for backward compatibility
export const pushUserMessage = (userId, message) => logMessage(userId, message, "user");
export const pushAiMessage = (userId, message) => logMessage(userId, message, "ai");
export const getUserMessages = (userId) => (readData()[userId]?.messages || []);
export const getPhoneMeta = (userId) => (readData()[userId]?.meta || {});

export default {
  requestPhoneCode,
  verifyPhoneCode,
  retryVerification,
  getPhoneRecord,
  isPhoneVerified,
  getVerifiedPhone,
  getVerificationStatus,
  sendWhatsAppMessage,
  syncPhoneToFirestore,
  pushUserMessage,
  pushAiMessage,
  getUserMessages,
  getPhoneMeta,
  VERIFICATION_STATUS
};
