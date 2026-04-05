---
phase: 263-admin-ui-rpc-endpoints
plan: 02
subsystem: ui
tags: [admin-ui, rpc, pool, status, health, test, preact, polling]

# Dependency graph
requires:
  - "263-01: GET /admin/rpc-status endpoint, multi-URL RPC Endpoints tab with per-network sections"
provides:
  - "Live pool status indicators (available/cooldown) per URL from periodic polling"
  - "Per-URL Test button calling POST /admin/settings/test-rpc with result display"
  - "formatCooldown helper for human-readable remaining time"
  - "CSS for rpc-url-status, rpc-url-status-dot, rpc-url-cooldown-info, rpc-url-test-inline"
affects: [264-monitoring-admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Periodic polling with useEffect + setInterval for live status", "Per-item inline test with loading/result state tracked by composite key"]

key-files:
  created: []
  modified:
    - packages/admin/src/pages/wallets.tsx
    - packages/admin/src/styles/global.css
    - packages/admin/src/__tests__/wallets-rpc-pool.test.tsx

key-decisions:
  - "Pool status polling every 15 seconds with silent failure -- no toast on polling errors to avoid noise"
  - "Test/status composite key is network:url for per-URL state tracking without collisions"
  - "networkToChain uses SOLANA_NETWORKS.includes for chain determination -- consistent with existing network constants"

patterns-established:
  - "Per-URL status lookup pattern: rpcPoolStatus.value[network].find(s => s.url === entry.url)"
  - "Inline test result pattern: test key tracks loading + result state, displayed beside URL"

requirements-completed: [ADUI-02, ADUI-04]

# Metrics
duration: 3min
completed: 2026-02-25
---

# Phase 263 Plan 02: Live Status Display + Per-URL Test Summary

**Live RPC pool health indicators (available green / cooldown orange with remaining time) via 15s polling, plus per-URL Test button with latency/block result display, 6 new tests (13 total)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-25T11:05:54Z
- **Completed:** 2026-02-25T11:09:44Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Each URL row displays live pool status: green dot "Available" or orange dot "Cooldown" with remaining time and failure count badge
- Status auto-refreshes every 15 seconds via polling GET /admin/rpc-status with silent failure
- Per-URL Test button calls POST /admin/settings/test-rpc with correct chain parameter (solana/evm)
- Test result displays inline: OK badge with latency + block number (success) or FAIL badge with error (failure)
- formatCooldown helper formats milliseconds to human-readable "Xm Ys" / "Xs" format
- 6 new tests covering status display, test button API calls, result rendering, and cooldown formatting

## Task Commits

Each task was committed atomically:

1. **Task 1: Live status display + per-URL test button in RPC Endpoints tab** - `942d300d` (feat)
2. **Task 2: Tests for live status display and URL test functionality** - `ca584026` (test)

## Files Created/Modified
- `packages/admin/src/pages/wallets.tsx` - Added rpcPoolStatus/rpcTesting/rpcTestResults signals, periodic polling, handleTestUrl, formatCooldown, networkToChain, enhanced NetworkSection with status indicators and test buttons
- `packages/admin/src/styles/global.css` - Added CSS for rpc-url-status, rpc-url-status-dot (available/cooldown/unknown), rpc-url-cooldown-info, rpc-url-test-inline
- `packages/admin/src/__tests__/wallets-rpc-pool.test.tsx` - Added 6 new tests for status display (available/cooldown), test button API calls, success/failure results, cooldown formatting; updated existing helpers to mock rpc-status endpoint

## Decisions Made
- Pool status polling every 15 seconds with silent failure -- no toast on polling errors to avoid UI noise during normal operation
- Test/status composite key is `network:url` for per-URL state tracking -- avoids collisions between same URL on different networks
- networkToChain uses SOLANA_NETWORKS.includes() for chain determination -- consistent with existing network constant arrays

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 263 (Admin UI RPC Endpoints) fully complete
- All RPC pool management features delivered: multi-URL CRUD, live status, per-URL testing
- Ready for Phase 264 monitoring admin UI integration

## Self-Check: PASSED

- [x] packages/admin/src/pages/wallets.tsx modified (status signals, polling, test handler, enhanced NetworkSection)
- [x] packages/admin/src/styles/global.css modified (rpc-url-status CSS)
- [x] packages/admin/src/__tests__/wallets-rpc-pool.test.tsx modified (6 new tests, 13 total)
- [x] Commit 942d300d exists
- [x] Commit ca584026 exists

---
*Phase: 263-admin-ui-rpc-endpoints*
*Completed: 2026-02-25*
