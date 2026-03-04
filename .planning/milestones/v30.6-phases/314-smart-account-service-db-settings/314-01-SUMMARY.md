---
phase: 314-smart-account-service-db-settings
plan: 01
subsystem: database, infra
tags: [erc-4337, smart-account, viem, drizzle, migration, zod]

requires:
  - phase: none
    provides: none
provides:
  - AccountType enum (eoa, smart) in @waiaas/core
  - WalletSchema and CreateWalletRequestSchema extended with smart account fields
  - Drizzle wallets table with account_type, signer_key, deployed, entry_point columns
  - DB migration v38 for existing databases
  - SmartAccountService class for CREATE2 address prediction
affects: [314-02, 314-03, smart-account-api, smart-account-pipeline]

tech-stack:
  added: [viem/account-abstraction toSoladySmartAccount, entryPoint07Abi]
  patterns: [SmartAccountService wraps viem for ERC-4337 CREATE2 prediction]

key-files:
  created:
    - packages/daemon/src/infrastructure/smart-account/smart-account-service.ts
    - packages/daemon/src/infrastructure/smart-account/index.ts
  modified:
    - packages/core/src/enums/wallet.ts
    - packages/core/src/enums/index.ts
    - packages/core/src/schemas/wallet.schema.ts
    - packages/core/src/index.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/database/migrate.ts

key-decisions:
  - "Used `any` for SmartAccountService.client type to avoid viem's complex generic constraints"
  - "EntryPoint v0.7 exclusively -- no v0.6 backward compat needed"
  - "Smart account columns use safe defaults: account_type='eoa', deployed=1 for backward compat"

patterns-established:
  - "SmartAccountService pattern: stateless service wrapping viem account-abstraction"
  - "ACCOUNT_TYPES SSoT: Zod -> Drizzle CHECK -> DDL CHECK constraint"

requirements-completed: [SA-02, SA-03, SA-04, SA-05]

duration: 12min
completed: 2026-03-04
---

# Plan 314-01 Summary

**AccountType enum, extended wallet schemas (Zod+Drizzle), DB migration v38, and SmartAccountService for CREATE2 address prediction**

## Performance

- **Duration:** 12 min
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added ACCOUNT_TYPES ('eoa', 'smart') enum to @waiaas/core with Zod enum
- Extended WalletSchema and CreateWalletRequestSchema with accountType, signerKey, deployed, entryPoint
- Extended Drizzle wallets table with 4 new columns and CHECK constraint
- Created DB migration v38 (ALTER TABLE ADD COLUMN x4)
- Implemented SmartAccountService wrapping viem's toSoladySmartAccount with entryPoint07Abi

## Task Commits

1. **Task 1: Add AccountType enum and extend wallet schemas** - `fa873e37` (feat)
2. **Task 2: Extend Drizzle schema, DB migration v38, SmartAccountService** - `5db4991d` (feat)

## Files Created/Modified
- `packages/core/src/enums/wallet.ts` - Added ACCOUNT_TYPES, AccountType, AccountTypeEnum
- `packages/core/src/enums/index.ts` - Re-exports for new enum
- `packages/core/src/schemas/wallet.schema.ts` - Extended WalletSchema and CreateWalletRequestSchema
- `packages/core/src/index.ts` - Package-level exports
- `packages/daemon/src/infrastructure/database/schema.ts` - Drizzle columns + CHECK constraint
- `packages/daemon/src/infrastructure/database/migrate.ts` - v38 migration + DDL update
- `packages/daemon/src/infrastructure/smart-account/smart-account-service.ts` - SmartAccountService class
- `packages/daemon/src/infrastructure/smart-account/index.ts` - Barrel export

## Decisions Made
- Used `any` for client type in SmartAccountService to avoid viem's deeply nested generic type incompatibilities (runtime behavior is correct)
- Added entryPoint07Abi to the entryPoint parameter (required by viem's toSoladySmartAccount signature)
- LATEST_SCHEMA_VERSION bumped from 37 to 38

## Deviations from Plan

### Auto-fixed Issues

**1. viem type compatibility -- SmartAccountService client parameter**
- **Found during:** Task 2 (SmartAccountService creation)
- **Issue:** viem's `toSoladySmartAccount` expects `SoladySmartAccountImplementation['client']` which is a deeply nested generic type incompatible with `Client<Transport, Chain>`
- **Fix:** Used `any` type for client parameter to maintain runtime correctness while avoiding type gymnastics
- **Verification:** TypeScript compiles, runtime behavior unchanged

**2. entryPoint parameter requires abi field**
- **Found during:** Task 2 (SmartAccountService creation)
- **Issue:** `toSoladySmartAccount` requires `{abi, address, version}` not just `{address, version}`
- **Fix:** Imported and used `entryPoint07Abi` from viem/account-abstraction
- **Verification:** TypeScript compiles without errors

---

**Total deviations:** 2 auto-fixed (2 blocking type errors)
**Impact on plan:** Both fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SmartAccountService ready for integration in wallet creation API (Plan 314-03)
- DB schema and migration ready for smart account wallet storage
- Core types exported and available for REST API schemas

---
*Phase: 314-smart-account-service-db-settings*
*Completed: 2026-03-04*
