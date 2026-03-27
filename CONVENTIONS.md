# Hyve Conventions

Shared standards for all hyve skills. Every SKILL.md MUST follow these conventions.

## AskUserQuestion Format

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
