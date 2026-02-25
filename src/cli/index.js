#!/usr/bin/env node
/**
 * BACKBONE CLI Subcommands
 *
 * These run BEFORE the TUI launches.
 *
 * Usage:
 *   backbone doctor     — Health check & diagnostics
 *   backbone status     — System status overview
 *   backbone logs       — Tail runtime log
 *   backbone config     — Get/set configuration
 *   backbone cron       — View/manage scheduled jobs
 *   backbone memory     — Search & index memory files
 *   backbone msg        — Send/read messages
 *   backbone model      — AI model management
 *   backbone skill      — Manage skills
 *   backbone tool       — Manage tools
 *
 * Returns true if a subcommand was handled, false if the TUI should launch.
 */

import { runDoctor } from "./doctor.js";
import { runStatus } from "./status.js";
import { runLogs } from "./logs.js";
import { runConfig } from "./config.js";
import { runCron } from "./cron.js";
import { runMemory } from "./memory.js";
import { runMsg } from "./msg.js";
import { runModel } from "./model.js";
import { runSkill } from "./skill.js";
import { runToolCmd } from "./tool.js";
import { runServer } from "./server.js";
import { runDo } from "./do.js";
import { runEmpower } from "./empower.js";
import { runChannel } from "./channel.js";
import { runUpdate } from "./update.js";

const COMMANDS = {
  doctor: runDoctor,
  status: runStatus,
  logs: runLogs,
  config: runConfig,
  cron: runCron,
  memory: runMemory,
  msg: runMsg,
  model: runModel,
  skill: runSkill,
  tool: runToolCmd,
  server: runServer,
  do: runDo,
  empower: runEmpower,
  channel: runChannel,
  channels: runChannel,
  update: runUpdate,
};

const HELP_TEXT = `
BACKBONE CLI

Usage: backbone <command> [options]

Commands:
  doctor          Health check & diagnostics (--deep for comprehensive)
  status          System status overview
  logs            Tail runtime diagnostic log (-f to follow)
  config          Get/set user configuration
  cron            View & manage scheduled jobs
  memory          Search & index memory files
  msg             Send & read WhatsApp messages
  model           AI model status, switch, auth check
  skill           Manage skills (list, show, create)
  tool            Manage tools (list, run, forge)
  server          Start, stop, restart the server
  do              Control your computer (open apps, type, click, browse)
  empower         Empower financial data (scrape, accounts, holdings)
  channel         Manage messaging channels (list, add, enable, config)
  update          Check for and install updates (--check to just check)

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
