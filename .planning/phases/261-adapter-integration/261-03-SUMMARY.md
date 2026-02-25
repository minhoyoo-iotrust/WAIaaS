---
phase: 261-adapter-integration
plan: 03
subsystem: infra
tags: [rpc, pool, incoming-tx, subscriber, fallback, integration-test]

# Dependency graph
requires:
  - "261-01: AdapterPool with RpcPool dependency, rpcConfigKey helper, rpcPoolInstance getter"
provides:
  - "resolveRpcUrlFromPool() helper for pool-first, settings-fallback RPC URL resolution"
  - "IncomingTxMonitor subscriberFactory wired to RpcPool for multi-endpoint rotation"
  - "12 tests covering pool resolution, fallback, and subscriber creation"
affects: [262-rpc-settings-admin-ui, 264-monitoring-admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: ["resolveRpcUrlFromPool: testable helper for pool-first URL resolution with SettingsService fallback"]

key-files:
  created:
    - packages/daemon/src/__tests__/incoming-rpc-pool.test.ts
  modified:
    - packages/daemon/src/infrastructure/adapter-pool.ts
    - packages/daemon/src/lifecycle/daemon.ts

key-decisions:
  - "resolveRpcUrlFromPool extracted as testable helper in adapter-pool.ts (not inline closure in daemon.ts)"
  - "RpcPool URL used at subscriber creation time only -- mid-polling rotation deferred to Phase 264"
  - "No changes to IncomingTxMonitorService or SubscriptionMultiplexer -- subscriberFactory is dependency-injected"
  - "WSS URL derivation continues from resolved HTTP URL (same pattern as before RpcPool)"

patterns-established:
  - "Pool-first URL resolution: resolveRpcUrlFromPool(pool, settingsGet, chain, network) as reusable pattern"
  - "Subscriber factory test pattern: simulate factory closure with mocked subscribers and real RpcPool"

requirements-completed: [ADPT-04]

# Metrics
duration: 4min
completed: 2026-02-25
---

# Phase 261 Plan 03: IncomingTxMonitor RpcPool Integration Summary

**resolveRpcUrlFromPool helper wired into IncomingTxMonitor subscriberFactory for pool-first RPC URL resolution with SettingsService fallback -- 12 tests covering pool preference, cooldown fallback, and Solana/EVM subscriber creation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-25T10:20:04Z
- **Completed:** 2026-02-25T10:23:39Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- resolveRpcUrlFromPool() helper extracted into adapter-pool.ts for testable pool-first URL resolution with SettingsService fallback
- subscriberFactory in daemon.ts Step 4c-9 updated to use resolveRpcUrlFromPool() for both Solana and EVM subscribers
- 12 tests in 2 describe blocks: 6 unit tests for resolveRpcUrlFromPool + 6 subscriber creation tests including pool rotation
- All 22 existing IncomingTxMonitor tests (15 monitor + 7 integration-wiring) pass unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire subscriberFactory to RpcPool** - `e06f9339` (feat)
2. **Task 2: IncomingTxMonitor RpcPool integration tests** - `df93d1a5` (test)

## Files Created/Modified
- `packages/daemon/src/infrastructure/adapter-pool.ts` - Added resolveRpcUrlFromPool() exported helper function
- `packages/daemon/src/lifecycle/daemon.ts` - Updated subscriberFactory to use resolveRpcUrlFromPool(), removed unused rpcConfigKey import
- `packages/daemon/src/__tests__/incoming-rpc-pool.test.ts` - 12 tests: pool preference (1), fallback scenarios (5), subscriber creation with pool (4), custom WSS (1), pool rotation (1)

## Decisions Made
- Extracted resolveRpcUrlFromPool as standalone exported helper in adapter-pool.ts rather than inline in daemon.ts closure. This makes the URL resolution logic unit-testable without mocking DaemonLifecycle.
- RpcPool URL is used at subscriber creation time only. Mid-polling URL rotation would require destroying and recreating subscribers, which is deferred to Phase 264 (Monitoring + Alerts).
- No changes to IncomingTxMonitorService or SubscriptionMultiplexer. The subscriberFactory is a dependency-injected callback, so changing its internal URL resolution is transparent to the monitor service.
- WSS URL derivation for Solana continues from the resolved HTTP URL (same `replace https:// with wss://` pattern). Pool rotation applies to the base HTTP URL.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused rpcConfigKey import from daemon.ts**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** `rpcConfigKey` was previously used directly in subscriberFactory for `sSvc.get(`rpc.${rpcConfigKey(chain, network)}`)`. After switching to `resolveRpcUrlFromPool()` which calls rpcConfigKey internally, the direct import became unused, causing TS6133.
- **Fix:** Removed `rpcConfigKey` from the import statement in daemon.ts
- **Files modified:** packages/daemon/src/lifecycle/daemon.ts
- **Verification:** `pnpm turbo run typecheck --filter=@waiaas/daemon` passes clean
- **Committed in:** e06f9339 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 unused import)
**Impact on plan:** Trivial TypeScript unused import removal. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 261 (Adapter Integration) is now complete: all 3 plans delivered
- AdapterPool, hot-reload, and IncomingTxMonitor all wired to RpcPool
- resolveRpcUrlFromPool helper available for any future pool-aware URL resolution needs
- Ready for Phase 262 (RPC Settings Admin UI) and Phase 263 (Multi-Endpoint Settings Storage)

## Self-Check: PASSED

- [x] adapter-pool.ts modified with resolveRpcUrlFromPool helper
- [x] daemon.ts modified with subscriberFactory using resolveRpcUrlFromPool
- [x] incoming-rpc-pool.test.ts created (12 tests)
- [x] SUMMARY.md exists
- [x] Commit e06f9339 exists
- [x] Commit df93d1a5 exists

---
*Phase: 261-adapter-integration*
*Completed: 2026-02-25*
