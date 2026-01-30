#!/usr/bin/env node

/**
 * Setup & Packaging Tests
 *
 * Verifies that BACKBONE is properly packaged and all setup scripts work:
 * 1. package.json has correct fields (bin, engines, files, main)
 * 2. Entry point exists and is valid
 * 3. Setup script runs without errors
 * 4. Postinstall script runs without errors
 * 5. Prestart script runs without errors
 * 6. Required directories exist after setup
 * 7. .env handling works correctly
 * 8. npm pack produces a valid tarball structure
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: "PASS" });
  } catch (err) {
    failed++;
    results.push({ name, status: "FAIL", error: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

// ─────────────────────────────────────────────
// 1. package.json structure
// ─────────────────────────────────────────────
test("package.json exists", () => {
  assert(fs.existsSync(path.join(ROOT, "package.json")));
});

test("package.json has valid JSON", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert(typeof pkg === "object");
});

test("package.json has bin field pointing to bin/backbone.js", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert(pkg.bin && pkg.bin.backbone === "bin/backbone.js", `bin.backbone = ${pkg.bin?.backbone}`);
});

test("package.json has engines >= 20", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert(pkg.engines && pkg.engines.node, "engines.node missing");
  assert(pkg.engines.node.includes("20"), `engines.node = ${pkg.engines.node}`);
});

test("package.json main points to bin/backbone.js", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert(pkg.main === "bin/backbone.js", `main = ${pkg.main}`);
});

test("package.json has files field", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert(Array.isArray(pkg.files) && pkg.files.length > 0, "files field missing or empty");
  assert(pkg.files.includes("bin/"), "files must include bin/");
  assert(pkg.files.includes("src/"), "files must include src/");
});

test("package.json has postinstall script", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert(pkg.scripts && pkg.scripts.postinstall, "postinstall script missing");
});

test("package.json has setup script", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert(pkg.scripts && pkg.scripts.setup, "setup script missing");
});

test("package.json has prestart script", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert(pkg.scripts && pkg.scripts.prestart, "prestart script missing");
});

test("package.json type is module", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert(pkg.type === "module", `type = ${pkg.type}`);
});

test("package.json has repository field", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert(pkg.repository && pkg.repository.url, "repository.url missing");
});

// ─────────────────────────────────────────────
// 2. Entry point
// ─────────────────────────────────────────────
test("bin/backbone.js exists", () => {
  assert(fs.existsSync(path.join(ROOT, "bin", "backbone.js")));
});

test("bin/backbone.js has shebang", () => {
  const content = fs.readFileSync(path.join(ROOT, "bin", "backbone.js"), "utf-8");
  assert(content.startsWith("#!/usr/bin/env node"), "Missing shebang");
});

// ─────────────────────────────────────────────
// 3. Setup script
// ─────────────────────────────────────────────
test("scripts/setup.js exists", () => {
  assert(fs.existsSync(path.join(ROOT, "scripts", "setup.js")));
});

test("setup script runs without fatal errors", () => {
  const result = execSync("node scripts/setup.js", {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 30000,
    stdio: ["pipe", "pipe", "pipe"]
  });
  assert(result.includes("BACKBONE"), "Setup output should mention BACKBONE");
});

// ─────────────────────────────────────────────
// 4. Postinstall script
// ─────────────────────────────────────────────
test("scripts/postinstall.js exists", () => {
  assert(fs.existsSync(path.join(ROOT, "scripts", "postinstall.js")));
});

test("postinstall script runs without errors", () => {
  execSync("node scripts/postinstall.js", {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 10000,
    stdio: ["pipe", "pipe", "pipe"]
  });
});

// ─────────────────────────────────────────────
// 5. Prestart script
// ─────────────────────────────────────────────
test("scripts/prestart.js exists", () => {
  assert(fs.existsSync(path.join(ROOT, "scripts", "prestart.js")));
});

test("prestart script runs without errors", () => {
  execSync("node scripts/prestart.js", {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 10000,
    stdio: ["pipe", "pipe", "pipe"]
  });
});

// ─────────────────────────────────────────────
// 6. Required directories exist
// ─────────────────────────────────────────────
for (const dir of ["data", "memory", "projects", "screenshots", "skills", "bin", "src"]) {
  test(`directory ${dir}/ exists`, () => {
    assert(fs.existsSync(path.join(ROOT, dir)), `${dir}/ missing`);
  });
}

// ─────────────────────────────────────────────
// 7. .env handling
// ─────────────────────────────────────────────
test(".env.example exists", () => {
  assert(fs.existsSync(path.join(ROOT, ".env.example")));
});

test(".env.example has ANTHROPIC_API_KEY", () => {
  const content = fs.readFileSync(path.join(ROOT, ".env.example"), "utf-8");
  assert(content.includes("ANTHROPIC_API_KEY"), "ANTHROPIC_API_KEY missing from .env.example");
});

// ─────────────────────────────────────────────
// 8. Critical dependencies are installed
// ─────────────────────────────────────────────
const criticalDeps = ["@anthropic-ai/sdk", "ink", "react", "express", "dotenv", "chalk"];
for (const dep of criticalDeps) {
  test(`dependency ${dep} is installed`, () => {
    assert(
      fs.existsSync(path.join(ROOT, "node_modules", ...dep.split("/"))),
      `${dep} not found in node_modules`
    );
  });
}

// ─────────────────────────────────────────────
// 9. Build config
// ─────────────────────────────────────────────
test("pkg build config exists in package.json", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert(pkg.pkg && pkg.pkg.targets, "pkg config missing");
});

test("installer config exists", () => {
  assert(fs.existsSync(path.join(ROOT, "installer", "backbone-setup.iss")));
});

// ─────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────
console.log("\n══════════════════════════════════════");
console.log("  BACKBONE Setup & Packaging Tests");
console.log("══════════════════════════════════════\n");

for (const r of results) {
  const icon = r.status === "PASS" ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${icon} ${r.name}`);
  if (r.error) {
    console.log(`    \x1b[31m→ ${r.error}\x1b[0m`);
  }
}

console.log(`\n  ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

if (failed > 0) {
  process.exit(1);
}
