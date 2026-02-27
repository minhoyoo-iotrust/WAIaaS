---
phase: 276-aave-v3-provider-implementation
plan: 01
subsystem: defi
tags: [aave, evm, lending, abi-encoding, zod]

requires:
  - phase: 274-ssot-enums-db-interfaces
    provides: ILendingProvider/IPositionProvider interfaces, ChainError
provides:
  - Manual hex ABI encoding for 7 Aave V3 functions
  - 5-chain contract address registry (Pool/DataProvider/Oracle)
  - Zod input schemas for supply/borrow/repay/withdraw
affects: [276-03-provider, 277-api-integration]

tech-stack:
  added: []
  patterns: [manual-hex-abi-encoding, multi-chain-address-map]

key-files:
  created:
    - packages/actions/src/providers/aave-v3/aave-contracts.ts
    - packages/actions/src/providers/aave-v3/config.ts
    - packages/actions/src/providers/aave-v3/schemas.ts
    - packages/actions/src/__tests__/aave-v3-contracts.test.ts
  modified: []

key-decisions:
  - "Followed Lido pattern for manual hex encoding (padHex/addressToHex/uint256ToHex utilities)"
  - "uint16 referralCode encoded as full 32-byte word per ABI spec"
  - "AaveV3Config kept minimal (enabled only) -- address selection by network key lookup"

requirements-completed: [AAVE-05, AAVE-06, AAVE-10]

duration: 8min
completed: 2026-02-27
---

# Phase 276 Plan 01: Aave V3 ABI Encoding + Config + Schemas Summary

**Manual hex ABI encoding for 7 Aave V3 functions (4 Pool write + approve + 2 read), 5-chain address registry, and Zod input schemas with 'max' support**

## Performance

- **Duration:** 8 min
- **Tasks:** 2
- **Files created:** 4

## Accomplishments
- 7 encoding functions exported (supply/borrow/repay/withdraw/approve/getUserAccountData/getReserveData)
- AAVE_SELECTORS constant with verified function selectors
- 5-chain address map with Ethereum/Arbitrum/Optimism/Polygon/Base Pool/DataProvider/Oracle addresses
- 4 Zod schemas with 'max' literal support on repay/withdraw
- 52 unit tests all passing

## Task Commits

1. **Task 1+2: ABI encoding + config + schemas + tests** - `ba394747` (feat)

## Files Created/Modified
- `packages/actions/src/providers/aave-v3/aave-contracts.ts` - Manual hex ABI encoding for 7 functions + AAVE_SELECTORS + MAX_UINT256
- `packages/actions/src/providers/aave-v3/config.ts` - AaveV3Config, AAVE_V3_ADDRESSES (5 chains), getAaveAddresses helper
- `packages/actions/src/providers/aave-v3/schemas.ts` - Zod SSoT input schemas for 4 lending actions
- `packages/actions/src/__tests__/aave-v3-contracts.test.ts` - 52 unit tests

## Decisions Made
- Followed Lido pattern for manual hex encoding (no viem ABI dependency)
- AaveV3Config kept simple with just `enabled` boolean -- address selection via network key lookup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Next Phase Readiness
- Ready for Plan 276-02 (RPC decoders) and Plan 276-03 (Provider class)
- All encoding functions and schemas available for import

---
*Phase: 276-aave-v3-provider-implementation*
*Completed: 2026-02-27*
