/**
 * Task Pipeline — Stage-based execution tracking with delivery actions
 *
 * Stages: intake → planning → executing → delivering → done
 * Sends WhatsApp notifications on stage transitions (max 3 per goal).
 * Detects delivery intent: "email me" → email, "write a report" → document, default → WhatsApp.
 */

import fs from "fs";
import path from "path";
import { getDataDir, dataFile } from "../paths.js";
import { notifyProgress, sendWhatsApp } from "../messaging/proactive-outreach.js";

const PIPELINE_FILE = dataFile("task-pipelines.json");

const STAGES = ["intake", "planning", "executing", "delivering", "done"];

const DELIVERY_PATTERNS = [
  { pattern: /\bemail\s+(?:me|it|that|the|a|this)\b/i, action: "email" },
  { pattern: /\bsend\s+(?:me\s+)?(?:an?\s+)?email\b/i, action: "email" },
  { pattern: /\bwrite\s+(?:a\s+)?(?:report|document|doc|pdf|word)\b/i, action: "document" },
  { pattern: /\bcreate\s+(?:a\s+)?(?:report|document|pdf|presentation|spreadsheet)\b/i, action: "document" },
  { pattern: /\btext\s+me\b/i, action: "whatsapp" },
  { pattern: /\bmessage\s+me\b/i, action: "whatsapp" },
];

/**
 * Detect delivery action from user message text
 */
export function detectDeliveryAction(message) {
  if (!message) return "whatsapp"; // default
  for (const { pattern, action } of DELIVERY_PATTERNS) {
    if (pattern.test(message)) return action;
  }
  return "whatsapp";
}

/**
 * Load all pipelines from disk
 */
function loadPipelines() {
  try {
    if (fs.existsSync(PIPELINE_FILE)) {
      return JSON.parse(fs.readFileSync(PIPELINE_FILE, "utf8"));
    }
  } catch {}
  return {};
}

/**
 * Save pipelines to disk
 */
function savePipelines(pipelines) {
  try {
    fs.writeFileSync(PIPELINE_FILE, JSON.stringify(pipelines, null, 2));
  } catch (err) {
    console.error("[TaskPipeline] Save error:", err.message);
  }
}

/**
 * Create a pipeline for a goal
 */
export function createPipeline(goalId, { title, deliveryAction = "whatsapp", source = "unknown" } = {}) {
  const pipelines = loadPipelines();
  pipelines[goalId] = {
    goalId,
    title: title || goalId,
    stage: "intake",
    deliveryAction,
    source,
    notificationCount: 0,
    createdAt: new Date().toISOString(),
    stageHistory: [{ stage: "intake", at: new Date().toISOString() }],
  };
  savePipelines(pipelines);
  return pipelines[goalId];
}

/**
 * Advance a pipeline to the next stage (or a specific stage)
 * Sends WhatsApp notification on meaningful transitions (max 3 per goal)
 */
export async function advancePipeline(goalId, targetStage = null) {
  const pipelines = loadPipelines();
  const pipeline = pipelines[goalId];
  if (!pipeline) return null;

  const currentIdx = STAGES.indexOf(pipeline.stage);
  const targetIdx = targetStage ? STAGES.indexOf(targetStage) : currentIdx + 1;

  if (targetIdx <= currentIdx || targetIdx >= STAGES.length) return pipeline;

  const newStage = STAGES[targetIdx];
  pipeline.stage = newStage;
  pipeline.stageHistory.push({ stage: newStage, at: new Date().toISOString() });

  // Send WhatsApp notification on key transitions (max 3)
  if (pipeline.notificationCount < 3) {
    const messages = {
      planning: null, // silent
      executing: `Started working on: *${pipeline.title}*`,
      delivering: `Wrapping up: *${pipeline.title}* — preparing delivery...`,
      done: null, // handled by completeCurrentGoal
    };

    const msg = messages[newStage];
    if (msg) {
      pipeline.notificationCount++;
      notifyProgress(pipeline.title, msg, { trigger: `pipeline-${newStage}` }).catch(() => {});
    }
  }

  savePipelines(pipelines);
  return pipeline;
}

/**
 * Get pipeline for a goal
 */
export function getPipeline(goalId) {
  const pipelines = loadPipelines();
  return pipelines[goalId] || null;
}

/**
 * Get delivery action for a goal
 */
export function getDeliveryAction(goalId) {
  const pipeline = getPipeline(goalId);
  return pipeline?.deliveryAction || "whatsapp";
}

/**
 * Clean up completed pipelines older than 7 days
 */
export function cleanOldPipelines() {
  const pipelines = loadPipelines();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let changed = false;
  for (const [id, p] of Object.entries(pipelines)) {
    if (p.stage === "done" && new Date(p.createdAt).getTime() < cutoff) {
      delete pipelines[id];
      changed = true;
    }
  }
  if (changed) savePipelines(pipelines);
}
