---
phase: 377-file-split
plan: 01
subsystem: api
tags: [refactoring, admin, route-splitting, hono]

requires: []
provides:
  - "5 domain-specific admin route modules (admin-auth, admin-settings, admin-notifications, admin-wallets, admin-monitoring)"
  - "formatTxAmount exported from admin-wallets.ts for cross-module use"
affects: [377-02]

tech-stack:
  added: []
  patterns: ["registerAdmin*Routes(router, deps) pattern for domain route modules"]

key-files:
  created:
    - packages/daemon/src/api/routes/admin-auth.ts
    - packages/daemon/src/api/routes/admin-settings.ts
    - packages/daemon/src/api/routes/admin-notifications.ts
    - packages/daemon/src/api/routes/admin-wallets.ts
    - packages/daemon/src/api/routes/admin-monitoring.ts
  modified: []

key-decisions:
  - "formatTxAmount placed in admin-wallets.ts and exported (primary user is wallet transactions, also used by monitoring)"
  - "rpcStatusRoute placed in admin-settings.ts (infrastructure configuration domain, not monitoring)"
  - "adminDefiPositionsRoute placed in admin-wallets.ts (wallet-centric query despite cross-wallet capability)"
  - "Combined Task 1 and Task 2 into single commit since admin-auth.ts depends on admin-wallets.ts (formatTxAmount)"

patterns-established:
  - "registerAdmin*Routes(router: OpenAPIHono, deps: AdminRouteDeps): void -- standard pattern for domain route modules"
  - "AdminRouteDeps imported from admin.ts as single source of truth for dependency types"

requirements-completed: [SPLIT-01]

duration: 10min
completed: 2026-03-11
---

# Phase 377 Plan 01: admin.ts Domain Handler Extraction Summary

**38 admin route handlers extracted into 5 domain modules (auth/settings/notifications/wallets/monitoring) with registerAdmin*Routes pattern**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-11T08:53:33Z
- **Completed:** 2026-03-11T09:03:33Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- Created 5 domain-specific route modules from admin.ts (3,107 lines)
- All 38 handlers distributed: 8 auth + 3 notifications + 8 settings + 7 wallets + 12 monitoring
- TypeScript compilation passes with no errors
- formatTxAmount shared across modules via export from admin-wallets.ts

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Extract all 5 domain modules** - `8280ff5f` (refactor)

## Files Created/Modified
- `packages/daemon/src/api/routes/admin-auth.ts` - Status, kill-switch, recovery, shutdown, password change, JWT rotation (8 handlers)
- `packages/daemon/src/api/routes/admin-notifications.ts` - Notification status, test, log (3 handlers)
- `packages/daemon/src/api/routes/admin-settings.ts` - Settings CRUD, test-rpc, oracle, API keys, forex, RPC status (8 handlers)
- `packages/daemon/src/api/routes/admin-wallets.ts` - Wallet transactions/balance/staking, telegram users, DeFi positions (7 handlers)
- `packages/daemon/src/api/routes/admin-monitoring.ts` - Cross-wallet transactions, incoming, agent-prompt, session-reissue, tx cancel/reject, backup, stats, autostop (12 handlers)

## Decisions Made
- Combined Task 1 and Task 2 into a single commit because admin-auth.ts (Task 1) imports formatTxAmount from admin-wallets.ts (Task 2), creating a cross-task dependency
- rpcStatusRoute placed in admin-settings.ts because it's infrastructure configuration, not runtime monitoring
- adminDefiPositionsRoute placed in admin-wallets.ts because it's wallet-centric (filter by wallet_id)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial TypeScript errors from unused imports (z, createHash, formatAmount, etc.) in admin-auth.ts -- cleaned up immediately

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 domain modules ready for admin.ts thin aggregator conversion in 377-02
- admin.ts still contains original code (unchanged) -- will be replaced in 377-02

---
*Phase: 377-file-split*
*Completed: 2026-03-11*
