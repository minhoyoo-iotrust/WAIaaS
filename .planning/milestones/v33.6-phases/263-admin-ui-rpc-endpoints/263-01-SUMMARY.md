---
phase: 263-admin-ui-rpc-endpoints
plan: 01
subsystem: ui
tags: [admin-ui, rpc, pool, multi-url, endpoint-management, preact, openapi]

# Dependency graph
requires:
  - "262-01: rpc_pool.* SettingDefinitions and HotReloadOrchestrator merge pipeline"
provides:
  - "GET /admin/rpc-status endpoint returning RpcPool.getStatus() per network"
  - "Multi-URL RPC Endpoints tab with per-network collapsible sections"
  - "ADMIN_RPC_STATUS frontend endpoint constant"
  - "CSS styles for rpc-pool-network, rpc-url-item, badge-builtin"
  - "BUILT_IN_RPC_URLS frontend constant mirroring @waiaas/core defaults"
affects: [264-monitoring-admin-ui, 263-02-live-status-display]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Multi-URL list management with add/delete/reorder controls per network", "Built-in URL labeling with enable/disable toggle (no delete)", "rpc_pool.* JSON array persistence via PUT /admin/settings"]

key-files:
  created:
    - packages/daemon/src/__tests__/admin-rpc-status.test.ts
    - packages/admin/src/__tests__/wallets-rpc-pool.test.tsx
  modified:
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/server.ts
    - packages/admin/src/api/endpoints.ts
    - packages/admin/src/pages/wallets.tsx
    - packages/admin/src/utils/settings-helpers.ts
    - packages/admin/src/styles/global.css

key-decisions:
  - "User URLs saved as JSON arrays (excluding built-in) -- built-in defaults merged server-side by hot-reload pipeline"
  - "BUILT_IN_RPC_URLS duplicated as frontend constant -- admin SPA cannot import @waiaas/core directly"
  - "Built-in URLs toggle-able (enable/disable) not deletable -- prevents accidental loss of fallback URLs"
  - "EVM default network selector preserved at top of EVM section -- separate from per-network URL management"

patterns-established:
  - "Per-network collapsible section pattern: details/summary with expand/collapse state signal"
  - "URL priority ordering: user URLs first (highest priority), built-in at bottom"

requirements-completed: [ADUI-01, ADUI-03, ADUI-05]

# Metrics
duration: 9min
completed: 2026-02-25
---

# Phase 263 Plan 01: Admin UI RPC Endpoints Summary

**GET /admin/rpc-status endpoint with per-network pool status, multi-URL RPC Endpoints tab with add/delete/reorder/built-in-toggle per network, 11 tests (4 backend + 7 frontend)**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-25T10:52:35Z
- **Completed:** 2026-02-25T11:01:35Z
- **Tasks:** 2
- **Files modified:** 7 (+ 2 created)

## Accomplishments
- GET /admin/rpc-status endpoint returns per-network RpcPool endpoint status (url, status, failureCount, cooldownRemainingMs)
- Multi-URL RPC Endpoints tab replaces single-URL-per-field design with collapsible per-network sections
- Each URL row shows priority number, URL (monospace truncated), built-in badge, and action buttons (reorder/delete/toggle)
- User URLs add/delete/reorder controls with https:// validation and duplicate detection
- Built-in URLs labeled with (built-in) badge, enable/disable toggle instead of delete
- Save persists user-only URLs as JSON arrays to rpc_pool.* settings via PUT /admin/settings
- 4 backend tests + 7 frontend tests covering full CRUD, auth, rendering, and state management

## Task Commits

Each task was committed atomically:

1. **Task 1: GET /admin/rpc-status endpoint + multi-URL RPC Endpoints tab UI** - `4bb7b091` (feat)
2. **Task 2: Tests for RPC status endpoint and multi-URL tab UI** - `4dd2e3b7` (test)
3. **Lint fix: remove unused vi import** - `68a9a49f` (fix)

## Files Created/Modified
- `packages/daemon/src/api/routes/openapi-schemas.ts` - Added RpcStatusResponseSchema and RpcEndpointStatusSchema
- `packages/daemon/src/api/routes/admin.ts` - Added rpcStatusRoute, rpcPool dep, handler returning per-network status
- `packages/daemon/src/api/server.ts` - Wired rpcPool from adapterPool into admin deps, added masterAuth for rpc-status
- `packages/admin/src/api/endpoints.ts` - Added ADMIN_RPC_STATUS constant
- `packages/admin/src/utils/settings-helpers.ts` - Added RpcEndpointStatusEntry and RpcPoolStatus types
- `packages/admin/src/pages/wallets.tsx` - Rewrote RpcEndpointsTab with multi-URL list management
- `packages/admin/src/styles/global.css` - Added CSS for rpc-pool-network, rpc-url-item, badge-builtin, rpc-add-url
- `packages/daemon/src/__tests__/admin-rpc-status.test.ts` - 4 integration tests for GET /admin/rpc-status
- `packages/admin/src/__tests__/wallets-rpc-pool.test.tsx` - 7 component tests for multi-URL tab

## Decisions Made
- User URLs saved as JSON arrays excluding built-in URLs -- built-in defaults are merged server-side by the hot-reload pipeline (consistent with 262-01 design)
- BUILT_IN_RPC_URLS duplicated as a frontend constant since admin SPA cannot import @waiaas/core directly
- Built-in URLs are toggle-able (enable/disable) not deletable -- prevents accidental loss of fallback URLs while allowing admin to prioritize custom URLs
- EVM default network selector preserved at top of EVM section, separate dirty state from URL list management

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Auth] Added masterAuth middleware for /v1/admin/rpc-status**
- **Found during:** Task 2 (401 auth test failing)
- **Issue:** GET /admin/rpc-status was accessible without masterAuth -- the route was added to admin.ts but not registered in server.ts middleware list
- **Fix:** Added `app.use('/v1/admin/rpc-status', masterAuthForAdmin)` in server.ts
- **Files modified:** packages/daemon/src/api/server.ts
- **Verification:** 401 test now passes; endpoint requires masterAuth
- **Committed in:** 4dd2e3b7 (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed esbuild operator precedence error: ?? with ||**
- **Found during:** Task 1 (admin build verification)
- **Issue:** `dirtyEvmDefault.value ?? getEffectiveValue(...) || 'ethereum-sepolia'` -- esbuild does not allow mixing `??` and `||` without parentheses
- **Fix:** Added parentheses: `?? (getEffectiveValue(...) || 'ethereum-sepolia')`
- **Files modified:** packages/admin/src/pages/wallets.tsx
- **Committed in:** 4bb7b091 (Task 1 commit)

**3. [Rule 3 - Blocking] Fixed unused vi import lint error in test**
- **Found during:** Task 2 (final lint verification)
- **Issue:** `vi` imported but not used in admin-rpc-status.test.ts
- **Fix:** Removed `vi` from import statement
- **Files modified:** packages/daemon/src/__tests__/admin-rpc-status.test.ts
- **Committed in:** 68a9a49f (separate fix commit)

---

**Total deviations:** 3 auto-fixed (1 missing auth, 2 blocking)
**Impact on plan:** All fixes necessary for correctness and build. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GET /admin/rpc-status endpoint ready for Plan 02 live status display
- Multi-URL tab provides the management UI foundation for Plan 02 health indicators
- CSS classes (rpc-url-item, rpc-test-result) available for Plan 02 status badges

## Self-Check: PASSED

- [x] packages/daemon/src/api/routes/admin.ts modified (rpcStatusRoute + handler + rpcPool dep)
- [x] packages/daemon/src/api/routes/openapi-schemas.ts modified (RpcStatusResponseSchema)
- [x] packages/daemon/src/api/server.ts modified (rpcPool wiring + masterAuth)
- [x] packages/admin/src/api/endpoints.ts modified (ADMIN_RPC_STATUS)
- [x] packages/admin/src/pages/wallets.tsx modified (multi-URL RpcEndpointsTab)
- [x] packages/admin/src/utils/settings-helpers.ts modified (RpcPoolStatus types)
- [x] packages/admin/src/styles/global.css modified (rpc-pool CSS)
- [x] packages/daemon/src/__tests__/admin-rpc-status.test.ts created (4 tests)
- [x] packages/admin/src/__tests__/wallets-rpc-pool.test.tsx created (7 tests)
- [x] Commit 4bb7b091 exists
- [x] Commit 4dd2e3b7 exists
- [x] Commit 68a9a49f exists

---
*Phase: 263-admin-ui-rpc-endpoints*
*Completed: 2026-02-25*
