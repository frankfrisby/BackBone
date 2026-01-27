/**
 * Goal Manager Tests
 * Tests for goal management, criteria evaluation, and on-hold functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn()
  },
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn()
}));

// Mock goal-tracker
vi.mock('../services/goal-tracker.js', () => ({
  getGoalTracker: vi.fn(() => ({
    getActive: vi.fn(() => []),
    getAll: vi.fn(() => []),
    createGoal: vi.fn((data) => ({ id: 'test_goal_1', ...data })),
    updateStatus: vi.fn()
  })),
  GOAL_STATUS: {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    FAILED: 'failed'
  },
  GOAL_CATEGORY: {
    FINANCE: 'finance',
    HEALTH: 'health',
    FAMILY: 'family',
    CAREER: 'career',
    GROWTH: 'growth'
  }
}));

// Mock goal-extractor
vi.mock('../services/goal-extractor.js', () => ({
  loadGoals: vi.fn(() => []),
  extractGoalsFromMessage: vi.fn(() => []),
  processMessageForGoals: vi.fn()
}));

// Mock multi-ai
vi.mock('../services/multi-ai.js', () => ({
  sendMessage: vi.fn(() => Promise.resolve(null)),
  getMultiAIConfig: vi.fn(() => ({
    gptThinking: { ready: false },
    gptInstant: { ready: false }
  })),
  TASK_TYPES: {
    PLANNING: 'planning',
    REASONING: 'reasoning'
  }
}));

// Import after mocks
import {
  GoalManager,
  getGoalManager,
  GOAL_STATE,
  TASK_STATE,
  HOLD_REASON,
  WORK_PHASES,
  GOAL_PRIORITY
} from '../services/goal-manager.js';

describe('Goal Manager - Constants', () => {
  it('should export GOAL_STATE with correct values', () => {
    expect(GOAL_STATE.ACTIVE).toBe('active');
    expect(GOAL_STATE.ON_HOLD).toBe('on_hold');
    expect(GOAL_STATE.COMPLETED).toBe('completed');
    expect(GOAL_STATE.FAILED).toBe('failed');
    expect(GOAL_STATE.BLOCKED).toBe('blocked');
  });

  it('should export TASK_STATE with correct values', () => {
    expect(TASK_STATE.PENDING).toBe('pending');
    expect(TASK_STATE.IN_PROGRESS).toBe('in_progress');
    expect(TASK_STATE.ON_HOLD).toBe('on_hold');
    expect(TASK_STATE.COMPLETED).toBe('completed');
    expect(TASK_STATE.BLOCKED).toBe('blocked');
    expect(TASK_STATE.SKIPPED).toBe('skipped');
  });

  it('should export HOLD_REASON with correct values', () => {
    expect(HOLD_REASON.WAITING_EXTERNAL).toBe('waiting_external');
    expect(HOLD_REASON.WAITING_DATA).toBe('waiting_data');
    expect(HOLD_REASON.WAITING_APPROVAL).toBe('waiting_approval');
    expect(HOLD_REASON.WAITING_DEPENDENCY).toBe('waiting_dependency');
    expect(HOLD_REASON.WAITING_TIME).toBe('waiting_time');
    expect(HOLD_REASON.TARGET_NOT_MET).toBe('target_not_met');
  });
});

describe('Goal Manager - Initialization', () => {
  let manager;

  beforeEach(() => {
    manager = new GoalManager();
  });

  it('should start with no current goal', () => {
    expect(manager.currentGoal).toBeNull();
  });

  it('should start with empty goal queue', () => {
    expect(manager.goalQueue).toEqual([]);
  });

  it('should start with empty action history', () => {
    expect(manager.actionHistory).toEqual([]);
  });

  it('should have Maps for criteria and tasks', () => {
    expect(manager.goalCriteria).toBeInstanceOf(Map);
    expect(manager.goalTasks).toBeInstanceOf(Map);
    expect(manager.onHoldTasks).toBeInstanceOf(Map);
    expect(manager.onHoldGoals).toBeInstanceOf(Map);
  });
});

describe('Goal Manager - Work Plan', () => {
  let manager;

  beforeEach(() => {
    manager = new GoalManager();
  });

  it('should convert goal to work plan', () => {
    const goal = {
      id: 'goal_1',
      title: 'Test Goal',
      category: 'growth'
    };

    const plan = manager.goalToWorkPlan(goal);

    expect(plan).not.toBeNull();
    expect(plan.goal).toBe(goal);
    expect(plan.phases).toEqual(Object.values(WORK_PHASES));
    expect(plan.currentPhase).toBe(0);
    expect(plan.progress).toBe(0);
  });

  it('should return null for null goal', () => {
    const plan = manager.goalToWorkPlan(null);
    expect(plan).toBeNull();
  });
});

describe('Goal Manager - Fallback Criteria', () => {
  let manager;

  beforeEach(() => {
    manager = new GoalManager();
  });

  it('should generate fallback criteria for finance goal', () => {
    const goal = {
      id: 'goal_1',
      title: 'Millionaire Portfolio',
      category: 'finance',
      targetValue: 1000000
    };

    const criteria = manager.generateFallbackCriteria(goal);

    expect(criteria).not.toBeNull();
    expect(criteria.criteria).toBeInstanceOf(Array);
    expect(criteria.criteria.length).toBeGreaterThan(0);
    expect(criteria.minimumCriteriaRequired).toBe('all');
    expect(criteria.goalId).toBe('goal_1');
  });

  it('should generate fallback criteria for health goal', () => {
    const goal = {
      id: 'goal_2',
      title: 'Improve Sleep',
      category: 'health',
      targetValue: 85
    };

    const criteria = manager.generateFallbackCriteria(goal);

    expect(criteria.criteria[0].dataSource).toBe('oura_health');
    expect(criteria.criteria[0].targetValue).toBe(85);
  });

  it('should store criteria in Map', () => {
    const goal = { id: 'goal_3', category: 'growth' };

    manager.generateFallbackCriteria(goal);

    expect(manager.goalCriteria.has('goal_3')).toBe(true);
  });
});

describe('Goal Manager - Fallback Detailed Plan', () => {
  let manager;

  beforeEach(() => {
    manager = new GoalManager();
  });

  it('should generate fallback detailed plan', () => {
    const goal = {
      id: 'goal_1',
      title: 'Test Goal',
      category: 'growth'
    };
    const criteria = manager.generateFallbackCriteria(goal);
    const plan = manager.generateFallbackDetailedPlan(goal, criteria);

    expect(plan).not.toBeNull();
    expect(plan.strategy).toContain('Test Goal');
    expect(plan.tasks).toBeInstanceOf(Array);
    expect(plan.tasks.length).toBeGreaterThan(0);
  });

  it('should create tasks with proper structure', () => {
    const goal = { id: 'goal_1', title: 'Test', category: 'growth' };
    const plan = manager.generateFallbackDetailedPlan(goal, null);

    const task = plan.tasks[0];
    expect(task).toHaveProperty('id');
    expect(task).toHaveProperty('title');
    expect(task).toHaveProperty('category');
    expect(task).toHaveProperty('state');
    expect(task.state).toBe(TASK_STATE.PENDING);
  });

  it('should store tasks in Map', () => {
    const goal = { id: 'goal_1', title: 'Test', category: 'growth' };
    manager.generateFallbackDetailedPlan(goal, null);

    expect(manager.goalTasks.has('goal_1')).toBe(true);
  });
});

describe('Goal Manager - Task Management', () => {
  let manager;

  beforeEach(() => {
    manager = new GoalManager();
    manager.currentGoal = { id: 'goal_1', title: 'Test Goal' };

    // Set up tasks (including results array for completeTask)
    manager.goalTasks.set('goal_1', [
      { id: 'task_1', title: 'Task 1', state: TASK_STATE.PENDING, dependencies: [], results: [] },
      { id: 'task_2', title: 'Task 2', state: TASK_STATE.PENDING, dependencies: ['task_1'], results: [] },
      { id: 'task_3', title: 'Task 3', state: TASK_STATE.PENDING, dependencies: [], results: [] }
    ]);
  });

  it('should get next available task', () => {
    const task = manager.getNextTask('goal_1');

    expect(task).not.toBeNull();
    expect(task.id).toBe('task_1');
  });

  it('should skip task with unmet dependencies', () => {
    // Task 2 depends on task 1, so it should be skipped
    const tasks = manager.goalTasks.get('goal_1');
    tasks[0].state = TASK_STATE.ON_HOLD; // Put task 1 on hold

    const task = manager.getNextTask('goal_1');

    // Should get task 3 (no dependencies)
    expect(task.id).toBe('task_3');
  });

  it('should complete a task', () => {
    const success = manager.completeTask('task_1', { output: 'done' });

    expect(success).toBe(true);

    const tasks = manager.goalTasks.get('goal_1');
    const task = tasks.find(t => t.id === 'task_1');
    expect(task.state).toBe(TASK_STATE.COMPLETED);
    expect(task.completedAt).toBeDefined();
  });

  it('should put task on hold', () => {
    const reviewAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const success = manager.putTaskOnHold('task_1', HOLD_REASON.WAITING_EXTERNAL, reviewAt, 'Test note');

    expect(success).toBe(true);

    const tasks = manager.goalTasks.get('goal_1');
    const task = tasks.find(t => t.id === 'task_1');
    expect(task.state).toBe(TASK_STATE.ON_HOLD);

    expect(manager.onHoldTasks.has('task_1')).toBe(true);
  });
});

describe('Goal Manager - On-Hold Goals', () => {
  let manager;

  beforeEach(() => {
    manager = new GoalManager();
    manager.currentGoal = { id: 'goal_1', title: 'Test Goal', status: 'active' };
  });

  it('should put goal on hold', () => {
    const reviewAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const success = manager.putGoalOnHold('goal_1', HOLD_REASON.TARGET_NOT_MET, reviewAt, 'Waiting for criteria');

    expect(success).toBe(true);
    expect(manager.onHoldGoals.has('goal_1')).toBe(true);

    const holdInfo = manager.onHoldGoals.get('goal_1');
    expect(holdInfo.reason).toBe(HOLD_REASON.TARGET_NOT_MET);
  });
});

describe('Goal Manager - Goal Status', () => {
  let manager;

  beforeEach(() => {
    manager = new GoalManager();
    manager.currentGoal = { id: 'goal_1', title: 'Test Goal' };

    // Set up tasks
    manager.goalTasks.set('goal_1', [
      { id: 'task_1', state: TASK_STATE.COMPLETED },
      { id: 'task_2', state: TASK_STATE.PENDING },
      { id: 'task_3', state: TASK_STATE.ON_HOLD }
    ]);
  });

  it('should return goal status with task stats', () => {
    const status = manager.getGoalStatus('goal_1');

    expect(status).not.toBeNull();
    expect(status.taskStats.total).toBe(3);
    expect(status.taskStats.completed).toBe(1);
    expect(status.taskStats.pending).toBe(1);
    expect(status.taskStats.onHold).toBe(1);
  });

  it('should return on_hold visual state when goal is on hold', () => {
    manager.putGoalOnHold('goal_1', HOLD_REASON.TARGET_NOT_MET);

    const status = manager.getGoalStatus('goal_1');

    expect(status.visualState).toBe('on_hold');
    expect(status.state).toBe(GOAL_STATE.ON_HOLD);
  });

  it('should calculate progress percentage', () => {
    const status = manager.getGoalStatus('goal_1');

    expect(status.progress).toBe(33); // 1/3 tasks complete = 33%
  });
});

describe('Goal Manager - Message Goal Detection', () => {
  let manager;

  beforeEach(() => {
    manager = new GoalManager();
  });

  it('should detect goal in message with intent indicator', () => {
    expect(manager.messageContainsGoal('I want to find AI jobs')).toBe(true);
    expect(manager.messageContainsGoal('Help me improve my health')).toBe(true);
    expect(manager.messageContainsGoal('Find me stock opportunities')).toBe(true);
  });

  it('should detect goal in message with action verb', () => {
    expect(manager.messageContainsGoal('Research best investments')).toBe(true);
    expect(manager.messageContainsGoal('Analyze my portfolio')).toBe(true);
  });

  it('should not detect goal in simple questions', () => {
    expect(manager.messageContainsGoal('What time is it?')).toBe(false);
    expect(manager.messageContainsGoal('Hello')).toBe(false);
  });

  it('should handle null/empty messages', () => {
    expect(manager.messageContainsGoal(null)).toBe(false);
    expect(manager.messageContainsGoal('')).toBe(false);
  });
});

describe('Goal Manager - Category Detection', () => {
  let manager;

  beforeEach(() => {
    manager = new GoalManager();
  });

  it('should detect finance category', () => {
    expect(manager.detectCategory('invest in stocks')).toBe('finance');
    expect(manager.detectCategory('manage portfolio')).toBe('finance');
    expect(manager.detectCategory('find high paying job')).toBe('finance');
  });

  it('should detect health category', () => {
    expect(manager.detectCategory('improve sleep quality')).toBe('health');
    expect(manager.detectCategory('exercise routine')).toBe('health');
  });

  it('should detect career category', () => {
    expect(manager.detectCategory('update linkedin profile')).toBe('career');
    expect(manager.detectCategory('prepare for interview')).toBe('career');
  });

  it('should default to growth for unknown', () => {
    expect(manager.detectCategory('random task')).toBe('growth');
  });
});

describe('Goal Manager - Singleton', () => {
  it('should return singleton instance', () => {
    const instance1 = getGoalManager();
    const instance2 = getGoalManager();

    expect(instance1).toBe(instance2);
  });
});

describe('Goal Manager - Display Data', () => {
  let manager;

  beforeEach(() => {
    manager = new GoalManager();
    manager.currentGoal = { id: 'goal_1', title: 'Test Goal' };
  });

  it('should return display data with current goal', () => {
    const data = manager.getDisplayData();

    expect(data.currentGoal).toBe(manager.currentGoal);
    expect(data).toHaveProperty('workPlan');
    expect(data).toHaveProperty('actionHistory');
    expect(data).toHaveProperty('goalStatus');
    expect(data).toHaveProperty('onHoldTasks');
    expect(data).toHaveProperty('onHoldGoals');
  });

  it('should include on-hold tasks in display data', () => {
    manager.goalTasks.set('goal_1', [
      { id: 'task_1', state: TASK_STATE.ON_HOLD }
    ]);
    manager.onHoldTasks.set('task_1', {
      reason: HOLD_REASON.WAITING_EXTERNAL,
      reviewAt: new Date().toISOString()
    });

    const data = manager.getDisplayData();

    expect(data.onHoldTasks.length).toBe(1);
    expect(data.onHoldTasks[0].taskId).toBe('task_1');
  });
});

describe('Goal Manager - Phase Advancement', () => {
  let manager;

  beforeEach(() => {
    manager = new GoalManager();
    manager.currentGoal = { id: 'goal_1', title: 'Test Goal' };
    manager.currentWorkPlan = manager.goalToWorkPlan(manager.currentGoal);
  });

  it('should advance to next phase', () => {
    const initialPhase = manager.currentWorkPlan.currentPhase;
    const advanced = manager.advancePhase();

    expect(advanced).toBe(true);
    expect(manager.currentWorkPlan.currentPhase).toBe(initialPhase + 1);
  });

  it('should return false at last phase', () => {
    // Move to last phase
    manager.currentWorkPlan.currentPhase = manager.currentWorkPlan.phases.length - 1;

    const advanced = manager.advancePhase();

    expect(advanced).toBe(false);
  });

  it('should update progress on phase advance', () => {
    manager.advancePhase();

    expect(manager.currentWorkPlan.progress).toBeGreaterThan(0);
  });
});

describe('Goal Manager - Action Recording', () => {
  let manager;

  beforeEach(() => {
    manager = new GoalManager();
    manager.currentGoal = { id: 'goal_1', title: 'Test Goal' };
    manager.currentWorkPlan = manager.goalToWorkPlan(manager.currentGoal);
  });

  it('should record an action', () => {
    const record = manager.recordAction(
      { action: 'WebSearch', target: 'test query' },
      { success: true, output: 'results' }
    );

    expect(record).toHaveProperty('timestamp');
    expect(record.action).toEqual({ action: 'WebSearch', target: 'test query' });
    expect(manager.actionHistory.length).toBe(1);
  });

  it('should limit action history to 50', () => {
    // Add 60 actions
    for (let i = 0; i < 60; i++) {
      manager.recordAction({ action: 'Test', target: `test_${i}` }, { success: true });
    }

    expect(manager.actionHistory.length).toBe(50);
  });
});

console.log('Goal Manager Tests - Run with: npx vitest run src/tests/goal-manager.test.js');
