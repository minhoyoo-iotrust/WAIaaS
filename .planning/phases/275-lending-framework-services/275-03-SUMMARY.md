---
phase: 275-lending-framework-services
plan: 03
subsystem: defi
tags: [lending-policy, ltv-limit, asset-whitelist, non-spending, action-name, db-migration]

requires:
  - phase: 275-lending-framework-services
    provides: defi_positions table, POLICY_TYPES SSoT
provides:
  - LENDING_ASSET_WHITELIST default-deny policy (Step 4h)
  - LENDING_LTV_LIMIT projected LTV borrow restriction (Step 4h-b)
  - Non-spending classification for supply/repay/withdraw (Step 5)
  - ContractCallRequestSchema.actionName field
  - ActionProviderRegistry auto-tag actionName
  - DB migration v26 (policies CHECK constraint update)
affects: [276-aave-v3-provider, 278-admin-settings]

tech-stack:
  added: []
  patterns: [default-deny-policy, projected-ltv-calculation, non-spending-action-classification]

key-files:
  created:
    - packages/daemon/src/__tests__/lending-policy-evaluator.test.ts
  modified:
    - packages/core/src/schemas/transaction.schema.ts
    - packages/core/src/enums/policy.ts
    - packages/core/src/__tests__/enums.test.ts
    - packages/daemon/src/infrastructure/action/action-provider-registry.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/pipeline/database-policy-engine.ts
    - packages/daemon/src/__tests__/migration-runner.test.ts
    - packages/daemon/src/__tests__/migration-chain.test.ts
    - packages/daemon/src/__tests__/schema-compatibility.test.ts
    - packages/daemon/src/__tests__/signing-sdk-migration.test.ts
    - packages/daemon/src/__tests__/settings-schema-migration.test.ts
    - packages/daemon/src/__tests__/migration-v14.test.ts
    - packages/daemon/src/__tests__/migration-v6-v8.test.ts

key-decisions:
  - "CONTRACT_WHITELIST bypass via default_deny_contracts=false toggle for tests (production uses provider-trust)"
  - "Non-spending Set declared inside method (not module-level) to avoid closure issues"
  - "LTV evaluation reads defi_positions via raw SQL (not Drizzle) for consistency with evaluateAndReserve pattern"

patterns-established:
  - "Lending policy evaluation chain: LENDING_ASSET_WHITELIST (4h) -> LENDING_LTV_LIMIT (4h-b) -> non-spending (5)"
  - "Projected LTV = (currentDebtUsd + newBorrowUsd) / totalCollateralUsd"

requirements-completed: [LEND-07, LEND-08, LEND-09]

duration: 15min
completed: 2026-02-27
---

# Plan 275-03: LendingPolicyEvaluator Summary

**ContractCallRequestSchema.actionName extension + LENDING_ASSET_WHITELIST/LENDING_LTV_LIMIT policy evaluation + non-spending classification for supply/repay/withdraw**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files created:** 1
- **Files modified:** 13

## Accomplishments
- ContractCallRequestSchema has actionName: z.string().optional() field
- POLICY_TYPES has 14 entries (was 12) including LENDING_LTV_LIMIT and LENDING_ASSET_WHITELIST
- ActionProviderRegistry auto-tags parsed.actionName from entry.action.name
- DB migration v26 recreates policies table with updated CHECK constraint (12-step pattern)
- LATEST_SCHEMA_VERSION bumped to 26
- DatabasePolicyEngine Step 4h: LENDING_ASSET_WHITELIST default-deny for lending actions
- DatabasePolicyEngine Step 4h-b: LENDING_LTV_LIMIT with projected LTV using usdAmount from IPriceOracle
- Step 5 non-spending: supply/repay/withdraw skip SPENDING_LIMIT (borrow remains spending)
- Steps added to both evaluate() and evaluateAndReserve() methods
- LENDING_ASSET_WHITELIST check added to evaluateInstructionPolicies() for batch
- 18 unit tests all passing (6 asset whitelist + 8 LTV limit + 4 non-spending)
- 7 existing test files updated for schema version 25->26 (155 tests passing)

## Task Commits

1. **Task 1: Schema extension + ActionProviderRegistry + DB migration v26** - `e7166b30` (feat)
2. **Task 2: DatabasePolicyEngine lending evaluation + 18 unit tests** - `2bd8f15d` (feat)

## Decisions Made
- Used `policy.default_deny_contracts=false` SettingsService toggle in tests instead of provider-trust bypass (simpler test setup, same contract whitelist bypass behavior)
- NON_SPENDING_ACTIONS Set declared inside evaluateAndReserve closure as separate variable (NON_SPENDING_ACTIONS_R) to avoid name collision

## Deviations from Plan
- Added `tier: 'INSTANT'` to all deny PolicyEvaluation returns (required by interface)
- Updated 7 existing migration test files for LATEST_SCHEMA_VERSION 25->26 (not in plan)
- Updated migration-runner test versions from 26+ to 27+ to avoid conflict with real v26 migration

## Issues Encountered
- PolicyEvaluation interface requires `tier` field even on denials (TypeScript compile error fixed)
- SettingsService throws for unregistered keys (cannot set `actions.aave-v3_enabled` directly)
- transactions table has no `from_address` or `updated_at` columns (fixed SQL INSERT in tests)

## User Setup Required
None.

## Next Phase Readiness
- LENDING_ASSET_WHITELIST and LENDING_LTV_LIMIT ready for Admin UI policy forms (Phase 278)
- actionName auto-tag ready for AaveV3Provider resolve() output (Phase 276)
- Projected LTV uses defi_positions cache (ready for PositionTracker sync from Phase 276)

---
*Phase: 275-lending-framework-services*
*Completed: 2026-02-27*
