---
phase: 91-daemon-api-jwt-config
plan: 03
subsystem: api
tags: [notification, keystore, wallet-terminology, interface-rename]

# Dependency graph
requires:
  - phase: 91-01
    provides: "daemon API/JWT/config wallet rename (27 source files)"
  - phase: 91-02
    provides: "daemon test files wallet rename (37 test files)"
provides:
  - "NotificationPayload.walletId in @waiaas/core (agentId removed)"
  - "ILocalKeyStore walletId parameters in @waiaas/core (agentId removed)"
  - "All notification channels (ntfy, telegram, discord) use payload.walletId"
  - "LocalKeyStore uses walletId throughout"
affects: [mcp, sdk, admin, notifications]

# Tech tracking
tech-stack:
  added: []
  patterns: ["core interface walletId consistency"]

key-files:
  created: []
  modified:
    - "packages/core/src/interfaces/INotificationChannel.ts"
    - "packages/core/src/interfaces/ILocalKeyStore.ts"
    - "packages/daemon/src/notifications/notification-service.ts"
    - "packages/daemon/src/notifications/channels/ntfy.ts"
    - "packages/daemon/src/notifications/channels/telegram.ts"
    - "packages/daemon/src/notifications/channels/discord.ts"
    - "packages/daemon/src/api/routes/admin.ts"
    - "packages/daemon/src/infrastructure/keystore/keystore.ts"
    - "packages/daemon/src/__tests__/notification-service.test.ts"
    - "packages/daemon/src/__tests__/notification-channels.test.ts"

key-decisions:
  - "Core interfaces now use walletId (reversing 91-01 boundary preservation decision)"
  - "Notification channel labels changed Agent->Wallet in user-facing output"

patterns-established:
  - "All @waiaas/core interfaces use walletId parameter names consistently"

# Metrics
duration: 6min
completed: 2026-02-13
---

# Phase 91 Plan 03: Core Interface Gap Closure Summary

**NotificationPayload.walletId and ILocalKeyStore walletId parameters in @waiaas/core, propagated to all daemon notification channels, keystore, and test files**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-12T17:40:05Z
- **Completed:** 2026-02-12T17:46:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Renamed NotificationPayload.agentId to walletId in @waiaas/core interface
- Renamed all ILocalKeyStore method parameters from agentId to walletId
- Updated all 3 notification channels (ntfy, telegram, discord) to use payload.walletId with "Wallet:" labels
- Updated notification-service.ts notify() parameter and all DB mappings
- Updated admin test payload and keystore implementation throughout
- All 681 daemon tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename core interfaces + daemon notification chain** - `488a119` (feat)
2. **Task 2: Update notification + keystore test files and verify all tests pass** - `2774e15` (test)

## Files Created/Modified
- `packages/core/src/interfaces/INotificationChannel.ts` - NotificationPayload.agentId -> walletId
- `packages/core/src/interfaces/ILocalKeyStore.ts` - All method params agentId -> walletId
- `packages/daemon/src/notifications/notification-service.ts` - notify() param + DB mappings
- `packages/daemon/src/notifications/channels/ntfy.ts` - payload.walletId, "Wallet:" label
- `packages/daemon/src/notifications/channels/telegram.ts` - payload.walletId, "Wallet:" label
- `packages/daemon/src/notifications/channels/discord.ts` - payload.walletId, "Wallet:" field name
- `packages/daemon/src/api/routes/admin.ts` - Test payload agentId -> walletId
- `packages/daemon/src/infrastructure/keystore/keystore.ts` - All method params + internal refs
- `packages/daemon/src/__tests__/notification-service.test.ts` - Assertions agentId -> walletId
- `packages/daemon/src/__tests__/notification-channels.test.ts` - makePayload + label assertions

## Decisions Made
- Core interfaces now use walletId directly (reversing the 91-01 decision to preserve agentId at core boundary). The verification gap closure required this change.
- Notification channel user-facing labels changed from "Agent:" to "Wallet:" to match the terminology rename

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed readKeystoreFile body reference after parameter rename**
- **Found during:** Task 1 (keystore.ts rename)
- **Issue:** readKeystoreFile parameter renamed to walletId but body still referenced agentId on line 354
- **Fix:** Changed `this.keystorePath(agentId)` to `this.keystorePath(walletId)` in readKeystoreFile
- **Files modified:** packages/daemon/src/infrastructure/keystore/keystore.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** 488a119 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix -- would have caused TypeScript compilation error. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 91 verification gaps are now fully closed
- All core interfaces use walletId consistently
- Ready for Phase 92+ execution

## Self-Check: PASSED

- All 10 modified files verified present on disk
- Both commit hashes (488a119, 2774e15) verified in git log
- 681 tests pass, 0 failures
- Zero agentId references in target files

---
*Phase: 91-daemon-api-jwt-config*
*Completed: 2026-02-13*
