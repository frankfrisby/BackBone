/**
 * Project Research Manager
 *
 * Manages sophisticated project files with:
 * - Detailed PROJECT.md files with research, sources, content
 * - Research subfolder for JSON/MD research files
 * - Documents subfolder for PDFs, screenshots, tickets
 * - Cloud storage sync for all project files
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

import { getDataDir, getProjectsDir, engineFile } from "../paths.js";
const PROJECTS_DIR = getProjectsDir();
const DATA_DIR = getDataDir();
const TEMPLATE_PATH = engineFile("skills/project-template.md");

/**
 * Read file helper
 */
function readFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {}
  return null;
}

/**
 * Read JSON helper
 */
function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

/**
 * Write JSON helper
 */
function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Write file helper
 */
function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
}

class ProjectResearchManager extends EventEmitter {
  constructor() {
    super();
    this.projects = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the manager
   */
  async initialize() {
    this.scanProjects();
    this.initialized = true;
    console.log(`[ProjectResearchManager] Initialized with ${this.projects.size} projects`);
    return this.projects;
  }

  /**
   * Scan existing projects
   */
  scanProjects() {
    if (!fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true });
      return;
    }

    const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith("."))
      .map(d => d.name);

    for (const dir of dirs) {
      const projectPath = path.join(PROJECTS_DIR, dir);
      const projectMd = path.join(projectPath, "PROJECT.md");
      const metadataPath = path.join(projectPath, "metadata.json");

      if (fs.existsSync(projectMd)) {
        const content = readFile(projectMd);
        const metadata = readJson(metadataPath) || this.extractMetadata(content);

        this.projects.set(dir, {
          name: dir,
          path: projectPath,
          projectMd,
          metadata,
          hasResearch: fs.existsSync(path.join(projectPath, "research")),
          hasDocuments: fs.existsSync(path.join(projectPath, "documents")),
          hasScreenshots: fs.existsSync(path.join(projectPath, "screenshots"))
        });
      }
    }
  }

  /**
   * Extract metadata from PROJECT.md
   */
  extractMetadata(content) {
    const metadata = {
      status: "unknown",
      created: null,
      updated: null,
      category: "general",
      priority: "medium"
    };

    // Parse header fields
    const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/i);
    if (statusMatch) metadata.status = statusMatch[1].toLowerCase();

    const createdMatch = content.match(/\*\*Created:\*\*\s*(.+)/i);
    if (createdMatch) metadata.created = createdMatch[1].trim();

    const categoryMatch = content.match(/\*\*Category:\*\*\s*(\w+)/i);
    if (categoryMatch) metadata.category = categoryMatch[1].toLowerCase();

    const priorityMatch = content.match(/\*\*Priority:\*\*\s*(\w+)/i);
    if (priorityMatch) metadata.priority = priorityMatch[1].toLowerCase();

    return metadata;
  }

  /**
   * Create a new sophisticated project
   */
  createProject(name, options = {}) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const projectPath = path.join(PROJECTS_DIR, slug);

    if (fs.existsSync(projectPath)) {
      console.log(`[ProjectResearchManager] Project ${slug} already exists`);
      return { success: false, error: "Project already exists", path: projectPath };
    }

    // Create project directory structure
    const dirs = [
      projectPath,
      path.join(projectPath, "research"),
      path.join(projectPath, "documents"),
      path.join(projectPath, "screenshots")
    ];

    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create PROJECT.md from template
    const now = new Date().toISOString();
    const projectContent = this.generateProjectMd({
      name,
      status: options.status || "active",
      category: options.category || "research",
      priority: options.priority || "medium",
      summary: options.summary || `Research project: ${name}`,
      objectives: options.objectives || [`Research and document findings on ${name}`],
      createdAt: now
    });

    writeFile(path.join(projectPath, "PROJECT.md"), projectContent);

    // Create metadata.json
    const metadata = {
      id: `project_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: slug,
      title: name,
      createdAt: now,
      updatedAt: now,
      cloudSynced: false,
      lastCloudSync: null,
      tags: options.tags || [],
      linkedGoals: options.linkedGoals || [],
      linkedBeliefs: options.linkedBeliefs || []
    };

    writeJson(path.join(projectPath, "metadata.json"), metadata);

    // Create initial research file
    writeJson(path.join(projectPath, "research", "sources.json"), {
      primarySources: [],
      secondarySources: [],
      lastUpdated: now
    });

    // Update internal tracking
    this.projects.set(slug, {
      name: slug,
      path: projectPath,
      projectMd: path.join(projectPath, "PROJECT.md"),
      metadata,
      hasResearch: true,
      hasDocuments: true,
      hasScreenshots: true
    });

    console.log(`[ProjectResearchManager] Created project: ${slug}`);
    this.emit("project-created", { name: slug, path: projectPath });

    return { success: true, name: slug, path: projectPath };
  }

  /**
   * Generate PROJECT.md content
   */
  generateProjectMd(config) {
    const now = new Date().toISOString();
    const dateStr = now.split("T")[0];

    return `# ${config.name}

**Status:** ${config.status}
**Created:** ${config.createdAt || now}
**Last Updated:** ${now}
**Category:** ${config.category}
**Priority:** ${config.priority}

## Executive Summary

${config.summary}

## Objectives

${config.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}

## Key Findings

_No findings yet. Research in progress._

## Research Data

### Companies/Entities Involved
| Name | Role | Details | Source |
|------|------|---------|--------|
| - | - | _No data yet_ | - |

### Key Metrics
| Metric | Value | Date | Source |
|--------|-------|------|--------|
| - | - | - | - |

### Timeline
- **${dateStr}:** Project created

## Sources & References

### Primary Sources
_No sources yet_

### Documents
_No documents yet_

## Analysis

### Strengths
- To be determined through research

### Weaknesses
- To be determined through research

### Opportunities
- To be determined through research

### Threats/Risks
- To be determined through research

## Action Items

### Immediate (Today/Tomorrow)
- [ ] Begin initial research
- [ ] Identify key sources

### Short Term (This Week)
- [ ] Document primary findings
- [ ] Create research structure

## Progress Log

### ${dateStr}
- Project created
- Initial structure set up
- Ready for research

## Attachments

### Research Files
- \`research/sources.json\` - Source tracking

---

## Metadata
\`\`\`json
{
  "id": "${config.id || "project_" + Date.now()}",
  "createdAt": "${config.createdAt || now}",
  "updatedAt": "${now}",
  "cloudSynced": false,
  "tags": ${JSON.stringify(config.tags || [])},
  "linkedGoals": ${JSON.stringify(config.linkedGoals || [])},
  "linkedBeliefs": ${JSON.stringify(config.linkedBeliefs || [])}
}
\`\`\`

---
*Managed by BACKBONE - Last AI update: ${now}*
`;
  }

  /**
   * Add a finding to a project
   */
  addFinding(projectName, finding) {
    const project = this.projects.get(projectName);
    if (!project) {
      return { success: false, error: "Project not found" };
    }

    const now = new Date().toISOString();
    const dateStr = now.split("T")[0];

    // Read current PROJECT.md
    let content = readFile(project.projectMd);
    if (!content) {
      return { success: false, error: "Could not read PROJECT.md" };
    }

    // Build finding section
    const findingSection = `
### Finding: ${finding.title}
**Source:** ${finding.source || "Research"}
**Date:** ${dateStr}
**Relevance:** ${finding.relevance || "medium"}

${finding.content}
`;

    // Insert after "## Key Findings" section
    const insertPoint = content.indexOf("## Key Findings");
    if (insertPoint !== -1) {
      const afterHeader = content.indexOf("\n", insertPoint);
      if (afterHeader !== -1) {
        // Remove the "no findings" placeholder if present
        content = content.replace(/_No findings yet\. Research in progress\._\n*/g, "");

        // Find next section
        const nextSection = content.indexOf("\n## ", afterHeader + 1);
        if (nextSection !== -1) {
          content = content.slice(0, nextSection) + findingSection + content.slice(nextSection);
        } else {
          content = content.slice(0, afterHeader + 1) + findingSection + content.slice(afterHeader + 1);
        }
      }
    }

    // Update Last Updated
    content = content.replace(/\*\*Last Updated:\*\*.+/i, `**Last Updated:** ${now}`);

    // Write back
    writeFile(project.projectMd, content);

    // Also save to research file
    const findingsPath = path.join(project.path, "research", "findings.json");
    const existingFindings = readJson(findingsPath) || { findings: [] };
    existingFindings.findings.unshift({
      id: `finding_${Date.now()}`,
      ...finding,
      addedAt: now
    });
    writeJson(findingsPath, existingFindings);

    this.emit("finding-added", { project: projectName, finding });
    return { success: true };
  }

  /**
   * Add a source to a project
   */
  addSource(projectName, source) {
    const project = this.projects.get(projectName);
    if (!project) {
      return { success: false, error: "Project not found" };
    }

    const sourcesPath = path.join(project.path, "research", "sources.json");
    const sources = readJson(sourcesPath) || { primarySources: [], secondarySources: [], lastUpdated: null };

    const sourceEntry = {
      id: `source_${Date.now()}`,
      title: source.title,
      url: source.url,
      description: source.description,
      addedAt: new Date().toISOString()
    };

    if (source.primary) {
      sources.primarySources.unshift(sourceEntry);
    } else {
      sources.secondarySources.unshift(sourceEntry);
    }
    sources.lastUpdated = new Date().toISOString();

    writeJson(sourcesPath, sources);

    this.emit("source-added", { project: projectName, source: sourceEntry });
    return { success: true };
  }

  /**
   * Add a document reference to a project
   */
  addDocument(projectName, docInfo) {
    const project = this.projects.get(projectName);
    if (!project) {
      return { success: false, error: "Project not found" };
    }

    const docsPath = path.join(project.path, "research", "documents.json");
    const docs = readJson(docsPath) || { documents: [], lastUpdated: null };

    const docEntry = {
      id: `doc_${Date.now()}`,
      filename: docInfo.filename,
      description: docInfo.description,
      type: docInfo.type || "document",
      path: docInfo.path || `documents/${docInfo.filename}`,
      cloudUrl: docInfo.cloudUrl || null,
      addedAt: new Date().toISOString()
    };

    docs.documents.unshift(docEntry);
    docs.lastUpdated = new Date().toISOString();

    writeJson(docsPath, docs);

    this.emit("document-added", { project: projectName, document: docEntry });
    return { success: true };
  }

  /**
   * Add a progress log entry
   */
  addProgressLog(projectName, logEntry) {
    const project = this.projects.get(projectName);
    if (!project) {
      return { success: false, error: "Project not found" };
    }

    const now = new Date().toISOString();
    const dateStr = now.split("T")[0];

    let content = readFile(project.projectMd);
    if (!content) {
      return { success: false, error: "Could not read PROJECT.md" };
    }

    const progressEntry = `
### ${dateStr}
- ${logEntry}
`;

    // Find "## Progress Log" and insert after
    const insertPoint = content.indexOf("## Progress Log");
    if (insertPoint !== -1) {
      const afterHeader = content.indexOf("\n", insertPoint);
      if (afterHeader !== -1) {
        content = content.slice(0, afterHeader + 1) + progressEntry + content.slice(afterHeader + 1);
      }
    }

    // Update Last Updated
    content = content.replace(/\*\*Last Updated:\*\*.+/i, `**Last Updated:** ${now}`);

    writeFile(project.projectMd, content);

    this.emit("progress-logged", { project: projectName, entry: logEntry });
    return { success: true };
  }

  /**
   * Get project summary for display
   */
  getProjectSummary(projectName) {
    const project = this.projects.get(projectName);
    if (!project) return null;

    const content = readFile(project.projectMd);
    const sources = readJson(path.join(project.path, "research", "sources.json"));
    const findings = readJson(path.join(project.path, "research", "findings.json"));
    const documents = readJson(path.join(project.path, "research", "documents.json"));

    return {
      name: project.name,
      path: project.path,
      metadata: project.metadata,
      stats: {
        sources: (sources?.primarySources?.length || 0) + (sources?.secondarySources?.length || 0),
        findings: findings?.findings?.length || 0,
        documents: documents?.documents?.length || 0
      },
      latestFinding: findings?.findings?.[0] || null,
      latestSource: sources?.primarySources?.[0] || sources?.secondarySources?.[0] || null
    };
  }

  /**
   * Get all projects for display
   */
  getAllProjects() {
    const result = [];
    for (const [name, project] of this.projects) {
      result.push(this.getProjectSummary(name));
    }
    return result;
  }

  /**
   * Sync project to cloud storage
   */
  async syncToCloud(projectName) {
    // This would integrate with firebase-storage or cloud-sync service
    const project = this.projects.get(projectName);
    if (!project) {
      return { success: false, error: "Project not found" };
    }

    // Mark as needing sync
    const metadataPath = path.join(project.path, "metadata.json");
    const metadata = readJson(metadataPath) || {};
    metadata.cloudSynced = true;
    metadata.lastCloudSync = new Date().toISOString();
    writeJson(metadataPath, metadata);

    this.emit("cloud-sync", { project: projectName });
    return { success: true };
  }
}

// Singleton
let instance = null;

export const getProjectResearchManager = () => {
  if (!instance) {
    instance = new ProjectResearchManager();
    instance.initialize();
  }
  return instance;
};

export default ProjectResearchManager;
