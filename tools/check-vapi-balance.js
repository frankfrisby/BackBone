import { fetchVapiConfig } from "../src/services/firebase/firebase-config.js";

const config = await fetchVapiConfig();
if (!config || !config.privateKey) {
  console.log("ERROR: No Vapi config found in Firebase or env vars");
  process.exit(1);
}

console.log("Vapi config loaded. Checking account...\n");

// Check recent calls and total spend
const callsRes = await fetch("https://api.vapi.ai/call?limit=20", {
  headers: { Authorization: "Bearer " + config.privateKey }
});

if (callsRes.ok) {
  const calls = await callsRes.json();
  let totalCost = 0;
  console.log("=== RECENT CALLS ===");
  if (Array.isArray(calls) && calls.length > 0) {
    for (const call of calls) {
      const cost = call.cost || 0;
      totalCost += cost;
      const mins = ((call.duration || 0) / 60).toFixed(1);
      console.log("  " + call.createdAt + " | " + call.status + " | " + (call.endedReason || "ongoing") + " | cost: $" + cost.toFixed(4) + " | " + mins + " min");
    }
    console.log("\nTotal cost (last " + calls.length + " calls): $" + totalCost.toFixed(4));
  } else {
    console.log("No recent calls found");
  }
} else {
  console.log("Calls API error:", callsRes.status);
}

// Try org endpoints with both keys
for (const keyType of ["privateKey", "publicKey"]) {
  const key = config[keyType];
  if (!key) continue;

  const orgRes = await fetch("https://api.vapi.ai/org", {
    headers: { Authorization: "Bearer " + key }
  });

  if (orgRes.ok) {
    const org = await orgRes.json();
    console.log("\n=== VAPI ACCOUNT (via " + keyType + ") ===");
    console.log("Name:", org.name || "N/A");
    console.log("Balance:", org.balance !== undefined ? "$" + org.balance : "N/A");
    console.log("Credits:", org.credits !== undefined ? org.credits : "N/A");
    console.log("Plan:", org.plan || org.subscription?.plan || "N/A");
    console.log("Concurrency:", org.concurrencyLimit || "N/A");
    console.log("\nFull org data:", JSON.stringify(org, null, 2));
    break;
  }
}
