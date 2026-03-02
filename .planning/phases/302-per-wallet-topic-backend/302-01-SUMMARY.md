---
phase: 302-per-wallet-topic-backend
plan: 01
subsystem: database, api
tags: [sqlite, migration, ntfy, wallet-apps, drizzle, openapi, zod]

# Dependency graph
requires: []
provides:
  - "Migration v33: sign_topic/notify_topic columns in wallet_apps table"
  - "WalletAppService CRUD with topic fields (signTopic/notifyTopic)"
  - "REST API POST/PUT/GET wallet-apps with sign_topic/notify_topic"
  - "OpenAPI schema with topic fields"
  - "notifications.ntfy_topic removed from Admin Settings"
affects: [302-02-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-wallet ntfy topic stored in wallet_apps table (not global setting)"
    - "NULL topic = fallback to prefix+appName at runtime"

key-files:
  created:
    - "packages/daemon/src/__tests__/migration-v33.test.ts"
  modified:
    - "packages/daemon/src/infrastructure/database/schema.ts"
    - "packages/daemon/src/infrastructure/database/migrate.ts"
    - "packages/daemon/src/services/signing-sdk/wallet-app-service.ts"
    - "packages/daemon/src/api/routes/wallet-apps.ts"
    - "packages/daemon/src/api/routes/openapi-schemas.ts"
    - "packages/daemon/src/infrastructure/settings/setting-keys.ts"
    - "packages/daemon/src/infrastructure/settings/hot-reload.ts"
    - "packages/daemon/src/lifecycle/daemon.ts"
    - "packages/daemon/src/api/routes/admin.ts"
    - "packages/daemon/src/__tests__/wallet-app-service.test.ts"
    - "packages/daemon/src/__tests__/settings-hot-reload.test.ts"
    - "packages/daemon/src/__tests__/migration-v31.test.ts"

key-decisions:
  - "Auto-generate sign_topic=waiaas-sign-{name} and notify_topic=waiaas-notify-{name} as defaults"
  - "NULL topic values supported for runtime fallback (mapRow returns null)"
  - "Global NtfyChannel removed from hot-reload -- per-wallet topics managed by signing SDK layer"
  - "daemon.ts/admin.ts: ntfy_topic read from config.toml only (not settings DB)"

patterns-established:
  - "Per-wallet topic pattern: wallet_apps.sign_topic/notify_topic columns as ntfy topic source"

requirements-completed: [DBSC-01, DBSC-02, DBSC-03, DBSC-04, API-01, API-02, API-03, API-04, ASET-01, ASET-02, ASET-03]

# Metrics
duration: 8min
completed: 2026-03-02
---

# Phase 302 Plan 01: Per-Wallet Topic Backend Summary

**DB migration v33 with sign_topic/notify_topic columns, WalletAppService topic CRUD, REST API topic fields, and global ntfy_topic setting removal**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-02T05:09:33Z
- **Completed:** 2026-03-02T05:18:26Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Migration v33: Added sign_topic and notify_topic nullable TEXT columns to wallet_apps with backfill of existing rows
- WalletAppService: register() auto-generates topic defaults, update() supports topic modification, all queries include topic columns
- REST API: POST/PUT accept optional sign_topic/notify_topic, GET responses include them
- Admin Settings: notifications.ntfy_topic removed from SETTING_DEFINITIONS; hot-reload and daemon startup updated

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration v33 + Drizzle schema + LATEST_SCHEMA_VERSION bump** - `b71a3637` (feat)
2. **Task 2: WalletAppService + REST API + OpenAPI topic fields + Admin Settings cleanup** - `49346132` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/schema.ts` - Added signTopic/notifyTopic to walletApps Drizzle table
- `packages/daemon/src/infrastructure/database/migrate.ts` - LATEST_SCHEMA_VERSION=33, DDL update, migration v33 with backfill
- `packages/daemon/src/__tests__/migration-v33.test.ts` - 5 tests for column existence, backfill, version, nullable
- `packages/daemon/src/__tests__/migration-v31.test.ts` - Updated column count assertion (7->9), version assertion (>= 31)
- `packages/daemon/src/services/signing-sdk/wallet-app-service.ts` - WalletApp interface with topics, register/update/mapRow updated
- `packages/daemon/src/api/routes/openapi-schemas.ts` - sign_topic/notify_topic in WalletApp/Create/Update schemas
- `packages/daemon/src/api/routes/wallet-apps.ts` - toApiResponse + POST/PUT handlers pass topic fields
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - Removed notifications.ntfy_topic entry
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` - Removed global NtfyChannel creation and ntfy_topic from key set
- `packages/daemon/src/lifecycle/daemon.ts` - ntfy_topic read from config.toml only (not settings DB)
- `packages/daemon/src/api/routes/admin.ts` - ntfy enabled check uses config.toml only
- `packages/daemon/src/__tests__/wallet-app-service.test.ts` - 7 new tests for topic CRUD (27 total)
- `packages/daemon/src/__tests__/settings-hot-reload.test.ts` - Updated to use discord instead of ntfy_topic

## Decisions Made
- Auto-generate topic defaults: `waiaas-sign-{name}` and `waiaas-notify-{name}` (hardcoded prefix, no SettingsService dependency needed)
- NULL topic values mapped to null in WalletApp interface (supports runtime fallback)
- Removed global NtfyChannel from hot-reload since ntfy_topic is no longer a settings key
- daemon.ts and admin.ts fall back to config.toml for ntfy_topic (preserving backward compatibility for existing users)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed settings-hot-reload crash from removed ntfy_topic key**
- **Found during:** Task 2 (Admin Settings cleanup)
- **Issue:** Removing notifications.ntfy_topic from SETTING_DEFINITIONS caused SettingsService.get() to throw in hot-reload, daemon.ts, and admin.ts
- **Fix:** Removed global NtfyChannel from hot-reload, daemon.ts reads ntfy_topic from config.toml only, admin.ts uses config only
- **Files modified:** hot-reload.ts, daemon.ts, admin.ts, settings-hot-reload.test.ts
- **Verification:** All 19 hot-reload tests pass, typecheck clean, lint clean
- **Committed in:** 49346132 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed unused NtfyChannel import in hot-reload**
- **Found during:** Task 2 (typecheck after hot-reload changes)
- **Issue:** NtfyChannel import unused after removing global ntfy channel creation
- **Fix:** Removed NtfyChannel from dynamic import destructuring
- **Files modified:** hot-reload.ts
- **Verification:** Typecheck clean (0 errors)
- **Committed in:** 49346132 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed migration-v31 test assertions for column count and version**
- **Found during:** Task 1 (migration v33 additions)
- **Issue:** migration-v31 test expected exactly 7 columns and version 32, now 9 columns and version 33
- **Fix:** Changed assertions to 9 columns and >= 31 version check
- **Files modified:** migration-v31.test.ts
- **Verification:** All 4 migration-v31 tests pass
- **Committed in:** b71a3637 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- wallet_apps table has sign_topic/notify_topic columns ready for Plan 02 channel routing
- WalletAppService provides topic data for NtfySigningChannel and WalletNotificationChannel
- Plan 02 can now switch channel topic source from settings to wallet_apps

---
*Phase: 302-per-wallet-topic-backend*
*Completed: 2026-03-02*
