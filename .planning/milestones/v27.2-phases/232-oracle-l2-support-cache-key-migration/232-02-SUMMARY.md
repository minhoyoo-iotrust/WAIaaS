---
phase: 232-oracle-l2-support-cache-key-migration
plan: 02
subsystem: oracle
tags: [caip-19, coingecko, pyth, price-cache, oracle-chain, l2, polygon, tests, pipeline]

# Dependency graph
requires:
  - phase: 232-oracle-l2-support-cache-key-migration
    plan: 01
    provides: buildCacheKey(network, address), resolveNetwork(chain, network?), CAIP-19 keyed PYTH_FEED_IDS, CoinGecko L2 platform map
provides:
  - 85 passing oracle tests with CAIP-19 key expectations (zero legacy format assertions)
  - L2 token price tests verifying CoinGecko polygon-pos platform routing
  - PYTH_FEED_IDS cross-validation tests ensuring key atomicity
  - Network threading through pipeline resolveEffectiveAmountUsd to oracle
affects: [policy-evaluation, usd-pricing, pipeline-stages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PYTH_FEED_IDS cross-validation: test buildCacheKey output matches all feed ID map keys"
    - "Network parameter threading: optional network param through pipeline callers to oracle"

key-files:
  created: []
  modified:
    - packages/daemon/src/__tests__/price-cache.test.ts
    - packages/daemon/src/__tests__/coingecko-oracle.test.ts
    - packages/daemon/src/__tests__/pyth-oracle.test.ts
    - packages/daemon/src/__tests__/oracle-chain.test.ts
    - packages/daemon/src/pipeline/resolve-effective-amount-usd.ts
    - packages/daemon/src/__tests__/resolve-effective-amount-usd.test.ts
    - packages/daemon/src/pipeline/stages.ts

key-decisions:
  - "Removed Pyth BTC test (test 10) -- BTC feed entry removed in Plan 01, no valid CAIP-19 mapping"
  - "Added backward compatibility test for getPrice without network -- resolveNetwork handles default"

patterns-established:
  - "Cross-validation test pattern: for each PYTH_FEED_IDS entry, verify buildCacheKey(network, address) produces a key in the map"
  - "Network threading: pipeline callers pass optional network to oracle, oracle resolves internally if not provided"

requirements-completed: [ORCL-03]

# Metrics
duration: 6min
completed: 2026-02-22
---

# Phase 232 Plan 02: Oracle Test Suites CAIP-19 Migration + Pipeline Network Threading Summary

**85 oracle tests with CAIP-19 key expectations, L2 CoinGecko platform routing tests, and pipeline network threading to oracle**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-22T03:59:59Z
- **Completed:** 2026-02-22T04:06:23Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- All 4 oracle test suites updated from legacy `chain:address` to CAIP-19 cache key format (66 tests)
- Added resolveNetwork tests (4), PYTH_FEED_IDS cross-validation tests (5), and Polygon USDC L2 tests (2)
- Pipeline resolveEffectiveAmountUsd now threads network to oracle for accurate L2 token pricing
- Stages.ts passes ctx.resolvedNetwork to oracle calls, completing end-to-end L2 price resolution

## Task Commits

Each task was committed atomically:

1. **Task 1: Update oracle test suites for CAIP-19 cache key format + add L2 tests** - `dc5aff88` (test)
2. **Task 2: Thread network through pipeline oracle callers** - `ef4add5d` (feat)

## Files Created/Modified
- `packages/daemon/src/__tests__/price-cache.test.ts` - buildCacheKey CAIP-19 tests + resolveNetwork tests + PYTH_FEED_IDS cross-validation
- `packages/daemon/src/__tests__/coingecko-oracle.test.ts` - Network field in fixtures + L2 Polygon USDC test + batch L1/L2 separation test
- `packages/daemon/src/__tests__/pyth-oracle.test.ts` - Network field in fixtures + CAIP-19 result keys + backward compatibility test
- `packages/daemon/src/__tests__/oracle-chain.test.ts` - CAIP-19 cache keys in all assertions + buildCacheKey-derived key constants
- `packages/daemon/src/pipeline/resolve-effective-amount-usd.ts` - Optional network parameter in TOKEN_TRANSFER and BATCH getPrice calls
- `packages/daemon/src/__tests__/resolve-effective-amount-usd.test.ts` - Network forwarding tests + backward compatibility test
- `packages/daemon/src/pipeline/stages.ts` - Pass ctx.resolvedNetwork to resolveEffectiveAmountUsd

## Decisions Made
- **Removed BTC Pyth test:** Test 10 in pyth-oracle.test.ts used `native_btc` address which had a synthetic key removed in Plan 01. Replaced with backward-compatibility test for chain-only getPrice (no network field).
- **Cross-validation test verifies all 4 PYTH_FEED_IDS entries:** Explicit loop over all known network+address pairs ensures no orphaned feed ID entries.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All oracle tests pass with CAIP-19 expectations (85 tests, zero legacy format)
- Pipeline correctly threads network to oracle for L2 token pricing
- Phase 232 complete: oracle CAIP-19 migration fully tested and integrated

## Self-Check: PASSED

- All 7 files verified present on disk
- Commits dc5aff88 and ef4add5d verified in git log
- Typecheck: zero errors
- Lint: successful (pre-existing warnings only)
- 85 tests pass across 5 test files
- Zero legacy `chain:address` format cache keys in test assertions

---
*Phase: 232-oracle-l2-support-cache-key-migration*
*Completed: 2026-02-22*
