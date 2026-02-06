#!/usr/bin/env node
/**
 * BACKBONE Tools CLI
 *
 * Run tools from the command line:
 *
 *   node tools/cli.js list                    # List all tools
 *   node tools/cli.js run add-conviction      # Run a tool interactively
 *   node tools/cli.js run add-conviction --symbol=NVDA --conviction=0.8 --reason="Strong AI growth"
 *   node tools/cli.js help add-conviction     # Get help for a tool
 */

import { listTools, getTool, runTool, getToolHelp, getCategories } from "./tool-loader.js";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  if (!command || command === "help" && args.length === 1) {
    console.log(`
BACKBONE Tools CLI

Usage:
  node tools/cli.js list [category]           List available tools
  node tools/cli.js run <tool-id> [--args]    Run a tool
  node tools/cli.js help <tool-id>            Get help for a tool
  node tools/cli.js categories                List tool categories

Examples:
  node tools/cli.js list trading
  node tools/cli.js run add-conviction --symbol=NVDA --conviction=0.9 --reason="AI chip demand"
  node tools/cli.js run portfolio-summary
  node tools/cli.js help research-stock
`);
    process.exit(0);
  }

  switch (command) {
    case "list":
      await handleList(args[1]);
      break;

    case "categories":
      handleCategories();
      break;

    case "run":
      await handleRun(args.slice(1));
      break;

    case "help":
      handleHelp(args[1]);
      break;

    default:
      // Check if it's a tool ID (shorthand for run)
      const tool = getTool(command);
      if (tool) {
        await handleRun(args);
      } else {
        console.error(`Unknown command: ${command}`);
        console.log("Use 'node tools/cli.js help' for usage");
        process.exit(1);
      }
  }
}

function handleList(category) {
  const tools = listTools(category);

  if (tools.length === 0) {
    console.log(category ? `No tools in category: ${category}` : "No tools found");
    return;
  }

  console.log(`\nAvailable Tools${category ? ` (${category})` : ""}:\n`);

  tools.forEach(t => {
    console.log(`  ${t.id.padEnd(20)} ${t.description.slice(0, 50)}${t.description.length > 50 ? "..." : ""}`);
  });

  console.log(`\nTotal: ${tools.length} tools`);
  console.log("Use 'node tools/cli.js help <tool-id>' for details");
}

function handleCategories() {
  const categories = getCategories();

  console.log("\nTool Categories:\n");

  for (const [id, desc] of Object.entries(categories)) {
    const count = listTools(id).length;
    console.log(`  ${id.padEnd(12)} (${count} tools) — ${desc}`);
  }
}

function handleHelp(toolId) {
  if (!toolId) {
    console.log("Usage: node tools/cli.js help <tool-id>");
    return;
  }

  const help = getToolHelp(toolId);
  console.log("\n" + help);
}

async function handleRun(args) {
  const toolId = args[0];

  if (!toolId) {
    console.error("Usage: node tools/cli.js run <tool-id> [--arg=value ...]");
    process.exit(1);
  }

  const tool = getTool(toolId);
  if (!tool) {
    console.error(`Tool not found: ${toolId}`);
    console.log("Use 'node tools/cli.js list' to see available tools");
    process.exit(1);
  }

  // Parse arguments
  const inputs = {};
  for (const arg of args.slice(1)) {
    if (arg.startsWith("--")) {
      const [key, ...valueParts] = arg.slice(2).split("=");
      const value = valueParts.join("=");
      inputs[key] = value;
    }
  }

  console.log(`\nRunning: ${tool.name}`);
  console.log(`Inputs: ${JSON.stringify(inputs)}\n`);

  const result = await runTool(toolId, inputs);

  if (result.success) {
    console.log("Result:");
    console.log(JSON.stringify(result.result, null, 2));
  } else {
    console.error("Error:", result.error);
    if (result.validationErrors) {
      console.error("Validation errors:", result.validationErrors);
    }
    if (result.expectedInputs) {
      console.error("Expected inputs:", result.expectedInputs);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
