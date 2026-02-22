---
phase: 225-chain-subscriber-implementations
plan: 01
subsystem: chain-adapter
tags: [solana, websocket, incoming-tx, subscriber, heartbeat, parser]

# Dependency graph
requires:
  - phase: 224-core-types-db-foundation
    provides: IChainSubscriber 6-method interface, IncomingTransaction type, IncomingTxStatus enum
provides:
  - SolanaIncomingSubscriber class implementing IChainSubscriber with WebSocket + polling modes
  - parseSOLTransfer and parseSPLTransfers pure parsing functions for incoming transfer detection
  - SolanaHeartbeat class for 60s getSlot() RPC keepalive with timer.unref()
  - SolanaTransactionResult type for Solana getTransaction jsonParsed response
affects: [225-evm-subscriber, 226-monitor-service, 228-rest-api]

# Tech tracking
tech-stack:
  added: []
  patterns: [IChainSubscriber implementation pattern (subscriber + parser separation), SolanaHeartbeat keepalive, vi.mock address() passthrough for subscriber tests]

key-files:
  created:
    - packages/adapters/solana/src/incoming-tx-parser.ts
    - packages/adapters/solana/src/solana-incoming-subscriber.ts
    - packages/adapters/solana/src/__tests__/solana-incoming-subscriber.test.ts
  modified:
    - packages/adapters/solana/src/index.ts

key-decisions:
  - "getTransaction called with encoding: 'jsonParsed' to get parsed transaction format needed by parser functions"
  - "address() mocked as passthrough in subscriber tests to avoid base58 validation on test addresses"
  - "generateId injected via constructor for testability -- crypto.randomUUID() default, UUID v7 injected by Phase 226"

patterns-established:
  - "Subscriber + parser separation: pure parsing functions in separate file, subscriber class uses them"
  - "address() passthrough mock pattern for subscriber tests that use non-real Solana addresses"

requirements-completed: [SUB-02, SUB-07]

# Metrics
duration: 7min
completed: 2026-02-22
---

# Phase 225 Plan 01: Solana Incoming Subscriber Summary

**SolanaIncomingSubscriber with WebSocket logsSubscribe + HTTP polling fallback, SOL/SPL/Token-2022 parsers, and SolanaHeartbeat 60s keepalive**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-21T15:25:18Z
- **Completed:** 2026-02-21T15:32:31Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- SolanaIncomingSubscriber implements all 6 IChainSubscriber methods (subscribe/unsubscribe/subscribedWallets/connect/waitForDisconnect/destroy) plus pollAll() for HTTP fallback
- parseSOLTransfer detects native SOL incoming transfers via preBalances/postBalances delta comparison with sender identification
- parseSPLTransfers detects SPL/Token-2022 incoming transfers via preTokenBalances/postTokenBalances with 0n default for first-time receipt
- SolanaHeartbeat sends getSlot() HTTP RPC ping every 60s with timer.unref() to prevent provider inactivity timeout
- 19 unit tests pass with mock RPC -- 5 parseSOL + 5 parseSPL + 6 subscriber + 3 heartbeat
- Barrel re-exports SolanaIncomingSubscriber, SolanaHeartbeat, parseSOLTransfer, parseSPLTransfers from @waiaas/adapter-solana

## Task Commits

Each task was committed atomically:

1. **Task 1: Create incoming-tx-parser.ts with SOL and SPL/Token-2022 parsing functions** - `953323f` (feat)
2. **Task 2: Create SolanaIncomingSubscriber class with SolanaHeartbeat, barrel export, and tests** - `4eb612d` (feat)

## Files Created/Modified
- `packages/adapters/solana/src/incoming-tx-parser.ts` - parseSOLTransfer and parseSPLTransfers pure functions with SolanaTransactionResult types (217 lines)
- `packages/adapters/solana/src/solana-incoming-subscriber.ts` - SolanaIncomingSubscriber class + SolanaHeartbeat class (344 lines)
- `packages/adapters/solana/src/__tests__/solana-incoming-subscriber.test.ts` - 19 unit tests with mock RPC (587 lines)
- `packages/adapters/solana/src/index.ts` - Barrel re-exports for subscriber, heartbeat, parsers, and types

## Decisions Made
- getTransaction called with `encoding: 'jsonParsed'` -- required by @solana/kit 6.0.1 TypeScript types, provides the parsed format needed by parser functions
- `address()` function from @solana/kit mocked as passthrough in subscriber tests to avoid base58 validation on synthetic test addresses, while keeping actual implementation in production code
- generateId function injected via constructor (dependency injection) rather than importing UUID v7 directly -- Phase 226 will provide the real UUID v7 generator

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added encoding: 'jsonParsed' to getTransaction calls**
- **Found during:** Task 2 (SolanaIncomingSubscriber class)
- **Issue:** @solana/kit 6.0.1 TypeScript types require explicit `encoding` parameter for getTransaction -- omitting it caused TS2769 "no overload matches" error
- **Fix:** Added `encoding: 'jsonParsed'` to both getTransaction calls (pollWallet and startWebSocketSubscription)
- **Files modified:** packages/adapters/solana/src/solana-incoming-subscriber.ts
- **Verification:** pnpm turbo run typecheck passes with 0 errors
- **Committed in:** 4eb612d (Task 2 commit)

**2. [Rule 1 - Bug] Added address() passthrough mock for subscriber tests**
- **Found during:** Task 2 (subscriber tests)
- **Issue:** pollAll() tests failed because `address()` from actual @solana/kit validated base58 format, rejecting synthetic test addresses, and the error was silently swallowed by per-wallet error isolation
- **Fix:** Added `address: vi.fn().mockImplementation((addr: string) => addr)` to vi.mock override
- **Files modified:** packages/adapters/solana/src/__tests__/solana-incoming-subscriber.test.ts
- **Verification:** All 19 tests pass
- **Committed in:** 4eb612d (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SolanaIncomingSubscriber is ready for integration by Phase 226 (IncomingTxMonitorService)
- pollAll() method is designed for BackgroundWorkers invocation pattern
- generateId constructor injection point ready for UUID v7 from daemon/database/id.ts
- Plan 225-02 (EvmIncomingSubscriber) can proceed independently
- Plan 225-03 (ConnectionStateMachine) can consume SolanaIncomingSubscriber

## Self-Check: PASSED

- All 3 created files verified on disk
- Both task commits (953323f, 4eb612d) verified in git log

---
*Phase: 225-chain-subscriber-implementations*
*Completed: 2026-02-22*
