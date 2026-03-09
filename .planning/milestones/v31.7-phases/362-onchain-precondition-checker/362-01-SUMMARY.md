---
phase: 362-onchain-precondition-checker
plan: 01
subsystem: testing
tags: [e2e, precondition, balance, daemon, onchain]

requires:
  - phase: 357-e2e-test-infra
    provides: DaemonManager, E2EHttpClient, SessionManager helpers
provides:
  - PreconditionChecker class with checkDaemon/checkWallets/checkBalance/runAll/generateReport
  - CheckResult, PreconditionReport, NetworkFilter types
  - PROTOCOL_NETWORK_MAP and DEFAULT_REQUIREMENTS constants
affects: [362-02, 363]

tech-stack:
  added: []
  patterns: [session-based-balance-check, protocol-network-mapping, structured-precondition-report]

key-files:
  created:
    - packages/e2e-tests/src/helpers/precondition-checker.ts
    - packages/e2e-tests/src/__tests__/precondition-checker.test.ts
  modified:
    - packages/e2e-tests/src/helpers/index.ts

key-decisions:
  - "Balance API requires session auth (not master password) -- checker creates temp session per wallet"
  - "Health endpoint is /health (not /v1/health) per daemon route structure"
  - "PROTOCOL_NETWORK_MAP maps protocol names to required testnet networks for filtering"

patterns-established:
  - "PreconditionChecker pattern: daemon -> wallets -> balances cascade with early bail on failure"

requirements-completed: [ONCH-01, ONCH-03]

duration: 5min
completed: 2026-03-09
---

# Phase 362 Plan 01: PreconditionChecker Core Summary

**PreconditionChecker class with daemon/wallet/balance cascade checks, network/protocol filtering, and structured text reporting**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T07:48:19Z
- **Completed:** 2026-03-09T07:54:00Z
- **Tasks:** 2 (TDD combined)
- **Files modified:** 3

## Accomplishments
- PreconditionChecker with 5 public methods: checkDaemon, checkWallets, checkBalance, runAll, generateReport
- NetworkFilter supporting --network and --only (protocols) filtering
- Structured CheckResult/PreconditionReport types for machine-readable results
- 13 unit tests covering all methods and edge cases

## Task Commits

1. **Task 1+2: PreconditionChecker implementation + tests (TDD)** - `de1ab246` (feat)

## Files Created/Modified
- `packages/e2e-tests/src/helpers/precondition-checker.ts` - PreconditionChecker class + types + constants
- `packages/e2e-tests/src/__tests__/precondition-checker.test.ts` - 13 integration tests with real daemon
- `packages/e2e-tests/src/helpers/index.ts` - Re-export PreconditionChecker, types

## Decisions Made
- Balance API requires session auth, not X-Master-Password. PreconditionChecker creates temporary sessions per wallet for balance queries.
- Health endpoint is `/health` (not `/v1/health`) matching daemon route structure.
- PROTOCOL_NETWORK_MAP maps protocol names (swap, staking, etc.) to required testnet networks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed health endpoint path**
- **Found during:** Task 1
- **Issue:** Plan specified /v1/health but daemon uses /health
- **Fix:** Changed to /health in checkDaemon()
- **Files modified:** precondition-checker.ts
- **Committed in:** de1ab246

**2. [Rule 1 - Bug] Fixed balance check auth method**
- **Found during:** Task 1
- **Issue:** Balance API requires session auth (Bearer token), not X-Master-Password
- **Fix:** checkBalance creates temporary session per wallet for balance queries
- **Files modified:** precondition-checker.ts
- **Committed in:** de1ab246

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correct API interaction. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PreconditionChecker ready for use in 362-02 (interactive prompt + run-onchain entry point)
- Types exported from helpers/index.ts for downstream consumers

---
*Phase: 362-onchain-precondition-checker*
*Completed: 2026-03-09*
