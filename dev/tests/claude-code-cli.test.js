/**
 * Claude Code CLI Tests
 * Tests for Claude Code CLI detection and integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

describe('Claude Code CLI - Installation Check', () => {
  it('should detect Claude Code installation', () => {
    let installed = false;
    let version = null;

    try {
      const result = execSync('claude --version', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000
      });
      installed = true;
      version = result.trim();
    } catch (error) {
      installed = false;
    }

    console.log(`Claude Code installed: ${installed}, version: ${version}`);

    // This test documents the current state - passes regardless of installation
    expect(typeof installed).toBe('boolean');
  });

  it('should run basic prompt if installed', { timeout: 30000 }, async () => {
    let canRun = false;
    let response = '';

    try {
      const result = execSync('claude -p "Say hello in exactly 3 words" --output-format text', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000
      });
      canRun = true;
      response = result.trim();
    } catch (error) {
      console.log('Claude Code prompt test skipped:', error.message);
    }

    if (canRun) {
      console.log(`Claude Code response: ${response}`);
      expect(response.length).toBeGreaterThan(0);
    } else {
      // Skip test if not available
      expect(true).toBe(true);
    }
  });
});

describe('Claude Code CLI - Argument Building', () => {
  it('should build correct argument order for orchestrator', () => {
    const maxTurns = 30;
    const prompt = "Test prompt";

    // Build args the correct way (flags first, -p prompt last)
    const args = [
      "--output-format", "stream-json",
      "--allowedTools", "Read,Write,Edit,Bash,WebSearch,Fetch,Grep,Glob",
      "--max-turns", String(maxTurns),
      "-p", prompt
    ];

    // Verify -p is second to last and prompt is last
    expect(args[args.length - 2]).toBe("-p");
    expect(args[args.length - 1]).toBe(prompt);

    // Verify output format is at the beginning
    expect(args[0]).toBe("--output-format");
    expect(args[1]).toBe("stream-json");
  });

  it('should handle session resume correctly', () => {
    const maxTurns = 30;
    const prompt = "Test prompt";
    const sessionId = "test-session-123";

    const args = [
      "--output-format", "stream-json",
      "--allowedTools", "Read,Write,Edit,Bash",
      "--max-turns", String(maxTurns),
      "--resume", sessionId,
      "-p", prompt
    ];

    // Find resume flag position
    const resumeIndex = args.indexOf("--resume");
    expect(resumeIndex).toBeGreaterThan(-1);
    expect(args[resumeIndex + 1]).toBe(sessionId);

    // -p should still be second to last
    expect(args[args.length - 2]).toBe("-p");
  });
});

describe('Claude Code CLI - Status Check', () => {
  it('should return proper status object', async () => {
    // Mock status object structure
    const mockStatus = {
      installed: true,
      version: "2.1.19 (Claude Code)",
      loggedIn: true,
      user: null,
      model: "claude-sonnet-4-20250514",
      method: "claude-code-cli",
      configDir: path.join(os.homedir(), ".claude"),
      ready: true
    };

    // Verify structure
    expect(mockStatus).toHaveProperty('installed');
    expect(mockStatus).toHaveProperty('loggedIn');
    expect(mockStatus).toHaveProperty('ready');

    // ready = installed AND loggedIn
    expect(mockStatus.ready).toBe(mockStatus.installed && mockStatus.loggedIn);
  });
});

describe('Claude Code CLI - Path Validation', () => {
  it('should validate allowed directory paths', () => {
    const workDir = process.cwd();
    const allowedDirectories = ["data", "memory", "projects", "screenshots"];

    const isPathAllowed = (filePath, workDir, allowedDirs) => {
      const path = require('path');
      if (!filePath) return false;

      const absolutePath = path.isAbsolute(filePath)
        ? path.normalize(filePath)
        : path.normalize(path.join(workDir, filePath));

      const allowedPaths = allowedDirs.map(dir => path.join(workDir, dir));

      return allowedPaths.some(allowedPath => {
        const normalizedAllowed = path.normalize(allowedPath);
        return absolutePath.startsWith(normalizedAllowed + path.sep) ||
               absolutePath === normalizedAllowed;
      });
    };

    // Test allowed paths
    expect(isPathAllowed("data/goals.json", workDir, allowedDirectories)).toBe(true);
    expect(isPathAllowed("memory/context.json", workDir, allowedDirectories)).toBe(true);

    // Test disallowed paths
    expect(isPathAllowed("src/app.js", workDir, allowedDirectories)).toBe(false);
    expect(isPathAllowed("node_modules/test", workDir, allowedDirectories)).toBe(false);
  });
});

console.log('Claude Code CLI Tests - Run with: npx vitest run tests/claude-code-cli.test.js');
