---
name: hyve:update
version: 0.3.0
description: |
  Append findings, status updates, or new context to an existing plan/brief
  without creating a new version. Designed for living documents — especially
  bug investigations where the plan evolves as you learn more.

  Use when: you've learned something new during implementation or investigation
  and want to capture it in the existing brief.
  Trigger: /hyve:update [finding or context]
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - AskUserQuestion
  - mcp__claude_ai_Linear__get_issue
  - mcp__claude_ai_Linear__save_comment
---

# /hyve:update — Append Findings to Existing Brief

Lightweight skill to update a living document. Appends investigation findings,
status changes, or new context to the existing plan/brief without creating a
new version. The plan stays as the single source of truth.

**Follow `CONVENTIONS.md` (in the hyve root directory) for all user interactions.**

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
_BRANCH=$(git rev-parse --is-inside-work-tree 2>/dev/null && git branch --show-current 2>/dev/null || echo "unknown")
echo "PROJECT: $SLUG"
echo "BRANCH: $_BRANCH"
echo "STATE: $PROJECT_DIR"
```

## Find the Active Plan

Resolution order:

1. **Check current branch:** Look for the most recent active plan for this branch:
   ```bash
   ls -t "$PROJECT_DIR"/plans/*-${_BRANCH}-*.md 2>/dev/null | head -1
   ```

2. **Check argument:** If the user passed a Linear ID or file path, use that.

3. **Fall back:** List all active plans and ask:
   ```bash
   grep -l "status: active" "$PROJECT_DIR"/plans/*.md 2>/dev/null
   ```

If no active plan found, suggest running `/hyve:pickup` first.

## Determine Update Type

If the user provided text as an argument, use it as the finding.

Otherwise, call AskUserQuestion with question
"What kind of update?" and these options:
1. Investigation finding — I discovered something about the root cause
2. Status change — updating where things stand
3. Hypothesis update — my theory changed based on new evidence
4. Scope change — the work is bigger/smaller than expected
5. Decision made — I chose an approach (also records via /hyve:decision)
6. Type something.
7. Chat about this

## Gather the Update

Based on the update type, ask focused follow-up questions ONE AT A TIME:

**Investigation finding:**
- "What did you find?" (one sentence)
- "What evidence supports this?" (log line, error message, code reference)
- "Does this change the investigation plan?" (yes/no)

**Status change:**
- "What's the current status?" (investigating / found root cause / fixing / testing / blocked)
- "What's blocking?" (if blocked)

**Hypothesis update:**
- "What was the old hypothesis?"
- "What's the new hypothesis?"
- "What evidence caused the change?"

**Scope change:**
- "Bigger or smaller?"
- "What changed?"

**Decision made:**
- "What did you decide?"
- "Why?" (one sentence)
- Also offer to run `/hyve:decision` for a full decision record.

## Append to Plan

Read the existing plan file. Append the update as a new section at the end,
**before any "Suggested Approach" or "Investigation Plan" sections** (so the
plan reads chronologically):

```markdown

## Update: {type} — {date} {time}

{Content of the update}

**Evidence:** {if applicable}
**Impact:** {if this changes the approach, state how}
```

If the update changes the investigation plan or suggested approach, also update
those sections in-place (don't just append — rewrite the plan to reflect the
new understanding).

Write the updated plan back to the same file path (this is the ONE exception
to hyve's write-once rule — plans are living documents).

## Auto-sync

After saving, push to shared state:
```bash
"$HYVE_DIR/bin/hyve-push" "$SLUG" 2>/dev/null &
```

## Post to Linear (optional)

If Linear MCP is available and a Linear ID is in the plan's frontmatter,
post a brief comment:

> **Hyve Update** ({type})
> {one-line summary of the update}

## Completion

Tell the user what was updated:
```
BRIEF UPDATED
  Plan: {file path}
  Update: {type}
  Linear comment: posted / skipped
```

Then offer next steps via AskUserQuestion:
1. Continue working — back to the investigation/implementation
2. Add another update (/hyve:update)
3. Record a formal decision (/hyve:decision)
4. Done for now
5. Type something.
6. Chat about this
