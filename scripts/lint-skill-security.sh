#!/usr/bin/env bash
# lint-skill-security.sh — Verify all skill files include the master password security notice.
# Exit 1 if any skill file is missing the required notice.

set -euo pipefail

REQUIRED_PATTERN="NEVER request.*master password"
SKILLS_DIR="$(cd "$(dirname "$0")/.." && pwd)/skills"
EXIT_CODE=0

for f in "$SKILLS_DIR"/*.skill.md; do
  if ! grep -q "$REQUIRED_PATTERN" "$f"; then
    echo "ERROR: $(basename "$f") is missing security notice: \"$REQUIRED_PATTERN\""
    EXIT_CODE=1
  fi
done

if [ "$EXIT_CODE" -eq 0 ]; then
  echo "All skill files contain the required security notice."
fi

exit $EXIT_CODE
