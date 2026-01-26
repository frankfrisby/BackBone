# Claude Code CLI Skill

Use Claude Code CLI for AI-powered development assistance.

## Installation
```bash
npm install -g @anthropic-ai/claude-code
```

## Authentication
```bash
# Login with Anthropic account
claude login

# Or set API key
export ANTHROPIC_API_KEY=your-api-key
```

## Basic Usage

```bash
# Start interactive mode
claude

# Run with a prompt
claude "explain this codebase"

# Run on specific files
claude "refactor this function" src/utils.js

# Run in non-interactive mode
claude --print "what does this code do" src/main.js
```

## Programmatic Usage

```javascript
import { spawn } from 'child_process';

class ClaudeCodeCLI {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.timeout = options.timeout || 300000; // 5 minutes
  }

  // Run Claude Code with a prompt
  async run(prompt, files = []) {
    return new Promise((resolve, reject) => {
      const args = ['--print', prompt, ...files];
      const proc = spawn('claude', args, {
        cwd: this.cwd,
        timeout: this.timeout
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: stdout });
        } else {
          reject({ success: false, error: stderr, code });
        }
      });

      proc.on('error', reject);
    });
  }

  // Code review
  async review(files) {
    return await this.run(`Review this code for bugs, security issues, and improvements`, files);
  }

  // Generate tests
  async generateTests(files) {
    return await this.run(`Generate comprehensive unit tests for this code`, files);
  }

  // Explain code
  async explain(files) {
    return await this.run(`Explain what this code does in detail`, files);
  }

  // Refactor code
  async refactor(files, instructions) {
    return await this.run(`Refactor this code: ${instructions}`, files);
  }

  // Fix bugs
  async fix(files, bugDescription) {
    return await this.run(`Fix this bug: ${bugDescription}`, files);
  }

  // Document code
  async document(files) {
    return await this.run(`Add comprehensive documentation and comments to this code`, files);
  }

  // Convert code
  async convert(files, targetLanguage) {
    return await this.run(`Convert this code to ${targetLanguage}`, files);
  }

  // Security audit
  async securityAudit(files) {
    return await this.run(`Perform a security audit on this code. Identify vulnerabilities and suggest fixes`, files);
  }
}
```

## Common Tasks

```javascript
const claude = new ClaudeCodeCLI();

// Review a file
const review = await claude.review(['src/api/auth.js']);
console.log(review.output);

// Generate tests
const tests = await claude.generateTests(['src/utils/helpers.js']);

// Explain complex code
const explanation = await claude.explain(['src/core/engine.js']);

// Refactor with specific instructions
const refactored = await claude.refactor(
  ['src/legacy/old-module.js'],
  'Use modern ES6+ syntax, add TypeScript types, improve error handling'
);

// Fix a specific bug
const fixed = await claude.fix(
  ['src/api/users.js'],
  'Users are not being validated before database insert'
);

// Security audit
const audit = await claude.securityAudit(['src/api/*.js']);
```

## Batch Processing

```javascript
async function batchProcess(tasks) {
  const claude = new ClaudeCodeCLI();
  const results = [];

  for (const task of tasks) {
    try {
      const result = await claude.run(task.prompt, task.files);
      results.push({ task: task.name, success: true, output: result.output });
    } catch (error) {
      results.push({ task: task.name, success: false, error: error.message });
    }
  }

  return results;
}

// Usage
const results = await batchProcess([
  { name: 'review-auth', prompt: 'Review for security issues', files: ['src/auth.js'] },
  { name: 'test-utils', prompt: 'Generate tests', files: ['src/utils.js'] },
  { name: 'document-api', prompt: 'Add documentation', files: ['src/api.js'] }
]);
```

## Configuration

```javascript
// claude.config.js or in package.json
{
  "claude": {
    "model": "claude-sonnet-4-20250514",
    "maxTokens": 4096,
    "temperature": 0,
    "systemPrompt": "You are a senior software engineer..."
  }
}
```

## MCP Integration

```javascript
// Use with Model Context Protocol servers
const config = {
  mcpServers: {
    filesystem: {
      command: "npx",
      args: ["-y", "@anthropic-ai/mcp-server-filesystem", "/path/to/project"]
    },
    github: {
      command: "npx",
      args: ["-y", "@anthropic-ai/mcp-server-github"],
      env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN }
    }
  }
};
```

## Usage Examples

```bash
# Interactive session
claude

# One-shot commands
claude "find all TODO comments in this project"
claude "create a REST API endpoint for user registration" src/api/
claude "optimize this database query" src/db/queries.js
claude "add input validation" src/forms/

# With specific model
claude --model claude-sonnet-4-20250514 "complex analysis task"

# Output to file
claude --print "generate API docs" src/api/ > docs/api.md
```
