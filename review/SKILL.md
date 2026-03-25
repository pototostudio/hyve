---
name: hyve:review
version: 0.1.0
description: |
  Multi-stakeholder plan review. Examines an implementation plan from three perspectives:
  PM (does it match requirements?), Engineering (is the architecture sound?), and
  Coordination (does it conflict with other work?). Produces a review document saved
  to shared state and posted to Linear.

  Use when: a plan exists and needs review before implementation.
  Trigger: /hyve:review [path | linear-id]
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
  - mcp__claude_ai_Linear__save_comment
  - mcp__claude_ai_Linear__list_comments
  - mcp__claude_ai_Linear__get_team
  - mcp__claude_ai_Linear__list_teams
  - mcp__claude_ai_Slack__slack_send_message
  - mcp__claude_ai_Slack__slack_read_channel
---

# /hyve:review — Multi-Stakeholder Plan Review

Review an implementation plan from three perspectives: PM, Engineering, and Coordination.
Produces a structured review document saved to shared state.

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
mkdir -p "$STATE_DIR/projects" "$STATE_DIR/.cache"
_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
ROLE=$("$HYVE_DIR/bin/hyve-config" get role 2>/dev/null || echo "dev")
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
mkdir -p "$PROJECT_DIR"/{specs,plans,reviews,decisions,handoffs,status}
echo "BRANCH: $_BRANCH"
echo "PROJECT: $SLUG"
echo "ROLE: $ROLE"
echo "STATE: $PROJECT_DIR"

# Check for gstack interop
GSTACK_AVAILABLE=false
if [ -d "$HOME/.claude/skills/gstack" ] || [ -d ".claude/skills/gstack" ]; then
  GSTACK_AVAILABLE=true
fi
echo "GSTACK: $GSTACK_AVAILABLE"

# Check for Linear MCP availability (best-effort)
echo "LINEAR_MCP: available (check via tool call)"
```

## Plan Resolution

Find the plan to review. Resolution order:

1. **Check arguments:** If the user passed a file path or Linear issue ID (e.g., `VER-456`),
   use that directly.

2. **Check current branch:** Look for plan files matching the current branch:
   ```bash
   ls -t "$PROJECT_DIR"/plans/*-${_BRANCH}-*.md 2>/dev/null | head -5
   ```

3. **Check Linear:** If no local plan found, search Linear for issues assigned to the
   current user that are "In Progress":
   - Use `mcp__claude_ai_Linear__list_issues` with appropriate filters
   - Look for issues with matching project/team

4. **Fall back:** If nothing found, use AskUserQuestion to ask the user which plan to review.
   Show available plans from shared state.

If the plan is a Linear issue ID, fetch the issue details via MCP and check if a
corresponding plan exists in shared state. If not, the review will work from the
Linear issue directly (less context, but functional).

## Review Flow

Once a plan is identified, run three review perspectives sequentially.

### Perspective 1: PM Review

**Goal:** Does this plan deliver what the PM intended?

1. **Load PM context:**
   - If a spec exists in `$PROJECT_DIR/specs/` for this Linear issue, read it
   - Fetch the Linear issue via MCP: description, comments, linked issues, acceptance criteria
   - If no Linear MCP: use only local spec file (warn about reduced context)

2. **Review against PM intent:**
   - Does the plan address every requirement in the spec/ticket?
   - Are acceptance criteria covered?
   - Is there scope creep (work not requested)?
   - Are PM-stated constraints respected?
   - Are non-goals being accidentally included?

3. **Output PM findings** as a structured list:
   ```
   ## PM Perspective

   **Requirements coverage:**
   - [MET] Requirement A — covered by task 2
   - [GAP] Requirement B — not addressed in plan
   - [EXCEEDED] Feature X — not requested, adds scope

   **Constraints check:**
   - [OK] Must not break existing auth flow
   - [CONCERN] Performance constraint not addressed

   **Verdict:** PASS / PASS_WITH_CONCERNS / FAIL
   ```

### Perspective 2: Engineering Review

**Goal:** Is the architecture sound? Are edge cases covered?

**If gstack is installed** (`GSTACK_AVAILABLE=true`):
- Read gstack's eng review skill:
  ```bash
  ls "$HOME/.claude/skills/gstack/plan-eng-review/SKILL.md" 2>/dev/null || \
  ls ".claude/skills/gstack/plan-eng-review/SKILL.md" 2>/dev/null || \
  echo "GSTACK_SKILL_NOT_FOUND"
  ```
- If found, read the SKILL.md and follow its review methodology inline for the
  engineering perspective. Skip its preamble, AskUserQuestion format, telemetry,
  and review log sections — only use the review content sections (Architecture,
  Code Quality, Tests, Performance).
- Embed the output as the Engineering perspective section of the review.

**If gstack is NOT installed:**
- Run a simpler engineering review covering:
  - **Architecture:** Component boundaries, data flow, coupling concerns
  - **Edge cases:** Nil inputs, empty states, error paths, concurrent access
  - **Tests:** Are tests planned for new codepaths? Coverage gaps?
  - **Performance:** N+1 queries, memory usage, slow paths
  - **Security:** New attack surface, input validation, auth boundaries

Output as:
```
## Engineering Perspective

**Architecture:**
- [OK/CONCERN/ISSUE] finding description

**Edge Cases:**
- [GAP] what happens when X is nil?

**Tests:**
- [COVERED/GAP] test description

**Verdict:** PASS / PASS_WITH_CONCERNS / FAIL
```

### Perspective 3: Coordination Review

**Goal:** Does this plan conflict with other active work?

1. **Load active plans:** Read all plan files in `$PROJECT_DIR/plans/` that have
   `status: active` in their frontmatter.

2. **Check for file conflicts:**
   - Extract the "## Affected Files" section from the current plan
   - Extract the same section from all other active plans
   - Flag any file appearing in 2+ plans

3. **Check Linear for adjacent work:**
   - If Linear MCP is available, list other "In Progress" issues in the same project
   - Note any that touch related areas

4. **Timeline check:**
   - Does this plan depend on other work being complete first?
   - Are there ordering constraints?

Output as:
```
## Coordination Perspective

**Active conflicts:**
- [CONFLICT] src/auth/session.ts — also in plan for VER-457 (dev-2)
- [CLEAR] No other conflicts detected

**Adjacent work:**
- VER-458 (dev-3): Refactoring user model — may affect shared types

**Dependencies:**
- [BLOCKED] Requires VER-450 to be merged first
- [CLEAR] No blocking dependencies

**Verdict:** PASS / PASS_WITH_CONCERNS / FAIL
```

## Synthesis

After all three perspectives are complete, produce a synthesis:

```
## Review Synthesis

| Perspective | Verdict | Key Findings |
|-------------|---------|-------------|
| PM | PASS_WITH_CONCERNS | 1 requirement gap, 1 scope concern |
| Engineering | PASS | Architecture sound, 2 test gaps |
| Coordination | PASS | No active conflicts |

**Overall:** PASS_WITH_CONCERNS

**Action items:**
1. Address PM requirement gap: [specific item]
2. Add tests for: [specific codepaths]

**Recommendation:** Proceed with implementation after addressing action items.
```

## Save Review

Save the review document to shared state:

```bash
DATETIME=$(date +%Y%m%d-%H%M%S)
USER=$(whoami)
LINEAR_ID="${LINEAR_ID:-unknown}"
REVIEW_FILE="$PROJECT_DIR/reviews/${LINEAR_ID}-review-${DATETIME}.md"
echo "Saving review to: $REVIEW_FILE"
```

Write the full review document (all three perspectives + synthesis) to this file.
Add YAML frontmatter:

```yaml
---
status: active
author: {git user name}
date: {ISO date}
linear_id: {issue ID}
plan_file: {path to the plan that was reviewed}
verdict: {PASS | PASS_WITH_CONCERNS | FAIL}
---
```

## Post to Linear

If Linear MCP is available, post a summary comment on the Linear issue:

> **Hyve Review** ({verdict})
>
> PM: {verdict} — {one-line summary}
> Eng: {verdict} — {one-line summary}
> Coordination: {verdict} — {one-line summary}
>
> {N} action items. Full review: `~/.hyve/projects/{slug}/reviews/{filename}`

Use `mcp__claude_ai_Linear__save_comment` to post the comment.

If Linear MCP is unavailable, skip this step silently.

## Post to Slack (optional)

If Slack MCP is available AND the verdict is FAIL or has blocking concerns,
notify the configured Slack channel:

> *Hyve Review: {verdict}* for {Linear ID}
> {one-line summary of blocking issue}

Use `mcp__claude_ai_Slack__slack_send_message`.

If Slack MCP is unavailable or verdict is PASS, skip this step.

## AskUserQuestion Format

All questions to the user MUST use AskUserQuestion with lettered options:
- Re-ground: state the project and what we're reviewing (1 sentence)
- Options: A), B), C) with clear one-line descriptions
- Recommend: state which option and why

Example: "Reviewing plan for VER-456. The PM perspective found a requirement gap.
A) Add to action items — address before implementation
B) Mark as out of scope — PM didn't intend this
C) Skip — not important enough to block"

## Completion

Report the review result:

```
REVIEW COMPLETE
  Plan: {plan path or Linear ID}
  Verdict: {PASS | PASS_WITH_CONCERNS | FAIL}
  Action items: {N}
  Saved to: {review file path}
  Linear comment: {posted | skipped}
  Slack notification: {posted | skipped}
```

## What's Next

After the review, recommend the logical next step via AskUserQuestion:

**If verdict is PASS:**
> "Review passed. What's next?"
> A) Start implementing — dive into the code
> B) Record a decision (`/hyve:decision`) — capture any non-obvious choices from the review
> C) Hand off to someone (`/hyve:handoff`) — pass context to another dev

**If verdict is PASS_WITH_CONCERNS:**
> "Review passed with {N} action items. What's next?"
> A) Address action items, then start implementing
> B) Re-run `/hyve:review` after addressing concerns
> C) Record a decision (`/hyve:decision`) about how to handle the concerns

**If verdict is FAIL:**
> "Review failed — {key reason}. What's next?"
> A) Revise the plan and re-run `/hyve:review`
> B) Discuss with the PM — the requirement may need clarification (`/hyve:spec`)
> C) Record why this approach was rejected (`/hyve:decision`)
