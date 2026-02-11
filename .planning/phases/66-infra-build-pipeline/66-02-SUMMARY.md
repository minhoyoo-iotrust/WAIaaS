---
phase: 66-infra-build-pipeline
plan: 02
subsystem: infra
tags: [hono, serve-static, csp, kill-switch, admin-ui, config, version]

# Dependency graph
requires:
  - phase: 66-infra-build-pipeline-01
    provides: "@waiaas/admin Vite+Preact build pipeline with postbuild copy to daemon/public/admin/"
  - phase: 65-admin-web-ui-design
    provides: Admin UI specification (doc 67) with CSP policy and config schema
provides:
  - "serveStatic serving Admin SPA at /admin with CSP headers"
  - "admin_ui and admin_timeout config keys in DaemonConfigSchema"
  - "adminTimeout field in GET /v1/admin/status response"
  - "Kill Switch bypass for /admin paths (UI recovery access)"
  - "Dynamic version from package.json (no more 0.0.0 hardcoding)"
affects: [67-auth-app-shell, 68-dashboard-wallet, 69-policy-settings, 70-activity-status]

# Tech tracking
tech-stack:
  added: []
  patterns: [csp-middleware, serve-static-absolute-path, createRequire-json-import, kill-switch-spa-bypass]

key-files:
  created:
    - packages/daemon/src/api/middleware/csp.ts
  modified:
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/api/middleware/index.ts
    - packages/daemon/src/api/middleware/kill-switch-guard.ts
    - packages/daemon/src/infrastructure/config/loader.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/routes/health.ts
    - packages/daemon/src/__tests__/api-server.test.ts
    - packages/daemon/src/__tests__/api-admin-endpoints.test.ts
    - packages/daemon/src/__tests__/api-agents.test.ts
    - packages/daemon/src/__tests__/api-hint-field.test.ts
    - packages/daemon/src/__tests__/api-new-endpoints.test.ts
    - packages/daemon/src/__tests__/api-policies.test.ts
    - packages/daemon/src/__tests__/api-transactions.test.ts

key-decisions:
  - "CSP uses default-src 'none' with explicit script-src 'self' (strictest policy compatible with SPA)"
  - "ADMIN_STATIC_ROOT computed from import.meta.url via fileURLToPath+dirname+join for CWD independence"
  - "Version loaded via createRequire(import.meta.url) to work around verbatimModuleSyntax ESM JSON import restriction"
  - "admin_ui=false disables entire static serving block (conditional route registration, not 403)"
  - "Kill Switch bypass includes both /admin (exact) and /admin/* (prefix) for SPA recovery access"

patterns-established:
  - "CSP middleware pattern: createMiddleware sets header after next() for response-phase header injection"
  - "Absolute path resolution: fileURLToPath + dirname + join from import.meta.url for runtime path independence"
  - "Version injection: createRequire for JSON module import in strict ESM packages"

# Metrics
duration: 5min
completed: 2026-02-11
---

# Phase 66 Plan 02: Daemon Admin Serving Summary

**CSP-secured serveStatic at /admin with Kill Switch bypass, config toggle, adminTimeout in status API, and dynamic version from package.json**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-11T06:37:38Z
- **Completed:** 2026-02-11T06:42:57Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Created CSP middleware with strict Content-Security-Policy for Admin UI paths
- Added serveStatic serving SPA from daemon/public/admin/ with SPA fallback to index.html
- Extended DaemonConfigSchema with admin_ui (boolean, default true) and admin_timeout (int 60-7200, default 900)
- Added adminTimeout field to AdminStatusResponseSchema and GET /admin/status handler
- Fixed version hardcoding (INFRA-07): health.ts, server.ts, and OpenAPI doc now read from package.json
- Kill Switch guard now bypasses /admin and /admin/* paths for recovery UI access
- All 462 existing tests pass with updated version assertions and config fixtures

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CSP middleware + config extension + version fix** - `15c59f3` (feat)
2. **Task 2: Add static file serving + SPA fallback + Kill Switch bypass** - `a80ad11` (feat)

## Files Created/Modified
- `packages/daemon/src/api/middleware/csp.ts` - CSP middleware with strict Content-Security-Policy header
- `packages/daemon/src/api/middleware/index.ts` - Barrel export for cspMiddleware
- `packages/daemon/src/api/server.ts` - serveStatic, CSP, SPA fallback, DAEMON_VERSION, adminTimeout
- `packages/daemon/src/api/middleware/kill-switch-guard.ts` - Added /admin bypass for SPA recovery
- `packages/daemon/src/infrastructure/config/loader.ts` - admin_ui and admin_timeout in daemon section
- `packages/daemon/src/api/routes/openapi-schemas.ts` - adminTimeout field in AdminStatusResponseSchema
- `packages/daemon/src/api/routes/admin.ts` - adminTimeout in AdminRouteDeps and status handler
- `packages/daemon/src/api/routes/health.ts` - Dynamic DAEMON_VERSION via createRequire
- `packages/daemon/src/__tests__/api-server.test.ts` - Version assertion updated to regex match
- `packages/daemon/src/__tests__/api-admin-endpoints.test.ts` - Version assertion + mockConfig admin fields
- `packages/daemon/src/__tests__/api-agents.test.ts` - mockConfig admin_ui/admin_timeout fields
- `packages/daemon/src/__tests__/api-hint-field.test.ts` - mockConfig admin_ui/admin_timeout fields
- `packages/daemon/src/__tests__/api-new-endpoints.test.ts` - mockConfig admin_ui/admin_timeout fields
- `packages/daemon/src/__tests__/api-policies.test.ts` - mockConfig admin_ui/admin_timeout fields
- `packages/daemon/src/__tests__/api-transactions.test.ts` - mockConfig admin_ui/admin_timeout fields

## Decisions Made
- CSP uses `default-src 'none'` as base with explicit allowlists per directive -- strictest policy compatible with self-hosted SPA
- `ADMIN_STATIC_ROOT` computed as absolute path from `import.meta.url` via `fileURLToPath` + `dirname` + `join` -- ensures correct resolution regardless of CWD (daemon may start from data directory via CLI)
- Version loaded via `createRequire(import.meta.url)` rather than JSON import -- works around verbatimModuleSyntax restriction in ESM packages
- `admin_ui=false` completely skips route registration (conditional block), not returning 403 -- clean 404 for disabled admin
- Kill Switch bypass includes both `/admin` (exact) and `/admin/*` (prefix) -- SPA recovery requires serving static files during emergency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated mockConfig in 5 additional test files**
- **Found during:** Task 1 (config schema extension)
- **Issue:** Adding admin_ui and admin_timeout to DaemonConfigSchema caused TypeScript errors in 5 other test files that explicitly define DaemonConfig objects (api-agents, api-hint-field, api-new-endpoints, api-policies, api-transactions)
- **Fix:** Added `admin_ui: true, admin_timeout: 900` to mockConfig() in all 5 files
- **Files modified:** api-agents.test.ts, api-hint-field.test.ts, api-new-endpoints.test.ts, api-policies.test.ts, api-transactions.test.ts
- **Verification:** `pnpm --filter @waiaas/daemon typecheck` passes (excluding pre-existing notification-service errors)
- **Committed in:** `15c59f3` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary config schema propagation to test fixtures. No scope creep.

## Issues Encountered
- Pre-existing daemon build failure from notification-service.test.ts TypeScript errors -- not related to admin changes, noted in STATE.md

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Admin SPA serving infrastructure complete for Phase 67 (auth + app shell)
- CSP headers in place for secure script/style loading
- adminTimeout available in status API for frontend session timeout configuration
- Version correctly reflects package.json for build verification
- Kill Switch bypass ensures admin UI accessible during emergency recovery

## Self-Check: PASSED

---
*Phase: 66-infra-build-pipeline*
*Completed: 2026-02-11*
