---
phase: 264-monitoring-alerts
plan: 01
subsystem: core
tags: [rpc, notification, monitoring, event-callback, rpc-pool]

# Dependency graph
requires:
  - "263-01: GET /admin/rpc-status endpoint (MNTR-01 already satisfied)"
provides:
  - "RPC_ALL_FAILED and RPC_RECOVERED notification event types"
  - "English and Korean i18n templates for RPC monitoring events"
  - "RpcPoolEvent interface with 3 event types"
  - "RpcPool onEvent callback for cooldown/all-failed/recovered transitions"
affects: [264-02-notification-wiring, daemon-rpc-pool-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["RpcPool event emission via optional callback (not EventEmitter)", "Event check: all-in-cooldown detection after each reportFailure"]

key-files:
  created: []
  modified:
    - packages/core/src/enums/notification.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/core/src/schemas/signing-protocol.ts
    - packages/core/src/rpc/rpc-pool.ts
    - packages/core/src/__tests__/enums.test.ts
    - packages/core/src/__tests__/rpc-pool.test.ts

key-decisions:
  - "onEvent is optional callback (not EventEmitter) -- keeps RpcPool lightweight with zero dependencies"
  - "RPC_HEALTH_DEGRADED emitted on every cooldown entry, RPC_ALL_FAILED only when all endpoints are in cooldown"
  - "RPC_RECOVERED emitted only when endpoint was in cooldown before reportSuccess (not on healthy endpoint success)"

patterns-established:
  - "RpcPool event callback pattern: onEvent?.(event) with RpcPoolEvent interface"

requirements-completed: [MNTR-01, MNTR-02, MNTR-03, MNTR-04]

# Metrics
duration: 4min
completed: 2026-02-25
---

# Phase 264 Plan 01: Monitoring Alerts Summary

**RPC_ALL_FAILED/RPC_RECOVERED notification events (42->44) with RpcPool onEvent callback emitting 3 event types on cooldown transitions, 5 new tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-25T11:20:44Z
- **Completed:** 2026-02-25T11:24:44Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added RPC_ALL_FAILED and RPC_RECOVERED to NotificationEventType enum (42 -> 44 event types)
- Added English and Korean i18n templates for both new events with system category mapping
- Extended RpcPool with RpcPoolEvent interface and optional onEvent callback
- RpcPool emits RPC_HEALTH_DEGRADED on cooldown entry, RPC_ALL_FAILED when all endpoints fail, RPC_RECOVERED on recovery
- 5 new onEvent callback tests covering all emission scenarios (539 total core tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add RPC_ALL_FAILED + RPC_RECOVERED notification events and i18n templates** - `8f3d7e63` (feat)
2. **Task 2: Add onEvent callback to RpcPool with cooldown/all-failed/recovered emission** - `206253a9` (feat)

## Files Created/Modified
- `packages/core/src/enums/notification.ts` - Added RPC_ALL_FAILED and RPC_RECOVERED event types
- `packages/core/src/i18n/en.ts` - English notification templates for new events
- `packages/core/src/i18n/ko.ts` - Korean notification templates for new events
- `packages/core/src/schemas/signing-protocol.ts` - EVENT_CATEGORY_MAP and EVENT_DESCRIPTIONS for new events
- `packages/core/src/rpc/rpc-pool.ts` - RpcPoolEvent interface, onEvent option, emission in reportFailure/reportSuccess
- `packages/core/src/__tests__/enums.test.ts` - Updated count 42->44, added RPC_ALL_FAILED/RPC_RECOVERED assertions
- `packages/core/src/__tests__/rpc-pool.test.ts` - 5 new onEvent callback tests

## Decisions Made
- onEvent is optional callback (not EventEmitter) -- keeps RpcPool lightweight with zero additional dependencies
- RPC_HEALTH_DEGRADED emitted on every cooldown entry; RPC_ALL_FAILED only when ALL endpoints for a network are in cooldown
- RPC_RECOVERED emitted only when endpoint was actively in cooldown before reportSuccess (prevents noise from healthy endpoints)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RpcPoolEvent and onEvent callback ready for Plan 02 to wire into NotificationService
- Event types registered in i18n and category maps, ready for notification delivery
- All 539 core tests passing

---
*Phase: 264-monitoring-alerts*
*Completed: 2026-02-25*
