/**
 * backbone tool — Tool management CLI
 *
 * Usage:
 *   backbone tool list              List all tools with categories
 *   backbone tool run <id> [args]   Run a tool (parse key=value args)
 *   backbone tool show <id>         Show tool details and examples
 *   backbone tool forge <desc>      Manually trigger tool-forge to build a new tool
 *   backbone tool check             Validate all tools load correctly
 *   backbone tool stats             Show tool execution statistics
 */

import { listTools, getTool, runTool, getToolHelp, getCategories } from "../../tools/tool-loader.js";
import { section, label, ok, fail, warn, info, theme, symbols } from "./theme.js";

const HELP = `
backbone tool — Tool management

Usage: backbone tool <subcommand> [options]

Subcommands:
  list                List all tools with categories
  run <id> [k=v ...]  Run a tool with key=value arguments
  show <id>           Show tool details, inputs, and examples
  forge <description> Trigger tool-forge to build a new tool
  check               Validate all tools load correctly
  stats               Show tool execution statistics

Options:
  --json              Output machine-readable JSON
  --category <cat>    Filter list by category
  --help              Show this help
`;

function parseArgs(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--category" && i + 1 < args.length) { flags.category = args[++i]; }
    else if (arg.startsWith("--")) flags[arg.slice(2)] = true;
    else positional.push(arg);
  }
  return { flags, positional };
}

function parseKvArgs(args) {
  const inputs = {};
  for (const arg of args) {
    const eq = arg.indexOf("=");
    if (eq > 0) {
      const key = arg.slice(0, eq);
      let val = arg.slice(eq + 1);
      // Auto-parse numbers and booleans
      if (val === "true") val = true;
      else if (val === "false") val = false;
      else if (/^-?\d+(\.\d+)?$/.test(val)) val = parseFloat(val);
      inputs[key] = val;
    }
  }
  return inputs;
}

async function cmdList(flags) {
  const tools = listTools(flags.category || null);
  const categories = {};

  for (const t of tools) {
    const cat = t.category || "other";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(t);
  }

  if (flags.json) {
    console.log(JSON.stringify({ total: tools.length, categories }, null, 2));
    return;
  }

  console.log(theme.heading("\n  BACKBONE Tools\n"));
  console.log(label("Total", String(tools.length)));
  if (flags.category) console.log(label("Filter", flags.category));

  for (const [cat, catTools] of Object.entries(categories).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(section(`  ${cat} (${catTools.length})`));
    for (const t of catTools) {
      const desc = t.description ? theme.muted(` ${symbols.dot} ${t.description}`) : "";
      console.log(`    ${theme.bold(t.id)}${desc}`);
    }
  }
  console.log("");
}

async function cmdRun(positional, flags) {
  const toolId = positional[0];
  if (!toolId) {
    console.log(fail("Usage: backbone tool run <id> [key=value ...]"));
    return;
  }

  const inputs = parseKvArgs(positional.slice(1));
  console.log(info(`Running tool: ${toolId}`));
  if (Object.keys(inputs).length > 0) {
    console.log(label("Inputs", JSON.stringify(inputs)));
  }

  const result = await runTool(toolId, inputs);

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.success) {
    console.log(ok(`Tool ${toolId} completed successfully`));
    console.log("");
    if (typeof result.result === "string") {
      console.log(result.result);
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  } else {
    console.log(fail(`Tool ${toolId} failed: ${result.error}`));
    if (result.validationErrors) {
      for (const e of result.validationErrors) {
        console.log(warn(e));
      }
    }
    if (result.availableTools) {
      console.log(info(`Available tools: ${result.availableTools.join(", ")}`));
    }
  }
}

async function cmdShow(toolId, flags) {
  if (!toolId) {
    console.log(fail("Usage: backbone tool show <id>"));
    return;
  }

  const tool = getTool(toolId);
  if (!tool) {
    console.log(fail(`Tool not found: ${toolId}`));
    return;
  }

  if (flags.json) {
    console.log(JSON.stringify(tool, null, 2));
    return;
  }

  console.log(theme.heading(`\n  Tool: ${tool.name || tool.id}\n`));
  console.log(label("ID", tool.id));
  console.log(label("Category", tool.category || "none"));
  if (tool.description) console.log(label("Description", tool.description));
  if (tool.file) console.log(label("File", tool.file));

  const inputs = tool.inputs || {};
  if (Object.keys(inputs).length > 0) {
    console.log(section("  Inputs"));
    for (const [key, schema] of Object.entries(inputs)) {
      const req = schema.required ? theme.warn("required") : theme.muted("optional");
      const def = schema.default !== undefined ? theme.muted(` default=${schema.default}`) : "";
      console.log(`    ${theme.bold(key)} (${schema.type || "any"}) [${req}]${def}`);
      if (schema.description) console.log(`      ${theme.muted(schema.description)}`);
    }
  }

  if (tool.examples && tool.examples.length > 0) {
    console.log(section("  Examples"));
    for (const ex of tool.examples) {
      const kvPairs = Object.entries(ex).map(([k, v]) => `${k}=${v}`).join(" ");
      console.log(`    backbone tool run ${tool.id} ${kvPairs}`);
    }
  }
  console.log("");
}

async function cmdForge(description, flags) {
  if (!description) {
    console.log(fail("Usage: backbone tool forge <description of needed tool>"));
    return;
  }

  console.log(info(`Forging new tool: "${description}"`));
  console.log(theme.muted("  This may take a minute...\n"));

  try {
    const { forge } = await import("../services/engine/tool-forge-agent.js");
    const result = await forge({
      description,
      source: "cli",
      goalTitle: `CLI forge: ${description}`,
    });

    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.success) {
      console.log(ok(`Tool forged successfully: ${result.toolId || "unknown"}`));
      if (result.spec) {
        console.log(label("ID", result.spec.id));
        console.log(label("Category", result.spec.category));
        console.log(label("File", result.spec.file));
      }
    } else {
      console.log(fail(`Forge failed: ${result.error}`));
    }
  } catch (err) {
    console.log(fail(`Forge error: ${err.message}`));
  }
}

async function cmdCheck(flags) {
  const tools = listTools();
  const results = [];

  if (!flags.json) {
    console.log(theme.heading("\n  Tool Validation\n"));
  }

  for (const t of tools) {
    const tool = getTool(t.id);
    let status = "ok";
    let error = null;

    if (!tool) {
      status = "missing";
      error = "Not found in index";
    } else if (!tool.file) {
      status = "no_file";
      error = "No file specified";
    }

    results.push({ id: t.id, name: t.name, status, error });

    if (!flags.json) {
      if (status === "ok") {
        console.log(ok(`${t.id} ${symbols.arrow} ${tool.file || "inline"}`));
      } else {
        console.log(fail(`${t.id}: ${error}`));
      }
    }
  }

  if (flags.json) {
    const passed = results.filter(r => r.status === "ok").length;
    console.log(JSON.stringify({ total: results.length, passed, failed: results.length - passed, results }, null, 2));
    return;
  }

  const passed = results.filter(r => r.status === "ok").length;
  console.log("");
  if (passed === results.length) {
    console.log(theme.success(`  All ${results.length} tools validated.\n`));
  } else {
    console.log(theme.warn(`  ${passed}/${results.length} tools passed.\n`));
  }
}

async function cmdStats(flags) {
  const tools = listTools();
  const cats = getCategories();
  const categoryCount = {};

  for (const t of tools) {
    const cat = t.category || "other";
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  }

  const stats = {
    totalTools: tools.length,
    categories: categoryCount,
    categoryDefinitions: cats,
  };

  if (flags.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(theme.heading("\n  Tool Statistics\n"));
  console.log(label("Total tools", String(stats.totalTools)));
  console.log(label("Categories", String(Object.keys(categoryCount).length)));

  console.log(section("  By Category"));
  for (const [cat, count] of Object.entries(categoryCount).sort((a, b) => b - a)) {
    const catDef = cats[cat];
    const desc = catDef?.description ? theme.muted(` ${symbols.dot} ${catDef.description}`) : "";
    console.log(`    ${theme.bold(cat)}: ${count} tools${desc}`);
  }
  console.log("");
}

export async function runToolCmd(args) {
  const { flags, positional } = parseArgs(args);
  const sub = positional[0];

  if (flags.help || !sub) {
    console.log(HELP);
    return;
  }

  switch (sub) {
    case "list": return cmdList(flags);
    case "run": return cmdRun(positional.slice(1), flags);
    case "show": return cmdShow(positional[1], flags);
    case "forge": return cmdForge(positional.slice(1).join(" "), flags);
    case "check": return cmdCheck(flags);
    case "stats": return cmdStats(flags);
    default:
      console.log(fail(`Unknown subcommand: ${sub}`));
      console.log(HELP);
  }
}
