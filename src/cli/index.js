#!/usr/bin/env node
/**
 * BACKBONE CLI Subcommands
 *
 * Inspired by OpenClaw's CLI architecture. These run BEFORE the TUI launches.
 *
 * Usage:
 *   backbone doctor     — Health check & diagnostics
 *   backbone status     — System status overview
 *   backbone logs       — Tail runtime log
 *   backbone config     — Get/set configuration
 *   backbone cron       — View scheduled jobs
 *   backbone memory     — List/search memory files
 *
 * Returns true if a subcommand was handled, false if the TUI should launch.
 */

import { runDoctor } from "./doctor.js";
import { runStatus } from "./status.js";
import { runLogs } from "./logs.js";
import { runConfig } from "./config.js";
import { runCron } from "./cron.js";
import { runMemory } from "./memory.js";

const COMMANDS = {
  doctor: runDoctor,
  status: runStatus,
  logs: runLogs,
  config: runConfig,
  cron: runCron,
  memory: runMemory,
};

const HELP_TEXT = `
BACKBONE CLI

Usage: backbone <command> [options]

Commands:
  doctor          Health check & diagnostics
  status          System status overview
  logs            Tail runtime diagnostic log
  config          Get/set user configuration
  cron            View scheduled proactive jobs
  memory          List & search memory files

Run backbone without arguments to launch the interactive TUI.
Run backbone <command> --help for command-specific help.
`;

/**
 * Try to handle a CLI subcommand. Returns true if handled.
 */
export async function handleCliSubcommand(args) {
  const command = args[0];
  const subArgs = args.slice(1);

  if (command === "--help" || command === "-h") {
    console.log(HELP_TEXT);
    return true;
  }

  if (COMMANDS[command]) {
    try {
      await COMMANDS[command](subArgs);
    } catch (err) {
      console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
      process.exit(1);
    }
    return true;
  }

  return false;
}
