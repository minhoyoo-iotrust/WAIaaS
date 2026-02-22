---
phase: 227-config-settings-notifications
plan: 02
subsystem: notifications, admin-ui
tags: [notification-events, i18n, broadcast, incoming-tx, admin-settings]

# Dependency graph
requires:
  - phase: 226-monitor-service-resilience
    provides: IncomingTxMonitorService with placeholder notification type names
provides:
  - TX_INCOMING and TX_INCOMING_SUSPICIOUS notification event types (30 total)
  - en/ko i18n templates for incoming transaction notifications
  - TX_INCOMING_SUSPICIOUS broadcast delivery via BROADCAST_EVENTS
  - Type-safe monitor service notify() calls (no as any)
  - IncomingSettings Admin UI component with 7 form fields
affects: [incoming-tx-monitoring, admin-ui-settings, notification-channels]

# Tech tracking
tech-stack:
  added: []
  patterns: [broadcast-events-for-security-alerts, admin-settings-category-component]

key-files:
  created: []
  modified:
    - packages/core/src/enums/notification.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/core/src/schemas/signing-protocol.ts
    - packages/core/src/__tests__/enums.test.ts
    - packages/daemon/src/notifications/notification-service.ts
    - packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts
    - packages/daemon/src/services/incoming/__tests__/incoming-tx-monitor-service.test.ts
    - packages/admin/src/pages/settings.tsx

key-decisions:
  - "TX_INCOMING_SUSPICIOUS categorized as security_alert in EVENT_CATEGORY_MAP (broadcast to all channels)"
  - "TX_INCOMING categorized as transaction in EVENT_CATEGORY_MAP (standard priority-based delivery)"

patterns-established:
  - "Incoming TX notifications follow same {walletId}, {amount}, {fromAddress}, {chain}, {display_amount} placeholder pattern as outgoing TX"

requirements-completed: [EVT-02, EVT-06]

# Metrics
duration: 5min
completed: 2026-02-22
---

# Phase 227 Plan 02: Incoming TX Notification Events + Admin UI Settings Summary

**30 notification event types with TX_INCOMING/TX_INCOMING_SUSPICIOUS, en/ko i18n templates, type-safe monitor service, broadcast delivery for suspicious alerts, and IncomingSettings Admin UI component**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-21T16:50:53Z
- **Completed:** 2026-02-21T16:55:43Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Added TX_INCOMING and TX_INCOMING_SUSPICIOUS to NOTIFICATION_EVENT_TYPES (28 -> 30)
- Created en/ko i18n templates with variable placeholders for incoming transaction alerts
- Fixed monitor service to use canonical type names instead of placeholder strings with `as any` cast
- Added TX_INCOMING_SUSPICIOUS to BROADCAST_EVENTS for all-channel simultaneous delivery
- Added IncomingSettings component to Admin UI with 7 form fields for runtime configuration

## Task Commits

Each task was committed atomically:

1. **Task 1: Add NotificationEventType entries + i18n + BROADCAST_EVENTS + fix monitor service** - `af557ace` (feat)
2. **Task 2: Add IncomingSettings component to Admin UI Settings page** - `b17fc3a6` (feat)

## Files Created/Modified
- `packages/core/src/enums/notification.ts` - Added TX_INCOMING and TX_INCOMING_SUSPICIOUS (28 -> 30 entries)
- `packages/core/src/i18n/en.ts` - English notification templates for incoming TX events
- `packages/core/src/i18n/ko.ts` - Korean notification templates for incoming TX events
- `packages/core/src/schemas/signing-protocol.ts` - Added entries to EVENT_CATEGORY_MAP
- `packages/core/src/__tests__/enums.test.ts` - Updated count assertion from 28 to 30
- `packages/daemon/src/notifications/notification-service.ts` - Added TX_INCOMING_SUSPICIOUS to BROADCAST_EVENTS
- `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` - Replaced placeholder type names with canonical enum values
- `packages/daemon/src/services/incoming/__tests__/incoming-tx-monitor-service.test.ts` - Updated cooldown key reference
- `packages/admin/src/pages/settings.tsx` - Added IncomingSettings component with 7 form fields

## Decisions Made
- TX_INCOMING_SUSPICIOUS classified as `security_alert` in EVENT_CATEGORY_MAP, ensuring broadcast delivery to all 4 notification channels simultaneously
- TX_INCOMING classified as `transaction` in EVENT_CATEGORY_MAP, using standard priority-based fallback delivery
- Monitor service notify() vars expanded to include walletId, fromAddress, display_amount, and reasons to match i18n template placeholders

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added TX_INCOMING/TX_INCOMING_SUSPICIOUS to EVENT_CATEGORY_MAP**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** signing-protocol.ts has `Record<NotificationEventType, NotificationCategory>` which requires all event types to be mapped
- **Fix:** Added `TX_INCOMING: 'transaction'` and `TX_INCOMING_SUSPICIOUS: 'security_alert'` to EVENT_CATEGORY_MAP
- **Files modified:** packages/core/src/schemas/signing-protocol.ts
- **Verification:** TypeScript build passes
- **Committed in:** af557ace (Task 1 commit)

**2. [Rule 3 - Blocking] Cleaned stale tsbuildinfo for core package rebuild**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** Stale tsbuildinfo caused incremental build to skip recompilation despite source changes, resulting in daemon typecheck failing with old types
- **Fix:** Removed tsconfig.build.tsbuildinfo and rebuilt core package
- **Verification:** dist/enums/notification.d.ts now includes TX_INCOMING and TX_INCOMING_SUSPICIOUS
- **Committed in:** N/A (build artifact, not committed)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for type safety. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 30 notification event types defined with complete i18n coverage
- Monitor service uses type-safe canonical names
- Admin UI has IncomingSettings for runtime configuration
- Ready for Phase 228 (Wallet DB + API Extensions)

## Self-Check: PASSED

- All 9 modified files exist on disk
- Commit af557ace (Task 1) found
- Commit b17fc3a6 (Task 2) found
- TypeScript typecheck passes for @waiaas/core and @waiaas/daemon
- 44/44 tests pass (29 enum + 15 monitor service)
- No `as any` casts in incoming-tx-monitor-service.ts

---
*Phase: 227-config-settings-notifications*
*Completed: 2026-02-22*
