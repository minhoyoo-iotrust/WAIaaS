---
phase: 236-policy-engine-token-tier
plan: 01
subsystem: pipeline
tags: [policy-engine, token-decimals, TransactionParam, spending-limit]

# Dependency graph
requires:
  - phase: 235-schema-zod-ssot
    provides: token_limits field in SpendingLimitRules + policy.schema.ts validation
provides:
  - tokenDecimals field in TransactionParam (3 locations synchronized)
  - buildTransactionParam passing token.decimals for TOKEN_TRANSFER and APPROVE
  - sign-only.ts TransactionParam fully synced with assetId field
affects: [236-02-PLAN, 236-03-PLAN, policy-engine, sign-only-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [TransactionParam 3-location sync pattern]

key-files:
  created: []
  modified:
    - packages/daemon/src/pipeline/database-policy-engine.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/pipeline/sign-only.ts

key-decisions:
  - "sign-only mapOperationToParam does not pass tokenDecimals -- ParsedOperation lacks decimals field, raw amount fallback is acceptable"
  - "assetId: undefined explicitly set in sign-only TOKEN_TRANSFER case for interface consistency"

patterns-established:
  - "TransactionParam 3-location sync: all field additions must be applied to database-policy-engine.ts, stages.ts, and sign-only.ts simultaneously"

requirements-completed: [ENGN-01, ENGN-02]

# Metrics
duration: 2min
completed: 2026-02-22
---

# Phase 236 Plan 01: TransactionParam tokenDecimals Summary

**tokenDecimals field added to all 3 TransactionParam interfaces + wired through buildTransactionParam for TOKEN_TRANSFER/APPROVE types**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-22T09:25:17Z
- **Completed:** 2026-02-22T09:27:10Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Added `tokenDecimals?: number` to TransactionParam in all 3 duplicate locations (database-policy-engine.ts, stages.ts, sign-only.ts)
- Wired `token.decimals` through buildTransactionParam for TOKEN_TRANSFER and APPROVE request types
- Synced sign-only.ts TransactionParam with missing `assetId` field for full interface parity
- Typecheck passes with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tokenDecimals to TransactionParam (3 locations) + buildTransactionParam** - `062ca6a3` (feat)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `packages/daemon/src/pipeline/database-policy-engine.ts` - Added tokenDecimals to TransactionParam interface
- `packages/daemon/src/pipeline/stages.ts` - Added tokenDecimals to TransactionParam + wired in buildTransactionParam
- `packages/daemon/src/pipeline/sign-only.ts` - Added tokenDecimals + assetId to TransactionParam, explicit assetId: undefined in mapOperationToParam

## Decisions Made
- sign-only mapOperationToParam does not pass tokenDecimals because ParsedOperation lacks a decimals field. When sign-only pipeline evaluates token_limits, it will rely on CAIP-19 key matching with raw amount fallback.
- Added `assetId: undefined` explicitly in mapOperationToParam TOKEN_TRANSFER case for interface consistency (was missing from prior milestones).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TransactionParam now carries tokenDecimals, ready for evaluateTokenTier consumption in plan 236-02
- All 3 interfaces are fully synchronized with identical field sets

## Self-Check: PASSED

- [x] database-policy-engine.ts: FOUND, tokenDecimals present
- [x] stages.ts: FOUND, tokenDecimals present + buildTransactionParam wired
- [x] sign-only.ts: FOUND, tokenDecimals + assetId present
- [x] SUMMARY.md: FOUND
- [x] Commit 062ca6a3: FOUND

---
*Phase: 236-policy-engine-token-tier*
*Completed: 2026-02-22*
