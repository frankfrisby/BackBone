---
name: skill-creator
description: Create or update BACKBONE skills following the Anthropic skill format. Use when the user wants to create a new skill, refactor an existing skill, or asks about skill best practices. Triggers on /skill create, /skill edit, "make a skill", "create a skill for", or any request to extend BACKBONE's capabilities with a new workflow.
---

# Skill Creator

Create high-quality skills that extend BACKBONE's capabilities. Skills are modular instruction packages that give the AI specialized knowledge, workflows, and tools for specific domains.

## Core Principle: Claude Is Already Smart

Challenge every line: "Does Claude need this?" Remove generic code, boilerplate, and obvious patterns. Focus on:
- **Domain-specific knowledge** Claude doesn't have (schemas, APIs, business logic)
- **Proven workflows** that produce better results than ad-hoc approaches
- **Reusable scripts** for deterministic or fragile operations
- **BACKBONE integration points** (which data files to read, which MCP tools to use)

## Skill Anatomy

```
skills/<skill-name>/
├── SKILL.md              (required — frontmatter + instructions, <500 lines)
├── scripts/              (optional — executable code for repeated tasks)
├── references/           (optional — docs loaded on demand)
└── assets/               (optional — templates, images, not loaded into context)
```

Or flat format for simple skills:
```
skills/<skill-name>.md    (frontmatter + instructions, <300 lines)
```

**Use directory format** when the skill needs scripts, references, or assets.
**Use flat format** for simple workflow-only skills.

## SKILL.md Structure

### Frontmatter (Required)

```yaml
---
name: skill-name
description: What it does + ALL trigger conditions. Be exhaustive about when to use it — the description is the ONLY thing in context before the skill loads.
---
```

The description must answer: "If a user says X, should this skill activate?" Include:
- What the skill does (1 sentence)
- All trigger phrases and contexts (specific list)
- File types or domains it handles

### Body (Required, <500 lines)

Write in **imperative form**. Structure:

1. **Quick start** — The most common operation in 5-10 lines
2. **Workflow** — Step-by-step for the primary use case
3. **BACKBONE integration** — Which data files, MCP tools, and paths to use
4. **Pitfalls** — Known gotchas (max 5)
5. **References** — Link to `references/` files for deep details

### What NOT to Include

- Generic code Claude can write from scratch (HTTP requests, file I/O, basic CRUD)
- README, CHANGELOG, installation guides
- Multiple examples of the same pattern
- Comments explaining obvious code
- Error handling for impossible scenarios

## Degrees of Freedom

| Freedom | When | Format |
|---------|------|--------|
| **High** (text) | Multiple valid approaches, context-dependent | Describe the goal, let Claude choose |
| **Medium** (pseudocode) | Preferred patterns exist | Show the pattern, allow variation |
| **Low** (exact script) | Fragile operations, consistency critical | Provide exact code in `scripts/` |

## Progressive Disclosure

Keep SKILL.md lean. Move detailed content to `references/`:

```markdown
## Advanced Features
- **Form filling**: See [references/forms.md](references/forms.md)
- **API schemas**: See [references/api.md](references/api.md)
```

## BACKBONE Integration Checklist

Every skill that works with user data should specify:
- **Data files**: Which files in `data/` or `memory/` to read/write
- **MCP tools**: Which MCP server tools are available (trading, health, contacts, etc.)
- **Output location**: Where results go (data/spreadsheets/, projects/, memory/)
- **Notification**: Whether to notify user via WhatsApp on completion

## Creation Process

1. **Clarify scope** — Ask what the skill should do and example triggers
2. **Check existing** — Read `skills/` to avoid duplicates
3. **Choose format** — Flat .md for simple, directory for complex
4. **Write SKILL.md** — Frontmatter first, then lean body
5. **Add resources** — Scripts for deterministic tasks, references for deep docs
6. **Register** — Add to DEFAULT_SKILLS in skills-loader.js if it's a system skill
7. **Test** — Use the skill on a real task, iterate based on results

## Template

```yaml
---
name: <skill-name>
description: <What it does>. Use when <trigger 1>, <trigger 2>, <trigger 3>.
---
```

```markdown
# <Skill Title>

<One-line purpose.>

## Workflow

1. <Step 1>
2. <Step 2>
3. <Step 3>

## BACKBONE Integration

- **Read**: `data/<relevant-file>.json`
- **Write**: `data/spreadsheets/<output>.xlsx` or `projects/<name>/`
- **MCP tools**: `get_portfolio`, `get_health_summary`, etc.
- **Notify**: Send WhatsApp summary on completion

## Pitfalls

- <Known gotcha 1>
- <Known gotcha 2>
```
