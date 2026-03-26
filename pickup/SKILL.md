---
name: hyve:pickup
version: 0.2.0
description: |
  Dev: load full context for a Linear ticket before starting implementation.
  Reads the PM's spec, prior decisions, related reviews, and analyzes the codebase
  to produce a comprehensive pickup brief. Detects conflicts with other active work.

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

A dev runs this skill to get complete context before starting implementation.
Produces a "pickup brief" that makes asking the PM unnecessary.

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
mkdir -p "$PROJECT_DIR"/{specs,plans,reviews,decisions,handoffs,status}
_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "BRANCH: $_BRANCH"
echo "PROJECT: $SLUG"
echo "STATE: $PROJECT_DIR"
```

## Input Resolution

1. **If argument is a Linear issue ID:** Fetch via MCP.
2. **If no argument:** Smart detection:
   - Check current branch for a Linear ID pattern (e.g., `feat/VER-123-add-auth`)
   - Check Linear for issues assigned to the current user that are "In Progress"
   - Fall back: AskUserQuestion listing available tickets

## Context Gathering

Gather context from ALL available sources. The goal is to produce a brief so
complete that the dev never needs to ask the PM a clarifying question.

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

Read each found artifact. Extract:
- PM's original spec and intent (from specs/)
- Prior implementation plans (from plans/)
- Design decisions related to this feature (from decisions/)
- Review feedback (from reviews/)
- Handoff notes (from handoffs/)

### 3. Codebase Analysis

Analyze the local codebase for the files and patterns relevant to this task:

1. **Affected files:** If the spec has an "Affected Files" section, start there.
   Otherwise, use Grep/Glob to find files related to the ticket's keywords.

2. **Existing patterns:** For each affected file, identify:
   - What patterns are used (naming conventions, error handling, testing approach)
   - Recent changes (git log for the last 10 commits touching this file)
   - Related test files

3. **Dependencies:** What other modules/services does this code depend on?

### 4. Conflict Detection

Check for conflicts with other active work:

1. Read all active plans in `$PROJECT_DIR/plans/`:
   ```bash
   grep -l "status: active" "$PROJECT_DIR"/plans/*.md 2>/dev/null
   ```

2. For each active plan, extract the "Affected Files" section.

3. Compare against this ticket's affected files. If overlap exists:
   ```
   CONFLICT DETECTED
     File: src/auth/session.ts
     Your ticket: {this LINEAR_ID}
     Other ticket: {other LINEAR_ID} by {author}
     Other plan summary: {one-line}
     Recommendation: Run /hyve:review to align before implementing.
   ```

4. If no conflicts: `No conflicts with active plans.`

## Produce Pickup Brief

Synthesize all gathered context into a structured brief:

```markdown
# Pickup Brief: {ticket title}

**Linear:** {issue ID} | **Priority:** {P1/..} | **Branch:** {current or suggested}
**Prepared:** {datetime} | **Author:** {user}

## PM Intent
{What the PM wants and WHY. Quoted from spec/ticket where possible.
This is the most important section — it's the "why" behind the "what."}

## Constraints (from PM)
{What must NOT change. Performance limits. Compatibility requirements.
Quoted from spec/ticket. If none stated, say "No explicit constraints."}

## Acceptance Criteria
- [ ] {From spec or ticket}

## Codebase Analysis

### Affected Files
- `src/path/file.ts` — {what needs to change}

### Patterns to Follow
- {Pattern name}: see `src/example/file.ts` for reference

### Recent Activity
- {file}: {N} commits in last 30 days, last by {author} on {date}

## Related Context
- **Decisions:** {summary of relevant decisions from decisions/}
- **Prior reviews:** {summary of relevant review feedback}
- **Adjacent work:** {other tickets touching nearby code}

## Conflicts
{conflict detection results — or "No conflicts with active plans."}

## Suggested Approach
{Based on all gathered context, suggest an implementation approach.
Reference specific files, patterns, and existing code to reuse.}
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
author: {user}
date: {ISO date}
linear_id: {issue ID}
branch: {git branch}
commit: {git rev-parse --short HEAD}
affected_files:
  - src/path/file.ts
  - src/path/other.ts
---
```

**Version check:** Mark any prior plan for this Linear ID as `superseded`.

## Update Linear

If Linear MCP is available:
- Update issue status to "In Progress" via `mcp__claude_ai_Linear__save_issue`
- Add a comment with the plan summary:
  > **Hyve Pickup** — Plan created
  > Affected files: {list}
  > Suggested approach: {one-line}
  > Conflicts: {none | list}

## Conventions

**Follow `CONVENTIONS.md` for all user interactions.** All AskUserQuestion calls
MUST use the 5-part format (re-ground, simplify, recommend, options, one-decision-per-question).

## Completion

### Step 1: Report summary

```
PICKUP COMPLETE
  Ticket: {LINEAR_ID} — {title}
  Brief saved: {plan file path}
  Affected files: {N}
  Conflicts: {N found | none}
  Linear updated: yes / skipped
```

### Step 2: Walk through the brief with the user

**This step is MANDATORY. Do not skip it.**

Walk through the pickup brief conversationally:
- **PM Intent:** Summarize what the PM wants and why (the most important part)
- **Constraints:** Anything the dev must NOT do
- **Suggested Approach:** Walk through the approach and why you recommend it
- **Conflicts:** If any, explain specifically which files overlap and with whom
- **Key Decisions:** Reference any prior decisions from shared state that affect this work

Ask if the user has questions or needs clarification before offering next steps.

### Step 3: Offer next steps

**If no conflicts:**
> "Context loaded for {LINEAR_ID}. Ready to implement. What's next?"
> A) Start implementing — I have full context now
> B) Run `/hyve:review` on the plan first — get PM + eng feedback before coding
> C) Record a decision (`/hyve:decision`) — I already know which approach I'll take

**If conflicts detected:**
> "Context loaded, but {N} conflict(s) detected with other active plans. What's next?"
> A) Run `/hyve:review` to align with the other dev before implementing
> B) Start implementing anyway — the conflicts are minor
> C) Check the conflicting plan in detail — show me the overlap
