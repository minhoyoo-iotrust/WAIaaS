---
phase: 82-config-networktype-evm-deps
plan: 02
subsystem: infra
tags: [zod, config, rpc, evm, drpc, nativeSymbol, adapter]

# Dependency graph
requires:
  - phase: 82-config-networktype-evm-deps
    plan: 01
    provides: EvmNetworkTypeEnum, EVM_NETWORK_TYPES, EVM_CHAIN_MAP
provides:
  - DaemonConfigSchema with 16 RPC keys (5 Solana + 10 EVM + evm_default_network)
  - EvmAdapter nativeSymbol/nativeName constructor params for chain-specific native tokens
affects:
  - 83 (DB schema migration uses new NetworkType values)
  - 84 (AdapterPool uses evm_default_network and RPC URL lookup from config)
  - 85 (route schemas reference NetworkType enum)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "EVM RPC keys use evm_{chain}_{net} naming convention with drpc.org public defaults"
    - "EvmAdapter nativeSymbol/nativeName parameterized via constructor (default ETH/Ether)"

key-files:
  created: []
  modified:
    - packages/daemon/src/infrastructure/config/loader.ts
    - packages/daemon/src/__tests__/config-loader.test.ts
    - packages/adapters/evm/src/adapter.ts
    - packages/adapters/evm/src/__tests__/evm-adapter.test.ts
    - packages/daemon/src/__tests__/api-transactions.test.ts
    - packages/daemon/src/__tests__/api-agents.test.ts
    - packages/daemon/src/__tests__/api-policies.test.ts
    - packages/daemon/src/__tests__/api-new-endpoints.test.ts
    - packages/daemon/src/__tests__/admin-serving.test.ts
    - packages/daemon/src/__tests__/api-admin-endpoints.test.ts
    - packages/daemon/src/__tests__/admin-notification-api.test.ts
    - packages/daemon/src/__tests__/api-hint-field.test.ts

key-decisions:
  - "EVM RPC defaults use drpc.org public endpoints (non-empty defaults replacing old empty strings)"
  - "evm_default_network validated by EvmNetworkTypeEnum from @waiaas/core"
  - "EvmAdapter nativeName default = 'Ether' (token name) not 'Ethereum' (blockchain name)"

patterns-established:
  - "RPC config key naming: evm_{chain}_{net} (underscore) maps to NetworkType {chain}-{net} (hyphen)"
  - "Chain-specific native token via adapter constructor params, not hardcoded"

# Metrics
duration: 4min
completed: 2026-02-12
---

# Phase 82 Plan 02: EVM RPC Config + EvmAdapter nativeSymbol Summary

**DaemonConfigSchema extended to 16 RPC keys (10 EVM drpc.org defaults + evm_default_network) with EvmAdapter nativeSymbol/nativeName constructor parameterization**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-12T07:46:11Z
- **Completed:** 2026-02-12T07:50:23Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Replaced old ethereum_mainnet/ethereum_sepolia (empty defaults) with 10 evm_* RPC keys using drpc.org public endpoints
- Added evm_default_network with EvmNetworkTypeEnum validation (defaults to 'ethereum-sepolia')
- Made EvmAdapter return chain-specific native token symbols (e.g., POL on Polygon instead of ETH)
- Updated 7 daemon test files with new RPC config shape, added 11 new tests (8 config + 3 adapter)
- All 1213 tests pass across 80 test files -- zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: DaemonConfigSchema EVM RPC keys + evm_default_network + tests** - `5b3362c` (feat)
2. **Task 2: EvmAdapter nativeSymbol/nativeName constructor params + tests** - `c209ec4` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/config/loader.ts` - DaemonConfigSchema rpc section: 16 keys with drpc.org defaults + EvmNetworkTypeEnum import
- `packages/daemon/src/__tests__/config-loader.test.ts` - 8 new EVM RPC tests (defaults, validation, env override, old key removal)
- `packages/adapters/evm/src/adapter.ts` - nativeSymbol/nativeName constructor params, getBalance/getAssets use them
- `packages/adapters/evm/src/__tests__/evm-adapter.test.ts` - 3 new nativeSymbol tests (default ETH, custom POL, getAssets custom)
- `packages/daemon/src/__tests__/api-transactions.test.ts` - Mock config updated to new rpc shape
- `packages/daemon/src/__tests__/api-agents.test.ts` - Mock config updated to new rpc shape
- `packages/daemon/src/__tests__/api-policies.test.ts` - Mock config updated to new rpc shape
- `packages/daemon/src/__tests__/api-new-endpoints.test.ts` - Mock config updated to new rpc shape
- `packages/daemon/src/__tests__/admin-serving.test.ts` - Mock config updated to new rpc shape
- `packages/daemon/src/__tests__/api-admin-endpoints.test.ts` - Mock config updated to new rpc shape
- `packages/daemon/src/__tests__/admin-notification-api.test.ts` - Mock config updated to new rpc shape
- `packages/daemon/src/__tests__/api-hint-field.test.ts` - Mock config updated to new rpc shape

## Decisions Made
- EVM RPC defaults use drpc.org public endpoints (non-empty defaults) -- previous ethereum_* keys had empty string defaults which was a design gap
- evm_default_network validated by EvmNetworkTypeEnum reusing the Zod enum from @waiaas/core
- EvmAdapter nativeName default changed from 'Ethereum' to 'Ether' -- 'Ether' is the token name, 'Ethereum' is the blockchain name

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated 7 daemon test files with new rpc config shape**
- **Found during:** Task 1
- **Issue:** After removing ethereum_mainnet/ethereum_sepolia from DaemonConfigSchema, all daemon test files with hardcoded mock config objects would fail TypeScript compilation due to missing/extra properties
- **Fix:** Updated rpc mock objects in 7 test files (api-transactions, api-agents, api-policies, api-new-endpoints, admin-serving, api-admin-endpoints, admin-notification-api, api-hint-field) to match new 16-key schema
- **Files modified:** 7 daemon test files
- **Verification:** All 1213 tests pass
- **Committed in:** 5b3362c (Task 1 commit)

**2. [Rule 1 - Bug] Fixed existing getAssets test expecting 'Ethereum' instead of 'Ether'**
- **Found during:** Task 2
- **Issue:** Existing test asserted `native.name === 'Ethereum'` but the correct default nativeName is 'Ether' (the token name, not the blockchain)
- **Fix:** Updated test expectation from 'Ethereum' to 'Ether'
- **Files modified:** packages/adapters/evm/src/__tests__/evm-adapter.test.ts
- **Verification:** All 120 adapter-evm tests pass
- **Committed in:** c209ec4 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Config schema ready for AdapterPool to look up RPC URLs by `evm_{network}` pattern (Phase 84)
- evm_default_network ready for agent creation route default (Phase 85)
- EvmAdapter nativeSymbol/nativeName ready for AdapterPool to pass from EVM_CHAIN_MAP entries (Phase 84)
- All 1213 existing tests pass

## Self-Check: PASSED

---
*Phase: 82-config-networktype-evm-deps*
*Completed: 2026-02-12*
