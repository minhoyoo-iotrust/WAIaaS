---
phase: 254-lido-evm-staking-provider
plan: 01
subsystem: defi
tags: [lido, steth, liquid-staking, evm, abi-encoding, action-provider]

# Dependency graph
requires:
  - phase: v1.5
    provides: IActionProvider framework, ActionProviderRegistry, ContractCallRequest
  - phase: 248-250 (v28.2)
    provides: resolve() array sequential pipeline, provider-trust policy bypass
provides:
  - LidoStakingActionProvider with stake/unstake actions
  - Lido ABI encoding helpers (submit, requestWithdrawals, approve)
  - Mainnet + Holesky testnet address config
affects: [254-02, daemon-provider-registration, admin-settings-actions, mcp-tool-exposure]

# Tech tracking
tech-stack:
  added: []
  patterns: [manual-abi-encoding, parseEthAmount-decimal-bigint]

key-files:
  created:
    - packages/actions/src/providers/lido-staking/index.ts
    - packages/actions/src/providers/lido-staking/config.ts
    - packages/actions/src/providers/lido-staking/lido-contract.ts
    - packages/actions/src/__tests__/lido-staking.test.ts
  modified: []

key-decisions:
  - "Manual ABI encoding for Lido contracts (no viem at provider level) following zerox-swap pattern"
  - "parseEthAmount decimal-to-wei conversion via string split for precise BigInt arithmetic"

patterns-established:
  - "Lido provider follows same IActionProvider pattern as zerox-swap and lifi"
  - "ABI encoding uses hardcoded function selectors with padded hex encoding"

requirements-completed: [LIDO-01, LIDO-02, LIDO-03, LIDO-04]

# Metrics
duration: 2min
completed: 2026-02-24
---

# Phase 254 Plan 01: Lido EVM Staking Provider Summary

**LidoStakingActionProvider with ETH->stETH stake (submit) and stETH->ETH unstake (approve+requestWithdrawals) via manual ABI encoding**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-24T10:03:28Z
- **Completed:** 2026-02-24T10:05:58Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- LidoStakingActionProvider implementing IActionProvider with stake/unstake actions
- Manual ABI encoding helpers for submit(), requestWithdrawals(), approve() with no viem dependency
- Config with mainnet + Holesky testnet address maps and getLidoAddresses() environment helper
- 10 unit tests covering stake, unstake, decimal amounts, error handling, and metadata

## Task Commits

Each task was committed atomically:

1. **Task 1: Lido ABI encoding helpers + config** - `1701463d` (feat)
2. **Task 2: LidoStakingActionProvider implementation + unit tests** - `a4c000ac` (feat)

## Files Created/Modified
- `packages/actions/src/providers/lido-staking/config.ts` - LidoStakingConfig type, mainnet/Holesky addresses, defaults, getLidoAddresses()
- `packages/actions/src/providers/lido-staking/lido-contract.ts` - ABI encoding: encodeSubmitCalldata, encodeRequestWithdrawalsCalldata, encodeApproveCalldata
- `packages/actions/src/providers/lido-staking/index.ts` - LidoStakingActionProvider with stake/unstake resolve()
- `packages/actions/src/__tests__/lido-staking.test.ts` - 10 unit tests for provider

## Decisions Made
- Manual ABI encoding (no viem dependency) following zerox-swap pattern -- function selectors hardcoded from keccak256 hashes
- parseEthAmount uses string split + BigInt for precise decimal-to-wei conversion (avoids floating point)
- unstake returns 2-element array [approve, requestWithdrawals] for sequential pipeline execution

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- LidoStakingActionProvider ready for registration in daemon (Plan 254-02)
- Need to add to registerBuiltInProviders(), Admin Settings, MCP tool exposure
- Config exports ready for SettingsService integration

---
*Phase: 254-lido-evm-staking-provider*
*Completed: 2026-02-24*
