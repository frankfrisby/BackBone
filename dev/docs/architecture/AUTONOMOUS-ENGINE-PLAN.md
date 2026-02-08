# BACKBONE Autonomous Engine — Implementation Plan

## Overview
Transform BACKBONE into a truly autonomous, self-improving AI engine that runs continuously, builds on previous work, and drives projects to true completion.

## Current Status
**Phase**: Phase 1 Complete, Phase 2 In Progress
**Last Updated**: 2026-02-06
**Current Task**: Phase 2.1 - Criteria Engine

---

## Phase 1: Core Infrastructure (Days 1-2)

### Task 1.1: State Persistence System ✅ COMPLETE
**File**: `src/services/state-persistence.js`
**Purpose**: Save and restore engine state for crash recovery

- [x] Create EngineState class
- [x] Implement saveState() to memory/engine-state.md
- [x] Implement loadState() from memory/engine-state.md
- [x] Add checkpoint system for long-running tasks
- [x] Add state versioning for compatibility
- [x] Test crash recovery scenario

**Acceptance Criteria**:
- Engine can save its current state at any point ✓
- Engine can resume from saved state after restart ✓
- No data loss on unexpected shutdown ✓

---

### Task 1.2: Task Queue Manager ✅ COMPLETE
**File**: `src/services/task-queue.js`
**Purpose**: Manage prioritized queue of tasks

- [x] Create TaskQueue class
- [x] Implement addTask(), getNextTask(), completeTask()
- [x] Priority-based ordering
- [x] Persist queue to memory/task-queue.md
- [x] Prevent duplicate tasks
- [x] Handle blocked/waiting tasks

**Acceptance Criteria**:
- Tasks persist across restarts ✓
- Priority ordering works correctly ✓
- Queue operations are atomic ✓

---

### Task 1.3: Autonomous Loop Core ✅ COMPLETE
**File**: `src/services/autonomous-loop.js`
**Purpose**: Main continuous execution loop

- [x] Create AutonomousLoop class
- [x] Implement think() - decide what to work on
- [x] Implement execute() - do the work
- [x] Implement reflect() - learn from results
- [x] Add graceful shutdown handling
- [x] Add error recovery
- [x] Integrate with state persistence

**Acceptance Criteria**:
- Loop runs continuously without manual intervention ✓
- Gracefully handles errors and continues ✓
- Saves state before each major operation ✓

---

### Task 1.4: Thinking Journal ✅ COMPLETE
**File**: `memory/thinking-journal.md`
**Purpose**: Log all decisions and reasoning

- [x] Create journal format
- [x] Log what was considered
- [x] Log what was decided and why
- [x] Log what was rejected and why
- [x] Auto-archive old entries (>7 days)

**Acceptance Criteria**:
- Every decision has a journal entry
- Journal is human-readable
- Can trace back any decision

---

## Phase 2: Project System (Days 3-4)

### Task 2.1: Criteria Engine ✅ COMPLETE
**File**: `src/services/criteria-engine.js`
**Purpose**: Define and track success criteria

- [x] Create Criterion class (name, weight, status)
- [x] Create CriteriaSet class (collection of criteria)
- [x] Implement calculateCompletion()
- [x] Parse CRITERIA.md format
- [x] Update CRITERIA.md on changes
- [x] Handle Must Have / Should Have / Nice to Have

**Acceptance Criteria**:
- Completion % accurately reflects criteria status ✓
- Weighted calculation works correctly ✓
- Changes persist to CRITERIA.md ✓

---

### Task 2.2: Project Manager ✅ COMPLETE
**File**: `src/services/project-manager.js`
**Purpose**: Manage project lifecycle

- [x] Create Project class with states
- [x] Implement project creation with criteria
- [x] Implement state transitions (planning → active → review → complete)
- [x] Track completion % from criteria engine
- [x] Link projects to goals
- [x] Handle project pausing/resuming

**Acceptance Criteria**:
- Projects flow through lifecycle correctly
- Completion % updates as criteria are met
- Projects link to parent goals

---

### Task 2.3: Progress Tracker ⬜ PENDING
**File**: `src/services/progress-tracker.js`
**Purpose**: Track and log progress

- [ ] Log task completions
- [ ] Calculate daily/weekly progress
- [ ] Identify stalled projects
- [ ] Generate progress summaries
- [ ] Update PROGRESS.md files

**Acceptance Criteria**:
- All progress is logged
- Can see progress over time
- Stalled projects are identified

---

## Phase 3: Knowledge Management (Days 5-6)

### Task 3.1: Knowledge Compactor ⬜ PENDING
**File**: `src/services/knowledge-compactor.js`
**Purpose**: Summarize and compress knowledge

- [ ] Read all learnings from projects
- [ ] Summarize using AI
- [ ] Preserve actionable insights
- [ ] Remove redundancy
- [ ] Save to knowledge-compacted.md
- [ ] Archive detailed versions
- [ ] Schedule periodic compaction

**Acceptance Criteria**:
- Knowledge is summarized without losing insights
- Old detailed learnings are archived
- Compacted knowledge is useful

---

### Task 3.2: Learnings Extractor ⬜ PENDING
**File**: `src/services/learnings-extractor.js`
**Purpose**: Extract learnings from completed work

- [ ] Analyze completed tasks
- [ ] Identify what worked
- [ ] Identify what didn't work
- [ ] Extract reusable patterns
- [ ] Save to project LEARNINGS.md

**Acceptance Criteria**:
- Every task produces learnings
- Patterns are identified
- Learnings are project-scoped

---

## Phase 4: Self-Improvement (Days 7-8)

### Task 4.1: Skill Builder ⬜ PENDING
**File**: `src/services/skill-builder.js`
**Purpose**: Create skills from repeated patterns

- [ ] Detect similar completed tasks
- [ ] Extract common patterns
- [ ] Generate skill definition
- [ ] Create skill markdown file
- [ ] Add to skills registry
- [ ] Use skill in future tasks

**Acceptance Criteria**:
- Skills created from 3+ similar tasks
- Skills are usable by the engine
- Skills improve over time

---

### Task 4.2: MCP Server Builder ⬜ PENDING
**File**: `src/services/mcp-builder.js`
**Purpose**: Create MCP servers for new capabilities

- [ ] Identify missing capabilities
- [ ] Design MCP server structure
- [ ] Generate server code
- [ ] Test server functionality
- [ ] Register with system
- [ ] Update .mcp.json

**Acceptance Criteria**:
- New capabilities trigger MCP consideration
- Generated servers work correctly
- Servers integrate with existing system

---

## Phase 5: Reflection Engine (Days 9-10)

### Task 5.1: Completed Project Review ⬜ PENDING
**File**: `src/services/reflection-engine.js`
**Purpose**: Review "completed" projects for true completion

- [ ] Scan archived/completed projects
- [ ] Re-evaluate against criteria
- [ ] Check if goals were actually achieved
- [ ] Reopen if criteria not met
- [ ] Generate reflection report

**Acceptance Criteria**:
- No false "complete" projects
- Reopened projects have clear reason
- Regular review cycle runs

---

### Task 5.2: Quality Assurance ⬜ PENDING
**File**: `src/services/qa-engine.js`
**Purpose**: Ensure work quality

- [ ] Verify deliverables exist
- [ ] Check for regressions
- [ ] Validate against criteria
- [ ] Score quality (1-10)
- [ ] Flag low-quality work

**Acceptance Criteria**:
- All work is quality-checked
- Low quality is flagged
- Quality improves over time

---

## Phase 6: UI Integration (Days 11-12)

### Task 6.1: Goals View with Progress ⬜ PENDING
**Files**: `backbone-app/src/components/goals-view.tsx`
**Purpose**: Show completion % in UI

- [ ] Display project completion %
- [ ] Show progress bars
- [ ] Group by parent goal
- [ ] Show engine status
- [ ] Real-time updates

**Acceptance Criteria**:
- Completion % visible for all projects
- Updates in real-time
- Clear visual hierarchy

---

### Task 6.2: Engine Status Dashboard ⬜ PENDING
**Files**: `backbone-app/src/components/engine-status.tsx`
**Purpose**: Show engine status and activity

- [ ] Current task display
- [ ] Task queue preview
- [ ] Recent activity log
- [ ] Error/warning indicators
- [ ] Pause/resume controls

**Acceptance Criteria**:
- User can see what engine is doing
- User can control engine
- Status is real-time

---

## Execution Tracking

### Completed Tasks
| Task | Date | Commit |
|------|------|--------|
| Task 1.1: State Persistence | 2026-02-06 | (this commit) |
| Task 1.2: Task Queue Manager | 2026-02-06 | (this commit) |
| Task 1.3: Autonomous Loop Core | 2026-02-06 | (this commit) |
| Task 1.4: Thinking Journal | 2026-02-06 | (this commit) |
| Task 2.1: Criteria Engine | 2026-02-06 | (this commit) |
| Task 2.2: Project Manager Enhanced | 2026-02-06 | (this commit) |

### Current Task
**Task 2.3: Progress Tracker**
Status: Next
Started: TBD

### Next Up
1. Task 2.3: Progress Tracker
2. Task 3.1: Knowledge Compactor
3. Task 3.2: Learnings Extractor

---

## Git Commit Strategy

After each task completion:
1. Commit with message: `[Auto-Engine] Task X.X: <description>`
2. Push to remote
3. Update this plan file
4. Continue to next task

---

## Recovery Instructions

If the engine/computer crashes:
1. Read this file to understand current state
2. Check `memory/engine-state.md` for last known state
3. Check `memory/thinking-journal.md` for recent decisions
4. Resume from last completed task
5. If task was in progress, check project PROGRESS.md

---

*Plan Version: 1.0*
*Created: 2026-02-06*
