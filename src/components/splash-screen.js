/**
 * Splash Screen Component
 * Professional loading screen with animated logo
 */

import React, { useState, useEffect, memo } from "react";
import { Box, Text } from "ink";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { engineFile } from "../services/paths.js";

const e = React.createElement;

// Brand colors
const BRAND_COLOR = "#f97316";
const BRAND_SECONDARY = "#ea580c";
const TEXT_PRIMARY = "#e2e8f0";
const TEXT_SECONDARY = "#94a3b8";
const TEXT_MUTED = "#64748b";

// Get version info
const getVersionInfo = () => {
  let version = "3.0.0";
  let commitHash = "dev";

  try {
    const pkgPath = engineFile("package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      version = pkg.version || version;
    }
  } catch (e) {}

  try {
    commitHash = execSync("git rev-parse --short HEAD", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch (e) {}

  return { version, commitHash };
};

// Spinning B logo frames - cleaner version
const B_LOGO_FRAMES = [
  [
    "    ██████╗     ",
    "    ██╔══██╗    ",
    "    ██████╔╝    ",
    "    ██╔══██╗    ",
    "    ██████╔╝    ",
    "    ╚═════╝     "
  ],
  [
    "    ▓▓▓▓▓▓╗     ",
    "    ▓▓╔══▓▓╗    ",
    "    ▓▓▓▓▓▓╔╝    ",
    "    ▓▓╔══▓▓╗    ",
    "    ▓▓▓▓▓▓╔╝    ",
    "    ╚═════╝     "
  ],
  [
    "      ║║        ",
    "      ║║        ",
    "      ║║        ",
    "      ║║        ",
    "      ║║        ",
    "      ╚╝        "
  ],
  [
    "    ░░░░░░╗     ",
    "    ░░╔══░░╗    ",
    "    ░░░░░░╔╝    ",
    "    ░░╔══░░╗    ",
    "    ░░░░░░╔╝    ",
    "    ╚═════╝     "
  ],
  [
    "    ▒▒▒▒▒▒╗     ",
    "    ▒▒╔══▒▒╗    ",
    "    ▒▒▒▒▒▒╔╝    ",
    "    ▒▒╔══▒▒╗    ",
    "    ▒▒▒▒▒▒╔╝    ",
    "    ╚═════╝     "
  ],
  [
    "    ░░░░░░╗     ",
    "    ░░╔══░░╗    ",
    "    ░░░░░░╔╝    ",
    "    ░░╔══░░╗    ",
    "    ░░░░░░╔╝    ",
    "    ╚═════╝     "
  ],
  [
    "      ║║        ",
    "      ║║        ",
    "      ║║        ",
    "      ║║        ",
    "      ║║        ",
    "      ╚╝        "
  ],
  [
    "    ▓▓▓▓▓▓╗     ",
    "    ▓▓╔══▓▓╗    ",
    "    ▓▓▓▓▓▓╔╝    ",
    "    ▓▓╔══▓▓╗    ",
    "    ▓▓▓▓▓▓╔╝    ",
    "    ╚═════╝     "
  ]
];

// Loading bar animation
const LOADING_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

/**
 * Spinning B Logo Component
 */
const SpinningBLogo = ({ color = BRAND_COLOR }) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % B_LOGO_FRAMES.length);
    }, 120);
    return () => clearInterval(interval);
  }, []);

  return e(
    Box,
    { flexDirection: "column", alignItems: "center" },
    ...B_LOGO_FRAMES[frame].map((line, i) =>
      e(Text, { key: i, color }, line)
    )
  );
};

/**
 * Loading Spinner Component
 */
const LoadingSpinner = ({ color = BRAND_COLOR }) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % LOADING_FRAMES.length);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return e(Text, { color }, LOADING_FRAMES[frame]);
};

/**
 * Main Splash Screen Component
 */
const SplashScreenBase = ({ message = "Initializing", showCredits = true }) => {
  const { version, commitHash } = getVersionInfo();
  const versionString = `v${version}.${commitHash}`;

  // Get terminal dimensions for true centering
  const termHeight = process.stdout.rows || 90;
  const termWidth = process.stdout.columns || 80;

  return e(
    Box,
    {
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: termWidth,
      height: termHeight
    },

    // Single centered content block
    e(
      Box,
      { flexDirection: "column", alignItems: "center" },

      // Spinning B Logo
      e(SpinningBLogo, { color: BRAND_COLOR }),

      // Tagline
      e(Box, { marginTop: 1 }),
      e(Text, { color: TEXT_SECONDARY }, "AI-Powered Life Operating System"),

      // Loading indicator
      e(
        Box,
        { marginTop: 2, flexDirection: "row", gap: 1, alignItems: "center" },
        e(LoadingSpinner, { color: BRAND_COLOR }),
        e(Text, { color: TEXT_MUTED }, ` ${message}`)
      ),

      // Version
      e(Box, { marginTop: 2 }),
      e(Text, { color: "#475569", dimColor: true }, versionString),

      // Credits
      e(Box, { marginTop: 1 }),
      e(Text, { color: "#475569", dimColor: true }, "Created by Frank Frisby")
    )
  );
};

export const SplashScreen = memo(SplashScreenBase);

export default SplashScreen;
