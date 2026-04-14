---
name: hyve:review
version: 0.2.0
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

Two modes:
- **Full review** (default): Reviews a finished plan from PM, Engineering, and
  Coordination perspectives sequentially, pausing between each.
- **Design review**: Lighter, interleaved review for mid-design discussions where
  PM and eng concerns are naturally mixed. Surfaces risks and blind spots without
  assuming a finished plan.

**Read and follow `$HYVE_DIR/CONVENTIONS.md` for all user interactions.**
All AskUserQuestion calls MUST use the AskUserQuestion tool (not plain text)
with the 5-part format.

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
mkdir -p "$STATE_DIR/projects" "$STATE_DIR/.cache"
_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
ROLE=$("$HYVE_DIR/bin/hyve-config" get role 2>/dev/null || echo "dev")
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
mkdir -p "$PROJECT_DIR"/{specs,plans,reviews,decisions,handoffs,status}
echo "BRANCH: $_BRANCH"
echo "COMMIT: $_COMMIT"
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

## Mode Selection

Detect the review mode from context:

- If the plan is a `design-session-*.md` file → **design review** mode
- If the user says "design review" or "review the design" → **design review** mode
- If the plan is still in-progress (status: active, type: design-session) → **design review**
- Otherwise → **full review** mode (default)

If unclear, call AskUserQuestion with question "What kind of review?" and options:
1. Full review — plan is finished, review from PM + Eng + Coordination
2. Design review — design is still in progress, surface risks and blind spots
3. Type something.
4. Chat about this

---

## Design Review Mode

For mid-design discussions. Instead of separate PM → Eng → Coordination passes,
interleave all perspectives in a single conversational pass:

1. **Read the design doc / plan** — understand what's being proposed
2. **Surface issues as a combined list**, each tagged with perspective:
   - `[PM]` Does this actually match what was requested?
   - `[ENG]` Is this technically sound? Edge cases?
   - `[COORD]` Does this conflict with other active work?
   - `[DESIGN]` Are there better approaches not considered?

3. **For each issue**, present it conversationally and ask:

   Call AskUserQuestion with the issue as question and options:
   1. Good catch — we should address this
   2. Already considered — here's why we're OK with it
   3. Not relevant to this design
   4. Type something.
   5. Chat about this

4. **After all issues**, summarize:
   - Decisions confirmed
   - New concerns raised
   - Open questions added to the design doc

5. **Save** a lightweight review note (appended to the design doc, not a
   separate review file) and offer next steps.

This mode does NOT produce a full review document — it enriches the design doc.

---

## Full Review Mode (default)

### Plan Resolution

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

### Staleness Check

If the plan file has a `commit:` field in its frontmatter, compare against current HEAD:

```bash
CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null)
# Read the plan's commit field
```

If commits differ, warn the user:
```
STALE PLAN: This plan was created at commit {old}. HEAD is now {current}
({N} commits ahead). The plan may not reflect the current codebase.
```

Call the AskUserQuestion tool with the staleness warning as the question and these options:
1. Continue anyway — the changes don't affect this plan
2. Re-run /hyve:pickup to refresh the plan first
3. Type something.
4. Chat about this

## Review Flow

Once a plan is identified, run three review perspectives **one at a time**.
**STOP after each perspective** to present findings and get user feedback
before proceeding to the next. This is critical — if the PM perspective
reveals a fundamental scope problem, there's no point running the Eng review
on a plan that will change.

---

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

   **NOT in scope** (intentionally deferred):
   - Bulk export — PM confirmed this is a follow-up
   - Admin UI — out of scope per ticket constraints

   **Verdict:** PASS / PASS_WITH_CONCERNS / FAIL
   ```

#### PM Review: Pause for Feedback

**STOP HERE.** Walk through the PM findings conversationally:
- State the verdict
- Highlight the most important gaps, scope concerns, or constraint violations
- Explain why each matters
- Summarize what's NOT in scope and confirm the user agrees

Call the AskUserQuestion tool with the walkthrough above as the question and these options:
1. Looks good — continue to Engineering review
2. I disagree with a finding — let me clarify
3. This changes things — need to revise the plan before continuing
4. Type something.
5. Chat about this

If the user picks 2 or 5, discuss their concern. Adjust findings if warranted.
If the user picks 3, stop the review and recommend `/hyve:pickup` to revise.

---

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
- Run a structured engineering review covering:
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

**What Already Exists** (reuse these):
- `src/lib/auth.ts` — existing auth middleware, extend rather than replace
- `src/utils/validate.ts` — validation helpers already cover email/phone
- `src/components/DataTable` — reusable table, don't build a new one

**Verdict:** PASS / PASS_WITH_CONCERNS / FAIL
```

#### Eng Review: Pause for Feedback

**STOP HERE.** Walk through the Engineering findings conversationally:
- State the verdict
- Highlight the most critical architecture concerns, test gaps, or performance risks
- Call out the "What Already Exists" items — make sure the dev knows what to reuse
- Explain why each concern matters and the risk if unaddressed

Call the AskUserQuestion tool with the walkthrough above as the question and these options:
1. Looks good — continue to Coordination review
2. I disagree with a finding — let me explain
3. These concerns are serious — need to revise the plan
4. Type something.
5. Chat about this

---

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

#### Coordination Review: Pause for Feedback

**STOP HERE.** Walk through the Coordination findings conversationally:
- State the verdict
- If conflicts found, explain specifically which files overlap and with whom
- If dependencies found, explain the blocking chain
- If clean, say so briefly

Call the AskUserQuestion tool with the walkthrough above as the question and these options:
1. All clear — proceed to synthesis
2. I know about a conflict not detected — let me add context
3. Need to coordinate with {person} before proceeding
4. Type something.
5. Chat about this

---

## Synthesis

After all three perspectives are complete and the user has confirmed each,
produce a synthesis:

```
## Review Synthesis

| Perspective | Verdict | Key Findings |
|-------------|---------|-------------|
| PM | PASS_WITH_CONCERNS | 1 requirement gap, 1 scope concern |
| Engineering | PASS | Architecture sound, 2 test gaps |
| Coordination | PASS | No active conflicts |

**Overall:** PASS_WITH_CONCERNS

**NOT in scope** (confirmed during review):
- {item} — {rationale}

**Action items:**
1. Address PM requirement gap: [specific item]
2. Add tests for: [specific codepaths]
3. Reuse existing: [specific files from "What Already Exists"]

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
commit: {git rev-parse --short HEAD}
verdict: {PASS | PASS_WITH_CONCERNS | FAIL}
pm_verdict: {verdict}
eng_verdict: {verdict}
coord_verdict: {verdict}
action_items: {N}
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

## Completion

### Step 1: Report summary

```
REVIEW COMPLETE
  Plan: {plan path or Linear ID}
  Commit: {commit hash at review time}
  Verdict: {PASS | PASS_WITH_CONCERNS | FAIL}
  Action items: {N}
  Saved to: {review file path}
  Linear comment: {posted | skipped}
  Slack notification: {posted | skipped}
```

### Step 2: Walk through findings with the user

**This step is MANDATORY. Do not skip it.**

Since we already paused after each perspective, the completion walkthrough is a
**synthesis discussion** — not a repeat of individual findings. Focus on:

- The overall verdict and what it means for implementation readiness
- The consolidated action items as a numbered list
- Any tensions between perspectives (e.g., PM wants feature X but Eng flagged perf risk)
- The "NOT in scope" list as a final confirmation

Ask if the user has questions or disagrees with any finding before offering next steps.

### Step 3: Offer next steps

After discussing findings, call the AskUserQuestion tool for next steps.

**If verdict is PASS:** call AskUserQuestion with question "Review passed. What's next?"
and these options:
1. Start implementing — dive into the code
2. Deep-dive a specific perspective — re-run just the PM or Eng review in more detail
3. Record a decision (/hyve:decision) — capture any non-obvious choices
4. Hand off to someone (/hyve:handoff) — pass context to another dev
5. Type something.
6. Chat about this

**If verdict is PASS_WITH_CONCERNS:** call AskUserQuestion with question
"Review passed with {N} concerns. What's next?" and these options:
1. Address action items, then start implementing
2. Deep-dive a specific perspective — re-run PM or Eng review with more scrutiny
3. Re-run full /hyve:review after addressing concerns
4. Record a decision (/hyve:decision) about how to handle the concerns
5. Type something.
6. Chat about this

**If verdict is FAIL:** call AskUserQuestion with question
"Review failed — {key reason}. What's next?" and these options:
1. Revise the plan and re-run /hyve:review
2. Deep-dive the failing perspective — dig into what needs to change
3. Discuss with the PM — the requirement may need clarification (/hyve:spec)
4. Record why this approach was rejected (/hyve:decision)
5. Type something.
6. Chat about this
