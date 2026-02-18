#!/usr/bin/env bash
# Smoke test for published npm packages.
# Runs: pnpm pack → install tarballs in temp dir → verify ESM imports.
#
# Usage:
#   bash scripts/smoke-test-published.sh
#   pnpm test:smoke

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SMOKE_DIR=$(mktemp -d)

cleanup() {
  rm -rf "$SMOKE_DIR"
}
trap cleanup EXIT

echo "=== WAIaaS Package Smoke Test ==="
echo "Temp dir: $SMOKE_DIR"
echo ""

# Step 1: Build all packages
echo "--- Building all packages ---"
cd "$ROOT_DIR"
pnpm turbo run build --filter='./packages/*'

# Step 2: Pack all publishable packages
declare -A TARBALLS
PACKAGES=(
  "packages/core"
  "packages/sdk"
  "packages/cli"
  "packages/mcp"
  "packages/daemon"
  "packages/skills"
  "packages/adapters/solana"
  "packages/adapters/evm"
)

echo ""
echo "--- Packing packages ---"
for pkg_path in "${PACKAGES[@]}"; do
  cd "$ROOT_DIR/$pkg_path"
  pkg_name=$(node -p "require('./package.json').name")
  tarball=$(pnpm pack --pack-destination "$SMOKE_DIR" 2>/dev/null | tail -1)
  TARBALLS["$pkg_name"]="$tarball"
  echo "  Packed: $pkg_name → $tarball"
done

# Step 3: Create temp project and install tarballs
echo ""
echo "--- Setting up temp project ---"
cd "$SMOKE_DIR"
npm init -y --silent > /dev/null 2>&1

# Add type: module for ESM imports
node -e "
const pkg = require('./package.json');
pkg.type = 'module';
require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2));
"

# Install all tarballs in a single call so npm resolves interdependencies
echo "  Installing all packages..."
npm install \
  "${TARBALLS[@waiaas/core]}" \
  "${TARBALLS[@waiaas/sdk]}" \
  "${TARBALLS[@waiaas/cli]}" \
  "${TARBALLS[@waiaas/mcp]}" \
  "${TARBALLS[@waiaas/daemon]}" \
  "${TARBALLS[@waiaas/skills]}" \
  "${TARBALLS[@waiaas/adapter-solana]}" \
  "${TARBALLS[@waiaas/adapter-evm]}" \
  --save

# Step 4: Verify ESM imports
echo ""
echo "--- Verifying ESM imports ---"

PASSED=0
FAILED=0

verify_import() {
  local pkg_name="$1"
  local import_expr="$2"
  local err

  if err=$(node --input-type=module -e "$import_expr" 2>&1); then
    echo "  ✓ $pkg_name"
    PASSED=$((PASSED + 1))
  else
    echo "  ✗ $pkg_name FAILED"
    echo "    $(echo "$err" | head -3)"
    FAILED=$((FAILED + 1))
  fi
}

verify_import "@waiaas/core" "import { WAIaaSError } from '@waiaas/core';"
verify_import "@waiaas/sdk" "import { WAIaaSClient } from '@waiaas/sdk';"
# CLI package has top-level side effects (program.parseAsync) — verify via binary test below
verify_import "@waiaas/mcp" "import '@waiaas/mcp';" || true
verify_import "@waiaas/daemon" "import '@waiaas/daemon';" || true
verify_import "@waiaas/adapter-solana" "import { SolanaAdapter } from '@waiaas/adapter-solana';"
verify_import "@waiaas/adapter-evm" "import { EvmAdapter } from '@waiaas/adapter-evm';"

# Step 5: Verify Admin UI in daemon package
echo ""
echo "--- Verifying Admin UI in daemon package ---"
DAEMON_DIR=$(node -e "const p=require.resolve('@waiaas/daemon/package.json');console.log(require('path').dirname(p))")
if [ -f "$DAEMON_DIR/public/admin/index.html" ]; then
  echo "  ✓ Admin UI (public/admin/index.html)"
  PASSED=$((PASSED + 1))
else
  echo "  ✗ Admin UI MISSING from @waiaas/daemon package"
  FAILED=$((FAILED + 1))
fi

# Step 6: Verify CLI binary
echo ""
echo "--- Verifying CLI binary ---"
if npx waiaas --version 2>/dev/null; then
  echo "  ✓ waiaas CLI"
  PASSED=$((PASSED + 1))
else
  echo "  ✗ waiaas CLI FAILED"
  FAILED=$((FAILED + 1))
fi

# Step 7: Verify skills CLI
echo ""
echo "--- Verifying skills CLI ---"
if npx @waiaas/skills list 2>/dev/null; then
  echo "  ✓ @waiaas/skills CLI"
  PASSED=$((PASSED + 1))
else
  echo "  ✗ @waiaas/skills CLI FAILED"
  FAILED=$((FAILED + 1))
fi

# Summary
echo ""
echo "=== Results ==="
echo "Passed: $PASSED"
echo "Failed: $FAILED"

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "SMOKE TEST FAILED"
  exit 1
fi

echo ""
echo "ALL SMOKE TESTS PASSED"
