---
phase: 206-wallet-app-notification-side-channel
plan: 03
subsystem: sdk
tags: [ntfy, sse, notification, base64url, zod, wallet-sdk]

# Dependency graph
requires:
  - phase: 206-wallet-app-notification-side-channel
    plan: 01
    provides: "NotificationMessageSchema, NotificationMessage type, NOTIFICATION_CATEGORIES"
provides:
  - "parseNotification() - decode and validate base64url NotificationMessage"
  - "subscribeToNotifications() - SSE subscription for ntfy notification events"
  - "Both exported from @waiaas/wallet-sdk public API"
affects: [206-04, wallet-sdk consumers]

# Tech tracking
tech-stack:
  added: []
  patterns: ["SSE notification subscription with auto-reconnect (mirrors subscribeToRequests pattern)"]

key-files:
  created: []
  modified:
    - packages/wallet-sdk/src/channels/ntfy.ts
    - packages/wallet-sdk/src/channels/index.ts
    - packages/wallet-sdk/src/index.ts
    - packages/wallet-sdk/src/__tests__/channels.test.ts

key-decisions:
  - "Reused existing SSE+reconnect pattern from subscribeToRequests for subscribeToNotifications"

patterns-established:
  - "parseNotification follows same base64url->JSON->Zod pattern as signing request parsing"

requirements-completed: [SDK-01, SDK-02]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 206 Plan 03: Notification SDK Functions Summary

**parseNotification and subscribeToNotifications added to @waiaas/wallet-sdk with base64url->Zod validation and ntfy SSE subscription**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T13:13:21Z
- **Completed:** 2026-02-20T13:15:29Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- parseNotification() decodes base64url, parses JSON, validates against NotificationMessageSchema
- subscribeToNotifications() connects to ntfy SSE stream with auto-reconnect and delivers validated NotificationMessage objects via callback
- Both functions exported from @waiaas/wallet-sdk public API
- 8 new tests covering valid decoding, invalid base64, invalid JSON, schema mismatch, optional details, unsubscribe, SSE URL construction, and SSE message delivery
- Full test suite (37 tests) passes, build compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement parseNotification and subscribeToNotifications in wallet-sdk** - `fd666ad` (feat)

**Plan metadata:** [pending] (docs: complete plan)

_Note: TDD task with RED/GREEN phases in single commit (functions did not exist yet)_

## Files Created/Modified
- `packages/wallet-sdk/src/channels/ntfy.ts` - Added parseNotification() and subscribeToNotifications() functions
- `packages/wallet-sdk/src/channels/index.ts` - Added exports for new functions
- `packages/wallet-sdk/src/index.ts` - Added new functions to public API and JSDoc
- `packages/wallet-sdk/src/__tests__/channels.test.ts` - Added 8 tests for parseNotification and subscribeToNotifications

## Decisions Made
- Reused the existing SSE+reconnect pattern from subscribeToRequests for consistency -- subscribeToNotifications follows the same AbortController/reconnect logic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- parseNotification and subscribeToNotifications are available in @waiaas/wallet-sdk
- Plan 206-04 (daemon-side WalletNotificationChannel) can use these SDK functions for wallet app integration
- All existing tests remain green

## Self-Check: PASSED

- [x] packages/wallet-sdk/src/channels/ntfy.ts - FOUND
- [x] packages/wallet-sdk/src/channels/index.ts - FOUND
- [x] packages/wallet-sdk/src/index.ts - FOUND
- [x] packages/wallet-sdk/src/__tests__/channels.test.ts - FOUND
- [x] Commit fd666ad - FOUND

---
*Phase: 206-wallet-app-notification-side-channel*
*Completed: 2026-02-20*
