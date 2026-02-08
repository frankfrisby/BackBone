/**
 * Goal Ethics Guard
 *
 * Validates goals and projects before creation to ensure they are:
 * 1. Specific — addresses a real, measurable problem
 * 2. Ethical — legal, honest, and in good faith
 * 3. Reputation-safe — nothing that would damage the user's reputation
 * 4. Beneficial — good for the user AND others affected
 *
 * The AI will NOT pursue goals that are:
 * - Illegal or unethical
 * - Designed to harm, deceive, or manipulate others
 * - Vague or unactionable (will request specificity)
 * - Reputation-damaging to the user
 * - Spam, fraud, or exploitation
 */

/**
 * Categories of rejected content
 */
const REJECTION_CATEGORIES = {
  ILLEGAL: "illegal",
  HARMFUL: "harmful",
  DECEPTIVE: "deceptive",
  EXPLOITATIVE: "exploitative",
  REPUTATION_RISK: "reputation_risk",
  VAGUE: "vague",
  UNETHICAL: "unethical"
};

/**
 * Patterns that indicate potentially harmful or unethical goals
 */
const HARMFUL_PATTERNS = [
  // Illegal activities
  { pattern: /\b(hack|exploit|crack|breach|phish|ddos)\b.*\b(account|system|server|password|network)\b/i, category: REJECTION_CATEGORIES.ILLEGAL, reason: "unauthorized access to systems" },
  { pattern: /\b(steal|theft|rob|embezzle|launder)\b/i, category: REJECTION_CATEGORIES.ILLEGAL, reason: "theft or fraud" },
  { pattern: /\b(counterfeit|forge|fake\s+id|fake\s+documents?)\b/i, category: REJECTION_CATEGORIES.ILLEGAL, reason: "counterfeiting or forgery" },
  { pattern: /\b(insider\s+trad\w*|front\s*run\w*|pump\s+and\s+dump|market\s+manipulat\w*)\b/i, category: REJECTION_CATEGORIES.ILLEGAL, reason: "securities fraud or market manipulation" },
  { pattern: /\b(tax\s+evas|hide\s+(income|money|assets)\s+from\s+(irs|tax|government))\b/i, category: REJECTION_CATEGORIES.ILLEGAL, reason: "tax evasion" },

  // Deception and manipulation
  { pattern: /\b(catfish|impersonat|pretend\s+to\s+be|fake\s+identity)\b/i, category: REJECTION_CATEGORIES.DECEPTIVE, reason: "identity deception" },
  { pattern: /\b(scam|defraud|swindle|con\s+(people|someone|them))\b/i, category: REJECTION_CATEGORIES.DECEPTIVE, reason: "fraud or scamming" },
  { pattern: /\b(spam|mass\s+email|unsolicited\s+bulk)\b/i, category: REJECTION_CATEGORIES.DECEPTIVE, reason: "spam or unsolicited messaging" },
  { pattern: /\b(fake\s+review|astroturf|sock\s+puppet)\b/i, category: REJECTION_CATEGORIES.DECEPTIVE, reason: "fake reviews or astroturfing" },
  { pattern: /\b(manipulat|gaslight|coerce|blackmail|extort)\b.*\b(people|someone|them|partner|family)\b/i, category: REJECTION_CATEGORIES.DECEPTIVE, reason: "psychological manipulation" },

  // Exploitation
  { pattern: /\b(exploit\s+(workers?|people|minors?|vulnerab))\b/i, category: REJECTION_CATEGORIES.EXPLOITATIVE, reason: "exploitation of people" },
  { pattern: /\b(pyramid\s+scheme|ponzi|mlm.*recruit)\b/i, category: REJECTION_CATEGORIES.EXPLOITATIVE, reason: "pyramid scheme or ponzi" },
  { pattern: /\b(sweatshop|child\s+labor|forced\s+labor)\b/i, category: REJECTION_CATEGORIES.EXPLOITATIVE, reason: "labor exploitation" },

  // Harmful to others
  { pattern: /\b(doxx|harass|stalk|bully|intimidat|threaten)\b/i, category: REJECTION_CATEGORIES.HARMFUL, reason: "harassment or intimidation" },
  { pattern: /\b(revenge|sabotag|destroy\s+(their|someone|competitor))\b/i, category: REJECTION_CATEGORIES.HARMFUL, reason: "revenge or sabotage" },
  { pattern: /\b(weapon|bomb|explosive|poison)\b/i, category: REJECTION_CATEGORIES.HARMFUL, reason: "weapons or dangerous materials" },

  // Reputation risks
  { pattern: /\b(lie\s+(to|on)\s+(resume|cv|linkedin|application))\b/i, category: REJECTION_CATEGORIES.REPUTATION_RISK, reason: "falsifying credentials" },
  { pattern: /\b(plagiari[sz]|copy\s+(someone|their)\s+(work|code|content))\b/i, category: REJECTION_CATEGORIES.REPUTATION_RISK, reason: "plagiarism" },
];

/**
 * Patterns indicating vague or unspecific goals
 */
const VAGUE_PATTERNS = [
  /^(be\s+better|improve|do\s+more|get\s+good)$/i,
  /^(make\s+money|get\s+rich|be\s+successful)$/i,
  /^(be\s+happy|feel\s+better|live\s+well)$/i,
  /^(fix\s+everything|change\s+my\s+life|start\s+over)$/i,
];

/**
 * Minimum description length for specificity
 */
const MIN_DESCRIPTION_LENGTH = 20;

/**
 * Validate a goal or backlog item for ethics, specificity, and reputation safety.
 *
 * @param {Object} item - The goal or backlog item
 * @param {string} item.title - Title of the goal
 * @param {string} [item.description] - Description
 * @param {string[]} [item.tasks] - Task list
 * @returns {{ valid: boolean, issues: Array<{category: string, reason: string}>, suggestions: string[] }}
 */
export function validateGoalEthics(item) {
  if (!item || !item.title) {
    return {
      valid: false,
      issues: [{ category: REJECTION_CATEGORIES.VAGUE, reason: "Goal has no title" }],
      suggestions: ["Provide a clear, specific goal title that describes what you want to achieve."]
    };
  }

  const issues = [];
  const suggestions = [];

  const fullText = `${item.title} ${item.description || ""} ${(item.tasks || []).join(" ")}`.toLowerCase();

  // Check harmful patterns
  for (const { pattern, category, reason } of HARMFUL_PATTERNS) {
    if (pattern.test(fullText)) {
      issues.push({ category, reason });
    }
  }

  // Check vagueness (title only)
  for (const pattern of VAGUE_PATTERNS) {
    if (pattern.test(item.title.trim())) {
      issues.push({ category: REJECTION_CATEGORIES.VAGUE, reason: "Goal is too vague to be actionable" });
      suggestions.push("Make the goal specific and measurable. Instead of 'make money', try 'increase monthly savings to $500 by cutting subscriptions'.");
      break;
    }
  }

  // Check description specificity
  if (!item.description || item.description.trim().length < MIN_DESCRIPTION_LENGTH) {
    issues.push({ category: REJECTION_CATEGORIES.VAGUE, reason: "Description is missing or too brief" });
    suggestions.push("Add a specific description that explains: What problem does this solve? What does success look like? What are the concrete steps?");
  }

  // Check if description is just repeating the title
  if (item.description && item.title &&
      item.description.trim().toLowerCase() === item.title.trim().toLowerCase()) {
    issues.push({ category: REJECTION_CATEGORIES.VAGUE, reason: "Description just repeats the title" });
    suggestions.push("The description should elaborate on the title with specifics: the problem being solved, success criteria, and approach.");
  }

  // Separate hard rejections from soft warnings
  const hardReject = issues.some(i =>
    i.category === REJECTION_CATEGORIES.ILLEGAL ||
    i.category === REJECTION_CATEGORIES.HARMFUL ||
    i.category === REJECTION_CATEGORIES.DECEPTIVE ||
    i.category === REJECTION_CATEGORIES.EXPLOITATIVE
  );

  return {
    valid: issues.length === 0,
    hardReject,
    issues,
    suggestions
  };
}

/**
 * Make a goal description more specific using the provided context.
 * Returns an improved description if the original was vague.
 *
 * @param {Object} item - The goal or backlog item
 * @returns {string} - Improved description (or original if already specific)
 */
export function improveDescription(item) {
  if (!item || !item.title) return "";

  const desc = item.description || "";
  if (desc.length >= MIN_DESCRIPTION_LENGTH * 2) return desc;

  // Build a more specific description from the title
  const title = item.title;
  let improved = desc || "";

  if (improved.length < MIN_DESCRIPTION_LENGTH) {
    improved = `Goal: ${title}. `;

    if (item.category) {
      improved += `Category: ${item.category}. `;
    }

    if (item.relatedBeliefs && item.relatedBeliefs.length > 0) {
      improved += `Supports: ${item.relatedBeliefs.join(", ")}. `;
    }

    if (item.tasks && item.tasks.length > 0) {
      improved += `Key steps: ${item.tasks.slice(0, 3).join("; ")}. `;
    }

    improved += "Success criteria: [to be defined]. Approach: [to be planned].";
  }

  return improved;
}

/**
 * Validate and sanitize a goal before creation.
 * Hard rejections throw an error. Soft issues add warnings.
 *
 * @param {Object} item - The goal or backlog item
 * @returns {{ item: Object, warnings: string[] }} - Sanitized item with any warnings
 * @throws {Error} if the goal is rejected on ethical grounds
 */
export function sanitizeGoal(item) {
  const validation = validateGoalEthics(item);

  if (validation.hardReject) {
    const reasons = validation.issues
      .filter(i => i.category !== REJECTION_CATEGORIES.VAGUE)
      .map(i => i.reason)
      .join(", ");
    throw new Error(`Goal rejected: ${reasons}. BACKBONE will not pursue goals that are harmful, illegal, or deceptive.`);
  }

  const warnings = [];

  // Improve description if vague
  if (validation.issues.some(i => i.category === REJECTION_CATEGORIES.VAGUE)) {
    item.description = improveDescription(item);
    warnings.push(...validation.suggestions);
  }

  // Add reputation risk warning
  if (validation.issues.some(i => i.category === REJECTION_CATEGORIES.REPUTATION_RISK)) {
    warnings.push("Warning: This goal has potential reputation risks. Proceed carefully and ethically.");
    item._reputationWarning = true;
  }

  return { item, warnings };
}

/**
 * Ethics guidelines to inject into the thinking engine prompt
 */
export const ETHICS_PROMPT_SECTION = `
## ETHICS & REPUTATION GUARDRAILS

ALL goals, backlog items, and projects MUST pass these checks:

### Hard Rules (Instant Rejection)
- No illegal activities (hacking, fraud, insider trading, tax evasion)
- No harm to others (harassment, doxxing, stalking, sabotage, threats)
- No deception (scams, fake reviews, impersonation, manipulation)
- No exploitation (pyramid schemes, labor exploitation, taking advantage of vulnerability)

### Quality Rules (Required Specificity)
- Every goal MUST have a specific, measurable description
- Descriptions must explain: what problem it solves, what success looks like
- Vague goals like "make money" or "be better" must be made specific
- Example: Instead of "make money" → "Increase portfolio value by 5% this quarter through disciplined score-based trading"

### Reputation Rules (User Protection)
- Would this goal embarrass the user if made public? If yes, reject it.
- Does this goal require lying, cheating, or misleading anyone? If yes, reject it.
- Does this goal create value for the user without harming others? It should.
- Is this something the user would be proud to tell their family about?

### Good Faith Principle
- Goals should benefit the user through legitimate means
- Actions should be things you'd be comfortable explaining to a regulator
- When in doubt, choose the ethical path even if it's slower or less profitable
`;

export default { validateGoalEthics, improveDescription, sanitizeGoal, ETHICS_PROMPT_SECTION, REJECTION_CATEGORIES };
