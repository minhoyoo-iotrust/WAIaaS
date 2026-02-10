---
phase: 60-notification-system
plan: 02
subsystem: notifications
tags: [notification-service, rate-limiting, fallback-chain, broadcast, audit-log, daemon-lifecycle]

# Dependency graph
requires:
  - phase: 60-notification-system
    provides: 3 channel adapters (Telegram/Discord/ntfy), 21 event type enums, en/ko message templates
  - phase: 48-core-infra
    provides: INotificationChannel interface, NotificationPayload type, auditLog schema
provides:
  - NotificationService orchestrator with priority-based fallback delivery
  - Broadcast mode for KILL_SWITCH_ACTIVATED/RECOVERED, AUTO_STOP_TRIGGERED events
  - Per-channel rate limiting (sliding window, configurable RPM)
  - CRITICAL audit_log on total notification failure
  - DaemonLifecycle Step 4d fail-soft NotificationService initialization
  - CreateAppDeps.notificationService for route handler injection
  - Config expansion: locale and rate_limit_rpm in notifications section
affects: [61-ts-sdk, 62-python-sdk, 63-mcp-server]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Priority-based fallback: try channels in order, stop on first success"
    - "Broadcast mode: Promise.allSettled to all channels for critical events"
    - "Sliding window rate limiting: per-channel timestamp array with configurable RPM"
    - "Fail-soft service initialization: notification failures do not block daemon startup"

key-files:
  created:
    - packages/daemon/src/notifications/notification-service.ts
    - packages/daemon/src/notifications/index.ts
    - packages/daemon/src/__tests__/notification-service.test.ts
  modified:
    - packages/daemon/src/infrastructure/config/loader.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/__tests__/config-loader.test.ts
    - packages/daemon/src/__tests__/api-admin-endpoints.test.ts
    - packages/daemon/src/__tests__/api-agents.test.ts
    - packages/daemon/src/__tests__/api-hint-field.test.ts
    - packages/daemon/src/__tests__/api-new-endpoints.test.ts
    - packages/daemon/src/__tests__/api-policies.test.ts
    - packages/daemon/src/__tests__/api-transactions.test.ts

key-decisions:
  - "Fallback mode logCriticalFailure receives no PromiseSettledResult array -- errors field is 'All channels failed' (not individual errors)"
  - "Config locale and rate_limit_rpm added to DaemonConfigSchema notifications section (not core ConfigSchema)"

patterns-established:
  - "NotificationService.notify() as single entry point for all event notification"
  - "BROADCAST_EVENTS Set for critical event types that send to all channels simultaneously"
  - "Dynamic import of schema in logCriticalFailure to avoid circular deps"

# Metrics
duration: 7min
completed: 2026-02-11
---

# Phase 60 Plan 02: NotificationService Orchestrator Summary

**NotificationService with priority fallback, broadcast for critical events, per-channel rate limiting, CRITICAL audit_log, and daemon lifecycle integration with 31 tests**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-10T15:41:21Z
- **Completed:** 2026-02-10T15:48:42Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- NotificationService orchestrator with priority-based fallback delivery (try channels in order, stop on first success)
- Broadcast mode sends KILL_SWITCH_ACTIVATED/RECOVERED and AUTO_STOP_TRIGGERED to ALL channels simultaneously via Promise.allSettled
- Per-channel rate limiting with sliding window (configurable RPM, default 20/min)
- CRITICAL audit_log entry written when all notification channels fail
- DaemonLifecycle Step 4d: fail-soft initialization of NotificationService from config.toml
- CreateAppDeps expanded with notificationService field for route handler injection
- Config expanded with locale (en/ko) and rate_limit_rpm fields
- 31 comprehensive tests covering all delivery modes

## Task Commits

Each task was committed atomically:

1. **Task 1: NotificationService orchestrator + config expansion + rate limiter** - `b6b8b44` (feat)
2. **Task 2: Daemon lifecycle integration + tests** - `7a1bbf7` (feat)

## Files Created/Modified
- `packages/daemon/src/notifications/notification-service.ts` - NotificationService orchestrator class
- `packages/daemon/src/notifications/index.ts` - Barrel export for notification module
- `packages/daemon/src/__tests__/notification-service.test.ts` - 31 tests for NotificationService
- `packages/daemon/src/infrastructure/config/loader.ts` - Added locale and rate_limit_rpm to DaemonConfigSchema
- `packages/daemon/src/lifecycle/daemon.ts` - Step 4d NotificationService initialization + pass to createApp
- `packages/daemon/src/api/server.ts` - NotificationService type import + CreateAppDeps field
- `packages/daemon/src/__tests__/config-loader.test.ts` - Added locale/rate_limit_rpm default assertions
- `packages/daemon/src/__tests__/api-*.test.ts` (6 files) - Added locale/rate_limit_rpm to mock config objects

## Decisions Made
- Fallback mode `logCriticalFailure` receives no `PromiseSettledResult` array, so errors field is the generic string "All channels failed" rather than individual channel error messages (broadcast mode does pass individual errors)
- Config fields `locale` and `rate_limit_rpm` added to `DaemonConfigSchema.notifications` in loader.ts (not the simpler core `ConfigSchema`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated 6 existing test files with new config fields**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Existing test files had hardcoded DaemonConfig mock objects missing the new `locale` and `rate_limit_rpm` fields, causing TS2739 compilation errors
- **Fix:** Added `locale: 'en' as const` and `rate_limit_rpm: 20` to all 6 affected test files
- **Files modified:** api-admin-endpoints.test.ts, api-agents.test.ts, api-hint-field.test.ts, api-new-endpoints.test.ts, api-policies.test.ts, api-transactions.test.ts
- **Verification:** `npx tsc --noEmit` passes, all tests pass
- **Committed in:** `b6b8b44` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary type-level fix for existing tests. No scope creep.

## Issues Encountered
- Pre-existing @waiaas/cli e2e-errors.test.ts failure (expects 404, gets 401) remains -- not related to notification changes, documented in STATE.md

## User Setup Required
None - no external service configuration required. Channel credentials are configured at runtime via config.toml.

## Next Phase Readiness
- NotificationService fully operational and injectable via CreateAppDeps
- All 3 channels (Telegram/Discord/ntfy) can be auto-initialized from config.toml
- Phase 60 (notification system) complete: channels + orchestrator + tests
- Ready for Phase 61 (TypeScript SDK)
- No blockers

## Self-Check: PASSED

---
*Phase: 60-notification-system*
*Completed: 2026-02-11*
