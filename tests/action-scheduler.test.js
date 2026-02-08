/**
 * Action Scheduler Tests
 * Tests for action scheduling, priority queue, and project switching
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ActionScheduler,
  ACTION_PRIORITY,
  ACTION_STATUS,
  RECURRENCE,
  createScheduledAction
} from '../src/services/action-scheduler.js';

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

describe('Action Scheduler - Create Action', () => {
  it('should create action with defaults', () => {
    const action = createScheduledAction({
      type: 'research',
      tool: 'WebSearch',
      target: 'stock analysis'
    });

    expect(action.id).toBeDefined();
    expect(action.type).toBe('research');
    expect(action.tool).toBe('WebSearch');
    expect(action.target).toBe('stock analysis');
    expect(action.priority).toBe(ACTION_PRIORITY.NORMAL);
    expect(action.status).toBe(ACTION_STATUS.PENDING);
  });

  it('should create scheduled action with future time', () => {
    const futureTime = new Date(Date.now() + 60000).toISOString();
    const action = createScheduledAction({
      type: 'report',
      tool: 'Write',
      target: 'report.md',
      scheduledFor: futureTime
    });

    expect(action.status).toBe(ACTION_STATUS.SCHEDULED);
    expect(action.scheduledFor).toBe(futureTime);
  });
});

describe('Action Scheduler - Priority Queue', () => {
  let scheduler;

  beforeEach(() => {
    scheduler = new ActionScheduler();
    scheduler.actionQueue = [];
    scheduler.scheduledActions = [];
  });

  it('should order actions by priority', () => {
    scheduler.scheduleAction({ type: 'low', tool: 'Read', target: 'a', priority: ACTION_PRIORITY.LOW });
    scheduler.scheduleAction({ type: 'high', tool: 'Read', target: 'b', priority: ACTION_PRIORITY.HIGH });
    scheduler.scheduleAction({ type: 'normal', tool: 'Read', target: 'c', priority: ACTION_PRIORITY.NORMAL });

    expect(scheduler.actionQueue[0].type).toBe('high');
    expect(scheduler.actionQueue[1].type).toBe('normal');
    expect(scheduler.actionQueue[2].type).toBe('low');
  });

  it('should execute critical actions first', () => {
    scheduler.scheduleAction({ type: 'normal', tool: 'Read', target: 'a', priority: ACTION_PRIORITY.NORMAL });
    scheduler.scheduleAction({ type: 'critical', tool: 'Read', target: 'b', priority: ACTION_PRIORITY.CRITICAL });

    const next = scheduler.getNextAction();
    expect(next.type).toBe('critical');
  });
});

describe('Action Scheduler - Dependencies', () => {
  let scheduler;

  beforeEach(() => {
    scheduler = new ActionScheduler();
    scheduler.actionQueue = [];
    scheduler.blockedActions = [];
    scheduler.completedActions = [];
  });

  it('should block actions with unmet dependencies', () => {
    const action1 = createScheduledAction({
      id: 'action1',
      type: 'first',
      tool: 'Read',
      target: 'file1'
    });

    const action2 = createScheduledAction({
      type: 'second',
      tool: 'Write',
      target: 'file2',
      dependsOn: ['action1']
    });

    scheduler.scheduleAction(action1);
    scheduler.scheduleAction(action2);

    // Action 2 should be blocked
    expect(scheduler.blockedActions.length).toBe(1);
    expect(scheduler.blockedActions[0].type).toBe('second');
  });

  it('should unblock actions when dependencies complete', () => {
    const action2 = {
      id: 'action2',
      type: 'second',
      tool: 'Write',
      target: 'file2',
      dependsOn: ['action1'],
      status: ACTION_STATUS.BLOCKED
    };

    scheduler.blockedActions.push(action2);

    // Simulate completing dependency
    scheduler.completedActions.push({
      id: 'action1',
      status: ACTION_STATUS.COMPLETED
    });

    scheduler.checkBlockedActions('action1');

    // Action 2 should be unblocked and in queue
    expect(scheduler.blockedActions.length).toBe(0);
    expect(scheduler.actionQueue.length).toBe(1);
    expect(scheduler.actionQueue[0].type).toBe('second');
  });
});

describe('Action Scheduler - Recurrence', () => {
  let scheduler;

  beforeEach(() => {
    scheduler = new ActionScheduler();
    scheduler.scheduledActions = [];
  });

  it('should calculate next run time for hourly recurrence', () => {
    const nextRun = scheduler.calculateNextRun(RECURRENCE.HOURLY);
    const expectedTime = Date.now() + 60 * 60 * 1000;

    expect(nextRun.getTime()).toBeCloseTo(expectedTime, -3); // Within 1 second
  });

  it('should calculate next run time for daily recurrence', () => {
    const nextRun = scheduler.calculateNextRun(RECURRENCE.DAILY);
    const expectedTime = Date.now() + 24 * 60 * 60 * 1000;

    expect(nextRun.getTime()).toBeCloseTo(expectedTime, -3);
  });

  it('should schedule recurrence after completion', () => {
    const action = createScheduledAction({
      type: 'daily-report',
      tool: 'Write',
      target: 'report.md',
      recurrence: RECURRENCE.DAILY
    });

    scheduler.scheduleRecurrence(action);

    expect(scheduler.scheduledActions.length).toBe(1);
    expect(scheduler.scheduledActions[0].recurrence).toBe(RECURRENCE.DAILY);
  });
});

describe('Action Scheduler - Context', () => {
  let scheduler;

  beforeEach(() => {
    scheduler = new ActionScheduler();
  });

  it('should set goal and project context', () => {
    const goal = { id: 'goal1', title: 'Test Goal' };
    const project = { name: 'test-project' };

    scheduler.setContext(goal, project);

    expect(scheduler.currentGoal).toEqual(goal);
    expect(scheduler.currentProject).toEqual(project);
  });

  it('should associate new actions with current context', () => {
    scheduler.setContext(
      { id: 'goal1', title: 'Test Goal' },
      { name: 'test-project' }
    );

    const action = scheduler.scheduleAction({
      type: 'research',
      tool: 'WebSearch',
      target: 'test query'
    });

    expect(action.goalId).toBe('goal1');
    expect(action.projectId).toBe('test-project');
  });

  it('should clear actions for specific goal', () => {
    scheduler.actionQueue = [
      { id: 'a1', goalId: 'goal1' },
      { id: 'a2', goalId: 'goal2' },
      { id: 'a3', goalId: 'goal1' }
    ];

    scheduler.clearGoalActions('goal1');

    expect(scheduler.actionQueue.length).toBe(1);
    expect(scheduler.actionQueue[0].goalId).toBe('goal2');
  });
});

describe('Action Scheduler - Status', () => {
  let scheduler;

  beforeEach(() => {
    scheduler = new ActionScheduler();
    scheduler.actionQueue = [{ id: 'a1' }, { id: 'a2' }];
    scheduler.scheduledActions = [{ id: 'a3' }];
    scheduler.blockedActions = [{ id: 'a4' }];
    scheduler.completedActions = [{ id: 'a5' }];
  });

  it('should return correct status counts', () => {
    const status = scheduler.getStatus();

    expect(status.queuedCount).toBe(2);
    expect(status.scheduledCount).toBe(1);
    expect(status.blockedCount).toBe(1);
    expect(status.completedCount).toBe(1);
  });

  it('should return pending actions', () => {
    const pending = scheduler.getPendingActions();

    expect(pending.queued.length).toBe(2);
    expect(pending.scheduled.length).toBe(1);
    expect(pending.blocked.length).toBe(1);
  });
});

describe('Action Scheduler - Cancel', () => {
  let scheduler;

  beforeEach(() => {
    scheduler = new ActionScheduler();
    scheduler.completedActions = [];
  });

  it('should cancel queued action', () => {
    scheduler.actionQueue = [{ id: 'a1', type: 'test' }];

    const cancelled = scheduler.cancelAction('a1');

    expect(cancelled.status).toBe(ACTION_STATUS.CANCELLED);
    expect(scheduler.actionQueue.length).toBe(0);
    expect(scheduler.completedActions.length).toBe(1);
  });

  it('should cancel scheduled action', () => {
    scheduler.scheduledActions = [{ id: 'a1', type: 'test' }];

    const cancelled = scheduler.cancelAction('a1');

    expect(cancelled.status).toBe(ACTION_STATUS.CANCELLED);
    expect(scheduler.scheduledActions.length).toBe(0);
  });

  it('should return null for non-existent action', () => {
    const cancelled = scheduler.cancelAction('nonexistent');
    expect(cancelled).toBeNull();
  });
});

console.log('Action Scheduler Tests - Run with: npx vitest run tests/action-scheduler.test.js');
