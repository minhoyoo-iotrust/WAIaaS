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

# Install core first (dependency for others)
echo "  Installing @waiaas/core..."
npm install "${TARBALLS[@waiaas/core]}" --save --silent 2>/dev/null

# Install sdk (0 deps, independent)
echo "  Installing @waiaas/sdk..."
npm install "${TARBALLS[@waiaas/sdk]}" --save --silent 2>/dev/null

# Install remaining packages
for pkg_name in "@waiaas/cli" "@waiaas/mcp" "@waiaas/daemon" "@waiaas/skills" "@waiaas/adapter-solana" "@waiaas/adapter-evm"; do
  echo "  Installing $pkg_name..."
  npm install "${TARBALLS[$pkg_name]}" --save --silent 2>/dev/null || true
done

# Step 4: Verify ESM imports
echo ""
echo "--- Verifying ESM imports ---"

PASSED=0
FAILED=0

verify_import() {
  local pkg_name="$1"
  local import_expr="$2"

  if node --input-type=module -e "$import_expr" 2>/dev/null; then
    echo "  ✓ $pkg_name"
    PASSED=$((PASSED + 1))
  else
    echo "  ✗ $pkg_name FAILED"
    FAILED=$((FAILED + 1))
  fi
}

verify_import "@waiaas/core" "import { WAIaaSError } from '@waiaas/core';"
verify_import "@waiaas/sdk" "import { WAIaaSClient } from '@waiaas/sdk';"
verify_import "@waiaas/cli" "import '@waiaas/cli';" || true
verify_import "@waiaas/mcp" "import '@waiaas/mcp';" || true
verify_import "@waiaas/daemon" "import '@waiaas/daemon';" || true
verify_import "@waiaas/adapter-solana" "import { SolanaAdapter } from '@waiaas/adapter-solana';"
verify_import "@waiaas/adapter-evm" "import { EvmAdapter } from '@waiaas/adapter-evm';"

# Step 5: Verify CLI binary
echo ""
echo "--- Verifying CLI binary ---"
if npx waiaas --version 2>/dev/null; then
  echo "  ✓ waiaas CLI"
  PASSED=$((PASSED + 1))
else
  echo "  ✗ waiaas CLI FAILED"
  FAILED=$((FAILED + 1))
fi

# Step 6: Verify skills CLI
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
