---
phase: 412-spec-pipeline-ci-gate
plan: 01
subsystem: infra
tags: [openapi, openapi-typescript, codegen, build-pipeline]

requires: []
provides:
  - "OpenAPI spec extraction script (scripts/extract-openapi.ts)"
  - "Type generation pipeline (scripts/generate-api-types.ts)"
  - "Generated TypeScript types (packages/admin/src/api/types.generated.ts)"
  - "generate:api-types npm command"
affects: [412-02, 413, 414, 416]

tech-stack:
  added: [openapi-typescript v7]
  patterns: [createApp stub deps for build-time spec extraction, openapi-typescript programmatic API]

key-files:
  created:
    - scripts/extract-openapi.ts
    - scripts/generate-api-types.ts
    - packages/admin/src/api/types.generated.ts
  modified:
    - package.json
    - .gitignore

key-decisions:
  - "Stub deps with as-unknown-as casts for route registration (no runtime calls)"
  - "eventBus stub needs on/off/emit methods (CompletionWaiter subscribes during route init)"
  - "openapi.json gitignored as intermediate artifact, types.generated.ts committed for CI freshness"
  - "openapi-typescript v7 programmatic API (not CLI)"

patterns-established:
  - "Build-time spec extraction: createApp(stubDeps) + /doc request pattern"
  - "Type generation: extract -> openapi-typescript -> types.generated.ts pipeline"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03, PIPE-04]

duration: 8min
completed: 2026-03-15
---

# Phase 412 Plan 01: OpenAPI Spec Extraction + Type Generation Pipeline Summary

**Build-time OpenAPI spec extraction from createApp(stubDeps) with 115 paths, plus openapi-typescript type generation producing 301KB types.generated.ts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-14T17:45:51Z
- **Completed:** 2026-03-14T17:54:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Full OpenAPI spec extraction (115 paths) via createApp() with comprehensive stub deps
- openapi-typescript v7 programmatic type generation (8992 lines, 301KB)
- Single command `pnpm run generate:api-types` for end-to-end pipeline
- openapi.json gitignored, types.generated.ts committed for CI diff

## Task Commits

1. **Task 1: OpenAPI spec extraction script + stub deps** - `7f4e319d` (feat)
2. **Task 2: openapi-typescript type generation + generate:api-types command** - `1bbb73a8` (feat)

## Files Created/Modified
- `scripts/extract-openapi.ts` - Build-time spec extraction with full stub deps
- `scripts/generate-api-types.ts` - Pipeline orchestrator: extract + generate types
- `packages/admin/src/api/types.generated.ts` - Auto-generated TypeScript types (301KB)
- `package.json` - Added generate:api-types script + openapi-typescript dep
- `.gitignore` - Added packages/admin/openapi.json

## Decisions Made
- Used `as unknown as Type` casts for stub deps since route registration never calls methods
- eventBus stub requires on/off/emit methods because CompletionWaiter subscribes during rpcProxyRoutes init
- openapi.json is gitignored (intermediate), types.generated.ts is committed (CI freshness target)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] eventBus stub needed on/off/emit methods**
- **Found during:** Task 1 (extract-openapi.ts)
- **Issue:** CompletionWaiter constructor calls `this.eventBus.on()` during rpcProxyRoutes initialization
- **Fix:** Added `{ on: () => {}, off: () => {}, emit: () => {} }` to eventBus stub
- **Files modified:** scripts/extract-openapi.ts
- **Verification:** Script runs successfully, extracts 115 paths
- **Committed in:** 7f4e319d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for correct spec extraction. No scope creep.

## Issues Encountered
None beyond the eventBus stub fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- types.generated.ts ready for CI freshness checking (Plan 412-02)
- Turbo pipeline integration ready (Plan 412-02)
- Generated types ready for openapi-fetch client wrapping (Phase 413)

---
*Phase: 412-spec-pipeline-ci-gate*
*Completed: 2026-03-15*
