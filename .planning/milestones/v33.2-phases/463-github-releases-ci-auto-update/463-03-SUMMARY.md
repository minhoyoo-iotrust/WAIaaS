---
phase: 463-github-releases-ci-auto-update
plan: "03"
title: "Auto-Update UI (UpdateBanner)"
subsystem: admin-ui
tags: [auto-update, desktop, preact, tree-shaking]
dependency_graph:
  requires: [tauri-updater-plugin]
  provides: [update-banner-ui, update-checker]
  affects: [app-tsx]
tech_stack:
  added: ["@tauri-apps/plugin-updater"]
  patterns: [dynamic-import-tree-shaking, signal-lazy-load]
key_files:
  created:
    - packages/admin/src/desktop/update-checker.ts
    - packages/admin/src/desktop/UpdateBanner.tsx
  modified:
    - packages/admin/src/app.tsx
    - packages/admin/package.json
decisions:
  - "Dynamic import pattern consistent with wizard -- signal<ComponentType | null> for lazy loading"
  - "UpdateBanner renders above Layout, below shutdown overlay in priority chain"
  - "Ed25519 signature verification handled by Rust plugin -- JS side only checks version"
metrics:
  duration: "2min"
  completed: "2026-03-31"
  tasks: 2
  files: 4
requirements_addressed: [UPDT-01, UPDT-02, UPDT-03]
---

# Phase 463 Plan 03: Auto-Update UI (UpdateBanner) Summary

UpdateBanner with dynamic import tree-shaking -- check/download/install flow via Tauri updater plugin JS API

## Changes Made

### Task 1: update-checker.ts + UpdateBanner.tsx + App.tsx integration
**Commit:** `3348fa3d`

1. **update-checker.ts**: Wraps `@tauri-apps/plugin-updater` with `isDesktop()` guard and dynamic import. Exports `checkForUpdate()` (returns UpdateInfo | null) and `installUpdate()` (with progress callback). Ed25519 signature verification is automatic on the Rust side.
2. **UpdateBanner.tsx**: Preact component with 4 states (idle/available/downloading/done). Blue banner with "Update now" / "Later" buttons. Progress bar during download.
3. **app.tsx**: Added `UpdateBannerComponent` signal with dynamic import inside existing Desktop useEffect. Renders `<Banner />` above `<Layout />` when loaded.
4. **package.json**: Added `@tauri-apps/plugin-updater` as optional peer dependency.

### Task 2: Phase 463 full infrastructure verification
Auto-approved in auto-mode.

## Deviations from Plan

**[Rule 3 - Blocking] Package path correction**: Plan referenced `packages/admin-ui/` but actual package is `packages/admin/`. Used correct path throughout. Not a code fix, just path adjustment.

## Known Stubs

None.
