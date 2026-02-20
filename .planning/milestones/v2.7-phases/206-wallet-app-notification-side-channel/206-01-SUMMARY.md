---
phase: 206-wallet-app-notification-side-channel
plan: 01
subsystem: api
tags: [zod, notification, signing-protocol, settings]

# Dependency graph
requires:
  - phase: 205-wallet-sdk-daemon-lifecycle
    provides: SignRequest/SignResponse schemas, signing_sdk setting keys
provides:
  - NotificationMessageSchema (Zod SSoT) with version/eventType/walletId/walletName/category/title/body/details/timestamp
  - EVENT_CATEGORY_MAP covering all 26 NotificationEventType -> 6 NotificationCategory
  - NOTIFICATION_CATEGORIES const array
  - NotificationMessage type re-export from @waiaas/wallet-sdk
  - signing_sdk.notifications_enabled and signing_sdk.notify_categories setting keys
affects: [206-02, 206-03, 206-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [event-to-category mapping pattern for notification filtering]

key-files:
  created: []
  modified:
    - packages/core/src/schemas/signing-protocol.ts
    - packages/core/src/index.ts
    - packages/core/src/__tests__/signing-protocol.test.ts
    - packages/wallet-sdk/src/index.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/__tests__/settings-service.test.ts

key-decisions:
  - "NotificationEventType imported as type-only in signing-protocol.ts (value not needed, avoids TS6133 unused import error)"
  - "notify_categories defaults to '[]' (empty = all categories enabled)"
  - "notifications_enabled defaults to 'true' (active by default when SDK is enabled)"

patterns-established:
  - "EVENT_CATEGORY_MAP: Record<NotificationEventType, NotificationCategory> for event-to-category classification"

requirements-completed: [SCHEMA-01, SCHEMA-02, SCHEMA-03, SETTINGS-01, SETTINGS-02, SETTINGS-03]

# Metrics
duration: 6min
completed: 2026-02-20
---

# Phase 206 Plan 01: Schema & Settings Summary

**NotificationMessage Zod schema with EVENT_CATEGORY_MAP (26 events -> 6 categories) and 2 new signing_sdk settings keys**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-20T13:04:21Z
- **Completed:** 2026-02-20T13:10:24Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Defined NotificationMessageSchema (Zod SSoT) with version, eventType, walletId, walletName, category, title, body, details, timestamp fields
- Created EVENT_CATEGORY_MAP covering all 26 NotificationEventType values across 6 categories (transaction, policy, security_alert, session, owner, system)
- Added signing_sdk.notifications_enabled (default 'true') and signing_sdk.notify_categories (default '[]') setting keys
- Re-exported NotificationMessage type from @waiaas/wallet-sdk for consumer convenience

## Task Commits

Each task was committed atomically:

1. **Task 1: Define NotificationMessage schema, EVENT_CATEGORY_MAP, and TDD tests** - `432e3d0` (feat)
2. **Task 2: Re-export NotificationMessage in wallet-sdk + add notification settings keys** - `b33fa39` (feat)

## Files Created/Modified
- `packages/core/src/schemas/signing-protocol.ts` - Added NOTIFICATION_CATEGORIES, EVENT_CATEGORY_MAP, NotificationMessageSchema
- `packages/core/src/index.ts` - Re-exported new notification types and schemas
- `packages/core/src/__tests__/signing-protocol.test.ts` - Added EVENT_CATEGORY_MAP coverage and NotificationMessageSchema validation tests
- `packages/wallet-sdk/src/index.ts` - Re-exported NotificationMessage type
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - Added notifications_enabled and notify_categories definitions
- `packages/daemon/src/__tests__/settings-service.test.ts` - Updated count assertion 63 -> 65

## Decisions Made
- Used type-only import for NotificationEventType in signing-protocol.ts to avoid TS6133 unused import build error (value is only needed in tests, not in the schema module itself)
- notifications_enabled defaults to 'true' (active by default when SDK is enabled per SETTINGS-01)
- notify_categories defaults to '[]' meaning all categories are enabled (per SETTINGS-03)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed type-only import for NotificationEventType**
- **Found during:** Task 2 (core build verification)
- **Issue:** `import { NOTIFICATION_EVENT_TYPES, type NotificationEventType }` caused TS6133 "declared but value never read" because `NOTIFICATION_EVENT_TYPES` value is not used in the module (only the type is used in Record<>)
- **Fix:** Changed to `import type { NotificationEventType }` (type-only import)
- **Files modified:** packages/core/src/schemas/signing-protocol.ts
- **Verification:** `pnpm --filter @waiaas/core run build` passes, all 360 core tests pass
- **Committed in:** b33fa39 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Import style change only -- no behavioral difference. Required for TypeScript build to pass.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- NotificationMessage schema and EVENT_CATEGORY_MAP ready for Plan 02 (WalletNotificationChannel implementation)
- Setting keys ready for runtime configuration of notification filtering
- All 360 core tests + 2624 daemon tests passing

## Self-Check: PASSED

All 6 modified files verified present. Both commit hashes (432e3d0, b33fa39) confirmed in git log.

---
*Phase: 206-wallet-app-notification-side-channel*
*Completed: 2026-02-20*
