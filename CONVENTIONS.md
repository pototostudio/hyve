# Hyve Conventions

Shared standards for all hyve skills. Every SKILL.md MUST follow these conventions.

## Project Override

All skills MUST support `--project <slug>` to override the auto-detected project.
This is critical for cross-repo work (e.g., a decision that spans 3 repos).

Before running the preamble bash block, check if the user's arguments contain
`--project <slug>`. If found, set `HYVE_PROJECT` env var before running preamble:

```bash
export HYVE_PROJECT="<slug>"
```

The `hyve-slug` script already respects `HYVE_PROJECT` as its highest-priority
resolution. This means the preamble and all subsequent commands will use the
overridden project.

## Linear Issue References

When displaying a Linear issue ID (e.g., VER-123), ALWAYS render it as a
clickable markdown link so the user can open it in their browser:

```
[VER-123](https://linear.app/issue/VER-123)
```

NEVER output a bare issue ID like `VER-123` without the link. This applies to:
- Completion summaries
- Brief headers
- Linear comments
- Anywhere an issue ID appears in output

## AskUserQuestion Format

**HARD RULE: Every question with options MUST use the AskUserQuestion tool.**
If you write options as text (A/B/C, numbered lists, or blockquotes) instead
of calling the tool, you are BREAKING the UX. The user must see the interactive
selection UI (arrow keys, Enter to select), not text they have to type a response to.

**Before presenting options, always ask yourself: "Am I calling the AskUserQuestion
tool, or am I about to write options as plain text?" If the latter, STOP and use
the tool instead.**

Every question to the user MUST use AskUserQuestion with this 5-part structure.
NEVER batch multiple independent decisions into one question. Rapid succession
of focused questions is better than one multi-part question.

### 1. Re-ground

State the project, branch, and what you're doing in 1-2 sentences.
**Assume the user hasn't looked at this window in 20 minutes and doesn't have
code open.** If you'd need to read source to understand your own explanation,
it's too complex.

### 2. Simplify

Explain in plain English a smart 16-year-old could follow. No jargon,
no implementation details. If you must use a technical term, define it inline.

### 3. Recommend

Always state your recommendation and why in one line. Include a completeness
score (0-10) for each option when the options represent different levels of
thoroughness:

- **10** = complete, all edge cases, production-ready
- **7** = happy path covered, known gaps documented
- **3** = shortcut, significant gaps, tech debt

### 4. Options — MUST call the AskUserQuestion tool

**CRITICAL: You MUST call the `AskUserQuestion` tool to present options.**
NEVER write options as plain text, blockquotes, or lettered lists in your response.
The user must see the interactive selection UI (arrow keys, Enter to select),
not a text list they have to type a response to.

**WRONG — options printed as text (user has to type):**
```
Review passed with 3 minor concerns. What's next?
A) Start implementing — dive into the code
B) Deep-dive a specific perspective
C) Re-run /hyve:review after addressing concerns
```

**RIGHT — options passed to AskUserQuestion tool (user gets selection UI):**
Call the AskUserQuestion tool with:
- `question`: the re-ground + simplify + recommend text
- `options`: each choice as a separate selectable item

**Every question MUST include these special options at the end:**
1. **"Type something."** — a freeform input option so the user can write anything
2. **"Chat about this"** — separated by a blank line from the main options,
   this is the escape hatch for discussing before deciding

One sentence max per option. When relevant, show effort estimates:
- `human: 2 days / CC: 15 min` — helps users understand the cost delta

### 5. One decision per question

NEVER combine independent decisions. Ask them separately in quick succession.

### Example

Call the AskUserQuestion tool with:

**question:**
```
Reviewing the auth plan for VER-456 on branch feat/auth-redesign.
We're in the PM perspective, checking requirement coverage.

The ticket asks for both password login and Google login, but the plan
only covers password login. Google login isn't mentioned anywhere.

Recommend: A — add it now. It's a core requirement and costs ~15 min with CC.
```

**options (each is a selectable item in the UI):**
1. Add Google login to the plan (Completeness: 9/10)
2. Defer to a follow-up ticket (Completeness: 6/10)
3. Skip — PM didn't mean it literally (Completeness: 4/10)
4. Type something.
5. Chat about this

## Section-by-Section Review Flow

Skills that produce multi-section output (reviews, specs, status) MUST:

1. **Complete one section at a time**
2. **Present findings to the user** — walk through key findings conversationally
3. **Pause for feedback** via AskUserQuestion before moving to the next section
4. **Incorporate feedback** — if the user disagrees or adds context, adjust

This prevents wasted work. If the PM perspective reveals a fundamental scope
problem, there's no point running the Eng perspective on a plan that will change.

### Pause format

After presenting a section's findings, call the AskUserQuestion tool:

**question:**
```
{section} review complete for {ticket}. {N} findings.

Key findings:
- {finding 1 — why it matters}
- {finding 2 — why it matters}
```

**options:**
1. Looks good — continue to {next section}
2. I disagree with a finding — let me explain
3. This changes things — let's revise before continuing
4. Type something.
5. Chat about this

## Completion Walkthrough

Skills that produce analysis output MUST walk through results conversationally
before offering next steps. Don't just save a file and print a terse summary.

For each section of findings:
- State the verdict
- Highlight the most important findings
- Explain *why* each matters and the risk if unaddressed
- Call out anything surprising or non-obvious

Then summarize action items as a numbered list and ask if the user has questions.

## Staleness Detection

Any artifact that reflects codebase state MUST record the commit hash at creation:

```yaml
---
commit: abc1234  # git rev-parse --short HEAD
---
```

When loading an artifact, check for drift:
```bash
CURRENT=$(git rev-parse --short HEAD 2>/dev/null)
# Compare against artifact's commit field
```

If the commit has changed, warn:
```
⚠ STALE: This {artifact type} was created at commit {old}. HEAD is now {current}
({N} commits ahead). Findings may no longer apply.
```

## "NOT in scope" Section

Review and spec skills MUST include an explicit "NOT in scope" section listing
items that were considered but intentionally deferred, with a one-line rationale
for each:

```markdown
## NOT in scope
- Bulk export — deferred to follow-up ticket (PM confirmed)
- Email notifications — out of scope per ticket constraints
- Migration of existing data — separate initiative (VER-789)
```

This prevents scope creep and documents intentional omissions.

## "What Already Exists" Section

Review and spec skills that analyze the codebase MUST include a section listing
existing code, patterns, and utilities that should be reused:

```markdown
## What Already Exists
- `src/lib/auth.ts` — existing auth middleware, extend rather than replace
- `src/utils/validate.ts` — validation helpers already cover email/phone formats
- `src/components/DataTable` — reusable table component, don't build a new one
```

This prevents unnecessary duplication and guides devs toward established patterns.

## Auto-Sync After Writes

After writing any artifact to shared state (specs, plans, reviews, decisions,
handoffs, status), skills MUST run the push script:

```bash
"$HYVE_DIR/bin/hyve-push" "$SLUG" 2>/dev/null &
```

This commits and pushes the new artifact to the team's shared repo. It's
non-blocking and silent on failure (no-op if sync_mode is `local`).

## Context Discovery

When a skill starts work on a ticket, it MUST check shared state for related
artifacts before proceeding. This ensures the team's institutional memory is
used, not ignored.

### On skill start (after preamble):

1. **Search shared state** for the Linear ID, branch name, or ticket keywords:
   ```bash
   grep -ril "$LINEAR_ID" "$PROJECT_DIR"/ 2>/dev/null | head -20
   ```

2. **If related docs found:** surface them to the user conversationally:
   > "Found existing context for this ticket:"
   > - Spec by {author} ({date}) — `specs/VER-123-spec-20260320.md`
   > - Decision: chose JWT over opaque tokens — `decisions/20260315-jwt.md`
   > - Prior review with 2 open action items — `reviews/VER-123-review-20260318.md`
   >
   > "Want me to load any of these before we start?"

3. **If no related docs found:** tell the user and offer to create:
   > "No existing hyve docs for {ticket}. This is the first time someone's
   > working on it."

   Then use AskUserQuestion with question "Want to create context for this ticket?"
   and these options:
   1. Yes — run /hyve:spec to decompose it first
   2. Yes — run /hyve:pickup to create a plan
   3. No — just proceed, I'll document later
   4. Type something.
   5. Chat about this

### Linking to Linear

When a skill creates a new artifact (spec, plan, review, decision, incident),
it should check if a Linear issue ID is associated. If yes:
- Check for existing hyve comments first (avoid duplicates)
- Post a comment on the Linear issue linking to the artifact
- Include the artifact type, one-line summary, and local path
- This creates a trail from Linear → hyve shared state

## Proactive Documentation Prompts

At the end of significant work sessions, skills SHOULD suggest documentation
if none has been created. A session is "significant" if it involved:
- Investigating and fixing a production bug → suggest `/hyve:incident`
- Making a non-obvious architectural choice → suggest `/hyve:decision`
- Finishing implementation of a ticket → suggest `/hyve:handoff` or `/hyve:review`
- Changing plans mid-work → suggest `/hyve:update`

Include this as the LAST option in any "What's next?" question:
- "Record what happened this session" — with the appropriate skill suggestion

The session-start hook also checks for recent unrecorded work and surfaces it
in the briefing.
