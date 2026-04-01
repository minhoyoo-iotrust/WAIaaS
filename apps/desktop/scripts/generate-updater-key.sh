#!/bin/bash
# Generates Tauri updater Ed25519 key pair
# Usage: ./generate-updater-key.sh
# Output: prints pubkey (add to tauri.conf.json) and privkey (add to GitHub Secrets as TAURI_SIGNING_PRIVATE_KEY)
set -euo pipefail

pnpm tauri signer generate -w ~/.tauri/waiaas-desktop.key

echo ""
echo "=== Setup Instructions ==="
echo "1. Copy the PUBLIC key above into tauri.conf.json plugins.updater.pubkey"
echo "2. Add the PRIVATE key content as GitHub Secret: TAURI_SIGNING_PRIVATE_KEY"
echo "3. If you set a password, also add it as: TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
