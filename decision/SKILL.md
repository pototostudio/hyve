---
name: hyve:decision
version: 0.3.0
description: |
  Record a non-obvious decision with structured context. Captures what was decided,
  why, what alternatives were considered, and what consequences follow. Builds
  institutional memory that compounds over time.

  Use when: you made a non-obvious choice (library, pattern, architecture, trade-off)
  that future team members should understand.
  Trigger: /hyve:decision [description] [--project <slug>]
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
  - mcp__claude_ai_Linear__get_issue
  - mcp__claude_ai_Linear__save_comment
  - mcp__claude_ai_Linear__list_comments
---

# /hyve:decision — Record a Decision

Capture a non-obvious decision as a structured record in shared state.
Over time, these records build institutional memory — answering "why did we
do it this way?" for anyone who asks later.

**Read and follow `$HYVE_DIR/CONVENTIONS.md` for all user interactions.**

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
mkdir -p "$PROJECT_DIR"/decisions
_BRANCH=$(git rev-parse --is-inside-work-tree 2>/dev/null && git branch --show-current 2>/dev/null || echo "unknown")
echo "BRANCH: $_BRANCH"
echo "PROJECT: $SLUG"
```

## Choose Gathering Mode

Before gathering details, assess whether the conversation already has rich context
(e.g., the user just finished a long investigation or implementation session).

**Conversation-draft mode triggers:**
- The conversation has 10+ messages before this skill was invoked
- The user already described the decision, alternatives, or reasoning earlier
- The user says something like "record what we just decided" or "capture this"

If conversation-draft mode applies, call AskUserQuestion with question
"I have context from our conversation. How should I capture this?" and options:
1. Draft from conversation — I'll write it, you review
2. Interview me — ask the questions one by one
3. Type something.
4. Chat about this

**If "Draft from conversation":** synthesize the decision from the conversation
context. Extract the decision, context, alternatives, and consequences from what
was discussed. Present the draft to the user for review before saving.

**If "Interview me":** proceed to the standard Gather flow below.

**If no rich context** (short conversation, skill invoked directly): go straight
to the Gather flow.

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

## Auto-sync

After saving, push to shared state:
```bash
"$HYVE_DIR/bin/hyve-push" "$SLUG" 2>/dev/null &
```

## Post to Linear (optional)

If a Linear ID was provided and Linear MCP is available:

1. **Check for existing hyve comments** on the issue:
   - Use `mcp__claude_ai_Linear__list_comments` to fetch comments
   - Search for comments containing "**Decision recorded:**" or "**Hyve"
   - If a hyve comment already exists, DON'T post a duplicate

2. **If no existing hyve decision comment:** post:
   > **Decision recorded:** {title}
   > Tags: {tags}
   > Full record: `~/.hyve/projects/{slug}/decisions/{filename}`

3. **If a hyve comment already exists:** tell the user:
   "A hyve comment already exists on this ticket. Skipping duplicate."

## Completion

### Step 1: Report summary

```
DECISION RECORDED
  Title: {title}
  Tags: {tags}
  Saved to: {file path}
  Linear comment: posted / skipped / duplicate
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
