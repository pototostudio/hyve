---
name: hyve:handoff
version: 0.2.0
description: |
  Structured role-to-role context handoff. When one person needs to hand work
  to another (PM to dev, dev to dev, dev to PM for review), this skill gathers
  all context and produces a comprehensive handoff document.

  Use when: handing off work to a teammate, going on vacation, or transitioning
  a feature between roles.
  Trigger: /hyve:handoff [linear-id]
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - AskUserQuestion
  - mcp__claude_ai_Linear__get_issue
  - mcp__claude_ai_Linear__list_comments
  - mcp__claude_ai_Linear__save_comment
  - mcp__claude_ai_Linear__save_issue
  - mcp__claude_ai_Slack__slack_send_message
---

# /hyve:handoff — Structured Context Handoff

Produce a comprehensive handoff document when transferring work between people.
Gathers all context so the recipient can pick up without asking questions.

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
mkdir -p "$PROJECT_DIR"/handoffs
_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
ROLE=$("$HYVE_DIR/bin/hyve-config" get role 2>/dev/null || echo "dev")
echo "PROJECT: $SLUG"
echo "ROLE: $ROLE"
echo "BRANCH: $_BRANCH"
```

## Input

### Identify the work being handed off

1. If argument is a Linear issue ID, use that.
2. If no argument, use smart detection (current branch → Linear → prompt).

### Identify the recipient

Use AskUserQuestion:
> "Who are you handing this off to?"
> A) A specific person (I'll name them)
> B) Anyone on the team (general handoff)
> C) Future me (vacation handoff — I'll pick this back up later)

If A: ask for the person's name. This personalizes the handoff and is used
in the Linear comment and Slack notification.

## Context Gathering

Gather EVERYTHING related to this work:

### 1. Linear Context
- Issue details: title, description, status, priority, comments
- Sub-issues and their statuses
- Linked issues
- Activity timeline

### 2. Shared State
- Specs related to this issue
- Plans (all versions, including superseded — show the evolution)
- Decisions made during this work
- Prior reviews and their findings
- Any existing handoffs (handoff chains)

### 3. Git Context
```bash
# Commits on this branch
git log --oneline "$(git merge-base HEAD main 2>/dev/null || echo HEAD~20)..HEAD" 2>/dev/null | head -20
# Files changed
git diff --stat "$(git merge-base HEAD main 2>/dev/null || echo HEAD~20)" 2>/dev/null | tail -5
# Open PRs for this branch
gh pr list --head "$_BRANCH" 2>/dev/null || echo "no PRs"
```

### 4. Code State
- What's implemented vs. what remains
- Known bugs or incomplete areas
- Tests that exist vs. tests still needed

## Produce Handoff Document

```markdown
---
status: active
author: {user}
recipient: {name | "team" | "self"}
date: {ISO date}
linear_id: {issue ID}
branch: {git branch}
handoff_type: {pm-to-dev | dev-to-dev | dev-to-pm | vacation | general}
---

# Handoff: {ticket title}

**From:** {author} | **To:** {recipient} | **Date:** {date}
**Linear:** {issue ID} | **Branch:** {branch}

## Summary
{2-3 sentence overview: what this work is, where it stands, what's left}

## What Was Done
{Chronological narrative of work completed. Reference specific commits and PRs.}

- {date}: {what was done} ({commit hash})
- {date}: {what was done} ({commit hash})

## What Remains
- [ ] {specific remaining task}
- [ ] {specific remaining task}

## Key Decisions Made
{Reference decision records from shared state. If none exist, summarize
inline and suggest the recipient run /hyve:decision to formalize them.}

- **{decision title}**: {summary} — see `decisions/{filename}`

## Known Issues & Gotchas
{Things that will trip up the recipient if they don't know about them.
Be specific — "the auth middleware has a bug where..." not "there are some issues."}

- {gotcha description}

## Context the Recipient Needs
{Background knowledge that isn't in the code or tickets.
Verbal agreements, Slack threads, design intent, PM preferences.}

## Files to Focus On
- `{path}` — {why this file is important}

## How to Verify
{Steps to verify the work so far is correct. Commands to run, pages to check,
edge cases to test.}

## Questions for the Recipient
{If there are decisions the author couldn't make, list them here.}
```

## Save Handoff

Write to `$PROJECT_DIR/handoffs/${ROLE}-to-${RECIPIENT_ROLE}-${LINEAR_ID}-${DATETIME}.md`

## Notify

### Linear
Post a comment on the issue:
> **Handoff:** {author} → {recipient}
> Status: {summary}
> Remaining: {N} items
> Full handoff: `~/.hyve/projects/{slug}/handoffs/{filename}`

If handing off to a specific person and they're a Linear user, @mention them
in the comment.

### Slack (optional)
If Slack MCP is available and recipient is named:
> *Handoff from {author}:* {ticket title} ({Linear ID})
> {one-line summary of what's left}
> Full context in the handoff doc.

### Linear Status Update
If the handoff type is `dev-to-pm` (handing back for review), update the
Linear issue status to "In Review."

## Conventions

**Follow `CONVENTIONS.md` for all user interactions.** All AskUserQuestion calls
MUST use the 5-part format (re-ground, simplify, recommend, options, one-decision-per-question).

## Completion

### Step 1: Report summary

```
HANDOFF COMPLETE
  From: {author} ({role})
  To: {recipient}
  Ticket: {LINEAR_ID} — {title}
  Remaining items: {N}
  Saved to: {file path}
  Linear: commented / skipped
  Slack: notified / skipped
```

### Step 2: Walk through the handoff with the user

**This step is MANDATORY. Do not skip it.**

Summarize the handoff conversationally:
- What's done vs. what remains (with counts)
- The most critical gotcha the recipient needs to know
- Any open questions the recipient will need to answer

Ask if the user wants to add anything before finalizing.

### Step 3: Offer next steps

Call the AskUserQuestion tool with question
"Handoff complete. {recipient} has been notified. What's next?" and these options:
1. Pick up another ticket (/hyve:pickup)
2. Check team status (/hyve:status)
3. Done for now
4. Type something.
5. Chat about this

**Remind the recipient:** "When {recipient} starts, they should run `/hyve:pickup {LINEAR_ID}` to load the full context including this handoff."
