---
phase: 82-config-networktype-evm-deps
plan: 03
subsystem: api
tags: [zod, agent, network, validation, chain-network, openapi]

# Dependency graph
requires:
  - phase: 82-01
    provides: NetworkType 13 values, validateChainNetwork, EVM/Solana subsets
  - phase: 82-02
    provides: evm_default_network config field in DaemonConfigSchema
provides:
  - CreateAgentRequestSchema with optional network (service-layer defaults)
  - POST /agents chain-based default network resolution (solana->devnet, ethereum->evm_default_network)
  - POST /agents validateChainNetwork integration rejecting invalid combos with 400
  - 7 integration tests for chain-network validation paths
affects:
  - 83 (DB schema migration may reference new network values)
  - 84 (AdapterPool uses agent network for adapter lookup)
  - 85 (route schemas with NetworkType 13 values)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service-layer network default: schema optional, route resolves from chain + config"
    - "validateChainNetwork -> ACTION_VALIDATION_FAILED in route handler"

key-files:
  created: []
  modified:
    - packages/core/src/schemas/agent.schema.ts
    - packages/core/src/__tests__/schemas.test.ts
    - packages/daemon/src/api/routes/agents.ts
    - packages/daemon/src/__tests__/api-agents.test.ts

key-decisions:
  - "CreateAgentRequestSchema.network is optional (not default), service layer resolves"
  - "Used ACTION_VALIDATION_FAILED (not VALIDATION_ERROR) since that is the existing error code"
  - "EVM default network reads from config.rpc.evm_default_network (typed access)"

patterns-established:
  - "Optional schema field + service-layer default: keep schema flexible, apply chain-specific defaults in route"
  - "Cross-validation pattern: validateChainNetwork before keyStore/DB operations"

# Metrics
duration: 5min
completed: 2026-02-12
---

# Phase 82 Plan 03: Agent Schema Network Optional + Chain-Network Validation Summary

**CreateAgentRequestSchema.network made optional with chain-based service-layer defaults and validateChainNetwork integration in POST /agents**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-12T07:46:25Z
- **Completed:** 2026-02-12T07:51:11Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Made CreateAgentRequestSchema.network optional (was `.default('devnet')`)
- POST /agents resolves default network: solana->devnet, ethereum->config.rpc.evm_default_network
- validateChainNetwork rejects invalid combos (ethereum+devnet, solana+ethereum-sepolia) with 400
- 7 new integration tests covering all chain-network validation paths

## Task Commits

Each task was committed atomically:

1. **Task 1: CreateAgentRequestSchema network optional + route validation** - `9eb2bc6` (feat)
2. **Task 2: Agent creation chain-network validation integration tests** - `3ee9bfc` (test)

## Files Created/Modified
- `packages/core/src/schemas/agent.schema.ts` - network changed from `.default('devnet')` to `.optional()`
- `packages/core/src/__tests__/schemas.test.ts` - Updated tests for optional network, added EVM network test
- `packages/daemon/src/api/routes/agents.ts` - Added validateChainNetwork + chain-based default resolution
- `packages/daemon/src/__tests__/api-agents.test.ts` - 7 new chain-network validation integration tests

## Decisions Made
- **ACTION_VALIDATION_FAILED over VALIDATION_ERROR:** Plan referenced `VALIDATION_ERROR` but this error code does not exist in ERROR_CODES. Used the established `ACTION_VALIDATION_FAILED` (httpStatus 400) instead.
- **Typed config access:** Used `deps.config.rpc.evm_default_network` directly (typed from DaemonConfigSchema) instead of dynamic property access.
- **No EVM tests skipped:** The mock keyStore in tests does not check chain type, so EVM agent creation tests work without keyStore mock changes. All 7 tests run (not skipped).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used ACTION_VALIDATION_FAILED instead of non-existent VALIDATION_ERROR**
- **Found during:** Task 1 (route validation integration)
- **Issue:** Plan specified `WAIaaSError('VALIDATION_ERROR')` but `VALIDATION_ERROR` does not exist in ERROR_CODES
- **Fix:** Used `ACTION_VALIDATION_FAILED` which is the established validation error code (httpStatus 400)
- **Files modified:** packages/daemon/src/api/routes/agents.ts
- **Verification:** Tests confirm 400 responses with code `ACTION_VALIDATION_FAILED`
- **Committed in:** 9eb2bc6 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Correct error code used; no scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Agent creation fully validates chain+network combinations
- EVM agents get default network from config.rpc.evm_default_network
- All existing tests pass (137 core + 120 evm-adapter + 24 daemon-agent = 281 total)
- Ready for Phase 83 (DB schema migration for EVM networks)

## Self-Check: PASSED

---
*Phase: 82-config-networktype-evm-deps*
*Completed: 2026-02-12*
