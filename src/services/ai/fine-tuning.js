/**
 * Fine-Tuning Service for BACKBONE
 * Creates personalized AI models based on user data, preferences, and interactions
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
const FINE_TUNE_DIR = path.join(DATA_DIR, "fine-tuning");
const CONFIG_PATH = path.join(DATA_DIR, "fine-tuning-config.json");
const TRAINING_DATA_PATH = path.join(FINE_TUNE_DIR, "training-data.jsonl");

// Ensure directories exist
const ensureDirs = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FINE_TUNE_DIR)) fs.mkdirSync(FINE_TUNE_DIR, { recursive: true });
};

// Default configuration
const DEFAULT_CONFIG = {
  enabled: false,
  provider: "openai", // openai, anthropic (future)
  baseModel: "gpt-4o-mini-2024-07-18", // Base model for fine-tuning
  fineTunedModelId: null, // ID of the fine-tuned model after training
  fineTuneJobId: null, // Current fine-tune job ID
  lastTrainingDate: null,
  trainingExamples: 0,
  autoCollectData: true, // Automatically collect training data from interactions
  minExamplesForTraining: 50, // Minimum examples before training
  hyperparameters: {
    n_epochs: 3,
    batch_size: 4,
    learning_rate_multiplier: 1.8
  }
};

/**
 * Load fine-tuning configuration
 */
export const loadFineTuningConfig = () => {
  try {
    ensureDirs();
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      return { ...DEFAULT_CONFIG, ...data };
    }
  } catch (error) {
    console.error("Failed to load fine-tuning config:", error.message);
  }
  return { ...DEFAULT_CONFIG };
};

/**
 * Save fine-tuning configuration
 */
export const saveFineTuningConfig = (config) => {
  try {
    ensureDirs();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save fine-tuning config:", error.message);
    return false;
  }
};

/**
 * Update fine-tuning setting
 */
export const updateFineTuningSetting = (key, value) => {
  const config = loadFineTuningConfig();
  config[key] = value;
  return saveFineTuningConfig(config);
};

/**
 * Generate training example from user interaction
 */
const generateTrainingExample = (category, userInput, assistantResponse, context = {}) => {
  const systemPrompts = {
    trading: "You are BACKBONE's trading analyst. Provide concise, actionable trading insights based on technical analysis and user preferences.",
    goals: "You are BACKBONE's goal coach. Help users achieve their goals with motivational, practical advice tailored to their situation.",
    health: "You are BACKBONE's health advisor. Provide personalized health recommendations based on user data and wellness goals.",
    general: "You are BACKBONE, an AI-powered life operating system. Help users optimize their life across finance, health, career, and personal growth."
  };

  return {
    messages: [
      { role: "system", content: systemPrompts[category] || systemPrompts.general },
      { role: "user", content: userInput },
      { role: "assistant", content: assistantResponse }
    ]
  };
};

/**
 * Add training example to dataset
 */
export const addTrainingExample = (category, userInput, assistantResponse, context = {}) => {
  const config = loadFineTuningConfig();
  if (!config.autoCollectData) return false;

  try {
    ensureDirs();
    const example = generateTrainingExample(category, userInput, assistantResponse, context);
    const line = JSON.stringify(example) + "\n";

    fs.appendFileSync(TRAINING_DATA_PATH, line);

    // Update count
    config.trainingExamples = (config.trainingExamples || 0) + 1;
    saveFineTuningConfig(config);

    return true;
  } catch (error) {
    console.error("Failed to add training example:", error.message);
    return false;
  }
};

/**
 * Generate training data from user's existing data
 */
export const generateTrainingDataFromUserData = async () => {
  ensureDirs();
  const examples = [];

  try {
    // 1. Generate from goals
    const goalsPath = path.join(DATA_DIR, "goals.json");
    if (fs.existsSync(goalsPath)) {
      const goals = JSON.parse(fs.readFileSync(goalsPath, "utf-8"));
      if (Array.isArray(goals)) {
        for (const goal of goals.slice(0, 10)) {
          examples.push(generateTrainingExample("goals",
            `I want to ${goal.title || goal.description}. How should I approach this?`,
            `Based on your goal "${goal.title}", I recommend breaking it into milestones: 1) Start with small daily actions 2) Track your progress weekly 3) Celebrate achievements. Your current progress is ${Math.round((goal.progress || 0) * 100)}%. Keep going!`
          ));
        }
      }
    }

    // 2. Generate from trading history
    const tradingHistoryPath = path.join(DATA_DIR, "trading-history.json");
    if (fs.existsSync(tradingHistoryPath)) {
      const history = JSON.parse(fs.readFileSync(tradingHistoryPath, "utf-8"));
      if (history.weeks && history.weeks.length > 0) {
        const totalReturn = history.totalPnLPercent || 0;
        examples.push(generateTrainingExample("trading",
          "How is my portfolio performing compared to the market?",
          `Your portfolio has returned ${totalReturn > 0 ? '+' : ''}${totalReturn.toFixed(1)}% over the past 8 weeks. ${totalReturn > 0 ? 'You\'re outperforming' : 'Consider reviewing your strategy to better match'} the market. The key is consistent, disciplined trading based on our scoring system.`
        ));
      }
    }

    // 3. Generate from trades log
    const tradesPath = path.join(DATA_DIR, "trades-log.json");
    if (fs.existsSync(tradesPath)) {
      const trades = JSON.parse(fs.readFileSync(tradesPath, "utf-8"));
      if (Array.isArray(trades) && trades.length > 0) {
        const buyTrades = trades.filter(t => t.side === "buy");
        const sellTrades = trades.filter(t => t.side === "sell");
        examples.push(generateTrainingExample("trading",
          "What's my trading activity like?",
          `You've made ${trades.length} trades total: ${buyTrades.length} buys and ${sellTrades.length} sells. Your trading style appears ${buyTrades.length > sellTrades.length ? 'growth-focused' : 'balanced'}. Remember, our system only buys top 3 tickers with scores >= 8.0.`
        ));
      }
    }

    // 4. Generate from LinkedIn profile
    const linkedinPath = path.join(DATA_DIR, "linkedin-profile.json");
    if (fs.existsSync(linkedinPath)) {
      const linkedin = JSON.parse(fs.readFileSync(linkedinPath, "utf-8"));
      if (linkedin.profile) {
        const name = linkedin.profile.name || "there";
        examples.push(generateTrainingExample("general",
          "Tell me about my professional background",
          `Based on your LinkedIn profile, ${name}, you have experience in ${linkedin.profile.headline || 'your field'}. Your professional network and experience are valuable assets for achieving your career goals.`
        ));
      }
    }

    // 5. Generate general BACKBONE knowledge examples
    const backboneExamples = [
      {
        user: "How do I check my portfolio?",
        assistant: "Your portfolio is displayed in the right sidebar. It shows your total equity, today's P/L, and all positions with their scores. Use /portfolio for detailed view or /alpaca to configure your trading account."
      },
      {
        user: "What do the ticker scores mean?",
        assistant: "Ticker scores range from 0-10 and combine MACD, RSI, volume, and momentum analysis. Scores >= 8.0 are BUY signals (only for top 3), 4.0-8.0 are HOLD, and <= 4.0 are SELL. The system automatically trades based on these scores during market hours."
      },
      {
        user: "How does auto-trading work?",
        assistant: "Auto-trading runs every 10 minutes during market hours (9:30am-4pm ET). It buys from the top 3 tickers with scores >= 8.0 and sells positions with scores <= 4.0. Configure limits with /trading config. Your max position size is $1000 by default."
      },
      {
        user: "What keyboard shortcuts are available?",
        assistant: "Key shortcuts: Ctrl+R opens Test Runner, Ctrl+P toggles Private Mode (hides dollar amounts), Ctrl+U cycles view modes (Core/Advanced/Minimal), Ctrl+T cycles API tiers. Type / to see all commands."
      },
      {
        user: "How do I set goals?",
        assistant: "Use /goals to manage your goals. BACKBONE tracks progress across 6 life categories: Finance, Health, Family, Career, Growth, and Education. Set specific, measurable goals and I'll help you track progress and suggest actions."
      }
    ];

    for (const ex of backboneExamples) {
      examples.push(generateTrainingExample("general", ex.user, ex.assistant));
    }

    // Write all examples to file
    const lines = examples.map(ex => JSON.stringify(ex)).join("\n") + "\n";
    fs.writeFileSync(TRAINING_DATA_PATH, lines);

    // Update config
    const config = loadFineTuningConfig();
    config.trainingExamples = examples.length;
    saveFineTuningConfig(config);

    return { success: true, count: examples.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Upload training file to OpenAI
 */
export const uploadTrainingFile = async () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "OPENAI_API_KEY not set" };
  }

  if (!fs.existsSync(TRAINING_DATA_PATH)) {
    return { success: false, error: "No training data. Run generateTrainingDataFromUserData first." };
  }

  try {
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("purpose", "fine-tune");
    form.append("file", fs.createReadStream(TRAINING_DATA_PATH), {
      filename: "training-data.jsonl",
      contentType: "application/jsonl"
    });

    const response = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        ...form.getHeaders()
      },
      body: form
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const file = await response.json();
    return { success: true, fileId: file.id, filename: file.filename };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Create fine-tuning job
 */
export const createFineTuningJob = async (fileId) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "OPENAI_API_KEY not set" };
  }

  const config = loadFineTuningConfig();

  try {
    const response = await fetch("https://api.openai.com/v1/fine_tuning/jobs", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        training_file: fileId,
        model: config.baseModel,
        hyperparameters: config.hyperparameters,
        suffix: "backbone-personal"
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const job = await response.json();

    // Save job ID
    config.fineTuneJobId = job.id;
    config.lastTrainingDate = new Date().toISOString();
    saveFineTuningConfig(config);

    return { success: true, jobId: job.id, status: job.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Check fine-tuning job status
 */
export const checkFineTuningStatus = async () => {
  const apiKey = process.env.OPENAI_API_KEY;
  const config = loadFineTuningConfig();

  if (!apiKey) {
    return { success: false, error: "OPENAI_API_KEY not set" };
  }

  if (!config.fineTuneJobId) {
    return { success: false, error: "No fine-tuning job in progress" };
  }

  try {
    const response = await fetch(`https://api.openai.com/v1/fine_tuning/jobs/${config.fineTuneJobId}`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const job = await response.json();

    // If completed, save the model ID
    if (job.status === "succeeded" && job.fine_tuned_model) {
      config.fineTunedModelId = job.fine_tuned_model;
      saveFineTuningConfig(config);
    }

    return {
      success: true,
      status: job.status,
      fineTunedModel: job.fine_tuned_model,
      trainedTokens: job.trained_tokens,
      error: job.error
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Run fine-tuned model inference
 */
export const queryFineTunedModel = async (prompt, systemPrompt = null) => {
  const apiKey = process.env.OPENAI_API_KEY;
  const config = loadFineTuningConfig();

  if (!apiKey) {
    return { success: false, error: "OPENAI_API_KEY not set" };
  }

  const modelId = config.fineTunedModelId || config.baseModel;

  try {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const result = await response.json();
    return {
      success: true,
      response: result.choices[0].message.content,
      model: modelId,
      isFineTuned: modelId === config.fineTunedModelId
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Run full fine-tuning pipeline
 */
export const runFineTuningPipeline = async (onProgress) => {
  const steps = [];

  // Step 1: Generate training data
  onProgress?.({ step: 1, total: 4, message: "Generating training data from your data..." });
  const dataResult = await generateTrainingDataFromUserData();
  steps.push({ step: "Generate Data", ...dataResult });

  if (!dataResult.success) {
    return { success: false, steps, error: dataResult.error };
  }

  // Step 2: Upload training file
  onProgress?.({ step: 2, total: 4, message: "Uploading training data to OpenAI..." });
  const uploadResult = await uploadTrainingFile();
  steps.push({ step: "Upload File", ...uploadResult });

  if (!uploadResult.success) {
    return { success: false, steps, error: uploadResult.error };
  }

  // Step 3: Create fine-tuning job
  onProgress?.({ step: 3, total: 4, message: "Starting fine-tuning job..." });
  const jobResult = await createFineTuningJob(uploadResult.fileId);
  steps.push({ step: "Create Job", ...jobResult });

  if (!jobResult.success) {
    return { success: false, steps, error: jobResult.error };
  }

  // Step 4: Return status (job runs async)
  onProgress?.({ step: 4, total: 4, message: "Fine-tuning started! Check status with /finetune status" });

  return {
    success: true,
    steps,
    jobId: jobResult.jobId,
    message: "Fine-tuning job started. Training typically takes 10-30 minutes."
  };
};

/**
 * Test fine-tuned model with sample questions
 */
export const testFineTunedModel = async () => {
  const testQuestions = [
    "How is my portfolio doing?",
    "What stocks should I buy?",
    "How do I set a new goal?",
    "What's my health score?"
  ];

  const results = [];
  for (const question of testQuestions) {
    const result = await queryFineTunedModel(question);
    results.push({
      question,
      answer: result.success ? result.response : result.error,
      model: result.model,
      isFineTuned: result.isFineTuned
    });
  }

  return results;
};

/**
 * Get fine-tuning status summary
 */
export const getFineTuningStatus = () => {
  const config = loadFineTuningConfig();
  return {
    enabled: config.enabled,
    hasFineTunedModel: !!config.fineTunedModelId,
    fineTunedModelId: config.fineTunedModelId,
    baseModel: config.baseModel,
    trainingExamples: config.trainingExamples,
    lastTrainingDate: config.lastTrainingDate,
    jobInProgress: !!config.fineTuneJobId && !config.fineTunedModelId,
    jobId: config.fineTuneJobId
  };
};

export default {
  loadFineTuningConfig,
  saveFineTuningConfig,
  updateFineTuningSetting,
  addTrainingExample,
  generateTrainingDataFromUserData,
  uploadTrainingFile,
  createFineTuningJob,
  checkFineTuningStatus,
  queryFineTunedModel,
  runFineTuningPipeline,
  testFineTunedModel,
  getFineTuningStatus
};
