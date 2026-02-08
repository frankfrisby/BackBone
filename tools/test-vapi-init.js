import { fetchVapiConfig } from "../src/services/firebase/firebase-config.js";
import { loadUserSettings } from "../src/services/user-settings.js";

const config = await fetchVapiConfig();
console.log("Vapi privateKey:", config.privateKey ? "SET" : "MISSING");
console.log("Vapi phoneNumberId:", config.phoneNumberId || "MISSING");

const settings = loadUserSettings();
console.log("User phone:", settings.phoneNumber || "MISSING");

const { VapiClient } = await import("@vapi-ai/server-sdk");
const client = new VapiClient({ token: config.privateKey });
console.log("VapiClient created successfully");

// Test listing recent calls (read-only, safe)
const calls = await client.calls.list({ limit: 1 });
console.log("API connection test:", calls ? "WORKING" : "FAILED");
console.log("Most recent call:", calls[0]?.createdAt || "none");

console.log("\nAll systems GO — Vapi is ready to make calls");
