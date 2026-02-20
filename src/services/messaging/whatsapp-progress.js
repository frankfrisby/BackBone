/**
 * WhatsApp Progress Reporter
 *
 * Sends real-time progress updates to the user while the AI works on their request.
 * Two modes:
 *   1. Generic heartbeat — "_thinking..._", "_still working on it..._"
 *   2. Task-aware updates — analyzes the user's message and sends contextual progress
 *
 * Used by both the webhook handler and the poller to keep the user informed.
 */

import { getTwilioWhatsApp } from "./twilio-whatsapp.js";

/**
 * Classify what kind of task this is so we can send relevant progress messages
 */
function classifyTask(message) {
  const m = message.toLowerCase();

  if (/video|clip|reel|edit|footage|animation/.test(m)) {
    return {
      type: "video",
      ack: "on it — planning your video now",
      steps: [
        "_brainstorming topics and structure..._",
        "_picking visuals, colors, and style..._",
        "_writing the script and finalizing..._",
      ],
    };
  }
  if (/research|analyze|deep dive|look into|investigate/.test(m)) {
    return {
      type: "research",
      ack: "got it — researching that now",
      steps: [
        "_pulling sources and data..._",
        "_cross-referencing what I found..._",
        "_writing up the findings..._",
      ],
    };
  }
  if (/presentation|slides|deck|powerpoint|pptx/.test(m)) {
    return {
      type: "presentation",
      ack: "on it — building the deck",
      steps: [
        "_outlining the slides..._",
        "_designing layout and visuals..._",
        "_polishing and formatting..._",
      ],
    };
  }
  if (/document|report|write up|writeup|pdf|word doc/.test(m)) {
    return {
      type: "document",
      ack: "got it — drafting that now",
      steps: [
        "_outlining the structure..._",
        "_writing the content..._",
        "_formatting and polishing..._",
      ],
    };
  }
  if (/build|create|make|set up|implement|code|tool|feature/.test(m)) {
    return {
      type: "build",
      ack: "on it — let me build that",
      steps: [
        "_figuring out the approach..._",
        "_building it out..._",
        "_testing and wrapping up..._",
      ],
    };
  }
  if (/portfolio|stock|trade|market|ticker|investment/.test(m)) {
    return {
      type: "finance",
      ack: null, // fast enough, no ack needed
      steps: [
        "_pulling market data..._",
        "_crunching the numbers..._",
        "_almost done..._",
      ],
    };
  }

  // Generic fallback
  return {
    type: "general",
    ack: null,
    steps: [
      "_thinking..._",
      "_still working on it..._",
      "_almost there..._",
    ],
  };
}

/**
 * Create a progress reporter for a WhatsApp message processing session.
 *
 * @param {string} to - Phone number to send updates to
 * @param {string} userMessage - The user's message (used for task classification)
 * @param {object} opts - Options
 * @param {string} opts.messageSid - Twilio message SID (for typing indicator)
 * @returns {{ start, stop, sendUpdate }} - Progress controller
 */
export function createProgressReporter(to, userMessage, opts = {}) {
  const wa = getTwilioWhatsApp();
  const task = classifyTask(userMessage);
  const { messageSid } = opts;

  let heartbeatCount = 0;
  let heartbeatInterval = null;
  let stopped = false;
  const startTime = Date.now();

  const sendRaw = async (text) => {
    if (stopped) return;
    try {
      // Prefix with 🦴 so user can distinguish AI from themselves (Baileys sends as user)
      const prefixed = text.startsWith("🦴") ? text : `🦴 ${text}`;
      await wa.sendMessage(to, prefixed);
    } catch (err) {
      console.log("[Progress] Send failed:", err.message);
    }
  };

  const startTyping = async () => {
    if (stopped) return;
    try {
      if (messageSid) {
        await wa.sendTypingIndicator(messageSid);
      }
    } catch {}
  };

  const start = async () => {
    // Send immediate typing indicator
    await startTyping();

    // If this is a complex task, send an immediate acknowledgment
    if (task.ack) {
      await new Promise((r) => setTimeout(r, 800));
      await sendRaw(`_${task.ack}_`);
      await new Promise((r) => setTimeout(r, 300));
      await startTyping();
    }

    // Start heartbeat interval
    heartbeatInterval = setInterval(async () => {
      if (stopped) return;
      const elapsed = Date.now() - startTime;

      if (heartbeatCount >= task.steps.length) {
        // All steps sent, just keep typing indicator alive
        await startTyping();
        return;
      }

      // First heartbeat at 12s (or 8s if we already sent an ack)
      const firstDelay = task.ack ? 8000 : 12000;
      // Subsequent heartbeats every 18s
      const nextDelay = firstDelay + heartbeatCount * 18000;

      if (elapsed < nextDelay) {
        await startTyping();
        return;
      }

      // Time for a progress update
      try {
        await startTyping();
        await new Promise((r) => setTimeout(r, 1000));
        await sendRaw(task.steps[heartbeatCount] || "_still on it..._");
        heartbeatCount++;
        await new Promise((r) => setTimeout(r, 300));
        await startTyping();
      } catch {}
    }, 3000);

    if (typeof heartbeatInterval?.unref === "function") heartbeatInterval.unref();
  };

  const stop = () => {
    stopped = true;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  /** Send a custom progress update (for task-specific milestones) */
  const sendUpdate = async (text) => {
    if (stopped) return;
    await sendRaw(`_${text}_`);
    await startTyping();
  };

  return { start, stop, sendUpdate, startTyping, task };
}
