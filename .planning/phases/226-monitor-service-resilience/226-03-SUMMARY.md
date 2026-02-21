---
phase: 226-monitor-service-resilience
plan: 03
subsystem: database, services
tags: [background-workers, confirmation, retention, cursor, gap-recovery, sqlite]

# Dependency graph
requires:
  - phase: 224-core-types-db-foundation
    provides: "incoming_transactions + incoming_tx_cursors tables, IncomingTxStatus enum"
  - phase: 226-monitor-service-resilience/226-01
    provides: "IncomingTxQueue batch flush pattern"
provides:
  - "createConfirmationWorkerHandler: DETECTED -> CONFIRMED for Solana (finalized) and EVM (block threshold)"
  - "createRetentionWorkerHandler: auto-delete records older than configurable retention_days"
  - "createGapRecoveryHandler: call pollAll() on subscriber after WebSocket reconnection"
  - "updateCursor/loadCursor: read/write incoming_tx_cursors for processing position tracking"
  - "EVM_CONFIRMATION_THRESHOLDS: chain-specific block confirmation thresholds"
affects: [226-04, 227, 229]

# Tech tracking
tech-stack:
  added: []
  patterns: ["handler factory pattern for BackgroundWorkers.register()", "block number caching per network to avoid redundant RPC", "INSERT OR REPLACE for cursor upsert"]

key-files:
  created:
    - packages/daemon/src/services/incoming/incoming-tx-workers.ts
    - packages/daemon/src/services/incoming/__tests__/incoming-tx-workers.test.ts
  modified:
    - packages/daemon/src/services/incoming/index.ts

key-decisions:
  - "Confirmation worker uses block number cache per chain:network to avoid redundant RPC calls within a single cycle"
  - "Cursor table uses wallet_id as PK with last_signature (Solana) / last_block_number (EVM) dual fields -- chain-agnostic cursor via string return from loadCursor"
  - "Retention worker uses raw SQL DELETE for efficiency (not Drizzle ORM) since it is a simple bulk delete"

patterns-established:
  - "Handler factory pattern: createXxxWorkerHandler(deps) returns async () => void for BackgroundWorkers.register()"
  - "Per-record error isolation: try/catch inside confirmation loop prevents one tx failure from blocking others"

requirements-completed: [STO-03, STO-05]

# Metrics
duration: 5min
completed: 2026-02-22
---

# Phase 226 Plan 03: Gap Recovery + Confirmation Upgrade + Retention Workers Summary

**Worker handler factories for incoming TX lifecycle: confirmation upgrade (Solana finalized + EVM block threshold), retention auto-delete, gap recovery via pollAll(), and cursor read/write utilities**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-21T16:12:29Z
- **Completed:** 2026-02-21T16:17:18Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Confirmation worker upgrades DETECTED -> CONFIRMED using Solana finalized commitment check and EVM block threshold comparison (12 mainnet, 128 polygon, 1 testnets)
- Retention worker deletes incoming_transactions older than configurable retention_days with hot-reload support
- Gap recovery handler delegates to subscriber.pollAll() on reconnection for blind gap filling
- Cursor utilities (updateCursor/loadCursor) manage incoming_tx_cursors for Solana signatures and EVM block numbers
- 28 comprehensive tests covering all workers, cursor operations, and edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Create worker handler factories + cursor utilities** - `710df0d2` (feat)
2. **Task 2: Write tests for worker handlers and cursor utilities** - `0028043d` (test)

## Files Created/Modified
- `packages/daemon/src/services/incoming/incoming-tx-workers.ts` - Worker handler factories (confirmation, retention, gap recovery) and cursor utilities (updateCursor, loadCursor)
- `packages/daemon/src/services/incoming/__tests__/incoming-tx-workers.test.ts` - 28 tests covering all worker handlers and cursor operations
- `packages/daemon/src/services/incoming/index.ts` - Re-exports for all new functions and constants

## Decisions Made
- Block number cache per chain:network in confirmation worker to avoid redundant RPC calls when multiple txs share the same network
- Cursor stored as dual fields (last_signature for Solana, last_block_number for EVM) with loadCursor returning whichever is populated as a string
- Raw SQL DELETE in retention worker (not Drizzle ORM) for simple bulk delete efficiency
- Per-record error isolation in confirmation worker: console.warn and continue on individual tx failure

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused generateId import**
- **Found during:** Task 1 (worker handler factories)
- **Issue:** Plan template included `import { generateId }` but workers don't generate IDs (they update existing records)
- **Fix:** Removed the unused import to pass typecheck
- **Files modified:** packages/daemon/src/services/incoming/incoming-tx-workers.ts
- **Verification:** `pnpm turbo run typecheck --filter=@waiaas/daemon` passes
- **Committed in:** 710df0d2 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial unused import removal. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All worker handler factories ready for 226-04 IncomingTxMonitorService orchestrator to register with BackgroundWorkers
- Cursor utilities ready for gap recovery integration in SubscriptionMultiplexer reconnection flow
- EVM_CONFIRMATION_THRESHOLDS ready for configuration override in Phase 227

---
*Phase: 226-monitor-service-resilience*
*Completed: 2026-02-22*
