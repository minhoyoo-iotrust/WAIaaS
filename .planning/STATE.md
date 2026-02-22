# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 233 - DB Migration + Schema + Policy

## Current Position

Phase: 3 of 4 (Phase 233: DB Migration + Schema + Policy)
Plan: 1 of 3 in current phase (COMPLETE)
Status: Executing Phase 233
Last activity: 2026-02-22 -- Completed 233-01 DB v22 migration + token API assetId

Progress: [██████░░░░] 58%

## Performance Metrics

**Cumulative:** 52 milestones, 230 phases, 496 plans, 1,331 reqs, 4,396+ tests, ~155,540 LOC TS

**Velocity:**
- Total plans completed: 5 (this milestone)
- Average duration: 5.0min
- Total execution time: 0.42 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 231 | 2/2 | 7min | 3.5min |
| 232 | 2/2 | 11min | 5.5min |
| 233 | 1/3 | 8min | 8min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

- Zero new npm deps -- custom ~240 LOC CAIP module (4 external libs evaluated and rejected)
- `token` namespace for Solana SPL/Token-2022 (NOT `spl`)
- slip44: ETH=60, SOL=501, POL=966
- EVM addresses lowercase at CAIP construction time; Solana base58 NEVER lowercased
- InMemoryPriceCache volatile -- cache key migration zero-cost at restart
- DB migration v22: application-level backfill (SELECT+loop+UPDATE, established v6b pattern)
- 4-scenario policy evaluation matrix required for ALLOWED_TOKENS (C-03 pitfall)
- Single regex per CAIP schema (no composed schemas) -- simpler and faster
- Caip19Schema aliases Caip19AssetTypeSchema (fungible tokens only, no AssetId)
- Both parse and format validate via Zod -- invalid input never silently passes
- network-map.ts is SSoT for CAIP-2/NetworkType -- x402.types.ts and wc-session-service.ts import from it
- Polygon uses SLIP-44 966 (POL), NOT 60 (ETH)
- TokenRefSchema extension additive (optional assetId + network) -- zero breaking changes
- BTC feed ID entry removed -- synthetic key 'ethereum:native_btc' has no valid CAIP-19 mapping
- CoinGecko batch queries grouped by resolved network (not chain) to disambiguate L2 tokens
- resolveNetwork(chain, network?) pattern for backward-compatible NetworkType resolution in oracle callers
- PYTH_FEED_IDS cross-validation test pattern: verify buildCacheKey output matches all feed ID map keys
- Pipeline network threading: resolveEffectiveAmountUsd passes optional network to oracle for L2 token pricing
- PRAGMA table_info guard before ALTER TABLE ADD COLUMN for idempotent migrations on fresh-DDL databases
- Test fixture migration versions bumped +1 when real migration version is added

### Blockers/Concerns

- CoinGecko L2 platform IDs (polygon-pos, arbitrum-one, optimistic-ethereum, base) -- documented but not live-tested, verify during Phase 232
- STO-03: Confirmation Worker RPC 콜백 미주입 (v27.1 known gap, unrelated to CAIP-19)

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 233-01-PLAN.md (DB v22 migration + token API assetId)
Resume file: None
