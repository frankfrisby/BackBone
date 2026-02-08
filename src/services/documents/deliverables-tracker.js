/**
 * Deliverables Tracker — Tracks what each project should produce,
 * what's been produced, and what's pending. The engine uses this
 * to know what tangible outputs to create for every project.
 *
 * Every project MUST produce deliverables. No more hidden markdown.
 */
import fs from "fs";
import path from "path";
import { getDataDir } from "../paths.js";

const DATA_DIR = getDataDir();
const DELIVERABLES_FILE = path.join(DATA_DIR, "deliverables.json");

function load() {
  if (!fs.existsSync(DELIVERABLES_FILE)) return { version: "1.0", projects: {}, stats: {} };
  return JSON.parse(fs.readFileSync(DELIVERABLES_FILE, "utf8"));
}

function save(data) {
  data.lastUpdated = new Date().toISOString();
  // Recompute stats
  let total = 0, produced = 0, pending = 0;
  for (const proj of Object.values(data.projects)) {
    for (const d of proj.deliverables || []) {
      total++;
      if (d.status === "produced") produced++;
      else pending++;
    }
  }
  data.stats = { totalDeliverables: total, produced, pending, lastProduced: new Date().toISOString().split("T")[0] };
  fs.writeFileSync(DELIVERABLES_FILE, JSON.stringify(data, null, 2));
}

/**
 * Get all deliverables across all projects.
 */
export function getAllDeliverables() {
  const data = load();
  const all = [];
  for (const [projectId, proj] of Object.entries(data.projects)) {
    for (const d of proj.deliverables || []) {
      all.push({ ...d, projectId, projectTitle: proj.title });
    }
  }
  return all;
}

/**
 * Get deliverables for a specific project.
 */
export function getProjectDeliverables(projectId) {
  const data = load();
  return data.projects[projectId] || null;
}

/**
 * Get all pending deliverables (things that need to be produced).
 */
export function getPendingDeliverables() {
  return getAllDeliverables().filter(d => d.status === "pending");
}

/**
 * Get all produced deliverables with file paths.
 */
export function getProducedDeliverables() {
  return getAllDeliverables().filter(d => d.status === "produced");
}

/**
 * Mark a deliverable as produced.
 */
export function markProduced(deliverableId, filePath) {
  const data = load();
  for (const proj of Object.values(data.projects)) {
    for (const d of proj.deliverables || []) {
      if (d.id === deliverableId) {
        d.status = "produced";
        d.file = filePath;
        d.producedAt = new Date().toISOString();
        save(data);
        return true;
      }
    }
  }
  return false;
}

/**
 * Add a new deliverable to a project.
 */
export function addDeliverable(projectId, { type, name, description }) {
  const data = load();
  if (!data.projects[projectId]) {
    data.projects[projectId] = { title: projectId, status: "active", deliverables: [] };
  }
  const id = `${projectId.substring(0, 3)}-${data.projects[projectId].deliverables.length + 1}`;
  const deliverable = { id, type, name, description, status: "pending", file: null };
  data.projects[projectId].deliverables.push(deliverable);
  save(data);
  return deliverable;
}

/**
 * Register a project with its expected deliverables.
 */
export function registerProject(projectId, { title, status = "active", deliverables = [] }) {
  const data = load();
  data.projects[projectId] = {
    title,
    status,
    deliverables: deliverables.map((d, i) => ({
      id: d.id || `${projectId.substring(0, 3)}-${i + 1}`,
      type: d.type,
      name: d.name,
      description: d.description,
      status: d.status || "pending",
      file: d.file || null,
      producedAt: d.producedAt || null
    }))
  };
  save(data);
}

/**
 * Get a summary suitable for display or WhatsApp notification.
 */
export function getDeliverablesSummary() {
  const data = load();
  const lines = ["DELIVERABLES STATUS"];
  lines.push(`Total: ${data.stats?.totalDeliverables || 0} | Produced: ${data.stats?.produced || 0} | Pending: ${data.stats?.pending || 0}`);
  lines.push("");

  for (const [id, proj] of Object.entries(data.projects)) {
    const produced = (proj.deliverables || []).filter(d => d.status === "produced").length;
    const total = (proj.deliverables || []).length;
    const pct = total > 0 ? Math.round((produced / total) * 100) : 0;
    lines.push(`${proj.title} [${produced}/${total}] ${pct}%`);

    for (const d of proj.deliverables || []) {
      const icon = d.status === "produced" ? "[DONE]" : "[TODO]";
      const typeTag = d.type.toUpperCase();
      lines.push(`  ${icon} ${typeTag}: ${d.name} — ${d.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Determine what deliverable type(s) a project should produce
 * based on its category and nature.
 */
export function suggestDeliverables(projectType) {
  const templates = {
    research: [
      { type: "pdf", name: "research-report", description: "Research findings report with analysis" },
      { type: "excel", name: "data-analysis", description: "Data tables and analysis spreadsheet" }
    ],
    financial: [
      { type: "excel", name: "financial-model", description: "Financial projections and scenarios" },
      { type: "pdf", name: "performance-report", description: "Performance summary and outlook" },
      { type: "pptx", name: "strategy-deck", description: "Investment/income strategy presentation" }
    ],
    product: [
      { type: "word", name: "product-spec", description: "Product specification document" },
      { type: "pptx", name: "pitch-deck", description: "Product pitch presentation" },
      { type: "excel", name: "competitive-analysis", description: "Competitive landscape analysis" }
    ],
    health: [
      { type: "excel", name: "health-tracker", description: "Health metrics tracking spreadsheet" },
      { type: "pdf", name: "health-report", description: "Health status and optimization report" }
    ],
    planning: [
      { type: "excel", name: "risk-matrix", description: "Risk assessment matrix" },
      { type: "pdf", name: "action-plan", description: "Action plan with protocols" },
      { type: "word", name: "protocols", description: "Detailed action protocols document" }
    ],
    learning: [
      { type: "excel", name: "progress-tracker", description: "Learning progress tracking spreadsheet" },
      { type: "word", name: "study-notes", description: "Compiled study notes and exercises" }
    ]
  };
  return templates[projectType] || templates.research;
}

export default {
  getAllDeliverables,
  getProjectDeliverables,
  getPendingDeliverables,
  getProducedDeliverables,
  markProduced,
  addDeliverable,
  registerProject,
  getDeliverablesSummary,
  suggestDeliverables
};
