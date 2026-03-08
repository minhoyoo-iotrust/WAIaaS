---
phase: 348-hyperliquid-dex-design
plan: 01
subsystem: design
tags: [hyperliquid, eip-712, pipeline, api-direct, defi, perp]

requires:
  - phase: 347-hyperevm-chain
    provides: HyperEVM chain registered in EVM_CHAIN_MAP
provides:
  - "ApiDirectResult interface and isApiDirectResult() type guard"
  - "Stage 5 branching design for API-direct vs on-chain execution"
  - "requiresSigningKey pattern with key decryption flow"
  - "EIP-712 phantom agent signing schema (L1 Action)"
  - "EIP-712 user-signed action schema (6 action types)"
  - "HyperliquidExchangeClient shared structure design"
  - "HyperliquidSigner dual method design (signL1Action + signUserSignedAction)"
  - "Weight-based rate limiter design"
  - "HyperliquidMarketData read-only wrapper design"
  - "Component dependency graph and file structure"
affects: [349-core-infra-perp, 350-spot-trading, 351-sub-account]

tech-stack:
  added: ["@msgpack/msgpack ^3.0.0 (planned)"]
  patterns: [ApiDirectResult, requiresSigningKey, phantom-agent-signing, weight-based-rate-limiter]

key-files:
  modified:
    - internal/objectives/m31-04-hyperliquid-ecosystem.md

key-decisions:
  - "ApiDirectResult uses __apiDirect discriminant for type guard"
  - "Stage 5 branches on isApiDirectResult() to skip on-chain execution"
  - "requiresSigningKey triggers key decrypt before provider.resolve()"
  - "Phantom agent signing uses chainId 1337 (mainnet/testnet same)"
  - "User-signed actions use chainId 42161 (mainnet) / 421614 (testnet)"
  - "Rate limiter defaults to 600 weight/min (50% of Hyperliquid 1200 limit)"
  - "HyperliquidSigner is standalone (no ExchangeClient dependency)"

patterns-established:
  - "ApiDirectResult: Provider-internal execution pattern bypassing on-chain TX"
  - "requiresSigningKey: Metadata flag for providers needing private key access"
  - "Phantom agent signing: msgpack -> keccak256 -> connectionId -> EIP-712"

requirements-completed: [HDESIGN-01, HDESIGN-02, HDESIGN-03]

duration: 2min
completed: 2026-03-08
---

# Phase 348 Plan 01: ApiDirectResult + EIP-712 Signing + ExchangeClient Design Summary

**ApiDirectResult pipeline integration pattern, dual EIP-712 signing schemas (phantom agent + user-signed), and HyperliquidExchangeClient shared infrastructure design**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-08T03:29:54Z
- **Completed:** 2026-03-08T03:32:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- HDESIGN-01: ApiDirectResult interface with Stage 5 branching and requiresSigningKey pattern fully designed
- HDESIGN-02: EIP-712 dual signing schemas (phantom agent L1 Action + user-signed 6 action types) with msgpack field order tables
- HDESIGN-03: ExchangeClient with Exchange/Info endpoints, weight-based rate limiter, MarketData wrapper, component dependency graph

## Task Commits

1. **Task 1: HDESIGN-01 ApiDirectResult + Stage 5 branching** - `2e4871b6` (docs)
2. **Task 2: HDESIGN-02 EIP-712 signing + HDESIGN-03 ExchangeClient** - `3be38183` (docs)

## Files Created/Modified
- `internal/objectives/m31-04-hyperliquid-ecosystem.md` - Added HDESIGN-01/02/03 design sections

## Decisions Made
- ApiDirectResult uses `__apiDirect: true` discriminant (same pattern as Zod discriminatedUnion)
- Stage 5 checks isApiDirectResult() before on-chain execution path
- requiresSigningKey metadata flag triggers key decrypt in Pre-Stage 5
- Phantom agent signing always uses chainId 1337 regardless of mainnet/testnet
- User-signed actions use Arbitrum chainIds (42161/421614) per Hyperliquid spec
- Rate limiter conservatively defaults to 50% of official limit (600 vs 1200 weight/min)
- HyperliquidSigner has no dependency on ExchangeClient (clean separation)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- HDESIGN-01/02/03 design sections complete in m31-04 objective
- Ready for 348-02 (Sub-account, Policy, Interface, DB schema design)
- All 3 requirements (HDESIGN-01/02/03) fully satisfied

---
*Phase: 348-hyperliquid-dex-design*
*Completed: 2026-03-08*
