---
phase: 232-oracle-l2-support-cache-key-migration
plan: 01
subsystem: oracle
tags: [caip-19, coingecko, pyth, price-cache, l2, polygon, arbitrum, optimism, base]

# Dependency graph
requires:
  - phase: 231-core-caip-module-network-map
    provides: nativeAssetId, tokenAssetId, networkToCaip2 from @waiaas/core caip module
provides:
  - buildCacheKey(network, address) producing CAIP-19 URIs
  - resolveNetwork(chain, network?) backward-compatible helper
  - 6-entry NetworkType-keyed CoinGecko platform map (polygon-pos, arbitrum-one, optimistic-ethereum, base)
  - PYTH_FEED_IDS with programmatic CAIP-19 keys
  - NATIVE_FEED_MAP rekeyed from ChainType to NetworkType
affects: [232-02, oracle-tests, pipeline-stages, resolve-effective-amount-usd]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolveNetwork(chain, network?) for backward-compatible NetworkType resolution"
    - "buildCacheKey delegates to nativeAssetId/tokenAssetId (no manual address normalization)"
    - "CoinGecko batch queries grouped by network instead of chain"

key-files:
  created: []
  modified:
    - packages/daemon/src/infrastructure/oracle/price-cache.ts
    - packages/daemon/src/infrastructure/oracle/coingecko-platform-ids.ts
    - packages/daemon/src/infrastructure/oracle/pyth-feed-ids.ts
    - packages/daemon/src/infrastructure/oracle/coingecko-oracle.ts
    - packages/daemon/src/infrastructure/oracle/pyth-oracle.ts
    - packages/daemon/src/infrastructure/oracle/oracle-chain.ts
    - packages/daemon/src/infrastructure/oracle/index.ts

key-decisions:
  - "BTC feed ID entry removed -- synthetic key 'ethereum:native_btc' has no valid CAIP-19 mapping"
  - "CoinGecko batch queries grouped by resolved network (not chain) to disambiguate L2 tokens"
  - "getNativePriceByNetwork private helper added to CoinGeckoOracle for internal network-aware native pricing"

patterns-established:
  - "resolveNetwork(chain, network?) pattern: all oracle callers resolve NetworkType before buildCacheKey"
  - "CAIP-19 cache keys: all price cache keys are now CAIP-19 asset type URIs"

requirements-completed: [ORCL-01, ORCL-02, ORCL-04]

# Metrics
duration: 5min
completed: 2026-02-22
---

# Phase 232 Plan 01: Oracle L2 Support + Cache Key Migration Summary

**CAIP-19 cache keys for price oracle with 6-network CoinGecko platform map and atomic Pyth feed ID migration**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-22T03:52:32Z
- **Completed:** 2026-02-22T03:57:26Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- buildCacheKey rewritten to produce CAIP-19 URIs via nativeAssetId/tokenAssetId (zero manual normalization)
- COINGECKO_PLATFORM_MAP expanded from 2 ChainType entries to 6 NetworkType entries (Polygon, Arbitrum, Optimism, Base)
- PYTH_FEED_IDS keys migrated atomically to programmatic CAIP-19 generation (4 entries, BTC synthetic entry removed)
- All 9 buildCacheKey call sites across 3 oracle files migrated from chain to network parameter
- CoinGecko batch queries now group by network instead of chain for correct L2 disambiguation

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite buildCacheKey + resolveNetwork + expand CoinGecko + update Pyth keys** - `4d4a2094` (feat)
2. **Task 2: Update all oracle callers to new buildCacheKey(network, address) signature** - `2ab5d6c3` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/oracle/price-cache.ts` - buildCacheKey(network, address) + resolveNetwork(chain, network?) helper
- `packages/daemon/src/infrastructure/oracle/coingecko-platform-ids.ts` - 6-entry NetworkType-keyed platform map with L2 networks
- `packages/daemon/src/infrastructure/oracle/pyth-feed-ids.ts` - PYTH_FEED_IDS with CAIP-19 keys, NATIVE_FEED_MAP with NetworkType keys
- `packages/daemon/src/infrastructure/oracle/coingecko-oracle.ts` - Network-aware getPrice/getPrices/getNativePrice with batch grouping by network
- `packages/daemon/src/infrastructure/oracle/pyth-oracle.ts` - resolveNetwork before buildCacheKey in getPrice/getPrices/getNativePrice
- `packages/daemon/src/infrastructure/oracle/oracle-chain.ts` - resolveNetwork before buildCacheKey in getPrice/getPrices/getNativePrice
- `packages/daemon/src/infrastructure/oracle/index.ts` - Export resolveNetwork from barrel

## Decisions Made
- **BTC feed ID removed:** The `'ethereum:native_btc'` entry was a synthetic key with no valid CAIP-19 mapping and no real on-chain token. Removed per plan. WBTC can be added with its actual ERC-20 address if needed in the future.
- **getNativePriceByNetwork:** Added a private helper to CoinGeckoOracle to avoid double-resolving network when getPrice already resolved it.
- **isEvm check in fetchBatchTokenPrices:** Used `tokens[0]?.chain === 'ethereum'` since all tokens in a batch share the same network/chain. This is correct because the batch is already grouped by network.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Export resolveNetwork from oracle barrel**
- **Found during:** Task 2
- **Issue:** resolveNetwork is needed by external callers (pipeline stages) but was not exported from oracle/index.ts
- **Fix:** Added resolveNetwork to the barrel export in oracle/index.ts
- **Files modified:** packages/daemon/src/infrastructure/oracle/index.ts
- **Verification:** Typecheck passes
- **Committed in:** 2ab5d6c3 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for external callers to access resolveNetwork. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 oracle source files compile clean with CAIP-19 cache key format
- Test suites will need updating (Plan 232-02) to match new CAIP-19 key expectations
- Pipeline callers (resolve-effective-amount-usd.ts, stages.ts) may need network threading (covered by later phases)

## Self-Check: PASSED

- All 8 files verified present on disk
- Commits 4d4a2094 and 2ab5d6c3 verified in git log
- Typecheck: zero errors (FULL TURBO cache hit)
- Zero legacy buildCacheKey(chain, ...) calls in oracle directory
- Zero legacy getCoinGeckoPlatform(chain, ...) calls in oracle directory

---
*Phase: 232-oracle-l2-support-cache-key-migration*
*Completed: 2026-02-22*
