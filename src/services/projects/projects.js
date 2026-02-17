import fs from "fs";
import path from "path";

import { getProjectsDir } from "../paths.js";
const PROJECTS_DIR = getProjectsDir();
const PROJECT_RESEARCH_FILE = "research.json";

const ensureProjectsDir = () => {
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  }
  return PROJECTS_DIR;
};

const normalizeName = (rawName) => {
  if (!rawName) return null;
  const cleaned = rawName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  if (cleaned === cleaned.toLowerCase()) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
};

const MAX_PROJECT_WORDS = 5;

const countWords = (value) => value.split(/\s+/).filter(Boolean);

const isWithinProjectWordLimit = (name) => countWords(name).length <= MAX_PROJECT_WORDS;

const slugifyName = (name) =>
  name
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const formatDateSegment = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}_${month}_${day}`;
};

const formatDisplayDate = (date) =>
  date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });

const formatLogDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildProjectDisplayName = (name, date = new Date()) => `${name} (${formatDisplayDate(date)})`;

export const formatProjectFolderName = (rawName, date = new Date()) => {
  const name = normalizeName(rawName);
  if (!name || !isWithinProjectWordLimit(name)) return null;
  const slug = slugifyName(name);
  if (!slug) return null;
  return `${formatDateSegment(date)}__${slug}`;
};

const parseProjectFolderName = (folderName) => {
  const [datePart, slugPart] = folderName.split("__");
  if (!datePart || !slugPart) return null;

  const datePieces = datePart.split("_").map(Number);
  if (datePieces.length !== 3) return null;

  const [year, month, day] = datePieces;
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;

  const title = normalizeName(slugPart.replace(/_/g, " "));
  if (!title) return null;

  return {
    id: folderName,
    name: title,
    date,
    displayName: buildProjectDisplayName(title, date)
  };
};

const listProjectFolders = () => {
  ensureProjectsDir();
  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
};

const findProjectBySlug = (slug) => {
  const projects = listProjects();
  const normalizedSlug = slug.toLowerCase();
  return (
    projects.find((project) => slugifyName(project.name).toLowerCase() === normalizedSlug) ||
    null
  );
};

const resolveProject = (projectId) => {
  if (!projectId) return null;

  const directPath = path.join(PROJECTS_DIR, projectId);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
    const parsed = parseProjectFolderName(projectId);
    return {
      ...(parsed || { id: projectId, name: projectId, displayName: projectId, date: new Date() }),
      path: directPath
    };
  }

  const normalized = normalizeName(projectId);
  if (!normalized) return null;

  const slug = slugifyName(normalized);
  if (!slug) return null;

  return findProjectBySlug(slug);
};

export const appendProjectResearch = (projectId, entry) => {
  const resolved = resolveProject(projectId);
  if (!resolved?.path) {
    return { success: false, error: "Project not found" };
  }
  const researchPath = path.join(resolved.path, PROJECT_RESEARCH_FILE);
  const payload = {
    ...entry,
    savedAt: new Date().toISOString()
  };
  try {
    let data = [];
    if (fs.existsSync(researchPath)) {
      data = JSON.parse(fs.readFileSync(researchPath, "utf-8"));
      if (!Array.isArray(data)) data = [];
    }
    data.unshift(payload);
    data = data.slice(0, 100);
    fs.writeFileSync(researchPath, JSON.stringify(data, null, 2));
    return { success: true, path: researchPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const buildGoalsTemplate = (name, displayDate) => `# Goals

Project: ${name}
Created: ${displayDate}

## Sections
- Objectives: outcomes this project should deliver.
- Success Criteria: checkpoints that define done.
- Constraints: limits, risks, or dependencies.
- Notes: supporting context and references.

## Objectives
Describe the primary outcomes for this project.

## Success Criteria
Define how success will be measured.

## Constraints
List limits, risks, or dependencies to track.

## Notes
Capture background context or helpful links.
`;

const buildWorkTemplate = (name, displayDate, sourceLabel, initialMessage) => {
  const logDate = formatLogDate(new Date());
  const sourceTag = sourceLabel ? ` (${sourceLabel})` : "";
  const updateLines = [
    `- ${logDate}: Project created${sourceTag}.`,
    initialMessage ? `- ${logDate}: ${initialMessage}` : null
  ].filter(Boolean).join("\n");

  return `# Work Log

Project: ${name}
Created: ${displayDate}

## Sections
- Updates: timeline of completed work.
- Actions: active tasks and next steps.
- Output: main deliverables produced.
- Notes: context, links, or follow-ups.

## Updates
${updateLines}

## Actions
Capture planned or in-flight actions here.

## Output
Add the main deliverables and summaries here.

## Notes
Capture context, links, or follow-ups here.
`;
};

const buildActionTemplate = (projectName, actionName, displayDate, index) => `# Action ${index}: ${actionName}

Project: ${projectName}
Created: ${displayDate}
Status: Planned

## Sections
- Goal: what this action should accomplish.
- Work: steps taken or plan of record.
- Output: artifacts produced.
- Notes: follow-ups and context.

## Goal
Define the action outcome.

## Work
Detail the steps taken or planned.

## Output
Add results, links, or files here.

## Notes
Capture follow-ups and context here.
`;

const getNextActionIndex = (projectPath) => {
  const actionDirs = fs
    .readdirSync(projectPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("action_"))
    .map((entry) => entry.name);

  const indices = actionDirs
    .map((name) => {
      const match = name.match(/^action_(\d+)/);
      return match ? Number.parseInt(match[1], 10) : null;
    })
    .filter((value) => Number.isFinite(value));

  return indices.length > 0 ? Math.max(...indices) + 1 : 1;
};

export const listProjects = () => {
  const folders = listProjectFolders();
  return folders
    .map((folder) => parseProjectFolderName(folder))
    .filter(Boolean)
    .map((project) => ({
      ...project,
      path: path.join(PROJECTS_DIR, project.id)
    }))
    .sort((a, b) => b.date - a.date);
};

export const createProject = (rawName, { source = "manual", createdAt = new Date(), initialMessage = null } = {}) => {
  const name = normalizeName(rawName);
  if (!name) {
    return { success: false, error: "Project name is required." };
  }
  if (!isWithinProjectWordLimit(name)) {
    return { success: false, error: `Project name must be ${MAX_PROJECT_WORDS} words or fewer.` };
  }

  const slug = slugifyName(name);
  if (!slug) {
    return { success: false, error: "Project name is required." };
  }

  ensureProjectsDir();

  const existing = findProjectBySlug(slug);
  if (existing) {
    return { success: true, existing: true, project: existing };
  }

  const folderName = formatProjectFolderName(name, createdAt);
  if (!folderName) {
    return { success: false, error: "Project name is required." };
  }

  const projectPath = path.join(PROJECTS_DIR, folderName);
  fs.mkdirSync(projectPath, { recursive: true });

  // Every project gets an images/ folder for captured screenshots, charts, etc.
  fs.mkdirSync(path.join(projectPath, "images"), { recursive: true });

  const displayDate = formatDisplayDate(createdAt);
  const displayName = buildProjectDisplayName(name, createdAt);
  const goalsPath = path.join(projectPath, "goals.md");
  const workPath = path.join(projectPath, "work.md");

  fs.writeFileSync(goalsPath, buildGoalsTemplate(name, displayDate), "utf-8");
  fs.writeFileSync(workPath, buildWorkTemplate(name, displayDate, source, initialMessage), "utf-8");

  return {
    success: true,
    project: {
      id: folderName,
      name,
      displayName,
      path: projectPath,
      goalsPath,
      workPath,
      createdAt: createdAt.toISOString()
    }
  };
};

export const createProjectsFromGoals = (goals = []) => {
  const created = [];
  const existing = [];
  const errors = [];

  goals.forEach((goal) => {
    const result = createProject(goal, {
      source: "goals",
      initialMessage: "Created from goals update."
    });
    if (result.success && result.existing) {
      existing.push(result.project);
    } else if (result.success) {
      created.push(result.project);
    } else if (result.error) {
      errors.push({ goal, error: result.error });
    }
  });

  return { created, existing, errors };
};

export const createProjectAction = (projectId, rawActionName) => {
  const project = resolveProject(projectId);
  if (!project) {
    return { success: false, error: "Project not found." };
  }

  const actionName = normalizeName(rawActionName);
  if (!actionName) {
    return { success: false, error: "Action name is required." };
  }

  const slug = slugifyName(actionName);
  if (!slug) {
    return { success: false, error: "Action name is required." };
  }

  const index = getNextActionIndex(project.path);
  const folderName = `action_${index}_${slug}`;
  const actionPath = path.join(project.path, folderName);
  fs.mkdirSync(actionPath, { recursive: true });

  const displayDate = formatDisplayDate(new Date());
  const actionFile = path.join(actionPath, "action.md");
  fs.writeFileSync(
    actionFile,
    buildActionTemplate(project.name, actionName, displayDate, index),
    "utf-8"
  );

  return {
    success: true,
    project,
    action: {
      id: folderName,
      name: actionName,
      path: actionPath,
      file: actionFile,
      index
    }
  };
};
