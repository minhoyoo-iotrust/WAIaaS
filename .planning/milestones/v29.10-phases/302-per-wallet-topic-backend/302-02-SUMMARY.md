---
phase: 302-per-wallet-topic-backend
plan: 02
subsystem: signing-sdk, notifications
tags: [ntfy, wallet-apps, per-wallet-topic, signing-channel, notification-channel]

# Dependency graph
requires:
  - phase: 302-01
    provides: "Migration v33 with sign_topic/notify_topic columns in wallet_apps table"
provides:
  - "SignRequestBuilder reads sign_topic from wallet_apps DB (CHAN-01)"
  - "WalletNotificationChannel reads notify_topic from wallet_apps DB (CHAN-02)"
  - "Global NtfyChannel removed from daemon lifecycle (CHAN-03)"
  - "Telegram/Discord/Slack channels unaffected (CHAN-04)"
  - "System events broadcast to all active wallet apps (CHAN-05)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DB-based topic routing: channel reads topic from wallet_apps table with prefix fallback"
    - "Optional sqlite injection: constructor accepts sqlite? to maintain backward compat"

key-files:
  created: []
  modified:
    - "packages/daemon/src/services/signing-sdk/sign-request-builder.ts"
    - "packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts"
    - "packages/daemon/src/lifecycle/daemon.ts"
    - "packages/daemon/src/__tests__/wallet-notification-channel.test.ts"

key-decisions:
  - "Optional sqlite in SignRequestBuilder constructor -- existing tests without sqlite still work via fallback"
  - "Removed walletConfig variable assignment since ntfy?.requestTopic no longer used -- getWallet() still called for validation"
  - "publishNotification receives resolved topic string directly instead of deriving from walletName"

patterns-established:
  - "Per-wallet topic pattern: SELECT sign_topic/notify_topic FROM wallet_apps with prefix fallback when NULL"

requirements-completed: [CHAN-01, CHAN-02, CHAN-03, CHAN-04, CHAN-05]

# Metrics
duration: 14min
completed: 2026-03-02
---

# Phase 302 Plan 02: Channel Topic Source Switch Summary

**SignRequestBuilder and WalletNotificationChannel switched to wallet_apps DB-based topic routing, global NtfyChannel removed from daemon lifecycle**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-02T05:21:05Z
- **Completed:** 2026-03-02T05:35:17Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- SignRequestBuilder reads sign_topic from wallet_apps table when sqlite is available, falls back to prefix+walletName when NULL or sqlite not provided
- WalletNotificationChannel reads notify_topic from wallet_apps table, falls back to waiaas-notify-{appName} when NULL
- Global NtfyChannel initialization removed from daemon.ts Step 4d, NtfyChannel import removed
- 3 new tests added: T-CHAN-02a (custom topic), T-CHAN-02b (NULL fallback), T-CHAN-05 (broadcast)
- All 21 wallet-notification-channel tests pass, all 29 approval-channel-router tests pass, all 11 signing-sdk-lifecycle tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Switch channel topic sources to wallet_apps DB + remove global NtfyChannel** - `78bdcb77` (feat)
2. **Task 2: Update tests for channel topic source changes** - `e823c99c` (test)

## Files Created/Modified
- `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` - Added optional sqlite dep, reads sign_topic from wallet_apps, removed walletConfig variable
- `packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts` - resolveAlertApps returns name+notifyTopic, publishNotification accepts resolved topic
- `packages/daemon/src/lifecycle/daemon.ts` - Removed global NtfyChannel init block, removed NtfyChannel from import, injected sqlite into SignRequestBuilder
- `packages/daemon/src/__tests__/wallet-notification-channel.test.ts` - 3 new tests for CHAN-02 and CHAN-05, MockWalletAppRow updated with notify_topic

## Decisions Made
- Optional sqlite in SignRequestBuilder constructor maintains backward compatibility with existing tests that do not inject sqlite
- walletConfig variable removed (only used for `walletConfig.ntfy?.requestTopic`), but `getWallet()` still called for wallet existence validation
- publishNotification signature changed from `walletName: string` to `topic: string` since topic is now resolved upstream

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused walletConfig variable causing TypeScript error**
- **Found during:** Task 1 (SignRequestBuilder topic source switch)
- **Issue:** After removing `walletConfig.ntfy?.requestTopic` reference, `walletConfig` was declared but never read (TS6133)
- **Fix:** Changed `const walletConfig = this.walletLinkRegistry.getWallet(walletName)` to bare call `this.walletLinkRegistry.getWallet(walletName)` -- the method is still called for its side effect (throws WALLET_NOT_REGISTERED if not found)
- **Files modified:** sign-request-builder.ts
- **Verification:** TypeScript compilation passes with 0 errors
- **Committed in:** 78bdcb77 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Straightforward TypeScript error fix. No scope creep.

## Issues Encountered

Pre-existing test failures (from Plan 01's schema v33 migration) were identified but not fixed since they are out of scope:
- `signing-sdk-migration.test.ts`: hardcoded version assertions (expect 32, got 33)
- `settings-service.test.ts`: setting count assertion (expect 144, got 143 after ntfy_topic removal)
- `migration-chain.test.ts`: schema equivalence assertions outdated
- These need to be addressed separately.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Per-wallet ntfy topic routing is fully operational
- SignRequestBuilder + WalletNotificationChannel both use wallet_apps.sign_topic/notify_topic
- Global NtfyChannel no longer manages notifications -- per-wallet topics are the single path
- Pre-existing migration test failures should be addressed in a future cleanup plan

## Self-Check: PASSED

All files exist, all commits verified:
- sign-request-builder.ts: FOUND
- wallet-notification-channel.ts: FOUND
- daemon.ts: FOUND
- wallet-notification-channel.test.ts: FOUND
- 302-02-SUMMARY.md: FOUND
- 78bdcb77 (Task 1): FOUND
- e823c99c (Task 2): FOUND

---
*Phase: 302-per-wallet-topic-backend*
*Completed: 2026-03-02*
