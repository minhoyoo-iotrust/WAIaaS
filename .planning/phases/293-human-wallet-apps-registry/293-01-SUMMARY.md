---
phase: 293-human-wallet-apps-registry
plan: 01
status: complete
started: 2026-03-01
completed: 2026-03-01
---

## Summary

Created the wallet_apps database table (migration v31), WalletAppService with full CRUD operations, signing_enabled enforcement in ApprovalChannelRouter, and preset auto-registration in PresetAutoSetupService.

## What was built

### Task 1: DB migration v31 + Drizzle schema
- Migration v31 creates `wallet_apps` table with 7 columns: id (PK), name (UNIQUE), display_name, signing_enabled, alerts_enabled, created_at, updated_at
- Updated `LATEST_SCHEMA_VERSION` from 30 to 31
- Added wallet_apps DDL to `getCreateTableStatements()` (Table 19)
- Added Drizzle ORM `walletApps` table definition in schema.ts
- Added 3 new error codes: `SIGNING_DISABLED` (403), `WALLET_APP_DUPLICATE` (409), `WALLET_APP_NOT_FOUND` (404)
- Updated en.ts and ko.ts i18n files

### Task 2: WalletAppService + signing blocking + preset auto-registration
- Created `WalletAppService` with: register, ensureRegistered, list, listWithUsedBy, update, remove, getById, getByName, getAlertEnabledApps
- Added signing_enabled check in `ApprovalChannelRouter.route()` -- blocks signing when wallet_apps.signing_enabled=0
- Extended `PresetAutoSetupService` with optional `WalletAppService` parameter (Step 5) for auto-registration
- Updated `WalletCrudRouteDeps` and `server.ts` to pass WalletAppService
- Updated migration-chain.test.ts for v31 assertions

## Key files

### Created
- `packages/daemon/src/services/signing-sdk/wallet-app-service.ts` -- WalletAppService CRUD

### Modified
- `packages/core/src/errors/error-codes.ts` -- 3 new error codes
- `packages/core/src/i18n/en.ts` -- English i18n for new errors
- `packages/core/src/i18n/ko.ts` -- Korean i18n for new errors
- `packages/daemon/src/infrastructure/database/migrate.ts` -- Migration v31
- `packages/daemon/src/infrastructure/database/schema.ts` -- Drizzle walletApps table
- `packages/daemon/src/services/signing-sdk/approval-channel-router.ts` -- signing_enabled check
- `packages/daemon/src/services/signing-sdk/preset-auto-setup.ts` -- Step 5 auto-registration
- `packages/daemon/src/api/routes/wallets.ts` -- WalletAppService in deps
- `packages/daemon/src/api/server.ts` -- WalletAppService instantiation
- `packages/daemon/src/__tests__/migration-chain.test.ts` -- v31 assertions

## Verification

- All 52 migration chain tests pass
- All 32 approval-channel-router + preset-auto-setup tests pass
- TypeScript compiles with no errors

## Self-Check: PASSED
