---
phase: 463-github-releases-ci-auto-update
plan: "02"
title: "GitHub Actions 3-Platform Build Matrix"
subsystem: ci
tags: [github-actions, tauri, release, ci-cd, cross-platform]
dependency_graph:
  requires: [tauri-updater-plugin]
  provides: [desktop-release-workflow, sea-ci-build]
  affects: [github-releases]
tech_stack:
  added: [tauri-action]
  patterns: [matrix-build, draft-publish-release, sidecar-ci]
key_files:
  created:
    - .github/workflows/desktop-release.yml
    - apps/desktop/scripts/build-sea-ci.sh
  modified: []
decisions:
  - "4 matrix entries: macOS arm64 + x64, Windows x64, Linux x64"
  - "Draft release pattern: create draft -> parallel builds upload -> publish"
  - "Apple signing secrets optional -- builds proceed unsigned if not set"
metrics:
  duration: "2min"
  completed: "2026-03-31"
  tasks: 1
  files: 2
requirements_addressed: [DIST-01, DIST-02, DIST-03]
---

# Phase 463 Plan 02: GitHub Actions 3-Platform Build Matrix Summary

Desktop release CI with 4-entry build matrix (macOS arm64/x64, Windows x64, Linux x64) uploading to GitHub Releases via tauri-action

## Changes Made

### Task 1: CI SEA build script + Desktop Release workflow
**Commit:** `bff990d7`

1. **build-sea-ci.sh**: CI helper that builds SEA binary via existing `build-sea.mjs` and copies with correct target triple name to Tauri externalBin directory
2. **desktop-release.yml**: 3-job workflow (create-release -> build-tauri matrix -> publish-release)
   - Triggered by `desktop-v*` tag push or manual `workflow_dispatch`
   - 4 parallel matrix builds with `tauri-apps/tauri-action@v0`
   - macOS code signing + notarization via `APPLE_*` secrets (optional)
   - Ed25519 signing via `TAURI_SIGNING_PRIVATE_KEY` secret
   - tauri-action auto-generates `latest.json` + `.sig` files for updater

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.
