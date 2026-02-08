/**
 * Capability Builder & Model Specialization Tests
 * Validates the self-extending code construction system and fine-tuned model framework
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC_DIR = path.join(process.cwd(), "src");
const SERVICES_DIR = path.join(SRC_DIR, "services");

// === CAPABILITY BUILDER ===

describe("Capability Builder - Structure", () => {
  const filePath = path.join(SERVICES_DIR, "capability-builder.js");

  it("service file exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("exports CapabilityBuilder class", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export class CapabilityBuilder extends EventEmitter");
  });

  it("exports singleton getter", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export const getCapabilityBuilder");
  });

  it("exports CAPABILITY_TYPE constants", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export const CAPABILITY_TYPE");
    expect(content).toContain('UTILITY: "utility"');
    expect(content).toContain('PIPELINE: "pipeline"');
    expect(content).toContain('INTEGRATION: "integration"');
    expect(content).toContain('ANALYZER: "analyzer"');
    expect(content).toContain('TRANSFORMER: "transformer"');
    expect(content).toContain('VALIDATOR: "validator"');
  });
});

describe("Capability Builder - Core Methods", () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, "capability-builder.js"), "utf-8");

  it("has analyzeProblem method", () => {
    expect(content).toContain("async analyzeProblem(problem)");
  });

  it("has buildCapability method", () => {
    expect(content).toContain("async buildCapability(spec)");
  });

  it("has solveWithCode pipeline method", () => {
    expect(content).toContain("async solveWithCode(problem)");
  });

  it("has findExistingCapability method", () => {
    expect(content).toContain("findExistingCapability(description)");
  });

  it("has listCapabilities method", () => {
    expect(content).toContain("listCapabilities()");
  });

  it("has getStats method", () => {
    expect(content).toContain("getStats()");
  });

  it("has getDisplayData method", () => {
    expect(content).toContain("getDisplayData()");
  });
});

describe("Capability Builder - Code Generation", () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, "capability-builder.js"), "utf-8");

  it("generates code in src/lib/ directory", () => {
    expect(content).toContain('path.join(process.cwd(), "src", "lib")');
  });

  it("won't overwrite existing modules", () => {
    expect(content).toContain("Module already exists");
  });

  it("saves capability to registry", () => {
    expect(content).toContain("this.registry.capabilities.push(capability)");
  });

  it("emits capability-built event", () => {
    expect(content).toContain('"capability-built"');
  });

  it("logs builds for tracking", () => {
    expect(content).toContain("log.builds.push");
  });

  it("prevents concurrent builds", () => {
    expect(content).toContain("Already building");
  });
});

// === MODEL SPECIALIZATION ===

describe("Model Specialization - Structure", () => {
  const filePath = path.join(SERVICES_DIR, "model-specialization.js");

  it("service file exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("exports ModelSpecialization class", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export class ModelSpecialization extends EventEmitter");
  });

  it("exports singleton getter", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export const getModelSpecialization");
  });

  it("exports DOMAIN constants", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export const DOMAIN");
    expect(content).toContain('TICKER_SCORING: "ticker-scoring"');
    expect(content).toContain('MESSAGE_CLASSIFICATION: "message-classification"');
    expect(content).toContain('GOAL_PRIORITIZATION: "goal-prioritization"');
    expect(content).toContain('SENTIMENT_ANALYSIS: "sentiment-analysis"');
    expect(content).toContain('QUERY_ROUTING: "query-routing"');
  });
});

describe("Model Specialization - Training Data Collection", () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, "model-specialization.js"), "utf-8");

  it("collects training examples", () => {
    expect(content).toContain("collectExample(domain, example)");
  });

  it("stores data in JSONL format", () => {
    expect(content).toContain(".jsonl");
    expect(content).toContain("appendFileSync");
  });

  it("uses OpenAI fine-tuning format", () => {
    expect(content).toContain("messages:");
    expect(content).toContain('role: "system"');
    expect(content).toContain('role: "user"');
    expect(content).toContain('role: "assistant"');
  });

  it("tracks example counts per domain", () => {
    expect(content).toContain("exampleCount");
    expect(content).toContain("lastCollected");
  });

  it("emits domain-ready when enough examples collected", () => {
    expect(content).toContain('"domain-ready"');
    expect(content).toContain("ready for fine-tuning");
  });
});

describe("Model Specialization - Minimum Examples", () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, "model-specialization.js"), "utf-8");

  it("requires 1000 examples for ticker scoring", () => {
    expect(content).toContain("[DOMAIN.TICKER_SCORING]: 1000");
  });

  it("requires 200 examples for message classification", () => {
    expect(content).toContain("[DOMAIN.MESSAGE_CLASSIFICATION]: 200");
  });

  it("requires 100 examples for goal prioritization", () => {
    expect(content).toContain("[DOMAIN.GOAL_PRIORITIZATION]: 100");
  });

  it("requires 500 examples for sentiment analysis", () => {
    expect(content).toContain("[DOMAIN.SENTIMENT_ANALYSIS]: 500");
  });
});

describe("Model Specialization - Model Management", () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, "model-specialization.js"), "utf-8");

  it("has getModel method with fallback", () => {
    expect(content).toContain("getModel(domain)");
    expect(content).toContain("useFallback: true");
    expect(content).toContain("useFallback: false");
  });

  it("has registerModel method", () => {
    expect(content).toContain("registerModel(domain, modelId, provider");
  });

  it("has shouldFineTune recommendation method", () => {
    expect(content).toContain("shouldFineTune(domain)");
  });

  it("tracks model deployment status", () => {
    expect(content).toContain('"deployed"');
    expect(content).toContain('"collecting"');
    expect(content).toContain('"ready"');
    expect(content).toContain('"training"');
  });

  it("emits model-deployed event", () => {
    expect(content).toContain('"model-deployed"');
  });
});

// === FUNCTIONAL TESTS ===

describe("Capability Builder - Functional", () => {
  it("can instantiate and get stats", async () => {
    const { getCapabilityBuilder } = await import("../src/services/capability-builder.js");
    const builder = getCapabilityBuilder();
    const stats = builder.getStats();
    expect(typeof stats.totalBuilt).toBe("number");
    expect(typeof stats.building).toBe("boolean");
  });

  it("lists capabilities (may be empty)", async () => {
    const { getCapabilityBuilder } = await import("../src/services/capability-builder.js");
    const builder = getCapabilityBuilder();
    const caps = builder.listCapabilities();
    expect(Array.isArray(caps)).toBe(true);
  });

  it("returns no-build for empty problem", async () => {
    const { getCapabilityBuilder } = await import("../src/services/capability-builder.js");
    const builder = getCapabilityBuilder();
    const result = await builder.analyzeProblem({});
    expect(result.needsBuild).toBe(false);
  });
});

describe("Model Specialization - Functional", () => {
  it("can instantiate and get status", async () => {
    const { getModelSpecialization } = await import("../src/services/model-specialization.js");
    const ms = getModelSpecialization();
    const status = ms.getStatus();
    expect(typeof status).toBe("object");
    expect(status["ticker-scoring"]).toBeDefined();
    expect(typeof status["ticker-scoring"].examples).toBe("number");
  });

  it("returns fallback model for uncollected domains", async () => {
    const { getModelSpecialization, DOMAIN } = await import("../src/services/model-specialization.js");
    const ms = getModelSpecialization();
    const model = ms.getModel(DOMAIN.TICKER_SCORING);
    expect(model.useFallback).toBe(true);
    expect(model.modelId).toBe(null);
  });

  it("shouldFineTune returns need-more for empty domains", async () => {
    const { getModelSpecialization, DOMAIN } = await import("../src/services/model-specialization.js");
    const ms = getModelSpecialization();
    const result = ms.shouldFineTune(DOMAIN.TICKER_SCORING);
    expect(result.recommend).toBe(false);
    expect(result.reason).toContain("more examples");
  });

  it("getDisplayData returns summary", async () => {
    const { getModelSpecialization } = await import("../src/services/model-specialization.js");
    const ms = getModelSpecialization();
    const data = ms.getDisplayData();
    expect(data.summary).toBeDefined();
    expect(typeof data.summary.total).toBe("number");
    expect(data.domains).toBeDefined();
  });
});
