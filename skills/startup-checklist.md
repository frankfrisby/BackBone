# BACKBONE Startup Checklist

This file defines the standard checklist that Claude Code CLI runs through on startup.

## Phase 1: User Context Assessment (Priority: Critical)

### 1.1 Profile Check
- [ ] Read memory/profile.md for user profile
- [ ] Check data/user-settings.json for preferences
- [ ] Verify LinkedIn data is current (data/linkedin-*.json)

### 1.2 Goals & Beliefs
- [ ] Read data/core-beliefs.json for core values
- [ ] Check data/goals.json for active goals
- [ ] Review memory/thesis.md for current focus

### 1.3 Financial State
- [ ] Check data/trades-log.json for recent trades
- [ ] Review data/tickers-cache.json for portfolio
- [ ] Assess current market conditions

### 1.4 Health Status
- [ ] Check data/oura-data.json for sleep/health
- [ ] Review memory/health.md for health summary

## Phase 2: Work Assessment (Priority: High)

### 2.1 Backlog Status
- [ ] Read data/backlog.json
- [ ] Count items by status: pending, in-progress, completed
- [ ] Identify high-impact items (score >= 75)
- [ ] Check for stale items (not touched in 24+ hours)

### 2.2 Active Projects
- [ ] Scan projects/ directory
- [ ] Identify active projects (status: active)
- [ ] Check for blocked projects
- [ ] Find projects with pending tasks

### 2.3 Previous Session
- [ ] Read data/idle-processor-state.json
- [ ] Check what was last worked on
- [ ] Review recent work history

## Phase 3: Priority Determination (Priority: High)

### 3.1 Urgency Assessment
- [ ] Check for time-sensitive backlog items
- [ ] Review any deadlines in goals
- [ ] Assess market volatility if finance-related

### 3.2 Impact Scoring
- [ ] Score each potential work item
- [ ] Consider user's current thesis
- [ ] Align with core beliefs

### 3.3 Work Queue Creation
- [ ] Create prioritized list of work items
- [ ] Identify 1-2 items to work on immediately
- [ ] Queue remaining items for idle processing

## Phase 4: Action (Priority: High)

### 4.1 Begin Work
- [ ] Start highest priority item
- [ ] Update backlog status to in-progress
- [ ] Log work start in activity tracker

### 4.2 Continuous Monitoring
- [ ] Monitor for user activity
- [ ] Pause if user becomes active
- [ ] Resume when user is idle

---

## Work Evaluation Criteria

### Impact Score Factors
- Alignment with core beliefs: +20 points
- Time sensitivity: +15 points
- Financial impact: +10 points
- Health impact: +10 points
- Career impact: +10 points
- Already started: +5 points

### Urgency Levels
- Critical: Must be done today
- High: Should be done this week
- Medium: Should be done this month
- Low: Nice to have

---

*This checklist is automatically processed by the startup-engine service.*
