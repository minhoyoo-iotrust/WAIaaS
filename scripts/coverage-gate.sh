#!/usr/bin/env bash
# scripts/coverage-gate.sh
# Usage: COVERAGE_GATE_MODE=soft|hard bash scripts/coverage-gate.sh
#
# Environment variables:
#   COVERAGE_GATE_MODE: soft (warning only) | hard (fail) - default: soft
#   COVERAGE_GATE_<PACKAGE>: per-package mode override
#     e.g. COVERAGE_GATE_PACKAGES_CORE=hard
#
# Package thresholds (lines) are synced with each package's vitest.config.ts.
# This script reads coverage/coverage-summary.json per package.

set -euo pipefail

MODE="${COVERAGE_GATE_MODE:-soft}"

# Core 4 packages
PACKAGES=(
  "packages/core"
  "packages/daemon"
  "packages/adapters/solana"
  "packages/sdk"
)

# Per-package hard thresholds (lines metric, synced with vitest.config.ts)
declare -A THRESHOLDS
THRESHOLDS[packages/core]=90
THRESHOLDS[packages/daemon]=85
THRESHOLDS[packages/adapters/solana]=80
THRESHOLDS[packages/sdk]=80

check_package() {
  local pkg="$1"
  local threshold="${THRESHOLDS[$pkg]}"
  local summary="$pkg/coverage/coverage-summary.json"

  if [ ! -f "$summary" ]; then
    echo "::warning::Coverage summary not found: $summary (skipped)"
    return 0
  fi

  local lines
  lines=$(jq '.total.lines.pct' "$summary")

  # Per-package mode override: COVERAGE_GATE_PACKAGES_CORE, COVERAGE_GATE_PACKAGES_DAEMON, etc.
  local pkg_var
  pkg_var="COVERAGE_GATE_$(echo "$pkg" | tr '/' '_' | tr '[:lower:]' '[:upper:]')"
  local pkg_mode="${!pkg_var:-$MODE}"

  if (( $(echo "$lines < $threshold" | bc -l) )); then
    if [ "$pkg_mode" = "hard" ]; then
      echo "::error::$pkg coverage ${lines}% < ${threshold}% (HARD GATE)"
      return 1
    else
      echo "::warning::$pkg coverage ${lines}% < ${threshold}% (soft warning)"
    fi
  else
    echo "$pkg coverage ${lines}% >= ${threshold}% OK"
  fi
}

FAILED=0
for pkg in "${PACKAGES[@]}"; do
  check_package "$pkg" || FAILED=1
done

exit $FAILED
