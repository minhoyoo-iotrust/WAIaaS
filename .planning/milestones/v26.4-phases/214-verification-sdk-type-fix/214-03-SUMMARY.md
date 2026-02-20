---
phase: 214-verification-sdk-type-fix
plan: 03
subsystem: api
tags: [sdk, python-sdk, types, connect-info, openapi]

# Dependency graph
requires:
  - phase: 214-01
    provides: verification reports confirming daemon connect-info schema shape
  - phase: 214-02
    provides: Phase 213 verification identifying INTG-01 type mismatch
provides:
  - SDK ConnectInfoResponse with top-level policies Record matching daemon schema
  - SDK ConnectInfoPolicyEntry type with type/rules/priority/network fields
  - Python SDK ConnectInfo with top-level policies dict matching daemon schema
affects: [sdk, python-sdk, mcp, admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - packages/sdk/src/types.ts
    - packages/sdk/src/index.ts
    - python-sdk/waiaas/models.py

key-decisions:
  - "ConnectInfoPolicyEntry has priority and network fields (matching daemon schema exactly)"

patterns-established: []

requirements-completed: [DISC-01, DISC-02, DISC-03, DISC-04, INTG-01, INTG-02, INTG-03, INTG-04, INTG-05, INTG-06, INTG-07, INTG-08, INTG-09, INTG-10]

# Metrics
duration: 2min
completed: 2026-02-21
---

# Phase 214 Plan 03: SDK ConnectInfo Type Fix Summary

**SDK and Python SDK ConnectInfoResponse types realigned with daemon schema -- top-level policies Record instead of embedded in wallet objects**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T23:11:53Z
- **Completed:** 2026-02-20T23:13:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- SDK ConnectInfoResponse now has top-level `policies: Record<string, ConnectInfoPolicyEntry[]>` matching daemon schema
- SDK ConnectInfoWallet no longer has embedded policies field (matches daemon wallet object shape)
- New `ConnectInfoPolicyEntry` interface exported with `type`, `rules`, `priority`, `network` fields
- Python SDK ConnectInfo has top-level `policies: dict[str, list[dict[str, Any]]]` matching daemon schema
- All 121 SDK tests pass, typecheck and lint clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix TypeScript SDK ConnectInfoResponse type** - `7ab8828` (fix)
2. **Task 2: Fix Python SDK ConnectInfo type** - `cdd064b` (fix)

## Files Created/Modified
- `packages/sdk/src/types.ts` - Added ConnectInfoPolicyEntry, removed policies from ConnectInfoWallet, added top-level policies to ConnectInfoResponse
- `packages/sdk/src/index.ts` - Added ConnectInfoPolicyEntry to type exports
- `python-sdk/waiaas/models.py` - Removed policies from ConnectInfoWallet, added top-level policies to ConnectInfo

## Decisions Made
- ConnectInfoPolicyEntry includes `priority: number` and `network: string | null` fields to exactly match daemon's ConnectInfoResponseSchema (openapi-schemas.ts L1005-1010)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 214 complete (all 3 plans done)
- SDK and Python SDK types now match daemon schema exactly
- INTG-01 audit finding resolved

## Self-Check: PASSED

All 3 files verified present. Both commit hashes (7ab8828, cdd064b) found in git log.

---
*Phase: 214-verification-sdk-type-fix*
*Completed: 2026-02-21*
