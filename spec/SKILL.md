---
name: hyve:spec
version: 0.1.0
description: |
  PM: decompose a product requirement into codebase-aware implementation tasks.
  Reads a Linear issue, analyzes the codebase, and produces structured sub-tasks
  with PM intent, constraints, and acceptance criteria. Saves to shared state
  and creates Linear sub-issues.

  Use when: a PM has a product requirement that needs to be broken down for devs.
  Trigger: /hyve:spec [linear-id | freeform description]
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
  - mcp__claude_ai_Linear__get_team
  - mcp__claude_ai_Linear__list_teams
  - mcp__claude_ai_Slack__slack_send_message
---

# /hyve:spec — Decompose Requirement into Implementation Tasks

A PM runs this skill to take a product requirement and produce codebase-aware
implementation tasks that devs can pick up with full context.

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
mkdir -p "$PROJECT_DIR"/{specs,plans,reviews,decisions,handoffs,status}
_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
ROLE=$("$HYVE_DIR/bin/hyve-config" get role 2>/dev/null || echo "dev")
HAS_REPO=$([ -d .git ] || git rev-parse --git-dir >/dev/null 2>&1 && echo "true" || echo "false")
echo "BRANCH: $_BRANCH"
echo "PROJECT: $SLUG"
echo "ROLE: $ROLE"
echo "HAS_LOCAL_REPO: $HAS_REPO"
echo "STATE: $PROJECT_DIR"
```

## Input Resolution

Determine the requirement source:

1. **If argument is a Linear issue ID** (matches pattern like `VER-123`, `PROJ-456`):
   - Fetch the issue via `mcp__claude_ai_Linear__get_issue`
   - Read: title, description, comments, linked issues, parent issue, labels, priority
   - If Linear MCP is unavailable, ask the user to paste the requirement text

2. **If argument is a file path:** Read the file as the requirement.

3. **If argument is freeform text:** Use it directly as the requirement.

4. **If no argument:** Use AskUserQuestion to ask:
   > "What requirement do you want to decompose? Paste the text, a Linear issue ID (e.g., VER-123), or a file path."

## Codebase Analysis

**If local repo is available** (`HAS_LOCAL_REPO=true`):

1. **Map the codebase architecture:**
   - Read key files: README, CLAUDE.md, package.json/Cargo.toml/go.mod (for project structure)
   - Use Glob to identify major directories and patterns
   - Use Grep to find code related to the requirement keywords

2. **Identify affected areas:**
   - Which files/modules will likely need changes?
   - What existing patterns should be followed?
   - What tests exist in those areas?
   - Are there related features that could be affected?

3. **Build an affected-files list** for each task (used by conflict detection later).

**If no local repo** (headless mode):
- Skip codebase analysis
- Use shared state artifacts from devs (prior plans, reviews, decisions) for context
- Warn: "No local repo detected — spec based on Linear context and shared state only. A dev can enrich it with `/hyve:pickup`."

## Decomposition

Break the requirement into implementation tasks. For each task:

```markdown
### Task {N}: {title}

**Linear parent:** {issue ID}
**Priority:** P{1-3}
**Effort:** S / M / L

#### PM Intent
{Why this task matters. What success looks like from the PM's perspective.}

#### Constraints
{What must NOT change. Performance requirements. Compatibility requirements.}

#### Acceptance Criteria
- [ ] {Specific, testable criterion}
- [ ] {Another criterion}

#### Affected Files
- `src/path/..le.ts` — {what changes and why}
- `src/path/..her.ts` — {what changes and why}

#### Implementation Notes
{Patterns to follow. Existing code to reference. Edge cases to handle.}
```

**Decomposition rules:**
- Each task should be independently implementable (no implicit ordering unless stated)
- Each task should be completable in 1-2 hours by a dev with Claude Code
- Include "Affected Files" section with specific file paths (enables conflict detection)
- Constraints section is mandatory — what the PM explicitly does NOT want changed
- If a task has dependencies on other tasks, state them explicitly

## gstack Interop

If gstack is installed and the requirement is vague or exploratory:

```bash
ls "$HOME/.claude/skills/gstack/office-hours/SKILL.md" 2>/dev/null && echo "GSTACK_OH=true" || echo "GSTACK_OH=false"
```

If `GSTACK_OH=true` and the requirement lacks specificity, offer via AskUserQuestion:
> "This requirement is broad. Want to run a brainstorming session first to sharpen it?"
> A) Yes — run brainstorming inline
> B) No — decompose as-is

If A: Read gstack's `/office-hours/SKILL.md` and follow the Builder mode flow inline
(skip preamble, telemetry, AskUserQuestion format sections). Use the resulting design
doc as the input for decomposition.

## Save Spec

```bash
DATETIME=$(date +%Y%m%d-%H%M%S)
USER=$(whoami)
LINEAR_ID="${LINEAR_ID:-unknown}"
```

Write to `$PROJECT_DIR/specs/${LINEAR_ID}-spec-${DATETIME}.md`:

```yaml
---
status: active
author: {user}
date: {ISO date}
linear_id: {issue ID}
task_count: {N}
---
```

Followed by the full decomposition.

**Version check:** Before writing, check if a prior spec exists for this Linear ID:
```bash
ls "$PROJECT_DIR"/specs/${LINEAR_ID}-spec-*.md 2>/dev/null | head -1
```
If a prior version exists, mark it as `superseded` (edit its frontmatter status field)
before writing the new version.

## Create Linear Sub-Issues

If Linear MCP is available, create a sub-issue for each task:
- Use `mcp__claude_ai_Linear__save_issue` for each task
- Set parent to the original issue
- Include: title, description (PM intent + constraints + acceptance criteria), labels
- Add a comment on the parent issue linking to the sub-issues

If Linear MCP is unavailable, skip sub-issue creation and note in the output.

## Post to Slack (optional)

If Slack MCP is available, post a summary to the configured channel:
> *Hyve Spec: {requirement title}*
> Decomposed into {N} tasks for {Linear ID}
> Full spec: `~/.hyve/projects/{slug}/specs/{filename}`

## AskUserQuestion Format

All questions to the user MUST use AskUserQuestion with lettered options:
- Re-ground: state the requirement being decomposed (1 sentence)
- Options: A), B), C) with clear one-line descriptions
- Recommend: state which option and why

## Completion

```
SPEC COMPLETE
  Requirement: {title}
  Linear: {issue ID}
  Tasks: {N}
  Saved to: {spec file path}
  Sub-issues created: {N} / skipped (no Linear)
  Slack: posted / skipped
```

## What's Next

After the spec is complete, recommend via AskUserQuestion:

> "Spec decomposed into {N} tasks. What's next?"
> A) A dev should run `/hyve:pickup` on one of the sub-tasks to start implementing
> B) Run `/hyve:review` on the spec to get eng + coordination feedback before devs start
> C) Record a key decision from this decomposition (`/hyve:decision`)
> D) Done for now — devs will pick up tasks from Linear
