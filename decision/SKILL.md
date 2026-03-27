---
name: hyve:decision
version: 0.2.0
description: |
  Record a non-obvious decision with structured context. Captures what was decided,
  why, what alternatives were considered, and what consequences follow. Builds
  institutional memory that compounds over time.

  Use when: you made a non-obvious choice (library, pattern, architecture, trade-off)
  that future team members should understand.
  Trigger: /hyve:decision [description]
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
  - mcp__claude_ai_Linear__get_issue
  - mcp__claude_ai_Linear__save_comment
---

# /hyve:decision — Record a Decision

Capture a non-obvious decision as a structured record in shared state.
Over time, these records build institutional memory — answering "why did we
do it this way?" for anyone who asks later.

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
mkdir -p "$PROJECT_DIR"/decisions
_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "BRANCH: $_BRANCH"
echo "PROJECT: $SLUG"
```

## Gather Decision Details

If the user provided a description as an argument, use it as the starting point.
Otherwise, ask via AskUserQuestion:

> "What decision did you make? Describe it in one sentence."

Then ask follow-up questions ONE AT A TIME:

1. **Context:** "What prompted this decision? What problem were you solving?"

2. **Alternatives:** "What other options did you consider? Why did you reject them?"
   - If the user says "none" or "obvious choice," push once:
     "Even obvious choices have alternatives — what would someone unfamiliar
     with this codebase have tried instead?"

3. **Consequences:** "What does this decision enable or constrain going forward?"

4. **Linear link:** "Is this related to a specific ticket? (Enter Linear ID or skip)"

5. **Tags:** "What topics should this be searchable by? (e.g., auth, database, api-design)"

## Write Decision Record

```bash
DATETIME=$(date +%Y%m%d-%H%M%S)
USER=$(whoami)
```

Generate a slug from the decision title (lowercase, hyphens, max 60 chars).

Write to `$PROJECT_DIR/decisions/${DATETIME}-${DECISION_SLUG}.md`:

```markdown
---
status: active
author: {git user name}
date: {ISO date}
linear_id: {issue ID or "none"}
tags: [{comma-separated tags}]
branch: {current branch}
---

# Decision: {title}

## Context
{what prompted this decision}

## Decision
{what was decided}

## Alternatives Considered
{what was rejected and why — at least one alternative}

## Consequences
{what this enables or constrains going forward}
```

## Post to Linear (optional)

If a Linear ID was provided and Linear MCP is available, add a comment:
> **Decision recorded:** {title}
> Tags: {tags}
> Full record: `~/.hyve/projects/{slug}/decisions/{filename}`

## Conventions

**Follow `CONVENTIONS.md` for all user interactions.** All AskUserQuestion calls
MUST use the 5-part format (re-ground, simplify, recommend, options, one-decision-per-question).

## Completion

### Step 1: Report summary

```
DECISION RECORDED
  Title: {title}
  Tags: {tags}
  Saved to: {file path}
  Linear comment: posted / skipped
```

### Step 2: Confirm the record with the user

Read back the decision summary: what was decided, the key alternative that was
rejected, and the primary consequence. This is a quick sanity check — not a
deep walkthrough. Ask if anything needs correction before offering next steps.

### Step 3: Offer next steps

Call the AskUserQuestion tool with question
"Decision recorded. {total} decisions in shared state for this project. What's next?"
and these options:
1. Continue implementing — back to work
2. Record another decision (/hyve:decision) — I have more to capture
3. Search past decisions (/hyve:search) — see what the team has decided before
4. Done for now
5. Type something.
6. Chat about this
