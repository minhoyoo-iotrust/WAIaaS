---
phase: 101-settings-api-hot-reload
plan: 02
subsystem: infra
tags: [hot-reload, notification, adapter-pool, settings, fire-and-forget]

# Dependency graph
requires:
  - phase: 101-01
    provides: "Admin settings API endpoints (GET/PUT /admin/settings) with onSettingsChanged callback placeholder"
  - phase: 100-02
    provides: "SettingsService with DB > config.toml > default fallback chain"
provides:
  - "HotReloadOrchestrator dispatching changed settings to notification/rpc/security subsystems"
  - "NotificationService.replaceChannels() for atomic channel hot-swap"
  - "AdapterPool.evict() for forcing adapter reconnection on RPC URL change"
  - "daemon.ts onSettingsChanged wired through HotReloadOrchestrator (fire-and-forget)"
affects: [admin-ui-settings, daemon-lifecycle, notifications, adapter-pool]

# Tech tracking
tech-stack:
  added: []
  patterns: [hot-reload-orchestrator, fire-and-forget-subsystem-reload, change-key-categorization]

key-files:
  created:
    - packages/daemon/src/infrastructure/settings/hot-reload.ts
    - packages/daemon/src/__tests__/settings-hot-reload.test.ts
  modified:
    - packages/daemon/src/notifications/notification-service.ts
    - packages/daemon/src/infrastructure/adapter-pool.ts
    - packages/daemon/src/infrastructure/settings/index.ts
    - packages/daemon/src/lifecycle/daemon.ts

key-decisions:
  - "HotReloadOrchestrator categorizes keys by prefix/set membership into 3 subsystems (notifications/rpc/security)"
  - "Security parameters require no reload action (DB-first read pattern already picks up new values)"
  - "Notification reload dynamically imports channel constructors (same pattern as daemon.ts Step 4d)"
  - "RPC reload evicts specific chain:network adapters, not all (lazy re-creation on next resolve)"

patterns-established:
  - "Fire-and-forget subsystem reload: errors caught and logged, never propagated to API response"
  - "Change-key categorization: Set/prefix matching to determine affected subsystems"
  - "Atomic channel replacement: replaceChannels() swaps array + clears rate limits in one call"

# Metrics
duration: 5min
completed: 2026-02-13
---

# Phase 101 Plan 02: Hot-Reload Summary

**HotReloadOrchestrator dispatching settings changes to notification channel swap, RPC adapter eviction, and security parameter refresh without daemon restart**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-13T14:41:29Z
- **Completed:** 2026-02-13T14:46:08Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- NotificationService.replaceChannels() atomically swaps channel instances and clears rate limits
- AdapterPool.evict() disconnects and removes specific chain:network adapter for lazy re-creation
- HotReloadOrchestrator categorizes changed keys into 3 subsystems with fire-and-forget error handling
- daemon.ts wires onSettingsChanged callback through HotReloadOrchestrator (replacing placeholder)
- 20 hot-reload tests covering all subsystems, error independence, and null deps

## Task Commits

Each task was committed atomically:

1. **Task 1: Subsystem reload methods + HotReloadOrchestrator** - `b9c3760` (feat)
2. **Task 2: Daemon wiring + hot-reload tests** - `bc10fad` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` - HotReloadOrchestrator with 3 subsystem reloaders
- `packages/daemon/src/notifications/notification-service.ts` - replaceChannels() + updateConfig() methods
- `packages/daemon/src/infrastructure/adapter-pool.ts` - evict() + evictAll() methods
- `packages/daemon/src/infrastructure/settings/index.ts` - Barrel export for HotReloadOrchestrator
- `packages/daemon/src/lifecycle/daemon.ts` - onSettingsChanged wired to HotReloadOrchestrator
- `packages/daemon/src/__tests__/settings-hot-reload.test.ts` - 20 tests for hot-reload

## Decisions Made
- HotReloadOrchestrator categorizes keys by prefix/set membership into 3 subsystems (notifications/rpc/security)
- Security parameters require no reload action (DB-first read pattern already picks up new values on next request)
- Notification reload dynamically imports channel constructors (same pattern as daemon.ts Step 4d)
- RPC reload evicts specific chain:network adapters, not all (lazy re-creation on next resolve())

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing test failures in database.test.ts and notification-log.test.ts (table count assertions expect 10 tables, now 11 after settings table added in Phase 100-01). Not caused by this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Hot-reload fully wired: admin PUT /admin/settings changes now take effect immediately
- Settings infrastructure complete (schema + crypto + service + API + hot-reload)
- Ready for next phase

---
*Phase: 101-settings-api-hot-reload*
*Completed: 2026-02-13*
