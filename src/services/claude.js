import Anthropic from "@anthropic-ai/sdk";

let client = null;

export const getClaudeConfig = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  return {
    ready: Boolean(apiKey),
    apiKey
  };
};

const getClient = () => {
  if (!client) {
    const config = getClaudeConfig();
    if (!config.ready) {
      return null;
    }
    client = new Anthropic({ apiKey: config.apiKey });
  }
  return client;
};

const SYSTEM_PROMPT = `You are BackBone, an AI life assistant that helps users optimize their life across multiple domains: health, work, finance, family, growth, and personal goals.

You have access to the user's:
- Portfolio and trading data (Alpaca integration)
- Life goals and progress tracking
- Calendar and scheduling (when connected)
- Email summaries (when connected)

Your role is to:
1. Provide actionable insights and recommendations
2. Help prioritize tasks and goals
3. Offer strategic advice on life decisions
4. Track progress and celebrate wins
5. Identify patterns and opportunities

Be concise, direct, and actionable. Format responses for terminal display (no markdown headers, use bullet points sparingly).`;

export const sendMessage = async (message, context = {}) => {
  const anthropic = getClient();
  if (!anthropic) {
    return {
      success: false,
      error: "Missing API key. Set ANTHROPIC_API_KEY in .env"
    };
  }

  try {
    const contextStr = Object.entries(context)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n");

    const userMessage = contextStr
      ? `Context:\n${contextStr}\n\nUser: ${message}`
      : message;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }]
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return {
      success: true,
      message: text,
      usage: {
        input: response.usage?.input_tokens || 0,
        output: response.usage?.output_tokens || 0
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || "Failed to get response from Claude"
    };
  }
};

export const streamMessage = async (message, onChunk, context = {}) => {
  const anthropic = getClient();
  if (!anthropic) {
    onChunk({ type: "error", error: "Missing API key" });
    return;
  }

  try {
    const contextStr = Object.entries(context)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n");

    const userMessage = contextStr
      ? `Context:\n${contextStr}\n\nUser: ${message}`
      : message;

    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }]
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta?.text) {
        onChunk({ type: "text", text: event.delta.text });
      }
    }

    onChunk({ type: "done" });
  } catch (error) {
    onChunk({ type: "error", error: error.message });
  }
};
