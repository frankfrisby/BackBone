/**
 * BACKBONE — Mobile App Connect
 *
 * Displays QR code for connecting BACKBONE PWA on your phone.
 * This script runs in a separate terminal window alongside the main CLI.
 * Closes automatically after 5 minutes or when user presses any key.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const pwaUrl = "https://backboneai.web.app";

// Terminal colors
const ORANGE = "\x1b[38;5;208m";
const GRAY = "\x1b[90m";
const WHITE = "\x1b[97m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

// Clear screen and set title
process.stdout.write("\x1b[2J\x1b[1;1H");
process.stdout.write("\x1b]0;BACKBONE — Connect Phone\x07");

console.log("");
console.log(`  ${ORANGE}${BOLD}BACKBONE${RESET}  ${GRAY}Connect Your Phone${RESET}`);
console.log(`  ${GRAY}${"─".repeat(36)}${RESET}`);
console.log("");

try {
  const qrcode = require("qrcode-terminal");

  qrcode.generate(pwaUrl, { small: true }, (qr) => {
    // Indent QR code
    const lines = qr.split("\n");
    for (const line of lines) {
      console.log(`  ${WHITE}${line}${RESET}`);
    }

    console.log("");
    console.log(`  ${ORANGE}${pwaUrl}${RESET}`);
    console.log("");
    console.log(`  ${WHITE}Steps on your phone:${RESET}`);
    console.log(`  ${GREEN}1.${RESET} Scan QR code or open URL`);
    console.log(`  ${GREEN}2.${RESET} Sign in with Google`);
    console.log(`  ${GREEN}3.${RESET} Tap "Enable Notifications"`);
    console.log(`  ${GREEN}4.${RESET} Tap "Add to Home Screen"`);
    console.log("");
    console.log(`  ${DIM}This window closes automatically.${RESET}`);
    console.log(`  ${DIM}Press any key to close now.${RESET}`);
    console.log("");
  });
} catch (err) {
  console.log(`  ${WHITE}Scan this URL on your phone:${RESET}`);
  console.log("");
  console.log(`  ${ORANGE}${BOLD}${pwaUrl}${RESET}`);
  console.log("");
  console.log(`  ${DIM}(qrcode-terminal not available)${RESET}`);
  console.log(`  ${DIM}Press any key to close.${RESET}`);
  console.log("");
}

// Close on any keypress
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.once("data", () => {
    process.exit(0);
  });
}

// Auto-close after 5 minutes
setTimeout(() => {
  process.exit(0);
}, 5 * 60 * 1000);
