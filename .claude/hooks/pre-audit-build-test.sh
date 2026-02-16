#!/bin/bash
# Pre-audit/complete-milestone hook: runs pnpm build && pnpm test before milestone operations.
# Blocks the tool call if build or tests fail.

set -euo pipefail

INPUT=$(cat)
SKILL=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')

# Only intercept audit-milestone and complete-milestone
case "$SKILL" in
  audit-milestone|complete-milestone) ;;
  *) exit 0 ;;
esac

CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
if [ -z "$CWD" ]; then
  CWD="$(pwd)"
fi

LOGFILE=$(mktemp /tmp/waiaas-pre-audit-XXXXXX.log)

echo "Running pnpm build && pnpm test before $SKILL..." >&2

if ! (cd "$CWD" && pnpm build 2>&1 | tee "$LOGFILE"); then
  TAIL=$(tail -20 "$LOGFILE")
  rm -f "$LOGFILE"
  cat <<EOJSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Build failed. Fix build errors before running $SKILL.\n\n$TAIL"
  }
}
EOJSON
  exit 0
fi

if ! (cd "$CWD" && pnpm test 2>&1 | tee "$LOGFILE"); then
  TAIL=$(tail -30 "$LOGFILE")
  rm -f "$LOGFILE"
  cat <<EOJSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Tests failed. Fix test failures before running $SKILL.\n\n$TAIL"
  }
}
EOJSON
  exit 0
fi

rm -f "$LOGFILE"
echo "Build and tests passed. Proceeding with $SKILL." >&2
exit 0
