/**
 * Model Specialization Framework
 *
 * Manages specialized AI models for tasks that benefit from fine-tuning.
 * The philosophy: use the main LLM (Claude/GPT) + skills for most tasks.
 * Only create specialized models when there's clear evidence that:
 * 1. The task is highly repetitive (runs daily/hourly)
 * 2. The main LLM is too slow or expensive for the volume
 * 3. Domain-specific accuracy matters more than general reasoning
 *
 * Current specialization candidates:
 * - Ticker scoring (runs 700+ times per scan cycle)
 * - Message classification (runs on every incoming message)
 * - Goal prioritization (runs on every thinking cycle)
 * - Sentiment analysis (runs on news articles)
 *
 * The framework:
 * 1. Collects training data from actual system decisions
 * 2. Stores examples in data/training-data/{domain}.jsonl
 * 3. Tracks when enough data exists for fine-tuning
 * 4. Provides interfaces for using specialized models when available
 * 5. Falls back to main LLM when specialized model is unavailable
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const DATA_DIR = path.join(process.cwd(), "data");
const TRAINING_DIR = path.join(DATA_DIR, "training-data");
const MODELS_REGISTRY = path.join(DATA_DIR, "model-registry.json");

/**
 * Specialization domains
 */
export const DOMAIN = {
  TICKER_SCORING: "ticker-scoring",
  MESSAGE_CLASSIFICATION: "message-classification",
  GOAL_PRIORITIZATION: "goal-prioritization",
  SENTIMENT_ANALYSIS: "sentiment-analysis",
  QUERY_ROUTING: "query-routing"
};

/**
 * Minimum training examples before recommending fine-tuning
 */
const MIN_EXAMPLES = {
  [DOMAIN.TICKER_SCORING]: 1000,
  [DOMAIN.MESSAGE_CLASSIFICATION]: 200,
  [DOMAIN.GOAL_PRIORITIZATION]: 100,
  [DOMAIN.SENTIMENT_ANALYSIS]: 500,
  [DOMAIN.QUERY_ROUTING]: 300
};

/**
 * Load the model registry
 */
function loadRegistry() {
  try {
    if (fs.existsSync(MODELS_REGISTRY)) {
      return JSON.parse(fs.readFileSync(MODELS_REGISTRY, "utf-8"));
    }
  } catch {}
  return {
    models: {},
    domains: Object.values(DOMAIN).reduce((acc, d) => {
      acc[d] = {
        exampleCount: 0,
        lastCollected: null,
        readyForTraining: false,
        modelId: null,
        modelProvider: null,
        accuracy: null,
        status: "collecting" // collecting | ready | training | deployed
      };
      return acc;
    }, {}),
    createdAt: new Date().toISOString()
  };
}

/**
 * Save the model registry
 */
function saveRegistry(registry) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MODELS_REGISTRY, JSON.stringify(registry, null, 2));
  } catch (err) {
    console.error("[ModelSpecialization] Failed to save registry:", err.message);
  }
}

/**
 * Model Specialization Service
 */
export class ModelSpecialization extends EventEmitter {
  constructor() {
    super();
    this.registry = loadRegistry();
    this.ensureTrainingDir();
  }

  /**
   * Ensure training data directory exists
   */
  ensureTrainingDir() {
    if (!fs.existsSync(TRAINING_DIR)) {
      fs.mkdirSync(TRAINING_DIR, { recursive: true });
    }
  }

  /**
   * Collect a training example for a domain.
   * Examples are stored in JSONL format for compatibility with OpenAI fine-tuning.
   *
   * @param {string} domain - The specialization domain
   * @param {Object} example - Training example
   * @param {string} example.input - The input text/data
   * @param {string} example.output - The expected output/label
   * @param {Object} [example.metadata] - Additional context
   */
  collectExample(domain, example) {
    if (!DOMAIN[domain.toUpperCase().replace(/-/g, "_")] && !Object.values(DOMAIN).includes(domain)) {
      return;
    }

    if (!example?.input || !example?.output) return;

    try {
      const filePath = path.join(TRAINING_DIR, `${domain}.jsonl`);

      // Format as OpenAI fine-tuning JSONL
      const entry = {
        messages: [
          { role: "system", content: `You are a specialized ${domain} model for BACKBONE.` },
          { role: "user", content: example.input },
          { role: "assistant", content: example.output }
        ],
        metadata: {
          domain,
          collectedAt: new Date().toISOString(),
          ...example.metadata
        }
      };

      fs.appendFileSync(filePath, JSON.stringify(entry) + "\n");

      // Update registry
      if (!this.registry.domains[domain]) {
        this.registry.domains[domain] = {
          exampleCount: 0, lastCollected: null,
          readyForTraining: false, modelId: null,
          status: "collecting"
        };
      }

      this.registry.domains[domain].exampleCount++;
      this.registry.domains[domain].lastCollected = new Date().toISOString();

      // Check if ready for training
      const minRequired = MIN_EXAMPLES[domain] || 200;
      if (this.registry.domains[domain].exampleCount >= minRequired &&
          this.registry.domains[domain].status === "collecting") {
        this.registry.domains[domain].readyForTraining = true;
        this.registry.domains[domain].status = "ready";
        this.emit("domain-ready", { domain, exampleCount: this.registry.domains[domain].exampleCount });
        console.log(`[ModelSpecialization] Domain ${domain} ready for fine-tuning (${this.registry.domains[domain].exampleCount} examples)`);
      }

      // Save periodically (every 10 examples)
      if (this.registry.domains[domain].exampleCount % 10 === 0) {
        saveRegistry(this.registry);
      }

    } catch (err) {
      // Training data collection is non-critical
    }
  }

  /**
   * Get the best model for a domain.
   * Returns the fine-tuned model ID if deployed, or null to use the main LLM.
   *
   * @param {string} domain - The specialization domain
   * @returns {{ modelId: string|null, provider: string|null, useFallback: boolean }}
   */
  getModel(domain) {
    const domainData = this.registry.domains[domain];
    if (!domainData) {
      return { modelId: null, provider: null, useFallback: true };
    }

    if (domainData.status === "deployed" && domainData.modelId) {
      return {
        modelId: domainData.modelId,
        provider: domainData.modelProvider || "openai",
        useFallback: false
      };
    }

    return { modelId: null, provider: null, useFallback: true };
  }

  /**
   * Register a fine-tuned model for a domain.
   * Called after successful fine-tuning.
   *
   * @param {string} domain - The specialization domain
   * @param {string} modelId - The fine-tuned model ID (e.g., "ft:gpt-4o-mini:backbone:ticker-scoring")
   * @param {string} provider - Model provider ("openai", "anthropic", "local")
   * @param {Object} metrics - Training metrics (accuracy, loss, etc.)
   */
  registerModel(domain, modelId, provider, metrics = {}) {
    if (!this.registry.domains[domain]) return;

    this.registry.domains[domain].modelId = modelId;
    this.registry.domains[domain].modelProvider = provider;
    this.registry.domains[domain].status = "deployed";
    this.registry.domains[domain].accuracy = metrics.accuracy || null;
    this.registry.domains[domain].deployedAt = new Date().toISOString();
    this.registry.domains[domain].metrics = metrics;

    this.registry.models[domain] = {
      modelId,
      provider,
      metrics,
      deployedAt: new Date().toISOString()
    };

    saveRegistry(this.registry);
    this.emit("model-deployed", { domain, modelId, provider });
    console.log(`[ModelSpecialization] Model deployed for ${domain}: ${modelId}`);
  }

  /**
   * Mark a domain as currently in training.
   * Called when fine-tuning job is submitted.
   *
   * @param {string} domain - The specialization domain
   * @param {Object} [jobInfo] - Training job metadata
   */
  startTraining(domain, jobInfo = {}) {
    if (!this.registry.domains[domain]) return;
    this.registry.domains[domain].status = "training";
    this.registry.domains[domain].trainingStartedAt = new Date().toISOString();
    this.registry.domains[domain].trainingJob = jobInfo;
    saveRegistry(this.registry);
    this.emit("training-started", { domain, ...jobInfo });
    console.log(`[ModelSpecialization] Training started for ${domain}`);
  }

  /**
   * Get status of all domains
   */
  getStatus() {
    const status = {};
    for (const [domain, data] of Object.entries(this.registry.domains)) {
      const minRequired = MIN_EXAMPLES[domain] || 200;
      status[domain] = {
        status: data.status,
        examples: data.exampleCount,
        required: minRequired,
        progress: Math.min(100, Math.round((data.exampleCount / minRequired) * 100)),
        ready: data.readyForTraining,
        modelId: data.modelId,
        accuracy: data.accuracy
      };
    }
    return status;
  }

  /**
   * Get training data file path for a domain
   */
  getTrainingDataPath(domain) {
    return path.join(TRAINING_DIR, `${domain}.jsonl`);
  }

  /**
   * Get the number of training examples for a domain
   */
  getExampleCount(domain) {
    try {
      const filePath = this.getTrainingDataPath(domain);
      if (!fs.existsSync(filePath)) return 0;
      const content = fs.readFileSync(filePath, "utf-8");
      return content.split("\n").filter(Boolean).length;
    } catch {
      return 0;
    }
  }

  /**
   * Determine if fine-tuning should be recommended for a domain.
   * Considers: example count, frequency of use, cost savings potential.
   */
  shouldFineTune(domain) {
    const data = this.registry.domains[domain];
    if (!data) return { recommend: false, reason: "Unknown domain" };

    const minRequired = MIN_EXAMPLES[domain] || 200;

    if (data.exampleCount < minRequired) {
      return {
        recommend: false,
        reason: `Need ${minRequired - data.exampleCount} more examples (have ${data.exampleCount}/${minRequired})`
      };
    }

    if (data.status === "deployed") {
      return { recommend: false, reason: "Already deployed" };
    }

    return {
      recommend: true,
      reason: `${data.exampleCount} examples collected (minimum ${minRequired}). Ready for fine-tuning.`,
      trainingFile: this.getTrainingDataPath(domain),
      exampleCount: data.exampleCount
    };
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const domains = this.getStatus();
    const deployed = Object.entries(domains).filter(([, d]) => d.status === "deployed").length;
    const collecting = Object.entries(domains).filter(([, d]) => d.status === "collecting").length;
    const ready = Object.entries(domains).filter(([, d]) => d.status === "ready").length;

    return {
      summary: { deployed, collecting, ready, total: Object.keys(domains).length },
      domains
    };
  }
}

// Singleton
let instance = null;
export const getModelSpecialization = () => {
  if (!instance) instance = new ModelSpecialization();
  return instance;
};

export default ModelSpecialization;
