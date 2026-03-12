---
phase: 391-admin-ui
plan: 01
subsystem: admin-ui
tags: [admin, credentials, external-actions, ui]
dependency_graph:
  requires: [Phase 390 pipeline routing + query API]
  provides: [Credentials page, Wallet Detail Credentials tab, Wallet Detail External Actions tab]
  affects: [layout.tsx, endpoints.ts, wallets.tsx, policies.tsx]
tech_stack:
  added: []
  patterns: [useSignal CRUD page, wallet detail tab with modal]
key_files:
  created:
    - packages/admin/src/pages/credentials.tsx
    - packages/admin/src/__tests__/credentials.test.tsx
    - packages/admin/src/__tests__/wallets-external-actions.test.tsx
  modified:
    - packages/admin/src/api/endpoints.ts
    - packages/admin/src/components/layout.tsx
    - packages/admin/src/pages/wallets.tsx
    - packages/admin/src/pages/policies.tsx
key_decisions:
  - Credential CRUD uses name-based ref for delete/rotate (matching daemon API)
  - ExternalActionsTab inline in wallets.tsx (same pattern as StakingTab/NftTab)
  - venue_whitelist_enabled added to PolicyDefaultsTab (fixes settings-completeness test)
metrics:
  duration: ~6min
  completed: 2026-03-12
---

# Phase 391 Plan 01: Credentials Page + Wallet Detail Tabs Summary

Global/per-wallet credential CRUD with Add/Delete/Rotate modals + off-chain action history table with venue/status filters and detail modal

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Credentials page + endpoints + layout | b21f86e5 | credentials.tsx, endpoints.ts, layout.tsx, credentials.test.tsx |
| 2 | Wallet Detail Credentials + External Actions tabs | 319fa3a0 | wallets.tsx, policies.tsx, wallets-external-actions.test.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] settings-completeness test failure for venue_whitelist_enabled**
- **Found during:** Task 2 verification
- **Issue:** `policy.venue_whitelist_enabled` was registered in setting-keys.ts (Phase 389) but not referenced in any admin page, causing settings-completeness test to fail
- **Fix:** Added to POLICY_DEFAULTS_KEYS array + FormField toggle in PolicyDefaultsTab
- **Files modified:** packages/admin/src/pages/policies.tsx
- **Commit:** 319fa3a0

## Verification Results

- `pnpm --filter @waiaas/admin test -- --run`: 796 tests passed (54 files)
- `pnpm --filter @waiaas/admin run build`: Build successful (367KB JS, 36KB CSS)
- Credentials page at /credentials with nav link
- Wallet Detail has Credentials + External Actions tabs
- Credential value never exposed in UI (CredentialMetadata has no value field)

## Self-Check: PASSED
