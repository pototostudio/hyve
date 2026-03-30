---
name: hyve:incident
version: 0.3.0
description: |
  Record a production incident or postmortem. Captures the investigation journey:
  timeline, impact, false leads, root cause, fix, and action items. Designed to
  be run after (or during) an incident investigation.

  Use when: you just investigated/fixed a production issue and want to capture
  what happened, or you're mid-incident and want to document as you go.
  Trigger: /hyve:incident [linear-id | description] [--project <slug>]
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - AskUserQuestion
  - mcp__claude_ai_Linear__get_issue
  - mcp__claude_ai_Linear__list_issues
  - mcp__claude_ai_Linear__save_comment
  - mcp__claude_ai_Linear__list_comments
  - mcp__claude_ai_Slack__slack_send_message
---

# /hyve:incident — Incident Record & Postmortem

Capture the full investigation journey for a production incident. Unlike
`/hyve:decision` which records *what* was decided, this captures *how you got
there* — the timeline, the false leads, the queries you ran, and what you learned.

**Read and follow `$HYVE_DIR/CONVENTIONS.md` for all user interactions.**

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
mkdir -p "$PROJECT_DIR"/incidents
_BRANCH=$(git rev-parse --is-inside-work-tree 2>/dev/null && git branch --show-current 2>/dev/null || echo "unknown")
echo "BRANCH: $_BRANCH"
echo "PROJECT: $SLUG"
echo "STATE: $PROJECT_DIR"
```

## Choose Mode

Call AskUserQuestion with question "What stage is this incident?" and options:
1. Just resolved — I want to write the postmortem now
2. Mid-incident — I want to document as I investigate
3. Draft from conversation — I just finished investigating, draft from our session
4. Type something.
5. Chat about this

### "Draft from conversation" mode

If the conversation has rich context from an investigation (Loki queries, deploy
checks, root cause analysis), synthesize the incident record from what was
discussed. Present the draft for review before saving.

### "Mid-incident" mode

Create a lightweight incident file immediately with what's known:
- Symptom, reporter, affected users, severity
- Mark status as `investigating`
- Tell the user to run `/hyve:update` to append findings as they go
- When resolved, run `/hyve:incident` again to complete the postmortem

### "Just resolved" mode

Proceed to the full Gather flow below.

## Gather Incident Details

Ask follow-up questions ONE AT A TIME. For each, check if the answer is already
available from conversation context or the linked Linear ticket before asking.

### 1. The Incident

- **What happened?** One-sentence summary of the symptom.
- **Who reported it?** (support ticket, monitoring alert, user complaint, engineer noticed)
- **Severity:** Call AskUserQuestion with options:
  1. SEV1 — service down, all users affected
  2. SEV2 — major feature broken, significant user impact
  3. SEV3 — degraded experience, workaround available
  4. SEV4 — minor issue, few users affected
  5. Type something.
  6. Chat about this

### 2. Impact

- **Which users/services were affected?**
- **How many users?** (exact count if known, estimate if not)
- **Duration:** How long were users affected? (from first symptom to fix deployed)

### 3. Timeline

Build a chronological timeline. Cross-reference with:

```bash
# Recent deploys in the incident window
git log --oneline --since="14 days ago" --merges 2>/dev/null | head -10
# Recent tags
git tag --sort=-creatordate 2>/dev/null | head -5
```

If Linear MCP is available, check for:
- Other issues filed around the same time
- Recently resolved issues that could have caused a regression

Ask the user to fill in key timestamps:
- When was the last known good state?
- When was the first report?
- When was the root cause identified?
- When was the fix deployed?

### 4. Investigation Journey

**This is the most valuable section — capture the thinking process.**

- **What did you check first?** (and what did it show?)
- **What false leads did you follow?** (and why they seemed plausible)
- **What was the breakthrough?** (what evidence pointed to the root cause?)
- **What queries/commands did you run?** (Loki queries, kubectl commands, SQL, etc.)

For each investigation step, capture:
- What you looked at
- What you expected to see
- What you actually saw
- What conclusion you drew

### 5. Root Cause

- **What was the actual root cause?** (specific, technical)
- **Why did it happen?** (the deeper why — not just "config was wrong" but "we didn't have validation for this config field")
- **Was this preventable?** How?

### 6. Fix

- **What was the fix?** (PR link, commit, config change)
- **Was it a hotfix or a proper fix?**
- **Is there follow-up work needed?** (tech debt, hardening)

### 7. Action Items

- What should change to prevent this class of incident?
- Are there monitoring gaps? Missing alerts?
- Are there related systems that might have the same issue?

## Write Incident Record

```bash
DATETIME=$(date +%Y%m%d-%H%M%S)
USER=$(whoami)
LINEAR_ID="${LINEAR_ID:-unknown}"
```

Write to `$PROJECT_DIR/incidents/${LINEAR_ID}-incident-${DATETIME}.md`:

```markdown
---
status: active
type: incident
severity: {SEV1-4}
author: {git user name}
date: {ISO date}
linear_id: {issue ID or "none"}
duration: {time from first symptom to fix deployed}
root_cause: {one-line summary}
---

# Incident: {title}

**Severity:** {SEV1-4} | **Duration:** {X hours}
**Reported by:** {who} | **Date:** {date}
**Linear:** [{issue ID}](https://linear.app/issue/{issue ID})

## Summary
{2-3 sentence summary: what broke, who was affected, how it was fixed}

## Impact
- **Users affected:** {count or estimate}
- **Services affected:** {list}
- **Duration:** {first symptom} to {fix deployed}

## Timeline
| Time | Event |
|------|-------|
| {time} | Last known good state |
| {time} | {deploy/change that may have caused it} |
| {time} | First user report |
| {time} | Investigation started |
| {time} | Root cause identified |
| {time} | Fix deployed |
| {time} | Confirmed resolved |

## Investigation Journey

### What we checked (in order)
1. **{First thing checked}** — Expected: {X}. Actual: {Y}. Conclusion: {Z}.
2. **{Second thing checked}** — Expected: {X}. Actual: {Y}. Conclusion: {Z}.

### False leads
- **{False lead}** — Why it seemed plausible: {reason}. Why it wasn't: {reason}.

### Breakthrough
{What evidence pointed to the root cause}

### Useful queries/commands
```
{Loki query, kubectl command, SQL query, etc.}
```

## Root Cause
{Specific technical root cause}

**Why it happened:** {deeper systemic reason}
**Was it preventable?** {yes/no and how}

## Fix
- **What:** {description of the fix}
- **PR/Commit:** {link}
- **Type:** {hotfix | proper fix}
- **Follow-up needed:** {yes/no — what}

## Action Items
- [ ] {Preventive measure}
- [ ] {Monitoring/alerting improvement}
- [ ] {Related systems to check}

## Decisions Made During Incident
{Reference any /hyve:decision records created during this investigation.
If none, note key decisions made and suggest running /hyve:decision for the
most important ones.}
```

## Auto-sync

After saving, push to shared state:
```bash
"$HYVE_DIR/bin/hyve-push" "$SLUG" 2>/dev/null &
```

## Post to Linear (optional)

If a Linear ID was provided and Linear MCP is available:

1. Check for existing hyve incident comments (avoid duplicates)
2. If none, post:
   > **Hyve Incident Record** (SEV{N})
   > Root cause: {one-line}
   > Duration: {X hours}
   > Action items: {N}
   > Full record: `~/.hyve/projects/{slug}/incidents/{filename}`

## Completion

### Step 1: Report summary

```
INCIDENT RECORDED
  Title: {title}
  Severity: {SEV1-4}
  Root cause: {one-line}
  Duration: {X hours}
  Action items: {N}
  Saved to: {file path}
  Linear comment: posted / skipped
```

### Step 2: Walk through the record with the user

**This step is MANDATORY. Do not skip it.**

Walk through the incident record conversationally:
- **Root cause:** Explain what happened and why
- **Key false lead:** What the investigation got wrong first (this is the most
  valuable learning for the team)
- **Action items:** Walk through each and confirm they're right
- **Related decisions:** Suggest running `/hyve:decision` for any architectural
  choices made during the incident that should be formalized

### Step 3: Offer next steps

Call AskUserQuestion with question "Incident recorded. What's next?" and options:
1. Record a decision made during this incident (/hyve:decision)
2. Hand off follow-up work to someone (/hyve:handoff)
3. Check for related incidents (/hyve:search)
4. Done — the incident is documented
5. Type something.
6. Chat about this
