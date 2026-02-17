/**
 * Agent Dispatcher — Matches goals to specialized agents
 *
 * When the engine picks a goal, the dispatcher finds the best agent
 * to handle it based on:
 *   1. Explicit goal.agentId (set by thinking engine)
 *   2. Agent's goalCategories matching goal.category
 *   3. Agent's keywords found in goal title/description
 *   4. Falls back to null (generic engine execution)
 *
 * The matched agent's IDENTITY.md is injected into the Claude prompt,
 * giving it domain-specific context, personality, and instructions.
 */

import { discoverAgents, getAgent } from "./agent-loader.js";

/**
 * Match a goal to the best agent.
 *
 * @param {Object} goal - Goal with title, description, category, agentId
 * @returns {{ id: string, identity: string, config: object } | null}
 */
export function matchGoalToAgent(goal) {
  if (!goal) return null;

  // Priority 1: Explicit agentId on the goal
  if (goal.agentId) {
    const agent = getAgent(goal.agentId);
    if (agent && agent.identity) return agent;
  }

  const agents = discoverAgents().filter(a => a.identity && a.config.goalCategories);
  if (agents.length === 0) return null;

  const goalCategory = (goal.category || "").toLowerCase();
  const goalText = `${goal.title || ""} ${goal.description || ""}`.toLowerCase();

  let bestAgent = null;
  let bestScore = 0;

  for (const agent of agents) {
    const categories = (agent.config.goalCategories || []).map(c => c.toLowerCase());
    const keywords = (agent.config.keywords || []).map(k => k.toLowerCase());

    let score = 0;

    // Category match = base score of 10
    if (goalCategory && categories.includes(goalCategory)) {
      score += 10;
    }

    // Keyword matches — each hit adds 5
    for (const kw of keywords) {
      if (goalText.includes(kw)) {
        score += 5;
      }
    }

    // Must have at least a category match OR 2+ keyword matches
    if (score >= 10 && score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  return bestAgent;
}

/**
 * Get a summary of all agents with their domains.
 * Used by the thinking engine to tag goals with agentId.
 */
export function getAgentCatalog() {
  const agents = discoverAgents().filter(a => a.config.goalCategories);
  return agents.map(a => ({
    id: a.id,
    categories: a.config.goalCategories || [],
    keywords: a.config.keywords || [],
    schedule: a.config.schedule,
    type: a.config.type,
  }));
}
