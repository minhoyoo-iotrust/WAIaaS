---
phase: 314-smart-account-service-db-settings
plan: 03
subsystem: api, tests
tags: [erc-4337, smart-account, rest-api, integration-tests, openapi]

requires:
  - phase: 314-01
    provides: AccountType enum, SmartAccountService, DB migration v38
  - phase: 314-02
    provides: smart_account Admin Settings
provides:
  - POST /wallets accountType parameter with smart account validation
  - GET /wallets and GET /wallets/:id include accountType, signerKey, deployed
  - SmartAccountService DI via CreateAppDeps -> walletCrudRoutes
  - 5 SmartAccountService unit tests
  - 8 wallet creation integration tests (13 total)
affects: [smart-account-pipeline, smart-account-send-userop]

tech-stack:
  added: []
  patterns: [feature gate via Admin Settings, chain validation for EVM-only, DI through CreateAppDeps]

key-files:
  created:
    - packages/daemon/src/__tests__/smart-account-service.test.ts
    - packages/daemon/src/__tests__/smart-account-wallet-creation.test.ts
  modified:
    - packages/daemon/src/api/routes/wallets.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/server.ts

key-decisions:
  - "accountType extracted via (parsed as any).accountType for backward compat with existing Zod inference"
  - "Smart account validation order: chain -> feature gate -> bundler URL"
  - "CreateAppDeps receives smartAccountService and forwards to walletCrudRoutes"
  - "vi.mock factory uses inline values to avoid hoisting issues"

patterns-established:
  - "ERC-4337 feature gate: settings-based enable check per-request"
  - "CREATE2 address replaces publicKey as wallet address for smart accounts"

requirements-completed: [SA-01, SA-06, SA-07, SA-08, SA-09, SA-10]

duration: 20min
completed: 2026-03-04
---

# Plan 314-03 Summary

**REST API extension for smart account wallet creation with feature gate, chain validation, and 13 comprehensive tests**

## Performance

- **Duration:** 20 min
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Extended POST /wallets with accountType parameter and smart account validation (EVM-only, feature gate, bundler URL)
- Added CREATE2 address prediction flow via SmartAccountService in wallet creation
- Extended GET /wallets list and GET /wallets/:id detail with accountType, signerKey, deployed fields
- Extended PUT /wallets/:id update response with smart account fields
- Added smartAccountService to CreateAppDeps and forwarded to walletCrudRoutes
- Added accountType, signerKey, deployed to WalletCrudResponseSchema and WalletDetailResponseSchema
- Created 5 SmartAccountService unit tests (CREATE2, custom entryPoint, default v0.7, parameter verification)
- Created 8 integration tests (EOA default, EOA explicit, feature gate, chain validation, bundler URL, DB migration v38, GET list, GET detail)

## Task Commits

1. **Task 1: Extend wallet creation API with smart account support** - `610905d6` (feat)
2. **Task 2: Add SmartAccountService unit tests and integration tests** - `db96d5d5` (test)

## Files Created/Modified
- `packages/daemon/src/api/routes/wallets.ts` - POST/GET/PUT handlers with smart account fields and validation
- `packages/daemon/src/api/routes/openapi-schemas.ts` - WalletCrudResponseSchema, WalletDetailResponseSchema extended
- `packages/daemon/src/api/server.ts` - smartAccountService in CreateAppDeps + forwarding
- `packages/daemon/src/__tests__/smart-account-service.test.ts` - 5 unit tests
- `packages/daemon/src/__tests__/smart-account-wallet-creation.test.ts` - 8 integration tests

## Decisions Made
- Smart account validation order: chain first (fast fail), then feature gate, then bundler URL
- Used `(parsed as any).accountType` to extract accountType from Zod-parsed body (avoids modifying existing type inference)
- Used `(a as any)` casts for accessing new Drizzle columns in GET handlers (pragmatic approach)
- vi.mock factory inline values to avoid vitest hoisting issue with top-level variables

## Deviations from Plan

### Auto-fixed Issues

**1. createDatabase return type mismatch in integration tests**
- **Found during:** Task 2 (test creation)
- **Issue:** `createDatabase(':memory:')` returns `{ sqlite, db }` not raw Database
- **Fix:** Destructured return value and passed both `db` and `sqlite` to createApp
- **Verification:** All 8 integration tests pass

**2. Missing deps in createApp for route mounting**
- **Found during:** Task 2 (test creation)
- **Issue:** walletCrudRoutes require db, masterPassword, masterPasswordHash in CreateAppDeps for routes to mount
- **Fix:** Added all required deps to test's createApp call
- **Verification:** Routes properly mount and respond

**3. vi.mock factory hoisting**
- **Found during:** Task 2 (unit test execution)
- **Issue:** `vi.mock` factory is hoisted before `const` declarations, causing ReferenceError
- **Fix:** Inlined constant values in mock factory, moved const declarations after import
- **Verification:** All 5 unit tests pass

**4. smartAccountService not in CreateAppDeps**
- **Found during:** Task 2 (test creation)
- **Issue:** CreateAppDeps in server.ts did not have smartAccountService property
- **Fix:** Added smartAccountService to CreateAppDeps interface and forwarded to walletCrudRoutes
- **Verification:** TypeScript compiles, DI works in tests

---

**Total deviations:** 4 auto-fixed (0 blocking)
**Impact on plan:** All fixes are test infrastructure issues. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Test Results (13 tests)

### SmartAccountService unit tests (5 passed)
- createSmartAccount returns SmartAccountInfo with predicted address
- createSmartAccount uses custom entryPoint when provided
- createSmartAccount defaults to EntryPoint v0.7 when no entryPoint specified
- getDefaultEntryPoint returns v0.7 address constant
- createSmartAccount calls toSoladySmartAccount with correct parameters

### Smart Account Wallet Creation integration tests (8 passed)
- POST /wallets without accountType creates EOA wallet (default)
- POST /wallets with accountType eoa creates standard EOA wallet
- POST /wallets with accountType smart when disabled returns 400
- POST /wallets with accountType smart on Solana returns 400
- POST /wallets with accountType smart without bundler_url returns 400
- DB migration v38 preserves existing EOA wallets with defaults
- GET /wallets includes accountType, signerKey, deployed in response
- GET /wallets/:id includes accountType, signerKey, deployed in response

---
*Phase: 314-smart-account-service-db-settings*
*Completed: 2026-03-04*
