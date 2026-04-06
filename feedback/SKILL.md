---
name: hyve:feedback
version: 0.3.1
description: |
  Share feedback on hyve-mind. Collects what worked well and what could be
  better, then creates a GitHub issue on the hyve repo. Can also draft from
  the current conversation context.

  Use when: you want to share feedback, report a bug, or suggest an improvement.
  Trigger: /hyve:feedback [description]
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

# /hyve:feedback — Share Feedback

Collect feedback and create a GitHub issue on the hyve repo.

**Read and follow `$HYVE_DIR/CONVENTIONS.md` for all user interactions.**

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
_VERSION=$(cat "$HYVE_DIR/VERSION" 2>/dev/null | tr -d '[:space:]' || echo "unknown")
echo "HYVE: v$_VERSION"
```

## Collect Feedback

If the user provided a description as an argument, use it as the starting point.

Otherwise, call AskUserQuestion with question "What kind of feedback?" and options:
1. Something worked well — I want to highlight it
2. Something could be better — I have a suggestion
3. Bug report — something isn't working as expected
4. Draft from conversation — capture feedback from what we just discussed
5. Type something.
6. Chat about this

### For "Draft from conversation"

Scan the conversation for:
- Moments where the user expressed frustration or confusion
- Moments where something worked surprisingly well
- Explicit feedback ("this was useful", "this didn't help", etc.)
- Skill invocations and their outcomes

Synthesize into a draft and present for review.

### For all other types

Ask ONE AT A TIME:

1. **Which skill(s)?** "Which hyve skill(s) is this about?"
   - Show a list of all skills as options
   - Include "General / multiple skills" option

2. **Details:** "Describe the feedback in a few sentences."

3. **Context (optional):** "What were you working on? (feature, bug fix, incident, planning)"

## Confidentiality Check

**CRITICAL: Before creating the GitHub issue, review the feedback content for
confidential information.** The issue will be PUBLIC on GitHub.

Check for and REDACT:
- Company names, product names, or internal project names
- Linear issue IDs (VER-123 → redact to "[ticket]")
- URLs to internal services, dashboards, or tools
- Names of team members, customers, or users
- API keys, tokens, secrets, or credentials
- Specific business logic, revenue numbers, or metrics
- Internal infrastructure details (server names, IPs, internal domains)

Replace confidential details with generic equivalents:
- "VER-354" → "[ticket ID]"
- "Jessica from support" → "[support team member]"
- "api.internal.company.com" → "[internal API endpoint]"
- "the MongoDB cluster" → "[database]"

Show the redacted version to the user and ask them to confirm before posting:

Call AskUserQuestion with question "This will be posted as a PUBLIC GitHub issue.
I've redacted what looks confidential — please review:" and options:
1. Looks good — submit it
2. I need to edit it — let me adjust
3. Cancel — don't post publicly
4. Type something.
5. Chat about this

## Create GitHub Issue

Use `gh` CLI to create an issue on the hyve repo:

```bash
# Check if gh is available and authenticated
gh auth status 2>/dev/null
```

If `gh` is available, create the issue directly:

```bash
gh issue create \
  --repo pototostudio/hyve \
  --title "{type}: {one-line summary}" \
  --label "feedback" \
  --body "{formatted body}"
```

The body should follow the feedback template format:
```markdown
## Which skill(s) did you use?

{skill names}

## What worked well?

{if positive feedback}

## What could be better?

{if improvement suggestion}

## Bug details

{if bug report — what happened vs what was expected}

## Context

{what the user was working on}

---
hyve v{version} | {role} | {project slug}
```

If `gh` is NOT available, fall back to opening the pre-filled URL:
```bash
"$HYVE_DIR/bin/hyve-feedback" open
```

## Reset Feedback Counter

After submitting, reset the session nudge counter so the user isn't asked again soon:

```bash
"$HYVE_DIR/bin/hyve-feedback" dismiss 2>/dev/null
```

## Completion

Tell the user the issue was created and show the URL:
```
FEEDBACK SUBMITTED
  Issue: {url}
  Type: {type}
  Next feedback prompt in: 10 sessions
```

Thank the user — feedback is how hyve-mind gets better.
