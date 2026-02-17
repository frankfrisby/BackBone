/**
 * WhatsApp Action Flow
 *
 * Handles actionable one-off requests with step-by-step progress updates.
 */

import { getChatActionsManager } from "../chat-actions.js";
import { getUnifiedMessageLog, MESSAGE_CHANNEL } from "./unified-message-log.js";

const toText = (value) => String(value || "").trim();

const safeSendProgress = async (sendProgress, text) => {
  if (typeof sendProgress !== "function") return;
  const msg = toText(text);
  if (!msg) return;
  try {
    await sendProgress(msg);
  } catch {}
};

export async function processWhatsAppActionRequest({
  message,
  from,
  sendProgress,
  alreadyLoggedUserMessage = false
} = {}) {
  const text = toText(message);
  if (!text) return { handled: false };

  const chatActions = getChatActionsManager();
  const messageLog = getUnifiedMessageLog();

  let activeActionId = null;

  const onStarted = async (pending) => {
    const actionId = pending?.id;
    if (!actionId) return;
    activeActionId = actionId;
    const summary = pending?.action?.analysis?.summary || "Working request";
    await safeSendProgress(sendProgress, `[action started] ${summary}`);
  };

  const onProgress = async (payload) => {
    if (!payload) return;
    if (activeActionId && payload.actionId && payload.actionId !== activeActionId) return;
    const stepNumber = payload.step || payload.progress || "?";
    const messageText = payload.message || "Working...";
    await safeSendProgress(sendProgress, `[step ${stepNumber}] ${messageText}`);
  };

  const onCompleted = async (pending) => {
    const actionId = pending?.id;
    if (activeActionId && actionId && actionId !== activeActionId) return;
    await safeSendProgress(sendProgress, "[action complete] Execution finished.");
  };

  const onFailed = async ({ error } = {}) => {
    await safeSendProgress(sendProgress, `[action failed] ${error?.message || "Execution failed."}`);
  };

  chatActions.on("action-started", onStarted);
  chatActions.on("action-progress", onProgress);
  chatActions.on("action-completed", onCompleted);
  chatActions.on("action-failed", onFailed);

  try {
    // Existing confirmation flow support
    if (chatActions.isConfirmationResponse(text)) {
      const confirmationResult = await chatActions.processConfirmationResponse(text);
      if (confirmationResult?.handled) {
        if (from && !alreadyLoggedUserMessage) {
          messageLog.addUserMessage(text, MESSAGE_CHANNEL.WHATSAPP, { from, source: "whatsapp-action-confirmation" });
        }
        messageLog.addAssistantMessage(confirmationResult.response, MESSAGE_CHANNEL.WHATSAPP, {
          source: "whatsapp-action-confirmation"
        });
        return {
          handled: true,
          confirmation: true,
          response: confirmationResult.response,
          result: confirmationResult
        };
      }
    }

    const actionResult = await chatActions.processUserMessage(text);
    if (!actionResult?.isActionable) {
      return { handled: false };
    }

    if (from && !alreadyLoggedUserMessage) {
      messageLog.addUserMessage(text, MESSAGE_CHANNEL.WHATSAPP, { from, source: "whatsapp-action" });
    }

    const response = actionResult.response || "Action processed.";
    messageLog.addAssistantMessage(response, MESSAGE_CHANNEL.WHATSAPP, { source: "whatsapp-action" });

    return {
      handled: true,
      response,
      result: actionResult
    };
  } finally {
    chatActions.off("action-started", onStarted);
    chatActions.off("action-progress", onProgress);
    chatActions.off("action-completed", onCompleted);
    chatActions.off("action-failed", onFailed);
  }
}

export default {
  processWhatsAppActionRequest
};
