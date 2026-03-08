---
phase: 349-core-infra-perp
plan: 01
subsystem: infra
tags: [api-direct-result, eip712, pipeline, action-provider, type-guard]

requires:
  - phase: 348
    provides: ApiDirectResult design (HDESIGN-01), requiresSigningKey pipeline spec
provides:
  - ApiDirectResult type and isApiDirectResult() guard in @waiaas/core
  - Stage 5 ApiDirectResult branch skipping on-chain execution
  - requiresSigningKey field on ActionProviderMetadata
  - privateKey field on ActionContext
  - IActionProvider.resolve() return type includes ApiDirectResult
  - ActionProviderRegistry.executeResolve() handles ApiDirectResult
affects: [349-02, 349-03, 349-04, 350, 351]

tech-stack:
  added: []
  patterns: [ApiDirectResult discriminant pattern, requiresSigningKey key injection]

key-files:
  created:
    - packages/core/src/__tests__/action-provider-types.test.ts
    - packages/daemon/src/__tests__/pipeline-api-direct.test.ts
  modified:
    - packages/core/src/interfaces/action-provider.types.ts
    - packages/core/src/interfaces/index.ts
    - packages/core/src/index.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/infrastructure/action/action-provider-registry.ts

key-decisions:
  - "ApiDirectResult uses __apiDirect: true as discriminant field for type guard"
  - "executeResolve returns (ContractCallRequest | ApiDirectResult)[] union"
  - "Stage 5 stores apiDirect metadata in transactions.metadata JSON"

patterns-established:
  - "ApiDirectResult pattern: providers returning API results bypass on-chain execution"
  - "requiresSigningKey: providers declare key need via metadata, registry injects into context"

requirements-completed: [HPOL-01]

duration: 10min
completed: 2026-03-08
---

# Phase 349 Plan 01: ApiDirectResult Pipeline Summary

**ApiDirectResult type with __apiDirect discriminant, Stage 5 branch skipping on-chain execution, and requiresSigningKey metadata for key injection**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-08T03:48:11Z
- **Completed:** 2026-03-08T03:59:00Z
- **Tasks:** 2
- **Files modified:** 28

## Accomplishments
- ApiDirectResult interface with type guard exported from @waiaas/core
- Stage 5 branches on actionResult to skip build/simulate/sign/submit entirely
- ActionProviderRegistry handles ApiDirectResult without ContractCallRequestSchema validation
- All 11 existing providers updated with requiresSigningKey: false
- 19 test assertions for type guard + 4 for registry behavior

## Task Commits

1. **Task 1: ApiDirectResult type + IActionProvider.resolve() return type** - `1fbd53fd` (feat)
2. **Task 2: Stage 5 ApiDirectResult branch + requiresSigningKey** - `7f544cdc` (feat)

## Files Created/Modified
- `packages/core/src/interfaces/action-provider.types.ts` - ApiDirectResult, isApiDirectResult, requiresSigningKey, privateKey
- `packages/core/src/interfaces/index.ts` - Export ApiDirectResult and isApiDirectResult
- `packages/core/src/index.ts` - Barrel export for ApiDirectResult and isApiDirectResult
- `packages/daemon/src/pipeline/stages.ts` - Stage 5 ApiDirectResult branch (ctx.actionResult check)
- `packages/daemon/src/infrastructure/action/action-provider-registry.ts` - executeResolve ApiDirectResult handling
- `packages/actions/src/providers/*/index.ts` - requiresSigningKey: false added to all 11 providers

## Decisions Made
- executeResolve returns a union type `(ContractCallRequest | ApiDirectResult)[]` rather than separate methods
- Stage 5 ApiDirectResult branch stores structured metadata in transactions.metadata JSON
- All existing providers explicitly declare `requiresSigningKey: false` for type safety

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added requiresSigningKey to all existing providers and test mocks**
- **Found during:** Task 1 (typecheck)
- **Issue:** Adding requiresSigningKey to ActionProviderMetadataSchema made it required in TypeScript output type, causing type errors in all 11 existing providers and 7 test files
- **Fix:** Added `requiresSigningKey: false` to all provider metadata objects and test mock objects
- **Files modified:** 11 provider index.ts files, 7 test files
- **Verification:** `pnpm turbo run typecheck` passes for core, actions, daemon
- **Committed in:** 1fbd53fd (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Mechanical type fix required by schema extension. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ApiDirectResult pattern ready for HyperliquidPerpProvider (Plan 03)
- Stage 5 branch ready to process API-direct results
- requiresSigningKey ready for key injection in registry

---
*Phase: 349-core-infra-perp*
*Completed: 2026-03-08*
