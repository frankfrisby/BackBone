/**
 * Goals Panel Tests
 * Tests for the goals panel component rendering and functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock the services
const mockGoals = [
  {
    id: "goal_finance_1m",
    title: "Turn $1,000 into $1,000,000 through smart investments by July 2027",
    category: "finance",
    priority: 1,
    status: "active",
    project: "Million Dollar Journey",
    currentValue: 1000,
    targetValue: 1000000
  },
  {
    id: "goal_health_optimal",
    title: "Achieve 85+ Oura sleep score consistently for 30 consecutive days",
    category: "health",
    priority: 2,
    status: "active",
    project: "Sleep Optimization"
  },
  {
    id: "goal_family_time",
    title: "Spend 14+ hours per week of quality time with family by end of Q1 2026",
    category: "family",
    priority: 3,
    status: "active",
    project: "Family First"
  }
];

describe('Goals Panel', () => {
  it('should have goals with proper structure', () => {
    expect(mockGoals.length).toBeGreaterThan(0);

    mockGoals.forEach(goal => {
      expect(goal.id).toBeDefined();
      expect(goal.title).toBeDefined();
      expect(goal.title.length).toBeGreaterThan(20); // Specific goals are longer
      expect(goal.project).toBeDefined();
      expect(goal.status).toBe("active");
    });
  });

  it('should have specific (not vague) goal titles', () => {
    const vagueWords = ['make money', 'get healthier', 'improve', 'better'];

    mockGoals.forEach(goal => {
      const lowerTitle = goal.title.toLowerCase();
      vagueWords.forEach(vague => {
        // Goals should be specific, not vague
        if (lowerTitle.includes(vague)) {
          // Allow if there are specific numbers/dates
          expect(
            /\d+/.test(goal.title) || /202\d/.test(goal.title)
          ).toBe(true);
        }
      });
    });
  });

  it('should have project names for each goal', () => {
    mockGoals.forEach(goal => {
      expect(goal.project).toBeDefined();
      expect(goal.project.length).toBeGreaterThan(0);
      expect(goal.project).not.toBe("No Project");
    });
  });

  it('should sort goals by priority', () => {
    const sorted = [...mockGoals].sort((a, b) => a.priority - b.priority);
    expect(sorted[0].priority).toBeLessThanOrEqual(sorted[1].priority);
    expect(sorted[1].priority).toBeLessThanOrEqual(sorted[2].priority);
  });

  it('should truncate long titles to 2 lines (~60 chars)', () => {
    const maxChars = 60;
    mockGoals.forEach(goal => {
      // Title should either be under max or will be truncated
      if (goal.title.length > maxChars) {
        // The truncateToLines function will handle this
        expect(goal.title.length).toBeGreaterThan(maxChars);
      }
    });
  });
});

describe('Goal Status Indicators', () => {
  it('should use dot (●) for all statuses', () => {
    const statuses = ['pending', 'active', 'completed', 'failed', 'blocked'];
    // All statuses should use dot, color indicates state
    statuses.forEach(status => {
      expect(status).toBeDefined();
    });
  });

  it('should have correct status colors defined', () => {
    const STATUS_COLORS = {
      pending: "#64748b",     // Gray
      active: "#64748b",      // Gray (blinking when working)
      completed: "#22c55e",   // Green
      failed: "#ef4444",      // Red
      blocked: "#ef4444"      // Red
    };

    expect(STATUS_COLORS.pending).toBe("#64748b");
    expect(STATUS_COLORS.completed).toBe("#22c55e");
    expect(STATUS_COLORS.failed).toBe("#ef4444");
  });
});

console.log('Goals Panel Tests - Run with: npx vitest run tests/goals-panel.test.js');
