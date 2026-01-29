/**
 * Tests for Project Research Manager
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs module
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn((path) => {
      if (path.includes("projects") && !path.includes("test-project")) return true;
      if (path.includes("PROJECT.md")) return true;
      return false;
    }),
    readFileSync: vi.fn(() => `# Test Project
**Status:** active
**Category:** research
**Priority:** high

## Key Findings
_No findings yet._

## Progress Log
### 2026-01-28
- Created
`),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => [
      { name: "market-analysis", isDirectory: () => true },
      { name: ".hidden", isDirectory: () => true }
    ])
  },
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => "{}"),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => [])
}));

import ProjectResearchManager from "../src/services/project-research-manager.js";

describe("ProjectResearchManager", () => {
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ProjectResearchManager();
  });

  describe("extractMetadata", () => {
    it("should extract status from PROJECT.md content", () => {
      const content = "**Status:** active\n**Category:** finance";
      const metadata = manager.extractMetadata(content);

      expect(metadata.status).toBe("active");
      expect(metadata.category).toBe("finance");
    });

    it("should extract priority from content", () => {
      const content = "**Priority:** high";
      const metadata = manager.extractMetadata(content);

      expect(metadata.priority).toBe("high");
    });

    it("should return defaults for missing fields", () => {
      const content = "Some random content";
      const metadata = manager.extractMetadata(content);

      expect(metadata.status).toBe("unknown");
      expect(metadata.category).toBe("general");
      expect(metadata.priority).toBe("medium");
    });
  });

  describe("generateProjectMd", () => {
    it("should generate valid markdown with config", () => {
      const config = {
        name: "Test Project",
        status: "active",
        category: "research",
        priority: "high",
        summary: "A test project",
        objectives: ["Objective 1", "Objective 2"],
        createdAt: "2026-01-28T00:00:00.000Z"
      };

      const content = manager.generateProjectMd(config);

      expect(content).toContain("# Test Project");
      expect(content).toContain("**Status:** active");
      expect(content).toContain("**Category:** research");
      expect(content).toContain("**Priority:** high");
      expect(content).toContain("A test project");
      expect(content).toContain("1. Objective 1");
      expect(content).toContain("2. Objective 2");
    });

    it("should include all required sections", () => {
      const config = {
        name: "Test",
        status: "active",
        category: "test",
        priority: "medium",
        summary: "Test",
        objectives: ["Test"]
      };

      const content = manager.generateProjectMd(config);

      expect(content).toContain("## Executive Summary");
      expect(content).toContain("## Objectives");
      expect(content).toContain("## Key Findings");
      expect(content).toContain("## Research Data");
      expect(content).toContain("## Sources & References");
      expect(content).toContain("## Analysis");
      expect(content).toContain("## Action Items");
      expect(content).toContain("## Progress Log");
      expect(content).toContain("## Attachments");
      expect(content).toContain("## Metadata");
    });
  });

  describe("getProjectSummary", () => {
    it("should return null for non-existent project", () => {
      const summary = manager.getProjectSummary("non-existent");
      expect(summary).toBeNull();
    });
  });

  describe("getAllProjects", () => {
    it("should return array of project summaries", () => {
      const projects = manager.getAllProjects();
      expect(Array.isArray(projects)).toBe(true);
    });
  });
});
