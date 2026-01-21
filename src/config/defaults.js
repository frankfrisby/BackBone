export const DEFAULTS = {
  trading: {
    mode: "swing",
    maxTrades: 2,
    maxAllocationPct: 95,
    requiresOptionsEnabled: true
  },
  models: {
    selected: "gpt-5",
    url: "https://platform.openai.com/docs/models",
    prompt: "Please set your OpenCode model to GPT-5 or later."
  },
  alpaca: {
    environment: "live",
    apiUrl: "https://api.alpaca.markets"
  }
};
