---
phase: 233-db-migration-schema-policy
plan: 02
subsystem: schema
tags: [caip-19, zod, superRefine, cross-validation, pipeline, transaction-schema]

# Dependency graph
requires:
  - phase: 231-caip-module
    provides: "Caip19Schema and parseCaip19 for CAIP-19 validation"
  - phase: 233-db-migration-schema-policy
    provides: "233-01 DB v22 migration with assetId column"
provides:
  - "TokenInfoSchema with optional assetId and superRefine cross-validation"
  - "TransactionParam.assetId field for policy engine consumption"
  - "buildTransactionParam assetId extraction for TOKEN_TRANSFER, APPROVE, BATCH"
affects: [233-03-PLAN, policy-engine, oracle-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["superRefine cross-validation for multi-field consistency in Zod schemas"]

key-files:
  created: []
  modified:
    - "packages/core/src/schemas/transaction.schema.ts"
    - "packages/daemon/src/pipeline/stages.ts"

key-decisions:
  - "Case-insensitive address comparison in cross-validation for EVM checksummed vs lowercased addresses"
  - "APPROVE case now includes tokenAddress in TransactionParam (was missing before -- Rule 1 auto-fix)"

patterns-established:
  - "superRefine for cross-field validation: base schema + .superRefine() pattern for multi-field consistency"

requirements-completed: [TXSC-01, TXSC-02, TXSC-03]

# Metrics
duration: 3min
completed: 2026-02-22
---

# Phase 233 Plan 02: Schema + Pipeline Summary

**TokenInfoSchema extended with optional CAIP-19 assetId, superRefine cross-validation, and pipeline TransactionParam propagation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-22T04:37:11Z
- **Completed:** 2026-02-22T04:40:01Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- TokenInfoSchema accepts optional assetId field (Caip19Schema.optional()) with superRefine cross-validation
- TransactionParam carries assetId through the pipeline for TOKEN_TRANSFER, APPROVE, and BATCH types
- Backward compatible: existing requests without assetId pass through unchanged (443 core + 96 pipeline tests pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: TokenInfoSchema assetId extension with cross-validation** - `7ce22894` (feat)
2. **Task 2: TransactionParam assetId field + buildTransactionParam extraction** - `bab67424` (feat)

## Files Created/Modified
- `packages/core/src/schemas/transaction.schema.ts` - Added Caip19Schema import, TokenInfoBaseSchema with optional assetId, superRefine cross-validation
- `packages/daemon/src/pipeline/stages.ts` - Added assetId to TransactionParam interface, extraction in TOKEN_TRANSFER/APPROVE/BATCH cases

## Decisions Made
- Case-insensitive address comparison (toLowerCase on both sides) handles EVM checksummed vs CAIP-19 lowercased addresses; for Solana base58, identical casing on both sides means the comparison still works correctly
- APPROVE case in buildTransactionParam now includes tokenAddress (was missing before, added alongside assetId)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] APPROVE case missing tokenAddress in buildTransactionParam**
- **Found during:** Task 2 (TransactionParam extraction)
- **Issue:** The APPROVE case in buildTransactionParam was casting req as `{ spender: string; amount: string }` without extracting token.address, meaning tokenAddress was always undefined for APPROVE transactions
- **Fix:** Extended the cast to include `token: { address: string; assetId?: string }` and added tokenAddress to the returned object
- **Files modified:** packages/daemon/src/pipeline/stages.ts
- **Verification:** TypeScript typecheck passes, 96 pipeline tests pass
- **Committed in:** bab67424 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix was necessary for correct policy evaluation on APPROVE transactions. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TokenInfoSchema and TransactionParam now carry assetId, ready for policy engine CAIP-19 matching in 233-03
- All existing tests pass without modification (backward compatible)

## Self-Check: PASSED

- FOUND: packages/core/src/schemas/transaction.schema.ts
- FOUND: packages/daemon/src/pipeline/stages.ts
- FOUND: 233-02-SUMMARY.md
- FOUND: 7ce22894 (Task 1 commit)
- FOUND: bab67424 (Task 2 commit)

---
*Phase: 233-db-migration-schema-policy*
*Completed: 2026-02-22*
