---
phase: 375-utility-consolidation
plan: 02
subsystem: actions
tags: [refactoring, dedup, abi-encoding, contract-encoding, evm]

requires: []
provides:
  - "padHex/addressToHex/uint256ToHex/encodeApproveCalldata common module at packages/actions/src/common/contract-encoding.ts"
  - "4 providers using unified contract encoding via common import"
affects: [actions-providers]

tech-stack:
  added: []
  patterns:
    - "Common EVM ABI encoding: shared helpers in packages/actions/src/common/contract-encoding.ts"

key-files:
  created:
    - packages/actions/src/common/contract-encoding.ts
    - packages/actions/src/common/contract-encoding.test.ts
  modified:
    - packages/actions/src/providers/aave-v3/aave-contracts.ts
    - packages/actions/src/providers/lido-staking/lido-contract.ts
    - packages/actions/src/providers/zerox-swap/index.ts
    - packages/actions/src/providers/dcent-swap/dex-swap.ts

key-decisions:
  - "encodeApproveCalldata uses bigint amount signature (zerox/dcent callers wrap with BigInt())"
  - "aave-contracts.ts and lido-contract.ts re-export encodeApproveCalldata for backward compatibility"

patterns-established:
  - "Re-export pattern: provider-specific contract files re-export common utilities for their consumers"

requirements-completed: [UTIL-02, UTIL-03, UTIL-04]

duration: 7min
completed: 2026-03-11
---

# Phase 375 Plan 02: contract-encoding Common Module Summary

**Unified padHex/addressToHex/uint256ToHex/encodeApproveCalldata utility replacing 4 duplicated implementations across aave-v3, lido, zerox-swap, and dcent-swap providers (~120 lines removed)**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-11T08:06:00Z
- **Completed:** 2026-03-11T08:13:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created `packages/actions/src/common/contract-encoding.ts` with 4 pure encoding functions
- Replaced 4 local implementations with common import
- Added 12 unit tests covering padding, address encoding, uint256 encoding, and approve calldata
- Removed ~120 lines of duplicated code
- Standardized encodeApproveCalldata to bigint amount signature

## Task Commits

1. **Task 1: contract-encoding common module creation (TDD)** - `024ebb59` (feat)
2. **Task 2: Replace 4 providers with common import** - `e76c4a1a` (refactor)

## Files Created/Modified
- `packages/actions/src/common/contract-encoding.ts` - Common EVM ABI encoding functions
- `packages/actions/src/common/contract-encoding.test.ts` - 12 unit tests
- `packages/actions/src/providers/aave-v3/aave-contracts.ts` - Imports from common, re-exports encodeApproveCalldata
- `packages/actions/src/providers/lido-staking/lido-contract.ts` - Imports from common, re-exports encodeApproveCalldata
- `packages/actions/src/providers/zerox-swap/index.ts` - Imports from common, BigInt() wrapper on call site
- `packages/actions/src/providers/dcent-swap/dex-swap.ts` - Imports from common, BigInt() wrapper on call site

## Decisions Made
- Standardized on bigint amount signature (Variant A pattern) since it's type-safer; Variant B callers (zerox/dcent) add BigInt() at call site
- Re-export pattern used for aave-contracts.ts and lido-contract.ts to avoid cascading import changes in their consumers

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Common contract-encoding module ready for any future EVM providers
- Phase 375 (utility consolidation) complete with both plans done

---
*Phase: 375-utility-consolidation*
*Completed: 2026-03-11*
