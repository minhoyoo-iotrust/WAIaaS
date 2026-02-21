---
phase: 226-monitor-service-resilience
plan: 02
subsystem: infra
tags: [websocket, multiplexer, reconnection, connection-sharing, IChainSubscriber]

# Dependency graph
requires:
  - phase: 225-chain-subscriber-implementations
    provides: IChainSubscriber interface, reconnectLoop/ConnectionState, SolanaIncomingSubscriber, EvmIncomingSubscriber
  - phase: 226-monitor-service-resilience/01
    provides: IncomingTxQueue, incoming services directory structure
provides:
  - SubscriptionMultiplexer class with addWallet/removeWallet/getConnectionState/getActiveConnections/stopAll
  - MultiplexerDeps interface for dependency injection
  - Connection sharing per chain:network key
  - Gap recovery callback wiring for post-reconnect
affects: [226-03-gap-recovery, 226-04-orchestrator, incoming-tx-monitor-service]

# Tech tracking
tech-stack:
  added: []
  patterns: [connection-multiplexing-per-chain-network, fire-and-forget-reconnect-loop, abort-controller-lifecycle]

key-files:
  created:
    - packages/daemon/src/services/incoming/subscription-multiplexer.ts
    - packages/daemon/src/services/incoming/__tests__/subscription-multiplexer.test.ts
  modified:
    - packages/daemon/src/services/incoming/index.ts

key-decisions:
  - "IChainSubscriber.subscribe() takes 4 params (walletId, address, network, onTransaction) -- plan showed 3 params, corrected to match actual interface"
  - "reconnectLoop starts after initial waitForDisconnect resolves -- avoids double-connect on addWallet"
  - "State change guard checks entry identity before updating -- prevents stale updates after removeWallet"

patterns-established:
  - "Connection multiplexing: Map<chain:network, ConnectionEntry> shares single subscriber per chain:network pair"
  - "Fire-and-forget reconnect: void async IIFE wraps reconnectLoop after initial connection"
  - "AbortController lifecycle: each connection entry owns AbortController, aborted on removeWallet/stopAll"

requirements-completed: [SUB-05, SUB-06]

# Metrics
duration: 4min
completed: 2026-02-22
---

# Phase 226 Plan 02: SubscriptionMultiplexer Summary

**Connection-sharing multiplexer that manages one IChainSubscriber per chain:network key with reconnectLoop integration and gap recovery callback**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-21T16:04:44Z
- **Completed:** 2026-02-21T16:09:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- SubscriptionMultiplexer shares single WebSocket connection per chain:network pair, verified by subscriberFactory call count
- addWallet reuses existing connections; removeWallet destroys connection when last wallet unsubscribes
- reconnectLoop from @waiaas/core drives state transitions with gap recovery callback on reconnect
- 19 comprehensive tests covering sharing, separate networks, cleanup, state tracking, stopAll, edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SubscriptionMultiplexer with connection sharing + reconnection** - `d060c41` (feat)
2. **Task 2: Write comprehensive tests for SubscriptionMultiplexer** - `0b40ec3` (test)

## Files Created/Modified
- `packages/daemon/src/services/incoming/subscription-multiplexer.ts` - SubscriptionMultiplexer class with 5 public methods + MultiplexerDeps interface
- `packages/daemon/src/services/incoming/__tests__/subscription-multiplexer.test.ts` - 19 test cases with mock IChainSubscriber factory
- `packages/daemon/src/services/incoming/index.ts` - Added SubscriptionMultiplexer + MultiplexerDeps re-exports

## Decisions Made
- IChainSubscriber.subscribe() takes 4 params (walletId, address, network, onTransaction) -- plan's pseudo-code showed 3 params; corrected to match actual interface signature
- reconnectLoop starts after initial waitForDisconnect resolves to avoid double-connecting on addWallet
- State change callback guards against stale entry references (checks `this.connections.get(key) !== entry`) to prevent updates after removeWallet removes the connection

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected subscribe() call signature from 3 to 4 parameters**
- **Found during:** Task 1 (SubscriptionMultiplexer implementation)
- **Issue:** Plan showed `entry.subscriber.subscribe(walletId, walletAddress, deps.onTransaction)` but actual IChainSubscriber.subscribe() takes 4 params including `network`
- **Fix:** Changed to `entry.subscriber.subscribe(walletId, walletAddress, network, deps.onTransaction)`
- **Files modified:** packages/daemon/src/services/incoming/subscription-multiplexer.ts
- **Verification:** TypeScript typecheck passes
- **Committed in:** d060c41 (Task 1 commit)

**2. [Rule 1 - Bug] Removed unused makeTx helper and IncomingTransaction import from test file**
- **Found during:** Task 2 (test implementation)
- **Issue:** Lint error -- `makeTx` defined but never used, `IncomingTransaction` imported but unused
- **Fix:** Removed unused helper function and import
- **Files modified:** packages/daemon/src/services/incoming/__tests__/subscription-multiplexer.test.ts
- **Verification:** Lint passes with 0 errors
- **Committed in:** 0b40ec3 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bug fixes)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SubscriptionMultiplexer ready for IncomingTxMonitorService orchestrator (226-04) integration
- Gap recovery callback wiring ready for 226-03 (gap recovery + confirmation upgrade worker)
- Connection sharing pattern established for coordinating Solana WS and EVM polling subscribers

## Self-Check: PASSED

- FOUND: packages/daemon/src/services/incoming/subscription-multiplexer.ts
- FOUND: packages/daemon/src/services/incoming/__tests__/subscription-multiplexer.test.ts
- FOUND: packages/daemon/src/services/incoming/index.ts
- FOUND: commit d060c41
- FOUND: commit 0b40ec3

---
*Phase: 226-monitor-service-resilience*
*Completed: 2026-02-22*
