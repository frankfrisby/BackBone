/**
 * Intel Sweep — Periodic Background Intelligence Gathering
 *
 * Runs 3x/day via proactive scheduler. Does NOT send messages.
 * Searches the web for news/updates relevant to the user's:
 *   - Portfolio positions (earnings, SEC filings, price moves)
 *   - Active goals (relevant developments)
 *   - Core beliefs (macro trends, industry shifts)
 *   - Tracked tickers (score-affecting events)
 *
 * Writes findings to data/intel-sweep.json so the autonomous engine's
 * change detection picks up new intel and can act on it.
 */

import fs from "fs";
import path from "path";
import { getDataDir, getMemoryDir, dataFile } from "../paths.js";

const TAG = "[IntelSweep]";
const INTEL_FILE = dataFile("intel-sweep.json");
const MAX_FINDINGS = 50; // Rolling buffer

/**
 * Read current intel state
 */
function loadIntel() {
  try {
    return JSON.parse(fs.readFileSync(INTEL_FILE, "utf-8"));
  } catch {
    return { findings: [], lastSweep: null, sweepCount: 0 };
  }
}

/**
 * Save intel state
 */
function saveIntel(intel) {
  // Keep only the most recent findings
  if (intel.findings.length > MAX_FINDINGS) {
    intel.findings = intel.findings.slice(-MAX_FINDINGS);
  }
  fs.writeFileSync(INTEL_FILE, JSON.stringify(intel, null, 2));
}

/**
 * Gather search topics from user's current context
 */
function gatherSearchTopics() {
  const dataDir = getDataDir();
  const memoryDir = getMemoryDir();
  const topics = [];

  // 1. Portfolio positions — check for news on holdings
  try {
    const alpaca = JSON.parse(fs.readFileSync(path.join(dataDir, "alpaca-cache.json"), "utf-8"));
    const symbols = (alpaca.positions || []).map(p => p.symbol).filter(Boolean);
    if (symbols.length > 0) {
      // Pick top 3 by absolute P&L (most impactful positions)
      const sorted = (alpaca.positions || [])
        .filter(p => p.symbol)
        .sort((a, b) => Math.abs(parseFloat(b.market_value || 0)) - Math.abs(parseFloat(a.market_value || 0)))
        .slice(0, 3);
      for (const pos of sorted) {
        topics.push({
          type: "portfolio",
          query: `${pos.symbol} stock news today`,
          symbol: pos.symbol,
          context: `Position: ${pos.qty} shares, P&L: $${pos.unrealized_pl}`
        });
      }
    }
  } catch {}

  // 2. Tracked tickers with high scores — watch for catalysts
  try {
    const tickers = JSON.parse(fs.readFileSync(path.join(dataDir, "tickers-cache.json"), "utf-8"));
    const topTickers = (tickers.tickers || [])
      .sort((a, b) => (b.effectiveScore || b.score || 0) - (a.effectiveScore || a.score || 0))
      .slice(0, 3);
    for (const t of topTickers) {
      // Skip if already covered by portfolio
      if (topics.some(tp => tp.symbol === t.symbol)) continue;
      topics.push({
        type: "watchlist",
        query: `${t.symbol} stock catalyst news earnings`,
        symbol: t.symbol,
        context: `Score: ${(t.effectiveScore || t.score || 0).toFixed(1)}/10`
      });
    }
  } catch {}

  // 3. Active goals — search for relevant developments
  try {
    const goalsRaw = JSON.parse(fs.readFileSync(path.join(dataDir, "goals.json"), "utf-8"));
    const goals = Array.isArray(goalsRaw) ? goalsRaw : (goalsRaw?.goals || []);
    const active = goals.filter(g => g.status === "active" || g.status === "in_progress").slice(0, 2);
    for (const goal of active) {
      if (goal.title && goal.title.length > 10) {
        topics.push({
          type: "goal",
          query: goal.title,
          goalId: goal.id,
          context: `Progress: ${goal.progress || 0}%`
        });
      }
    }
  } catch {}

  // 4. Core beliefs — macro trends
  try {
    const beliefs = JSON.parse(fs.readFileSync(path.join(dataDir, "core-beliefs.json"), "utf-8"));
    const beliefList = Array.isArray(beliefs) ? beliefs : (beliefs?.beliefs || []);
    // Pick one belief per sweep (rotate)
    const intel = loadIntel();
    const beliefIndex = (intel.sweepCount || 0) % Math.max(beliefList.length, 1);
    const belief = beliefList[beliefIndex];
    if (belief) {
      const name = belief.name || belief.title || belief;
      topics.push({
        type: "belief",
        query: `${name} trends news 2026`,
        beliefName: name,
        context: "Core belief monitoring"
      });
    }
  } catch {}

  // 5. Thesis focus — if user has a current thesis, search for it
  try {
    const thesis = fs.readFileSync(path.join(memoryDir, "thesis.md"), "utf-8").trim();
    if (thesis.length > 20) {
      // Extract the first meaningful line as a search topic
      const firstLine = thesis.split("\n").find(l => l.trim() && !l.startsWith("#"))?.trim();
      if (firstLine && firstLine.length > 10) {
        topics.push({
          type: "thesis",
          query: firstLine.slice(0, 100),
          context: "Current thesis focus"
        });
      }
    }
  } catch {}

  return topics;
}

/**
 * Run a single intel sweep cycle.
 * Uses Claude Code CLI to do web searches and extract findings.
 *
 * @returns {{ success: boolean, findingsCount: number, topics: number }}
 */
export async function runIntelSweep() {
  const topics = gatherSearchTopics();
  if (topics.length === 0) {
    console.log(`${TAG} No topics to search — skipping`);
    return { success: true, findingsCount: 0, topics: 0, skipped: true };
  }

  console.log(`${TAG} Starting sweep with ${topics.length} topics`);

  // Limit to 5 topics per sweep to conserve tokens
  const selectedTopics = topics.slice(0, 5);

  // Build a focused prompt for Claude CLI — it has WebSearch access
  const topicList = selectedTopics
    .map((t, i) => `${i + 1}. [${t.type}] "${t.query}" (${t.context})`)
    .join("\n");

  const prompt = `You are BACKBONE's intel sweep agent. Your job: search the web for each topic below, extract key findings, and write them to a JSON file.

TOPICS TO RESEARCH:
${topicList}

INSTRUCTIONS:
1. For each topic, use WebSearch to find the latest news/developments
2. Extract only genuinely NEW or ACTIONABLE information (price targets, earnings dates, regulatory changes, deadlines)
3. Skip generic fluff — if there's nothing new, say so
4. Write your findings as JSON to: ${INTEL_FILE}

The JSON format:
{
  "findings": [
    {
      "topic": "topic type",
      "query": "what was searched",
      "symbol": "TICKER if applicable",
      "headline": "one-line summary",
      "detail": "2-3 sentences of key info",
      "actionable": true/false,
      "urgency": "high/medium/low",
      "timestamp": "${new Date().toISOString()}"
    }
  ],
  "lastSweep": "${new Date().toISOString()}",
  "sweepCount": ${(loadIntel().sweepCount || 0) + 1}
}

IMPORTANT:
- Merge with existing findings (read the file first if it exists)
- Keep total findings under ${MAX_FINDINGS} (drop oldest)
- Be efficient — short searches, extract key facts, move on
- If a search returns nothing new, add a finding with actionable: false
- Do NOT send any messages — just update the JSON file silently`;

  try {
    const { runClaudeCodePrompt } = await import("../ai/claude-code-cli.js");
    const result = await runClaudeCodePrompt(prompt, {
      timeout: 300_000, // 5 min max
      workDir: process.cwd()
    });

    if (result.success) {
      // Read back what was written
      const intel = loadIntel();
      const newFindings = intel.findings?.filter(f =>
        f.timestamp && (Date.now() - new Date(f.timestamp).getTime()) < 10 * 60 * 1000
      ).length || 0;

      console.log(`${TAG} Sweep complete: ${newFindings} new findings from ${selectedTopics.length} topics`);
      return { success: true, findingsCount: newFindings, topics: selectedTopics.length };
    } else {
      console.log(`${TAG} CLI returned error:`, result.error?.slice(0, 200));
      return { success: false, error: result.error?.slice(0, 200), topics: selectedTopics.length };
    }
  } catch (err) {
    console.error(`${TAG} Sweep failed:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get latest intel findings (for engine or UI consumption)
 */
export function getLatestIntel(maxAge = 24 * 60 * 60 * 1000) {
  const intel = loadIntel();
  const cutoff = Date.now() - maxAge;
  return {
    ...intel,
    findings: (intel.findings || []).filter(f =>
      f.timestamp && new Date(f.timestamp).getTime() > cutoff
    )
  };
}

/**
 * Get actionable findings only
 */
export function getActionableIntel() {
  const intel = getLatestIntel();
  return intel.findings.filter(f => f.actionable);
}
