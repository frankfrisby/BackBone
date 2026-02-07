# BACKBONE Autonomous Engine — Design Specification

## Vision

A **continuously running, self-improving AI engine** that:
- Thinks, researches, plans, acts, builds, tests, reflects, and repeats
- Builds on previous work (never starts from scratch)
- Creates new skills and MCP servers as it learns
- Tracks every project to true completion (not just "done enough")
- Acts on the user's behalf ethically and responsibly
- Persists all state for crash recovery

---

## Core Principles

### 1. Never Ruminate
- Don't revisit the same thing unless improvement is needed
- Track what's been analyzed, researched, decided
- Move forward until blocked, then solve the blocker

### 2. Criteria-Driven Completion
- Every project has explicit success criteria
- A project is NOT complete until criteria are met
- Completion percentage is calculated from criteria progress
- "On Hold" and "Archived" are valid states, not "Complete"

### 3. Build on Previous Work
- Read existing knowledge before starting new work
- Compact and summarize as you go
- Create reusable skills from repeated patterns
- Reference prior decisions to maintain consistency

### 4. Persistent State
- All state in `.md` files for human readability
- Can resume after crash/restart/power loss
- Task queue persists across sessions
- Never lose work

### 5. Ethical Autonomy
- Act on user's behalf but within defined boundaries
- Seek approval for high-impact actions
- Be transparent about what's being done
- Respect user's time, money, relationships

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTONOMOUS ENGINE CORE                               │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │   THINK      │ → │   RESEARCH   │ → │    PLAN      │ → │   ACTION     │ │
│  │              │   │              │   │              │   │              │ │
│  │ What's next? │   │ Gather info  │   │ Write plan   │   │ Execute      │ │
│  │ Priorities?  │   │ Context      │   │ Define tasks │   │ Build/Create │ │
│  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘ │
│         ↑                                                        │          │
│         │           ┌──────────────┐   ┌──────────────┐          │          │
│         │           │    TEST      │ ← │    BUILD     │ ←────────┘          │
│         │           │              │   │              │                     │
│         │           │ Verify work  │   │ Create code  │                     │
│         │           │ Check critera│   │ Write docs   │                     │
│         │           └──────────────┘   └──────────────┘                     │
│         │                  │                                                 │
│         │           ┌──────────────┐                                        │
│         └───────────│   REFLECT    │                                        │
│                     │              │                                        │
│                     │ What worked? │                                        │
│                     │ What's next? │                                        │
│                     │ Update %     │                                        │
│                     └──────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## State Files (Persistence Layer)

All state is stored in markdown files for:
- Human readability
- Git tracking
- Crash recovery
- Cross-session continuity

### File Structure

```
memory/
├── engine-state.md          # Current engine state, active task, queue
├── thinking-journal.md      # Stream of consciousness, decisions made
├── knowledge-compacted.md   # Summarized learnings (compacted regularly)
├── skills-registry.md       # Skills created by the engine
├── projects-status.md       # All projects with completion %
└── reflection-log.md        # What worked, what didn't, insights

projects/
├── <project-name>/
│   ├── PROJECT.md           # Overview, goals, status
│   ├── CRITERIA.md          # Success criteria (checkboxes)
│   ├── PLAN.md              # Execution plan
│   ├── PROGRESS.md          # Progress log, completion %
│   ├── TASKS.md             # Current task queue
│   └── LEARNINGS.md         # What was learned
```

---

## Project Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│  IDEA                                                           │
│  ════                                                           │
│  From: user request, thinking engine, backlog graduation        │
│  Output: Initial project definition                             │
├─────────────────────────────────────────────────────────────────┤
│  PLANNING (0-10%)                                               │
│  ════════                                                       │
│  - Define success criteria (CRITERIA.md)                        │
│  - Research context and constraints                             │
│  - Write execution plan (PLAN.md)                               │
│  - Break into tasks (TASKS.md)                                  │
├─────────────────────────────────────────────────────────────────┤
│  ACTIVE (10-90%)                                                │
│  ══════                                                         │
│  - Execute tasks one by one                                     │
│  - Update PROGRESS.md after each task                           │
│  - Recalculate completion % based on criteria                   │
│  - Create skills from repeated patterns                         │
│  - Commit and push after significant progress                   │
├─────────────────────────────────────────────────────────────────┤
│  REVIEW (90-99%)                                                │
│  ══════                                                         │
│  - Verify all criteria are met                                  │
│  - Run tests if applicable                                      │
│  - Document learnings                                           │
│  - Update skills registry                                       │
├─────────────────────────────────────────────────────────────────┤
│  COMPLETE (100%)                                                │
│  ════════                                                       │
│  - All criteria checkboxes checked                              │
│  - Learnings extracted and compacted                            │
│  - Project archived but still reviewable                        │
├─────────────────────────────────────────────────────────────────┤
│  ON HOLD (paused)                                               │
│  ═══════                                                        │
│  - Blocked by external factor                                   │
│  - Waiting for user input                                       │
│  - Lower priority, will resume later                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Success Criteria System

Every project has a `CRITERIA.md` file:

```markdown
# Success Criteria: [Project Name]

## Must Have (Required for completion)
- [ ] Criterion 1: Description (weight: 20%)
- [ ] Criterion 2: Description (weight: 30%)
- [ ] Criterion 3: Description (weight: 25%)

## Should Have (Important but not blocking)
- [ ] Criterion 4: Description (weight: 15%)

## Nice to Have (Bonus)
- [ ] Criterion 5: Description (weight: 10%)

## Completion Calculation
- Must Have: All must be checked (0% if any unchecked)
- Should Have: Proportional credit
- Nice to Have: Bonus credit

Current Completion: 45%
Last Updated: 2026-02-06T12:00:00Z
```

---

## Engine State Machine

```
┌──────────────┐
│    IDLE      │ ←──────────────────────────────────┐
│              │                                     │
│ No active    │                                     │
│ tasks        │                                     │
└──────┬───────┘                                     │
       │ (check queue)                               │
       ▼                                             │
┌──────────────┐                                     │
│   THINKING   │                                     │
│              │                                     │
│ What's next? │                                     │
│ Prioritize   │                                     │
└──────┬───────┘                                     │
       │ (select task)                               │
       ▼                                             │
┌──────────────┐     ┌──────────────┐                │
│  RESEARCHING │ ──→ │   PLANNING   │                │
│              │     │              │                │
│ Gather info  │     │ Write plan   │                │
└──────────────┘     └──────┬───────┘                │
                            │                         │
                            ▼                         │
                     ┌──────────────┐                │
                     │   EXECUTING  │                │
                     │              │                │
                     │ Do the work  │                │
                     └──────┬───────┘                │
                            │                         │
                            ▼                         │
                     ┌──────────────┐                │
                     │   TESTING    │                │
                     │              │                │
                     │ Verify work  │                │
                     └──────┬───────┘                │
                            │                         │
                            ▼                         │
                     ┌──────────────┐                │
                     │  REFLECTING  │ ───────────────┘
                     │              │
                     │ What's next? │
                     └──────────────┘
```

---

## Continuous Loop Implementation

```javascript
// Pseudocode for the autonomous loop

async function autonomousLoop() {
  while (true) {
    try {
      // 1. THINK - What should we work on?
      const nextTask = await think();

      if (!nextTask) {
        // Nothing to do, reflect on completed work
        await reflectOnCompletedProjects();
        await sleep(IDLE_INTERVAL);
        continue;
      }

      // 2. RESEARCH - Gather context
      await research(nextTask);

      // 3. PLAN - Create execution plan
      await plan(nextTask);

      // 4. ACTION - Execute the plan
      await execute(nextTask);

      // 5. BUILD - Create artifacts
      await build(nextTask);

      // 6. TEST - Verify work
      await test(nextTask);

      // 7. REFLECT - Update progress, learn
      await reflect(nextTask);

      // 8. PERSIST - Save state
      await persistState();

      // 9. COMMIT - Push to git if significant
      await commitIfSignificant();

    } catch (error) {
      await handleError(error);
      await persistState(); // Always save on error
    }
  }
}
```

---

## Skill Builder

When the engine notices repeated patterns, it creates skills:

```javascript
async function checkForSkillOpportunity(task, result) {
  // Analyze: Did we just do something we've done before?
  const similarTasks = await findSimilarCompletedTasks(task);

  if (similarTasks.length >= 3) {
    // Pattern detected! Create a skill
    const skill = await extractSkillFromPattern(similarTasks);
    await saveSkill(skill);
    await updateSkillsRegistry(skill);
  }
}
```

---

## MCP Server Builder

When the engine needs new capabilities:

```javascript
async function checkForMCPOpportunity(task) {
  // Did we need an API/service we don't have?
  const missingCapabilities = await identifyMissingCapabilities(task);

  for (const capability of missingCapabilities) {
    if (await canBuildMCPServer(capability)) {
      await planMCPServer(capability);
      await buildMCPServer(capability);
      await testMCPServer(capability);
      await registerMCPServer(capability);
    }
  }
}
```

---

## Knowledge Compaction

Regularly compact knowledge to prevent bloat:

```javascript
async function compactKnowledge() {
  // Read all learnings
  const learnings = await readAllLearnings();

  // Summarize into core insights
  const compacted = await summarizeWithAI(learnings, {
    maxTokens: 5000,
    preserveActionable: true,
    removeRedundant: true
  });

  // Save compacted version
  await saveCompactedKnowledge(compacted);

  // Archive detailed versions
  await archiveDetailedLearnings(learnings);
}
```

---

## Reflection Engine

Periodically review completed projects:

```javascript
async function reflectOnCompletedProjects() {
  const completed = await getCompletedProjects();

  for (const project of completed) {
    const criteria = await readCriteria(project);
    const actualOutcome = await assessActualOutcome(project);

    if (!allCriteriaMet(criteria, actualOutcome)) {
      // Not actually complete!
      await reopenProject(project, {
        reason: "Criteria not fully met",
        missingCriteria: getUnmetCriteria(criteria)
      });
    }
  }
}
```

---

## User Interface Integration

### Goals View
Show completion % for each project:

```
┌─────────────────────────────────────────────────────────────────┐
│ GOALS & PROJECTS                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 💰 WEALTH GOAL: $1M Portfolio by 2027                          │
│    ████████░░░░░░░░░░░░ 42%                                    │
│    ├── Trading System Optimization ████████████░░░░ 78%        │
│    ├── Overnight Research Engine   ████████████████ 95%        │
│    └── Portfolio Rebalancing       ███░░░░░░░░░░░░░ 15%        │
│                                                                 │
│ 📦 INCOME GOAL: $15K/mo Passive                                │
│    ██░░░░░░░░░░░░░░░░░░ 8%                                     │
│    ├── Product Research            █████░░░░░░░░░░░ 25%        │
│    └── MVP Planning                ░░░░░░░░░░░░░░░░ 0%         │
│                                                                 │
│ 🚀 CAREER GOAL: Space Robotics                                 │
│    ███░░░░░░░░░░░░░░░░░ 12%                                    │
│    ├── Industry Research           ████████░░░░░░░░ 45%        │
│    └── Skills Assessment           ██░░░░░░░░░░░░░░ 10%        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Error Recovery

```javascript
async function recoverFromCrash() {
  // 1. Read engine state
  const state = await readEngineState();

  // 2. Find incomplete task
  const incompleteTask = state.currentTask;

  if (incompleteTask) {
    // 3. Determine what was completed
    const lastCheckpoint = await findLastCheckpoint(incompleteTask);

    // 4. Resume from checkpoint
    await resumeTask(incompleteTask, lastCheckpoint);
  }

  // 5. Continue normal operation
  await autonomousLoop();
}
```

---

## Configuration

```javascript
const ENGINE_CONFIG = {
  // Timing
  THINK_INTERVAL_MS: 30000,        // How often to think about what's next
  REFLECT_INTERVAL_MS: 3600000,    // How often to reflect (1 hour)
  COMPACT_INTERVAL_MS: 86400000,   // How often to compact knowledge (1 day)

  // Limits
  MAX_CONCURRENT_TASKS: 1,          // Focus on one thing at a time
  MAX_TASK_DURATION_MS: 1800000,    // 30 min max per task chunk

  // Git
  COMMIT_AFTER_TASKS: 3,            // Commit every N completed tasks
  PUSH_AFTER_COMMITS: 1,            // Push every N commits

  // Boundaries
  REQUIRE_APPROVAL_FOR: [
    "financial_transactions",
    "external_communications",
    "account_modifications",
    "public_publishing"
  ]
};
```

---

## Implementation Phases

### Phase 1: Core Loop (Priority: CRITICAL)
- [ ] Engine state persistence
- [ ] Task queue management
- [ ] Basic think/execute/reflect cycle
- [ ] Crash recovery

### Phase 2: Project System (Priority: HIGH)
- [ ] CRITERIA.md system
- [ ] Completion % calculation
- [ ] Project lifecycle states
- [ ] Progress tracking

### Phase 3: Knowledge Management (Priority: HIGH)
- [ ] Thinking journal
- [ ] Knowledge compaction
- [ ] Learnings extraction
- [ ] Cross-project learning

### Phase 4: Self-Improvement (Priority: MEDIUM)
- [ ] Skill builder
- [ ] Pattern detection
- [ ] MCP server builder
- [ ] Capability expansion

### Phase 5: UI Integration (Priority: MEDIUM)
- [ ] Goals view with %
- [ ] Project status display
- [ ] Engine status indicator
- [ ] Task queue visibility

### Phase 6: Reflection Engine (Priority: LOW)
- [ ] Completed project review
- [ ] Criteria verification
- [ ] Automatic reopening
- [ ] Quality assurance

---

## Files to Create/Modify

### New Files
1. `src/services/autonomous-loop.js` - Main continuous loop
2. `src/services/project-manager.js` - Project lifecycle management
3. `src/services/criteria-engine.js` - Success criteria system
4. `src/services/knowledge-compactor.js` - Knowledge summarization
5. `src/services/skill-builder.js` - Skill creation from patterns
6. `src/services/reflection-engine.js` - Project review system
7. `src/services/state-persistence.js` - Crash recovery
8. `memory/engine-state.md` - Current state
9. `memory/thinking-journal.md` - Decision log
10. `memory/knowledge-compacted.md` - Summarized learnings

### Modified Files
1. `src/services/thinking-engine.js` - Integrate with autonomous loop
2. `src/app.js` - Start autonomous loop
3. `src/components/goals-panel.js` - Show completion %
4. `CLAUDE.md` - Update with new architecture

---

## Success Metrics

1. **Continuity**: Engine runs for 24+ hours without intervention
2. **Recovery**: Resumes correctly after crash/restart
3. **Progress**: Projects advance toward completion daily
4. **Learning**: Skills created from repeated patterns
5. **Accuracy**: Completion % reflects true progress
6. **Ethical**: No unauthorized high-impact actions

---

*Spec Version: 1.0*
*Created: 2026-02-06*
*Author: BACKBONE Engine + User*
