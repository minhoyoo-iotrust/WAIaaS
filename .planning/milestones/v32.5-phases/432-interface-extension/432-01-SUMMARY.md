---
phase: 432-interface-extension
plan: 01
subsystem: api
tags: [typescript, interfaces, defi, position-provider]

requires:
  - phase: none
    provides: first phase in milestone
provides:
  - PositionQueryContext type with 5 fields (walletId, chain, networks, environment, rpcUrls)
  - Updated IPositionProvider.getPositions(ctx) signature
  - PositionTracker context construction from wallet metadata
affects: [432-02, 433-multichain-positions]

tech-stack:
  added: []
  patterns: [PositionQueryContext context-object pattern for position providers]

key-files:
  created: []
  modified:
    - packages/core/src/interfaces/position-provider.types.ts
    - packages/core/src/interfaces/index.ts
    - packages/daemon/src/services/defi/position-tracker.ts
    - packages/daemon/src/__tests__/position-tracker.test.ts

key-decisions:
  - "PositionQueryContext uses readonly NetworkType[] for immutability"
  - "rpcUrls is Record<string,string> mapping network->url, populated from rpcConfig via resolveRpcUrl"
  - "PositionTracker constructor accepts optional rpcConfig for URL resolution"

patterns-established:
  - "Context-object pattern: providers receive PositionQueryContext instead of bare walletId"
  - "Chain guard pattern: providers check ctx.chain and return [] for unsupported chains"

requirements-completed: [INTF-01, INTF-02, INTF-03]

duration: 8min
completed: 2026-03-16
---

# Phase 432 Plan 01: PositionQueryContext + IPositionProvider Signature Extension Summary

**PositionQueryContext type with 5 fields for multi-chain provider context, IPositionProvider.getPositions(ctx) signature, and PositionTracker automatic context construction from wallet metadata**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T12:53:03Z
- **Completed:** 2026-03-16T13:01:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Defined PositionQueryContext interface with walletId, chain, networks, environment, rpcUrls fields
- Changed IPositionProvider.getPositions signature from (walletId: string) to (ctx: PositionQueryContext)
- Updated PositionTracker.syncCategory() to query wallet chain/environment and build context automatically
- Added 3 new tests verifying context construction for ethereum/solana wallets and rpcUrls mapping

## Task Commits

Each task was committed atomically:

1. **Task 1: PositionQueryContext type + IPositionProvider signature** - `80875dc0` (feat)
2. **Task 2: PositionTracker context construction + tests** - `425dd149` (feat)

## Files Created/Modified
- `packages/core/src/interfaces/position-provider.types.ts` - Added PositionQueryContext interface, updated IPositionProvider.getPositions signature
- `packages/core/src/interfaces/index.ts` - Re-export PositionQueryContext
- `packages/daemon/src/services/defi/position-tracker.ts` - Build PositionQueryContext from wallet metadata in syncCategory()
- `packages/daemon/src/__tests__/position-tracker.test.ts` - Updated mock providers to use ctx, added 3 context construction tests

## Decisions Made
- PositionQueryContext uses readonly NetworkType[] for immutability safety
- rpcUrls populated from rpcConfig via resolveRpcUrl, empty object when no config provided
- PositionTracker constructor takes optional rpcConfig parameter (backward compatible)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PositionQueryContext type and IPositionProvider signature ready for provider migration
- All 8 providers will get compile errors until migrated in Plan 02
- 30 tests passing in position-tracker.test.ts

---
*Phase: 432-interface-extension*
*Completed: 2026-03-16*
