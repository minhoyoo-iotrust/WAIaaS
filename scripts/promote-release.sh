#!/usr/bin/env bash
# Promote release from prerelease (rc) to stable, or restore prerelease mode.
#
# Usage:
#   ./scripts/promote-release.sh              # Remove prerelease → commit → push
#   ./scripts/promote-release.sh --restore    # Restore prerelease → commit → push
#   ./scripts/promote-release.sh --dry-run    # Show what would change
#   ./scripts/promote-release.sh --restore --dry-run

set -euo pipefail

CONFIG="release-please-config.json"
MODE="promote"
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --restore) MODE="restore" ;;
    --dry-run) DRY_RUN=true ;;
    --help|-h)
      echo "Usage: $0 [--restore] [--dry-run]"
      echo ""
      echo "  (no flags)   Remove prerelease mode → stable release"
      echo "  --restore    Restore prerelease mode → rc releases"
      echo "  --dry-run    Show changes without applying"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      exit 1
      ;;
  esac
done

# Safety: must be on main branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "Error: must be on main branch (current: $BRANCH)"
  exit 1
fi

# Safety: working tree must be clean
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working tree is not clean. Commit or stash changes first."
  exit 1
fi

# Check current prerelease state
HAS_PRERELEASE=$(node -e "
  const cfg = require('./$CONFIG');
  const pkg = cfg.packages['.'];
  console.log(pkg.prerelease === true ? 'true' : 'false');
")

if [ "$MODE" = "promote" ]; then
  if [ "$HAS_PRERELEASE" = "false" ]; then
    echo "Error: prerelease is already disabled. Nothing to promote."
    exit 1
  fi

  echo "=== Promote: prerelease → stable ==="
  echo "  Will remove \"prerelease\": true from $CONFIG"

  if [ "$DRY_RUN" = "true" ]; then
    echo ""
    echo "[dry-run] Would remove prerelease field and commit+push."
    exit 0
  fi

  # Remove prerelease field from the "." package config
  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$CONFIG', 'utf8'));
    delete cfg.packages['.'].prerelease;
    fs.writeFileSync('$CONFIG', JSON.stringify(cfg, null, 2) + '\n');
  "

  git add "$CONFIG"
  git commit -m "fix: promote release to stable"
  git push

  echo ""
  echo "Done. release-please will create a stable version PR."
  echo "After merging the Release PR and deploying, run:"
  echo "  $0 --restore"

elif [ "$MODE" = "restore" ]; then
  if [ "$HAS_PRERELEASE" = "true" ]; then
    echo "Error: prerelease is already enabled. Nothing to restore."
    exit 1
  fi

  echo "=== Restore: stable → prerelease ==="
  echo "  Will add \"prerelease\": true to $CONFIG"

  if [ "$DRY_RUN" = "true" ]; then
    echo ""
    echo "[dry-run] Would add prerelease field and commit+push."
    exit 0
  fi

  # Add prerelease field back to the "." package config
  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$CONFIG', 'utf8'));
    cfg.packages['.'].prerelease = true;
    // Insert prerelease before extra-files for readability
    const pkg = cfg.packages['.'];
    const ordered = {};
    for (const [k, v] of Object.entries(pkg)) {
      if (k === 'extra-files') {
        ordered['prerelease'] = true;
      }
      if (k !== 'prerelease') {
        ordered[k] = v;
      }
    }
    cfg.packages['.'] = ordered;
    fs.writeFileSync('$CONFIG', JSON.stringify(cfg, null, 2) + '\n');
  "

  git add "$CONFIG"
  git commit -m "chore: restore prerelease mode"
  git push

  echo ""
  echo "Done. Next commits will produce rc versions."
fi
