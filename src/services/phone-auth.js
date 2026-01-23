import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const PHONE_DATA_PATH = path.join(DATA_DIR, "phone-auth.json");

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

export const requestPhoneCode = (userId, phoneNumber) => {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  buildUserRecord(userId, {
    phoneNumber,
    verification: {
      code,
      sentAt: new Date().toISOString(),
      attempts: 0
    },
    meta: {
      ...(readData()[userId]?.meta || {}),
      lastPhoneUpdated: new Date().toISOString()
    }
  });
  logMessage(userId, `Verification code: ${code}`, "otp");
  return code;
};

export const verifyPhoneCode = (userId, code) => {
  const data = readData()[userId];
  if (!data?.verification) return false;
  const match = data.verification.code === code;
  buildUserRecord(userId, {
    verification: {
      ...data.verification,
      attempts: (data.verification.attempts || 0) + 1,
      verifiedAt: match ? new Date().toISOString() : data.verification.verifiedAt
    },
    meta: {
      ...(data.meta || {}),
      phoneVerifiedAt: match ? new Date().toISOString() : data.meta?.phoneVerifiedAt
    }
  });
  return match;
};

export const getPhoneRecord = (userId) => readData()[userId] || null;

export const pushUserMessage = (userId, message) => logMessage(userId, message, "user");

export const pushAiMessage = (userId, message) => logMessage(userId, message, "ai");

export const getUserMessages = (userId) => (readData()[userId]?.messages || []);

export const getPhoneMeta = (userId) => (readData()[userId]?.meta || {});

export default {
  requestPhoneCode,
  verifyPhoneCode,
  getPhoneRecord,
  pushUserMessage,
  pushAiMessage,
  getUserMessages,
  getPhoneMeta
};
