#!/usr/bin/env bash
# Layer 4: CI verification that browser bundle does not contain Desktop-only code.
# Run after `pnpm --filter @waiaas/admin build` to validate tree-shaking.

set -euo pipefail

BUNDLE_DIR="packages/admin/dist"

if [ ! -d "$BUNDLE_DIR" ]; then
  echo "FAIL: Bundle directory not found: $BUNDLE_DIR"
  echo "Run 'pnpm --filter @waiaas/admin build' first."
  exit 1
fi

# These patterns indicate Tauri/Desktop module imports leaked into the browser bundle.
# We check for import-style references, not content strings like "walletconnect" which
# may appear legitimately in Admin UI settings forms.
# Desktop-only module identifiers (from dynamic imports) must NOT appear in output.
FORBIDDEN_PATTERNS=(
  "@tauri-apps"
  "__TAURI_INTERNALS__"
  "@reown/appkit"
  "wc-connector"
  "wc-qr-modal"
  "setup-wizard"
  "wizard-store"
)

FAILED=0

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  # Search main bundle JS files only (not source maps or HTML)
  if grep -rl "$pattern" "$BUNDLE_DIR/assets/"*.js 2>/dev/null; then
    echo "FAIL: Found forbidden pattern '$pattern' in browser bundle"
    FAILED=1
  fi
done

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "FAIL: Browser bundle contains Desktop-only code."
  echo "Ensure Desktop code is behind isDesktop() guards and dynamic imports."
  exit 1
fi

echo "PASS: Browser bundle is clean -- no Desktop-only module references found."
exit 0
