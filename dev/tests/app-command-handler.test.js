/**
 * App Command Handler Tests
 * Validates Firebase message processing, command routing, and context building
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC_DIR = path.join(process.cwd(), "src");
const SERVICES_DIR = path.join(SRC_DIR, "services");

// === APP COMMAND HANDLER SERVICE ===

describe("App Command Handler - Structure", () => {
  const filePath = path.join(SERVICES_DIR, "app-command-handler.js");

  it("service file exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("exports tryDirectCommand function", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export async function tryDirectCommand(messageText)");
  });

  it("exports buildMessageContext function", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export function buildMessageContext()");
  });

  it("exports buildContextualSystemPrompt function", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export function buildContextualSystemPrompt(channel");
  });
});

describe("App Command Handler - Slash Commands", () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, "app-command-handler.js"), "utf-8");

  it("supports /portfolio command", () => {
    expect(content).toContain('/^\\/portfolio$/i');
    expect(content).toContain('handler: "portfolio"');
  });

  it("supports /health command", () => {
    expect(content).toContain('/^\\/health$/i');
    expect(content).toContain('handler: "health"');
  });

  it("supports /sleep command", () => {
    expect(content).toContain('/^\\/sleep$/i');
    expect(content).toContain('handler: "sleep"');
  });

  it("supports /goals command", () => {
    expect(content).toContain('/^\\/goals$/i');
    expect(content).toContain('handler: "goals"');
  });

  it("supports /news command", () => {
    expect(content).toContain('/^\\/news$/i');
    expect(content).toContain('handler: "news"');
  });

  it("supports /market command", () => {
    expect(content).toContain('/^\\/market$/i');
    expect(content).toContain('handler: "market"');
  });

  it("supports /thesis command", () => {
    expect(content).toContain('/^\\/thesis$/i');
    expect(content).toContain('handler: "thesis"');
  });

  it("supports /help command", () => {
    expect(content).toContain('/^\\/help$/i');
    expect(content).toContain('handler: "help"');
  });

  it("supports /calendar command", () => {
    expect(content).toContain('/^\\/calendar$/i');
    expect(content).toContain('handler: "calendar"');
  });

  it("supports /beliefs command", () => {
    expect(content).toContain('/^\\/beliefs$/i');
    expect(content).toContain('handler: "beliefs"');
  });

  it("supports /scores command", () => {
    expect(content).toContain('/^\\/scores$/i');
    expect(content).toContain('handler: "scores"');
  });

  it("supports /status command", () => {
    expect(content).toContain('/^\\/status$/i');
    expect(content).toContain('handler: "status"');
  });
});

describe("App Command Handler - Natural Language Patterns", () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, "app-command-handler.js"), "utf-8");

  it("handles 'how are my stocks' naturally", () => {
    expect(content).toContain("(how are my|show me my|check my)");
    expect(content).toContain("(stocks?|positions?|portfolio)");
  });

  it("handles 'how did I sleep' naturally", () => {
    expect(content).toContain("(how did I|how was my|check my)");
    expect(content).toContain("sleep");
  });

  it("handles 'what are my goals' naturally", () => {
    expect(content).toContain("(what are|show me|list)");
    expect(content).toContain("goals");
  });

  it("handles 'morning brief' naturally", () => {
    expect(content).toContain("morning\\s*brief");
    expect(content).toContain("daily\\s*(summary|update|brief)");
  });
});

describe("App Command Handler - Handlers", () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, "app-command-handler.js"), "utf-8");

  it("has handler for portfolio", () => {
    expect(content).toContain("async function handlePortfolio()");
  });

  it("has handler for health", () => {
    expect(content).toContain("async function handleHealth()");
  });

  it("has handler for goals", () => {
    expect(content).toContain("async function handleGoals()");
  });

  it("has handler for morning brief", () => {
    expect(content).toContain("async function handleMorningBrief()");
  });

  it("has handler for help listing commands", () => {
    expect(content).toContain("async function handleHelp()");
    expect(content).toContain("/portfolio");
    expect(content).toContain("/health");
    expect(content).toContain("/goals");
  });
});

describe("App Command Handler - Context Building", () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, "app-command-handler.js"), "utf-8");

  it("reads memory files for context", () => {
    expect(content).toContain('"profile.md"');
    expect(content).toContain('"portfolio.md"');
    expect(content).toContain('"health.md"');
    expect(content).toContain('"goals.md"');
    expect(content).toContain('"thesis.md"');
  });

  it("includes active goals in context", () => {
    expect(content).toContain('context.activeGoals');
  });

  it("includes beliefs in context", () => {
    expect(content).toContain('context.beliefs');
  });

  it("builds channel-aware system prompt", () => {
    expect(content).toContain("responding via ${channel}");
  });
});

// === APP.JS INTEGRATION ===

describe("App.js - Command Handler Integration", () => {
  const content = fs.readFileSync(path.join(SRC_DIR, "app.js"), "utf-8");

  it("imports tryDirectCommand and buildContextualSystemPrompt", () => {
    expect(content).toContain('import { tryDirectCommand, buildContextualSystemPrompt } from "./services/app-command-handler.js"');
  });

  it("tries direct command before AI classification", () => {
    expect(content).toContain("const commandResult = await tryDirectCommand(message.content)");
    expect(content).toContain("if (commandResult.matched)");
  });

  it("uses contextual system prompt for quick path", () => {
    expect(content).toContain("const systemPrompt = buildContextualSystemPrompt(msgChannel)");
  });

  it("only routes to WhatsApp for WhatsApp messages (not app)", () => {
    expect(content).toContain("if (msgChannel === MESSAGE_CHANNEL.WHATSAPP)");
    expect(content).toContain("Routing WhatsApp response");
  });

  it("has _handleComplexMessage that supports both channels", () => {
    expect(content).toContain('async function _handleComplexMessage(userMessage, userId, aiBrain, channel = "app")');
  });

  it("builds channel-aware CLI prompt", () => {
    expect(content).toContain('function _buildMessageCLIPrompt(userMessage, channel = "app")');
    expect(content).toContain("responding to a user message via ${channel}");
  });
});

// === FUNCTIONAL TESTS ===

describe("App Command Handler - tryDirectCommand", () => {
  it("matches /portfolio command", async () => {
    const { tryDirectCommand } = await import("../src/services/app-command-handler.js");
    const result = await tryDirectCommand("/portfolio");
    expect(result.matched).toBe(true);
    expect(result.handler).toBe("portfolio");
    expect(typeof result.response).toBe("string");
  });

  it("matches /help command", async () => {
    const { tryDirectCommand } = await import("../src/services/app-command-handler.js");
    const result = await tryDirectCommand("/help");
    expect(result.matched).toBe(true);
    expect(result.handler).toBe("help");
    expect(result.response).toContain("/portfolio");
  });

  it("matches /goals command", async () => {
    const { tryDirectCommand } = await import("../src/services/app-command-handler.js");
    const result = await tryDirectCommand("/goals");
    expect(result.matched).toBe(true);
    expect(result.handler).toBe("goals");
  });

  it("matches natural language 'how are my stocks'", async () => {
    const { tryDirectCommand } = await import("../src/services/app-command-handler.js");
    const result = await tryDirectCommand("how are my stocks");
    expect(result.matched).toBe(true);
    expect(result.handler).toBe("portfolio");
  });

  it("does not match random messages", async () => {
    const { tryDirectCommand } = await import("../src/services/app-command-handler.js");
    const result = await tryDirectCommand("tell me a joke");
    expect(result.matched).toBe(false);
  });

  it("returns false for empty input", async () => {
    const { tryDirectCommand } = await import("../src/services/app-command-handler.js");
    const result = await tryDirectCommand("");
    expect(result.matched).toBe(false);
  });
});

describe("App Command Handler - buildContextualSystemPrompt", () => {
  it("returns a string", async () => {
    const { buildContextualSystemPrompt } = await import("../src/services/app-command-handler.js");
    const prompt = buildContextualSystemPrompt("app");
    expect(typeof prompt).toBe("string");
    expect(prompt).toContain("BACKBONE AI");
  });

  it("includes channel name", async () => {
    const { buildContextualSystemPrompt } = await import("../src/services/app-command-handler.js");
    const prompt = buildContextualSystemPrompt("whatsapp");
    expect(prompt).toContain("whatsapp");
  });
});
