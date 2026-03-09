---
phase: 357-e2e-infra
plan: 03
subsystem: testing
tags: [http-client, session, auth, masterAuth, sessionAuth]

requires:
  - phase: 357-01
    provides: "@waiaas/e2e-tests package structure"
  - phase: 357-02
    provides: "DaemonManager for starting test daemon"

provides:
  - "E2EHttpClient with auto Bearer token attachment"
  - "SessionManager with wallet+session creation, renewal, rotation, deletion"
  - "setupDaemonSession one-line convenience function"

affects: [358, 359, 360, 362, 363]

tech-stack:
  added: []
  patterns: ["X-Master-Password + sessionAuth dual-client pattern", "setupDaemonSession one-liner"]

key-files:
  created:
    - packages/e2e-tests/src/helpers/http-client.ts
    - packages/e2e-tests/src/helpers/session.ts
    - packages/e2e-tests/src/__tests__/helpers.test.ts
  modified:
    - packages/e2e-tests/src/helpers/index.ts
    - packages/e2e-tests/src/index.ts

key-decisions:
  - "SessionManager uses dual HTTP clients: adminClient (X-Master-Password) and sessionClient (Bearer token)"
  - "setupDaemonSession creates wallet with auto-session (POST /v1/wallets with createSession:true)"
  - "Test session rotation instead of renewal (renewal requires 50% TTL elapsed)"

patterns-established:
  - "setupDaemonSession(baseUrl, masterPassword) -> { session, http, token } one-liner"
  - "E2EHttpClient auto-attaches token on all requests"
  - "SessionManager exposes .http (sessionAuth) and .admin (masterAuth) clients"

requirements-completed: [INFRA-04, INFRA-05]

duration: 8min
completed: 2026-03-09
---

# Phase 357 Plan 03: Session Management + HTTP Client Helpers Summary

**E2EHttpClient with auto Bearer token and SessionManager with dual-auth (X-Master-Password + sessionAuth) for one-line E2E test setup**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-09T06:27:00Z
- **Completed:** 2026-03-09T06:35:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- E2EHttpClient wraps fetch with auto Authorization header injection
- SessionManager provides complete session lifecycle management
- setupDaemonSession creates wallet + session in one call
- 3 integration tests verify setup, auth, and lifecycle

## Task Commits

1. **Task 1+2: SessionManager + E2EHttpClient + integration tests** - `1adca3e2` (feat)

## Files Created/Modified
- `packages/e2e-tests/src/helpers/http-client.ts` - E2EHttpClient (GET/POST/PUT/DELETE/PATCH with auto-auth)
- `packages/e2e-tests/src/helpers/session.ts` - SessionManager + setupDaemonSession
- `packages/e2e-tests/src/__tests__/helpers.test.ts` - 3 integration tests
- `packages/e2e-tests/src/helpers/index.ts` - Re-export updates
- `packages/e2e-tests/src/index.ts` - Re-export updates

## Decisions Made
- Used dual-client approach: adminClient for X-Master-Password operations, sessionClient for Bearer token operations
- Create wallet with createSession:true to get session token in one step (no separate "set master password" API)
- Test token rotation instead of renewal since renewal requires 50% TTL elapsed
- SessionManager exposes .walletId for tests that need the wallet

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adapted to actual WAIaaS auth model**
- **Found during:** Task 2 (integration test)
- **Issue:** Plan assumed PUT /v1/auth/master and POST /v1/auth/session endpoints which don't exist. WAIaaS uses X-Master-Password header + POST /v1/wallets (createSession:true) + POST /v1/sessions (masterAuth)
- **Fix:** Rewrote SessionManager to use correct API: dual-client, wallet creation with auto-session, correct paths
- **Files modified:** session.ts, helpers.test.ts
- **Verification:** All 3 integration tests pass

**2. [Rule 1 - Bug] Fixed renewal test for unlimited sessions**
- **Found during:** Task 2 (integration test)
- **Issue:** Default sessions are unlimited (no TTL) so renewal returns RENEWAL_NOT_REQUIRED, and finite-TTL sessions return RENEWAL_TOO_EARLY for immediate renewal
- **Fix:** Changed test to use token rotation (POST /sessions/:id/rotate) instead of renewal
- **Files modified:** helpers.test.ts
- **Verification:** Test passes with rotation

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Essential corrections for actual API compatibility. No scope creep.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All E2E infrastructure complete: package, types, reporter, daemon lifecycle, session management
- Ready for Phase 358 (offchain smoke scenarios) and Phase 362 (onchain precondition checker)

---
*Phase: 357-e2e-infra*
*Completed: 2026-03-09*
