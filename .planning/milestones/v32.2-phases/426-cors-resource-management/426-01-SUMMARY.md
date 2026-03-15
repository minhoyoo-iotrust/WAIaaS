---
phase: 426-cors-resource-management
plan: 01
subsystem: api, notifications, infra
tags: [cors, hono, abort-signal, eventbus, security]

# Dependency graph
requires:
  - phase: 425-rate-limit-middleware
    provides: Rate limit middleware in createApp()
provides:
  - CORS middleware with dynamic origin from settingsService
  - Notification channel fetch timeouts (10s AbortSignal)
  - AutoStop EventBus listener cleanup on stop()
affects: [admin-ui, notifications, autostop]

# Tech tracking
tech-stack:
  added: [hono/cors]
  patterns: [AbortSignal.timeout for external HTTP calls, EventBus listener lifecycle management]

key-files:
  created:
    - packages/daemon/src/__tests__/cors-resource-management.test.ts
  modified:
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/notifications/channels/ntfy.ts
    - packages/daemon/src/notifications/channels/discord.ts
    - packages/daemon/src/notifications/channels/slack.ts
    - packages/daemon/src/services/autostop/autostop-service.ts

key-decisions:
  - "CORS origin callback returns matched origin or null (hono/cors convention)"
  - "Config path corrected: cors_origins is in security section, not daemon"

patterns-established:
  - "EventBus listener lifecycle: store references in private fields, off() in stop()"
  - "AbortSignal.timeout(10_000) on all external notification fetch calls"

requirements-completed: [CORS-01, CORS-02, RSRC-01, RSRC-02, RSRC-03]

# Metrics
duration: 5min
completed: 2026-03-15
---

# Phase 426 Plan 01: CORS + Resource Management Summary

**hono/cors middleware with dynamic origin, 10s AbortSignal on 3 notification channels, AutoStop EventBus listener cleanup**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-15T15:29:04Z
- **Completed:** 2026-03-15T15:34:09Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- CORS middleware registered as first middleware in createApp() with dynamic origin from settingsService/config
- AbortSignal.timeout(10_000) added to NtfyChannel, DiscordChannel, SlackChannel fetch calls
- AutoStopService stores EventBus listener references and removes them in stop()
- 9 tests covering CORS preflight/allowed/blocked, fetch signal verification, and listener lifecycle

## Task Commits

Each task was committed atomically:

1. **Task 1: CORS middleware + notification timeout + AutoStop listener cleanup** - `77de07f7` (feat)
2. **Task 2: CORS preflight + notification timeout + AutoStop listener tests** - `c479411b` (test)

## Files Created/Modified
- `packages/daemon/src/api/server.ts` - CORS middleware registration with dynamic origin
- `packages/daemon/src/notifications/channels/ntfy.ts` - AbortSignal.timeout(10_000) on fetch
- `packages/daemon/src/notifications/channels/discord.ts` - AbortSignal.timeout(10_000) on fetch
- `packages/daemon/src/notifications/channels/slack.ts` - AbortSignal.timeout(10_000) on fetch
- `packages/daemon/src/services/autostop/autostop-service.ts` - Listener reference storage + off() in stop()
- `packages/daemon/src/__tests__/cors-resource-management.test.ts` - 9 tests for all 3 areas

## Decisions Made
- CORS origin callback returns matched origin or null (hono/cors convention for disallowed origins)
- Config path corrected: cors_origins is in config.security section, not config.daemon (auto-fix Rule 1)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Config path for cors_origins**
- **Found during:** Task 1 (CORS middleware)
- **Issue:** Plan specified `deps.config?.daemon?.cors_origins` but cors_origins is in the security section
- **Fix:** Changed to `deps.config?.security?.cors_origins`
- **Files modified:** packages/daemon/src/api/server.ts
- **Verification:** TypeScript typecheck passed
- **Committed in:** 77de07f7

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Config path correction was necessary for typecheck. No scope creep.

## Issues Encountered
- Pre-existing admin-autostop-api.test.ts failures (8 tests returning 400) -- confirmed present before changes. Not caused by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 3 security patches (SSRF, Rate Limit, CORS+Resource) complete
- Milestone v32.2 ready for completion

---
*Phase: 426-cors-resource-management*
*Completed: 2026-03-15*
