---
phase: 225-chain-subscriber-implementations
plan: 02
subsystem: chain
tags: [evm, viem, polling, getLogs, getBlock, incoming-tx, IChainSubscriber]

# Dependency graph
requires:
  - phase: 224-core-types-db-foundation
    provides: IChainSubscriber interface, IncomingTransaction type, IncomingTxStatus enum
provides:
  - EvmIncomingSubscriber class implementing IChainSubscriber 6-method interface + pollAll()
  - ERC-20 Transfer event detection via getLogs with parseAbiItem filter
  - Native ETH transfer detection via getBlock(includeTransactions:true) scanning
  - Barrel re-export from @waiaas/adapter-evm
affects: [226-monitor-service, 227-api-endpoints]

# Tech tracking
tech-stack:
  added: []
  patterns: [EVM polling-first subscriber, parseAbiItem event filtering, getBlock native ETH scanning]

key-files:
  created:
    - packages/adapters/evm/src/evm-incoming-subscriber.ts
    - packages/adapters/evm/src/__tests__/evm-incoming-subscriber.test.ts
  modified:
    - packages/adapters/evm/src/index.ts

key-decisions:
  - "EVM polling-first strategy (D-06): connect() no-op, waitForDisconnect() never-resolving Promise"
  - "10-block cap per poll cycle (MAX_BLOCK_RANGE = 10n) to stay within RPC provider limits"
  - "Per-wallet error isolation in pollAll() -- console.warn on failure, continue polling other wallets"

patterns-established:
  - "EVM subscriber mock pattern: vi.mock('viem') with mockClient.getLogs/getBlock/getBlockNumber"
  - "pollAll() as external-invocation pattern: subscriber is passive, BackgroundWorkers call pollAll()"

requirements-completed: [SUB-03]

# Metrics
duration: 4min
completed: 2026-02-22
---

# Phase 225 Plan 02: EvmIncomingSubscriber Summary

**EVM incoming transaction subscriber with ERC-20 Transfer event detection via getLogs and native ETH scanning via getBlock, using polling-first strategy with 10-block cap**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-21T15:25:21Z
- **Completed:** 2026-02-21T15:29:35Z
- **Tasks:** 2
- **Files created/modified:** 3

## Accomplishments
- EvmIncomingSubscriber implements all 6 IChainSubscriber methods + pollAll()
- ERC-20 Transfer detection via getLogs with parseAbiItem event filtering
- Native ETH detection via getBlock(includeTransactions:true) with typeof guards and case-insensitive matching
- 10-block cap per poll cycle prevents RPC provider limits
- Per-wallet error isolation ensures one failure does not affect others
- 21 tests pass with mock viem client (no real network calls)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create EvmIncomingSubscriber class** - `b508994` (feat)
2. **Task 2: Write comprehensive tests** - `b5dc42a` (test)
3. **Fix: TypeScript strict mode errors** - `a8ae1c9` (fix)

## Files Created/Modified
- `packages/adapters/evm/src/evm-incoming-subscriber.ts` - EvmIncomingSubscriber class (218 lines) implementing IChainSubscriber with pollAll()
- `packages/adapters/evm/src/__tests__/evm-incoming-subscriber.test.ts` - 21 unit tests with mock viem client (519 lines)
- `packages/adapters/evm/src/index.ts` - Barrel re-export of EvmIncomingSubscriber

## Decisions Made
- EVM polling-first strategy (D-06): connect() is no-op, waitForDisconnect() returns never-resolving Promise. This means EVM stays in WS_ACTIVE state permanently and polling workers handle the actual work.
- 10-block cap per poll cycle (MAX_BLOCK_RANGE = 10n) prevents RPC provider "block range too large" errors.
- Per-wallet error isolation: pollAll() catches errors per wallet and logs a console.warn, allowing other wallets to continue.
- Case-insensitive address comparison for native ETH detection (tx.to.toLowerCase() === walletAddress.toLowerCase()).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict mode errors in test file**
- **Found during:** Task 2 verification (typecheck)
- **Issue:** 6 TS2532/TS18048 "possibly undefined" errors when accessing `mock.calls[N][0]` without non-null assertions
- **Fix:** Added `!` non-null assertions to all `mock.calls[N]!` access patterns
- **Files modified:** packages/adapters/evm/src/__tests__/evm-incoming-subscriber.test.ts
- **Verification:** `pnpm turbo run typecheck --filter=@waiaas/adapter-evm` passes with 0 errors
- **Committed in:** a8ae1c9

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor fix for TypeScript strict mode compliance. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- EvmIncomingSubscriber ready for consumption by Phase 226 (IncomingTxMonitorService/BackgroundWorkers)
- pollAll() method is the external invocation point for periodic polling
- connect()/waitForDisconnect() compatible with 3-state connection machine (Plan 225-03)
- Importable from `@waiaas/adapter-evm` via barrel export

---
*Phase: 225-chain-subscriber-implementations*
*Completed: 2026-02-22*
