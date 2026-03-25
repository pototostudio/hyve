---
name: hyve
version: 0.1.0
description: |
  Hyve — shared team memory for Claude Code. PMs and devs run skills locally,
  building institutional knowledge that compounds over time. Skills produce structured
  artifacts (specs, plans, reviews, decisions) that accumulate in a shared state
  directory. Linear MCP for requirements, Slack MCP for notifications (optional).

  Available skills:
  - /hyve:review — Multi-stakeholder plan review (PM + Eng + Coordination)
  - /hyve:spec — PM: decompose requirement into codebase-aware tasks
  - /hyve:pickup — Dev: load full context for a ticket with conflict detection
  - /hyve:decision — Record a non-obvious decision for institutional memory
  - /hyve:search — Search across all shared state artifacts
  - /hyve:status — Cross-role status update (PM vs dev perspective)
  - /hyve:handoff — Structured role-to-role context handoff
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

# Hyve — Shared Team Memory

Hyve creates institutional knowledge that compounds over time. Every feature cycle
adds to the team's collective intelligence.

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)" && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
mkdir -p "$STATE_DIR/projects" "$STATE_DIR/.cache"
_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
ROLE=$("$HYVE_DIR/bin/hyve-config" get role 2>/dev/null || echo "dev")
echo "BRANCH: $_BRANCH"
echo "PROJECT: $SLUG"
echo "ROLE: $ROLE"
echo "STATE: $STATE_DIR/projects/$SLUG"
```

## Available Skills

| Skill | Phase | Description |
|-------|-------|-------------|
| `/hyve:review` | 1 | Multi-stakeholder plan review (PM + Eng + Coordination perspectives) |
| `/hyve:spec` | 2 | PM: decompose requirement into codebase-aware tasks |
| `/hyve:pickup` | 2 | Dev: load full context for a Linear ticket |
| `/hyve:decision` | 2 | Record a non-obvious decision with structured context |
| `/hyve:search` | 3 | Search all shared state by keyword, tag, or Linear ID |
| `/hyve:status` | 3 | Role-aware status report (PM gets product view, dev gets technical) |
| `/hyve:handoff` | 3 | Comprehensive handoff document when transferring work |

## Shared State

All skills read from and write to `~/.hyve/projects/<project-slug>/`:

```
specs/       — PM-authored spec decompositions
plans/       — Dev-authored implementation plans
reviews/     — Multi-stakeholder review artifacts
decisions/   — Structured decision records (institutional memory)
handoffs/    — Role-to-role handoff documents
status/      — Latest status per feature
```

Files are **write-once with versioning** — if a spec needs revision, create `-v2.md`.
The prior version is auto-marked as `superseded` in its frontmatter.

Each file has YAML frontmatter with `status: active | superseded | archived`.

## Sync

Shared state can be synced across team members via git:

```bash
# Initialize sync for a project
hyve-sync --init <slug> <remote-url>

# Sync (pull + push)
hyve-sync [slug]

# Check sync status
hyve-sync --status [slug]
```

Default is local-only. Sync is opt-in.

## Configuration

```bash
# Set your role (affects output perspective)
hyve-config set role dev    # dev | pm | design | lead

# Set default project
hyve-config set project myapp

# View all config
hyve-config list
```
