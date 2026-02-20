---
phase: 206-wallet-app-notification-side-channel
plan: 02
subsystem: api
tags: [ntfy, notification, signing-sdk, side-channel, wallet-notification]

# Dependency graph
requires:
  - phase: 206-01
    provides: NotificationMessageSchema, EVENT_CATEGORY_MAP, signing_sdk.notifications_enabled/notify_categories settings
provides:
  - WalletNotificationChannel class with notify() method
  - NotificationService.setWalletNotificationChannel() integration
  - Daemon lifecycle Step 4c-8 WalletNotificationChannel wiring
  - 12 unit tests covering DAEMON-01 through DAEMON-06 + SETTINGS-01/02/03
affects: [206-03, 206-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [side-channel notification pattern (fire-and-forget, independent of traditional channels)]

key-files:
  created:
    - packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts
    - packages/daemon/src/__tests__/wallet-notification-channel.test.ts
  modified:
    - packages/daemon/src/services/signing-sdk/channels/index.ts
    - packages/daemon/src/services/signing-sdk/index.ts
    - packages/daemon/src/notifications/notification-service.ts
    - packages/daemon/src/lifecycle/daemon.ts

key-decisions:
  - "Side channel invocation placed BEFORE channels.length guard to fire even with zero traditional channels"
  - "Fire-and-forget pattern with .catch(() => {}) for complete isolation from existing channel delivery"
  - "WalletNotificationChannel instantiated inside Step 4c-8 block (reuses dynamic import)"

patterns-established:
  - "Side channel pattern: independent channel that runs in parallel with existing channels[], never affects their result"
  - "setWalletNotificationChannel() injection pattern for late-binding lifecycle dependency"

requirements-completed: [DAEMON-01, DAEMON-02, DAEMON-03, DAEMON-04, DAEMON-05, DAEMON-06]

# Metrics
duration: 8min
completed: 2026-02-20
---

# Phase 206 Plan 02: WalletNotificationChannel + NotificationService Integration Summary

**WalletNotificationChannel pushes base64url NotificationMessage to waiaas-notify-{walletName} ntfy topics with priority-based delivery and category filtering, integrated into daemon lifecycle and NotificationService**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-20T13:13:03Z
- **Completed:** 2026-02-20T13:21:03Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created WalletNotificationChannel with notify() method supporting all 26 event types across 6 categories
- Side channel publishes base64url-encoded NotificationMessage to waiaas-notify-{walletName} ntfy topics
- security_alert events get priority 5, all other categories get priority 3
- Only sdk_ntfy wallets receive notifications; non-UUID walletId broadcasts to all sdk_ntfy wallets with real wallet UUIDs
- Complete settings gating: signing_sdk.enabled, notifications_enabled, and notify_categories JSON array filter
- Integrated into NotificationService.notify() before channels.length guard (fires even with zero traditional channels)
- Daemon lifecycle Step 4c-8 instantiates and injects WalletNotificationChannel when signing SDK is enabled

## Task Commits

Each task was committed atomically:

1. **Task 1: Create WalletNotificationChannel with TDD tests** - `e21f79e` (feat)
2. **Task 2: Integrate WalletNotificationChannel into NotificationService and daemon lifecycle** - `eeae09c` (feat)

## Files Created/Modified
- `packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts` - WalletNotificationChannel class with notify(), resolveTargetWallets(), publishNotification()
- `packages/daemon/src/__tests__/wallet-notification-channel.test.ts` - 12 unit tests covering DAEMON-01 through DAEMON-06 + SETTINGS-01/02/03
- `packages/daemon/src/services/signing-sdk/channels/index.ts` - Re-export WalletNotificationChannel + WalletNotificationChannelDeps
- `packages/daemon/src/services/signing-sdk/index.ts` - Re-export WalletNotificationChannel from channels
- `packages/daemon/src/notifications/notification-service.ts` - Added walletNotificationChannel field, setWalletNotificationChannel(), side channel call in notify()
- `packages/daemon/src/lifecycle/daemon.ts` - Step 4c-8 instantiation + injection of WalletNotificationChannel

## Decisions Made
- Side channel invocation placed BEFORE the `channels.length === 0` guard in `notify()` so it fires even when no traditional channels (Telegram/ntfy/Slack) are configured. This ensures wallet app notifications work independently.
- Used fire-and-forget `.catch(() => {})` pattern for complete isolation -- side channel failure never affects existing channel delivery or return value.
- WalletNotificationChannel instantiated inside the existing Step 4c-8 dynamic import block, reusing the same `await import('../services/signing-sdk/index.js')` that already imports NtfySigningChannel and ApprovalChannelRouter.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WalletNotificationChannel ready for Plan 03 (wallet-sdk NotificationListener implementation)
- All 12 new tests + 34 existing notification-service tests + 11 signing-sdk lifecycle tests passing
- Build compiles without errors

## Self-Check: PASSED

All 6 created/modified files verified present. Both commit hashes (e21f79e, eeae09c) confirmed in git log.

---
*Phase: 206-wallet-app-notification-side-channel*
*Completed: 2026-02-20*
