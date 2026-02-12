---
phase: 82-config-networktype-evm-deps
plan: 01
subsystem: infra
tags: [zod, viem, evm, networktype, chain-map, enum, validation]

# Dependency graph
requires:
  - phase: 77-evm-adapter-scaffold
    provides: EvmAdapter scaffolding, viem 2.x dependency
provides:
  - NETWORK_TYPES extended to 13 values (3 Solana + 10 EVM)
  - EVM_NETWORK_TYPES (10) and SOLANA_NETWORK_TYPES (3) subsets with Zod enums
  - validateChainNetwork cross-validation function
  - EVM_CHAIN_MAP with 10 network-to-viem Chain mappings
  - EvmChainEntry type with viemChain + chainId + nativeSymbol + nativeName
affects:
  - 82-02 (config.toml EVM section)
  - 83 (DB schema migration for EVM networks)
  - 84 (AdapterPool using EVM_CHAIN_MAP)
  - 85 (route schemas with NetworkType 13 values)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NetworkType SSoT: NETWORK_TYPES (13) -> subsets (SOLANA_NETWORK_TYPES, EVM_NETWORK_TYPES)"
    - "validateChainNetwork: plain Error (not WAIaaSError) to avoid circular deps in @waiaas/core"
    - "EVM_CHAIN_MAP: Record<EvmNetworkType, EvmChainEntry> typed mapping"

key-files:
  created:
    - packages/adapters/evm/src/evm-chain-map.ts
    - packages/adapters/evm/src/__tests__/evm-chain-map.test.ts
  modified:
    - packages/core/src/enums/chain.ts
    - packages/core/src/enums/index.ts
    - packages/core/src/index.ts
    - packages/core/src/__tests__/enums.test.ts
    - packages/adapters/evm/src/index.ts

key-decisions:
  - "Polygon nativeSymbol = 'POL' (post MATIC-to-POL rebrand)"
  - "validateChainNetwork throws plain Error, not WAIaaSError, to keep @waiaas/core free of circular deps"
  - "EVM_CHAIN_MAP typed as Record<EvmNetworkType, EvmChainEntry> for compile-time completeness"

patterns-established:
  - "Chain subset pattern: SOLANA_NETWORK_TYPES + EVM_NETWORK_TYPES subset of NETWORK_TYPES"
  - "Cross-chain validation: validateChainNetwork(chain, network) before agent creation"

# Metrics
duration: 4min
completed: 2026-02-12
---

# Phase 82 Plan 01: NetworkType + EVM Chain Map Summary

**NetworkType SSoT extended to 13 values (3 Solana + 10 EVM) with validateChainNetwork cross-validation and EVM_CHAIN_MAP 10-network viem mapping table**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-12T07:39:08Z
- **Completed:** 2026-02-12T07:43:16Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Extended NETWORK_TYPES from 3 to 13 values with EVM and Solana subsets
- Implemented validateChainNetwork() for chain+network cross-validation
- Created EVM_CHAIN_MAP mapping 10 EVM networks to viem Chain + chainId + nativeSymbol + nativeName
- TDD: 70 new tests (8 enum/validation + 62 chain map)

## Task Commits

Each task was committed atomically:

1. **Task 1: NetworkType enum extension + validateChainNetwork TDD** - `d966065` (feat)
2. **Task 2: EVM_CHAIN_MAP mapping table TDD** - `2262ad4` (feat)

_Note: TDD tasks each include RED (failing tests) and GREEN (implementation) in single commit._

## Files Created/Modified
- `packages/core/src/enums/chain.ts` - Extended NETWORK_TYPES to 13, added EVM/Solana subsets, validateChainNetwork
- `packages/core/src/enums/index.ts` - Re-exported new symbols
- `packages/core/src/index.ts` - Re-exported new symbols at package level
- `packages/core/src/__tests__/enums.test.ts` - 8 new tests for enum counts, subsets, validation
- `packages/adapters/evm/src/evm-chain-map.ts` - EVM_CHAIN_MAP constant + EvmChainEntry type
- `packages/adapters/evm/src/index.ts` - Re-exported EVM_CHAIN_MAP
- `packages/adapters/evm/src/__tests__/evm-chain-map.test.ts` - 62 tests for completeness and correctness

## Decisions Made
- Polygon nativeSymbol = 'POL' (not 'MATIC') reflecting the post-rebrand token name
- validateChainNetwork throws plain Error (not WAIaaSError) to keep @waiaas/core free of circular deps; caller converts to WAIaaSError
- EVM_CHAIN_MAP typed as Record<EvmNetworkType, EvmChainEntry> ensuring compile-time completeness check

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Core package rebuild required for workspace dependency resolution**
- **Found during:** Task 2 (EVM_CHAIN_MAP tests)
- **Issue:** adapter-evm tests importing EVM_NETWORK_TYPES from @waiaas/core failed because the workspace dependency used the pre-build dist/ output
- **Fix:** Ran `tsc` build in core package to emit updated dist/ with new exports
- **Files modified:** packages/core/dist/ (build output)
- **Verification:** All 62 evm-chain-map tests pass after rebuild
- **Committed in:** Part of normal build process, no extra commit needed

**2. [Rule 3 - Blocking] Main index.ts missing new exports**
- **Found during:** Task 1 (enums.test.ts imports from ../index.js)
- **Issue:** Test imports from `packages/core/src/index.ts` which did not re-export the new EVM/Solana symbols despite enums/index.ts having them
- **Fix:** Added EVM_NETWORK_TYPES, EvmNetworkType, EvmNetworkTypeEnum, SOLANA_NETWORK_TYPES, SolanaNetworkType, validateChainNetwork to src/index.ts
- **Files modified:** packages/core/src/index.ts
- **Verification:** All 26 enum tests pass
- **Committed in:** d966065 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for correct module resolution. No scope creep.

## Issues Encountered
None beyond the blocking issues documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- NetworkType SSoT ready for DB schema migration (Phase 83)
- EVM_CHAIN_MAP ready for AdapterPool lazy init (Phase 84)
- validateChainNetwork ready for route schema integration (Phase 85)
- All existing tests pass (134 core + 117 adapter-evm = 251 total)

## Self-Check: PASSED

---
*Phase: 82-config-networktype-evm-deps*
*Completed: 2026-02-12*
