---
phase: 249-0x-swap-provider
plan: 02
subsystem: api
tags: [0x, swap, evm, action-provider, allowance-holder, approve, defi]

# Dependency graph
requires:
  - phase: 249-0x-swap-provider
    provides: ZeroExApiClient, ZeroExSwapConfig, getAllowanceHolderAddress, CHAIN_ID_MAP
  - phase: 248-provider-infrastructure
    provides: IActionProvider interface, ActionApiClient base, SettingsReader, slippage utilities
provides:
  - ZeroExSwapActionProvider implementing IActionProvider with approve+swap multi-step resolution
  - registerBuiltInProviders real factory (replaces null stub)
  - 17 MSW-based unit tests for provider (60 total in @waiaas/actions)
affects: [daemon registration, MCP exposure, admin provider cards]

# Tech tracking
tech-stack:
  added: []
  patterns: [approve+swap multi-step ContractCallRequest array, native ETH vs ERC-20 detection, AllowanceHolder address validation]

key-files:
  created:
    - packages/actions/src/providers/zerox-swap/index.ts
    - packages/actions/src/__tests__/zerox-swap.test.ts
  modified:
    - packages/actions/src/index.ts

key-decisions:
  - "encodeApproveCalldata uses manual ABI encoding (selector + padded args) to avoid viem dependency"
  - "Same-token detection is case-insensitive (toLowerCase comparison) for EVM address flexibility"
  - "chainId resolved from explicit input > CHAIN_ID_MAP > default 1, since ActionContext lacks network field"

patterns-established:
  - "EVM multi-step swap pattern: ERC-20 sell returns [approve, swap], native ETH returns [swap]"
  - "AllowanceHolder address validated from quote response before building requests"

requirements-completed: [ZXSW-04, ZXSW-05, ZXSW-06, ZXSW-07]

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 249 Plan 02: 0x Swap Provider Summary

**ZeroExSwapActionProvider with approve+swap multi-step resolution, ERC-20 vs native ETH detection, and 17 MSW-based unit tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T14:35:47Z
- **Completed:** 2026-02-23T14:38:42Z
- **Tasks:** 2
- **Files created:** 2, modified: 1

## Accomplishments
- ZeroExSwapActionProvider resolves ERC-20 sells to [approve, swap] ContractCallRequest array and native ETH to [swap] single-element array
- Slippage defaults to 100bps (1%) and clamps at 500bps (5%) via clampSlippageBps utility
- AllowanceHolder address validated from quote response, liquidity check throws clear error
- registerBuiltInProviders factory creates real ZeroExSwapActionProvider from SettingsReader config
- 17 tests covering ZXSW-04/05/06/07, SAFE-05, AllowanceHolder mismatch, and error cases
- Full @waiaas/actions test suite: 60 tests passing (17 zerox-swap + 19 zerox-api-client + 11 slippage + 13 jupiter-swap)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement ZeroExSwapActionProvider + wire into registerBuiltInProviders** - `b3dd141d` (feat)
2. **Task 2: ZeroExSwapActionProvider comprehensive TDD tests** - `e00d2fce` (test)

## Files Created/Modified
- `packages/actions/src/providers/zerox-swap/index.ts` - ZeroExSwapActionProvider with resolve() returning ContractCallRequest[], encodeApproveCalldata, SwapInputSchema
- `packages/actions/src/index.ts` - Updated registerBuiltInProviders with real ZeroExSwapActionProvider factory, added re-exports
- `packages/actions/src/__tests__/zerox-swap.test.ts` - 17 MSW-based tests covering ERC-20/ETH paths, slippage, liquidity, errors

## Decisions Made
- Manual ABI encoding for ERC-20 approve calldata (selector 0x095ea7b3 + padded spender + amount) to avoid adding viem dependency to @waiaas/actions
- Same-token detection uses case-insensitive comparison (toLowerCase) for EVM address flexibility
- chainId resolution: explicit input param > CHAIN_ID_MAP lookup > default 1 (Ethereum mainnet), since ActionContext lacks network field

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ZeroExSwapActionProvider fully functional with 60 total tests across all @waiaas/actions test files
- Phase 249 (0x Swap Provider) complete -- both Plan 01 (API client) and Plan 02 (provider) delivered
- Ready for daemon integration testing and end-to-end swap flows

## Self-Check: PASSED

All created/modified files verified on disk. Both commit hashes (b3dd141d, e00d2fce) verified in git log.

---
*Phase: 249-0x-swap-provider*
*Completed: 2026-02-23*
