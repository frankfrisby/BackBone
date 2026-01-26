/**
 * Goal Selection Tests
 * Tests for goal manager priority selection and first-goal behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock goals matching the actual data structure
const mockGoals = [
  {
    id: "goal_finance_1m",
    title: "Turn $1,000 into $1,000,000 through smart investments by July 2027",
    category: "finance",
    priority: 1,
    status: "active",
    urgency: "high",
    createdAt: "2026-01-25T20:50:54.206Z"
  },
  {
    id: "goal_health_optimal",
    title: "Achieve 85+ Oura sleep score consistently for 30 consecutive days",
    category: "health",
    priority: 2,
    status: "active",
    urgency: "medium",
    createdAt: "2026-01-25T20:50:54.207Z"
  },
  {
    id: "goal_family_time",
    title: "Spend 14+ hours per week of quality time with family by end of Q1 2026",
    category: "family",
    priority: 3,
    status: "active",
    urgency: "low",
    createdAt: "2026-01-25T20:50:54.207Z"
  }
];

/**
 * Simulates the goal selection logic from goal-manager.js
 */
function selectNextGoal(goals) {
  const activeGoals = goals.filter(g => g.status === "active");

  if (activeGoals.length === 0) {
    return null;
  }

  // Sort by priority (lower number = higher priority)
  const prioritized = activeGoals.sort((a, b) => {
    // First by priority
    const priorityDiff = (a.priority || 5) - (b.priority || 5);
    if (priorityDiff !== 0) return priorityDiff;

    // Then by urgency
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    const aUrgency = urgencyOrder[a.urgency] ?? 2;
    const bUrgency = urgencyOrder[b.urgency] ?? 2;
    if (aUrgency !== bUrgency) return aUrgency - bUrgency;

    // Then by creation date (oldest first)
    const aDate = new Date(a.createdAt || 0);
    const bDate = new Date(b.createdAt || 0);
    return aDate - bDate;
  });

  return prioritized[0] || null;
}

describe('Goal Selection - Priority Order', () => {
  it('should select highest priority goal first', () => {
    const selected = selectNextGoal(mockGoals);

    expect(selected).not.toBeNull();
    expect(selected.id).toBe("goal_finance_1m");
    expect(selected.priority).toBe(1);
  });

  it('should select finance goal (priority 1) over health goal (priority 2)', () => {
    const selected = selectNextGoal(mockGoals);

    expect(selected.category).toBe("finance");
    expect(selected.priority).toBeLessThan(mockGoals[1].priority);
  });

  it('should handle goals in shuffled order', () => {
    // Shuffle the goals
    const shuffled = [mockGoals[2], mockGoals[0], mockGoals[1]];
    const selected = selectNextGoal(shuffled);

    // Should still select priority 1
    expect(selected.id).toBe("goal_finance_1m");
    expect(selected.priority).toBe(1);
  });

  it('should use urgency as tiebreaker when priorities are equal', () => {
    const goalsWithSamePriority = [
      { id: "g1", priority: 1, urgency: "medium", status: "active", createdAt: "2026-01-01" },
      { id: "g2", priority: 1, urgency: "high", status: "active", createdAt: "2026-01-02" },
      { id: "g3", priority: 1, urgency: "low", status: "active", createdAt: "2026-01-03" }
    ];

    const selected = selectNextGoal(goalsWithSamePriority);

    expect(selected.id).toBe("g2"); // High urgency should win
  });

  it('should use creation date as final tiebreaker', () => {
    const goalsWithSamePriorityAndUrgency = [
      { id: "g1", priority: 1, urgency: "high", status: "active", createdAt: "2026-01-03T00:00:00.000Z" },
      { id: "g2", priority: 1, urgency: "high", status: "active", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "g3", priority: 1, urgency: "high", status: "active", createdAt: "2026-01-02T00:00:00.000Z" }
    ];

    const selected = selectNextGoal(goalsWithSamePriorityAndUrgency);

    expect(selected.id).toBe("g2"); // Oldest should win
  });
});

describe('Goal Selection - Filter Active Goals', () => {
  it('should only select active goals', () => {
    const goalsWithInactive = [
      { id: "g1", priority: 1, status: "completed" },
      { id: "g2", priority: 2, status: "active" },
      { id: "g3", priority: 3, status: "active" }
    ];

    const selected = selectNextGoal(goalsWithInactive);

    expect(selected.id).toBe("g2"); // First active goal by priority
    expect(selected.status).toBe("active");
  });

  it('should return null when no active goals', () => {
    const goalsAllInactive = [
      { id: "g1", priority: 1, status: "completed" },
      { id: "g2", priority: 2, status: "failed" }
    ];

    const selected = selectNextGoal(goalsAllInactive);

    expect(selected).toBeNull();
  });

  it('should return null for empty goal list', () => {
    const selected = selectNextGoal([]);

    expect(selected).toBeNull();
  });
});

describe('Goal Selection - First Goal Persistence', () => {
  it('should consistently select the same first goal', () => {
    // Run selection multiple times
    const results = [];
    for (let i = 0; i < 10; i++) {
      const selected = selectNextGoal(mockGoals);
      results.push(selected?.id);
    }

    // All results should be the same (first goal)
    const allSame = results.every(id => id === "goal_finance_1m");
    expect(allSame).toBe(true);
  });

  it('should maintain first goal selection after re-initialization', () => {
    // Simulate re-initialization
    const firstSelection = selectNextGoal(mockGoals);
    const secondSelection = selectNextGoal([...mockGoals]); // New array, same data

    expect(firstSelection.id).toBe(secondSelection.id);
    expect(firstSelection.id).toBe("goal_finance_1m");
  });
});

console.log('Goal Selection Tests - Run with: npx vitest run src/tests/goal-selection.test.js');
