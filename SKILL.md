---
name: hyve
version: 0.4.0
description: |
  Hyve-mind — the collective thought for your team. PMs and devs run skills locally,
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
  - /hyve:update — Append findings to an existing plan/brief
  - /hyve:incident — Record a production incident or postmortem
  - /hyve:retro — Project or sprint retrospective
  - /hyve:design — Live design session capture
  - /hyve:feedback — Share feedback via GitHub issue
  - /hyve:upgrade — Upgrade hyve to the latest version
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

# Hyve-mind — The Collective Thought

Every feature cycle adds to the team's collective intelligence. Specs, plans,
reviews, decisions — they compound over time into a shared mind.

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)" && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
mkdir -p "$STATE_DIR/projects" "$STATE_DIR/.cache"
_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
ROLE=$("$HYVE_DIR/bin/hyve-config" get role 2>/dev/null || echo "dev")
_VERSION=$(cat "$HYVE_DIR/VERSION" 2>/dev/null | tr -d '[:space:]' || echo "unknown")
echo "HYVE: v$_VERSION"
echo "BRANCH: $_BRANCH"
echo "PROJECT: $SLUG"
echo "ROLE: $ROLE"
echo "STATE: $STATE_DIR/projects/$SLUG"

# Check for updates (non-blocking, cached)
_UPD=$("$HYVE_DIR/bin/hyve-update-check" 2>/dev/null || true)
[ -n "$_UPD" ] && echo "$_UPD" || true
```

### Update Check

If the preamble output contains `UPGRADE_AVAILABLE`:
- Read `$HYVE_DIR/upgrade/SKILL.md` and follow its inline upgrade flow
  (skip preamble — you already have the context).
- After the upgrade prompt (or auto-upgrade), resume the original skill the user invoked.

If the preamble output contains `JUST_UPGRADED`:
- Tell the user: "Running hyve v{new} (just upgraded from {old})!"
- Read CHANGELOG.md and show 3-5 key changes as bullets.
- Then continue with the original skill.

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
| `/hyve:update` | 2 | Append findings to an existing plan/brief (living documents) |
| `/hyve:incident` | 3 | Record a production incident or postmortem |
| `/hyve:design` | 1 | Live design session capture |
| `/hyve:retro` | 4 | Project or sprint retrospective |
| `/hyve:feedback` | — | Share feedback via GitHub issue |
| `/hyve:upgrade` | — | Upgrade hyve to the latest version |

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

## Team Sync

Shared state syncs across team members via git. Default is local-only — sync is opt-in.

### Setup (once per project, per team member)

```bash
# First person: initialize the shared repo
hyve-sync --init myproject git@github.com:yourteam/hyve-state-myproject.git

# Everyone else: join by running the same command (clones existing state)
hyve-sync --init myproject git@github.com:yourteam/hyve-state-myproject.git

# Enable auto-sync (pull on session start, push after skill writes)
hyve-config set sync_mode git
```

### How auto-sync works

Once `sync_mode` is set to `git`:
- **Session start:** auto-pulls latest shared state from remote (non-blocking)
- **After skill writes:** auto-commits and pushes new artifacts (non-blocking)
- Files are write-once, so git conflicts are nearly impossible

### Manual sync

```bash
# Pull + push manually
hyve-sync [slug]

# Check sync status
hyve-sync --status [slug]
```

## Configuration

```bash
# Set your role (affects output perspective)
hyve-config set role dev    # dev | pm | design | lead

# Set default project
hyve-config set project myapp

# Auto-upgrade (apply updates automatically on next session)
hyve-config set auto_upgrade true   # true | false

# Disable update checks entirely
hyve-config set update_check false  # true | false

# View all config
hyve-config list
```
