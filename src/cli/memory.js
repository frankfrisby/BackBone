/**
 * backbone memory — List & search memory files
 *
 * Inspired by OpenClaw's `openclaw memory status/search`.
 * Shows memory file inventory and allows text search.
 */

import fs from "fs";
import path from "path";
import { memoryFile, getMemoryDir } from "../services/paths.js";
import { section, label, ok, warn, info, theme, symbols } from "./theme.js";

const HELP = `
backbone memory — List & search memory files

Usage: backbone memory <action> [args]

Actions:
  list                List all memory files with sizes
  search <query>      Search across all memory files
  read <filename>     Print contents of a memory file
  status              Show memory system health

Options:
  --json              Output machine-readable JSON
  --max-results <n>   Max search results (default: 10)
  --help              Show this help

Examples:
  backbone memory list
  backbone memory search "portfolio"
  backbone memory read thesis.md
  backbone memory status
`;

function getMemoryFiles() {
  const dir = getMemoryDir();
  if (!fs.existsSync(dir)) return [];
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));
    return files.map(f => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return {
        name: f,
        path: full,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      };
    }).sort((a, b) => b.size - a.size);
  } catch {
    return [];
  }
}

function searchFiles(files, query, maxResults = 10) {
  const results = [];
  const lowerQuery = query.toLowerCase();

  for (const file of files) {
    try {
      const content = fs.readFileSync(file.path, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          // Get context (1 line before, match, 1 line after)
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length - 1, i + 1);
          const snippet = lines.slice(start, end + 1).join("\n").trim();
          results.push({
            file: file.name,
            line: i + 1,
            snippet,
          });
          if (results.length >= maxResults) return results;
        }
      }
    } catch {}
  }
  return results;
}

export async function runMemory(args) {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.log(HELP);
    return;
  }

  const jsonMode = args.includes("--json");
  const action = args[0];

  // Parse --max-results
  let maxResults = 10;
  const mrIdx = args.indexOf("--max-results");
  if (mrIdx >= 0 && args[mrIdx + 1]) maxResults = parseInt(args[mrIdx + 1]) || 10;

  switch (action) {
    case "list": {
      const files = getMemoryFiles();

      if (jsonMode) {
        console.log(JSON.stringify(files, null, 2));
        return;
      }

      console.log(theme.heading("\n  Memory Files\n"));
      if (files.length === 0) {
        console.log(warn("No memory files found"));
        return;
      }

      let totalSize = 0;
      for (const f of files) {
        totalSize += f.size;
        const sizeKB = (f.size / 1024).toFixed(1);
        const modified = new Date(f.modified).toLocaleDateString();
        const bar = "█".repeat(Math.min(20, Math.round(f.size / 1024)));
        console.log(`  ${theme.info(f.name.padEnd(25))} ${theme.muted(sizeKB.padStart(6) + "KB")} ${theme.muted(bar)}`);
      }
      console.log(`\n  ${theme.muted("Total:")} ${files.length} files, ${(totalSize / 1024).toFixed(1)}KB\n`);
      break;
    }

    case "search": {
      const query = args[1];
      if (!query) {
        console.error(theme.error("Usage: backbone memory search <query>"));
        process.exit(1);
      }

      const files = getMemoryFiles();
      const results = searchFiles(files, query, maxResults);

      if (jsonMode) {
        console.log(JSON.stringify({ query, results }, null, 2));
        return;
      }

      console.log(theme.heading(`\n  Search: "${query}"\n`));
      if (results.length === 0) {
        console.log(info("No matches found"));
        return;
      }

      for (const r of results) {
        console.log(`  ${theme.accent(r.file)}:${theme.success(String(r.line))}`);
        // Highlight the match in the snippet
        const highlighted = r.snippet.replace(
          new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
          (match) => theme.bold(theme.success(match))
        );
        for (const line of highlighted.split("\n")) {
          console.log(`    ${theme.muted(line)}`);
        }
        console.log("");
      }
      console.log(theme.muted(`  ${results.length} result(s)\n`));
      break;
    }

    case "read": {
      const filename = args[1];
      if (!filename) {
        console.error(theme.error("Usage: backbone memory read <filename>"));
        process.exit(1);
      }

      const filePath = memoryFile(filename);
      if (!fs.existsSync(filePath)) {
        console.error(theme.error(`File not found: ${filename}`));
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, "utf-8");
      if (jsonMode) {
        console.log(JSON.stringify({ file: filename, content }));
      } else {
        console.log(content);
      }
      break;
    }

    case "status": {
      const files = getMemoryFiles();
      const dir = getMemoryDir();
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);

      const result = {
        directory: dir,
        fileCount: files.length,
        totalSizeKB: Math.round(totalSize / 1024),
        files: files.map(f => ({ name: f.name, sizeKB: Math.round(f.size / 1024) })),
      };

      if (jsonMode) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(theme.heading("\n  Memory Status\n"));
      console.log(label("Directory", dir));
      console.log(label("Files", String(files.length)));
      console.log(label("Total size", `${(totalSize / 1024).toFixed(1)}KB`));

      // Check for important files
      const important = ["BACKBONE.md", "thesis.md", "profile.md", "portfolio.md", "health.md", "goals.md"];
      console.log(section("Core Files"));
      for (const name of important) {
        const found = files.find(f => f.name === name);
        if (found) {
          console.log(ok(`${name} (${(found.size / 1024).toFixed(1)}KB)`));
        } else {
          console.log(warn(`${name} not found`));
        }
      }
      console.log("");
      break;
    }

    default:
      console.error(theme.error(`Unknown action: ${action}`));
      console.log(HELP);
      process.exit(1);
  }
}
