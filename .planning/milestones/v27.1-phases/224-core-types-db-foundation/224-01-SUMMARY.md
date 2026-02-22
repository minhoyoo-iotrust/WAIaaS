---
phase: 224-core-types-db-foundation
plan: 01
subsystem: core
tags: [zod, typescript, interfaces, enums, events, incoming-tx, chain-subscriber]

# Dependency graph
requires: []
provides:
  - IChainSubscriber 6-method interface for chain subscriber implementations
  - IncomingTransaction type (13 fields) for incoming TX data
  - IncomingTxStatus enum (DETECTED | CONFIRMED) with Zod SSoT
  - INCOMING_TX_STATUSES const array for DB CHECK constraints
  - IncomingTransactionSchema Zod SSoT for validation/OpenAPI
  - IncomingTxEvent + IncomingTxSuspiciousEvent in WaiaasEventMap (7 total events)
affects: [225-solana-subscriber, 225-evm-subscriber, 226-monitor-service, 228-rest-api]

# Tech tracking
tech-stack:
  added: []
  patterns: [IChainSubscriber interface pattern (stateful subscriber, parallel to IChainAdapter)]

key-files:
  created:
    - packages/core/src/enums/incoming-tx.ts
    - packages/core/src/interfaces/IChainSubscriber.ts
    - packages/core/src/interfaces/chain-subscriber.types.ts
    - packages/core/src/schemas/incoming-transaction.schema.ts
  modified:
    - packages/core/src/enums/index.ts
    - packages/core/src/interfaces/index.ts
    - packages/core/src/schemas/index.ts
    - packages/core/src/events/event-types.ts
    - packages/core/src/events/index.ts
    - packages/core/src/index.ts

key-decisions:
  - "IncomingTransaction defined as both interface (chain-subscriber.types.ts) and Zod schema (incoming-transaction.schema.ts) -- interface for code contracts, Zod for validation/OpenAPI SSoT"
  - "IncomingTransactionDto alias used in schemas/index.ts to avoid name collision with the interface type"

patterns-established:
  - "Chain subscriber types pattern: parallel to chain-adapter types with separate interface + types files"

requirements-completed: [SUB-01]

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 224 Plan 01: Core Types + DB Foundation Summary

**IChainSubscriber 6-method interface, IncomingTxStatus enum, IncomingTransactionSchema Zod SSoT, and 2 event types in @waiaas/core**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T14:52:28Z
- **Completed:** 2026-02-21T14:55:25Z
- **Tasks:** 2
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments
- IChainSubscriber 6-method interface (subscribe/unsubscribe/subscribedWallets/connect/waitForDisconnect/destroy) defined and importable from @waiaas/core
- IncomingTransaction type with 13 fields and IncomingTxStatus enum ('DETECTED' | 'CONFIRMED') exported
- IncomingTransactionSchema Zod SSoT schema exported for validation and OpenAPI generation
- INCOMING_TX_STATUSES const array exported for DB CHECK constraints
- 2 new event types (transaction:incoming, transaction:incoming:suspicious) added to WaiaasEventMap (7 total)
- @waiaas/core passes typecheck and lint with 0 errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create IncomingTxStatus enum + IChainSubscriber interface + types** - `bd76428` (feat)
2. **Task 2: Create IncomingTransaction Zod schema + event types + barrel re-exports** - `c40b0ba` (feat)

## Files Created/Modified
- `packages/core/src/enums/incoming-tx.ts` - INCOMING_TX_STATUSES SSoT const array, IncomingTxStatus type, IncomingTxStatusEnum Zod enum
- `packages/core/src/enums/index.ts` - Re-exports for incoming-tx enum
- `packages/core/src/interfaces/chain-subscriber.types.ts` - IncomingTransaction interface (13 fields)
- `packages/core/src/interfaces/IChainSubscriber.ts` - IChainSubscriber 6-method interface with JSDoc
- `packages/core/src/interfaces/index.ts` - Re-exports for chain subscriber types
- `packages/core/src/schemas/incoming-transaction.schema.ts` - IncomingTransactionSchema Zod SSoT
- `packages/core/src/schemas/index.ts` - Re-exports for incoming transaction schema
- `packages/core/src/events/event-types.ts` - IncomingTxEvent + IncomingTxSuspiciousEvent + WaiaasEventMap update
- `packages/core/src/events/index.ts` - Re-exports for new event types
- `packages/core/src/index.ts` - Barrel re-exports for all new enums, types, schemas, events

## Decisions Made
- IncomingTransaction defined as both interface (chain-subscriber.types.ts) and Zod schema (incoming-transaction.schema.ts) -- interface for code contracts in subscriber implementations, Zod for runtime validation and OpenAPI generation per SSoT convention
- IncomingTransactionDto alias used in schemas/index.ts to avoid name collision with the interface type from chain-subscriber.types.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All core types for incoming transaction monitoring are defined and exported from @waiaas/core
- Phase 225 (chain subscriber implementations) can now import IChainSubscriber and IncomingTransaction
- Phase 226 (monitor service) can import event types for EventBus integration
- Phase 228 (REST API) can use IncomingTransactionSchema for response validation
- Plan 224-02 (DB migration) can use INCOMING_TX_STATUSES for CHECK constraints

## Self-Check: PASSED

- All 4 created files verified on disk
- Both task commits (bd76428, c40b0ba) verified in git log

---
*Phase: 224-core-types-db-foundation*
*Completed: 2026-02-21*
