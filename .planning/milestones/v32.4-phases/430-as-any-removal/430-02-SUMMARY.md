---
phase: 430-as-any-removal
plan: 02
subsystem: infra
tags: [typescript, as-any, viem, bundler-client, type-safety]

requires:
  - phase: 427
    provides: ChainType/NetworkType exports
provides:
  - typed evict() calls with ChainType/NetworkType in hot-reload
  - BundlerOps type interface for viem bundlerClient methods
  - typed PipelineContext source property
affects: [430-03]

tech-stack:
  added: []
  patterns: [BundlerOps wrapper type, as unknown as PublicClient for viem generics]

key-files:
  created: []
  modified:
    - packages/daemon/src/infrastructure/settings/hot-reload.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/api/routes/userop.ts
    - packages/daemon/src/rpc-proxy/sync-pipeline.ts

key-decisions:
  - "BundlerOps type interface for viem bundlerClient: avoids as any while working around strict viem generic inference"
  - "as unknown as PublicClient for createPublicClient: viem generics require exact chain type, PublicClient is the interface contract"
  - "PipelineContext & { source?: string } intersection type for sync-pipeline source property"

patterns-established:
  - "BundlerOps type: focused method interface for viem bundlerClient when account is pre-configured"
  - "as unknown as PublicClient: standard cast for viem createPublicClient when exact chain generic is unavailable"

requirements-completed: [CAST-02, CAST-04, CAST-09, CAST-10]

duration: 15min
completed: 2026-03-16
---

# Phase 430 Plan 02: hot-reload/stages/userop/sync-pipeline as any Removal

**Replaced 15 as any casts with ChainType/NetworkType assertions, BundlerOps typed wrapper, and PublicClient casts**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-16T06:05:16Z
- **Completed:** 2026-03-16T06:20:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced 6 evict() as any calls with ChainType/NetworkType typed assertions
- Defined BundlerOps type interface for prepareUserOperation/sendUserOperation/waitForUserOperationReceipt
- Cast createPublicClient result via as unknown as PublicClient (3 sites)
- Replaced (ctx.request as any).type with 'type' in ctx.request narrowing

## Task Commits

1. **Task 1: hot-reload.ts + sync-pipeline.ts** - `8e6eab22` (fix)
2. **Task 2: stages.ts + userop.ts bundlerClient/publicClient** - `6220493f` (fix)

## Files Created/Modified
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` - ChainType/NetworkType for evict(), Record<string, unknown> for duck-typed monitor
- `packages/daemon/src/pipeline/stages.ts` - BundlerOps type, PublicClient cast, request.type narrowing
- `packages/daemon/src/api/routes/userop.ts` - PublicClient cast (2 sites)
- `packages/daemon/src/rpc-proxy/sync-pipeline.ts` - PipelineContext & { source?: string } intersection

## Decisions Made
- BundlerOps type interface chosen over extending viem's BundlerClient type (simpler, no deep viem generic gymnastics)
- Replaced Partial<any> in HotReloadDeps with Record<string, unknown> for duck-typed incomingTxMonitorService

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Plan 02 as any removals complete, ready for Plan 03 final sweep

---
*Phase: 430-as-any-removal*
*Completed: 2026-03-16*
