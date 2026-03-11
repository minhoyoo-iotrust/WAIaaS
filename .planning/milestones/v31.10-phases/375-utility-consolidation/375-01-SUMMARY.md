---
phase: 375-utility-consolidation
plan: 01
subsystem: actions
tags: [refactoring, dedup, bigint, amount-parser, defi-providers]

requires: []
provides:
  - "parseTokenAmount common module at packages/actions/src/common/amount-parser.ts"
  - "7 providers using unified amount parsing via common import"
affects: [375-02, actions-providers]

tech-stack:
  added: []
  patterns:
    - "Common utility extraction: shared helpers in packages/actions/src/common/"

key-files:
  created:
    - packages/actions/src/common/amount-parser.ts
    - packages/actions/src/common/amount-parser.test.ts
  modified:
    - packages/actions/src/providers/aave-v3/index.ts
    - packages/actions/src/providers/kamino/index.ts
    - packages/actions/src/providers/lido-staking/index.ts
    - packages/actions/src/providers/jito-staking/jito-stake-pool.ts
    - packages/actions/src/providers/hyperliquid/perp-provider.ts
    - packages/actions/src/providers/hyperliquid/spot-provider.ts
    - packages/actions/src/providers/hyperliquid/sub-account-provider.ts

key-decisions:
  - "parseTokenAmount requires explicit decimals parameter (no default) to prevent implicit coupling"
  - "ChainError chain parameter set to 'evm' for chain-agnostic usage"
  - "jito-staking parseSolAmount kept as thin sync wrapper for export compatibility"

patterns-established:
  - "Common utility pattern: shared helpers in src/common/ imported by providers"

requirements-completed: [UTIL-01, UTIL-03, UTIL-04]

duration: 8min
completed: 2026-03-11
---

# Phase 375 Plan 01: parseTokenAmount Common Module Summary

**Unified parseTokenAmount(amount, decimals) utility replacing 7 duplicated implementations across aave-v3, kamino, lido, jito, and hyperliquid providers (~140 lines removed)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-11T07:58:29Z
- **Completed:** 2026-03-11T08:06:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Created `packages/actions/src/common/amount-parser.ts` with chain-agnostic parseTokenAmount
- Replaced 7 local implementations (parseTokenAmount, parseEthAmount, parseSolAmount, parseUsdcAmount) with common import
- Added 11 unit tests covering all decimal precisions and edge cases
- Removed ~140 lines of duplicated code

## Task Commits

1. **Task 1: parseTokenAmount common module creation (TDD)** - `5cadefa3` (feat)
2. **Task 2: Replace 7 providers with common import** - `0220ce0e` (refactor)

## Files Created/Modified
- `packages/actions/src/common/amount-parser.ts` - Common parseTokenAmount(amount, decimals) function
- `packages/actions/src/common/amount-parser.test.ts` - 11 unit tests
- `packages/actions/src/providers/aave-v3/index.ts` - Removed local parseTokenAmount, explicit decimals=18
- `packages/actions/src/providers/kamino/index.ts` - Removed local parseTokenAmount, explicit decimals=6
- `packages/actions/src/providers/lido-staking/index.ts` - Removed parseEthAmount, replaced with parseTokenAmount(amount, 18)
- `packages/actions/src/providers/jito-staking/jito-stake-pool.ts` - parseSolAmount now thin wrapper over parseTokenAmount(amount, 9)
- `packages/actions/src/providers/hyperliquid/perp-provider.ts` - Removed parseUsdcAmount + USDC_DECIMALS const
- `packages/actions/src/providers/hyperliquid/spot-provider.ts` - Removed parseUsdcAmount + USDC_DECIMALS const
- `packages/actions/src/providers/hyperliquid/sub-account-provider.ts` - Removed parseUsdcAmount + USDC_DECIMALS const

## Decisions Made
- parseTokenAmount requires explicit decimals (no default value) to make each call site's precision visible
- ChainError chain parameter uses generic 'evm' since the function is chain-agnostic
- jito parseSolAmount kept as thin sync wrapper (was previously async due to lazy import)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed sub-account missing amount edge case**
- **Found during:** Task 2 (provider replacement)
- **Issue:** HyperliquidSubAccountProvider.getSpendingAmount('hl_sub_transfer', {}) previously returned 0n (no validation in parseUsdcAmount), but common parseTokenAmount('0', 6) now throws
- **Fix:** Added guard: if amount is missing or '0', return 0n directly without calling parseTokenAmount
- **Files modified:** packages/actions/src/providers/hyperliquid/sub-account-provider.ts
- **Verification:** sub-account-provider.test.ts "handles missing amount gracefully" passes
- **Committed in:** 0220ce0e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for behavioral compatibility. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Common amount-parser module ready for any future providers
- Plan 375-02 (contract-encoding) is independent and can proceed

---
*Phase: 375-utility-consolidation*
*Completed: 2026-03-11*
