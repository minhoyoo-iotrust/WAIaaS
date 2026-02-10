---
phase: 53-session-management
plan: 02
subsystem: auth
tags: [jwt, session, renewal, token-rotation, cas, hono, drizzle, vitest]

# Dependency graph
requires:
  - phase: 53-session-management
    plan: 01
    provides: "Session CRUD routes (POST/GET/DELETE), sessionRoutes factory, JwtSecretManager integration"
  - phase: 52-auth-foundation
    provides: "masterAuth, sessionAuth middleware, JwtSecretManager, sessions DB table"
provides:
  - "PUT /v1/sessions/:id/renew endpoint with token rotation"
  - "5 safety checks: maxRenewals, absoluteExpiresAt, 50% TTL, token_hash CAS, revocation"
  - "Auth middleware split: masterAuth on CRUD paths, sessionAuth on /renew path"
affects:
  - "Phase 54+ (any feature using session tokens with long-lived agents)"
  - "Future: rate limiting on renewal endpoint"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional auth middleware bypass (masterAuth skip on /renew sub-path)"
    - "token_hash CAS (Compare-And-Swap) for concurrent renewal prevention"
    - "vi.useFakeTimers for time-dependent JWT and TTL tests"

key-files:
  created:
    - "packages/daemon/src/__tests__/api-session-renewal.test.ts"
  modified:
    - "packages/daemon/src/api/routes/sessions.ts"
    - "packages/daemon/src/api/server.ts"

key-decisions:
  - "sessionAuth on /v1/sessions/:id/renew (session renews itself, not admin operation)"
  - "masterAuth conditional bypass via path.endsWith('/renew') check in middleware wrapper"
  - "CAS double-check: pre-read check + WHERE clause guard in UPDATE for race condition safety"
  - "Token TTL preserved across renewals (new token gets same TTL as original)"
  - "expiresAt clamped by absoluteExpiresAt on renewal (never extends beyond 30-day absolute lifetime)"

patterns-established:
  - "Conditional auth middleware: app.use path with inline check to bypass for specific sub-paths"
  - "Renewal safety pattern: 5-check sequence (exists, CAS, maxRenewals, absolute, TTL%) before issuing"

# Metrics
duration: 4min
completed: 2026-02-10
---

# Phase 53 Plan 02: Session Renewal Summary

**PUT /v1/sessions/:id/renew with 5 safety checks (maxRenewals, absoluteExpiresAt, 50% TTL, token_hash CAS, revocation), token rotation, and 11 TDD tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-10T07:54:23Z
- **Completed:** 2026-02-10T07:58:33Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- PUT /v1/sessions/:id/renew issues new JWT, rotates token hash in DB, increments renewalCount
- 5 safety checks enforced in order: session existence + revocation, token_hash CAS, maxRenewals (30), absoluteExpiresAt (30 days), 50% TTL elapsed
- Auth middleware cleanly separated: masterAuth on session CRUD paths, sessionAuth on /renew path
- New token expiresAt clamped by absoluteExpiresAt to prevent extending beyond absolute lifetime
- CAS guard on UPDATE WHERE clause prevents concurrent renewal race conditions
- 11 test cases passing with vi.useFakeTimers for time-dependent logic

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement PUT /v1/sessions/:id/renew with 5 safety checks + tests** - `0563897` (feat)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `packages/daemon/src/api/routes/sessions.ts` - Added PUT /sessions/:id/renew handler with 5 safety checks and token rotation
- `packages/daemon/src/api/server.ts` - Split auth middleware: masterAuth conditional bypass for /renew, sessionAuth on /v1/sessions/:id/renew
- `packages/daemon/src/__tests__/api-session-renewal.test.ts` - 11 test cases covering all safety checks, ownership, CAS, clamping, successive renewals

## Decisions Made
- **sessionAuth on renew endpoint:** Session renewal is a self-service operation (the session's own token authenticates it), not an admin operation. masterAuth is not required.
- **Conditional masterAuth bypass:** Since Hono's `app.use('/v1/sessions/:id')` would match the renew path too, a middleware wrapper checks `c.req.path.endsWith('/renew')` to skip masterAuth, letting sessionAuth handle renew exclusively.
- **CAS double-check pattern:** Pre-read check (`session.tokenHash !== currentTokenHash`) for early rejection + UPDATE WHERE (`eq(sessions.tokenHash, currentTokenHash)`) for atomicity. Both are needed: pre-check for clear error messages, WHERE clause for true atomicity.
- **Token TTL preserved:** Renewal keeps the same TTL duration as the original token (exp - iat), clamped by absoluteExpiresAt. This ensures predictable token lifetime behavior.
- **expiresAt clamped:** `Math.min(nowSec + newTtl, absoluteExpiresAtSec)` ensures the renewed token never extends beyond the 30-day absolute session lifetime.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Unused variable in test file causing TS6133 build error**
- **Found during:** Task 1 (TypeScript build)
- **Issue:** Initial test for "old token rejected after renewal" declared an unused `walletRes` variable, causing `TS6133: 'walletRes' is declared but its value is never read` build failure
- **Fix:** Removed the unused variable and refactored the test to directly verify CAS mismatch on second renewal attempt with old token
- **Files modified:** packages/daemon/src/__tests__/api-session-renewal.test.ts
- **Verification:** Build succeeds, test correctly verifies old token fails with SESSION_RENEWAL_MISMATCH
- **Committed in:** 0563897 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test code fix. No scope creep.

## Issues Encountered
- Pre-existing CLI E2E test failures (4 tests) continue to exist -- not related to session renewal changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Session management (CRUD + renewal) fully complete for Phase 53
- Phase 53 complete: all 2 plans shipped
- Ready for Phase 54+ features that depend on session tokens
- No blockers

## Self-Check: PASSED

---
*Phase: 53-session-management*
*Completed: 2026-02-10*
