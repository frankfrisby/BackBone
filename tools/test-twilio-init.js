import { fetchTwilioConfig } from "../src/services/firebase/firebase-config.js";

const config = await fetchTwilioConfig();
console.log("Twilio accountSid:", config.accountSid ? config.accountSid.slice(0, 10) + "..." : "MISSING");
console.log("Twilio authToken:", config.authToken ? "SET" : "MISSING");
console.log("WhatsApp number:", config.whatsappNumber || "MISSING");

if (config.accountSid && config.authToken) {
  const twilio = (await import("twilio")).default;
  const client = twilio(config.accountSid, config.authToken);

  // Test: fetch account info (read-only, safe)
  const account = await client.api.accounts(config.accountSid).fetch();
  console.log("Account status:", account.status);
  console.log("Account name:", account.friendlyName);
  console.log("\nAll systems GO — Twilio/WhatsApp is ready");
} else {
  console.log("\nMISSING CREDENTIALS — cannot connect to Twilio");
}
