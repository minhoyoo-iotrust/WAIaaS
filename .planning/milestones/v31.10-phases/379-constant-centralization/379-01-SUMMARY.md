---
phase: 379-constant-centralization
plan: 01
subsystem: infra
tags: [refactoring, constants, magic-numbers, daemon, cli, admin]

# Dependency graph
requires: []
provides:
  - "packages/daemon/src/constants.ts with ORACLE_TIMEOUT_MS, SIGNING_CHANNEL_FETCH_TIMEOUT_MS, DEFAULT_MAX_RETRIES, GAS_SAFETY_NUMERATOR/DENOMINATOR, WORKER_SHUTDOWN_DEADLINE_MS"
  - "packages/cli/src/constants.ts with DEFAULT_DAEMON_PORT, CLI_FETCH_TIMEOUT_MS"
  - "packages/admin/src/constants.ts with HYPERLIQUID_POLL_INTERVAL_MS, DASHBOARD_POLL_INTERVAL_MS"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: ["package-level constants file for repeated magic numbers"]

key-files:
  created:
    - packages/daemon/src/constants.ts
    - packages/cli/src/constants.ts
    - packages/admin/src/constants.ts
  modified:
    - packages/daemon/src/infrastructure/oracle/coingecko-oracle.ts
    - packages/daemon/src/infrastructure/oracle/coingecko-forex.ts
    - packages/daemon/src/infrastructure/oracle/pyth-oracle.ts
    - packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts
    - packages/daemon/src/services/signing-sdk/channels/ntfy-signing-channel.ts
    - packages/daemon/src/infrastructure/nft/nft-indexer-client.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/pipeline/dry-run.ts
    - packages/daemon/src/lifecycle/workers.ts
    - packages/cli/src/commands/backup.ts
    - packages/cli/src/commands/notification-setup.ts
    - packages/cli/src/commands/mcp-setup.ts
    - packages/cli/src/commands/quickstart.ts
    - packages/cli/src/commands/update.ts
    - packages/cli/src/commands/status.ts
    - packages/cli/src/utils/update-notify.ts
    - packages/admin/src/components/hyperliquid/SubAccountDetail.tsx
    - packages/admin/src/components/hyperliquid/SubAccountList.tsx
    - packages/admin/src/components/hyperliquid/PositionsTable.tsx
    - packages/admin/src/components/hyperliquid/SpotBalancesTable.tsx
    - packages/admin/src/pages/dashboard.tsx
    - packages/admin/src/pages/notifications.tsx

key-decisions:
  - "version-check-service.ts FETCH_TIMEOUT_MS kept local: same value (5000) but semantically distinct from oracle timeout"
  - "mcp/session-manager.ts MAX_RETRIES kept local: already named, cross-package import unnecessary"
  - "update-notify.ts FETCH_TIMEOUT_MS=2000 kept local: different value from CLI_FETCH_TIMEOUT_MS"

patterns-established:
  - "Package-level constants.ts for 2+ usage or unclear-meaning magic numbers"
  - "Named constants for gas safety margin (GAS_SAFETY_NUMERATOR/DENOMINATOR) per CLAUDE.md mandate"

requirements-completed: [CONST-01, CONST-02]

# Metrics
duration: 13min
completed: 2026-03-11
---

# Phase 379 Plan 01: Magic Number Centralization Summary

**3 package-level constants files extracting 10 named constants from 22 files: oracle/signing timeouts, gas safety margin, retry counts, polling intervals, daemon port**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-11T09:41:45Z
- **Completed:** 2026-03-11T09:54:24Z
- **Tasks:** 2
- **Files modified:** 25 (3 created + 22 modified)

## Accomplishments
- Created packages/daemon/src/constants.ts with 6 named constants (ORACLE_TIMEOUT_MS, SIGNING_CHANNEL_FETCH_TIMEOUT_MS, DEFAULT_MAX_RETRIES, GAS_SAFETY_NUMERATOR, GAS_SAFETY_DENOMINATOR, WORKER_SHUTDOWN_DEADLINE_MS)
- Created packages/cli/src/constants.ts with 2 named constants (DEFAULT_DAEMON_PORT, CLI_FETCH_TIMEOUT_MS)
- Created packages/admin/src/constants.ts with 2 named constants (HYPERLIQUID_POLL_INTERVAL_MS, DASHBOARD_POLL_INTERVAL_MS)
- Replaced all identified repeated magic numbers across 22 source files with constant references
- Zero behavior changes: all values identical to originals

## Task Commits

Each task was committed atomically:

1. **Task 1: Create package-level constants files** - `b01cf58` (feat)
2. **Task 2: Replace magic numbers with constant references** - `ed6dd60` (refactor)

## Files Created/Modified
- `packages/daemon/src/constants.ts` - Daemon shared constants (oracle timeout, signing timeout, retries, gas safety, worker deadline)
- `packages/cli/src/constants.ts` - CLI shared constants (daemon port, fetch timeout)
- `packages/admin/src/constants.ts` - Admin UI shared constants (Hyperliquid poll, dashboard poll)
- 3 oracle files: TIMEOUT_MS -> ORACLE_TIMEOUT_MS
- 2 signing channel files: FETCH_TIMEOUT_MS -> SIGNING_CHANNEL_FETCH_TIMEOUT_MS
- nft-indexer-client.ts: MAX_RETRIES -> DEFAULT_MAX_RETRIES
- stages.ts + dry-run.ts: 120n/100n -> GAS_SAFETY_NUMERATOR/GAS_SAFETY_DENOMINATOR (6 sites total)
- workers.ts: 5000 -> WORKER_SHUTDOWN_DEADLINE_MS
- 6 CLI command files: AbortSignal.timeout(5000) -> CLI_FETCH_TIMEOUT_MS, DEFAULT_PORT -> DEFAULT_DAEMON_PORT
- 4 Hyperliquid components: setInterval(..., 10000) -> HYPERLIQUID_POLL_INTERVAL_MS
- 2 admin pages: setInterval(..., 30_000) -> DASHBOARD_POLL_INTERVAL_MS

## Decisions Made
- version-check-service.ts FETCH_TIMEOUT_MS=5000 kept as local constant: same numeric value as ORACLE_TIMEOUT_MS but semantically different (version check vs price oracle)
- mcp/session-manager.ts MAX_RETRIES=3 kept as local constant: already well-named, cross-package dependency not justified
- update-notify.ts FETCH_TIMEOUT_MS=2000 kept as local constant: different value (2000ms vs 5000ms CLI standard), purpose-specific (must be fast to not block CLI startup)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed double-prefix in replace_all on MAX_RETRIES**
- **Found during:** Task 2 (nft-indexer-client.ts replacement)
- **Issue:** Using replace_all on "MAX_RETRIES" also transformed the import statement's "DEFAULT_MAX_RETRIES" into "DEFAULT_DEFAULT_MAX_RETRIES"
- **Fix:** Corrected the import line back to `DEFAULT_MAX_RETRIES`
- **Files modified:** packages/daemon/src/infrastructure/nft/nft-indexer-client.ts
- **Verification:** lint passed after fix
- **Committed in:** ed6dd60 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial mechanical error in text replacement, no scope change.

## Issues Encountered
- e2e-tests onchain tests fail (pre-existing, require testnet RPC/funds) -- not related to this refactoring

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- This is the final phase of milestone v31.10
- All 5 phases complete: utility consolidation, type safety, file splitting, error consistency, constant centralization
- Ready for milestone PR

---
*Phase: 379-constant-centralization*
*Completed: 2026-03-11*
