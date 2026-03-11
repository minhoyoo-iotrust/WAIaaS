---
phase: 378-error-consistency
plan: 01
subsystem: api
tags: [WAIaaSError, error-codes, hono, api-consistency]

# Dependency graph
requires: []
provides:
  - "INVALID_TOKEN_IDENTIFIER and STATS_NOT_CONFIGURED error codes in @waiaas/core"
  - "Consistent WAIaaSError-based error responses in nft-approvals, admin-monitoring"
  - "Standard Hono c.body(null, 204) pattern in sessions.ts"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WAIaaSError throw for all API error responses (no c.json error pattern)"
    - "c.body(null, 204) for empty 204 responses (no raw Response constructor)"

key-files:
  created: []
  modified:
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/api/routes/nft-approvals.ts
    - packages/daemon/src/api/routes/sessions.ts
    - packages/daemon/src/api/routes/admin-monitoring.ts
    - packages/daemon/src/api/routes/erc8004.ts
    - packages/daemon/src/__tests__/nft-approval-api.test.ts
    - packages/core/src/__tests__/errors.test.ts
    - packages/core/src/__tests__/i18n.test.ts
    - packages/core/src/__tests__/package-exports.test.ts

key-decisions:
  - "INVALID_TOKEN_IDENTIFIER in NFT domain, STATS_NOT_CONFIGURED in ADMIN domain"
  - "erc8004.ts as any removal safe because schema uses z.any()"

patterns-established:
  - "All API error responses must use WAIaaSError throw, never c.json({ error }) direct return"

requirements-completed: [ERR-01, ERR-02, ERR-03]

# Metrics
duration: 19min
completed: 2026-03-11
---

# Phase 378 Plan 01: API Error Response Consistency Summary

**Non-standard error/response patterns replaced with WAIaaSError throws and standard Hono patterns across 4 route files, 2 new error codes added**

## Performance

- **Duration:** 19 min
- **Started:** 2026-03-11T09:14:57Z
- **Completed:** 2026-03-11T09:34:03Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Added INVALID_TOKEN_IDENTIFIER and STATS_NOT_CONFIGURED error codes with en/ko i18n translations (error code count 135 -> 137)
- Replaced all `c.json({ error: ... }, 400)` patterns in nft-approvals.ts with WAIaaSError throws
- Replaced `503 as any` in admin-monitoring.ts with `throw new WAIaaSError('STATS_NOT_CONFIGURED')`
- Replaced `new Response(null, { status: 204 }) as any` in sessions.ts with standard `c.body(null, 204)`
- Removed `as any` from `c.json(file as any, 200)` in erc8004.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Error codes + nft-approvals + admin-monitoring WAIaaSError** - `680c8412` (fix)
2. **Task 2: sessions.ts 204 + erc8004.ts as any + test updates** - `a264d0be` (fix)

## Files Created/Modified
- `packages/core/src/errors/error-codes.ts` - Added INVALID_TOKEN_IDENTIFIER (NFT) and STATS_NOT_CONFIGURED (ADMIN) error codes
- `packages/core/src/i18n/en.ts` - English translations for 2 new error codes
- `packages/core/src/i18n/ko.ts` - Korean translations for 2 new error codes
- `packages/daemon/src/api/routes/nft-approvals.ts` - c.json error returns -> WAIaaSError throws
- `packages/daemon/src/api/routes/admin-monitoring.ts` - 503 as any -> WAIaaSError throw
- `packages/daemon/src/api/routes/sessions.ts` - Response constructor -> c.body(null, 204)
- `packages/daemon/src/api/routes/erc8004.ts` - Removed response as any cast
- `packages/daemon/src/__tests__/nft-approval-api.test.ts` - Added WAIaaSError handler, updated assertions
- `packages/core/src/__tests__/errors.test.ts` - Error code count 135 -> 137
- `packages/core/src/__tests__/i18n.test.ts` - i18n message count 135 -> 137
- `packages/core/src/__tests__/package-exports.test.ts` - Export count 135 -> 137

## Decisions Made
- INVALID_TOKEN_IDENTIFIER placed in NFT domain (not TX) since it specifically validates NFT token identifiers
- STATS_NOT_CONFIGURED placed in ADMIN domain since stats service is an admin feature
- erc8004.ts `as any` removal safe: `Erc8004RegistrationFileResponseSchema` uses `z.any()`, so `Record<string, unknown>` is type-compatible

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated error code count in 3 test files**
- **Found during:** Task 2 (test verification)
- **Issue:** 3 test files assert exact error code count (135), but adding 2 new codes makes it 137
- **Fix:** Updated expected counts in errors.test.ts, i18n.test.ts, package-exports.test.ts
- **Files modified:** packages/core/src/__tests__/errors.test.ts, packages/core/src/__tests__/i18n.test.ts, packages/core/src/__tests__/package-exports.test.ts
- **Verification:** All core tests pass
- **Committed in:** a264d0be (Task 2 commit)

**2. [Rule 1 - Bug] Added WAIaaSError handler to nft-approval-api tests**
- **Found during:** Task 2 (test verification)
- **Issue:** Test Hono app had no error middleware; WAIaaSError throws returned 500 instead of expected status codes
- **Fix:** Created createTestApp helper with onError handler that converts WAIaaSError to proper HTTP responses; added code assertion for NETWORK_REQUIRED and INVALID_TOKEN_IDENTIFIER
- **Files modified:** packages/daemon/src/__tests__/nft-approval-api.test.ts
- **Verification:** All 4 nft-approval-api tests pass with correct status codes and error codes
- **Committed in:** a264d0be (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for test correctness after switching from c.json to WAIaaSError. No scope creep.

## Issues Encountered
- i18n translation files (en.ts/ko.ts) required corresponding entries for new error codes (build failed without them)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 378 complete, all error responses standardized
- Ready for Phase 379 (constant centralization) or any other independent phase

---
*Phase: 378-error-consistency*
*Completed: 2026-03-11*
