---
name: hyve:status
version: 0.3.1
description: |
  Cross-role status update with priority management. Reads Linear issues, git
  history, shared state, and project timeline to produce a role-appropriate
  status report. Surfaces your top priorities, what's blocked, and what needs
  attention next.

  Use when: someone wants to know where things stand, or needs help deciding
  what to work on next.
  Trigger: /hyve:status [linear-project | "all"] [--project <slug>]
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

# /hyve:status — Status Update + Priority Manager

Produces a status report that reads differently depending on your role.
Also surfaces your **top priorities** and recommends what to work on next.

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

## Data Gathering

### 1. Linear Issues (via MCP)

If Linear MCP is available:
- List all issues in the configured team/project that are "In Progress" or "In Review"
- For each issue: title, assignee, status, priority, due date, labels
- Group by status
- **Also fetch:** issues assigned to the current user, sorted by priority

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

Count active items per type (specs, plans, reviews, decisions, incidents).

### 4. Project Timeline

```bash
# Last 20 events from the timeline
tail -20 "$PROJECT_DIR/timeline.md" 2>/dev/null || echo "No timeline"
```

### 5. Priority Analysis

Cross-reference Linear priorities with shared state to determine what needs
attention:

**Priority signals (highest first):**
1. **Blocked items** — anything with a blocker needs unblocking or reassignment
2. **Overdue items** — past due date in Linear
3. **Urgent/Critical** — P1/P2 in Linear that are still in progress
4. **Stale items** — in-progress issues with no commits or updates in 5+ days
5. **Unreviewed plans** — active plans that haven't been through `/hyve:review`
6. **Carry-over** — items that were in-progress at the start of the period
7. **Ready to pick up** — backlog items with specs ready but no active plan

## Generate Status Report

### PM View (`role: pm`)

```markdown
# Status Report: {project}
Generated: {datetime} | Role: PM

## Your Priorities

🔴 **Immediate attention:**
- [{VER-123}](https://linear.app/issue/VER-123): {title} — BLOCKED: {reason}
- [{VER-456}](https://linear.app/issue/VER-456): {title} — OVERDUE by 2 days

🟡 **This week:**
- [{VER-789}](https://linear.app/issue/VER-789): {title} — In Progress, on track
- [{VER-012}](https://linear.app/issue/VER-012): {title} — needs review

🟢 **On track:**
- [{VER-345}](https://linear.app/issue/VER-345): {title} — 3/5 tasks done

## Feature Progress

| Feature | Status | Assignee | Priority | Risks |
|---------|--------|----------|----------|-------|
| {title} | In Progress (3/5 tasks) | dev-1 | P2 | None |
| {title} | In Review | dev-2 | P1 | Blocker: API dependency |

## Recent Timeline
{Last 10 events from timeline.md, formatted as a narrative}

## Highlights
- {feature}: {what shipped or progressed this week}

## Risks & Blockers
- {blocker description} — impact: {what's delayed}

## Decisions This Week
- {summary of decisions from decisions/ modified in last 7 days}

## Recommendation
{Based on priority analysis: "Focus on unblocking VER-123 first — it's
blocking VER-456 and VER-789 downstream."}
```

### Dev View (`role: dev`)

```markdown
# Status Report: {project}
Generated: {datetime} | Role: Dev

## Your Priorities

🔴 **Do first:**
- [{VER-123}](https://linear.app/issue/VER-123): {title} — P1, no plan yet
- [{VER-456}](https://linear.app/issue/VER-456): {title} — stale (no commits in 5d)

🟡 **In progress:**
- [{VER-789}](https://linear.app/issue/VER-789): {title} — active on branch feat/...

🟢 **Ready to pick up:**
- [{VER-012}](https://linear.app/issue/VER-012): {title} — spec ready, no plan

## Active Work

| Ticket | Branch | Files Changed | PRs | Status |
|--------|--------|---------------|-----|--------|
| [{id}](https://linear.app/issue/{id}) | feat/... | 12 files | PR #45 (open) | In Progress |

## Recent Timeline
{Last 10 events from timeline.md}

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

## Recommendation
{Based on priority analysis: "VER-123 is P1 with no plan — run /hyve:pickup
to get started. VER-456 hasn't had commits in 5 days — is it still active?"}
```

### Lead View (`role: lead`)

Combines both PM and Dev views — full picture. Adds team-level priority view:

```markdown
## Team Priorities
| Person | Top Priority | Status | Risk |
|--------|-------------|--------|------|
| dev-1 | VER-123 | In Progress | None |
| dev-2 | VER-456 | Blocked | Waiting on API |
| PM | VER-789 | Needs review | — |
```

## Save Status

Write to `$PROJECT_DIR/status/${SLUG}-status-${DATE}.md`:

```yaml
---
status: active
author: {user}
date: {ISO date}
role: {role that generated this}
priorities_red: {N}
priorities_yellow: {N}
blockers: {N}
---
```

**Overwrite previous status:** Status files are the one exception to write-once.

## Append to Timeline

```bash
if [ ! -f "$PROJECT_DIR/timeline.md" ]; then
  echo "| Time | Who | Event | Ticket | Summary |" > "$PROJECT_DIR/timeline.md"
  echo "|------|-----|-------|--------|---------|" >> "$PROJECT_DIR/timeline.md"
fi
echo "| $(date -u +%Y-%m-%dT%H:%M:%SZ) | $(whoami) | status | — | Status report generated ({N} red, {N} yellow priorities) |" >> "$PROJECT_DIR/timeline.md"
```

## Auto-sync

```bash
"$HYVE_DIR/bin/hyve-push" "$SLUG" 2>/dev/null &
```

## Post to Slack (optional)

If Slack MCP is available, offer to share priorities:

Call AskUserQuestion with question "Post status highlights to Slack?" and options:
1. Yes — share priorities and blockers
2. No — just save locally
3. Type something.
4. Chat about this

## Completion

### Step 1: Report summary

```
STATUS COMPLETE
  Project: {slug}
  Role: {role}
  Issues tracked: {N}
  Red priorities: {N}
  Yellow priorities: {N}
  Blockers: {N}
  Saved to: {file path}
  Slack: posted / skipped
```

### Step 2: Walk through priorities with the user

**This step is MANDATORY. Do not skip it.**

Walk through conversationally, in priority order:
- **Red items first:** What needs immediate attention and why
- **Blockers:** What's stuck and who can unblock it
- **Stale items:** Anything that hasn't been touched — is it still active?
- **Recommendation:** "I'd suggest focusing on X first because Y"
- **Highlights:** What went well (celebrate wins)

Ask if the user agrees with the priority ordering or wants to adjust.

### Step 3: Offer next steps

**If red priorities exist:** call AskUserQuestion with question
"You have {N} red priority item(s). What's next?" and options:
1. Pick up the top priority (/hyve:pickup {id})
2. Unblock {blocked item} — let's investigate
3. Hand off a blocker to someone (/hyve:handoff)
4. Adjust priorities — I disagree with the ordering
5. Run a retro (/hyve:retro) — reflect on the period
6. Type something.
7. Chat about this

**If no red priorities:** call AskUserQuestion with question
"Status looks healthy. What's next?" and options:
1. Pick up the next ready item (/hyve:pickup)
2. Review an active plan (/hyve:review)
3. Run a retro (/hyve:retro) — reflect on the period
4. Done for now
5. Type something.
6. Chat about this
