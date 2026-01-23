import React from "react";
import { Box, Text } from "ink";
import { STATE_COLORS, STATE_ICONS, CHANGE_COLORS, CHANGE_ICONS } from "../data/life-engine.js";

const e = React.createElement;

/**
 * Life Feed Component - displays activity events
 * Doubled display from 5 to 10 items
 */
export const LifeFeed = ({ items, lastUpdated, maxItems = 10, isThinking = true }) => {
  const headerText = isThinking ? "Life Engine / Thinking" : "Life Engine";

  // Don't show if no items
  if (!items || items.length === 0) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#0f172a",
        padding: 1
      },
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
        e(Text, { color: "#64748b" }, headerText),
        e(Text, { color: "#475569", dimColor: true }, "No activity")
      )
    );
  }

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#0f172a",
      padding: 1
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#64748b" }, headerText),
      e(Text, { color: "#475569", dimColor: true }, lastUpdated)
    ),
    // Activity items - doubled display
    e(
      Box,
      { flexDirection: "column" },
      ...items.slice(0, maxItems).map((item, index) => {
        const icon = STATE_ICONS[item.state] || "\u25CB";
        const color = STATE_COLORS[item.state] || "#64748b";

        return e(
          Box,
          {
            key: item.id || `${item.state}-${item.at}-${index}`,
            flexDirection: "row",
            gap: 1
          },
          e(Text, { color }, icon),
          e(Text, { color: "#475569", dimColor: true }, item.at),
          e(
            Text,
            { color: "#94a3b8", wrap: "truncate" },
            item.text.slice(0, 28)
          )
        );
      })
    )
  );
};

/**
 * Life Changes Component - displays significant life events
 */
export const LifeChanges = ({ changes, maxItems = 10 }) => {
  if (!changes || changes.length === 0) {
    return null;
  }

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#0f172a",
      padding: 1,
      marginTop: 1
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#64748b" }, "Life Changes"),
      e(Text, { color: "#475569", dimColor: true }, `${changes.length} events`)
    ),
    // Change items
    e(
      Box,
      { flexDirection: "column" },
      ...changes.slice(0, maxItems).map((change, index) => {
        const icon = CHANGE_ICONS[change.category] || "\u25CB";
        const color = CHANGE_COLORS[change.category] || "#64748b";

        return e(
          Box,
          {
            key: change.id || `${change.category}-${index}`,
            flexDirection: "row",
            gap: 1
          },
          e(Text, null, icon),
          e(Text, { color: "#475569", dimColor: true }, change.at),
          e(
            Text,
            { color: "#94a3b8", wrap: "truncate" },
            change.text.slice(0, 26)
          )
        );
      })
    )
  );
};
