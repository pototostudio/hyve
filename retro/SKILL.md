---
name: hyve:retro
version: 0.3.1
description: |
  Project or sprint retrospective. Reads all shared state artifacts from the
  period, git history, and Linear to produce a structured retro: what shipped,
  what was learned, what to improve, and action items for next cycle.

  Use when: wrapping up a project, ending a sprint, or reflecting on a period
  of work. Best run at the end of a week or after a major milestone.
  Trigger: /hyve:retro [--period <days>] [--project <slug>]
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
  - mcp__claude_ai_Linear__get_team
  - mcp__claude_ai_Linear__list_teams
  - mcp__claude_ai_Linear__save_comment
  - mcp__claude_ai_Slack__slack_send_message
---

# /hyve:retro — Project Retrospective

Look back on a period of work: what shipped, what was learned, what to improve.
Reads shared state, git history, and Linear to produce a comprehensive retro.

**Read and follow `$HYVE_DIR/CONVENTIONS.md` for all user interactions.**

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
ROLE=$("$HYVE_DIR/bin/hyve-config" get role 2>/dev/null || echo "dev")
_BRANCH=$(git rev-parse --is-inside-work-tree 2>/dev/null && git branch --show-current 2>/dev/null || echo "unknown")
echo "PROJECT: $SLUG"
echo "ROLE: $ROLE"
echo "BRANCH: $_BRANCH"
echo "STATE: $PROJECT_DIR"
```

## Determine Period

If the user passed `--period <days>`, use that. Otherwise ask:

Call AskUserQuestion with question "What period should this retro cover?" and options:
1. Last 7 days (weekly retro)
2. Last 14 days (sprint retro)
3. Last 30 days (monthly retro)
4. Specific date range — I'll specify
5. Since last retro
6. Type something.
7. Chat about this

If "Since last retro": check for the most recent retro file:
```bash
ls -t "$PROJECT_DIR"/retros/*.md 2>/dev/null | head -1
```
Use its date as the start of the period.

## Data Gathering

### 1. Shared State Artifacts

Read all artifacts created/modified in the period:

```bash
PERIOD_DAYS="${PERIOD:-7}"
echo "=== Artifacts from last $PERIOD_DAYS days ==="
find "$PROJECT_DIR" -name '*.md' -mtime -"$PERIOD_DAYS" 2>/dev/null | sort
```

For each artifact, extract:
- **Specs created:** What requirements were decomposed
- **Plans created/updated:** What work was planned
- **Reviews completed:** What was reviewed and the verdicts
- **Decisions recorded:** What non-obvious choices were made
- **Incidents:** What production issues occurred
- **Handoffs:** What work changed hands

### 2. Git History

```bash
SINCE_DATE=$(date -v-"${PERIOD_DAYS}d" +%Y-%m-%d 2>/dev/null || date -d "$PERIOD_DAYS days ago" +%Y-%m-%d 2>/dev/null || echo "7 days ago")
echo "=== Commits ==="
git log --oneline --since="$SINCE_DATE" --no-merges 2>/dev/null | head -30
echo "=== Authors ==="
git log --format="%an" --since="$SINCE_DATE" --no-merges 2>/dev/null | sort | uniq -c | sort -rn
echo "=== Files changed ==="
git diff --stat "$(git log --since="$SINCE_DATE" --format=%H --no-merges 2>/dev/null | tail -1)" HEAD 2>/dev/null | tail -5
echo "=== PRs merged ==="
gh pr list --state merged --search "merged:>=$SINCE_DATE" --limit 20 2>/dev/null || echo "gh not available"
```

### 3. Linear Activity

If Linear MCP is available:
- List issues that moved to "Done" or "Closed" in the period
- List issues still "In Progress" (carry-over)
- List issues that were created in the period (new scope)
- Check for issues that were re-opened (regressions)

### 4. Timeline Reconstruction

Read the project timeline from shared state:
```bash
cat "$PROJECT_DIR/timeline.md" 2>/dev/null || echo "No timeline file"
```

If a timeline exists, use it to reconstruct the narrative of what happened.

## Produce Retrospective

### For PM role:

Focus on product outcomes and team health:

```markdown
# Retro: {project} — {date range}

**Role:** PM | **Period:** {start} to {end}

## What Shipped
{Features/fixes that reached production. Link to Linear issues.}
- [{VER-123}](https://linear.app/issue/VER-123): {title} — shipped {date}

## What Didn't Ship (carry-over)
{Planned work that didn't complete. Why not.}
- [{VER-456}](https://linear.app/issue/VER-456): {title} — blocked by {reason}

## Scope Changes
{Work that was added or removed mid-period.}

## Key Decisions
{Summarize decisions from shared state.}

## Incidents
{Production incidents from the period. Link to incident records.}

## Team Health
- Velocity: {N} issues closed
- Carry-over: {N} issues still in progress
- New scope added: {N} issues created mid-period
- Handoffs: {N} context transfers

## What Went Well
{Ask the user — don't guess.}

## What Could Be Better
{Ask the user — don't guess.}

## Action Items for Next Cycle
- [ ] {specific, assignable action}
```

### For Dev role:

Focus on technical progress and learning:

```markdown
# Retro: {project} — {date range}

**Role:** Dev | **Period:** {start} to {end}

## What Shipped
{PRs merged, features completed.}
- PR #{N}: {title} — {files changed}, {insertions}+/{deletions}-

## Commits by Author
| Author | Commits | Key Areas |
|--------|---------|-----------|
| {name} | {N} | {top directories changed} |

## Code Hotspots
{Files with the most changes — potential tech debt signals.}

## Decisions Made
{From shared state — what trade-offs were locked in.}

## Incidents
{What broke and what was learned.}

## Investigation Learnings
{From incident records — false leads, breakthroughs, useful queries.}

## What Went Well
{Ask the user.}

## What Could Be Better
{Ask the user.}

## Tech Debt Identified
{Issues noticed during the period but deferred.}

## Action Items for Next Cycle
- [ ] {specific action}
```

## Interactive Sections

**"What Went Well" and "What Could Be Better" MUST be asked interactively.**
Don't generate these from data — the retro's value comes from human reflection.

Call AskUserQuestion with question "What went well this period?" and options:
1. Let me list a few things
2. Skip — nothing stands out
3. Type something.
4. Chat about this

Then: "What could be better?" with the same options.

Then: "Any action items for next cycle?" with options:
1. Yes — I have specific actions
2. Generate suggestions from the data
3. Skip
4. Type something.
5. Chat about this

## Save Retro

```bash
mkdir -p "$PROJECT_DIR/retros"
DATETIME=$(date +%Y%m%d-%H%M%S)
RETRO_FILE="$PROJECT_DIR/retros/retro-${DATETIME}.md"
```

Write with frontmatter:
```yaml
---
status: active
author: {user}
date: {ISO date}
period_start: {start date}
period_end: {end date}
role: {role}
issues_shipped: {N}
issues_carried: {N}
incidents: {N}
decisions: {N}
---
```

## Auto-sync

```bash
"$HYVE_DIR/bin/hyve-push" "$SLUG" 2>/dev/null &
```

## Post to Slack (optional)

If Slack MCP is available, offer to share the retro highlights:
> *Hyve Retro: {project}* ({date range})
> Shipped: {N} issues | Carry-over: {N} | Incidents: {N}
> Key win: {one-liner}
> Key improvement: {one-liner}

## Completion

### Step 1: Report summary

```
RETRO COMPLETE
  Project: {slug}
  Period: {start} to {end}
  Shipped: {N} issues
  Carry-over: {N} issues
  Incidents: {N}
  Decisions: {N}
  Action items: {N}
  Saved to: {file path}
```

### Step 2: Walk through the retro with the user

**This step is MANDATORY.**

Walk through conversationally:
- **Highlights:** Celebrate what shipped
- **Carry-over:** Discuss why things didn't ship — is there a pattern?
- **Incidents:** Key learnings from production issues
- **Action items:** Confirm each one is specific and assignable

### Step 3: Offer next steps

Call AskUserQuestion with question "Retro complete. What's next?" and options:
1. Plan next cycle — pick up the highest-priority carry-over
2. Share with team — post highlights to Slack
3. Record a decision from this retro (/hyve:decision)
4. Done
5. Type something.
6. Chat about this
