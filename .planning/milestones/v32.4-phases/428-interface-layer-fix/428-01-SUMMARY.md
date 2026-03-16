---
phase: 428-interface-layer-fix
plan: 01
subsystem: core
tags: [typescript, interfaces, incoming-tx, type-safety]

requires:
  - phase: 427
    provides: "@waiaas/core exports and utilities"
provides:
  - "IChainSubscriber interface with 9 methods (6 base + 3 optional polling/confirmation)"
  - "Type-safe incoming TX monitor pipeline without as unknown as casts"
  - "IChainSubscriber contract tests for optional methods"
affects: [incoming-tx-monitor, evm-adapter, solana-adapter, gap-recovery]

tech-stack:
  added: []
  patterns: ["optional interface methods for chain-specific capabilities", "optional chaining for safe method dispatch"]

key-files:
  created: []
  modified:
    - packages/core/src/interfaces/IChainSubscriber.ts
    - packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts
    - packages/daemon/src/services/incoming/subscription-multiplexer.ts
    - packages/daemon/src/services/incoming/incoming-tx-workers.ts
    - packages/daemon/src/services/incoming/__tests__/integration-wiring.test.ts

key-decisions:
  - "pollAll, checkFinalized, getBlockNumber declared as optional methods (not all subscribers implement all)"
  - "Optional chaining (subscriber.pollAll?.()) used for safe dispatch instead of type casting"
  - "GapRecoveryDeps updated to accept optional pollAll matching IChainSubscriber"

patterns-established:
  - "Optional interface methods: chain-specific capabilities declared as optional on shared interface"

requirements-completed: [LAYER-01, LAYER-02, LAYER-03, LAYER-10]

duration: 8min
completed: 2026-03-16
---

# Phase 428 Plan 01: IChainSubscriber Interface Extension Summary

**IChainSubscriber extended with pollAll/checkFinalized/getBlockNumber optional methods, removing 5 as unknown as casts from incoming TX pipeline**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T05:24:25Z
- **Completed:** 2026-03-16T05:32:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Extended IChainSubscriber interface with 3 optional methods (pollAll, checkFinalized, getBlockNumber)
- Removed 4 as unknown as casts from incoming-tx-monitor-service.ts
- Removed 1 as unknown as cast from subscription-multiplexer.ts getSubscriberEntries()
- Added 4 contract tests verifying optional method behavior including minimal subscriber scenario

## Task Commits

Each task was committed atomically:

1. **Task 1: IChainSubscriber interface extension** - `7c6f053d` (feat)
2. **Task 2: as unknown as casting removal + contract tests** - `e7b468db` (fix)

## Files Created/Modified
- `packages/core/src/interfaces/IChainSubscriber.ts` - Added 3 optional methods with JSDoc
- `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` - Replaced 4 type casts with optional chaining
- `packages/daemon/src/services/incoming/subscription-multiplexer.ts` - Changed getSubscriberEntries return type to IChainSubscriber
- `packages/daemon/src/services/incoming/incoming-tx-workers.ts` - Updated GapRecoveryDeps to accept optional pollAll
- `packages/daemon/src/services/incoming/__tests__/integration-wiring.test.ts` - Added 4 contract tests, enriched mock subscribers

## Decisions Made
- Used optional methods (pollAll?()) instead of a separate extended interface to keep the type hierarchy flat
- Used optional chaining (subscriber.pollAll?.()) for dispatch, returning undefined when method not present
- Updated GapRecoveryDeps inline to match new optional signature rather than creating a separate adapter

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated GapRecoveryDeps type in incoming-tx-workers.ts**
- **Found during:** Task 2 (casting removal)
- **Issue:** GapRecoveryDeps expected non-optional pollAll, but IChainSubscriber now declares it as optional
- **Fix:** Changed GapRecoveryDeps.subscribers type to accept optional pollAll, updated call site to use optional chaining
- **Files modified:** packages/daemon/src/services/incoming/incoming-tx-workers.ts
- **Verification:** typecheck passes, gap recovery tests pass
- **Committed in:** e7b468db (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary type alignment for consistency. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- IChainSubscriber interface fully reflects implementation, ready for Plan 02 (layer violation fixes)
- All 11 integration tests pass

---
*Phase: 428-interface-layer-fix*
*Completed: 2026-03-16*
