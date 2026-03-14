---
phase: 412-spec-pipeline-ci-gate
plan: 02
subsystem: infra
tags: [turbo, ci, freshness-gate, openapi]

requires:
  - phase: 412-01
    provides: "generate:api-types command and types.generated.ts"
provides:
  - "Turbo pipeline with generate:api-types before admin build"
  - "CI freshness gate for types.generated.ts"
  - "check:api-types-freshness npm command"
affects: [413, 414, 416]

tech-stack:
  added: []
  patterns: [Turbo root task (//#), CI content-based freshness check]

key-files:
  created:
    - scripts/check-api-types-freshness.ts
  modified:
    - turbo.json
    - .github/workflows/ci.yml
    - package.json

key-decisions:
  - "Root task //#generate:api-types with cache:false to prevent stale spec"
  - "Freshness check uses pure content comparison (no git diff) for CI reliability"
  - "Freshness check in CI stage2 (PR only) after Validate OpenAPI Spec"

patterns-established:
  - "Turbo root task pattern: //#taskname for monorepo-wide tasks"
  - "CI freshness gate: regenerate + compare pattern for generated files"

requirements-completed: [PIPE-05, PIPE-06]

duration: 5min
completed: 2026-03-15
---

# Phase 412 Plan 02: Turbo Pipeline Integration + CI Freshness Gate Summary

**Turbo pipeline runs generate:api-types before admin build (cache:false), with CI freshness gate blocking stale types in PRs**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-14T17:54:00Z
- **Completed:** 2026-03-14T17:59:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Turbo pipeline ensures types.generated.ts is always fresh before admin build
- CI freshness gate blocks PRs with stale generated types
- cache:false prevents Turbo from serving stale openapi.json

## Task Commits

1. **Task 1: Turbo pipeline generate:api-types task** - `6135efab` (chore)
2. **Task 2: CI freshness check + workflow integration** - `de1c0d10` (feat)

## Files Created/Modified
- `turbo.json` - Added //#generate:api-types root task, admin build dependency
- `scripts/check-api-types-freshness.ts` - Content-based freshness comparison
- `.github/workflows/ci.yml` - Added freshness check step in stage2
- `package.json` - Added check:api-types-freshness script

## Decisions Made
- Used //#generate:api-types (root task) since the script runs from monorepo root
- cache:false ensures every build gets fresh spec extraction
- Content comparison (not git diff) for freshness -- works with untracked files in CI

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full type generation + CI pipeline operational
- Ready for Phase 413: openapi-fetch client wrapper + first page migration

---
*Phase: 412-spec-pipeline-ci-gate*
*Completed: 2026-03-15*
