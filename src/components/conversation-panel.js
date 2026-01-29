import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

const formatTimestamp = (date) => {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });
};

/**
 * User Message - has background highlight
 */
const UserMessage = ({ message, timestamp }) => {
  return e(
    Box,
    { flexDirection: "column", marginBottom: 1, width: "100%" },
    e(
      Box,
      { flexDirection: "row", gap: 1, marginBottom: 0 },
      e(Text, { color: "#60a5fa", bold: true }, "You"),
      e(Text, { color: "#475569", dimColor: true }, formatTimestamp(timestamp))
    ),
    e(
      Box,
      {
        paddingX: 1,
        paddingY: 0,
        backgroundColor: "#1e293b",
        width: "100%"
      },
      e(Text, { color: "#e2e8f0", wrap: "wrap" }, message)
    )
  );
};

/**
 * AI Message - white dot indicator, no background
 */
const AIMessage = ({ message, timestamp, modelInfo, tool }) => {
  // Determine the model display name - show specific model versions
  const getModelName = () => {
    // Claude Code CLI uses Opus 4.5
    if (tool === "claude-code") return "Claude Code CLI";

    // Check for display name first (most accurate)
    if (modelInfo?.displayName) return modelInfo.displayName;

    const name = (modelInfo?.name || modelInfo?.model || "").toLowerCase();

    // OpenAI GPT models
    if (name.includes("gpt-5.2-pro")) return "GPT-5.2-Pro";
    if (name.includes("gpt-5.2")) return "GPT-5.2";
    if (name.includes("gpt-5")) return "GPT-5";
    if (name.includes("gpt-4o")) return "GPT-4o";
    if (name.includes("gpt-4-turbo")) return "GPT-4 Turbo";
    if (name.includes("gpt-4")) return "GPT-4";
    if (name.includes("o1-pro")) return "o1-Pro";
    if (name.includes("o1")) return "o1";

    // Anthropic Claude models
    if (name.includes("opus-4.5") || name.includes("opus-4-5")) return "Opus 4.5";
    if (name.includes("opus-4")) return "Opus 4";
    if (name.includes("opus")) return "Opus";
    if (name.includes("sonnet-4")) return "Sonnet 4";
    if (name.includes("sonnet-3.5") || name.includes("sonnet-3-5")) return "Sonnet 3.5";
    if (name.includes("sonnet")) return "Sonnet";
    if (name.includes("haiku")) return "Haiku";
    if (name.includes("claude-3")) return "Claude 3";
    if (name.includes("claude")) return "Claude";

    // Fallback
    if (modelInfo?.shortName) return modelInfo.shortName;
    return "AI";
  };

  return e(
    Box,
    { flexDirection: "column", marginBottom: 1, width: "100%" },
    e(
      Box,
      { flexDirection: "row", gap: 1, marginBottom: 0 },
      e(Text, { color: "#ffffff" }, "●"),
      e(Text, { color: "#22c55e", bold: true }, getModelName()),
      e(Text, { color: "#475569", dimColor: true }, formatTimestamp(timestamp))
    ),
    e(
      Box,
      { paddingLeft: 2, width: "100%" },
      e(Text, { color: "#94a3b8", wrap: "wrap" }, message)
    )
  );
};

/**
 * Streaming AI response indicator
 */
const StreamingMessage = ({ text, title, modelInfo }) => {
  // Determine model name from title or modelInfo
  const getModelName = () => {
    if (title && title !== "Claude Code") return title;
    if (modelInfo?.displayName) return modelInfo.displayName;
    const name = (modelInfo?.name || modelInfo?.model || "").toLowerCase();
    if (name.includes("opus")) return "Opus 4.5";
    if (name.includes("sonnet")) return "Sonnet";
    if (name.includes("gpt-5")) return "GPT-5.2";
    if (name.includes("gpt-4")) return "GPT-4";
    return "Claude"; // Default for API streaming
  };
  const modelName = getModelName();
  return e(
    Box,
    { flexDirection: "column", marginBottom: 1, width: "100%" },
    e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#f59e0b" }, "◐"),
      e(Text, { color: "#22c55e", bold: true }, modelName),
      e(Text, { color: "#f59e0b" }, text ? "streaming..." : "thinking...")
    ),
    text && e(
      Box,
      { paddingLeft: 2, width: "100%" },
      e(Text, { color: "#94a3b8", wrap: "wrap" }, text.slice(-300))
    )
  );
};

/**
 * Action streaming (for agentic tasks - Claude Code)
 */
const ActionStreamingMessage = ({ text, title }) => {
  // Claude Code uses Opus 4.5
  const modelName = title || "Claude Code CLI";
  return e(
    Box,
    { flexDirection: "column", marginBottom: 1, width: "100%" },
    e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#f59e0b" }, "◉"),
      e(Text, { color: "#22c55e", bold: true }, modelName),
      e(Text, { color: "#f59e0b" }, text ? "streaming..." : "thinking...")
    ),
    text && e(
      Box,
      { paddingLeft: 2, width: "100%", borderLeft: true, borderColor: "#f59e0b", borderStyle: "single", borderTop: false, borderBottom: false, borderRight: false },
      e(Text, { color: "#cbd5e1", wrap: "wrap" }, text.slice(-300))
    )
  );
};

const LoadingIndicator = () => {
  return e(
    Box,
    { flexDirection: "row", gap: 1, marginBottom: 1 },
    e(Text, { color: "#f59e0b" }, "◐"),
    e(Text, { color: "#64748b" }, "Processing...")
  );
};

/**
 * WhatsApp Poll Countdown - shows time until next message check
 */
const PollCountdown = ({ countdown, pollingMode }) => {
  if (!countdown) return null;

  const isActive = pollingMode === "active";
  const color = isActive ? "#22c55e" : "#64748b";
  const label = isActive ? "WhatsApp" : "Next poll";

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    e(Text, { color: "#25D366" }, "📱"),
    e(Text, { color: "#475569", dimColor: true }, label),
    e(Text, { color, bold: isActive }, countdown)
  );
};

/**
 * WhatsApp Message indicator
 */
const WhatsAppMessage = ({ message, timestamp, isUser, modelName }) => {
  // For AI responses via WhatsApp, show the model name
  const displayName = isUser ? "You" : (modelName || "Opus 4.5");
  return e(
    Box,
    { flexDirection: "column", marginBottom: 1, width: "100%" },
    e(
      Box,
      { flexDirection: "row", gap: 1, marginBottom: 0 },
      e(Text, { color: "#25D366" }, "📱"),
      e(Text, { color: isUser ? "#60a5fa" : "#22c55e", bold: true }, displayName),
      e(Text, { color: "#25D366", dimColor: true }, "(WhatsApp)"),
      e(Text, { color: "#475569", dimColor: true }, formatTimestamp(timestamp))
    ),
    e(
      Box,
      {
        paddingX: 1,
        paddingY: 0,
        backgroundColor: isUser ? "#1e293b" : undefined,
        paddingLeft: isUser ? 1 : 2,
        width: "100%"
      },
      e(Text, { color: isUser ? "#e2e8f0" : "#94a3b8", wrap: "wrap" }, message)
    )
  );
};

const ConversationPanelBase = ({ messages, isLoading, streamingText, actionStreamingText, actionStreamingTitle, whatsappPollCountdown, whatsappPollingMode, scrollOffset = 0 }) => {
  const hasMessages = messages.length > 0 || isLoading || streamingText || actionStreamingText;

  if (!hasMessages) {
    return e(
      Box,
      {
        flexDirection: "column",
        paddingX: 1,
        paddingY: 1,
        overflow: "hidden",
        width: "100%",
        height: 12
      },
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
        e(Text, { color: "#64748b" }, "Conversation"),
        e(
          Box,
          { flexDirection: "row", gap: 2 },
          whatsappPollCountdown && e(PollCountdown, { countdown: whatsappPollCountdown, pollingMode: whatsappPollingMode }),
          e(Text, { color: "#475569", dimColor: true }, "Ready")
        )
      ),
      e(
        Box,
        { flexDirection: "column", paddingLeft: 1 },
        e(Text, { color: "#475569" }, "Ask anything to get started"),
        e(Text, { color: "#334155", dimColor: true }, 'Try: "What should I focus on today?"')
      )
    );
  }

  // Show messages with scroll support
  // scrollOffset=0 means latest messages, higher values scroll back in history
  const isStreaming = streamingText || actionStreamingText;
  const maxVisible = isStreaming ? 1 : 3;
  const endIdx = messages.length - scrollOffset;
  const startIdx = Math.max(0, endIdx - maxVisible);
  const visibleMessages = messages.slice(startIdx, Math.max(startIdx + maxVisible, endIdx));

  return e(
    Box,
    {
      flexDirection: "column",
      paddingX: 1,
      paddingY: 1,
      overflow: "hidden",
      width: "100%",
      height: 12
    },
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1, width: "100%" },
      e(Text, { color: "#64748b" }, "Conversation"),
      e(
        Box,
        { flexDirection: "row", gap: 2 },
        whatsappPollCountdown && e(PollCountdown, { countdown: whatsappPollCountdown, pollingMode: whatsappPollingMode }),
        scrollOffset > 0 && e(Text, { color: "#f59e0b" }, `↑${scrollOffset} `),
        e(Text, { color: "#475569", dimColor: true }, `${messages.length} messages`)
      )
    ),
    e(
      Box,
      { flexDirection: "column", overflow: "hidden", width: "100%" },
      ...visibleMessages.map((msg, i) => {
        const isWhatsApp = msg.channel === "whatsapp";
        const isUser = msg.role === "user";

        if (isWhatsApp) {
          return e(WhatsAppMessage, {
            key: `${msg.timestamp.getTime()}-${i}`,
            message: msg.content,
            timestamp: msg.timestamp,
            isUser
          });
        }

        return isUser
          ? e(UserMessage, {
              key: `${msg.timestamp.getTime()}-${i}`,
              message: msg.content,
              timestamp: msg.timestamp
            })
          : e(AIMessage, {
              key: `${msg.timestamp.getTime()}-${i}`,
              message: msg.content,
              timestamp: msg.timestamp,
              modelInfo: msg.modelInfo,
              tool: msg.tool
            });
      }),
      streamingText && e(StreamingMessage, { text: streamingText }),
      actionStreamingText && e(ActionStreamingMessage, { text: actionStreamingText, title: actionStreamingTitle }),
      isLoading && !streamingText && e(LoadingIndicator, null)
    )
  );
};

// Custom comparison to prevent unnecessary re-renders
const arePropsEqual = (prevProps, nextProps) => {
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.streamingText !== nextProps.streamingText) return false;
  if (prevProps.actionStreamingText !== nextProps.actionStreamingText) return false;
  if (prevProps.actionStreamingTitle !== nextProps.actionStreamingTitle) return false;
  if (prevProps.whatsappPollCountdown !== nextProps.whatsappPollCountdown) return false;
  if (prevProps.whatsappPollingMode !== nextProps.whatsappPollingMode) return false;
  if (prevProps.scrollOffset !== nextProps.scrollOffset) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  const prevLast = prevProps.messages[prevProps.messages.length - 1];
  const nextLast = nextProps.messages[nextProps.messages.length - 1];
  if (prevLast?.content !== nextLast?.content) return false;
  return true;
};

export const ConversationPanel = React.memo(ConversationPanelBase, arePropsEqual);
