---
phase: 431-ssot-cleanup
plan: 02
subsystem: infra
tags: [ssot, staking, sweepAll, gas-condition, encapsulation, cleanup]

requires:
  - phase: 431-ssot-cleanup
    provides: chain-constants SSoT
provides:
  - aggregateStakingBalance shared utility
  - sweepAll optional interface
  - stageGasCondition consistent naming
  - hintedTokens encapsulated API
affects: [staking routes, admin-wallets, pipeline stages, IChainAdapter]

tech-stack:
  added: []
  patterns: [shared service extraction, optional interface methods, encapsulated module state]

key-files:
  created:
    - packages/daemon/src/services/staking/aggregate-staking-balance.ts
  modified:
    - packages/core/src/interfaces/IChainAdapter.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/pipeline/pipeline.ts

key-decisions:
  - "sweepAll made optional (?) in IChainAdapter instead of removing from interface entirely"
  - "stageGasCondition: no deprecated re-export since it is internal API"
  - "hintedTokens encapsulated via clearHintedTokens/hasHintedToken helpers for test access"
  - "CLN-01 confirmed: evm_default_network has 0 source references (phantom setting)"

patterns-established:
  - "Optional interface methods: use IChainAdapter.method?() for unimplemented features"
  - "Module encapsulation: export helper functions instead of raw mutable state"

requirements-completed: [SSOT-03, SSOT-04, CLN-01, CLN-03, CLN-05, CLN-06]

duration: 12min
completed: 2026-03-16
---

# Phase 431 Plan 02: formatDisplayCurrency sync + aggregateStakingBalance extraction + cleanup Summary

**Shared staking aggregation utility, optional sweepAll interface, stageGasCondition rename, hintedTokens encapsulation**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-16T06:59:00Z
- **Completed:** 2026-03-16T07:11:00Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments
- aggregateStakingBalance extracted to shared module, removing 60-line inline copy in admin-wallets.ts
- IChainAdapter.sweepAll made optional, stubs removed from EVM/Solana adapters
- stage3_5GasCondition renamed to stageGasCondition across 15+ files
- hintedTokens encapsulated behind clearHintedTokens/hasHintedToken helpers

## Task Commits

1. **Task 1: formatDisplayCurrency + aggregateStakingBalance SSoT** - `7b3c9c70` (refactor)
2. **Task 2: sweepAll + stage naming + hintedTokens + CLN-01** - `f48d8a6c` (refactor)

## Files Created/Modified
- `packages/daemon/src/services/staking/aggregate-staking-balance.ts` - Shared staking balance aggregation
- `packages/admin/src/utils/display-currency.ts` - Added SYNC comment to canonical source
- `packages/core/src/interfaces/IChainAdapter.ts` - sweepAll optional
- `packages/adapters/evm/src/adapter.ts` - Removed sweepAll stub + updated docs
- `packages/adapters/solana/src/adapter.ts` - Removed sweepAll stub + updated docs
- Pipeline files (stages.ts, pipeline.ts, gas-condition-tracker.ts) - stageGasCondition rename
- 6 test files updated for renamed/encapsulated APIs

## Decisions Made
- sweepAll kept in interface as optional (?) to preserve the contract for future implementations
- Admin display-currency.ts stays inline due to CSP restrictions, with SYNC comment for manual verification

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Unused SweepResult import in adapter files**
- **Found during:** Task 2 (sweepAll stub removal)
- **Issue:** After removing sweepAll, SweepResult import became unused causing TS6196 error
- **Fix:** Removed unused SweepResult imports from both adapter files
- **Committed in:** f48d8a6c

**2. [Rule 3 - Blocking] EVM adapter test referenced removed sweepAll**
- **Found during:** Task 2
- **Issue:** evm-adapter.test.ts had sweepAll tests and method list entry
- **Fix:** Removed sweepAll from test method list and deleted sweepAll test cases
- **Committed in:** f48d8a6c

---

**Total deviations:** 2 auto-fixed (blocking, cascading from planned removal)
**Impact on plan:** Expected cascading cleanup from interface change. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All cleanup complete, ready for Plan 03 (settings audit + SSoT tests)

---
*Phase: 431-ssot-cleanup*
*Completed: 2026-03-16*
