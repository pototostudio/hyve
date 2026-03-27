---
name: hyve:upgrade
version: 0.2.0
description: |
  Upgrade hyve to the latest version. Detects global vs vendored install,
  runs the upgrade, and shows what's new.

  Use when: user asks to upgrade hyve, or when preamble detects a new version.
  Trigger: /hyve:upgrade
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

# /hyve:upgrade — Upgrade Hyve

Upgrade hyve to the latest version. Can be triggered manually or automatically
when the preamble detects a new version is available.

**Follow `CONVENTIONS.md` for all user interactions.**

## Preamble

```bash
HYVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}" 2>/dev/null)/.." && pwd 2>/dev/null)" || HYVE_DIR="${CLAUDE_SKILL_DIR:-}"
[ -z "$HYVE_DIR" ] && HYVE_DIR="$HOME/.claude/skills/hyve"
STATE_DIR="${HYVE_STATE_DIR:-$HOME/.hyve}"
LOCAL_VERSION=$(cat "$HYVE_DIR/VERSION" 2>/dev/null | tr -d '[:space:]' || echo "unknown")
echo "HYVE_DIR: $HYVE_DIR"
echo "CURRENT_VERSION: $LOCAL_VERSION"

# Force check for latest version
_UPD=$(HYVE_UPDATE_FORCE=1 "$HYVE_DIR/bin/hyve-update-check" 2>/dev/null || true)
echo "UPDATE_STATUS: ${_UPD:-UP_TO_DATE}"
```

## Upgrade Flow

### Step 1: Check for updates

Parse the preamble output. If `UPDATE_STATUS` is `UP_TO_DATE`:
- Tell the user: "You're on the latest version ({version})."
- Exit.

If `UPDATE_STATUS` is `UPGRADE_AVAILABLE <old> <new>`:
- Continue to Step 2.

### Step 2: Ask user (or auto-upgrade)

Check if auto-upgrade is enabled:
```bash
AUTO=$("$HYVE_DIR/bin/hyve-config" get auto_upgrade 2>/dev/null || echo "false")
echo "AUTO_UPGRADE: $AUTO"
```

**If auto-upgrade is enabled:** skip the question, proceed to Step 3.

**If auto-upgrade is NOT enabled:** call the AskUserQuestion tool with question
"Hyve {new} is available (you have {old}). Want to upgrade?" and these options:
1. Yes, upgrade now
2. Always keep me up to date (enable auto-upgrade)
3. Not now (snooze — ask again later)
4. Never ask again (disable update checks)
5. Type something.
6. Chat about this

**Handle responses:**

- **Option 1 (upgrade now):** proceed to Step 3.

- **Option 2 (auto-upgrade):** enable auto-upgrade, then proceed to Step 3:
  ```bash
  "$HYVE_DIR/bin/hyve-config" set auto_upgrade true
  echo "Auto-upgrade enabled. Future updates will be applied automatically."
  ```

- **Option 3 (snooze):** write snooze state with escalating backoff, then continue:
  ```bash
  SNOOZE_FILE="$STATE_DIR/update-snoozed"
  NEW_VERSION="{new}"
  if [ -f "$SNOOZE_FILE" ]; then
    LEVEL=$(awk '{print $2}' "$SNOOZE_FILE" 2>/dev/null || echo "0")
    LEVEL=$((LEVEL + 1))
  else
    LEVEL=1
  fi
  echo "$NEW_VERSION $LEVEL $(date +%s)" > "$SNOOZE_FILE"
  ```
  Tell the user the snooze duration (Level 1: 24h, Level 2: 48h, Level 3+: 7 days).
  Exit without upgrading.

- **Option 4 (never ask):** disable update checks:
  ```bash
  "$HYVE_DIR/bin/hyve-config" set update_check false
  echo "Update checks disabled. Run /hyve:upgrade manually to check for updates."
  ```
  Exit without upgrading.

### Step 3: Detect install type

```bash
if [ -d "$HYVE_DIR/.git" ]; then
  INSTALL_TYPE="git"
elif [ -L "$HOME/.claude/skills/hyve" ]; then
  REAL_DIR=$(readlink -f "$HOME/.claude/skills/hyve" 2>/dev/null || readlink "$HOME/.claude/skills/hyve")
  if [ -d "$REAL_DIR/.git" ]; then
    INSTALL_TYPE="git"
    HYVE_DIR="$REAL_DIR"
  else
    INSTALL_TYPE="vendored"
  fi
else
  INSTALL_TYPE="vendored"
fi
echo "INSTALL_TYPE: $INSTALL_TYPE"
echo "INSTALL_DIR: $HYVE_DIR"
```

### Step 4: Save old version

```bash
OLD_VERSION=$(cat "$HYVE_DIR/VERSION" 2>/dev/null | tr -d '[:space:]' || echo "unknown")
```

### Step 5: Run upgrade

**For git installs:**
```bash
cd "$HYVE_DIR"
git stash --quiet 2>/dev/null || true
git fetch origin 2>/dev/null
git reset --hard origin/main 2>/dev/null
./setup
```

**For vendored installs:**
```bash
TMP_DIR=$(mktemp -d)
git clone --depth 1 https://github.com/pototostudio/hyve.git "$TMP_DIR/hyve"
# Backup old version
mv "$HYVE_DIR" "${HYVE_DIR}.bak"
mv "$TMP_DIR/hyve" "$HYVE_DIR"
cd "$HYVE_DIR" && ./setup
# Clean up backup on success
rm -rf "${HYVE_DIR}.bak"
rm -rf "$TMP_DIR"
```

**If setup fails during vendored upgrade:** restore from backup:
```bash
rm -rf "$HYVE_DIR"
mv "${HYVE_DIR}.bak" "$HYVE_DIR"
echo "Upgrade failed — restored previous version. Run /hyve:upgrade to retry."
```

### Step 6: Write upgrade marker

```bash
mkdir -p "$STATE_DIR"
echo "$OLD_VERSION" > "$STATE_DIR/just-upgraded-from"
rm -f "$STATE_DIR/last-update-check"
rm -f "$STATE_DIR/update-snoozed"
```

### Step 7: Show what's new

Read `CHANGELOG.md` from the upgraded hyve directory. Extract the section between
the new version and the old version. Present 5-7 key changes as bullet points.

If no CHANGELOG.md exists, show a generic message:
"Upgraded from {old} to {new}. Check the repo for details."

## Completion

```
UPGRADE COMPLETE
  From: {old version}
  To: {new version}
  Install type: {git | vendored}
  Auto-upgrade: {enabled | disabled}
```

Then resume whatever skill originally triggered this upgrade (if it was triggered
inline from the preamble).
