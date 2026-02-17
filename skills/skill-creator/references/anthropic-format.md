# Anthropic Skill Format Reference

Source: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md

## Frontmatter Fields

| Field | Required | Purpose |
|-------|----------|---------|
| name | Yes | Skill identifier (kebab-case) |
| description | Yes | Trigger matching — include WHAT + WHEN |
| compatibility | No | Rarely needed, for platform-specific skills |

## Resource Types

### scripts/
Executable code for deterministic tasks. Use when:
- Same code would be rewritten repeatedly
- Deterministic reliability needed
- Token efficiency matters (script runs without loading into context)

### references/
Documentation loaded on demand. Use for:
- Database schemas, API docs
- Domain knowledge, company policies
- Workflow guides >100 lines
- Keep files lean; add grep patterns in SKILL.md if >10k words

### assets/
Files used in output, never loaded into context:
- Templates (.pptx, .docx)
- Images, icons, fonts
- Boilerplate code

## Body Size Limits

- SKILL.md body: <500 lines (ideal: 100-300)
- References: unlimited but structured with TOC if >100 lines
- Avoid deeply nested references (max 1 level from SKILL.md)

## Anti-Patterns

1. **Code dump** — Putting generic code Claude already knows
2. **README syndrome** — Including installation guides, changelogs
3. **Over-documentation** — Explaining obvious concepts
4. **Duplication** — Same info in SKILL.md AND references
5. **Flat everything** — Not using progressive disclosure for long content
