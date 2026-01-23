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
const AIMessage = ({ message, timestamp, modelInfo }) => {
  return e(
    Box,
    { flexDirection: "column", marginBottom: 1, width: "100%" },
    e(
      Box,
      { flexDirection: "row", gap: 1, marginBottom: 0 },
      e(Text, { color: "#ffffff" }, "●"),
      e(Text, { color: "#22c55e", bold: true }, "Backbone"),
      modelInfo && e(Text, { color: "#475569", dimColor: true }, `(${modelInfo.shortName || modelInfo.name || "AI"})`),
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
const StreamingMessage = ({ text, title }) => {
  return e(
    Box,
    { flexDirection: "column", marginBottom: 1, width: "100%" },
    e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#f59e0b" }, "◐"),
      e(Text, { color: "#22c55e", bold: true }, title || "Backbone"),
      e(Text, { color: "#f59e0b" }, "thinking...")
    ),
    e(
      Box,
      { paddingLeft: 2, width: "100%" },
      e(Text, { color: "#94a3b8", wrap: "wrap" }, text || "...")
    )
  );
};

/**
 * Action streaming (for agentic tasks)
 */
const ActionStreamingMessage = ({ text, title }) => {
  return e(
    Box,
    { flexDirection: "column", marginBottom: 1, width: "100%" },
    e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#8b5cf6" }, "◉"),
      e(Text, { color: "#8b5cf6", bold: true }, title || "Running task"),
      e(Text, { color: "#64748b" }, "...")
    ),
    e(
      Box,
      { paddingLeft: 2, width: "100%", borderLeft: true, borderColor: "#8b5cf6", borderStyle: "single", borderTop: false, borderBottom: false, borderRight: false },
      e(Text, { color: "#cbd5e1", wrap: "wrap" }, text || "Executing...")
    )
  );
};

const LoadingIndicator = () => {
  return e(
    Box,
    { flexDirection: "row", gap: 1, marginBottom: 1 },
    e(Text, { color: "#f59e0b" }, "◐"),
    e(Text, { color: "#64748b" }, "Thinking...")
  );
};

const ConversationPanelBase = ({ messages, isLoading, streamingText, actionStreamingText, actionStreamingTitle }) => {
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
        height: 8
      },
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
        e(Text, { color: "#64748b" }, "Conversation"),
        e(Text, { color: "#475569", dimColor: true }, "Ready")
      ),
      e(
        Box,
        { flexDirection: "column", paddingLeft: 1 },
        e(Text, { color: "#475569" }, "Ask anything to get started"),
        e(Text, { color: "#334155", dimColor: true }, 'Try: "What should I focus on today?"')
      )
    );
  }

  // Show only last 4 messages to keep panel compact
  const visibleMessages = messages.slice(-4);

  return e(
    Box,
    {
      flexDirection: "column",
      paddingX: 1,
      paddingY: 1,
      overflow: "hidden",
      width: "100%"
    },
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1, width: "100%" },
      e(Text, { color: "#64748b" }, "Conversation"),
      e(Text, { color: "#475569", dimColor: true }, `${messages.length} messages`)
    ),
    e(
      Box,
      { flexDirection: "column", overflow: "hidden", width: "100%" },
      ...visibleMessages.map((msg, i) =>
        msg.role === "user"
          ? e(UserMessage, {
              key: `${msg.timestamp.getTime()}-${i}`,
              message: msg.content,
              timestamp: msg.timestamp
            })
          : e(AIMessage, {
              key: `${msg.timestamp.getTime()}-${i}`,
              message: msg.content,
              timestamp: msg.timestamp,
              modelInfo: msg.modelInfo
            })
      ),
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
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  const prevLast = prevProps.messages[prevProps.messages.length - 1];
  const nextLast = nextProps.messages[nextProps.messages.length - 1];
  if (prevLast?.content !== nextLast?.content) return false;
  return true;
};

export const ConversationPanel = React.memo(ConversationPanelBase, arePropsEqual);
