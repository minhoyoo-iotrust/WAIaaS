---
phase: 285-api-key-store-consolidation
plan: 01
subsystem: database, api, infra
tags: [sqlite, migration, settings, api-keys, admin]

requires:
  - phase: none
    provides: none
provides:
  - DB migration v28 (api_keys → settings)
  - SettingsService.hasApiKey/getApiKeyMasked/getApiKeyUpdatedAt helpers
  - Admin API key routes delegating to SettingsService
  - connect-info capabilities check using SettingsService
affects: [285-02, admin-ui, actions, hot-reload]

tech-stack:
  added: []
  patterns: [SettingsService SSoT for API keys, hot-reload on key change]

key-files:
  created: []
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/settings/settings-service.ts
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/routes/connect-info.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/infrastructure/action/index.ts
    - packages/daemon/src/infrastructure/database/index.ts
    - packages/daemon/src/infrastructure/keystore/re-encrypt.ts

key-decisions:
  - "API keys copied to settings with INSERT OR IGNORE to preserve manual settings"
  - "Empty string used as 'deleted' marker for API keys (SettingsService.set('', ...))"
  - "PUT/DELETE admin/api-keys now trigger onSettingsChanged for hot-reload"
  - "re-encrypt.ts simplified -- api_keys re-encryption removed since v28 moves keys to settings"

patterns-established:
  - "SettingsService SSoT: all credential-type settings including API keys go through SettingsService"
  - "hasApiKey pattern: check 'actions.{name}_api_key' in DB, decrypt + check non-empty"

requirements-completed: [APIKEY-01, APIKEY-03, APIKEY-04]

duration: 15min
completed: 2026-02-28
---

# Plan 285-01: DB migration v28 + admin route delegation to SettingsService

**v28 migration copies api_keys to settings table; admin API key routes and connect-info now delegate to SettingsService with hot-reload support**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-28
- **Completed:** 2026-02-28
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- DB migration v28 migrates api_keys encrypted data to settings table and drops api_keys
- SettingsService gains hasApiKey(), getApiKeyMasked(), getApiKeyUpdatedAt() helper methods
- Admin API key CRUD routes (GET/PUT/DELETE) fully delegate to SettingsService
- connect-info capabilities check uses SettingsService instead of ApiKeyStore
- ApiKeyStore no longer instantiated in daemon lifecycle

## Task Commits

1. **Task 1: DB migration v28 + schema cleanup** - `d4ff31b5` (feat)
2. **Task 2: Admin routes + server + daemon lifecycle** - `9362c3af` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrate.ts` - v28 migration + LATEST_SCHEMA_VERSION bump
- `packages/daemon/src/infrastructure/database/schema.ts` - Removed apiKeys table definition
- `packages/daemon/src/infrastructure/database/index.ts` - Removed apiKeys barrel export
- `packages/daemon/src/infrastructure/action/index.ts` - Removed ApiKeyStore/ApiKeyListEntry exports
- `packages/daemon/src/infrastructure/settings/settings-service.ts` - Added API key helper methods
- `packages/daemon/src/api/routes/admin.ts` - Rewired to SettingsService
- `packages/daemon/src/api/routes/connect-info.ts` - Replaced ApiKeyStore with SettingsService
- `packages/daemon/src/api/server.ts` - Removed apiKeyStore from deps
- `packages/daemon/src/lifecycle/daemon.ts` - Removed ApiKeyStore instantiation
- `packages/daemon/src/infrastructure/keystore/re-encrypt.ts` - Removed api_keys re-encryption

## Decisions Made
- Used INSERT OR IGNORE to avoid overwriting settings that were manually set before migration
- Setting key format: `actions.{provider_name}_api_key` (matches existing SETTING_DEFINITIONS)
- Empty string as deletion marker (SettingsService.set(key, '') instead of DB DELETE)
- PUT/DELETE trigger onSettingsChanged for hot-reload (new behavior vs old ApiKeyStore)

## Deviations from Plan

### Auto-fixed Issues

**1. re-encrypt.ts also imported apiKeys -- removed apiKeys re-encryption**
- **Found during:** Task 1 (schema cleanup)
- **Issue:** re-encrypt.ts had a section re-encrypting api_keys rows on password change
- **Fix:** Removed the section; API keys are now in settings table with encrypted=true and are covered by the existing settings re-encryption loop
- **Files modified:** packages/daemon/src/infrastructure/keystore/re-encrypt.ts
- **Verification:** No compile errors in re-encrypt.ts
- **Committed in:** d4ff31b5 (Task 1 commit)

**2. database/index.ts barrel also exported apiKeys**
- **Found during:** Task 2 (typecheck)
- **Issue:** Barrel export still referenced removed schema member
- **Fix:** Removed apiKeys from barrel export
- **Committed in:** d4ff31b5 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Essential for compile correctness. No scope creep.

## Issues Encountered
- Known remaining TS errors in api-key-store.ts and actions.ts (both resolved in Plan 285-02)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SettingsService SSoT established, ready for Plan 285-02 to delete ApiKeyStore and fix remaining references
- Actions route guard still references ApiKeyStore (Plan 285-02 scope)

---
*Phase: 285-api-key-store-consolidation*
*Completed: 2026-02-28*
