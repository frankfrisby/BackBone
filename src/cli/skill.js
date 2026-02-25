/**
 * backbone skill — Skill management CLI
 *
 * Usage:
 *   backbone skill list              List all skills (system + user)
 *   backbone skill show <name>       Display skill content
 *   backbone skill create <name>     Scaffold a new user skill
 *   backbone skill search <query>    Search skills by name/tag/description
 *   backbone skill install <query>   Search online and install a skill
 *   backbone skill delete <name>     Delete a user skill
 *   backbone skill stats             Show skill usage statistics
 */

import { getSkillsLoader, getSkillContent, getUserSkillContent } from "../services/projects/skills-loader.js";
import { section, label, ok, fail, warn, info, theme, symbols } from "./theme.js";

const HELP = `
backbone skill — Skill management

Usage: backbone skill <subcommand> [options]

Subcommands:
  list                List all skills (system + user) with categories
  show <name>         Display skill content
  create <name>       Scaffold a new user skill template
  search <query>      Search skills by name/tag/description
  install <query>     Search Anthropic repos and install a skill
  delete <name>       Delete a user skill
  stats               Show skill usage statistics

Options:
  --json              Output machine-readable JSON
  --help              Show this help
`;

function parseArgs(args) {
  const flags = {};
  const positional = [];
  for (const arg of args) {
    if (arg === "--json") flags.json = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg.startsWith("--")) flags[arg.slice(2)] = true;
    else positional.push(arg);
  }
  return { flags, positional };
}

async function cmdList(flags) {
  const loader = getSkillsLoader();
  const allSkills = loader.getAllSkills();
  const categories = {};

  for (const s of allSkills) {
    const cat = s.category || "Other";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(s);
  }

  if (flags.json) {
    console.log(JSON.stringify({ total: allSkills.length, categories }, null, 2));
    return;
  }

  console.log(theme.heading("\n  BACKBONE Skills\n"));
  console.log(label("Total", String(allSkills.length)));

  for (const [cat, skills] of Object.entries(categories).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(section(`  ${cat} (${skills.length})`));
    for (const s of skills) {
      const badge = s.isUserSkill ? theme.accent(" [user]") : s.isDefault ? "" : theme.muted(" [local]");
      const avail = s.isAvailable === false ? theme.muted(" (unavailable)") : "";
      const desc = s.description ? theme.muted(` ${symbols.dot} ${s.description}`) : "";
      console.log(`    ${theme.bold(s.id)}${badge}${avail}${desc}`);
    }
  }
  console.log("");
}

async function cmdShow(name, flags) {
  if (!name) {
    console.log(fail("Usage: backbone skill show <name>"));
    return;
  }

  // Try system skill first, then user skill
  let content = getSkillContent(name);
  let source = "system";
  if (!content) {
    content = getUserSkillContent(name);
    source = "user";
  }

  if (!content) {
    console.log(fail(`Skill not found: ${name}`));
    return;
  }

  if (flags.json) {
    console.log(JSON.stringify({ name, source, content }, null, 2));
    return;
  }

  console.log(theme.heading(`\n  Skill: ${name}`) + theme.muted(` (${source})\n`));
  console.log(content);
}

async function cmdCreate(name, flags) {
  if (!name) {
    console.log(fail("Usage: backbone skill create <name>"));
    return;
  }

  const loader = getSkillsLoader();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const template = `# ${name}

## Category
custom

## Tags
${slug}

## Description
A custom skill for ${name}.

## When to Use
- When the user asks about ${name}

## Process
1. Step one
2. Step two
3. Step three

## Decision Framework
- Consider X before Y

## My Preferences
- (Add your preferences here)

## Examples
- Example usage scenario
`;

  const entry = loader.createUserSkill(name, template, {
    description: `A custom skill for ${name}`,
    category: "custom",
    tags: [slug],
  });

  if (flags.json) {
    console.log(JSON.stringify({ created: true, skill: entry }, null, 2));
    return;
  }

  console.log(ok(`Created user skill: ${entry.id}`));
  console.log(label("Category", entry.category));
  console.log(info("Edit the template in your user-skills directory to customize."));
}

async function cmdSearch(query, flags) {
  if (!query) {
    console.log(fail("Usage: backbone skill search <query>"));
    return;
  }

  const loader = getSkillsLoader();
  const allSkills = loader.getAllSkills();
  const lowerQ = query.toLowerCase();

  const matches = allSkills.filter(s =>
    (s.id && s.id.toLowerCase().includes(lowerQ)) ||
    (s.name && s.name.toLowerCase().includes(lowerQ)) ||
    (s.description && s.description.toLowerCase().includes(lowerQ)) ||
    (s.tags && s.tags.some(t => t.toLowerCase().includes(lowerQ)))
  );

  if (flags.json) {
    console.log(JSON.stringify({ query, count: matches.length, results: matches }, null, 2));
    return;
  }

  console.log(theme.heading(`\n  Search: "${query}"\n`));
  if (matches.length === 0) {
    console.log(warn("No matching skills found."));
  } else {
    console.log(label("Found", String(matches.length)));
    for (const s of matches) {
      const badge = s.isUserSkill ? theme.accent(" [user]") : "";
      const desc = s.description ? theme.muted(` ${symbols.dot} ${s.description}`) : "";
      console.log(`  ${theme.bold(s.id)}${badge}${desc}`);
    }
  }
  console.log("");
}

async function cmdInstall(query, flags) {
  if (!query) {
    console.log(fail("Usage: backbone skill install <query>"));
    return;
  }

  const loader = getSkillsLoader();
  console.log(info(`Searching Anthropic repos for "${query}"...`));

  const result = await loader.searchAndInstall(query);

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.installed) {
    console.log(ok(result.message));
    if (result.skill) {
      console.log(label("ID", result.skill.id));
      console.log(label("Source", result.source));
    }
  } else {
    console.log(fail(result.message));
    if (result.searched) {
      console.log(theme.muted(`  Searched: ${result.searched.join(", ")}`));
    }
  }
}

async function cmdDelete(name, flags) {
  if (!name) {
    console.log(fail("Usage: backbone skill delete <name>"));
    return;
  }

  const loader = getSkillsLoader();
  const deleted = loader.deleteUserSkill(name);

  if (flags.json) {
    console.log(JSON.stringify({ deleted, name }, null, 2));
    return;
  }

  if (deleted) {
    console.log(ok(`Deleted user skill: ${name}`));
  } else {
    console.log(fail(`User skill not found: ${name}`));
  }
}

async function cmdStats(flags) {
  const loader = getSkillsLoader();
  const userSkills = loader.getUserSkills();
  const allSkills = loader.getAllSkills();
  const categories = loader.getCategories();

  const stats = {
    totalSkills: allSkills.length,
    userSkills: userSkills.length,
    systemSkills: allSkills.length - userSkills.length,
    categories: categories.length,
    usage: userSkills
      .filter(s => s.usageCount > 0)
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .map(s => ({ id: s.id, name: s.name, usageCount: s.usageCount, lastUsedAt: s.lastUsedAt })),
  };

  if (flags.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(theme.heading("\n  Skill Statistics\n"));
  console.log(label("Total skills", String(stats.totalSkills)));
  console.log(label("System skills", String(stats.systemSkills)));
  console.log(label("User skills", String(stats.userSkills)));
  console.log(label("Categories", String(stats.categories)));

  if (stats.usage.length > 0) {
    console.log(section("  Most Used"));
    for (const s of stats.usage.slice(0, 10)) {
      const lastUsed = s.lastUsedAt ? theme.muted(` (last: ${new Date(s.lastUsedAt).toLocaleDateString()})`) : "";
      console.log(`    ${theme.bold(s.id)} ${symbols.arrow} ${s.usageCount} uses${lastUsed}`);
    }
  } else {
    console.log(info("No usage data recorded yet."));
  }
  console.log("");
}

export async function runSkill(args) {
  const { flags, positional } = parseArgs(args);
  const sub = positional[0];
  const arg = positional.slice(1).join(" ");

  if (flags.help || !sub) {
    console.log(HELP);
    return;
  }

  switch (sub) {
    case "list": return cmdList(flags);
    case "show": return cmdShow(arg, flags);
    case "create": return cmdCreate(arg, flags);
    case "search": return cmdSearch(arg, flags);
    case "install": return cmdInstall(arg, flags);
    case "delete": return cmdDelete(arg, flags);
    case "stats": return cmdStats(flags);
    default:
      console.log(fail(`Unknown subcommand: ${sub}`));
      console.log(HELP);
  }
}
