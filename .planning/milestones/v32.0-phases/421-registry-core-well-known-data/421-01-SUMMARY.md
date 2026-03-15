---
phase: 421-registry-core-well-known-data
plan: 01
subsystem: api
tags: [contracts, registry, action-provider, well-known-data]

requires:
  - phase: none
    provides: first plan in milestone
provides:
  - WELL_KNOWN_CONTRACTS static data (305+ entries across 6 networks)
  - WellKnownContractEntry interface
  - ActionProviderMetadataSchema.displayName optional field
  - snakeCaseToDisplayName utility function
  - All 17 Action Providers with explicit displayName
affects: [421-02, 422, 423]

tech-stack:
  added: []
  patterns:
    - "well-known contract data as static readonly array with WellKnownContractEntry interface"
    - "displayName on ActionProviderMetadata for human-readable protocol names"

key-files:
  created:
    - packages/core/src/constants/well-known-contracts.ts
    - packages/core/src/__tests__/well-known-contracts.test.ts
  modified:
    - packages/core/src/interfaces/action-provider.types.ts
    - packages/core/src/interfaces/index.ts
    - packages/core/src/constants/index.ts
    - packages/core/src/index.ts
    - packages/actions/src/providers/*/index.ts (17 provider files)

key-decisions:
  - "305+ well-known entries organized by 6 networks: Ethereum (~100), Base (~40), Arbitrum (~40), Optimism (~30), Polygon (~40), Solana (~55)"
  - "EVM addresses stored lowercase for case-insensitive matching"
  - "Solana network uses 'solana-mainnet' network identifier"
  - "displayName uses brand-accurate names (LI.FI, D'CENT Swap, 0x Swap, ERC-8004 Agent)"

patterns-established:
  - "WellKnownContractEntry: { address, name, protocol, network } for contract identification"
  - "snakeCaseToDisplayName fallback for providers without explicit displayName"

requirements-completed: [WKD-01, WKD-02, WKD-03, WKD-04, WKD-05, APR-01, APR-02, APR-03]

duration: 10min
completed: 2026-03-15
---

# Phase 421 Plan 01: Well-Known Contract Data + ActionProvider displayName Summary

**305+ well-known contract entries across 6 networks with ActionProviderMetadata displayName and snakeCaseToDisplayName utility**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-15T12:52:31Z
- **Completed:** 2026-03-15T13:03:00Z
- **Tasks:** 2
- **Files modified:** 23

## Accomplishments
- Created well-known-contracts.ts with 305+ entries covering Ethereum, Base, Arbitrum, Optimism, Polygon, and Solana mainnet
- Added optional displayName field to ActionProviderMetadataSchema with snakeCaseToDisplayName utility
- Set explicit displayName on all 17 Action Providers with brand-accurate human-readable names
- Comprehensive tests for data integrity, deduplication, and address format validation

## Task Commits

1. **Task 1: Well-Known Contract Data + ActionProviderMetadata displayName** - `c79f5964` (feat)
2. **Task 2: Set displayName on All 17 Action Providers** - `ea5d1de1` (feat)

## Files Created/Modified
- `packages/core/src/constants/well-known-contracts.ts` - Static well-known contract data (305+ entries)
- `packages/core/src/__tests__/well-known-contracts.test.ts` - Data integrity and format tests
- `packages/core/src/interfaces/action-provider.types.ts` - displayName field + snakeCaseToDisplayName
- `packages/core/src/interfaces/index.ts` - Re-export snakeCaseToDisplayName
- `packages/core/src/constants/index.ts` - Re-export well-known contracts
- `packages/core/src/index.ts` - Barrel exports for new symbols
- 17 provider files in `packages/actions/src/providers/` - displayName added

## Decisions Made
- Used brand-accurate displayName values (e.g., "LI.FI" not "Lifi", "D'CENT Swap" not "Dcent Swap")
- Solend V1/V2 consolidated to single entry due to vanity address containing non-base58 characters
- Added extra entries for Ethereum DeFi protocols and cross-chain to exceed 300 threshold

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Solend address containing non-base58 character**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Original Solend V1 address contained 'l' (lowercase L) which is not in base58 alphabet
- **Fix:** Replaced with verified SoLendXonfBJhiaaA9GUL5X2M5f6mxVRBbkiovdGebP, consolidated V1/V2
- **Files modified:** packages/core/src/constants/well-known-contracts.ts
- **Verification:** All Solana address regex tests pass
- **Committed in:** c79f5964

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor data correction for Solana address validity. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WELL_KNOWN_CONTRACTS and snakeCaseToDisplayName exported from @waiaas/core
- All 17 providers have displayName ready for ContractNameRegistry (Plan 02)
- Plan 02 can import and use both data sources immediately

---
*Phase: 421-registry-core-well-known-data*
*Completed: 2026-03-15*
