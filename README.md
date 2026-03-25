# hyve

Shared team memory for [Claude Code](https://claude.com/code). PMs and devs run skills locally, building institutional knowledge that compounds over time.

## What it does

Every feature cycle produces artifacts — specs, plans, reviews, decisions, handoffs — that accumulate in a shared state directory. When a dev picks up a ticket, their Claude Code already knows the PM's reasoning, prior decisions, and what everyone else is working on.

## Skills

| Skill | What it does |
|-------|-------------|
| `/hyve:review` | Multi-stakeholder plan review (PM + Eng + Coordination perspectives) |
| `/hyve:spec` | PM: decompose a requirement into codebase-aware implementation tasks |
| `/hyve:pickup` | Dev: load full context for a ticket with conflict detection |
| `/hyve:decision` | Record a non-obvious decision for institutional memory |
| `/hyve:search` | Search across all shared state artifacts |
| `/hyve:status` | Cross-role status update (PM vs dev perspective) |
| `/hyve:handoff` | Structured context handoff when transferring work |

## Install

### Quick install

```bash
git clone git@github.com:pototostudio/hyve.git ~/.claude/skills/hyve
cd ~/.claude/skills/hyve && ./setup
```

### What setup does

1. Creates `~/.hyve/` state directory
2. Checks for Linear MCP — guides you through adding it to `~/.claude/.mcp.json` if missing
3. Symlinks each skill into `~/.claude/skills/` so they appear when you type `/` in Claude Code

### After install

Start a new Claude Code session (or type `/clear`). You should see all 7 skills when typing `/hyve`.

### For your team

Each team member runs the same install. To share state across the team:

```bash
# One person initializes the shared state repo
hyve-sync --init myapp git@github.com:your-org/hyve-state-myapp.git

# Everyone else clones it
hyve-sync --init myapp git@github.com:your-org/hyve-state-myapp.git

# Sync anytime
hyve-sync
```

### Update

```bash
cd ~/.claude/skills/hyve && git pull && ./setup
```

## Requirements

- [Claude Code](https://claude.com/code)
- [Bun](https://bun.sh) (for tests only — not needed to use skills)
- [Linear MCP](https://mcp.linear.app) (required for full functionality, setup guides you)
- Slack MCP (optional — for notifications)

## Configuration

```bash
# Set your role (affects output perspective)
hyve-config set role dev    # dev | pm | design | lead

# Set default project
hyve-config set project myapp

# Suppress session-start briefing
hyve-config set quiet true

# View all config
hyve-config list
```

## Shared state

All artifacts are written to `~/.hyve/projects/<project-slug>/`:

```
specs/       PM-authored spec decompositions
plans/       Dev-authored implementation plans
reviews/     Multi-stakeholder review artifacts
decisions/   Structured decision records
handoffs/    Role-to-role handoff documents
status/      Latest status per feature
```

Files are write-once with versioning. Each file has YAML frontmatter with `status: active | superseded | archived`.

### Sync across team

Shared state can optionally sync via git:

```bash
# Initialize sync for a project
hyve-sync --init myapp git@github.com:team/hyve-state-myapp.git

# Sync (pull + push)
hyve-sync

# Check status
hyve-sync --status
```

## Workflow

```
PM writes requirement in Linear
        |
        v
  /hyve:spec -----> creates sub-tasks in Linear + spec in shared state
        |
        v
  /hyve:pickup ---> dev gets full context + conflict detection
        |
        v
     implement
        |
        v
  /hyve:review ---> PM + Eng + Coordination perspectives
        |
        v
  /hyve:decision -> capture non-obvious choices
        |
        v
  /hyve:handoff --> transfer to another dev or back to PM
```

At any point: `/hyve:search` to find past decisions, `/hyve:status` for a status report.

## gstack interop

If [gstack](https://github.com/garrytan/gstack) is installed, `/hyve:review` uses gstack's `/plan-eng-review` for a deeper engineering perspective. This is automatic — if gstack isn't installed, hyve uses its own simpler review logic.

## Tests

```bash
bun test
```

## License

MIT
