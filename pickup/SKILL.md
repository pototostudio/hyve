---
name: hyve:pickup
version: 0.3.0
description: |
  Dev: load full context for a Linear ticket before starting implementation.
  Reads the PM's spec, prior decisions, related reviews, and analyzes the codebase
  to produce a comprehensive pickup brief. Detects conflicts with other active work.

  Adapts to ticket type: feature tickets get the full PM Intent template,
  bug/incident tickets get a lighter Symptom → Timeline → Trace template.

  Use when: a dev is starting work on a ticket and wants full context.
  Trigger: /hyve:pickup [linear-id]
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - Agent
  - AskUserQuestion
  - mcp__claude_ai_Linear__get_issue
  - mcp__claude_ai_Linear__list_issues
  - mcp__claude_ai_Linear__save_issue
  - mcp__claude_ai_Linear__save_comment
  - mcp__claude_ai_Linear__list_comments
---

# /hyve:pickup — Load Full Context for a Ticket

A dev runs this skill to get complete context before starting work.
Produces a "pickup brief" that makes asking the PM unnecessary.

**Follow `CONVENTIONS.md` (in the hyve root directory) for all user interactions.**

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
mkdir -p "$PROJECT_DIR"/{specs,plans,reviews,decisions,handoffs,status}
_BRANCH=$(git rev-parse --is-inside-work-tree 2>/dev/null && git branch --show-current 2>/dev/null || echo "unknown")
_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "BRANCH: $_BRANCH"
echo "COMMIT: $_COMMIT"
echo "PROJECT: $SLUG"
echo "STATE: $PROJECT_DIR"
```

## Input Resolution

1. **If argument is a Linear issue ID:** Fetch via MCP.
2. **If no argument:** Smart detection:
   - Check current branch for a Linear ID pattern (e.g., `feat/VER-123-add-auth`)
   - Check Linear for issues assigned to the current user that are "In Progress"
   - Fall back: AskUserQuestion listing available tickets

## Ticket Type Detection

After fetching the Linear issue, classify it as **feature** or **bug/incident**.

**Bug indicators** (any match → bug template):
- Linear labels contain "bug", "incident", "hotfix", "regression", "support"
- Title contains "fix", "broken", "error", "timeout", "crash", "failing", "500", "404"
- Issue was filed by a non-dev (support, customer, PM reporting a user complaint)
- Priority is Urgent or Critical
- Description mentions symptoms, reproduction steps, or user reports

**Feature indicators** (default):
- Linear labels contain "feature", "enhancement", "story"
- Has acceptance criteria or spec references
- Filed by PM or product

If unclear, ask:

Call AskUserQuestion with question "Is this a feature or a bug/incident?" and options:
1. Feature — building something new
2. Bug/incident — fixing something broken
3. Type something.
4. Chat about this

## Context Gathering

Gather context from ALL available sources. The goal is to produce a brief so
complete that the dev never needs to ask clarifying questions.

### 1. Linear Context (via MCP)

If Linear MCP is available:
- Fetch the issue: title, description, priority, labels, due date
- Fetch all comments (PM reasoning, design decisions, stakeholder input)
- Fetch parent issue (if this is a sub-task from `/hyve:spec`)
- Fetch linked issues (related work, dependencies, blockers)
- Fetch the issue's project context (project description, milestones)

If Linear MCP is unavailable:
- Warn: "Linear unavailable — working with local context only."
- Proceed with shared state and codebase analysis.

### 2. Shared State Context

Search `$PROJECT_DIR/` for related artifacts:

```bash
LINEAR_ID="${LINEAR_ID:-unknown}"
echo "=== Specs ==="
ls "$PROJECT_DIR"/specs/${LINEAR_ID}* 2>/dev/null || echo "none"
echo "=== Plans ==="
ls "$PROJECT_DIR"/plans/${LINEAR_ID}* 2>/dev/null || echo "none"
echo "=== Decisions ==="
grep -rl "$LINEAR_ID" "$PROJECT_DIR/decisions/" 2>/dev/null || echo "none"
echo "=== Reviews ==="
ls "$PROJECT_DIR"/reviews/${LINEAR_ID}* 2>/dev/null || echo "none"
echo "=== Handoffs ==="
grep -rl "$LINEAR_ID" "$PROJECT_DIR/handoffs/" 2>/dev/null || echo "none"
```

Read each found artifact.

### 3. Codebase Analysis

#### For FEATURE tickets:

1. **Affected files:** If the spec has an "Affected Files" section, start there.
   Otherwise, use Grep/Glob to find files related to the ticket's keywords.

2. **Existing patterns:** For each affected file, identify:
   - What patterns are used (naming conventions, error handling, testing approach)
   - Recent changes (git log for the last 10 commits touching this file)
   - Related test files

3. **Dependencies:** What other modules/services does this code depend on?

#### For BUG tickets — Trace the Request Path:

Keyword search alone is often useless for bugs ("login" and "timeout" don't map
to files). Instead, trace the execution path:

1. **Identify the entry point:** What endpoint/page/action triggers the bug?
   Use Grep to find the route handler, API endpoint, or event handler.

2. **Trace downstream:** From the entry point, follow the call chain:
   - What functions does it call?
   - What external services does it hit (databases, APIs, queues)?
   - What middleware/interceptors run in the path?

3. **Check infrastructure touchpoints:** For timeout/performance bugs:
   - Load balancer config (nginx, cloud LB timeout settings)
   - Database connection pool config
   - External API timeout settings
   - Queue/worker configurations

4. **Recent changes in the path:** For each file in the traced path:
   ```bash
   git log --oneline --since="30 days ago" -- <file>
   ```

5. **Related error handling:** Find catch blocks, error handlers, and retry logic
   in the traced path — these are often where bugs hide.

### 4. Incident Timeline (BUG tickets only)

**This section is CRITICAL for bug tickets. Do not skip it.**

Ask the user (via AskUserQuestion): "When did this start happening?" with options:
1. After a specific deploy — I know which one
2. Gradually — it's been getting worse
3. Suddenly — worked fine then broke
4. Unknown — I need to investigate
5. Type something.
6. Chat about this

Then cross-reference with:

```bash
# Recent deployments (last 14 days)
git log --oneline --since="14 days ago" --merges 2>/dev/null | head -10
# Recent tags
git tag --sort=-creatordate 2>/dev/null | head -5
```

If Linear MCP is available:
- Check for other in-progress issues that might be related
- Check for recently resolved issues that could have caused a regression
- Look for linked issues or mentions of the same symptom

Build a timeline:
```
## Incident Timeline
- {date}: Last known good state
- {date}: Deploy {hash} merged ({PR title})
- {date}: First user report (from Linear comments/Slack)
- {date}: This ticket filed
- Now: Investigating
```

### 5. Conflict Detection

Check for conflicts with other active work:

1. Read all active plans in `$PROJECT_DIR/plans/`:
   ```bash
   grep -l "status: active" "$PROJECT_DIR"/plans/*.md 2>/dev/null
   ```

2. For each active plan, extract the "Affected Files" section.

3. Compare against this ticket's affected files. If overlap exists, flag it.

4. If no conflicts: `No conflicts with active plans.`

## Produce Pickup Brief

### FEATURE template:

```markdown
# Pickup Brief: {ticket title}

**Linear:** {issue ID} | **Priority:** {P1/..} | **Type:** Feature
**Branch:** {current or suggested} | **Prepared:** {datetime}

## PM Intent
{What the PM wants and WHY. Quoted from spec/ticket where possible.}

## Constraints
{What must NOT change. Performance limits. Compatibility requirements.}

## Acceptance Criteria
- [ ] {From spec or ticket}

## Codebase Analysis

### Affected Files
- `src/path/file.ts` — {what needs to change}

### Patterns to Follow
- {Pattern name}: see `src/example/file.ts` for reference

### Recent Activity
- {file}: {N} commits in last 30 days

## Related Context
- **Decisions:** {from shared state}
- **Prior reviews:** {from shared state}
- **Adjacent work:** {other active tickets}

## Conflicts
{conflict detection results}

## Suggested Approach
{implementation approach referencing specific files and patterns}
```

### BUG template:

```markdown
# Bug Brief: {ticket title}

**Linear:** {issue ID} | **Priority:** {P1/..} | **Type:** Bug
**Branch:** {current or suggested} | **Prepared:** {datetime}

## Symptom
{What's broken, in the user's words. Quote from ticket/support.}

## Affected Users
{Who reported this? How many users? Is it blocking?}

## Reproduction
{Steps to reproduce, if known. If not known, say so.}

## Incident Timeline
- {date}: Last known good state
- {date}: Relevant deploy or change
- {date}: First report
- {date}: This ticket filed

## Request Path Trace
{Entry point} → {handler} → {downstream calls} → {external services}
- Entry: `POST /api/auth/login` → `src/app/api/auth/login/route.ts`
- Calls: `authService.login()` → `src/lib/auth.ts:45`
- External: GCP Identity Platform (30s timeout on LB)
- DB: Postgres via Prisma → `src/lib/db.ts`

## Infrastructure Touchpoints
- Load balancer: {timeout config, if relevant}
- Database: {connection pool, query performance}
- External APIs: {timeout settings, retry policies}

## Related Context
- **Decisions:** {from shared state}
- **Adjacent work:** {other active tickets — could be related?}
- **Recent deploys:** {deploys in the incident window}

## Conflicts
{conflict detection results}

## First Hypothesis
{Based on the trace and timeline, what's the most likely cause?}

## Investigation Plan
1. {First thing to check}
2. {Second thing to check}
3. {Fallback if first two don't pan out}
```

## Save Plan

Save the pickup brief as a plan in shared state:

```bash
DATETIME=$(date +%Y%m%d-%H%M%S)
USER=$(whoami)
```

Write to `$PROJECT_DIR/plans/${LINEAR_ID}-${_BRANCH}-plan-${DATETIME}.md`:

```yaml
---
status: active
type: {feature | bug}
author: {user}
date: {ISO date}
linear_id: {issue ID}
branch: {git branch}
commit: {git rev-parse --short HEAD}
affected_files:
  - src/path/file.ts
---
```

**Version check:** Mark any prior plan for this Linear ID as `superseded`.

## Auto-sync

After saving, push to shared state:
```bash
"$HYVE_DIR/bin/hyve-push" "$SLUG" 2>/dev/null &
```

## Update Linear

If Linear MCP is available:
- Update issue status to "In Progress" via `mcp__claude_ai_Linear__save_issue`
- Add a comment with the plan summary:
  > **Hyve Pickup** — {type} brief created
  > Affected files: {list}
  > {For features: Suggested approach: {one-line}}
  > {For bugs: First hypothesis: {one-line}}
  > Conflicts: {none | list}

## Conventions

**Read and follow `$HYVE_DIR/CONVENTIONS.md` for all user interactions.** All AskUserQuestion calls
MUST use the AskUserQuestion tool (not plain text) with the 5-part format.

## Completion

### Step 1: Report summary

```
PICKUP COMPLETE
  Ticket: {LINEAR_ID} — {title}
  Type: {feature | bug}
  Brief saved: {plan file path}
  Affected files: {N}
  Conflicts: {N found | none}
  Linear updated: yes / skipped
```

### Step 2: Walk through the brief with the user

**This step is MANDATORY. Do not skip it.**

**For FEATURE tickets:**
- **PM Intent:** Summarize what the PM wants and why
- **Constraints:** Anything the dev must NOT do
- **Suggested Approach:** Walk through the approach and why
- **Conflicts:** If any, explain overlaps
- **Key Decisions:** Reference prior decisions from shared state

**For BUG tickets:**
- **Symptom:** What's broken, who's affected
- **Timeline:** When it started, what changed
- **Request path:** Walk through the traced execution path
- **First hypothesis:** What you think is most likely and why
- **Investigation plan:** What to check first, second, third

Ask if the user has questions or needs clarification before offering next steps.

### Step 3: Offer next steps

**If no conflicts (feature):** call AskUserQuestion with question
"Context loaded for {LINEAR_ID}. Ready to implement. What's next?" and these options:
1. Start implementing — I have full context now
2. Run /hyve:review on the plan first — get PM + eng feedback before coding
3. Record a decision (/hyve:decision) — I already know which approach I'll take
4. Type something.
5. Chat about this

**If no conflicts (bug):** call AskUserQuestion with question
"Bug brief ready for {LINEAR_ID}. Ready to investigate. What's next?" and these options:
1. Start investigating — follow the investigation plan
2. Check the request path first — trace the execution
3. Check recent deploys — look for the regression
4. Run /hyve:review on the plan first — get eng feedback
5. Type something.
6. Chat about this

**If conflicts detected:** call AskUserQuestion with question
"Context loaded, but {N} conflict(s) detected with other active plans. What's next?"
and these options:
1. Run /hyve:review to align with the other dev before starting
2. Start anyway — the conflicts are minor
3. Check the conflicting plan in detail — show me the overlap
4. Type something.
5. Chat about this
