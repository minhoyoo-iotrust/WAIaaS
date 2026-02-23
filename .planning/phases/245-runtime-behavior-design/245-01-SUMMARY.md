---
phase: 245-runtime-behavior-design
plan: 01
subsystem: api
tags: [defi, async-tracking, polling, state-machine, bridge, unstake, gas-condition, db-migration]

# Dependency graph
requires:
  - phase: 244-core-design-foundation
    provides: "DEFI-01/02 packages/actions structure, DEFI-03 policy integration design"
  - phase: research
    provides: "m28-defi-ARCHITECTURE, PITFALLS (P4 bridge limbo, P6 stale calldata)"
provides:
  - "DEFI-04 confirmed async status tracking design (IAsyncStatusTracker interface + 3 implementations)"
  - "AsyncPollingService with BackgroundWorkers integration and per-tracker timing"
  - "Transaction state machine extension (10->11 states, GAS_WAITING)"
  - "bridge_status transition rules with SPENDING_LIMIT reservation semantics"
  - "Bridge timeout policy (2h active + 22h monitoring + TIMEOUT, never auto-cancel)"
  - "Integrated DB migration v23 (bridge_status + bridge_metadata + GAS_WAITING + 2 indexes)"
affects: [m28-03-lifi-crosschain-bridge, m28-04-liquid-staking, m28-05-gas-conditional-execution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IAsyncStatusTracker interface: checkStatus/name/maxAttempts/pollIntervalMs/timeoutTransition"
    - "AsyncPollingService: per-tracker timing via bridge_metadata.lastPolledAt, sequential processing"
    - "BackgroundWorkers integration: 30s interval, pollAll() manages per-tracker timing internally"
    - "3-stage bridge polling: 2h active (30s) -> 22h monitoring (5min) -> TIMEOUT"
    - "bridge_status independent from transactions.status (parallel state tracking)"

key-files:
  created: []
  modified:
    - "internal/objectives/m28-00-defi-basic-protocol-design.md"

key-decisions:
  - "IAsyncStatusTracker with timeoutTransition discriminator (TIMEOUT/BRIDGE_MONITORING/CANCELLED)"
  - "Per-tracker timing via bridge_metadata.lastPolledAt instead of separate setTimeout chains"
  - "GAS_WAITING as 11th transaction status, entering from Stage 3.5"
  - "Bridge timeout: never auto-cancel, SPENDING_LIMIT reservation held until COMPLETED/REFUNDED"
  - "Integrated DB migration v23: single migration for all 3 DeFi async features"
  - "Partial indexes for polling query optimization (bridge_status, gas_waiting)"

patterns-established:
  - "IAsyncStatusTracker: common interface for bridge/unstake/gas-condition with configurable polling"
  - "AsyncPollingService: centralized polling with per-tracker timing management"
  - "bridge_status lifecycle: NULL -> PENDING -> COMPLETED/FAILED/BRIDGE_MONITORING -> TIMEOUT"
  - "SPENDING_LIMIT reservation semantics: hold until COMPLETED/REFUNDED, never release on TIMEOUT"

requirements-completed: [ASNC-01, ASNC-02, ASNC-03, ASNC-04, ASNC-05]

# Metrics
duration: 7min
completed: 2026-02-23
---

# Phase 245 Plan 01: Async Status Tracking Design Summary

**IAsyncStatusTracker interface with 3 implementations, setTimeout-chain polling scheduler, 11-state transaction machine (GAS_WAITING), integrated DB migration v23, and 3-stage bridge timeout policy**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-23T05:07:48Z
- **Completed:** 2026-02-23T05:15:12Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- ASNC-01: IAsyncStatusTracker interface confirmed with 3 implementations (BridgeStatusTracker 2h@30s, UnstakeStatusTracker 14d@5min, GasConditionTracker 1h@30s)
- ASNC-02: AsyncPollingService with BackgroundWorkers integration, per-tracker timing via bridge_metadata.lastPolledAt, sequential processing with error isolation
- ASNC-04: Transaction state machine extended from 10 to 11 states (GAS_WAITING added), full transition diagram with GAS_WAITING and bridge_status rules
- ASNC-05: 3-stage bridge timeout policy (2h active -> 22h monitoring -> TIMEOUT) with auto-cancel prohibition and SPENDING_LIMIT reservation semantics
- ASNC-03: Integrated DB migration v23 with bridge_status CHECK constraint, bridge_metadata JSON, GAS_WAITING status, and 2 partial indexes

## Task Commits

Each task was committed atomically:

1. **Task 1: AsyncStatusTracker interface + polling scheduler + state machine extension** - `82eab8dd` (feat)
2. **Task 2: Integrated DB migration v23 design** - `6af6ac0d` (feat)

## Files Created/Modified

- `internal/objectives/m28-00-defi-basic-protocol-design.md` - Section 4 converted from "design scope/deliverables" to confirmed design with ASNC-01~05 (sections 4.1~4.5)

## Decisions Made

1. **IAsyncStatusTracker with timeoutTransition discriminator** -- Each tracker declares its timeout behavior (TIMEOUT/BRIDGE_MONITORING/CANCELLED) enabling the polling service to handle timeouts generically without tracker-specific logic.
2. **Per-tracker timing via bridge_metadata.lastPolledAt** -- Instead of creating separate setTimeout chains per tracker, pollAll() runs at 30s intervals and checks lastPolledAt to skip trackers whose interval hasn't elapsed. This reuses BackgroundWorkers' existing setInterval pattern with overlap prevention.
3. **GAS_WAITING as 11th state** -- Added between Stage 3 (Policy) and Stage 4 (Wait), entering when gasCondition exists and is not met. Exits to SIGNED (condition met) or CANCELLED (timeout).
4. **Bridge auto-cancel prohibition** -- TIMEOUT is not CANCELLED. SPENDING_LIMIT reservations are held until bridge_status = COMPLETED or REFUNDED. This prevents policy accounting mismatch when funds are in bridge protocol limbo (Pitfall P4 response).
5. **Single DB migration v23** -- All 3 DeFi async features (bridge, unstake, gas-condition) share one migration to minimize migration fatigue. m28-03 runs v23; m28-04 and m28-05 add no additional migrations.
6. **Partial indexes for polling** -- idx_transactions_bridge_status (WHERE NOT NULL) and idx_transactions_gas_waiting (WHERE status = 'GAS_WAITING') keep index size small since most transactions don't use these features.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DEFI-04 async status tracking design is complete, enabling m28-03 (LI.FI bridge) to implement BridgeStatusTracker with confirmed interface
- DB migration v23 is designed as single migration covering all 3 DeFi features, ready for m28-03 implementation
- GAS_WAITING state machine extension is designed for m28-05 implementation
- Phase 245 Plans 02 and 03 (test strategy, remaining designs) can proceed

## Self-Check: PASSED

- FOUND: internal/objectives/m28-00-defi-basic-protocol-design.md
- FOUND: 82eab8dd (Task 1 commit)
- FOUND: 6af6ac0d (Task 2 commit)

---
*Phase: 245-runtime-behavior-design*
*Completed: 2026-02-23*
