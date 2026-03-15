---
phase: 424-ssrf-guard-hostguard-fix
plan: 01
subsystem: security
tags: [ssrf, host-guard, ip-validation, middleware, fetch]

# Dependency graph
requires: []
provides:
  - "Universal SSRF guard at infrastructure/security/ssrf-guard.ts with allowHttp option"
  - "Admin RPC Test endpoint SSRF protection (validateUrlSafety before fetch)"
  - "hostGuard exact hostname matching (prefix bypass eliminated)"
  - "12 security tests for SSRF + hostGuard bypass prevention"
affects: [rate-limit, cors, webhook, external-action]

# Tech tracking
tech-stack:
  added: []
  patterns: ["infrastructure/security/ for shared security modules", "validateUrlSafety allowHttp option for non-HTTPS endpoints"]

key-files:
  created:
    - packages/daemon/src/infrastructure/security/ssrf-guard.ts
    - packages/daemon/src/__tests__/security/ssrf-hostguard.test.ts
  modified:
    - packages/daemon/src/services/x402/ssrf-guard.ts
    - packages/daemon/src/api/routes/admin-settings.ts
    - packages/daemon/src/api/middleware/host-guard.ts
    - packages/daemon/src/__tests__/ssrf-guard.test.ts

key-decisions:
  - "Kept X402_SSRF_BLOCKED error code for universal use (core package change not required)"
  - "Re-export pattern for backward compatibility (services/x402/ssrf-guard.ts re-exports from infrastructure/security/)"
  - "hostGuard SYSTEM_LOCKED returns 503 (existing error code mapping, not 403)"

patterns-established:
  - "infrastructure/security/ directory for shared security modules"
  - "validateUrlSafety with allowHttp option for HTTP-allowed endpoints"

requirements-completed: [SSRF-01, SSRF-02, SSRF-03, SSRF-04]

# Metrics
duration: 4min
completed: 2026-03-15
---

# Phase 424 Plan 01: SSRF Guard + hostGuard Fix Summary

**Universal SSRF guard with allowHttp option at infrastructure/security/, Admin RPC Test SSRF protection, and hostGuard exact-match-only hostname validation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T15:05:59Z
- **Completed:** 2026-03-15T15:10:29Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Moved ssrf-guard.ts from x402-specific to universal infrastructure/security/ location with allowHttp option
- Added SSRF protection to Admin RPC Test endpoint (blocks 169.254.x.x, 10.x.x.x, etc.)
- Fixed hostGuard startsWith bypass vulnerability (localhost.evil.com no longer passes)
- 12 new security tests covering SSRF internal IP blocking and hostGuard prefix bypass prevention

## Task Commits

Each task was committed atomically:

1. **Task 1: SSRF guard generalization + hostGuard exact match fix** - `b3f67476` (feat)
2. **Task 2: SSRF block + hostGuard bypass prevention tests** - `798e18f4` (test)

## Files Created/Modified
- `packages/daemon/src/infrastructure/security/ssrf-guard.ts` - Universal SSRF guard with ValidateUrlOptions (allowHttp)
- `packages/daemon/src/services/x402/ssrf-guard.ts` - Re-export shim for backward compatibility
- `packages/daemon/src/api/routes/admin-settings.ts` - validateUrlSafety() call in test-rpc handler
- `packages/daemon/src/api/middleware/host-guard.ts` - Exact hostname matching only (removed startsWith)
- `packages/daemon/src/__tests__/ssrf-guard.test.ts` - Updated import path to new location
- `packages/daemon/src/__tests__/security/ssrf-hostguard.test.ts` - 12 security tests (6 SSRF + 6 hostGuard)

## Decisions Made
- Kept `X402_SSRF_BLOCKED` error code for universal SSRF blocking (adding new error code would require @waiaas/core changes)
- Used re-export pattern at old path for zero-breaking-change migration
- SYSTEM_LOCKED (503) for hostGuard rejection matches existing WAIaaSError code mapping

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] hostGuard test expected 403 but SYSTEM_LOCKED maps to 503**
- **Found during:** Task 2 (security test creation)
- **Issue:** Plan specified 403 for hostGuard rejection, but SYSTEM_LOCKED error code maps to httpStatus 503
- **Fix:** Added errorHandler to test Hono app, changed expected status from 403 to 503, added code assertion
- **Files modified:** packages/daemon/src/__tests__/security/ssrf-hostguard.test.ts
- **Verification:** All 12 tests pass
- **Committed in:** 798e18f4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test expectation corrected to match actual error code HTTP status. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SSRF guard is now universally importable for any future endpoint that performs external fetches
- Phase 425 (Rate Limit Middleware) and Phase 426 (CORS + Resource Management) can proceed independently

---
*Phase: 424-ssrf-guard-hostguard-fix*
*Completed: 2026-03-15*
