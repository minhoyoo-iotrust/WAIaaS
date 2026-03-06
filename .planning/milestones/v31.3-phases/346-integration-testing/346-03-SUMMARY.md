---
phase: 346-integration-testing
plan: 03
subsystem: testing
tags: [dcent-swap, integration-tests, msw, vitest, policy-engine, connect-info]

requires:
  - phase: 346-01
    provides: Daemon lifecycle registration
  - phase: 346-02
    provides: SDK methods and skill files
provides:
  - 23 integration tests covering DCent Swap provider, policy engine, and connect-info
  - MSW-based HTTP mock test pattern for DCent Backend API
  - Policy integration verification (CONTRACT_CALL vs TRANSFER pipelines)
affects: []

tech-stack:
  added: [msw]
  patterns: [MSW server setup for action provider integration tests]

key-files:
  created:
    - packages/actions/src/__tests__/dcent-provider-integration.test.ts
    - packages/actions/src/__tests__/dcent-policy-integration.test.ts
    - packages/daemon/src/__tests__/connect-info-dcent.test.ts
  modified: []

key-decisions:
  - "Used MSW (Mock Service Worker) for HTTP-level mocking of DCent Backend API"
  - "2-hop routing test verifies fallback invocation rather than full intermediate token resolution"
  - "Policy integration tests verify output format (ContractCallRequest vs TransferRequest) not policy engine evaluation"

patterns-established:
  - "MSW server pattern for action provider integration tests with per-test handler overrides"

requirements-completed: [TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07]

duration: 5min
completed: 2026-03-06
---

# Phase 346 Plan 03: Integration Tests Summary

**23 MSW-based integration tests covering DEX swap, exchange, 2-hop routing, policy pipelines, error handling, and connect-info capability**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T14:31:00Z
- **Completed:** 2026-03-06T14:36:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- 18 DcentSwapActionProvider tests: dex_swap (native/ERC-20/2-hop), informational actions, query methods, error handling
- 5 policy integration tests: CONTRACT_CALL pipeline (native/ERC-20), TRANSFER pipeline (exchange DS-09), metadata
- 5 connect-info tests: capability enabled/disabled/missing, prompt hint presence/absence
- All 23 tests passing, typecheck clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Provider integration tests** - `95e395e2` (test)
2. **Task 2: Policy + connect-info tests** - `95e395e2` (test, combined commit)
3. **Task 3: Verification (typecheck + lint + all tests)** - verified, no separate commit needed

## Files Created/Modified
- `packages/actions/src/__tests__/dcent-provider-integration.test.ts` - 18 tests: resolve dex_swap, informational actions, query methods, error handling
- `packages/actions/src/__tests__/dcent-policy-integration.test.ts` - 5 tests: CONTRACT_CALL/TRANSFER pipeline output format, metadata
- `packages/daemon/src/__tests__/connect-info-dcent.test.ts` - 5 tests: capability toggle, prompt hint

## Decisions Made
- Used MSW for HTTP-level mocking (consistent with existing test patterns)
- 2-hop routing test verifies fallback invocation + failure path (not full intermediate token resolution)
- Policy tests verify output format, not full policy engine evaluation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ActionContext missing walletId field**
- **Found during:** Task 3 (typecheck verification)
- **Issue:** ActionContext requires walletId but test CONTEXT objects omitted it
- **Fix:** Added `walletId: 'test-wallet-uuid'` to CONTEXT in both test files
- **Files modified:** dcent-provider-integration.test.ts, dcent-policy-integration.test.ts
- **Verification:** Typecheck passes
- **Committed in:** 95e395e2

**2. [Rule 1 - Bug] Fixed optional expectedAmount BigInt conversion**
- **Found during:** Task 3 (typecheck verification)
- **Issue:** `BigInt(p.expectedAmount)` fails when expectedAmount is undefined (optional field)
- **Fix:** Changed to `BigInt(p.expectedAmount ?? '0')`
- **Files modified:** dcent-provider-integration.test.ts
- **Verification:** Typecheck passes
- **Committed in:** 95e395e2

**3. [Rule 1 - Bug] Fixed nullable querySwapStatus result access**
- **Found during:** Task 3 (typecheck verification)
- **Issue:** `result.status` errors when result is possibly null
- **Fix:** Changed to `result!.status` with `expect(result).not.toBeNull()` guard
- **Files modified:** dcent-provider-integration.test.ts
- **Verification:** Typecheck passes
- **Committed in:** 95e395e2

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All auto-fixes necessary for type safety. No scope creep.

## Issues Encountered
- Pre-existing lint error in auto-router.ts (unused `err` variable) -- out of scope, not fixed

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All integration tests passing -- milestone v31.3 ready for completion
- 23 new tests added to the test suite

---
*Phase: 346-integration-testing*
*Completed: 2026-03-06*
