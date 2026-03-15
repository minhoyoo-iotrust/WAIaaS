---
phase: 422-notification-pipeline-integration
plan: 01
subsystem: notifications
tags: [pipeline, contract-name, i18n, notifications]

# Dependency graph
requires:
  - phase: 421-registry-core-well-known-data
    provides: ContractNameRegistry 4-tier resolution service
provides:
  - resolveNotificationTo helper for CONTRACT_CALL notification enrichment
  - ContractNameRegistry wired into PipelineContext at all tx entry points
  - i18n templates updated with {to} field in TX_SUBMITTED/TX_CONFIRMED
affects: [423-api-admin-ui-contract-names]

# Tech tracking
tech-stack:
  added: []
  patterns: [resolveNotificationTo pattern for notification field enrichment]

key-files:
  created: []
  modified:
    - packages/daemon/src/pipeline/stages.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/routes/actions.ts
    - packages/daemon/src/api/routes/admin-actions.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/pipeline/pipeline.ts
    - packages/daemon/src/__tests__/pipeline-notification.test.ts

key-decisions:
  - "resolveNotificationTo only resolves CONTRACT_CALL type; TRANSFER/TOKEN_TRANSFER pass raw address unchanged"
  - "Fallback (unregistered contract) returns raw address without name prefix -- consistent with pre-v32.0 behavior"
  - "TX_SUBMITTED and TX_CONFIRMED i18n templates updated to include {to} field per NTF-03/NTF-04 requirements"

patterns-established:
  - "resolveNotificationTo: centralized notification {to} resolution -- all 7 notify call sites in stages.ts use it"

requirements-completed: [NTF-01, NTF-02, NTF-03, NTF-04, NTF-05, NTF-06]

# Metrics
duration: 12min
completed: 2026-03-15
---

# Phase 422 Plan 01: Notification Pipeline Integration Summary

**CONTRACT_CALL notifications show resolved contract names via resolveNotificationTo helper at all 7 pipeline notify call sites, with 24 tests covering unit + e2e rendering in en/ko**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-15T13:16:00Z
- **Completed:** 2026-03-15T13:28:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- All 7 notification call sites (TX_REQUESTED, TX_APPROVAL_REQUIRED, TX_SUBMITTED x2, TX_CONFIRMED x3) use resolveNotificationTo
- CONTRACT_CALL with known contract shows "Protocol Name (0xabcd...1234)" format
- TRANSFER/TOKEN_TRANSFER notifications pass raw address unchanged (backward compatible)
- TX_SUBMITTED and TX_CONFIRMED i18n templates now include {to} field (en + ko)
- ContractNameRegistry instantiated at daemon startup and wired through all deps chains
- 16 new tests (9 unit + 7 e2e rendering) -- all 24 pipeline-notification tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: ContractNameRegistry wiring + resolveNotificationTo + all notify sites** - `80653991` (feat)
2. **Task 2: End-to-end notification rendering tests** - `4d9d4d51` (test)
3. **Fix: Remove unused variables + AdminActionRouteDeps interface** - `73693290` (fix)

## Files Created/Modified
- `packages/daemon/src/pipeline/stages.ts` - resolveNotificationTo helper + PipelineContext.contractNameRegistry + all 7 notify sites updated
- `packages/core/src/i18n/en.ts` - TX_SUBMITTED/TX_CONFIRMED templates add {to} field
- `packages/core/src/i18n/ko.ts` - TX_SUBMITTED/TX_CONFIRMED templates add {to} field
- `packages/daemon/src/api/routes/transactions.ts` - TransactionRouteDeps + PipelineContext injection
- `packages/daemon/src/api/routes/actions.ts` - ActionRouteDeps + PipelineContext injection
- `packages/daemon/src/api/routes/admin-actions.ts` - AdminActionRouteDeps + contractNameRegistry
- `packages/daemon/src/api/server.ts` - CreateAppDeps + all route deps wiring
- `packages/daemon/src/lifecycle/daemon.ts` - ContractNameRegistry instantiation + createApp deps
- `packages/daemon/src/pipeline/pipeline.ts` - PipelineDeps + contractNameRegistry
- `packages/daemon/src/__tests__/pipeline-notification.test.ts` - 16 new tests

## Decisions Made
- resolveNotificationTo is a pure function that only enriches CONTRACT_CALL type notifications; all other types pass raw address unchanged for backward compatibility
- Fallback (unregistered) addresses return the full raw address (not truncated) -- truncation only happens as part of the "Name (truncated)" format for known contracts
- Removed unused `reqTo` and `apiDirectTo` local variables from stages.ts after migration to resolveNotificationTo

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused variable typecheck errors**
- **Found during:** Task 2 (verification)
- **Issue:** After replacing all `to: reqTo` with `resolveNotificationTo(...)`, the `reqTo` and `apiDirectTo` variables became unused, causing TS6133 errors
- **Fix:** Removed the 3 `reqTo` declarations and 1 `apiDirectTo` declaration
- **Files modified:** packages/daemon/src/pipeline/stages.ts
- **Committed in:** 73693290

**2. [Rule 3 - Blocking] Added contractNameRegistry to AdminActionRouteDeps**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** AdminActionRouteDeps (separate from ActionRouteDeps) was missing contractNameRegistry, causing TS2353
- **Fix:** Added contractNameRegistry to the interface
- **Files modified:** packages/daemon/src/api/routes/admin-actions.ts
- **Committed in:** 73693290

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for typecheck to pass. No scope creep.

## Issues Encountered
- @waiaas/core needed rebuild before tests could import ContractNameRegistry (ESM build artifact not present from Phase 421 changes)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ContractNameRegistry is fully wired and resolving names in notifications
- Phase 423 can now add API response enrichment (contractName/contractNameSource fields) and Admin UI display
- Registry is available as `ctx.contractNameRegistry` in all pipeline paths

---
*Phase: 422-notification-pipeline-integration*
*Completed: 2026-03-15*
