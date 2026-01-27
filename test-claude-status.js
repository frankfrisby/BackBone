import { getClaudeCodeStatus } from "./src/services/claude-code-cli.js";

const status = await getClaudeCodeStatus();
console.log("Claude Code Status:", JSON.stringify(status, null, 2));
console.log(`\nready: ${status.ready}`);
if (!status.ready) {
  console.log(`  installed: ${status.installed}`);
  console.log(`  loggedIn: ${status.loggedIn}`);
  if (!status.installed) console.log("  ❌ Claude Code CLI not found on PATH");
  if (!status.loggedIn) console.log("  ❌ Not logged in - auth files not found");
}
