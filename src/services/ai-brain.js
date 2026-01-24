/**
 * AI Brain Service
 *
 * The actual AI-driven decision engine for BACKBONE.
 * Uses GPT-5.2 Thinking or Claude for real reasoning, not hardcoded rules.
 *
 * Key features:
 * - Persistent conversation thread for memory/context
 * - Real AI reasoning for observations and actions
 * - Connects to all user data (goals, portfolio, health, etc.)
 * - Generates natural, intelligent responses
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { sendMessage, sendToClaude, TASK_TYPES, getMultiAIConfig, MODELS } from "./multi-ai.js";

const DATA_DIR = path.join(process.cwd(), "data");
const THREAD_FILE = path.join(DATA_DIR, "ai_brain_thread.json");
const MAX_THREAD_MESSAGES = 50; // Keep last 50 messages for context

/**
 * AI Brain - The real thinking engine
 */
class AIBrain extends EventEmitter {
  constructor() {
    super();
    this.thread = this.loadThread();
    this.isThinking = false;
    this.lastThought = null;
    this.contextProviders = {};
  }

  /**
   * Load conversation thread from disk
   */
  loadThread() {
    try {
      if (fs.existsSync(THREAD_FILE)) {
        const data = JSON.parse(fs.readFileSync(THREAD_FILE, "utf-8"));
        return {
          messages: data.messages || [],
          summary: data.summary || null,
          lastUpdated: data.lastUpdated || null,
          totalMessages: data.totalMessages || 0
        };
      }
    } catch (error) {
      console.error("Failed to load AI brain thread:", error.message);
    }
    return {
      messages: [],
      summary: null,
      lastUpdated: null,
      totalMessages: 0
    };
  }

  /**
   * Save conversation thread to disk
   */
  saveThread() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(THREAD_FILE, JSON.stringify(this.thread, null, 2));
    } catch (error) {
      console.error("Failed to save AI brain thread:", error.message);
    }
  }

  /**
   * Register a context provider
   */
  registerContextProvider(name, provider) {
    this.contextProviders[name] = provider;
  }

  /**
   * Gather all context from providers
   */
  async gatherContext() {
    const context = {};
    for (const [name, provider] of Object.entries(this.contextProviders)) {
      try {
        context[name] = typeof provider === "function" ? await provider() : provider;
      } catch (error) {
        context[name] = { error: error.message };
      }
    }
    return context;
  }

  /**
   * Build the system prompt with current context
   */
  buildSystemPrompt(context) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    // Get user's first name if available
    const userName = context?.profile?.name?.split(" ")[0] ||
                     context?.linkedIn?.name?.split(" ")[0] ||
                     process.env.USER_NAME?.split(" ")[0] ||
                     "the user";

    return `You are the strategic AI brain of BACKBONE, an autonomous life operating system for ${userName}.

CURRENT TIME: ${timeStr} on ${dateStr}

YOUR MISSION:
You are NOT a passive observer. You are an ACTIVE agent that takes real actions to improve ${userName}'s life.
You must think strategically and execute meaningful work.

CONTEXT:
${JSON.stringify(context, null, 2)}

${this.thread.summary ? `PREVIOUS CONTEXT SUMMARY:\n${this.thread.summary}\n` : ""}

CRITICAL RULES:
1. NEVER suggest vague actions like "monitor data" or "analyze portfolio" without specifics
2. ALWAYS include specific details: ticker symbols, exact numbers, dates, names
3. Your actions must produce TANGIBLE RESULTS that ${userName} can see
4. Think about ${userName}'s actual goals and how to advance them TODAY

EXAMPLES OF BAD ACTIONS (NEVER DO THESE):
- "Analyze your portfolio" (too vague - what specifically?)
- "Monitor health metrics" (passive, not actionable)
- "Help manage your life" (meaningless)
- "Initialize autonomous agent" (internal - user doesn't care)

EXAMPLES OF GOOD ACTIONS:
- "Research NVDA price action: looking for entry at $875 support, 2% stop loss target"
- "Draft LinkedIn message to Sarah Chen about the AI engineering role at TechCorp"
- "Create weekly health report: sleep avg 6.2h (down 12%), recommend 10pm bedtime"
- "Execute limit buy: 5 shares AAPL at $185.50 based on oversold RSI"

When communicating results to ${userName}, address them by name and explain:
1. What you just accomplished
2. Why it matters for their goals
3. What you're planning to do next`;
  }

  /**
   * Add a message to the thread
   */
  addToThread(role, content) {
    this.thread.messages.push({
      role,
      content,
      timestamp: new Date().toISOString()
    });
    this.thread.totalMessages++;

    // Trim old messages if needed
    if (this.thread.messages.length > MAX_THREAD_MESSAGES) {
      // Keep the most recent messages
      const removed = this.thread.messages.splice(0, this.thread.messages.length - MAX_THREAD_MESSAGES);

      // TODO: Could summarize removed messages into thread.summary
    }

    this.thread.lastUpdated = new Date().toISOString();
    this.saveThread();
  }

  /**
   * Think - analyze current state and generate observation
   */
  async think(specificQuestion = null) {
    if (this.isThinking) {
      return { success: false, error: "Already thinking" };
    }

    this.isThinking = true;
    this.emit("thinking-start");

    try {
      // Gather current context
      const context = await this.gatherContext();

      // Build the prompt
      const prompt = specificQuestion
        ? specificQuestion
        : `Analyze the current state and provide a brief, insightful observation about what's most important right now. Focus on:
1. Anything that needs immediate attention
2. Progress on active goals
3. Notable patterns or changes
4. One actionable suggestion if appropriate

Keep your response concise (2-4 sentences for the observation, plus any action suggestion).`;

      // Add to thread
      this.addToThread("user", prompt);

      // Get AI response - try OpenAI first, fallback to Claude
      const config = getMultiAIConfig();
      let response = null;
      let modelUsed = "Unknown";

      try {
        const result = await sendMessage(prompt, {
          systemPrompt: this.buildSystemPrompt(context),
          ...context
        }, TASK_TYPES.COMPLEX);
        response = result.response;
        modelUsed = result.modelInfo?.name || "GPT-5.2";
      } catch (openaiError) {
        // If OpenAI fails (quota, etc), try Claude as fallback
        if (config.claude.ready) {
          console.log("OpenAI failed, falling back to Claude:", openaiError.message);
          response = await sendToClaude(
            `${this.buildSystemPrompt(context)}\n\n${prompt}`,
            context
          );
          modelUsed = "Claude Sonnet 4";
        } else {
          throw openaiError; // No fallback available
        }
      }

      if (!response) {
        throw new Error("No AI response received");
      }

      // Add response to thread
      this.addToThread("assistant", response);

      this.lastThought = {
        observation: response,
        context: context,
        timestamp: new Date().toISOString(),
        model: modelUsed
      };

      this.emit("thought", this.lastThought);

      return {
        success: true,
        observation: response,
        model: modelUsed
      };

    } catch (error) {
      this.emit("thinking-error", error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      this.isThinking = false;
      this.emit("thinking-end");
    }
  }

  /**
   * Generate action proposals based on current state
   */
  async generateActions(maxActions = 3) {
    if (this.isThinking) {
      return { success: false, error: "Already thinking", actions: [] };
    }

    this.isThinking = true;
    this.emit("thinking-start");

    try {
      const context = await this.gatherContext();

      const prompt = `Based on the current context, suggest ${maxActions} specific actions I should take.

For each action, provide:
1. A clear, specific title (what to do)
2. Why this action matters right now (brief rationale)
3. Priority (high/medium/low)
4. Type: one of [research, execute, analyze, communicate, plan, health, family]

Format your response as JSON:
{
  "actions": [
    {
      "title": "Action title",
      "rationale": "Why this matters",
      "priority": "high|medium|low",
      "type": "research|execute|analyze|communicate|plan|health|family"
    }
  ],
  "summary": "One sentence overview of the recommendations"
}

Only suggest actions that are genuinely useful based on the data. If there's nothing pressing, return fewer actions or explain why.`;

      this.addToThread("user", prompt);

      // Get AI response - try OpenAI first, fallback to Claude
      const config = getMultiAIConfig();
      let aiResponse = null;

      try {
        const result = await sendMessage(prompt, {
          systemPrompt: this.buildSystemPrompt(context),
          ...context
        }, TASK_TYPES.COMPLEX);
        aiResponse = result.response;
      } catch (openaiError) {
        // If OpenAI fails, try Claude as fallback
        if (config.claude.ready) {
          console.log("OpenAI failed for actions, falling back to Claude:", openaiError.message);
          aiResponse = await sendToClaude(
            `${this.buildSystemPrompt(context)}\n\n${prompt}`,
            context
          );
        } else {
          throw openaiError;
        }
      }

      let actions = [];
      let summary = "";

      // Parse JSON response
      try {
        // Extract JSON from response (handle markdown code blocks)
        let jsonStr = aiResponse;
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }

        const parsed = JSON.parse(jsonStr);
        actions = parsed.actions || [];
        summary = parsed.summary || "";
      } catch (parseError) {
        // If JSON parsing fails, the AI gave a text response
        summary = aiResponse;
      }

      this.addToThread("assistant", aiResponse);

      this.emit("actions-generated", { actions, summary });

      return {
        success: true,
        actions,
        summary,
        model: "AI"
      };

    } catch (error) {
      this.emit("thinking-error", error);
      return {
        success: false,
        error: error.message,
        actions: []
      };
    } finally {
      this.isThinking = false;
      this.emit("thinking-end");
    }
  }

  /**
   * Ask the brain a specific question
   */
  async ask(question) {
    return this.think(question);
  }

  /**
   * Get the current state for display
   */
  getDisplayData() {
    return {
      isThinking: this.isThinking,
      lastThought: this.lastThought,
      threadLength: this.thread.messages.length,
      totalMessages: this.thread.totalMessages,
      lastUpdated: this.thread.lastUpdated
    };
  }

  /**
   * Get recent thread messages
   */
  getRecentMessages(count = 10) {
    return this.thread.messages.slice(-count);
  }

  /**
   * Clear the thread (reset memory)
   */
  clearThread() {
    this.thread = {
      messages: [],
      summary: null,
      lastUpdated: null,
      totalMessages: 0
    };
    this.saveThread();
    this.emit("thread-cleared");
  }
}

// Singleton
let instance = null;

export const getAIBrain = () => {
  if (!instance) {
    instance = new AIBrain();
  }
  return instance;
};

export default AIBrain;
