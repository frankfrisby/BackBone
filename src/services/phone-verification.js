/**
 * Phone Verification Service
 *
 * Verifies user phone numbers via WhatsApp OTP.
 *
 * FLOW:
 * 1. User enters phone number in app
 * 2. App generates 6-digit code and sends via WhatsApp
 * 3. User enters code in app
 * 4. App verifies code matches
 * 5. User gets 3 attempts - after that, must hit "Retry" for new code
 *
 * Security:
 * - Codes expire after 10 minutes
 * - 3 attempt limit per code
 * - Rate limiting: max 3 codes per hour per phone number
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { EventEmitter } from "events";
import { getTwilioWhatsApp } from "./twilio-whatsapp.js";

const DATA_DIR = path.join(process.cwd(), "data");
const VERIFICATION_PATH = path.join(DATA_DIR, "phone-verifications.json");

/**
 * Verification status
 */
export const VERIFICATION_STATUS = {
  PENDING: "pending",           // Code sent, waiting for user input
  VERIFIED: "verified",         // Successfully verified
  EXPIRED: "expired",           // Code expired (10 min)
  FAILED: "failed",             // Used all 3 attempts
  RATE_LIMITED: "rate_limited"  // Too many code requests
};

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
 * Phone Verification Service
 */
export class PhoneVerificationService extends EventEmitter {
  constructor() {
    super();
    this.verifications = this.loadVerifications();
    this.whatsapp = null;
  }

  /**
   * Load verifications from disk
   */
  loadVerifications() {
    try {
      if (fs.existsSync(VERIFICATION_PATH)) {
        const data = JSON.parse(fs.readFileSync(VERIFICATION_PATH, "utf-8"));
        return new Map(Object.entries(data));
      }
    } catch (err) {
      console.error("[PhoneVerification] Failed to load:", err.message);
    }
    return new Map();
  }

  /**
   * Save verifications to disk
   */
  saveVerifications() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = Object.fromEntries(this.verifications);
      fs.writeFileSync(VERIFICATION_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("[PhoneVerification] Failed to save:", err.message);
    }
  }

  /**
   * Initialize the service
   */
  async initialize() {
    this.whatsapp = getTwilioWhatsApp();
    const result = await this.whatsapp.initialize();

    if (!result.success) {
      return {
        success: false,
        error: "WhatsApp service not configured",
        setupInstructions: result.setupInstructions
      };
    }

    // Clean up expired verifications
    this.cleanupExpired();

    return { success: true };
  }

  /**
   * Generate a random 6-digit code
   */
  generateCode() {
    // Generate cryptographically secure random code
    const buffer = crypto.randomBytes(4);
    const num = buffer.readUInt32BE(0);
    // Ensure 6 digits (100000-999999)
    const code = (num % 900000) + 100000;
    return code.toString();
  }

  /**
   * Normalize phone number
   */
  normalizePhone(phone) {
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
  }

  /**
   * Check rate limiting for a phone number
   */
  isRateLimited(phoneNumber) {
    const now = Date.now();
    const windowStart = now - CONFIG.RATE_LIMIT_WINDOW_MS;

    // Count codes sent in the last hour
    let codesSent = 0;

    for (const [key, verification] of this.verifications) {
      if (key.startsWith(phoneNumber) && verification.createdAt > windowStart) {
        codesSent++;
      }
    }

    return codesSent >= CONFIG.MAX_CODES_PER_HOUR;
  }

  /**
   * Send verification code to phone number
   *
   * @param {string} phoneNumber - Phone number to verify
   * @param {string} userId - User ID requesting verification
   * @returns {Object} Result with verificationId or error
   */
  async sendVerificationCode(phoneNumber, userId) {
    const normalized = this.normalizePhone(phoneNumber);

    if (!normalized) {
      return {
        success: false,
        error: "Invalid phone number format"
      };
    }

    // Check rate limiting
    if (this.isRateLimited(normalized)) {
      return {
        success: false,
        status: VERIFICATION_STATUS.RATE_LIMITED,
        error: "Too many verification attempts. Please try again in 1 hour."
      };
    }

    // Check if WhatsApp is initialized
    if (!this.whatsapp?.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return initResult;
      }
    }

    // Generate code and verification ID
    const code = this.generateCode();
    const verificationId = `${normalized}_${Date.now()}`;

    // Create verification record
    const verification = {
      id: verificationId,
      phoneNumber: normalized,
      userId,
      code,
      attempts: 0,
      maxAttempts: CONFIG.MAX_ATTEMPTS,
      status: VERIFICATION_STATUS.PENDING,
      createdAt: Date.now(),
      expiresAt: Date.now() + CONFIG.CODE_EXPIRY_MS
    };

    // Send code via WhatsApp
    const message = `Your BACKBONE verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, please ignore this message.`;

    const sendResult = await this.whatsapp.sendMessage(normalized, message);

    if (!sendResult.success) {
      return {
        success: false,
        error: `Failed to send code: ${sendResult.error}`
      };
    }

    // Save verification
    verification.messageId = sendResult.messageId;
    this.verifications.set(verificationId, verification);
    this.saveVerifications();

    this.emit("code-sent", {
      verificationId,
      phoneNumber: normalized,
      userId,
      expiresAt: verification.expiresAt
    });

    return {
      success: true,
      verificationId,
      phoneNumber: normalized,
      expiresAt: verification.expiresAt,
      attemptsRemaining: CONFIG.MAX_ATTEMPTS
    };
  }

  /**
   * Verify the code entered by user
   *
   * @param {string} verificationId - The verification ID from sendVerificationCode
   * @param {string} code - The 6-digit code entered by user
   * @returns {Object} Result with status
   */
  verifyCode(verificationId, code) {
    const verification = this.verifications.get(verificationId);

    if (!verification) {
      return {
        success: false,
        error: "Verification not found. Please request a new code.",
        status: VERIFICATION_STATUS.EXPIRED
      };
    }

    // Check if already verified
    if (verification.status === VERIFICATION_STATUS.VERIFIED) {
      return {
        success: true,
        status: VERIFICATION_STATUS.VERIFIED,
        message: "Phone number already verified"
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
      verification.status = VERIFICATION_STATUS.EXPIRED;
      this.verifications.set(verificationId, verification);
      this.saveVerifications();

      return {
        success: false,
        status: VERIFICATION_STATUS.EXPIRED,
        error: "Code expired. Please request a new code."
      };
    }

    // Increment attempts
    verification.attempts++;

    // Check if code matches
    if (verification.code === code.trim()) {
      // Success!
      verification.status = VERIFICATION_STATUS.VERIFIED;
      verification.verifiedAt = Date.now();
      this.verifications.set(verificationId, verification);
      this.saveVerifications();

      this.emit("verified", {
        verificationId,
        phoneNumber: verification.phoneNumber,
        userId: verification.userId
      });

      return {
        success: true,
        status: VERIFICATION_STATUS.VERIFIED,
        phoneNumber: verification.phoneNumber,
        message: "Phone number verified successfully!"
      };
    }

    // Wrong code
    const attemptsRemaining = CONFIG.MAX_ATTEMPTS - verification.attempts;

    if (attemptsRemaining <= 0) {
      // No more attempts
      verification.status = VERIFICATION_STATUS.FAILED;
      this.verifications.set(verificationId, verification);
      this.saveVerifications();

      this.emit("failed", {
        verificationId,
        phoneNumber: verification.phoneNumber,
        userId: verification.userId,
        reason: "max_attempts_exceeded"
      });

      return {
        success: false,
        status: VERIFICATION_STATUS.FAILED,
        error: "Too many incorrect attempts. Please hit Retry to request a new code.",
        attemptsRemaining: 0
      };
    }

    // Still have attempts remaining
    this.verifications.set(verificationId, verification);
    this.saveVerifications();

    this.emit("attempt-failed", {
      verificationId,
      attemptsRemaining
    });

    return {
      success: false,
      status: VERIFICATION_STATUS.PENDING,
      error: `Incorrect code. ${attemptsRemaining} attempt${attemptsRemaining > 1 ? 's' : ''} remaining.`,
      attemptsRemaining
    };
  }

  /**
   * Retry verification (request new code)
   * Invalidates previous verification and sends new code
   */
  async retry(phoneNumber, userId) {
    const normalized = this.normalizePhone(phoneNumber);

    // Invalidate any existing verifications for this phone
    for (const [key, verification] of this.verifications) {
      if (verification.phoneNumber === normalized &&
          verification.status === VERIFICATION_STATUS.PENDING) {
        verification.status = VERIFICATION_STATUS.EXPIRED;
        this.verifications.set(key, verification);
      }
    }
    this.saveVerifications();

    // Send new code
    return this.sendVerificationCode(phoneNumber, userId);
  }

  /**
   * Check if a phone number is verified for a user
   */
  isPhoneVerified(phoneNumber, userId) {
    const normalized = this.normalizePhone(phoneNumber);

    for (const [key, verification] of this.verifications) {
      if (verification.phoneNumber === normalized &&
          verification.userId === userId &&
          verification.status === VERIFICATION_STATUS.VERIFIED) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get verification status
   */
  getVerificationStatus(verificationId) {
    const verification = this.verifications.get(verificationId);

    if (!verification) {
      return { status: VERIFICATION_STATUS.EXPIRED, found: false };
    }

    // Check if expired
    if (verification.status === VERIFICATION_STATUS.PENDING &&
        Date.now() > verification.expiresAt) {
      verification.status = VERIFICATION_STATUS.EXPIRED;
      this.verifications.set(verificationId, verification);
      this.saveVerifications();
    }

    return {
      found: true,
      status: verification.status,
      phoneNumber: verification.phoneNumber,
      attemptsRemaining: CONFIG.MAX_ATTEMPTS - verification.attempts,
      expiresAt: verification.expiresAt,
      isExpired: Date.now() > verification.expiresAt
    };
  }

  /**
   * Get all verified phone numbers for a user
   */
  getVerifiedPhones(userId) {
    const phones = [];

    for (const [key, verification] of this.verifications) {
      if (verification.userId === userId &&
          verification.status === VERIFICATION_STATUS.VERIFIED) {
        phones.push({
          phoneNumber: verification.phoneNumber,
          verifiedAt: verification.verifiedAt
        });
      }
    }

    return phones;
  }

  /**
   * Clean up expired verifications
   */
  cleanupExpired() {
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

    for (const [key, verification] of this.verifications) {
      // Remove verifications older than 1 week
      if (verification.createdAt < oneWeekAgo) {
        this.verifications.delete(key);
      }
      // Mark pending verifications as expired if past expiry
      else if (verification.status === VERIFICATION_STATUS.PENDING &&
               now > verification.expiresAt) {
        verification.status = VERIFICATION_STATUS.EXPIRED;
        this.verifications.set(key, verification);
      }
    }

    this.saveVerifications();
  }

  /**
   * Get display data for UI
   */
  getDisplayData(verificationId = null) {
    if (verificationId) {
      return this.getVerificationStatus(verificationId);
    }

    return {
      initialized: this.whatsapp?.initialized || false,
      totalVerifications: this.verifications.size,
      config: {
        codeLength: CONFIG.CODE_LENGTH,
        expiryMinutes: CONFIG.CODE_EXPIRY_MS / 60000,
        maxAttempts: CONFIG.MAX_ATTEMPTS,
        maxCodesPerHour: CONFIG.MAX_CODES_PER_HOUR
      }
    };
  }
}

// Singleton instance
let instance = null;

export const getPhoneVerification = () => {
  if (!instance) {
    instance = new PhoneVerificationService();
  }
  return instance;
};

export default PhoneVerificationService;
