---
phase: 293-human-wallet-apps-registry
plan: 04
status: complete
started: 2026-03-01
completed: 2026-03-01
---

## Summary

Added comprehensive tests for all Phase 293 artifacts: WalletAppService CRUD, migration v31, signing_enabled blocking, preset auto-registration, and Admin UI Human Wallet Apps page.

## What was built

### Task 1: Daemon tests

**migration-v31.test.ts** (4 tests):
- T-APP-01: wallet_apps table exists with correct 7 columns
- T-APP-01b: UNIQUE constraint on name column
- T-APP-01c: Fresh DB has LATEST_SCHEMA_VERSION=31
- Defaults: signing_enabled=1 and alerts_enabled=1

**wallet-app-service.test.ts** (24 tests):
- T-APP-02: register() creates app with correct fields
- T-APP-07: duplicate name throws WALLET_APP_DUPLICATE (409)
- T-APP-07b: ensureRegistered() idempotent
- T-APP-03: list() returns apps in created_at order
- T-APP-04: update() toggles signing_enabled
- T-APP-04b: update() throws WALLET_APP_NOT_FOUND for unknown id (404)
- T-APP-05: remove() deletes app
- T-APP-05b: remove() throws WALLET_APP_NOT_FOUND
- T-APP-10: listWithUsedBy() includes wallet references
- T-APP-10b: listWithUsedBy() empty usedBy
- T-APP-03b: getAlertEnabledApps() filters by alerts_enabled
- Plus getByName/getById accessors and edge cases

**approval-channel-router.test.ts** (3 new tests):
- T-APP-08: signing_enabled=0 blocks with SIGNING_DISABLED error
- T-APP-08b: signing_enabled=1 allows signing
- T-APP-08c: No wallet_apps row allows signing (passthrough)

**preset-auto-setup.test.ts** (3 new tests):
- T-APP-09: preset apply auto-registers wallet app
- T-APP-09b: preset apply idempotent for wallet app
- T-APP-09c: wallet_app_registered not applied without WalletAppService

### Task 2: Admin UI tests

**human-wallet-apps.test.tsx** (10 tests):
- T-HWUI-03: renders app cards after loading
- T-HWUI-06: used by wallets displayed
- T-HWUI-07: ntfy server URL displayed
- T-HWUI-04: signing toggle calls PUT
- T-HWUI-05: alerts toggle calls PUT
- T-HWUI-08: Register App button opens modal
- T-HWUI-09: remove button calls DELETE after confirm
- T-HWUI-02: system page has no Signing SDK section
- Empty state when no apps registered
- Loading state

### Additional fixes
- Fixed Modal API usage in human-wallet-apps.tsx (open/onCancel props)
- Updated system.test.tsx: Signing SDK section assertion changed to queryByText null
- Updated schema version assertions (30->31) across 7 existing test files
- Bumped test migration version numbers to avoid v31 conflict

## Key files

### Created
- `packages/daemon/src/__tests__/wallet-app-service.test.ts` -- 24 WalletAppService tests
- `packages/daemon/src/__tests__/migration-v31.test.ts` -- 4 migration tests
- `packages/admin/src/__tests__/human-wallet-apps.test.tsx` -- 10 UI tests

### Modified
- `packages/daemon/src/__tests__/approval-channel-router.test.ts` -- 3 signing_enabled tests
- `packages/daemon/src/__tests__/preset-auto-setup.test.ts` -- 3 auto-registration tests
- `packages/admin/src/__tests__/system.test.tsx` -- Signing SDK removal assertion
- `packages/admin/src/pages/human-wallet-apps.tsx` -- Modal API fix
- 7 other test files -- schema version 30->31 updates

## Verification
- Daemon: 3480 passed, 2 failed (pre-existing wallet-owner-preset), 1 skipped
- Admin: 638 passed, 0 failed
- Total new tests: 44 (24 + 4 + 3 + 3 + 10)

## Self-Check: PASSED
