/**
 * Criteria Engine
 *
 * Defines and tracks success criteria for projects.
 * Calculates completion percentage based on weighted criteria.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = path.join(__dirname, "../../projects");

/**
 * Criterion types
 */
export const CRITERION_TYPE = {
  MUST_HAVE: "must_have",      // Required for completion
  SHOULD_HAVE: "should_have",  // Important but not blocking
  NICE_TO_HAVE: "nice_to_have" // Bonus
};

/**
 * Criterion class
 */
export class Criterion {
  constructor(options = {}) {
    this.id = options.id || `criterion_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.title = options.title || "Untitled Criterion";
    this.description = options.description || "";
    this.type = options.type || CRITERION_TYPE.MUST_HAVE;
    this.weight = options.weight || this.defaultWeight();
    this.completed = options.completed || false;
    this.completedAt = options.completedAt || null;
    this.evidence = options.evidence || null;
  }

  /**
   * Default weight based on type
   */
  defaultWeight() {
    switch (this.type) {
      case CRITERION_TYPE.MUST_HAVE: return 30;
      case CRITERION_TYPE.SHOULD_HAVE: return 15;
      case CRITERION_TYPE.NICE_TO_HAVE: return 5;
      default: return 20;
    }
  }

  /**
   * Mark as complete
   */
  complete(evidence = null) {
    this.completed = true;
    this.completedAt = new Date().toISOString();
    this.evidence = evidence;
  }

  /**
   * Mark as incomplete
   */
  uncomplete() {
    this.completed = false;
    this.completedAt = null;
    this.evidence = null;
  }

  /**
   * Convert to markdown checkbox
   */
  toMarkdown() {
    const checkbox = this.completed ? "[x]" : "[ ]";
    return `- ${checkbox} ${this.title} (weight: ${this.weight}%)${this.description ? ` — ${this.description}` : ""}`;
  }

  /**
   * Parse from markdown line
   */
  static fromMarkdown(line, type = CRITERION_TYPE.MUST_HAVE) {
    const match = line.match(/- \[([ x])\] (.+?)(?:\s*\(weight:\s*(\d+)%\))?(?:\s*—\s*(.+))?$/);
    if (!match) return null;

    const completed = match[1] === "x";
    const title = match[2].trim();
    const weight = match[3] ? parseInt(match[3]) : null;
    const description = match[4] || "";

    return new Criterion({
      title,
      description,
      type,
      weight: weight || new Criterion({ type }).defaultWeight(),
      completed
    });
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return { ...this };
  }

  /**
   * Create from plain object
   */
  static fromObject(obj) {
    return new Criterion(obj);
  }
}

/**
 * CriteriaSet class - collection of criteria for a project
 */
export class CriteriaSet {
  constructor(projectName = "") {
    this.projectName = projectName;
    this.criteria = [];
    this.createdAt = new Date().toISOString();
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Add a criterion
   */
  add(criterionOrOptions) {
    const criterion = criterionOrOptions instanceof Criterion
      ? criterionOrOptions
      : new Criterion(criterionOrOptions);

    this.criteria.push(criterion);
    this.lastUpdated = new Date().toISOString();
    return criterion;
  }

  /**
   * Get criteria by type
   */
  getByType(type) {
    return this.criteria.filter(c => c.type === type);
  }

  /**
   * Get must-have criteria
   */
  getMustHave() {
    return this.getByType(CRITERION_TYPE.MUST_HAVE);
  }

  /**
   * Get should-have criteria
   */
  getShouldHave() {
    return this.getByType(CRITERION_TYPE.SHOULD_HAVE);
  }

  /**
   * Get nice-to-have criteria
   */
  getNiceToHave() {
    return this.getByType(CRITERION_TYPE.NICE_TO_HAVE);
  }

  /**
   * Check if all must-have criteria are complete
   */
  allMustHaveComplete() {
    const mustHave = this.getMustHave();
    return mustHave.length === 0 || mustHave.every(c => c.completed);
  }

  /**
   * Calculate completion percentage
   *
   * Logic:
   * - If ANY must-have is incomplete, max is 89%
   * - When all must-have complete, can reach 100%
   * - Weights determine relative importance
   */
  calculateCompletion() {
    if (this.criteria.length === 0) return 0;

    const mustHave = this.getMustHave();
    const shouldHave = this.getShouldHave();
    const niceToHave = this.getNiceToHave();

    // Calculate total weight
    const totalWeight = this.criteria.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight === 0) return 0;

    // Calculate completed weight
    const completedWeight = this.criteria
      .filter(c => c.completed)
      .reduce((sum, c) => sum + c.weight, 0);

    let percentage = Math.round((completedWeight / totalWeight) * 100);

    // If any must-have is incomplete, cap at 89%
    if (!this.allMustHaveComplete()) {
      percentage = Math.min(percentage, 89);
    }

    return percentage;
  }

  /**
   * Get completion breakdown
   */
  getBreakdown() {
    const mustHave = this.getMustHave();
    const shouldHave = this.getShouldHave();
    const niceToHave = this.getNiceToHave();

    return {
      total: this.criteria.length,
      completed: this.criteria.filter(c => c.completed).length,
      percentage: this.calculateCompletion(),
      mustHave: {
        total: mustHave.length,
        completed: mustHave.filter(c => c.completed).length,
        allComplete: this.allMustHaveComplete()
      },
      shouldHave: {
        total: shouldHave.length,
        completed: shouldHave.filter(c => c.completed).length
      },
      niceToHave: {
        total: niceToHave.length,
        completed: niceToHave.filter(c => c.completed).length
      }
    };
  }

  /**
   * Mark a criterion as complete
   */
  completeCriterion(id, evidence = null) {
    const criterion = this.criteria.find(c => c.id === id);
    if (criterion) {
      criterion.complete(evidence);
      this.lastUpdated = new Date().toISOString();
      return true;
    }
    return false;
  }

  /**
   * Find incomplete criteria
   */
  getIncomplete() {
    return this.criteria.filter(c => !c.completed);
  }

  /**
   * Convert to markdown
   */
  toMarkdown() {
    const mustHave = this.getMustHave();
    const shouldHave = this.getShouldHave();
    const niceToHave = this.getNiceToHave();
    const breakdown = this.getBreakdown();

    return `# Success Criteria: ${this.projectName}

**Last Updated**: ${this.lastUpdated}
**Current Completion**: ${breakdown.percentage}%

---

## Must Have (Required for completion)
${mustHave.length > 0 ? mustHave.map(c => c.toMarkdown()).join("\n") : "_No must-have criteria defined_"}

---

## Should Have (Important but not blocking)
${shouldHave.length > 0 ? shouldHave.map(c => c.toMarkdown()).join("\n") : "_No should-have criteria defined_"}

---

## Nice to Have (Bonus)
${niceToHave.length > 0 ? niceToHave.map(c => c.toMarkdown()).join("\n") : "_No nice-to-have criteria defined_"}

---

## Completion Summary

| Category | Completed | Total |
|----------|-----------|-------|
| Must Have | ${breakdown.mustHave.completed} | ${breakdown.mustHave.total} |
| Should Have | ${breakdown.shouldHave.completed} | ${breakdown.shouldHave.total} |
| Nice to Have | ${breakdown.niceToHave.completed} | ${breakdown.niceToHave.total} |
| **TOTAL** | **${breakdown.completed}** | **${breakdown.total}** |

**Overall Completion**: ${breakdown.percentage}%
${!breakdown.mustHave.allComplete ? "\n⚠️ _Cannot reach 100% until all Must Have criteria are complete_" : ""}
`;
  }

  /**
   * Parse from markdown
   */
  static fromMarkdown(markdown, projectName = "") {
    const set = new CriteriaSet(projectName);

    // Parse last updated
    const updatedMatch = markdown.match(/\*\*Last Updated\*\*:\s*(.+)/);
    if (updatedMatch) set.lastUpdated = updatedMatch[1].trim();

    // Parse sections
    const sections = {
      [CRITERION_TYPE.MUST_HAVE]: /## Must Have[\s\S]*?(?=---|\n##|$)/,
      [CRITERION_TYPE.SHOULD_HAVE]: /## Should Have[\s\S]*?(?=---|\n##|$)/,
      [CRITERION_TYPE.NICE_TO_HAVE]: /## Nice to Have[\s\S]*?(?=---|\n##|$)/
    };

    for (const [type, regex] of Object.entries(sections)) {
      const match = markdown.match(regex);
      if (match) {
        const lines = match[0].split("\n").filter(l => l.startsWith("- ["));
        for (const line of lines) {
          const criterion = Criterion.fromMarkdown(line, type);
          if (criterion) {
            set.criteria.push(criterion);
          }
        }
      }
    }

    return set;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      projectName: this.projectName,
      criteria: this.criteria.map(c => c.toObject()),
      createdAt: this.createdAt,
      lastUpdated: this.lastUpdated
    };
  }

  /**
   * Create from plain object
   */
  static fromObject(obj) {
    const set = new CriteriaSet(obj.projectName);
    set.criteria = (obj.criteria || []).map(c => Criterion.fromObject(c));
    set.createdAt = obj.createdAt || set.createdAt;
    set.lastUpdated = obj.lastUpdated || set.lastUpdated;
    return set;
  }
}

/**
 * Load criteria for a project
 */
export async function loadProjectCriteria(projectName) {
  const criteriaPath = path.join(PROJECTS_DIR, projectName, "CRITERIA.md");

  if (!fs.existsSync(criteriaPath)) {
    return new CriteriaSet(projectName);
  }

  const markdown = await fs.promises.readFile(criteriaPath, "utf-8");
  return CriteriaSet.fromMarkdown(markdown, projectName);
}

/**
 * Save criteria for a project
 */
export async function saveProjectCriteria(criteriaSet) {
  const projectDir = path.join(PROJECTS_DIR, criteriaSet.projectName);

  // Ensure project directory exists
  if (!fs.existsSync(projectDir)) {
    await fs.promises.mkdir(projectDir, { recursive: true });
  }

  const criteriaPath = path.join(projectDir, "CRITERIA.md");
  await fs.promises.writeFile(criteriaPath, criteriaSet.toMarkdown(), "utf-8");

  return criteriaPath;
}

/**
 * Get all project completions
 */
export async function getAllProjectCompletions() {
  const completions = [];

  if (!fs.existsSync(PROJECTS_DIR)) {
    return completions;
  }

  const dirs = await fs.promises.readdir(PROJECTS_DIR);

  for (const dir of dirs) {
    const dirPath = path.join(PROJECTS_DIR, dir);
    const stat = await fs.promises.stat(dirPath);

    if (stat.isDirectory()) {
      const criteria = await loadProjectCriteria(dir);
      const breakdown = criteria.getBreakdown();

      completions.push({
        project: dir,
        completion: breakdown.percentage,
        total: breakdown.total,
        completed: breakdown.completed,
        allMustHaveComplete: breakdown.mustHave.allComplete
      });
    }
  }

  return completions;
}

/**
 * Create default criteria for a new project
 */
export function createDefaultCriteria(projectName, description = "") {
  const set = new CriteriaSet(projectName);

  // Add default must-have criteria
  set.add({
    title: "Project requirements defined",
    type: CRITERION_TYPE.MUST_HAVE,
    weight: 10
  });

  set.add({
    title: "Implementation complete",
    type: CRITERION_TYPE.MUST_HAVE,
    weight: 40
  });

  set.add({
    title: "Tested and verified",
    type: CRITERION_TYPE.MUST_HAVE,
    weight: 25
  });

  // Add default should-have
  set.add({
    title: "Documentation updated",
    type: CRITERION_TYPE.SHOULD_HAVE,
    weight: 15
  });

  // Add default nice-to-have
  set.add({
    title: "Optimization complete",
    type: CRITERION_TYPE.NICE_TO_HAVE,
    weight: 10
  });

  return set;
}
