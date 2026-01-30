# Role Model Discovery & Matching Skill

Identifies the top 5 people who best represent who the user is becoming based on their LinkedIn profile, core beliefs, goals, career trajectory, interests, and queries. This creates a personalized constellation of role models that evolves as the user grows.

## When to Use
- User runs `/role model` to view current role models
- User runs `/role model refresh` to force re-evaluation
- User runs `/role model <name>` to get deep dive on a specific role model
- Weekly automatic refresh (via cron)
- After LinkedIn profile is updated (`/linkedin`)
- After core beliefs are updated (`/thesis add-belief`)
- After significant goal completion

## Data Sources for Matching

Read these files to build the user profile for matching:

### Primary Sources
1. `data/linkedin-profile.json` - Professional identity, headline, current role, education, skills
2. `data/core-beliefs.json` - Fundamental values and life priorities (epics)
3. `data/goals.json` - Active goals and aspirations
4. `memory/profile.md` - Synthesized identity summary
5. `data/user_queries.json` - Interests revealed through questions asked

### Secondary Sources
6. `memory/thesis.md` - Current focus and direction
7. `data/life-scores.json` - Life dimension priorities
8. `projects/*/PROJECT.md` - Active project themes
9. `data/trades-log.json` - Investment philosophy (if any)

## Matching Algorithm

### Step 1: Extract User Dimensions
From the data sources, extract:

```
CAREER_VECTOR:
- Current industry (AI, tech, defense, etc.)
- Career stage (early, mid, senior, founder)
- Technical depth vs breadth
- Leadership vs individual contributor

EDUCATION_VECTOR:
- Institution tier (top 20, top 100, etc.)
- Field of study
- Advanced degrees

VALUES_VECTOR:
- Core beliefs (from beliefs file or inferred)
- Work-life priorities
- Impact focus (money, fame, meaning, innovation)

INTEREST_VECTOR:
- Query themes (AI, space, philosophy, finance, etc.)
- Goal categories
- Project types

TRAJECTORY_VECTOR:
- Where they're heading (from goals and thesis)
- Ambition level
- Risk tolerance
```

### Step 2: Generate Candidate Pool
Using the vectors, search for public figures who match across dimensions:

**Search Categories:**
- Tech entrepreneurs and founders
- AI researchers and leaders
- Defense/government tech innovators
- Scientists and academics
- Business leaders and executives
- Philosophers and thinkers
- Investors and financial minds

**Search Queries (via WebSearch):**
- "[industry] [career_stage] leaders 2024 2025"
- "[education_school] notable alumni [field]"
- "top [role] in [industry]"
- "most influential [domain] people"

### Step 3: Score Candidates
For each candidate, score on 0-100 scale across dimensions:

```
DIMENSION           | WEIGHT | CRITERIA
--------------------|--------|------------------------------------------
Career Alignment    | 25%    | Similar industry, role progression, stage
Educational Match   | 15%    | Same/similar school, field, credentials
Values Resonance    | 20%    | Stated beliefs, priorities, what they optimize for
Interest Overlap    | 15%    | Topics they discuss, projects they pursue
Trajectory Match    | 15%    | Where they went from a similar starting point
Achievability       | 10%    | Realistic as an aspirational model
```

**Composite Score = Weighted Sum**

### Step 4: Rank and Select Top 5
Sort by composite score and select top 5 with diversity:
- At least 2 should be from different industries/roles
- Include at least 1 "stretch" role model (higher trajectory)
- Include at least 1 "peer" role model (similar stage)

## Role Model Entry Format

Store in `data/role-models.json`:

```json
{
  "roleModels": [
    {
      "rank": 1,
      "name": "Full Name",
      "title": "Current Role/Title",
      "photo": "URL if available",
      "matchScore": 87,
      "dimensions": {
        "careerAlignment": 90,
        "educationalMatch": 85,
        "valuesResonance": 88,
        "interestOverlap": 82,
        "trajectoryMatch": 85,
        "achievability": 80
      },
      "whySelected": "2-3 sentence explanation of why this person matches",
      "keyTraits": ["trait1", "trait2", "trait3"],
      "relevantQuote": "A quote that resonates with user's values",
      "careerPath": "Brief trajectory description",
      "lessonsToLearn": ["lesson1", "lesson2"],
      "resources": [
        {"type": "book", "title": "Their Book"},
        {"type": "talk", "title": "Famous Talk"},
        {"type": "interview", "url": "https://..."}
      ],
      "sourceLinks": ["https://wikipedia...", "https://linkedin..."]
    }
  ],
  "userProfile": {
    "capturedAt": "ISO date",
    "careerVector": "...",
    "educationVector": "...",
    "valuesVector": "...",
    "interestVector": "...",
    "trajectoryVector": "..."
  },
  "lastEvaluatedAt": "ISO date",
  "evaluationTrigger": "weekly|linkedin_update|belief_update|manual",
  "history": [
    {
      "date": "ISO date",
      "roleModels": ["Name1", "Name2", "Name3", "Name4", "Name5"],
      "trigger": "reason for change"
    }
  ]
}
```

## Display Format

When user runs `/role model`, display:

```
╭─────────────────────────────────────────────────────────────────╮
│  YOUR ROLE MODEL CONSTELLATION                                  │
│  Last evaluated: [date] | Trigger: [reason]                     │
╰─────────────────────────────────────────────────────────────────╯

┌─────────────────────────────────────────────────────────────────┐
│  #1  [NAME]                                          Score: 87  │
│      [Title/Role]                                               │
├─────────────────────────────────────────────────────────────────┤
│  Why Selected:                                                  │
│  [2-3 sentence explanation]                                     │
│                                                                 │
│  Key Traits: [trait1] • [trait2] • [trait3]                     │
│                                                                 │
│  Career Path: [brief trajectory]                                │
│                                                                 │
│  Lessons: • [lesson1]                                           │
│           • [lesson2]                                           │
│                                                                 │
│  ⬡ Career: ████████░░ 80   ⬡ Values: █████████░ 90             │
│  ⬡ Education: ██████░░░░ 60   ⬡ Trajectory: ████████░░ 80      │
└─────────────────────────────────────────────────────────────────┘

[Repeat for #2 through #5]

┌─────────────────────────────────────────────────────────────────┐
│  YOUR MATCHING PROFILE                                          │
├─────────────────────────────────────────────────────────────────┤
│  Career: Generative AI Engineer, Cofounder                      │
│  Education: Carnegie Mellon University                          │
│  Values: [inferred from beliefs]                                │
│  Interests: AI, Space, Philosophy                               │
│  Trajectory: [from thesis/goals]                                │
└─────────────────────────────────────────────────────────────────┘

Commands:
  /role model           - View this summary
  /role model refresh   - Force re-evaluation
  /role model <name>    - Deep dive on specific person
  /role model history   - See how role models changed over time
  /role model why       - Detailed explanation of matching algorithm
```

## Re-evaluation Triggers

The role model list should be re-evaluated when:

1. **Weekly Cron** - Every Sunday at midnight
2. **LinkedIn Update** - After `/linkedin` captures new profile data
3. **Belief Change** - After `/thesis add-belief` adds new core belief
4. **Major Goal Completion** - When a significant goal is marked complete
5. **Manual Refresh** - When user runs `/role model refresh`

Track changes in the history array to show evolution over time.

## Example Role Models by Profile Type

### AI Engineer + Defense + CMU Profile
Potential matches:
- Andrej Karpathy (AI/Tesla/OpenAI, Stanford but similar trajectory)
- Fei-Fei Li (AI researcher, academia to industry)
- Palmer Luckey (Defense tech founder, Anduril)
- Alexandr Wang (Scale AI founder, defense contracts)
- Eric Schmidt (Tech leader, defense advisor)

### Entrepreneur + Tech + Ivy League
Potential matches:
- Elon Musk (Multi-domain founder)
- Sam Altman (AI leadership)
- Marc Andreessen (VC thought leader)
- Reid Hoffman (LinkedIn, philosophy)
- Patrick Collison (Stripe, intellectual)

## Commands

- `/role model` - Display current top 5 role models with explanations
- `/role model refresh` - Force re-evaluation with latest data
- `/role model <name>` - Deep dive on a specific role model
- `/role model history` - Show how role models have changed over time
- `/role model why` - Explain the matching algorithm in detail
- `/role model add <name>` - Manually add someone to consider
- `/role model remove <name>` - Remove someone from consideration

## Integration Points

- **Thinking Engine**: Reference role models when evaluating goals and thesis
- **Morning Briefing**: Occasionally include a role model quote or lesson
- **Goal Creation**: Suggest goals inspired by role model trajectories
- **Weekly Review**: Compare progress to role model journeys
