---
phase: 309-tx-dryrun
plan: 01
subsystem: pipeline
tags: [zod, simulation, dry-run, policy, pipeline]

# Dependency graph
requires: []
provides:
  - DryRunSimulationResultSchema Zod SSoT with 8 schemas and 8 types
  - SimulationWarningCodeEnum with 12 warning codes
  - executeDryRun function with zero side effects
  - TransactionPipeline.executeDryRun() method delegation
  - buildByType/buildTransactionParam/getRequestAmount exported from stages.ts
affects: [309-02, 310, 311]

# Tech tracking
tech-stack:
  added: []
  patterns: [dry-run pipeline pattern with DryRunCollector, policy evaluation read-only path]

key-files:
  created:
    - packages/core/src/schemas/simulation.schema.ts
    - packages/daemon/src/pipeline/dry-run.ts
    - packages/core/src/__tests__/schemas/simulation.schema.test.ts
    - packages/daemon/src/__tests__/dry-run.test.ts
  modified:
    - packages/core/src/schemas/index.ts
    - packages/core/src/index.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/pipeline/pipeline.ts
    - packages/daemon/src/pipeline/index.ts

key-decisions:
  - "DryRunDeps excludes keyStore/masterPassword/notificationService/eventBus to enforce zero side effects at type level"
  - "buildByType and helper functions exported from stages.ts for dry-run reuse (previously private)"
  - "IPolicyEngine.evaluate() used (not evaluateAndReserve()) for read-only policy evaluation"
  - "Gas safety margin (estimatedFee * 120n) / 100n applied to fee estimate per CLAUDE.md convention"

patterns-established:
  - "DryRunCollector: accumulator pattern for collecting dry-run results through pipeline stages"
  - "Partial failure handling: build/simulation errors produce warnings, not thrown exceptions"

requirements-completed: [SIM-01, SIM-02, SIM-05]

# Metrics
duration: 8min
completed: 2026-03-03
---

# Phase 309 Plan 01: DryRunSimulationResult Schema + executeDryRun Pipeline Summary

**DryRunSimulationResult Zod SSoT with 12 warning codes + executeDryRun pipeline function returning policy/fee/balance/warnings with zero side effects**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-03T10:42:51Z
- **Completed:** 2026-03-03T10:50:51Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- DryRunSimulationResultSchema Zod SSoT with 8 schemas (PolicyResult, FeeEstimateResult, BalanceChange, SimulationWarning, SimulationDetail, SimulationMeta, SimulationWarningCodeEnum, DryRunSimulationResult) exported from @waiaas/core
- executeDryRun function that runs pipeline stages 1'/3'/5a'/5b' in read-only mode, producing DryRunSimulationResult with zero side effects (no DB writes, no signing, no notifications, no events)
- 12 simulation warning codes covering balance/policy/oracle/simulation/fee scenarios
- TransactionPipeline.executeDryRun() method for route handler integration
- 25 total tests (10 schema + 15 pipeline)

## Task Commits

Each task was committed atomically:

1. **Task 1: DryRunSimulationResult Zod schema + 12 warning codes** - `0d1000dd` (feat)
2. **Task 2: executeDryRun pipeline + TransactionPipeline extension** - `54a83a35` (feat)

## Files Created/Modified
- `packages/core/src/schemas/simulation.schema.ts` - 8 Zod schemas + 8 TypeScript types for dry-run simulation result
- `packages/daemon/src/pipeline/dry-run.ts` - executeDryRun function with DryRunCollector pattern, DryRunDeps interface
- `packages/core/src/schemas/index.ts` - Barrel export for simulation schemas
- `packages/core/src/index.ts` - Package entry point export for simulation schemas/types
- `packages/daemon/src/pipeline/stages.ts` - Export buildByType, buildTransactionParam, getRequestAmount/To/Memo, TransactionParam
- `packages/daemon/src/pipeline/pipeline.ts` - Add executeDryRun() method, priceOracle/settingsService to PipelineDeps
- `packages/daemon/src/pipeline/index.ts` - Barrel export for dry-run module

## Decisions Made
- DryRunDeps intentionally excludes keyStore, masterPassword, notificationService, and eventBus to enforce zero side effects at the TypeScript type level
- Used IPolicyEngine.evaluate() (read-only) rather than evaluateAndReserve() (DB-writing) for dry-run policy evaluation
- Applied gas safety margin ((estimatedFee * 120n) / 100n) per CLAUDE.md convention to fee estimates
- Build/simulation failures produce warnings with SIMULATION_FAILED code rather than throwing exceptions, following SIM-D02 design decision

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 6 APPROVAL_REQUIRED needed owner-registered DB mock**
- **Found during:** Task 2 (executeDryRun test)
- **Issue:** Test expected APPROVAL_REQUIRED warning but got DOWNGRADED_NO_OWNER because default mock returns ownerAddress=null, triggering APPROVAL->DELAY downgrade before APPROVAL_REQUIRED could be added
- **Fix:** Provided db mock returning ownerAddress/ownerVerified=true so downgrade doesn't happen
- **Files modified:** packages/daemon/src/__tests__/dry-run.test.ts
- **Verification:** All 15 tests pass
- **Committed in:** 54a83a35

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test fixture fix, no scope change.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- executeDryRun pipeline ready for REST API integration in Plan 309-02
- TransactionPipeline.executeDryRun() method available for route handler
- DryRunSimulationResult schema exported for OpenAPI response type derivation

---
*Phase: 309-tx-dryrun*
*Completed: 2026-03-03*
