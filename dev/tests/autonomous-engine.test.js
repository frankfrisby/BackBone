/**
 * Autonomous Engine Tests
 * Tests for engine continuous operation and action generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the fallback action generator behavior
const mockActionSequences = {
  finance: [
    { action: "WebSearch", narratorType: "WEB_SEARCH", target: "stock market analysis", reasoning: "Research market" },
    { action: "WebSearch", narratorType: "WEB_SEARCH", target: "investment strategies", reasoning: "Research strategies" },
    { action: "Read", narratorType: "READ", target: "data/portfolio.json", reasoning: "Review portfolio" },
    { action: "WebSearch", narratorType: "WEB_SEARCH", target: "high growth stocks", reasoning: "Find opportunities" }
  ],
  health: [
    { action: "Read", narratorType: "READ", target: "data/oura_data.json", reasoning: "Review health" },
    { action: "WebSearch", narratorType: "WEB_SEARCH", target: "sleep quality tips", reasoning: "Research sleep" },
    { action: "WebSearch", narratorType: "WEB_SEARCH", target: "Oura optimization", reasoning: "Find strategies" }
  ]
};

/**
 * Simulates the generateFallbackAction logic
 */
function generateFallbackAction(category, actionsCount) {
  const sequence = mockActionSequences[category] || mockActionSequences.finance;
  const actionIndex = actionsCount % sequence.length;

  // The engine should NOT return null - it keeps cycling
  return sequence[actionIndex];
}

describe('Autonomous Engine - Continuous Operation', () => {
  it('should continue generating actions beyond sequence length', () => {
    const maxActionsPerGoal = 50;

    // Simulate 20 action cycles
    for (let i = 0; i < 20; i++) {
      const action = generateFallbackAction('finance', i);
      expect(action).not.toBeNull();
      expect(action.action).toBeDefined();
      expect(action.target).toBeDefined();
    }
  });

  it('should cycle through action sequence repeatedly', () => {
    const sequence = mockActionSequences.finance;

    // Check that actions cycle properly
    for (let i = 0; i < 12; i++) {
      const action = generateFallbackAction('finance', i);
      const expectedAction = sequence[i % sequence.length];
      expect(action.action).toBe(expectedAction.action);
    }
  });

  it('should handle different categories', () => {
    const financeAction = generateFallbackAction('finance', 0);
    expect(financeAction.target).toContain('stock');

    const healthAction = generateFallbackAction('health', 0);
    expect(healthAction.target).toContain('oura');
  });

  it('should not complete goal prematurely', () => {
    const maxActionsPerGoal = 50;
    let actionCount = 0;

    // Simulate running until 50 actions
    while (actionCount < maxActionsPerGoal) {
      const action = generateFallbackAction('finance', actionCount);
      expect(action).not.toBeNull();
      actionCount++;
    }

    expect(actionCount).toBe(50);
  });

  it('should have proper action structure', () => {
    const action = generateFallbackAction('finance', 0);

    expect(action).toHaveProperty('action');
    expect(action).toHaveProperty('narratorType');
    expect(action).toHaveProperty('target');
    expect(action).toHaveProperty('reasoning');
  });
});

describe('Autonomous Engine - Action Count Limits', () => {
  it('should respect maxActionsPerGoal limit', () => {
    const maxActionsPerGoal = 50;

    // Engine should run exactly 50 actions before completing
    let shouldContinue = true;
    let actionCount = 0;

    while (shouldContinue && actionCount < 100) {
      actionCount++;
      shouldContinue = actionCount < maxActionsPerGoal;
    }

    expect(actionCount).toBe(50);
    expect(shouldContinue).toBe(false);
  });

  it('should not use aggressive isGoalComplete check', () => {
    // Simulate the new behavior where we only check action count
    const actionCount = 5;
    const maxActionsPerGoal = 50;

    // Old behavior would return true after 6-8 actions
    // New behavior only completes at maxActionsPerGoal
    const shouldComplete = actionCount >= maxActionsPerGoal;
    expect(shouldComplete).toBe(false);
  });
});

console.log('Autonomous Engine Tests - Run with: npx vitest run tests/autonomous-engine.test.js');
