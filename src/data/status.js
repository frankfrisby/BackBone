export const buildStatusMessage = (alpacaStatus, integrations) => {
  const actionMap = {
    "Missing keys": "Type → /alpaca to connect to Alpaca.",
    Offline: "Type → /alpaca to reconnect Alpaca.",
    "Quote error": "Type → /alpaca to verify Alpaca data access.",
    "Score error": "Type → /alpaca to verify Alpaca data access."
  };

  const connectionCommands = {
    Claude: "Type → /model to connect an LLM",
    LinkedIn: "Type → /linkedin to connect LinkedIn",
    Oura: "Type → /oura to connect Oura",
    Alpaca: "Type → /alpaca to connect Alpaca"
  };

  const missing = Object.entries(integrations)
    .filter(([, status]) => status === "Missing" || status === "Offline")
    .map(([name]) => name);

  const base = actionMap[alpacaStatus] || "";

  // Build connection prompts for missing integrations
  const prompts = missing
    .filter(name => connectionCommands[name])
    .map(name => connectionCommands[name])
    .slice(0, 2) // Limit to 2 prompts to avoid clutter
    .join(". ");

  if (!base && !prompts) {
    return "All integrations connected.";
  }

  return [base, prompts].filter(Boolean).join(" ");
};