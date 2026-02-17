/**
 * Startup Agent — State machine for managing startup ideas
 *
 * Tracks multiple startup/business ideas through phases:
 *   Discovery → Validation → Design → Build → Launch → Mature
 *
 * Each idea has graduation criteria. The agent advances ideas
 * through phases when criteria are met, and kills ideas that
 * fail validation.
 *
 * State is persisted to the agent's memory directory.
 */

import fs from "fs";
import path from "path";
import { getAgentMemoryDir } from "./agent-loader.js";

const AGENT_ID = "startup-agent";

const PHASES = {
  DISCOVERY: { order: 1, label: "Discovery", next: "VALIDATION" },
  VALIDATION: { order: 2, label: "Validation", next: "DESIGN" },
  DESIGN: { order: 3, label: "Design", next: "BUILD" },
  BUILD: { order: 4, label: "Build", next: "LAUNCH" },
  LAUNCH: { order: 5, label: "Launch", next: "MATURE" },
  MATURE: { order: 6, label: "Mature", next: null },
};

/**
 * Load startup state from agent memory.
 */
export function loadState() {
  const stateFile = path.join(getAgentMemoryDir(AGENT_ID), "state.json");
  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    }
  } catch {}
  return { ideas: [], archivedIdeas: [], lastUpdated: null };
}

/**
 * Save startup state to agent memory.
 */
export function saveState(state) {
  const memDir = getAgentMemoryDir(AGENT_ID);
  const stateFile = path.join(memDir, "state.json");
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Add a new startup idea in DISCOVERY phase.
 */
export function addIdea(title, description) {
  const state = loadState();
  const id = `idea_${Date.now()}`;
  state.ideas.push({
    id,
    title,
    description,
    phase: "DISCOVERY",
    score: null,
    createdAt: new Date().toISOString(),
    phaseHistory: [{ phase: "DISCOVERY", enteredAt: new Date().toISOString() }],
    notes: [],
  });
  saveState(state);
  return id;
}

/**
 * Graduate an idea to its next phase.
 */
export function graduateIdea(ideaId, evidence) {
  const state = loadState();
  const idea = state.ideas.find(i => i.id === ideaId);
  if (!idea) return false;

  const currentPhase = PHASES[idea.phase];
  if (!currentPhase || !currentPhase.next) return false;

  idea.phase = currentPhase.next;
  idea.phaseHistory.push({
    phase: currentPhase.next,
    enteredAt: new Date().toISOString(),
    evidence,
  });
  saveState(state);
  return true;
}

/**
 * Kill an idea (move to archive with reason).
 */
export function killIdea(ideaId, reason) {
  const state = loadState();
  const idx = state.ideas.findIndex(i => i.id === ideaId);
  if (idx === -1) return false;

  const idea = state.ideas.splice(idx, 1)[0];
  idea.killedAt = new Date().toISOString();
  idea.killReason = reason;
  state.archivedIdeas.push(idea);
  saveState(state);
  return true;
}

/**
 * Get active ideas, optionally filtered by phase.
 */
export function getIdeas(phase = null) {
  const state = loadState();
  if (phase) return state.ideas.filter(i => i.phase === phase);
  return state.ideas;
}

/**
 * Get the next action for the startup agent based on current state.
 * Returns a prompt fragment to guide the engine.
 */
export function getNextAction() {
  const state = loadState();

  // No ideas yet — discovery mode
  if (state.ideas.length === 0) {
    return {
      action: "discover",
      prompt: "No startup ideas yet. Research emerging markets, unmet needs, and technology trends to generate 3-5 startup idea candidates. Save each via the startup agent state.",
    };
  }

  // Find the most advanced idea
  const sorted = [...state.ideas].sort((a, b) => {
    return (PHASES[b.phase]?.order || 0) - (PHASES[a.phase]?.order || 0);
  });

  const lead = sorted[0];
  const phase = PHASES[lead.phase];

  return {
    action: "advance",
    ideaId: lead.id,
    idea: lead.title,
    phase: lead.phase,
    prompt: `Focus on startup idea "${lead.title}" currently in ${phase.label} phase. Work on graduation criteria for this phase. Log findings to the startup agent journal.`,
  };
}

/**
 * Append a journal entry for the startup agent.
 */
export function appendJournal(entry) {
  const memDir = getAgentMemoryDir(AGENT_ID);
  const journalFile = path.join(memDir, "journal.md");
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const line = `\n## ${timestamp}\n${entry}\n`;
  fs.appendFileSync(journalFile, line);
}
