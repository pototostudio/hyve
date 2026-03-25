---
name: hyve:status
version: 0.1.0
description: |
  Cross-role status update. Reads Linear issues, git history, and shared state
  to produce a role-appropriate status report. PM gets product-language progress;
  dev gets technical details. Replaces status meetings.

  Use when: someone wants to know where things stand.
  Trigger: /hyve:status [linear-project | "all"]
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - AskUserQuestion
  - mcp__claude_ai_Linear__list_issues
  - mcp__claude_ai_Linear__get_issue
  - mcp__claude_ai_Linear__get_team
  - mcp__claude_ai_Linear__list_teams
  - mcp__claude_ai_Linear__get_project
  - mcp__claude_ai_Slack__slack_send_message
---

# /hyve:status — Cross-Role Status Update

Produces a status report that reads differently depending on your role.
PM gets feature progress in product language. Dev gets technical details.

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
ROLE=$("$HYVE_DIR/bin/hyve-config" get role 2>/dev/null || echo "dev")
_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "PROJECT: $SLUG"
echo "ROLE: $ROLE"
echo "BRANCH: $_BRANCH"
```

## Data Gathering

### 1. Linear Issues (via MCP)

If Linear MCP is available:
- List all issues in the configured team/project that are "In Progress" or "In Review"
- For each issue: title, assignee, status, priority, due date, labels
- Group by status

If Linear MCP is unavailable:
- Use shared state only. Read all active plans and specs.
- Warn: "Linear unavailable — status based on shared state only."

### 2. Git Activity

```bash
# Recent commits in last 7 days, grouped by author
git log --since="7 days ago" --format="%an|%s|%h" --no-merges 2>/dev/null | head -30
# Open branches
git branch -r --sort=-committerdate 2>/dev/null | head -10
# Open PRs (if gh is available)
gh pr list --state open --limit 10 2>/dev/null || echo "gh not available"
```

### 3. Shared State Activity

```bash
# Recently modified artifacts
find "$PROJECT_DIR" -name '*.md' -mtime -7 2>/dev/null | sort -r | head -20
```

Count active items per type (specs, plans, reviews, decisions).

## Generate Status Report

### PM View (`role: pm`)

Focus on feature progress, risks, and timeline:

```markdown
# Status Report: {project}
Generated: {datetime} | Role: PM

## Feature Progress

| Feature | Status | Assignee | Risks | ETA |
|---------|--------|----------|-------|-----|
| {title} | In Progress (3/5 tasks) | dev-1 | None | On track |
| {title} | In Review | dev-2 | Blocker: API dependency | Delayed 2d |

## Highlights
- {feature}: {what shipped or progressed this week}

## Risks & Blockers
- {blocker description} — impact: {what's delayed}

## Decisions This Week
- {summary of decisions from decisions/ modified in last 7 days}

## Next Week
- {what's planned based on Linear issue priorities}
```

### Dev View (`role: dev`)

Focus on technical progress, PRs, and conflicts:

```markdown
# Status Report: {project}
Generated: {datetime} | Role: Dev

## Active Work

| Ticket | Branch | Files Changed | PRs | Status |
|--------|--------|---------------|-----|--------|
| {id} | feat/... | 12 files | PR #45 (open) | In Progress |

## Recent Commits (7 days)
- {author}: {N} commits — {summary}

## Open PRs
- PR #{N}: {title} — {status, reviewers, CI}

## Conflicts
- {any file overlap between active plans}

## Shared State Updates
- {N} new specs, {N} new decisions, {N} new reviews this week

## Blockers
- {from Linear: blocked issues with reason}
```

### Lead View (`role: lead`)

Combines both PM and Dev views — full picture.

## Save Status

Write to `$PROJECT_DIR/status/${SLUG}-status-${DATE}.md`:

```yaml
---
status: active
author: {user}
date: {ISO date}
role: {role that generated this}
---
```

**Overwrite previous status:** Status files are the one exception to write-once.
Replace the previous status file for this project (only keep the latest).

## Post to Slack (optional)

If Slack MCP is available, offer via AskUserQuestion:
> "Post this status to Slack?"
> A) Yes — post to configured channel
> B) No — just save locally

## AskUserQuestion Format

All questions to the user MUST use AskUserQuestion with lettered options:
- Re-ground: state the project and role (1 sentence)
- Options: A), B), C) with clear one-line descriptions
- Recommend: state which option and why

## Completion

```
STATUS COMPLETE
  Project: {slug}
  Role: {role}
  Issues tracked: {N}
  Saved to: {file path}
  Slack: posted / skipped
```

## What's Next

After the status report, recommend via AskUserQuestion:

**If blockers were found:**
> "Status shows {N} blocker(s). What's next?"
> A) Pick up the blocked ticket to unblock it (`/hyve:pickup`)
> B) Hand off the blocker to someone who can resolve it (`/hyve:handoff`)
> C) Done — I'll address blockers separately

**If no blockers:**
> "Status report complete. What's next?"
> A) Pick up the next priority ticket (`/hyve:pickup`)
> B) Review an active plan (`/hyve:review`)
> C) Done for now
