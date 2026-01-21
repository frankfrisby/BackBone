import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

const e = React.createElement;

const formatTimestamp = (date) => {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });
};

const MessageBubble = ({ message, isUser, timestamp }) => {
  const bubbleColor = isUser ? "#1e40af" : "#4a5568";
  const textColor = isUser ? "#93c5fd" : "#e2e8f0";
  const label = isUser ? "You" : "BackBone";
  const labelColor = isUser ? "#60a5fa" : "#22c55e";

  return e(
    Box,
    { flexDirection: "column", marginBottom: 1, width: "100%" },
    e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: labelColor, bold: true }, label),
      e(Text, { color: "#718096", dimColor: true }, formatTimestamp(timestamp))
    ),
    e(
      Box,
      {
        paddingX: 1,
        paddingY: 0,
        borderStyle: "round",
        borderColor: bubbleColor,
        width: "100%"
      },
      e(Text, { color: textColor, wrap: "wrap" }, message)
    )
  );
};

const LoadingIndicator = () => {
  return e(
    Box,
    { flexDirection: "row", gap: 1, marginBottom: 1 },
    e(Text, { color: "#22c55e" }, e(Spinner, { type: "dots" })),
    e(Text, { color: "#718096" }, "Thinking...")
  );
};

const ConversationPanelBase = ({ messages, isLoading, streamingText }) => {
  const hasMessages = messages.length > 0 || isLoading || streamingText;

  if (!hasMessages) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#4a5568",
        padding: 1,
        overflow: "hidden",
        width: "100%",
        height: 8
      },
      e(Text, { color: "#718096" }, "Conversation"),
      e(
        Box,
        { flexDirection: "column", alignItems: "center", justifyContent: "center" },
        e(Text, { color: "#4a5568" }, "No messages yet"),
        e(Text, { color: "#718096", dimColor: true }, "Type a message or use /ask")
      )
    );
  }

  // Show only last 3 messages to keep panel compact
  const visibleMessages = messages.slice(-3);

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#4a5568",
      padding: 1,
      overflow: "hidden",
      width: "100%",
      height: 10
    },
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1, width: "100%" },
      e(Text, { color: "#718096" }, "Conversation"),
      e(Text, { color: "#718096", dimColor: true }, `${messages.length} messages`)
    ),
    e(
      Box,
      { flexDirection: "column", overflow: "hidden", width: "100%" },
      ...visibleMessages.map((msg, i) =>
        e(MessageBubble, {
          key: `${msg.timestamp.getTime()}-${i}`,
          message: msg.content,
          isUser: msg.role === "user",
          timestamp: msg.timestamp
        })
      ),
      streamingText && e(
        Box,
        { flexDirection: "column", marginBottom: 1, width: "100%" },
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: "#22c55e", bold: true }, "BackBone"),
          e(Text, { color: "#22c55e" }, e(Spinner, { type: "dots" }))
        ),
        e(
          Box,
          { paddingX: 1, borderStyle: "round", borderColor: "#4a5568", width: "100%" },
          e(Text, { color: "#e2e8f0", wrap: "wrap" }, streamingText)
        )
      ),
      isLoading && !streamingText && e(LoadingIndicator, null)
    )
  );
};

export const ConversationPanel = React.memo(ConversationPanelBase);
