---
phase: 255-jito-solana-staking-provider
plan: 01
subsystem: defi
tags: [jito, jitosol, liquid-staking, solana, spl-stake-pool, action-provider, pda-derivation]

# Dependency graph
requires:
  - phase: v1.5
    provides: IActionProvider framework, ActionProviderRegistry, ContractCallRequest
  - phase: 248-250 (v28.2)
    provides: resolve() array sequential pipeline, provider-trust policy bypass
  - phase: 254
    provides: Lido staking provider pattern (IActionProvider, manual encoding, parseAmount)
provides:
  - JitoStakingActionProvider with stake/unstake actions for SOL<->JitoSOL
  - SPL Stake Pool instruction builders (DepositSol, WithdrawSol)
  - Pure Ed25519 on-curve check and PDA derivation (zero external Solana SDK deps)
  - Base58 encoder/decoder, ATA address derivation
  - Jito mainnet address config
affects: [255-02, daemon-provider-registration, admin-settings-actions, mcp-tool-exposure]

# Tech tracking
tech-stack:
  added: []
  patterns: [spl-stake-pool-encoding, ed25519-on-curve-math, parseSolAmount-9-decimal-bigint, solana-pda-derivation]

key-files:
  created:
    - packages/actions/src/providers/jito-staking/config.ts
    - packages/actions/src/providers/jito-staking/jito-stake-pool.ts
    - packages/actions/src/providers/jito-staking/index.ts
    - packages/actions/src/__tests__/jito-staking.test.ts
  modified: []

key-decisions:
  - "Pure mathematical Ed25519 on-curve check using curve equation (crypto.subtle importKey unreliable for on-curve validation in Node.js 22)"
  - "parseSolAmount with 9-decimal conversion via string split + BigInt for precise SOL->lamports arithmetic"
  - "Zero external Solana SDK dependencies -- base58, PDA derivation, ATA address all implemented locally"
  - "Jito mainnet-only addresses -- testnet falls back to mainnet (no official Jito devnet deployment)"

patterns-established:
  - "SPL Stake Pool instruction encoding: index byte + LE u64 amount as base64"
  - "Solana PDA derivation: SHA-256 hash of [seeds, bump, programId, 'ProgramDerivedAddress'] with Ed25519 off-curve check"
  - "Jito provider follows same IActionProvider pattern as Lido staking"

requirements-completed: [JITO-01, JITO-02, JITO-03, JITO-04]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 255 Plan 01: Jito Solana Staking Provider Summary

**JitoStakingActionProvider with SOL->JitoSOL stake (DepositSol) and JitoSOL->SOL unstake (WithdrawSol) via pure SPL Stake Pool instruction encoding with Ed25519 PDA derivation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T11:33:35Z
- **Completed:** 2026-02-24T11:38:18Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- JitoStakingActionProvider implementing IActionProvider with stake/unstake actions returning Solana ContractCallRequest with programId, instructionData, and accounts
- SPL Stake Pool instruction builders for DepositSol (10 accounts) and WithdrawSol (12 accounts) with base64 instruction data
- Pure mathematical Ed25519 on-curve check + PDA derivation + base58 codec + ATA derivation with zero external Solana SDK dependencies
- 12 unit tests covering instruction encoding, amount conversion (9 decimal SOL), error handling, metadata, account structure, and INSUFFICIENT_BALANCE amount encoding

## Task Commits

Each task was committed atomically:

1. **Task 1: Jito config + SPL Stake Pool instruction encoding** - `416dd4c0` (feat)
2. **Task 2: JitoStakingActionProvider + unit tests** - `a3d533d2` (feat)

## Files Created/Modified
- `packages/actions/src/providers/jito-staking/config.ts` - JitoStakingConfig type, JITO_MAINNET_ADDRESSES, JITO_STAKING_DEFAULTS, getJitoAddresses(), well-known PDA addresses
- `packages/actions/src/providers/jito-staking/jito-stake-pool.ts` - SPL Stake Pool instruction encoding: base58, Ed25519 on-curve, PDA, ATA, encodeDepositSolData, encodeWithdrawSolData, buildDepositSolRequest, buildWithdrawSolRequest, parseSolAmount
- `packages/actions/src/providers/jito-staking/index.ts` - JitoStakingActionProvider with stake/unstake resolve()
- `packages/actions/src/__tests__/jito-staking.test.ts` - 12 unit tests for provider

## Decisions Made
- Pure mathematical Ed25519 on-curve check using curve equation `y^2 - 1 = d*y^2*x^2 + x^2` mod p, because Node.js 22 `crypto.subtle.importKey('raw', ..., 'Ed25519')` accepts all 32-byte inputs without actual on-curve validation
- parseSolAmount uses string split + BigInt for precise 9-decimal SOL->lamports conversion (same pattern as Lido's parseEthAmount but with 9 decimals instead of 18)
- Zero external Solana SDK dependencies for base58 encode/decode, Ed25519 PDA derivation, and ATA address derivation -- all implemented in ~200 lines of pure TypeScript
- Jito Stake Pool is mainnet-only; testnet/devnet falls back to mainnet addresses

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ed25519 on-curve check replaced from crypto.subtle to mathematical check**
- **Found during:** Task 2 (unit test execution)
- **Issue:** Node.js 22 `crypto.subtle.importKey('raw', ..., 'Ed25519')` accepts ALL 32-byte inputs as valid keys, making `isOnCurve()` always return true, causing PDA derivation to fail (no valid PDA found after 256 bumps)
- **Fix:** Implemented pure mathematical Ed25519 on-curve check using the curve equation with modular arithmetic (modPow, point decompression)
- **Files modified:** `packages/actions/src/providers/jito-staking/jito-stake-pool.ts`
- **Verification:** PDA derivation works correctly, all 12 tests pass, ~50/50 on/off curve distribution for random hashes confirmed
- **Committed in:** `a3d533d2` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correct PDA derivation. No scope creep.

## Issues Encountered
None beyond the Ed25519 on-curve deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- JitoStakingActionProvider ready for registration in daemon (Plan 255-02)
- Need to add to registerBuiltInProviders(), Admin Settings, MCP tool exposure
- Config exports ready for SettingsService integration

## Self-Check: PASSED

- All 4 created files verified on disk
- Commit 416dd4c0 (Task 1) verified in git log
- Commit a3d533d2 (Task 2) verified in git log

---
*Phase: 255-jito-solana-staking-provider*
*Completed: 2026-02-24*
