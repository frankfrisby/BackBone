import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

const CommandsPanelBase = ({ commandList, activeCommand, weights, lastAction, modelPrompt }) => {
  return e(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "#1f2937", padding: 1 },
    e(Text, { color: "#94a3b8" }, "Commands"),
    e(Text, null, commandList),
    e(Text, { color: "#38bdf8" }, `Active: ${activeCommand}`),
    e(
      Text,
      { color: "#64748b" },
      `Weights: mom ${weights.momentum.toFixed(2)} vol ${weights.volume.toFixed(2)} vola ${weights.volatility.toFixed(2)} sent ${weights.sentiment.toFixed(2)}`
    ),
    e(Text, { color: "#22c55e" }, `Last: ${lastAction}`),
    e(Text, { color: "#f97316" }, modelPrompt)
  );
};

export const CommandsPanel = React.memo(CommandsPanelBase);
