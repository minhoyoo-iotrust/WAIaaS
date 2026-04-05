---
phase: 248-provider-infrastructure
plan: 02
subsystem: infra
tags: [action-provider, pipeline, provider-trust, contract-whitelist, sequential-execution]

# Dependency graph
requires:
  - phase: 248-provider-infrastructure
    provides: "ActionProviderRegistry, SettingsService with actions category, SettingsReader interface"
provides:
  - "IActionProvider.resolve() returning ContractCallRequest | ContractCallRequest[]"
  - "ActionProviderRegistry.executeResolve() returning ContractCallRequest[] with auto-tagged actionProvider"
  - "Sequential pipeline execution for multi-step actions (approve + swap)"
  - "Provider-trust CONTRACT_WHITELIST bypass via SettingsService"
  - "actionProvider field on ContractCallRequestSchema"
affects: [249-zerrox-provider, 250-admin-defi]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Sequential pipeline execution for array-returning resolve()", "Provider-trust policy bypass via SettingsService enable flag"]

key-files:
  created: []
  modified:
    - packages/core/src/schemas/transaction.schema.ts
    - packages/core/src/interfaces/action-provider.types.ts
    - packages/core/src/__tests__/schemas.test.ts
    - packages/daemon/src/infrastructure/action/action-provider-registry.ts
    - packages/daemon/src/api/routes/actions.ts
    - packages/daemon/src/pipeline/database-policy-engine.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/__tests__/action-provider-registry.test.ts
    - packages/daemon/src/__tests__/api-actions.test.ts
    - packages/daemon/src/__tests__/database-policy-engine.test.ts
    - packages/daemon/src/__tests__/config-loader.test.ts

key-decisions:
  - "executeResolve() always returns array -- single results wrapped, callers always iterate"
  - "actionProvider field auto-tagged by registry after Zod validation -- providers cannot spoof"
  - "Multi-element response uses { id, status, pipeline: [{id, status}...] } for backward compat"
  - "Provider-trust checks SettingsService 'actions.{name}_enabled' at policy evaluation time (not registration)"

patterns-established:
  - "Sequential pipeline pattern: each ContractCallRequest in array gets separate PipelineContext and txId"
  - "Provider-trust bypass: actionProvider tag on transaction -> SettingsService enabled check -> skip CONTRACT_WHITELIST"

requirements-completed: [PINF-06, PINF-07, PINF-08]

# Metrics
duration: 22min
completed: 2026-02-23
---

# Phase 248 Plan 02: Multi-step Pipeline + Provider-trust Summary

**Sequential pipeline execution for ContractCallRequest arrays with auto-tagged actionProvider and SettingsService-based CONTRACT_WHITELIST bypass**

## Performance

- **Duration:** 22 min
- **Started:** 2026-02-23T13:44:41Z
- **Completed:** 2026-02-23T14:06:37Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Extended resolve() return type to support arrays for multi-step operations (approve + swap)
- Implemented sequential pipeline execution -- each ContractCallRequest gets its own PipelineContext and txId
- Added provider-trust logic: CONTRACT_WHITELIST bypassed when actionProvider is set and enabled in SettingsService
- Auto-tagging ensures only registry-validated providers get the trust bypass (cannot be spoofed via API)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend ContractCallRequest schema + IActionProvider.resolve() return type + registry array support** - `df358764` (feat)
2. **Task 2: Sequential pipeline execution + provider-trust CONTRACT_WHITELIST bypass** - `f61f958c` (feat)

## Files Created/Modified
- `packages/core/src/schemas/transaction.schema.ts` - Added optional actionProvider field to ContractCallRequestSchema
- `packages/core/src/interfaces/action-provider.types.ts` - Changed resolve() return type to ContractCallRequest | ContractCallRequest[]
- `packages/core/src/__tests__/schemas.test.ts` - 2 new tests for actionProvider field (present/absent)
- `packages/daemon/src/infrastructure/action/action-provider-registry.ts` - executeResolve() returns array with auto-tagging
- `packages/daemon/src/api/routes/actions.ts` - Sequential pipeline loop, backward-compatible response shape
- `packages/daemon/src/pipeline/database-policy-engine.ts` - Provider-trust check in evaluateContractWhitelist + actionProvider on TransactionParam
- `packages/daemon/src/pipeline/stages.ts` - actionProvider on TransactionParam + passthrough in buildTransactionParam
- `packages/daemon/src/__tests__/action-provider-registry.test.ts` - 3 new tests (array wrap, multi-tag, invalid array)
- `packages/daemon/src/__tests__/api-actions.test.ts` - 2 new tests (single/multi-element response) + multi-step provider
- `packages/daemon/src/__tests__/database-policy-engine.test.ts` - 3 PTRUST tests for provider-trust bypass
- `packages/daemon/src/__tests__/config-loader.test.ts` - Fixed pre-existing assertion (8 -> 13 actions keys)

## Decisions Made
- executeResolve() always returns ContractCallRequest[] -- callers always iterate. Simplifies interface vs optional array.
- actionProvider field is auto-tagged by registry AFTER Zod validation. Providers cannot set it themselves (registry overwrites).
- Multi-element response adds `pipeline` array field while keeping `id` as last txId for backward compatibility.
- Provider-trust check happens at policy evaluation time (not registration) -- disabling a provider in Admin Settings immediately re-enables CONTRACT_WHITELIST enforcement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed existing registry test expecting single return value**
- **Found during:** Task 1
- **Issue:** Test (l) `executeResolve calls resolve() and validates return` asserted `result.type` but executeResolve now returns array
- **Fix:** Updated assertion to check `results[0].type` and `results[0].actionProvider`
- **Files modified:** packages/daemon/src/__tests__/action-provider-registry.test.ts
- **Verification:** 24 registry tests pass
- **Committed in:** df358764 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed api-actions test expecting 2 providers but 3 registered**
- **Found during:** Task 2
- **Issue:** Adding multi_step_provider to beforeEach broke `should return registered providers` test (expected 2, got 3)
- **Fix:** Updated assertion from `toHaveLength(2)` to `toHaveLength(3)`
- **Files modified:** packages/daemon/src/__tests__/api-actions.test.ts
- **Committed in:** f61f958c (Task 2 commit)

**3. [Rule 3 - Blocking] Fixed pre-existing config-loader assertion for actions key count**
- **Found during:** Task 2 verification
- **Issue:** config-loader.test.ts asserted 8 actions keys but 248-01 added 5 0x keys (now 13)
- **Fix:** Updated assertion from `toHaveLength(8)` to `toHaveLength(13)`
- **Files modified:** packages/daemon/src/__tests__/config-loader.test.ts
- **Committed in:** f61f958c (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bug, 1 blocking)
**Impact on plan:** All test assertion updates required by interface changes. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ContractCallRequest[] pipeline ready for 0x swap (approve + swap two-step)
- Provider-trust bypass ready for zerox_swap provider (Plan 249)
- actionProvider tagging flows through policy engine for audit trail
- Admin Settings integration ready (actions.{name}_enabled toggle)

---
*Phase: 248-provider-infrastructure*
*Completed: 2026-02-23*
