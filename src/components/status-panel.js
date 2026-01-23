import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

const statusColor = (status) => {
  if (status === "Connected") return "#22c55e";
  if (status === "Pending") return "#eab308";
  if (status === "Missing") return "#f97316";
  if (status === "Offline") return "#ef4444";
  return "#64748b";
};

const statusIcon = (status) => {
  if (status === "Connected") return "●";
  if (status === "Pending") return "◐";
  if (status === "Missing") return "○";
  if (status === "Offline") return "×";
  return "○";
};

export const StatusPanel = ({ notifications, integrations }) => {
  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#0f172a",
      padding: 1,
      marginY: 1
    },
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#64748b" }, "Status"),
      e(Text, { color: "#475569", dimColor: true }, "Integrations")
    ),
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(
        Box,
        { flexDirection: "column", width: "60%" },
        ...notifications.slice(0, 3).map((note, index) =>
          e(
            Text,
            { key: `${note}-${index}`, color: "#94a3b8", wrap: "truncate" },
            `${index === 0 ? "→" : " "} ${note}`
          )
        )
      ),
      e(
        Box,
        { flexDirection: "column", width: "40%", alignItems: "flex-end" },
        ...Object.entries(integrations).map(([name, status]) =>
          e(
            Box,
            { key: name, flexDirection: "row", gap: 1 },
            e(Text, { color: "#64748b" }, name),
            e(Text, { color: statusColor(status) }, `${statusIcon(status)}`)
          )
        )
      )
    )
  );
};
