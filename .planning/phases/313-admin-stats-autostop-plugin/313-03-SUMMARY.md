---
phase: 313-admin-stats-autostop-plugin
plan: 03
subsystem: admin-autostop-api
tags: [autostop, api, admin-ui, settings]
dependency_graph:
  requires: [313-01 IAutoStopRule + RuleRegistry, 313-02 AdminStatsService + stats API]
  provides: [GET /admin/autostop/rules, PUT /admin/autostop/rules/:id, per-rule settings, dashboard stats cards]
  affects: [admin routes, hot-reload, settings, admin UI dashboard, error codes]
tech_stack:
  added: [RULE_NOT_FOUND error code, per-rule setting keys, dashboard stats polling]
  patterns: [registry-backed REST API, per-entity enable/disable settings, 30s polling]
key_files:
  created:
    - packages/daemon/src/__tests__/admin-autostop-api.test.ts
  modified:
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/infrastructure/settings/hot-reload.ts
    - packages/daemon/src/__tests__/autostop-integration.test.ts
    - packages/admin/src/api/endpoints.ts
    - packages/admin/src/pages/dashboard.tsx
decisions:
  - "RULE_NOT_FOUND error code at 404 level in ADMIN domain"
  - "Per-rule settings use key pattern: autostop.rule.{id}.enabled"
  - "Hot-reload extracts rule ID from setting key and calls registry.setEnabled()"
  - "masterAuth middleware registered for /admin/stats and /admin/autostop/* paths"
  - "Admin UI stats cards placed below existing dashboard content, 30s polling"
metrics:
  duration: ~10min
  completed: 2026-03-03
---

# Phase 313 Plan 03: AutoStop REST API + Admin Settings + Admin UI Stats Summary

AutoStop rules REST API (GET/PUT) with per-rule enable/disable settings and hot-reload wiring, plus Admin UI dashboard stats cards displaying RPC, AutoStop, notifications, and system info with 30-second polling.

## Tasks Completed

### Task 1: AutoStop rules REST API + per-rule settings + hot-reload wiring (TDD)
- **Commit:** ea295979
- Added RULE_NOT_FOUND error code (404, ADMIN domain) with en/ko i18n messages
- GET /v1/admin/autostop/rules returns { globalEnabled, rules: [3 rules with status/config/state] }
- PUT /v1/admin/autostop/rules/:id updates enabled/config per rule, persists to Admin Settings
- 3 per-rule setting keys: autostop.rule.{consecutive_failures,unusual_activity,idle_timeout}.enabled
- Hot-reload handles per-rule enable/disable via registry.setEnabled() on setting change
- Added masterAuth middleware for /admin/stats and /admin/autostop/* paths
- 8 REST API tests: GET 3 rules, GET empty, GET/PUT 401, PUT enabled, PUT config, PUT 404, GET-after-PUT
- Updated autostop-integration test (6 -> 9 setting keys)

### Task 2: Admin UI Dashboard stats cards with 30s polling
- **Commit:** 21fb974a
- AdminStats interface matching 7-category API response shape
- fetchStats() with 30s setInterval polling alongside existing status/defi
- RPC Network Status table (network, calls, errors, avg latency)
- AutoStop Rules table (id, name, enabled/disabled badge, tracked count)
- Notifications summary cards (sent/failed 24h with danger badge)
- System info cards (DB size via formatBytes, schema version, Node.js, platform)
- ADMIN_STATS and ADMIN_AUTOSTOP_RULES endpoint constants in admin endpoints

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] WAIaaSError constructor signature**
- **Found during:** Task 1 (typecheck)
- **Issue:** Plan suggested `WAIaaSError('RULE_NOT_FOUND', 404)` but constructor takes `(code, options?)`
- **Fix:** Changed to `WAIaaSError('RULE_NOT_FOUND')` -- httpStatus comes from error code entry
- **Files modified:** packages/daemon/src/api/routes/admin.ts

**2. [Rule 3 - Blocking] Missing masterAuth middleware for new routes**
- **Found during:** Task 1 (tests showed 200 instead of 401 without auth)
- **Issue:** New /admin/stats and /admin/autostop/* routes had no masterAuth middleware registered
- **Fix:** Added `app.use('/v1/admin/stats', masterAuthForAdmin)` and `app.use('/v1/admin/autostop/*', masterAuthForAdmin)` in server.ts
- **Files modified:** packages/daemon/src/api/server.ts

**3. [Rule 3 - Blocking] Missing i18n messages for new error code**
- **Found during:** Task 1 (core build failure)
- **Issue:** RULE_NOT_FOUND error code added but i18n en.ts/ko.ts didn't have corresponding message
- **Fix:** Added messages to both en.ts and ko.ts
- **Files modified:** packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts

**4. [Rule 1 - Bug] Setting count test assertion outdated**
- **Found during:** Task 1 (autostop-integration test failure)
- **Issue:** Test expected 6 autostop setting keys but now 9 (added 3 per-rule keys)
- **Fix:** Updated test from 6 to 9 and added assertions for new keys
- **Files modified:** packages/daemon/src/__tests__/autostop-integration.test.ts

## Verification

- 8 admin-autostop-api tests passing
- 49 autostop tests passing (16 integration + 10 registry + 23 rules)
- 13 admin-stats tests passing
- Daemon typecheck passing with zero errors
- Pre-existing admin UI type errors in unrelated files (policies.tsx, transactions.tsx, wallets.tsx) -- not in scope
