/**
 * Quota Exceeded Alert Component
 *
 * Displays a prominent red alert when AI API quota is exceeded.
 * Allows user to press Enter to open the billing page.
 */

import React, { memo, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { openUrl } from "../services/open-url.js";
import { BILLING_URLS } from "../services/api-quota-monitor.js";

const e = React.createElement;

/**
 * Quota Exceeded Alert
 *
 * Shows:
 * ┌──────────────────────────────────────────────────────────┐
 * │  ⚠️  GPT-5.2 Tokens Exceeded                              │
 * │                                                          │
 * │  Your OpenAI API quota has been exceeded.                │
 * │  Add credits to continue using AI features.              │
 * │                                                          │
 * │  Press [Enter] to open billing page                      │
 * │  Press [Esc] to dismiss                                  │
 * └──────────────────────────────────────────────────────────┘
 */
const QuotaExceededAlertBase = ({
  provider = "openai",
  onDismiss,
  isActive = true
}) => {
  const isOpenAI = provider === "openai";
  const modelName = isOpenAI ? "GPT-5.2" : "Claude";
  const billingUrl = BILLING_URLS[provider];

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (!isActive) return;

      if (key.return) {
        // Open billing page
        openUrl(billingUrl);
      } else if (key.escape) {
        // Dismiss alert
        onDismiss?.();
      }
    },
    { isActive }
  );

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#dc2626",
      backgroundColor: "#7f1d1d",
      paddingX: 2,
      paddingY: 1,
      marginY: 1
    },
    // Header with warning
    e(
      Box,
      { marginBottom: 1 },
      e(
        Text,
        { color: "#fca5a5", bold: true, backgroundColor: "#7f1d1d" },
        `  ⚠  ${modelName} Tokens Exceeded`
      )
    ),
    // Message
    e(
      Text,
      { color: "#fca5a5" },
      `Your ${isOpenAI ? "OpenAI" : "Anthropic"} API quota has been exceeded.`
    ),
    e(
      Text,
      { color: "#fca5a5" },
      "Add credits to continue using AI features."
    ),
    // Spacer
    e(Box, { height: 1 }),
    // Instructions
    e(
      Box,
      { flexDirection: "row", gap: 2 },
      e(
        Text,
        { color: "#f87171", bold: true },
        "Press [Enter] to open billing page"
      )
    ),
    e(
      Text,
      { color: "#f87171", dimColor: true },
      "Press [Esc] to dismiss"
    ),
    // URL preview
    e(
      Box,
      { marginTop: 1 },
      e(Text, { color: "#94a3b8", dimColor: true }, billingUrl)
    )
  );
};

export const QuotaExceededAlert = memo(QuotaExceededAlertBase);

/**
 * Compact quota warning for header/status bar
 */
const QuotaWarningBadgeBase = ({ provider = "openai", onClick }) => {
  const modelName = provider === "openai" ? "GPT-5.2" : "Claude";

  return e(
    Box,
    {
      backgroundColor: "#dc2626",
      paddingX: 1
    },
    e(
      Text,
      { color: "#ffffff", bold: true },
      `⚠ ${modelName} Tokens Exceeded`
    )
  );
};

export const QuotaWarningBadge = memo(QuotaWarningBadgeBase);

/**
 * Low balance warning component
 */
const LowBalanceWarningBase = ({ provider, balance, threshold }) => {
  const urgencyColors = {
    critical: { bg: "#7f1d1d", text: "#fca5a5" },  // < $0.20
    warning: { bg: "#78350f", text: "#fcd34d" },   // < $1.00
    notice: { bg: "#1e3a5f", text: "#93c5fd" }     // < $2.00
  };

  const urgency = balance <= 0.20 ? "critical" : balance <= 1.00 ? "warning" : "notice";
  const colors = urgencyColors[urgency];
  const modelName = provider === "openai" ? "GPT-5.2" : "Claude";

  return e(
    Box,
    {
      backgroundColor: colors.bg,
      paddingX: 1,
      marginY: 1
    },
    e(
      Text,
      { color: colors.text },
      `${urgency === "critical" ? "⚠️" : "💰"} ${modelName} Balance: $${balance.toFixed(2)} remaining`
    )
  );
};

export const LowBalanceWarning = memo(LowBalanceWarningBase);

export default QuotaExceededAlert;
