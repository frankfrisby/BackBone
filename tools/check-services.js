/**
 * Check Vapi + WhatsApp service status
 * Diagnoses config, auth, and connectivity issues
 */
import { fetchVapiConfig, fetchTwilioConfig } from "../src/services/firebase/firebase-config.js";
import { loadUserSettings } from "../src/services/user-settings.js";
import fs from "fs";
import path from "path";
import { getDataDir } from "../src/services/paths.js";

const DATA_DIR = getDataDir();

console.log("=== SERVICE HEALTH CHECK ===\n");

// 1. User settings
const settings = loadUserSettings();
console.log("1. USER SETTINGS");
console.log("   Phone:", settings.phoneNumber || "NOT SET");
console.log("   Phone connected:", settings.connections?.phone || false);
console.log("");

// 2. Phone auth
try {
  const phoneAuth = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "phone-auth.json"), "utf-8"));
  const users = Object.keys(phoneAuth);
  console.log("2. PHONE AUTH");
  for (const uid of users) {
    const entry = phoneAuth[uid];
    console.log("   UID:", uid);
    console.log("   Phone:", entry.phoneNumber || "NOT SET");
    console.log("   Verified:", entry.verification?.status || "unknown");
    console.log("   WhatsApp:", entry.meta?.whatsappEnabled || false);
  }
} catch (e) {
  console.log("2. PHONE AUTH: Not found");
}
console.log("");

// 3. Vapi config
console.log("3. VAPI CONFIG");
try {
  const vapiConfig = await fetchVapiConfig();
  if (vapiConfig) {
    console.log("   privateKey:", vapiConfig.privateKey ? vapiConfig.privateKey.slice(0, 12) + "..." : "MISSING");
    console.log("   publicKey:", vapiConfig.publicKey ? vapiConfig.publicKey.slice(0, 12) + "..." : "MISSING");
    console.log("   phoneNumberId:", vapiConfig.phoneNumberId || "MISSING");
    console.log("   Status: " + (vapiConfig.privateKey ? "READY" : "NOT CONFIGURED"));

    // Check if local cache exists
    const localPath = path.join(DATA_DIR, "config_vapi.json");
    console.log("   Local cache:", fs.existsSync(localPath) ? "EXISTS" : "will be created on next Firebase fetch");
  } else {
    console.log("   Status: NOT CONFIGURED");
    console.log("   Fix: Add config/config_vapi to Firebase Firestore with: privateKey, publicKey, phoneNumberId");
  }
} catch (e) {
  console.log("   Error:", e.message);
}
console.log("");

// 4. Twilio config
console.log("4. TWILIO / WHATSAPP CONFIG");
try {
  const twilioConfig = await fetchTwilioConfig();
  if (twilioConfig) {
    console.log("   accountSid:", twilioConfig.accountSid ? twilioConfig.accountSid.slice(0, 10) + "..." : "MISSING");
    console.log("   authToken:", twilioConfig.authToken ? "SET (hidden)" : "MISSING");
    console.log("   whatsappNumber:", twilioConfig.whatsappNumber || "MISSING");
    console.log("   Status: " + (twilioConfig.accountSid && twilioConfig.authToken ? "READY" : "NOT CONFIGURED"));

    const localPath = path.join(DATA_DIR, "config_twilio.json");
    console.log("   Local cache:", fs.existsSync(localPath) ? "EXISTS" : "will be created on next Firebase fetch");
  } else {
    console.log("   Status: NOT CONFIGURED");
    console.log("   Fix: Add config/config_twilio to Firebase Firestore with: accountSid, authToken, whatsappNumber");
  }
} catch (e) {
  console.log("   Error:", e.message);
}
console.log("");

// 5. Vapi SDK test
console.log("5. VAPI SDK");
try {
  const { VapiClient } = await import("@vapi-ai/server-sdk");
  console.log("   @vapi-ai/server-sdk: INSTALLED");
} catch (e) {
  console.log("   @vapi-ai/server-sdk: NOT INSTALLED — run: npm install @vapi-ai/server-sdk");
}

// 6. Twilio SDK test
try {
  await import("twilio");
  console.log("   twilio: INSTALLED");
} catch (e) {
  console.log("   twilio: NOT INSTALLED — run: npm install twilio");
}

console.log("\n=== DONE ===");
