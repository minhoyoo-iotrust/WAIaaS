---
phase: 58-openapihono-getassets
plan: 02
subsystem: api
tags: [chain-adapter, solana, spl-token, getAssets, zod, tdd]

# Dependency graph
requires:
  - phase: 51-solana-adapter
    provides: "IChainAdapter 10-method interface + SolanaAdapter base implementation"
provides:
  - "AssetInfo type (7 fields) in @waiaas/core"
  - "AssetInfoSchema Zod schema for JSON serialization"
  - "IChainAdapter.getAssets() method signature"
  - "SolanaAdapter.getAssets() implementation (getBalance + getTokenAccountsByOwner)"
affects:
  - "59-rest-api-expansion (GET /v1/wallet/assets endpoint)"
  - "61-typescript-sdk (SDK getAssets method)"
  - "62-python-sdk (SDK get_assets method)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getTokenAccountsByOwner with jsonParsed encoding for SPL token discovery"
    - "Hard-coded SPL_TOKEN_PROGRAM_ID to avoid @solana-program/token dependency"
    - "AssetInfoSchema uses string for bigint (JSON serialization pattern)"

key-files:
  created:
    - "packages/core/src/schemas/asset.schema.ts"
  modified:
    - "packages/core/src/interfaces/chain-adapter.types.ts"
    - "packages/core/src/interfaces/IChainAdapter.ts"
    - "packages/core/src/interfaces/index.ts"
    - "packages/core/src/index.ts"
    - "packages/core/src/schemas/index.ts"
    - "packages/adapters/solana/src/adapter.ts"
    - "packages/adapters/solana/src/__tests__/solana-adapter.test.ts"

key-decisions:
  - "Hard-coded SPL Token Program ID instead of adding @solana-program/token dependency"
  - "AssetInfo.symbol and name are empty strings for SPL tokens (metadata requires Metaplex, v1.4+)"
  - "Native SOL always first in result array, zero-balance tokens filtered out"
  - "AssetInfoSchema.balance is string (bigint serialization for JSON transport)"

patterns-established:
  - "getAssets returns native token first, then non-zero SPL tokens"
  - "AssetInfoDto type for JSON-serialized version of AssetInfo"

# Metrics
duration: 6min
completed: 2026-02-10
---

# Phase 58 Plan 02: getAssets() Summary

**IChainAdapter.getAssets() with SolanaAdapter implementation using getBalance + getTokenAccountsByOwner RPC, TDD with 6 test cases**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-10T13:50:34Z
- **Completed:** 2026-02-10T13:57:05Z
- **Tasks:** 3 (RED + GREEN + REFACTOR)
- **Files modified:** 8

## Accomplishments
- AssetInfo type (7 fields: mint, symbol, name, balance, decimals, isNative, usdValue) added to IChainAdapter
- SolanaAdapter.getAssets() fetches native SOL + all SPL token accounts in 2 RPC calls
- AssetInfoSchema Zod schema with bigint-as-string for JSON serialization
- 6 TDD test cases covering normal, empty, zero-balance filter, RPC error, and not-connected scenarios
- All 23 adapter-solana tests pass, 343 daemon tests pass (no regressions)

## Task Commits

Each task was committed atomically:

1. **RED: Failing getAssets tests** - `107ff4e` (test)
2. **GREEN: Implement getAssets** - `9317de0` (feat)
3. **REFACTOR: Mock adapter fixes** - committed by parallel agent in `226dcb8` (no separate refactor commit needed)

_Note: TDD RED-GREEN-REFACTOR cycle. Refactor changes (daemon mock stubs + TS strict fixes) were picked up by a parallel 58-01 agent._

## Files Created/Modified
- `packages/core/src/interfaces/chain-adapter.types.ts` - Added AssetInfo interface (7 fields)
- `packages/core/src/interfaces/IChainAdapter.ts` - Added getAssets(address) method signature
- `packages/core/src/interfaces/index.ts` - Export AssetInfo type
- `packages/core/src/index.ts` - Export AssetInfo, AssetInfoSchema, AssetInfoDto from barrel
- `packages/core/src/schemas/asset.schema.ts` - New file: AssetInfoSchema Zod schema
- `packages/core/src/schemas/index.ts` - Export AssetInfoSchema + AssetInfoDto
- `packages/adapters/solana/src/adapter.ts` - Implemented getAssets() method
- `packages/adapters/solana/src/__tests__/solana-adapter.test.ts` - 6 new test cases

## Decisions Made
- **Hard-coded SPL_TOKEN_PROGRAM_ID:** Used `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` instead of adding `@solana-program/token` dependency. Keeps adapter dependency count low.
- **Empty symbol/name for SPL tokens:** On-chain token accounts don't store metadata (that requires Metaplex metadata accounts). Symbol/name population is v1.4+ work with price oracle.
- **Native SOL always included:** Even with 0 balance, native SOL entry is always returned (users need to see their native token).
- **Zero-balance filter:** SPL token accounts with 0 balance are filtered out (these are usually closed or empty accounts).

## Deviations from Plan

None - plan executed exactly as written.

_Note: The daemon mock adapter fixes (adding `getAssets: async () => []` to 7 test files) were needed to satisfy TypeScript after the interface change. These were committed by a parallel 58-01 agent, not as a separate refactor commit._

## Issues Encountered
- Pre-existing `@waiaas/cli` test failure (e2e-errors.test.ts expects 404 but gets 401) -- unrelated to this plan, likely from ongoing 58-01 OpenAPIHono work.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- getAssets() is ready for Phase 59 REST API expansion (GET /v1/wallet/assets endpoint)
- AssetInfoSchema is ready for OpenAPI route definition
- All builds pass for @waiaas/core and @waiaas/adapter-solana

## Self-Check: PASSED

---
*Phase: 58-openapihono-getassets*
*Completed: 2026-02-10*
