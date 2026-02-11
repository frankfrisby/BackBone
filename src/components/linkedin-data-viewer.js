import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";

const e = React.createElement;

/**
 * LinkedIn Data Viewer
 * Shows stored LinkedIn profile data in an editor-like view with line numbers
 * Supports scrolling with arrow keys
 */
export const LinkedInDataViewer = ({ data, onClose, visible = true }) => {
  const [scrollOffset, setScrollOffset] = useState(0);
  const maxVisibleLines = 20;

  // Build formatted lines from the data
  const buildLines = (profileData) => {
    if (!profileData) {
      return ["No LinkedIn data found.", "", "Run /linkedin to capture your profile."];
    }

    const lines = [];
    const p = profileData.profile || {};

    lines.push("LinkedIn (Recent Crawl)");
    lines.push("═".repeat(40));
    lines.push("");

    if (profileData.profileUrl) {
      lines.push(`URL: ${profileData.profileUrl}`);
    }
    if (profileData.captureMethod) lines.push(`Capture: ${profileData.captureMethod}`);
    if (profileData.httpCode) lines.push(`HTTP: ${profileData.httpCode}`);
    if (profileData.htmlPath) lines.push(`HTML: ${profileData.htmlPath}`);
    if (profileData.textPath) lines.push(`Text: ${profileData.textPath}`);

    lines.push("");
    lines.push("─── Profile ───");

    if (p.name) lines.push(`Name: ${p.name}`);
    if (p.headline) lines.push(`Headline: ${p.headline}`);
    if (p.location) lines.push(`Location: ${p.location}`);
    if (p.currentRole) lines.push(`Current Role: ${p.currentRole}`);
    if (p.currentCompany) lines.push(`Company: ${p.currentCompany}`);
    if (p.connections) lines.push(`Connections: ${p.connections}`);
    if (p.isStudent !== undefined) lines.push(`Student: ${p.isStudent ? "Yes" : "No"}`);

    if (p.about) {
      lines.push("");
      lines.push("─── About ───");
      // Split long about text into multiple lines
      const aboutLines = p.about.split("\n");
      aboutLines.forEach(line => {
        if (line.length > 60) {
          // Word wrap long lines
          const words = line.split(" ");
          let currentLine = "";
          words.forEach(word => {
            if ((currentLine + word).length > 60) {
              lines.push(currentLine.trim());
              currentLine = word + " ";
            } else {
              currentLine += word + " ";
            }
          });
          if (currentLine.trim()) lines.push(currentLine.trim());
        } else {
          lines.push(line);
        }
      });
    }

    if (p.education) {
      lines.push("");
      lines.push("─── Education ───");
      if (p.education.school) lines.push(`School: ${p.education.school}`);
      if (p.education.degree) lines.push(`Degree: ${p.education.degree}`);
      if (p.education.field) lines.push(`Field: ${p.education.field}`);
      if (p.education.year) lines.push(`Year: ${p.education.year}`);
    }

    if (p.skills && p.skills.length > 0) {
      lines.push("");
      lines.push("─── Skills ───");
      // Show skills in rows of 3
      for (let i = 0; i < p.skills.length; i += 3) {
        const skillRow = p.skills.slice(i, i + 3).join(", ");
        lines.push(skillRow);
      }
    }

    if (p.summary) {
      lines.push("");
      lines.push("─── Summary ───");
      const summaryLines = p.summary.split("\n");
      summaryLines.forEach(line => {
        if (line.length > 60) {
          const words = line.split(" ");
          let currentLine = "";
          words.forEach(word => {
            if ((currentLine + word).length > 60) {
              lines.push(currentLine.trim());
              currentLine = word + " ";
            } else {
              currentLine += word + " ";
            }
          });
          if (currentLine.trim()) lines.push(currentLine.trim());
        } else {
          lines.push(line);
        }
      });
    }

    lines.push("");
    lines.push("═".repeat(40));

    if (profileData.capturedAt) {
      const capturedDate = new Date(profileData.capturedAt).toLocaleString();
      lines.push(`Captured: ${capturedDate}`);
    }

    if (profileData.screenshotPath) {
      lines.push(`Screenshot: ${profileData.screenshotPath}`);
    }

    lines.push("");
    lines.push("Press ESC or Q to close | ↑↓ to scroll");

    return lines;
  };

  const lines = buildLines(data);
  const totalLines = lines.length;
  const maxScroll = Math.max(0, totalLines - maxVisibleLines);

  // Handle keyboard input for scrolling
  useInput((input, key) => {
    if (!visible) return;

    if (key.escape || input === "q" || input === "Q") {
      onClose?.();
      return;
    }

    if (key.upArrow) {
      setScrollOffset(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setScrollOffset(prev => Math.min(maxScroll, prev + 1));
    } else if (key.pageUp) {
      setScrollOffset(prev => Math.max(0, prev - maxVisibleLines));
    } else if (key.pageDown) {
      setScrollOffset(prev => Math.min(maxScroll, prev + maxVisibleLines));
    } else if (input === "g") {
      setScrollOffset(0); // Go to top
    } else if (input === "G") {
      setScrollOffset(maxScroll); // Go to bottom
    }
  }, { isActive: visible });

  // Reset scroll when data changes
  useEffect(() => {
    setScrollOffset(0);
  }, [data]);

  if (!visible) return null;

  const visibleLines = lines.slice(scrollOffset, scrollOffset + maxVisibleLines);
  const lineNumberWidth = String(totalLines).length + 1;

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#3b82f6",
      padding: 1,
      width: "100%"
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#3b82f6", bold: true }, "LinkedIn Data Viewer"),
      e(
        Text,
        { color: "#64748b" },
        `Lines ${scrollOffset + 1}-${Math.min(scrollOffset + maxVisibleLines, totalLines)} of ${totalLines}`
      )
    ),

    // Scroll indicator (top)
    scrollOffset > 0 && e(
      Text,
      { color: "#64748b", dimColor: true },
      "  ↑ scroll up for more"
    ),

    // Content with line numbers
    e(
      Box,
      { flexDirection: "column" },
      ...visibleLines.map((line, index) => {
        const lineNumber = scrollOffset + index + 1;
        return e(
          Box,
          { key: `line-${lineNumber}`, flexDirection: "row" },
          // Line number
          e(
            Text,
            { color: "#475569", dimColor: true },
            String(lineNumber).padStart(lineNumberWidth) + " │ "
          ),
          // Line content
          e(
            Text,
            { color: line.startsWith("───") || line.startsWith("═") ? "#64748b" : "#e2e8f0" },
            line
          )
        );
      })
    ),

    // Scroll indicator (bottom)
    scrollOffset < maxScroll && e(
      Text,
      { color: "#64748b", dimColor: true },
      "  ↓ scroll down for more"
    )
  );
};
