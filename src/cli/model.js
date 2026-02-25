/**
 * Model management CLI — view, switch, and check auth for AI models.
 *
 * Usage:
 *   backbone model              # show current model status
 *   backbone model status       # same
 *   backbone model list         # list available models
 *   backbone model set <id>     # switch preferred model
 *   backbone model auth         # check API key status
 *
 * Flags:
 *   --json                      # output as JSON
 */

import fs from "fs";
import { dataFile } from "../services/paths.js";
import { section, label, ok, warn, info, fail, theme, symbols } from "./theme.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODELS = [
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", tier: "flagship", default: true },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", tier: "balanced" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", tier: "fast" },
];

const DEFAULT_MODEL = "claude-opus-4-6";

const API_KEYS = [
  { env: "ANTHROPIC_API_KEY", label: "Anthropic" },
  { env: "OPENAI_API_KEY", label: "OpenAI" },
  { env: "ALPACA_API_KEY", label: "Alpaca" },
];

const FALLBACK_CHAIN = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSettings() {
  const file = dataFile("user-settings.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  const file = dataFile("user-settings.json");
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

function getCurrentModelId() {
  return readSettings().preferredModel || DEFAULT_MODEL;
}

function findModel(id) {
  return MODELS.find((m) => m.id === id);
}

function maskKey(value) {
  if (!value) return null;
  return value.length > 4 ? "••••" + value.slice(-4) : "••••";
}

function tierBadge(tier) {
  const badges = { flagship: theme.accent("flagship"), balanced: theme.info("balanced"), fast: theme.success("fast") };
  return badges[tier] || tier;
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

function cmdStatus(jsonFlag) {
  const currentId = getCurrentModelId();
  const model = findModel(currentId);
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (jsonFlag) {
    return console.log(JSON.stringify({
      currentModel: currentId,
      name: model?.name || "unknown",
      tier: model?.tier || "unknown",
      apiKeySet: !!anthropicKey,
      fallbackChain: FALLBACK_CHAIN,
    }, null, 2));
  }

  console.log(section("Model Status"));
  console.log(label("Model", model ? `${model.name} ${theme.muted(`(${model.id})`)}` : theme.warn(currentId)));
  console.log(label("Tier", model ? tierBadge(model.tier) : "unknown"));
  console.log(anthropicKey ? ok("Anthropic API key configured") : fail("Anthropic API key not set"));
  console.log(label("Fallback", FALLBACK_CHAIN.map((id) => findModel(id)?.name || id).join(` ${symbols.arrow} `)));
}

function cmdList(jsonFlag) {
  const currentId = getCurrentModelId();

  if (jsonFlag) {
    return console.log(JSON.stringify(MODELS.map((m) => ({ ...m, active: m.id === currentId })), null, 2));
  }

  console.log(section("Available Models"));
  for (const m of MODELS) {
    const active = m.id === currentId;
    const marker = active ? theme.success(symbols.check) : " ";
    const name = active ? theme.bold(m.name) : m.name;
    const defLabel = m.default ? theme.muted(" (default)") : "";
    console.log(`  ${marker} ${name} ${theme.muted(m.id)} ${tierBadge(m.tier)}${defLabel}`);
  }
}

function cmdSet(modelId, jsonFlag) {
  if (!modelId) {
    console.log(jsonFlag ? JSON.stringify({ error: "Missing model ID" }) : fail("Usage: backbone model set <model-id>"));
    process.exitCode = 1;
    return;
  }

  const model = findModel(modelId);
  if (!model) {
    const ids = MODELS.map((m) => m.id).join(", ");
    console.log(jsonFlag
      ? JSON.stringify({ error: `Unknown model: ${modelId}`, available: MODELS.map((m) => m.id) })
      : fail(`Unknown model: ${modelId}\n  Available: ${ids}`));
    process.exitCode = 1;
    return;
  }

  const settings = readSettings();
  settings.preferredModel = model.id;
  writeSettings(settings);

  if (jsonFlag) {
    return console.log(JSON.stringify({ ok: true, model: model.id, name: model.name }));
  }

  console.log(ok(`Switched to ${theme.bold(model.name)} ${theme.muted(`(${model.id})`)}`));
}

function cmdAuth(jsonFlag) {
  const results = API_KEYS.map(({ env, label: name }) => {
    const value = process.env[env];
    return { name, env, set: !!value, masked: maskKey(value) };
  });

  if (jsonFlag) {
    return console.log(JSON.stringify(results, null, 2));
  }

  console.log(section("API Key Status"));
  for (const r of results) {
    if (r.set) {
      console.log(ok(`${r.name} ${theme.muted(r.masked)}`));
    } else {
      console.log(fail(`${r.name} ${theme.muted("not set")}`));
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runModel(args = []) {
  const jsonFlag = args.includes("--json");
  const filtered = args.filter((a) => a !== "--json");
  const sub = filtered[0] || "status";

  switch (sub) {
    case "status":  return cmdStatus(jsonFlag);
    case "list":    return cmdList(jsonFlag);
    case "set":     return cmdSet(filtered[1], jsonFlag);
    case "auth":    return cmdAuth(jsonFlag);
    default:
      console.log(fail(`Unknown subcommand: ${sub}`));
      console.log(info(`Usage: backbone model [status|list|set|auth] [--json]`));
      process.exitCode = 1;
  }
}
