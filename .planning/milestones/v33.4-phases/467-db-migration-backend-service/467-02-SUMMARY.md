---
phase: 467-db-migration-backend-service
plan: 02
subsystem: backend
tags: [wallet-app-service, preset-auto-setup, exclusive-toggle, signing-enabled]

requires:
  - phase: 467-01
    provides: "DB v61 partial unique index on wallet_apps(wallet_type) WHERE signing_enabled=1"
provides:
  - "WalletAppService exclusive signing toggle (update + register)"
  - "PresetAutoSetupService signing_enabled column-based operation (preferred_wallet removed)"
affects: [468, 469]

tech-stack:
  added: []
  patterns: ["SQLite transaction-wrapped exclusive toggle", "Service-level signing primary management"]

key-files:
  created: []
  modified:
    - packages/daemon/src/services/signing-sdk/wallet-app-service.ts
    - packages/daemon/src/services/signing-sdk/preset-auto-setup.ts
    - packages/daemon/src/__tests__/wallet-app-service.test.ts
    - packages/daemon/src/__tests__/preset-auto-setup.test.ts

key-decisions:
  - "update() wraps in SQLite transaction for atomic exclusive toggle"
  - "register() checks existing signing primary before INSERT (not after)"
  - "PresetAutoSetupService calls update(signingEnabled=true) after ensureRegistered"
  - "preferred_wallet setting removed from SNAPSHOT_KEYS (no rollback needed)"

requirements-completed: [SVC-01, SVC-02, SVC-03, TST-01]

duration: 8min
completed: 2026-04-02
---

# Phase 467 Plan 02: WalletAppService Exclusive Toggle + PresetAutoSetupService Transition Summary

**Exclusive signing toggle in WalletAppService + PresetAutoSetupService migrated from preferred_wallet setting to signing_enabled column**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-02T09:15:00Z
- **Completed:** 2026-04-02T09:23:00Z
- **Tasks:** 2 (WalletAppService + PresetAutoSetupService, both TDD)
- **Files modified:** 4

## Accomplishments

1. WalletAppService.update() with signingEnabled=true atomically disables same-wallet_type peers in a transaction (SVC-01)
2. WalletAppService.register() checks for existing signing primary and sets signingEnabled=0 if found (SVC-02)
3. PresetAutoSetupService no longer writes signing_sdk.preferred_wallet; uses signing_enabled column via WalletAppService.update() (SVC-03)
4. Added 7 exclusive signing toggle tests (TST-01)
5. Updated 9 existing PresetAutoSetupService unit + integration tests

## Commits

| Hash | Message |
|------|---------|
| cab2d965 | feat(467-02): add exclusive signing toggle to WalletAppService |
| c9bd1e1f | feat(467-02): transition PresetAutoSetupService from preferred_wallet to signing_enabled |

## Verification

All 50 tests pass across 3 test files:
- migration-v61.test.ts: 7/7
- wallet-app-service.test.ts: 34/34
- preset-auto-setup.test.ts: 9/9

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] T-AUTO-06 integration test failure point updated**
- **Found during:** Task 2
- **Issue:** T-AUTO-06 test mocked signing_sdk.preferred_wallet failure, but that setting is no longer written
- **Fix:** Changed mock to fail on signing_sdk.preferred_channel write instead
- **Files modified:** packages/daemon/src/__tests__/preset-auto-setup.test.ts
- **Commit:** c9bd1e1f

## Known Stubs

None.
