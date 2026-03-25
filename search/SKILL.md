---
name: hyve:search
version: 0.1.0
description: |
  Search across all shared state artifacts — specs, plans, reviews, decisions,
  handoffs. Find past decisions by topic, locate related specs, or discover
  what the team has written about a particular area of the codebase.

  Use when: you want to know "why did we do it this way?" or "has anyone
  written about X?"
  Trigger: /hyve:search <query>
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - AskUserQuestion
---

# /hyve:search — Search Shared State

Search the team's institutional memory. Finds specs, plans, decisions, reviews,
and handoffs by keyword, Linear ID, tag, or topic.

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
eval "$("$HYVE_DIR/bin/hyve-slug" 2>/dev/null)" || SLUG="unknown"
PROJECT_DIR="$STATE_DIR/projects/$SLUG"
echo "PROJECT: $SLUG"
echo "STATE: $PROJECT_DIR"

# Quick stats
for dir in specs plans reviews decisions handoffs status; do
  COUNT=$(find "$PROJECT_DIR/$dir" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
  echo "  $dir: $COUNT files"
done
```

## Input

If the user provided a query as an argument, use it. Otherwise ask:
> "What are you looking for? Enter a keyword, Linear ID, tag, or topic."

## Search

### Step 1: Grep across shared state

Search ALL `.md` files in `$PROJECT_DIR/` for the query terms:

```bash
QUERY="${QUERY}"
grep -ril "$QUERY" "$PROJECT_DIR"/ 2>/dev/null | head -20
```

Use the Grep tool for richer results with context lines. Search with:
- The exact query string
- Individual words from the query (for multi-word queries)

### Step 2: Filter by status

By default, only show results from files with `status: active` in frontmatter.
If the user passed `--all` or asked for "all results including archived," include
`superseded` and `archived` files too.

To check status, read the first 10 lines of each matching file and look for
`status:` in the YAML frontmatter.

### Step 3: Group and rank results

Group results by artifact type:

```
## Search Results: "{query}"

### Decisions (3 matches)
1. **Decision: Use JWT for session tokens** (2026-03-15)
   Tags: auth, session, security
   > "...chose JWT over opaque tokens because the API gateway needs to validate
   > without a round-trip to the auth service..."
   File: decisions/20260315-jwt-session-tokens.md

2. **Decision: Postgres over MongoDB** (2026-03-10)
   Tags: database, infrastructure
   > "...relational model fits our query patterns better..."
   File: decisions/20260310-postgres-over-mongo.md

### Specs (1 match)
1. **Spec: Auth System Redesign** (VER-234, 2026-03-12)
   > "...session handling must support both cookie-based and token-based auth..."
   File: specs/VER-234-spec-20260312.md

### Plans (1 match)
1. **Plan: VER-234 Auth Implementation** (dev-1, 2026-03-14)
   > "...affected files: src/auth/session.ts, src/middleware/auth.ts..."
   File: plans/VER-234-main-plan-20260314.md

### Reviews (0 matches)
### Handoffs (0 matches)

---
5 results found across 2 artifact types.
```

**Ranking within each group:** Most recent first (by file modification time).

**Snippets:** Show 3-5 lines of context around each match, with the query term
highlighted in the output.

### Step 4: Offer follow-up

After showing results, offer:
> "Want to read any of these in full? Enter a number (e.g., '1') or 'done' to finish."

If the user picks a result, read the full file and display it.

## Empty Results

If no results found:
```
No results for "{query}" in shared state.

Tips:
- Try broader keywords
- Use /hyve:decision to record decisions so they're searchable later
- Use --all to include superseded/archived files
- Shared state for this project has {N} total files
```

## AskUserQuestion Format

All questions to the user MUST use AskUserQuestion with lettered options.

## Completion

```
SEARCH COMPLETE
  Query: "{query}"
  Results: {N} across {M} artifact types
  Filtered: active only (pass --all for all)
```

## What's Next

After search results are shown, recommend via AskUserQuestion:

> "Search complete. What's next?"
> A) Search again with different keywords (`/hyve:search`)
> B) Record a new decision (`/hyve:decision`) — capture something not yet documented
> C) Pick up a ticket related to these results (`/hyve:pickup`)
> D) Done — I found what I needed
