# hyve-mind

The collective thought for your team. A [Claude Code](https://claude.com/code) plugin where PMs and devs run skills locally, building institutional knowledge that compounds over time.

## What it does

Every feature cycle produces artifacts — specs, plans, reviews, decisions, handoffs — that accumulate in a shared mind. When a dev picks up a ticket, their Claude Code already knows the PM's reasoning, prior decisions, and what everyone else is working on.

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
| `/hyve:update` | Append findings to an existing plan/brief |
| `/hyve:incident` | Record a production incident or postmortem |
| `/hyve:upgrade` | Upgrade hyve to the latest version |

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

Each team member runs the same install. To share the collective thought:

```bash
# One person initializes the shared state repo
hyve-sync --init myapp git@github.com:your-org/hyve-state-myapp.git

# Everyone else joins
hyve-sync --init myapp git@github.com:your-org/hyve-state-myapp.git

# Enable auto-sync (pulls on session start, pushes after skill writes)
hyve-config set sync_mode git
```

### Update

Hyve checks for updates automatically. You can also update manually:

```bash
cd ~/.claude/skills/hyve && git pull && ./setup
# Or run /hyve:upgrade from within Claude Code
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

## Add to your project's CLAUDE.md

Add this to your project's `CLAUDE.md` so Claude Code knows about hyve in every session:

```markdown
## Team Collaboration (hyve-mind)

This project uses [hyve-mind](https://github.com/pototostudio/hyve) for team collaboration.

### Skills
- `/hyve:spec` — PM: decompose requirements into codebase-aware tasks
- `/hyve:pickup` — Dev: load full context before starting a ticket
- `/hyve:review` — Review a plan from PM + Eng + Coordination perspectives
- `/hyve:decision` — Record a non-obvious decision
- `/hyve:search` — Search past specs, plans, decisions
- `/hyve:status` — Generate a status report
- `/hyve:handoff` — Hand off work to a teammate

### Workflow
1. PM runs `/hyve:spec <linear-id>` to decompose a requirement
2. Dev runs `/hyve:pickup <linear-id>` to get full context
3. Dev implements, then runs `/hyve:review` before merging
4. Record important decisions with `/hyve:decision`
5. Use `/hyve:handoff` when transferring work to someone else

### Configuration
Run `hyve-config set role <dev|pm|design|lead>` to set your role.
Shared state lives at `~/.hyve/projects/`. Sync with `hyve-sync`.
```

### For agents (Claude Code headless / CI)

If you run Claude Code in headless mode (e.g., `claude -p "do something"`), hyve skills work the same way. Set the role and project via environment:

```bash
export HYVE_STATE_DIR=~/.hyve
export HYVE_PROJECT=myapp

# Agent picks up a ticket with full context
claude -p "/hyve:pickup VER-456"

# Agent runs a review
claude -p "/hyve:review"
```

For CI pipelines, mount `~/.hyve/` as a cached volume so shared state persists across runs.

## gstack interop

If [gstack](https://github.com/garrytan/gstack) is installed, `/hyve:review` uses gstack's `/plan-eng-review` for a deeper engineering perspective. This is automatic — if gstack isn't installed, hyve uses its own simpler review logic.

## Tests

```bash
bun test
```

## License

MIT
