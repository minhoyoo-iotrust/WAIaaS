---
phase: 347-hyperevm-chain
plan: 01
subsystem: infra
tags: [viem, evm, hyperliquid, hyperevm, caip-2, slip-44]

# Dependency graph
requires: []
provides:
  - "HyperEVM Mainnet (Chain ID 999) and Testnet (998) registered in EVM chain registry"
  - "CAIP-2 bidirectional mapping for eip155:999 and eip155:998"
  - "SLIP-44 coin type 999 for HYPE native asset"
  - "ENVIRONMENT_NETWORK_MAP includes HyperEVM for environment derivation"
affects: [phase-348-hyperliquid-dex-design, phase-349-core-infra-perp]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - packages/core/src/enums/chain.ts
    - packages/core/src/caip/network-map.ts
    - packages/core/src/caip/asset-helpers.ts
    - packages/adapters/evm/src/evm-chain-map.ts
    - packages/core/src/__tests__/enums.test.ts
    - packages/core/src/__tests__/caip.test.ts
    - packages/adapters/evm/src/__tests__/evm-chain-map.test.ts

key-decisions:
  - "SLIP-44 coin type 999 (chain ID) used for HYPE since no official SLIP-44 registration exists"
  - "HyperEVM classified as chain:'ethereum' (EVM-compatible L1) in CAIP-2 mapping"

patterns-established: []

requirements-completed: [HCHAIN-01, HCHAIN-02, HCHAIN-03]

# Metrics
duration: 5min
completed: 2026-03-08
---

# Phase 347 Plan 01: HyperEVM Mainnet/Testnet Chain Registration Summary

**HyperEVM (Chain ID 999/998) registered in EVM chain registry with viem chains, CAIP-2 mapping, and SLIP-44 HYPE native asset**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-08T03:14:02Z
- **Completed:** 2026-03-08T03:19:03Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 7

## Accomplishments
- HyperEVM Mainnet (999) and Testnet (998) added to NETWORK_TYPES, EVM_NETWORK_TYPES, and EVM_CHAIN_MAP
- CAIP-2 bidirectional mapping (eip155:999/998) for network resolution
- SLIP-44 coin type 999 for HYPE native asset (eip155:999/slip44:999)
- ENVIRONMENT_NETWORK_MAP and MAINNET_NETWORKS updated for environment derivation
- All existing EVM infrastructure (transfer, token, contract, policy, connect-info) works automatically on HyperEVM

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests** - `af38c5a6` (test)
2. **Task 1 (GREEN): Implementation** - `a214a10f` (feat)

_Note: Task 2 tests were included in TDD RED phase commit_

## Files Created/Modified
- `packages/core/src/enums/chain.ts` - Added hyperevm-mainnet/testnet to NETWORK_TYPES, EVM_NETWORK_TYPES, ENVIRONMENT_NETWORK_MAP, MAINNET_NETWORKS
- `packages/core/src/caip/network-map.ts` - Added CAIP-2 entries for eip155:999 and eip155:998
- `packages/core/src/caip/asset-helpers.ts` - Added SLIP-44 coin type 999 for HYPE
- `packages/adapters/evm/src/evm-chain-map.ts` - Added EVM_CHAIN_MAP entries with viem hyperEvm/hyperliquidEvmTestnet chains
- `packages/core/src/__tests__/enums.test.ts` - Updated counts (15/12), added HyperEVM assertions
- `packages/core/src/__tests__/caip.test.ts` - Added CAIP-2 and nativeAssetId HyperEVM tests
- `packages/adapters/evm/src/__tests__/evm-chain-map.test.ts` - Updated count (12), added HyperEVM entry tests

## Decisions Made
- Used SLIP-44 coin type 999 (same as chain ID) for HYPE since Hyperliquid has no official SLIP-44 registration -- consistent with project convention for non-registered coins
- Classified HyperEVM as chain: 'ethereum' in CAIP-2 mapping since it is EVM-compatible (uses eip155 namespace)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- HyperEVM chain registration complete, Phase 348 (Hyperliquid DEX design) can proceed
- All existing EVM features (wallet creation, ETH/token transfer, contract calls, policies, connect-info) automatically available on HyperEVM

## Self-Check: PASSED

- All 4 source files exist on disk
- All 3 test files exist on disk
- Commit af38c5a6 (test) found
- Commit a214a10f (feat) found
- 191 tests passing across 3 test files
- Full project typecheck (16/16 packages) passing

---
*Phase: 347-hyperevm-chain*
*Completed: 2026-03-08*
