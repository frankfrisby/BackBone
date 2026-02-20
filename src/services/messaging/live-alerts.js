/**
 * Live Alerts — Proactive real-time notifications during engine work.
 *
 * When the engine or a background service spots something urgent/novel,
 * it fires a live alert. The alert plays out as a natural multi-message
 * WhatsApp conversation — like a friend texting you updates as they dig in.
 *
 * Flow:
 *   1. Alert fires: "Bro, markets are tanking right now"
 *   2. Typing indicator while researching
 *   3. Follow-up: "Yeah, looks like tariffs hit semis. Your SOXS position is up 8% tho"
 *   4. Optional action: "Want me to take profits on that?"
 */

import { sendWhatsApp, askUser } from "./proactive-outreach.js";
import { getWhatsAppNotifications } from "./whatsapp-notifications.js";

// Cooldowns — don't spam the same alert type
const alertCooldowns = new Map(); // type → lastFiredAt
const COOLDOWN_MS = 30 * 60 * 1000; // 30 min between same alert type

/**
 * Fire a live alert — sends a multi-step conversational notification.
 *
 * @param {Object} opts
 * @param {string} opts.type - Alert type for dedup (e.g., "market-drop", "goal-insight", "health-warning")
 * @param {string} opts.hook - Opening message — short, urgent, casual. Gets the user's attention.
 * @param {Function} [opts.research] - Async function that digs deeper. Returns { finding: string, action?: { prompt: string, handler: Function } }
 * @param {boolean} [opts.urgent] - Bypass quiet hours
 */
export async function fireLiveAlert(opts) {
  const { type, hook, research, urgent = false } = opts;

  // Cooldown check
  const lastFired = alertCooldowns.get(type) || 0;
  if (Date.now() - lastFired < COOLDOWN_MS) {
    console.log(`[LiveAlert] Cooldown active for "${type}", skipping`);
    return { success: false, reason: "cooldown" };
  }
  alertCooldowns.set(type, Date.now());

  // Step 1: Send the hook — grab attention
  const hookResult = await sendWhatsApp(hook, {
    type: "alert",
    urgent,
    skipDedup: true,
    identifier: `live_${type}_${Date.now()}`,
  });

  if (!hookResult?.success) {
    return { success: false, reason: "hook send failed" };
  }

  // Step 2: If there's a research function, show typing then send findings
  if (typeof research === "function") {
    // Send typing indicator
    try {
      const notif = getWhatsAppNotifications();
      if (notif.enabled) {
        // Brief pause before "researching"
        await sleep(2000);
      }
    } catch {}

    try {
      const result = await research();

      if (result?.finding) {
        await sleep(1500); // Natural pause
        await sendWhatsApp(result.finding, {
          type: "alert",
          skipDedup: true,
          skipRateLimit: true,
          identifier: `live_${type}_finding_${Date.now()}`,
        });
      }

      // Step 3: If there's an action to offer
      if (result?.action?.prompt) {
        await sleep(2000);
        await askUser(result.action.prompt, {
          context: `live-alert-${type}`,
          skipRateLimit: true,
        });
      }
    } catch (err) {
      console.error(`[LiveAlert] Research failed for "${type}":`, err.message);
      await sendWhatsApp("Hmm, couldn't dig deeper on that. I'll keep an eye on it.", {
        type: "alert",
        skipDedup: true,
        skipRateLimit: true,
      });
    }
  }

  return { success: true };
}

/**
 * Check market conditions and fire alerts if something's off.
 * Called periodically by the engine or trading service.
 */
export async function checkMarketAlerts(portfolioData) {
  if (!portfolioData) return;

  const { positions, dayPLPercent, totalEquity } = portfolioData;

  // Portfolio down more than 3% today
  if (dayPLPercent && dayPLPercent < -3) {
    await fireLiveAlert({
      type: "portfolio-drop",
      hook: `Bro, your portfolio is down ${Math.abs(dayPLPercent).toFixed(1)}% today 📉`,
      urgent: true,
      research: async () => {
        // Find biggest losers
        const losers = (positions || [])
          .filter(p => parseFloat(p.unrealized_intraday_plpc || 0) < -0.03)
          .sort((a, b) => parseFloat(a.unrealized_intraday_plpc) - parseFloat(b.unrealized_intraday_plpc))
          .slice(0, 3);

        const loserText = losers.map(p =>
          `• *${p.symbol}*: ${(parseFloat(p.unrealized_intraday_plpc) * 100).toFixed(1)}%`
        ).join("\n");

        return {
          finding: `Biggest hits today:\n${loserText || "Spread across the board"}\n\nLet me look into what's driving this...`,
        };
      },
    });
  }

  // Individual position up more than 8% — take profits?
  if (positions) {
    for (const pos of positions) {
      const plPct = parseFloat(pos.unrealized_intraday_plpc || 0) * 100;
      if (plPct > 8) {
        await fireLiveAlert({
          type: `big-gainer-${pos.symbol}`,
          hook: `Yo, *${pos.symbol}* is ripping — up ${plPct.toFixed(1)}% today 🚀`,
          research: async () => ({
            finding: `You're sitting on $${parseFloat(pos.unrealized_intraday_pl || 0).toFixed(0)} unrealized gain on this one. Might be worth locking some in.`,
            action: {
              prompt: `Want me to sell some ${pos.symbol} to lock in profits?`,
            },
          }),
        });
        break; // One gainer alert at a time
      }
    }
  }
}

/**
 * Check for novel/urgent insights during engine goal execution.
 * Called after each goal execution cycle with the output.
 */
export async function checkEngineInsights(goalTitle, executionOutput) {
  if (!executionOutput || executionOutput.length < 50) return;

  const outputLower = executionOutput.toLowerCase();

  // Detect urgent findings in engine output
  const urgentPatterns = [
    { pattern: /breaking|urgent|immediately|critical|crash|plummet|surge|skyrocket/i, type: "breaking-news" },
    { pattern: /recall|warning|alert|emergency|breach|hack/i, type: "safety-alert" },
    { pattern: /opportunity|limited.time|expir|deadline|last.chance/i, type: "opportunity" },
  ];

  for (const { pattern, type } of urgentPatterns) {
    if (pattern.test(outputLower)) {
      // Extract the relevant sentence
      const sentences = executionOutput.split(/[.!?\n]+/).filter(s => s.trim().length > 20);
      const relevantSentence = sentences.find(s => pattern.test(s));

      if (relevantSentence) {
        await fireLiveAlert({
          type: `engine-insight-${type}`,
          hook: `Hey — was working on _${goalTitle}_ and found something you should know`,
          research: async () => ({
            finding: relevantSentence.trim().slice(0, 500),
          }),
        });
        break; // One insight alert per cycle
      }
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export { alertCooldowns };
