---
phase: 227-config-settings-notifications
plan: 01
subsystem: infra
tags: [zod, config, toml, env-override, incoming-tx-monitor]

# Dependency graph
requires:
  - phase: 226-04
    provides: "7 incoming.* setting keys in setting-keys.ts + HotReload incoming detection"
provides:
  - "DaemonConfigSchema [incoming] section with 7 Zod-validated keys"
  - "KNOWN_SECTIONS includes 'incoming' enabling WAIAAS_INCOMING_* env override"
  - "Config-loader tests verifying defaults, TOML parsing, env override, validation"
affects: [227-02, 228, 229]

# Tech tracking
tech-stack:
  added: []
  patterns: ["config.toml section + KNOWN_SECTIONS + Zod defaults matching setting-keys.ts SSoT"]

key-files:
  created: []
  modified:
    - packages/daemon/src/infrastructure/config/loader.ts
    - packages/daemon/src/__tests__/config-loader.test.ts

key-decisions:
  - "No mode key: setting-keys.ts uses cooldown_minutes instead (subscriber auto-detects WS vs polling)"
  - "7 keys match setting-keys.ts SSoT exactly: enabled, poll_interval, retention_days, suspicious_dust_usd, suspicious_amount_multiplier, cooldown_minutes, wss_url"

patterns-established:
  - "Config section + KNOWN_SECTIONS + setting-keys.ts triple SSoT consistency pattern"

requirements-completed: [CFG-01, CFG-02, CFG-03, CFG-05]

# Metrics
duration: 3min
completed: 2026-02-22
---

# Phase 227 Plan 01: Config + Settings + Notifications Summary

**config.toml [incoming] section with 7 Zod-validated keys, WAIAAS_INCOMING_* env override, and 7 new tests including CFG-02/CFG-03 cross-verification**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T16:50:52Z
- **Completed:** 2026-02-21T16:53:56Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `incoming` z.object() section to DaemonConfigSchema with 7 keys and correct defaults matching setting-keys.ts
- Added 'incoming' to KNOWN_SECTIONS enabling automatic WAIAAS_INCOMING_* env var mapping
- Added 7 tests covering: defaults, TOML parsing, env override (enabled + poll_interval), Zod validation rejection, CFG-02 (setting-keys count), CFG-03 (HotReload constant)
- All 56 config-loader tests pass (49 existing + 7 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add incoming section to DaemonConfigSchema and KNOWN_SECTIONS** - `de139986` (feat)
2. **Task 2: Add config-loader tests for [incoming] section + verify CFG-02/CFG-03** - `3ed15c3c` (test)

## Files Created/Modified
- `packages/daemon/src/infrastructure/config/loader.ts` - Added incoming z.object() with 7 keys + 'incoming' in KNOWN_SECTIONS + updated section count comment
- `packages/daemon/src/__tests__/config-loader.test.ts` - Added 7 tests in new [incoming] section describe block + SETTING_DEFINITIONS import

## Decisions Made
- No `mode` key added: setting-keys.ts uses `cooldown_minutes` instead. The subscriber auto-detects WebSocket vs polling mode, so a separate `mode` config key is unnecessary.
- CFG-03 verified by reading hot-reload.ts source for INCOMING_KEYS_PREFIX constant (not exported, so direct import not possible).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing @waiaas/core build error (TX_INCOMING/TX_INCOMING_SUSPICIOUS missing in signing-protocol.ts category mapping) from uncommitted Phase 226-04 changes. This is out of scope for 227-01 and will be resolved in 227-02 which handles notification event types. The daemon config loader itself compiles correctly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- config.toml [incoming] section ready for operator use
- WAIAAS_INCOMING_* env vars functional via KNOWN_SECTIONS
- Ready for 227-02: notification event types + i18n templates + Admin UI IncomingSettings
- Pre-existing core build error needs resolution in 227-02

## Self-Check: PASSED

- FOUND: packages/daemon/src/infrastructure/config/loader.ts
- FOUND: packages/daemon/src/__tests__/config-loader.test.ts
- FOUND: .planning/phases/227-config-settings-notifications/227-01-SUMMARY.md
- FOUND: de139986 (Task 1 commit)
- FOUND: 3ed15c3c (Task 2 commit)

---
*Phase: 227-config-settings-notifications*
*Completed: 2026-02-22*
