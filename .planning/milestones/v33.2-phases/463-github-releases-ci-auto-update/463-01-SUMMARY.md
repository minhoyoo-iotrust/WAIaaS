---
phase: 463-github-releases-ci-auto-update
plan: "01"
title: "Tauri Updater Plugin + Ed25519 Key Setup"
subsystem: desktop
tags: [tauri, updater, ed25519, auto-update]
dependency_graph:
  requires: []
  provides: [tauri-updater-plugin, ed25519-signing-config]
  affects: [desktop-release-ci, update-banner-ui]
tech_stack:
  added: [tauri-plugin-updater]
  patterns: [ed25519-signing, github-releases-endpoint]
key_files:
  created:
    - apps/desktop/scripts/generate-updater-key.sh
  modified:
    - apps/desktop/src-tauri/Cargo.toml
    - apps/desktop/src-tauri/tauri.conf.json
    - apps/desktop/src-tauri/src/main.rs
    - apps/desktop/src-tauri/capabilities/default.json
decisions:
  - "pubkey placeholder in tauri.conf.json -- replaced at CI time via generate-updater-key.sh"
  - "createUpdaterArtifacts: v1Compatible for backward-compatible update format"
  - "macOS signingIdentity null -- overridden by APPLE_SIGNING_IDENTITY env in CI"
metrics:
  duration: "2min"
  completed: "2026-03-31"
  tasks: 1
  files: 5
requirements_addressed: [UPDT-01, UPDT-03]
---

# Phase 463 Plan 01: Tauri Updater Plugin + Ed25519 Key Setup Summary

Tauri updater plugin integrated with Ed25519 signing config pointing to GitHub Releases latest.json endpoint

## Changes Made

### Task 1: Tauri updater plugin registration + Ed25519 key setup
**Commit:** `17ce11be`

1. **Cargo.toml**: Added `tauri-plugin-updater = "2"` dependency
2. **main.rs**: Registered `tauri_plugin_updater::Builder::new().build()` in the Tauri Builder chain
3. **tauri.conf.json**: Added `plugins.updater` with GitHub Releases endpoint + pubkey placeholder, `createUpdaterArtifacts: "v1Compatible"`, macOS/Windows bundle signing config
4. **capabilities/default.json**: Added `updater:default` permission
5. **generate-updater-key.sh**: Helper script to generate Ed25519 key pair via `pnpm tauri signer generate`

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

- `pubkey: "PLACEHOLDER_REPLACE_WITH_REAL_KEY"` in tauri.conf.json -- intentional placeholder, replaced when user runs generate-updater-key.sh and sets up GitHub Secrets (CI will provide the real key via TAURI_SIGNING_PRIVATE_KEY)
