---
phase: 256-staking-api-async-tracking-interface-integration
plan: 01
subsystem: actions, daemon, notifications
tags: [staking, async-polling, IAsyncStatusTracker, lido, jito, notifications]

# Dependency graph
requires:
  - phase: 254-lido-evm-staking-provider
    provides: LidoStakingActionProvider with actions.lido_staking_enabled setting
  - phase: 255-jito-solana-staking-provider
    provides: JitoStakingActionProvider with actions.jito_staking_enabled setting
provides:
  - LidoWithdrawalTracker implementing IAsyncStatusTracker (lido-withdrawal, 480x30s)
  - JitoEpochTracker implementing IAsyncStatusTracker (jito-epoch, 240x30s)
  - STAKING_UNSTAKE_COMPLETED and STAKING_UNSTAKE_TIMEOUT notification events
  - Dynamic notificationEvent dispatch in AsyncPollingService
  - Daemon Step 4f-3 staking tracker registration (settings-gated)
affects: [256-02 (staking REST API), 256-03 (MCP + Admin UI), admin-ui-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns: [dynamic-notification-event-type, metadata-based-status-tracking]

key-files:
  created:
    - packages/actions/src/providers/lido-staking/withdrawal-tracker.ts
    - packages/actions/src/providers/jito-staking/epoch-tracker.ts
    - packages/actions/src/__tests__/staking-trackers.test.ts
  modified:
    - packages/actions/src/index.ts
    - packages/core/src/enums/notification.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/core/src/schemas/signing-protocol.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/services/async-polling-service.ts
    - packages/daemon/src/__tests__/async-polling-service.test.ts

key-decisions:
  - "Dynamic notificationEvent in AsyncPollingService: tracker details.notificationEvent overrides hardcoded event names, with fallback to BRIDGE_* defaults for backward compatibility"
  - "Metadata-based v1 tracking: LidoWithdrawalTracker and JitoEpochTracker use metadata.status field (not on-chain queries) for COMPLETED detection"
  - "Staking trackers use TIMEOUT terminal transition (no two-phase monitoring unlike bridge trackers)"

patterns-established:
  - "Dynamic event type pattern: AsyncPollingService reads notificationEvent from tracker result details, enabling custom notification events per tracker type without modifying the polling service core"
  - "Staking tracker metadata convention: tracker field = tracker name, notificationEvent field = timeout event type set at unstake creation time"

requirements-completed: [ASYNC-01, ASYNC-02, ASYNC-03, ASYNC-04]

# Metrics
duration: 8min
completed: 2026-02-24
---

# Phase 256 Plan 01: Async Tracking + Notification Integration Summary

**LidoWithdrawalTracker and JitoEpochTracker as IAsyncStatusTracker implementations with dynamic notification event dispatch in AsyncPollingService**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-24T12:07:28Z
- **Completed:** 2026-02-24T12:15:46Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- LidoWithdrawalTracker (480x30s) and JitoEpochTracker (240x30s) implement IAsyncStatusTracker for metadata-based unstake status tracking
- STAKING_UNSTAKE_COMPLETED and STAKING_UNSTAKE_TIMEOUT added to notification enum with en/ko i18n templates
- AsyncPollingService dynamically dispatches notification events from tracker result details (backward compatible with bridge trackers)
- Daemon Step 4f-3 conditionally registers staking trackers based on actions.lido_staking_enabled / actions.jito_staking_enabled settings
- 23 new tests (20 staking-tracker + 3 dynamic event dispatch) all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: LidoWithdrawalTracker + JitoEpochTracker** - `57d2bb45` (feat)
2. **Task 2: Notification events + daemon registration + dynamic dispatch + tests** - `503133d9` (feat)

## Files Created/Modified
- `packages/actions/src/providers/lido-staking/withdrawal-tracker.ts` - LidoWithdrawalTracker implementing IAsyncStatusTracker
- `packages/actions/src/providers/jito-staking/epoch-tracker.ts` - JitoEpochTracker implementing IAsyncStatusTracker
- `packages/actions/src/__tests__/staking-trackers.test.ts` - 20 unit tests for both trackers
- `packages/actions/src/index.ts` - Export LidoWithdrawalTracker and JitoEpochTracker
- `packages/core/src/enums/notification.ts` - STAKING_UNSTAKE_COMPLETED, STAKING_UNSTAKE_TIMEOUT events
- `packages/core/src/i18n/en.ts` - English notification templates for staking events
- `packages/core/src/i18n/ko.ts` - Korean notification templates for staking events
- `packages/core/src/schemas/signing-protocol.ts` - EVENT_CATEGORY_MAP and EVENT_DESCRIPTIONS entries
- `packages/daemon/src/lifecycle/daemon.ts` - Step 4f-3 staking tracker registration
- `packages/daemon/src/services/async-polling-service.ts` - Dynamic notificationEvent dispatch in COMPLETED/FAILED/TIMEOUT
- `packages/daemon/src/__tests__/async-polling-service.test.ts` - 3 new tests for dynamic event dispatch

## Decisions Made
- Dynamic notificationEvent in AsyncPollingService: tracker details.notificationEvent overrides hardcoded event names, with fallback to BRIDGE_* defaults for backward compatibility
- Metadata-based v1 tracking: LidoWithdrawalTracker and JitoEpochTracker use metadata.status field (not on-chain queries) for COMPLETED detection
- Staking trackers use TIMEOUT terminal transition (no two-phase monitoring unlike bridge trackers)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added STAKING_UNSTAKE_* to EVENT_CATEGORY_MAP and EVENT_DESCRIPTIONS**
- **Found during:** Task 2 (Notification event registration)
- **Issue:** Adding events to NOTIFICATION_EVENT_TYPES caused type errors in signing-protocol.ts because EVENT_CATEGORY_MAP and EVENT_DESCRIPTIONS are typed as Record<NotificationEventType, ...> and were missing the new keys
- **Fix:** Added STAKING_UNSTAKE_COMPLETED and STAKING_UNSTAKE_TIMEOUT entries to both maps in signing-protocol.ts (category: 'transaction')
- **Files modified:** packages/core/src/schemas/signing-protocol.ts
- **Verification:** pnpm --filter @waiaas/core run typecheck passes
- **Committed in:** 503133d9 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for type safety. The signing-protocol.ts map was not mentioned in the plan but is required by TypeScript's Record<NotificationEventType, ...> type constraint. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Staking trackers are registered and ready for AsyncPollingService polling
- STAKING_UNSTAKE_COMPLETED/TIMEOUT events available for notification dispatch
- Ready for 256-02 (Staking REST API endpoints) and 256-03 (MCP + Admin UI integration)

---
*Phase: 256-staking-api-async-tracking-interface-integration*
*Completed: 2026-02-24*
