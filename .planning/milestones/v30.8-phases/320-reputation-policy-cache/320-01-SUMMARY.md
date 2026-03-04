---
phase: 320-reputation-policy-cache
plan: 01
subsystem: api
tags: [erc-8004, reputation, cache, viem, drizzle]

requires:
  - phase: 317-foundation
    provides: DB v39 with reputation_cache table, ERC-8004 settings keys
  - phase: 318-actionprovider-registry-client
    provides: REPUTATION_REGISTRY_ABI for viem readContract

provides:
  - ReputationCacheService class with 3-tier cache (memory -> DB -> RPC)
  - ReputationScore interface for policy engine consumption
  - Barrel export from services/erc8004/index.ts

affects: [320-02, 321, 322, 323]

tech-stack:
  added: []
  patterns: [3-tier-cache-with-ttl, upsert-on-conflict-composite-pk]

key-files:
  created:
    - packages/daemon/src/services/erc8004/reputation-cache-service.ts
    - packages/daemon/src/services/erc8004/index.ts
    - packages/daemon/src/__tests__/reputation-cache-service.test.ts
  modified: []

key-decisions:
  - "normalizeScore clamps int128 to [0, 100] range with decimal division"
  - "invalidateAll clears memory but preserves DB for restart resilience"
  - "RPC errors return null (caller applies unrated treatment) rather than throwing"

patterns-established:
  - "3-tier cache: in-memory Map -> DB table -> RPC on-chain read with TTL-based freshness"

requirements-completed: [REPU-01, REPU-02, REPU-04]

duration: 4min
completed: 2026-03-04
---

# Phase 320 Plan 01: ReputationCacheService Summary

**3-tier ERC-8004 reputation cache (in-memory Map + DB reputation_cache + RPC getSummary) with configurable TTL and timeout**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-04T09:29:49Z
- **Completed:** 2026-03-04T09:34:15Z
- **Tasks:** 2 (TDD + build verification)
- **Files modified:** 3

## Accomplishments
- ReputationCacheService with getReputation(), invalidate(), invalidateAll()
- 3-tier fallback: in-memory Map -> DB reputation_cache -> RPC readContract
- Configurable TTL (default 300s) and RPC timeout (default 3000ms) via SettingsService
- normalizeScore handles int128 with decimals, clamps to [0,100]
- 14 unit tests covering all cache tiers, tag combinations, edge cases

## Task Commits

1. **Task 1: ReputationCacheService implementation (TDD)** - `817054e1` (feat)
2. **Task 2: Build verification + typecheck** - no changes needed (build clean)

## Files Created/Modified
- `packages/daemon/src/services/erc8004/reputation-cache-service.ts` - 3-tier cache service with memory/DB/RPC fallback
- `packages/daemon/src/services/erc8004/index.ts` - Barrel export for erc8004 services
- `packages/daemon/src/__tests__/reputation-cache-service.test.ts` - 14 unit tests for cache behavior

## Decisions Made
- normalizeScore clamps int128 to [0, 100] with decimal division (negative scores clamp to 0, >100 clamps to 100)
- invalidateAll() clears in-memory only, preserving DB for persistence across restarts
- RPC errors return null rather than throwing, allowing callers to decide unrated treatment
- DB writes use onConflictDoUpdate with composite PK for idempotent upserts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SettingsService constructor signature mismatch**
- **Found during:** Task 1 (test setup)
- **Issue:** Test created SettingsService with positional args but constructor takes options object
- **Fix:** Updated test to use `{ db, config, masterPassword }` options pattern
- **Files modified:** packages/daemon/src/__tests__/reputation-cache-service.test.ts
- **Verification:** All 14 tests pass
- **Committed in:** 817054e1

**2. [Rule 3 - Blocking] pushSchema requires raw sqlite instance**
- **Found during:** Task 1 (test setup)
- **Issue:** pushSchema(conn.db) failed -- needs conn.sqlite (raw better-sqlite3 instance)
- **Fix:** Changed to pushSchema(conn.sqlite)
- **Verification:** All tests pass
- **Committed in:** 817054e1

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both were test setup issues, no scope impact.

## Issues Encountered
None beyond the auto-fixed items above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ReputationCacheService ready for consumption by REPUTATION_THRESHOLD policy evaluator (Plan 320-02)
- Barrel export available from services/erc8004/index.ts

---
*Phase: 320-reputation-policy-cache*
*Completed: 2026-03-04*
