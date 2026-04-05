---
phase: 280-jwt-api-pipeline-settings
plan: "03"
subsystem: infra
tags: [pipeline, settings, balance-monitor, owner-auth, migration-v27]

# Dependency graph
requires:
  - phase: 280-jwt-api-pipeline-settings
    provides: "280-01 removed JWT wlt + auth defaultWalletId; 280-02 removed API defaultNetwork/isDefault"
  - phase: 279-schema-migration
    provides: "v27 migration dropping default_network/is_default columns, resolveNetwork 3-param, getSingleNetwork"
provides:
  - "Pipeline context without defaultNetwork field"
  - "BalanceMonitor iterating ALL networks per wallet via getNetworksForEnvironment"
  - "rpc.evm_default_network completely removed from settings/config/hot-reload"
  - "ownerAuth middleware resolving walletId from transaction record for approve/reject routes"
affects: [admin-ui, mcp, actions, monitoring]

# Tech tracking
tech-stack:
  added: []
  patterns: ["BalanceMonitor per-network dedup key pattern (walletId:network)", "ownerAuth wallet-or-tx-id fallback lookup"]

key-files:
  created: []
  modified:
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/pipeline/pipeline.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/notifications/notification-service.ts
    - packages/daemon/src/infrastructure/adapter-pool.ts
    - packages/daemon/src/services/monitoring/balance-monitor-service.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/infrastructure/config/loader.ts
    - packages/daemon/src/infrastructure/settings/hot-reload.ts
    - packages/daemon/src/api/middleware/owner-auth.ts
    - packages/daemon/src/api/helpers/resolve-wallet-id.ts

key-decisions:
  - "BalanceMonitor uses getNetworksForEnvironment to iterate all networks, matching IncomingTxMonitor pattern (D7)"
  - "BalanceMonitor dedup key changed from walletId to walletId:network for per-network tracking"
  - "ownerAuth falls back to transaction lookup when route param ID is not a wallet ID"
  - "Security test app routes changed from /v1/owner/approve to /v1/owner/:id/approve for ownerAuth compat"

patterns-established:
  - "BalanceMonitor per-network iteration: getNetworksForEnvironment(chain, env) -> for each network check balance"
  - "ownerAuth two-pass lookup: try wallets table first, fall back to transactions table"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06, ASET-01, ASET-02, ASET-03]

# Metrics
duration: 45min
completed: 2026-02-27
---

# Phase 280 Plan 03: Pipeline/Infrastructure Services + Admin Settings Default Network Removal Summary

**Removed defaultNetwork from pipeline context, services, and settings; rewrote BalanceMonitor for multi-network iteration; fixed ownerAuth transaction ID lookup; updated 70+ test files for v27 migration compatibility**

## Performance

- **Duration:** ~45 min (across 2 sessions)
- **Started:** 2026-02-27T11:30:00Z
- **Completed:** 2026-02-27T12:24:00Z
- **Tasks:** 2
- **Files modified:** 78 (9 source + 69 test files)

## Accomplishments
- Pipeline context (`PipelineContext.wallet`) no longer has `defaultNetwork` field
- BalanceMonitor rewritten to iterate all networks per wallet using `getNetworksForEnvironment`, matching IncomingTxMonitor pattern
- `rpc.evm_default_network` completely removed from setting-keys, config loader Zod schema, and hot-reload
- ownerAuth middleware fixed to handle transaction approve/reject routes (looks up walletId from transaction record)
- All 199 daemon test files pass (3,385 tests, 0 failures)
- TypeScript compilation: 0 errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Pipeline stages/context + pipeline.ts + daemon.ts default network removal** - `9dad9cda` (refactor)
2. **Task 2: Notification service + adapter-pool + balance monitor + settings cleanup + test fixes** - `64e2accd` (feat)

## Files Created/Modified

**Source files (9):**
- `packages/daemon/src/pipeline/stages.ts` - Removed `defaultNetwork: string | null` from PipelineContext.wallet type
- `packages/daemon/src/pipeline/pipeline.ts` - Changed resolveNetwork to 3-param (no walletDefaultNetwork)
- `packages/daemon/src/lifecycle/daemon.ts` - Replaced getDefaultNetwork with getSingleNetwork in executeFromStage4/5
- `packages/daemon/src/notifications/notification-service.ts` - Removed defaultNetwork from select/fallback
- `packages/daemon/src/infrastructure/adapter-pool.ts` - Removed evm_default_network skip logic
- `packages/daemon/src/services/monitoring/balance-monitor-service.ts` - Rewrote to iterate all networks via getNetworksForEnvironment
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - Removed rpc.evm_default_network entry
- `packages/daemon/src/infrastructure/config/loader.ts` - Removed evm_default_network from Zod schema
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` - Removed evm_default_network skip logic

**Deviation source fixes (2):**
- `packages/daemon/src/api/middleware/owner-auth.ts` - Added transaction ID fallback lookup for approve/reject routes
- `packages/daemon/src/api/helpers/resolve-wallet-id.ts` - Added non-null assertion for TypeScript

**Test files (69):**
- Migration tests (6 files): Updated LATEST_SCHEMA_VERSION 26->27, removed default_network assertions
- session-wallet-cascade.test.ts: Rewrote to remove isDefault references
- EVM integration tests (3 files): Added explicit `network: 'ethereum-sepolia'` params
- Security test helpers + tests (4 files): Updated route patterns for ownerAuth :id param
- wallet-id-selection.test.ts: Changed to expect WALLET_ID_REQUIRED for multi-wallet sessions
- mcp-tokens.test.ts: Removed isDefault assertion
- session-lifecycle-e2e.test.ts: Added walletId query param for multi-wallet test
- workflow-owner-e2e.test.ts: Now passes with ownerAuth fix
- lido-staking-integration.test.ts: Added explicit rpc.evm_default_network for testnet test
- 50+ other test files: Bulk updates from Plans 280-01/280-02 (defaultNetwork, isDefault removal)

## Decisions Made
- **BalanceMonitor dedup key**: Changed from `walletId` to `walletId:network` for per-network low-balance tracking. This prevents one network's low balance from suppressing notifications for other networks on the same wallet.
- **ownerAuth two-pass lookup**: When `c.req.param('id')` doesn't match a wallet, look up the `transactions` table to find the associated walletId. This handles `/v1/transactions/:id/approve` and `/v1/transactions/:id/reject` routes cleanly.
- **Security test app routes**: Changed from `/v1/owner/approve` to `/v1/owner/:id/approve` to match the real server's route pattern where ownerAuth needs walletId from route params.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed unused getSingleNetwork import from admin.ts**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** `getSingleNetwork` was imported but unused after defaultNetwork removal
- **Fix:** Removed the unused import
- **Files modified:** packages/daemon/src/api/routes/admin.ts
- **Committed in:** 64e2accd (Task 2 commit)

**2. [Rule 3 - Blocking] Added non-null assertion in resolve-wallet-id.ts**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** TypeScript null check error after schema change
- **Fix:** Added `!` non-null assertion
- **Files modified:** packages/daemon/src/api/helpers/resolve-wallet-id.ts
- **Committed in:** 64e2accd (Task 2 commit)

**3. [Rule 1 - Bug] Fixed ownerAuth walletId resolution for transaction routes**
- **Found during:** Task 2 (Test fixes)
- **Issue:** Plan 280-01 removed `defaultWalletId` from auth context. ownerAuth now only uses `c.req.param('id')`, but for `/v1/transactions/:id/approve` routes, `:id` is the transaction ID, not wallet ID. This caused 404 errors.
- **Fix:** Added two-pass lookup: try wallets table first, then transactions table to resolve walletId
- **Files modified:** packages/daemon/src/api/middleware/owner-auth.ts
- **Verification:** All ownerAuth security tests + workflow-owner-e2e tests pass
- **Committed in:** 64e2accd (Task 2 commit)

**4. [Rule 3 - Blocking] Updated security test app route pattern**
- **Found during:** Task 2 (Security test fixes)
- **Issue:** Security test app used `/v1/owner/approve` without `:id` param. ownerAuth needs walletId from route param.
- **Fix:** Changed route to `/v1/owner/:id/approve`, updated middleware patterns, and all test request URLs
- **Files modified:** packages/daemon/src/__tests__/security/helpers/security-test-helpers.ts, 2 security test files
- **Committed in:** 64e2accd (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (1 bug fix, 3 blocking issues)
**Impact on plan:** All fixes necessary for correctness after defaultWalletId removal. ownerAuth bug fix (deviation 3) was a direct consequence of Plan 280-01 changes. No scope creep.

## Issues Encountered
- **70+ test files needed updates**: The combination of v27 migration (LATEST_SCHEMA_VERSION, default_network column, is_default column), EVM network requirement, and multi-wallet WALLET_ID_REQUIRED behavior required extensive test updates across the entire daemon test suite.
- **Cross-session debugging**: Task 1 was completed in a prior session; Task 2 source changes were done but tests were failing. This session focused on systematically fixing all remaining test failures.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All daemon source code is free of defaultNetwork/getDefaultNetwork/evm_default_network references
- Pipeline, services, and settings are fully cleaned
- 199/199 test files pass with 3,385 tests
- Ready for downstream plan execution in this phase or future milestones

## Self-Check: PASSED

- All 10 key source files: FOUND
- Task 1 commit (9dad9cda): FOUND
- Task 2 commit (64e2accd): FOUND
- No defaultNetwork references in source (excluding tests/database): 0 matches
- No evm_default_network in settings/config/hot-reload: 0 matches each
- TypeScript compilation: 0 errors
- Test suite: 199/199 files, 3385/3385 tests pass

---
*Phase: 280-jwt-api-pipeline-settings*
*Completed: 2026-02-27*
