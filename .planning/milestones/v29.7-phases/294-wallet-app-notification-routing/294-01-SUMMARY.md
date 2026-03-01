---
phase: 294-wallet-app-notification-routing
plan: 01
subsystem: notification
tags: [ntfy, wallet-apps, notification-routing, sqlite]

# Dependency graph
requires:
  - phase: 293-human-wallet-apps-registry
    provides: wallet_apps table with alerts_enabled column, WalletAppService
provides:
  - App-based notification topic routing (waiaas-notify-{appName})
  - resolveAlertApps() query for wallet_apps WHERE alerts_enabled=1
  - Tests for NOTI-01/02/03 app-based routing
affects: [phase-295, phase-296]

# Tech tracking
tech-stack:
  added: []
  patterns: [app-based notification routing via wallet_apps table]

key-files:
  created: []
  modified:
    - packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts
    - packages/daemon/src/__tests__/wallet-notification-channel.test.ts

key-decisions:
  - "Direct SQL query in resolveAlertApps() instead of injecting WalletAppService -- simpler, no constructor change needed"
  - "walletName in NotificationMessage is now the app name (was wallet instance name)"
  - "Removed UUID_REGEX and wallet-based routing entirely -- all notifications go to all alert-enabled apps regardless of walletId"

patterns-established:
  - "App-based notification routing: query wallet_apps for alert targets instead of wallets table"

requirements-completed: [NOTI-01, NOTI-02, NOTI-03]

# Metrics
duration: 8min
completed: 2026-03-01
---

# Phase 294: Wallet App Notification Routing Summary

**WalletNotificationChannel converted from wallet-instance routing to app-based routing via wallet_apps table alerts_enabled toggle**

## Performance

- **Duration:** 8 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced wallet-based topic routing (waiaas-notify-{wallet.name}) with app-based routing (waiaas-notify-{wallet_apps.name})
- Notifications publish to each app with alerts_enabled=1, skip disabled apps, skip entirely when no alert-enabled apps exist
- All existing gates (signing_sdk.enabled, notifications_enabled, event/category filters) preserved unchanged
- 18 tests pass covering NOTI-01/02/03, DAEMON-05/06, SETTINGS-01/02/03/04, details passthrough

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert WalletNotificationChannel to app-based topic routing** - `1cca54ae` (feat)
2. **Task 2: Update tests for app-based notification routing** - `455d895c` (test)

## Files Created/Modified
- `packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts` - Replaced resolveTargetWallets() with resolveAlertApps(), removed UUID_REGEX, app-based topic publishing
- `packages/daemon/src/__tests__/wallet-notification-channel.test.ts` - Rewrote test suite for app-based routing (NOTI-01/02/03), removed DAEMON-03/04 wallet-based tests

## Decisions Made
- Used direct SQL query (`SELECT name FROM wallet_apps WHERE alerts_enabled = 1`) instead of injecting WalletAppService -- keeps constructor signature unchanged, simpler dependency graph
- Removed UUID_REGEX constant entirely -- walletId format no longer affects routing since all notifications go to all alert-enabled apps

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 295 (Notifications page ntfy section separation) can proceed
- Phase 296 (Skill file + documentation update) can proceed

---
*Phase: 294-wallet-app-notification-routing*
*Completed: 2026-03-01*
