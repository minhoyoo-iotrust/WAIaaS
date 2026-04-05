---
phase: 262-settings-storage-hot-reload
plan: 01
subsystem: infra
tags: [rpc, pool, settings, hot-reload, admin-api, url-management]

# Dependency graph
requires:
  - "261-01: AdapterPool with RpcPool dependency and configKeyToNetwork helper"
  - "261-02: Hot-reload RPC handler with RpcPool cooldown reset"
provides:
  - "RpcPool.replaceNetwork() for atomic URL list replacement per network"
  - "13 rpc_pool.* SettingDefinitions for Admin Settings API CRUD"
  - "HotReloadOrchestrator reloadRpcPool() handler for rpc_pool.* key changes"
  - "URL merge pipeline: user URLs > config.toml > built-in defaults with deduplication"
affects: [263-admin-ui-rpc-pool, 264-monitoring-admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: ["rpc_pool.* settings store JSON arrays of URLs managed via Admin Settings API", "reloadRpcPool merges 3 URL sources with user highest priority and deduplication"]

key-files:
  created:
    - packages/daemon/src/__tests__/rpc-pool-settings-integration.test.ts
  modified:
    - packages/core/src/rpc/rpc-pool.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/infrastructure/settings/hot-reload.ts

key-decisions:
  - "rpc_pool.* defaultValue is '[]' (empty JSON array) -- URL lists are managed exclusively via Admin Settings API, not config.toml"
  - "replaceNetwork() does full atomic replace (not merge like register()) -- ensures URL list matches exactly what admin set"
  - "URL merge priority: user URLs (Admin Settings) > config.toml single URL > built-in defaults -- consistent with daemon startup seeding order"
  - "networkToConfigKey reverse maps network name to config.toml rpc field key (mainnet->solana_mainnet, ethereum-sepolia->evm_ethereum_sepolia)"

patterns-established:
  - "Admin Settings JSON array pattern: store multi-value settings as JSON array strings in rpc_pool.* keys"
  - "Hot-reload merge-and-replace pattern: parse user JSON, lookup config.toml URL, merge with built-in defaults, atomic replaceNetwork()"

requirements-completed: [CONF-02, CONF-03]

# Metrics
duration: 6min
completed: 2026-02-25
---

# Phase 262 Plan 01: Settings Storage Hot-Reload Summary

**RpcPool.replaceNetwork() atomic replacement, 13 rpc_pool.* SettingDefinitions for Admin API URL management, and HotReloadOrchestrator merge pipeline (user > config > built-in) with 20 integration tests**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-25T10:33:28Z
- **Completed:** 2026-02-25T10:39:50Z
- **Tasks:** 2
- **Files modified:** 4 (+ 1 created)

## Accomplishments
- RpcPool.replaceNetwork() method for atomic URL list replacement per network (unlike register() which appends)
- 13 rpc_pool.* SettingDefinitions with '[]' default -- one per supported network, managed via Admin Settings API
- HotReloadOrchestrator reloadRpcPool() handler triggered on rpc_pool.* key changes
- URL merge pipeline: user URLs (highest priority) > config.toml single URL > built-in defaults, with deduplication
- Adapter eviction after URL replacement ensures next resolve() uses new pool state
- 20 integration tests covering SettingDefinitions CRUD, replaceNetwork() semantics, and full hot-reload dispatch pipeline

## Task Commits

Each task was committed atomically:

1. **Task 1: RpcPool.replaceNetwork() + rpc_pool.* SettingDefinitions + hot-reload handler** - `2f167bbc` (feat)
2. **Task 2: Integration tests** - `4d35a76f` (test)

## Files Created/Modified
- `packages/core/src/rpc/rpc-pool.ts` - Added replaceNetwork() method for atomic URL list replacement
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - Added rpc_pool category and 13 rpc_pool.* SettingDefinitions
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` - Added reloadRpcPool() handler and networkToConfigKey() helper
- `packages/daemon/src/__tests__/rpc-pool-settings-integration.test.ts` - 20 tests in 3 describe blocks covering full pipeline

## Decisions Made
- rpc_pool.* defaultValue is '[]' (empty JSON array) -- URL lists are managed exclusively via Admin Settings API, not config.toml (config.toml has no rpc_pool section, so configPath always falls back to default)
- replaceNetwork() does full atomic replace unlike register() which appends -- this ensures the URL list matches exactly what the admin set plus merged sources
- URL merge priority follows: user URLs (Admin Settings) > config.toml single URL > built-in defaults, consistent with the daemon startup seeding order
- networkToConfigKey() is a private method on HotReloadOrchestrator (separate from configKeyToNetwork in adapter-pool.ts) -- they perform inverse mapping but are used in different contexts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing lint error: let -> const in rpc-pool-defaults.test.ts**
- **Found during:** Task 1 (lint verification)
- **Issue:** `let now = 0` on line 105 was never reassigned, causing ESLint prefer-const error that blocked lint from passing
- **Fix:** Changed to `const now = 0`
- **Files modified:** packages/core/src/__tests__/rpc-pool-defaults.test.ts
- **Verification:** `pnpm turbo run lint --filter=@waiaas/core` passes with 0 errors
- **Committed in:** 2f167bbc (part of Task 1 commit)

**2. [Rule 3 - Blocking] Fixed pre-existing lint error: unused import in incoming-rpc-pool.test.ts**
- **Found during:** Task 1 (lint verification)
- **Issue:** `rpcConfigKey` imported but never used, causing ESLint no-unused-vars error
- **Fix:** Removed unused import from import statement
- **Files modified:** packages/daemon/src/__tests__/incoming-rpc-pool.test.ts
- **Verification:** `pnpm turbo run lint --filter=@waiaas/daemon` passes with 0 errors
- **Committed in:** 2f167bbc (part of Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking -- pre-existing lint errors)
**Impact on plan:** Both fixes were necessary for lint to pass. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RpcPool settings storage and hot-reload pipeline complete
- Ready for Phase 263: Admin UI RPC Pool management panel
- rpc_pool.* keys available via GET/PUT /admin/settings for frontend integration

## Self-Check: PASSED

- [x] packages/core/src/rpc/rpc-pool.ts modified with replaceNetwork()
- [x] packages/daemon/src/infrastructure/settings/setting-keys.ts modified with 13 rpc_pool.* definitions
- [x] packages/daemon/src/infrastructure/settings/hot-reload.ts modified with reloadRpcPool()
- [x] packages/daemon/src/__tests__/rpc-pool-settings-integration.test.ts created (20 tests)
- [x] Commit 2f167bbc exists
- [x] Commit 4d35a76f exists

---
*Phase: 262-settings-storage-hot-reload*
*Completed: 2026-02-25*
