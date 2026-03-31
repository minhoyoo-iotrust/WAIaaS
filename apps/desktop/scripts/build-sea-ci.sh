#!/bin/bash
set -euo pipefail
# CI helper: Build SEA binary and copy to Tauri externalBin with correct target triple name
# Usage: ./build-sea-ci.sh <target-triple>
# Example: ./build-sea-ci.sh aarch64-apple-darwin

TARGET_TRIPLE="${1:?Usage: build-sea-ci.sh <target-triple>}"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# Step 1: Build SEA binary using existing build-sea.mjs
cd "${REPO_ROOT}/packages/daemon"
node scripts/build-sea.mjs

# Step 2: Copy to Tauri externalBin with correct target triple name
DEST="${REPO_ROOT}/apps/desktop/src-tauri/binaries/waiaas-daemon-${TARGET_TRIPLE}"
mkdir -p "$(dirname "${DEST}")"

if [[ "$TARGET_TRIPLE" == *"windows"* ]]; then
  cp dist/waiaas-daemon.exe "${DEST}.exe"
else
  cp dist/waiaas-daemon "${DEST}"
  chmod +x "${DEST}"
fi

echo "SEA binary ready: ${DEST}"
