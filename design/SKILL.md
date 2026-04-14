---
name: hyve:design
version: 0.4.0
description: |
  Live design session capture. Use during cross-service or architecture design
  discussions to track decisions, rejected options, and trade-offs as they happen.
  Produces a spec at the end from the captured context.

  Unlike /hyve:spec (PM decomposes a finished requirement) or /hyve:decision
  (records one decision after the fact), this skill runs alongside a design
  conversation and captures reasoning in real time.

  Use when: you're in a design discussion and want to capture decisions as you go,
  or you just finished a design session and want to produce a spec from it.
  Trigger: /hyve:design [topic | linear-id] [--project <slug>]
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
---

# /hyve:design — Live Design Session Capture

Run this during or after a design discussion. Captures decisions, rejected
options, and trade-offs as they happen, then produces a structured spec.

**Read and follow `$HYVE_DIR/CONVENTIONS.md` for all user interactions.**

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
mkdir -p "$PROJECT_DIR"/{specs,plans,decisions}
_BRANCH=$(git rev-parse --is-inside-work-tree 2>/dev/null && git branch --show-current 2>/dev/null || echo "unknown")
echo "PROJECT: $SLUG"
echo "BRANCH: $_BRANCH"
echo "STATE: $PROJECT_DIR"
```

## Choose Mode

Call AskUserQuestion with question "What kind of design session?" and options:
1. Starting a design discussion — capture as we go
2. Just finished discussing — produce a spec from our conversation
3. Resume a previous session — continue where we left off
4. Type something.
5. Chat about this

### "Starting a design discussion" (live mode)

This is the primary mode. The skill stays active during the conversation,
periodically capturing key moments.

**Setup:**
1. Ask for the topic and any Linear issue IDs
2. Create a live design doc immediately:

```bash
DATETIME=$(date +%Y%m%d-%H%M%S)
DESIGN_FILE="$PROJECT_DIR/specs/design-session-${DATETIME}.md"
```

Write initial file:
```markdown
---
status: active
type: design-session
author: {user}
date: {ISO date}
linear_id: {issue ID or "none"}
branch: {branch}
---

# Design Session: {topic}

**Started:** {datetime} | **Status:** In Progress

## Context
{Brief description of what we're designing and why}

## Decisions Made
<!-- Decisions are appended during the session -->

## Options Rejected
<!-- Rejected approaches with reasoning -->

## Open Questions
<!-- Unresolved items -->

## Trade-offs Identified
<!-- Explicit trade-offs acknowledged -->
```

**During the discussion:**

After each significant design point in the conversation, PROACTIVELY append
to the live doc. Don't wait for the user to ask. Watch for:

- **A decision is made** ("let's go with X", "we'll use Y") → append to Decisions Made
- **An option is rejected** ("we considered X but...") → append to Options Rejected
- **A trade-off is acknowledged** ("this means we lose X but gain Y") → append to Trade-offs
- **A question is raised but not answered** → append to Open Questions
- **A question gets answered** → move from Open Questions to Decisions Made

Format for each entry:
```markdown
### {short title}
**Decision/Rejection/Trade-off:** {what}
**Reasoning:** {why}
**Alternatives considered:** {if applicable}
**Impact:** {what this enables or constrains}
```

**Periodically (every 3-5 major discussion points),** save the updated doc
and tell the user:
> "Captured {N} decisions, {N} rejections, {N} open questions so far."

### "Just finished discussing" (synthesis mode)

Scan the conversation for:
- Decisions made (explicit or implicit)
- Options that were discussed and rejected
- Trade-offs acknowledged
- Open questions that weren't resolved
- Architecture choices (services, data flow, APIs)

Synthesize into the same design doc format, present for review.

### "Resume a previous session"

List recent design session files:
```bash
ls -t "$PROJECT_DIR"/specs/design-session-*.md 2>/dev/null | head -5
```

Load the selected file and continue appending.

## Produce Spec

When the user says "done" or "wrap up", or when the session naturally concludes:

1. **Review open questions** — present each one and ask if it's been resolved
2. **Summarize the design** — produce a one-paragraph summary
3. **Generate a spec** from the design doc:
   - Convert decisions into requirements
   - Convert trade-offs into constraints
   - List affected files based on the architecture discussed
   - Create acceptance criteria from the decisions

Call AskUserQuestion with question "Design session complete. What should I produce?"
and options:
1. Full spec (/hyve:spec format) — decompose into implementation tasks
2. Save the design doc as-is — I'll spec it later
3. Continue discussing — not done yet
4. Type something.
5. Chat about this

If "Full spec": transform the design doc into a proper spec using the
`/hyve:spec` format (tasks with PM intent, constraints, acceptance criteria,
affected files). Save as a separate spec file and link back to the design doc.

## Auto-sync

After saving, push to shared state:
```bash
"$HYVE_DIR/bin/hyve-push" "$SLUG" 2>/dev/null &
```

## Post to Linear

If a Linear ID was provided:
- Post a comment linking to the design doc
- If a spec was produced, post that too

## Completion

```
DESIGN SESSION COMPLETE
  Topic: {topic}
  Decisions: {N}
  Rejections: {N}
  Open questions: {N}
  Trade-offs: {N}
  Design doc: {file path}
  Spec produced: {yes — path | no}
  Linear comment: posted / skipped
```

### Walk through with the user

Walk through the key outcomes:
- **Core decisions:** The 2-3 most important choices made
- **Biggest trade-off:** The most significant thing we're giving up
- **Open questions:** What still needs resolution before implementation
- **Next step:** What should happen next

### Offer next steps

Call AskUserQuestion with question "What's next?" and options:
1. Start implementing — run /hyve:pickup on the spec
2. Review the design — run /hyve:review (design mode)
3. Record the key decision formally — /hyve:decision
4. Share with the team — post to Slack
5. Done for now
6. Type something.
7. Chat about this
