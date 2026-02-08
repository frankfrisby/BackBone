#!/usr/bin/env node
/**
 * Respond to a pending Firebase message
 */

import { getRealtimeMessaging, MESSAGE_TYPE, MESSAGE_STATUS } from "../src/services/messaging/realtime-messaging.js";
import { loadFirebaseUser } from "../src/services/firebase/firebase-auth.js";

const MESSAGE_ID = "MpfdNH8Zv1xGPFXs3yqk";

const RESPONSE = `Here's what BACKBONE has accomplished over the last few days to help you:

**🔧 System Improvements (Feb 4-6)**

1. **Fixed Trading Auth** — Auto-trader now properly loads Alpaca credentials from config files instead of failing on env vars

2. **Fixed Health Data** — Oura ring data now correctly loads across all services (briefs, dashboard, voice)

3. **Anti-Churning Rules** — Added 3-day hold period and max 4 sells/week to prevent portfolio erosion from over-trading. This protects your capital.

4. **Buying Power Validation** — Auto-trader now checks buying power BEFORE executing trades, preventing failed orders

**📊 New Research System (Feb 5-6)**

5. **Overnight Research Engine** — Runs 8 PM to 4 AM researching ALL 700+ tickers every night with detailed evaluations explaining WHY each might do well or poorly

6. **Prediction Scores** — Each ticker now gets a 0-10 prediction score with 4-8 sentence analysis stored for review

7. **Macro Knowledge** — Tracks consumer health, employment, Fed policy, housing, manufacturing, tech spending, energy to inform trading decisions

**🎯 Core Goals Integration (Feb 6)**

8. **Parsed Your 3 Goals:**
   - 💰 Wealth: $1,203 → $1M+ by 2027
   - 📦 Income: $0 → $15K/month passive
   - 🚀 Career: Space robotics industry

9. **Created World Views** — Research documents for each goal that get updated nightly with relevant findings

10. **Goal-Aligned Scoring** — Backlog items now scored 60% by goal alignment, 40% by beliefs

**💼 Trading Activity**

- Feb 4: Bought 170 COUR @ $5.86 (EXTREME BUY signal)
- Feb 5: Rotated to 7 PLTR + 28 CLSK
- Feb 6: Positions closed, equity at $1,203

The overnight research runs tonight at 8 PM and will research all tickers. Morning brief will include goal progress.`;

async function main() {
  const r = getRealtimeMessaging();
  const uid = loadFirebaseUser()?.localId;
  if (!uid) { console.error("No Firebase user found."); process.exit(1); }
  await r.initialize(uid);

  console.log("Sending response...");

  // Send the response
  const result = await r.sendMessage(RESPONSE, {
    type: MESSAGE_TYPE.AI,
    replyTo: MESSAGE_ID
  });

  console.log("Send result:", result);

  // Mark original as completed
  await r.updateMessageStatus(MESSAGE_ID, MESSAGE_STATUS.COMPLETED);
  console.log("Marked original message as completed");

  // Add to processed list
  r.processedMessageIds.add(MESSAGE_ID);
  r.saveState();

  console.log("Done!");
}

main().catch(console.error);
