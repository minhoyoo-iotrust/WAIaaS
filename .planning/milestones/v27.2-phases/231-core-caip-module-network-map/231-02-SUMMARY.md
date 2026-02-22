---
phase: 231-core-caip-module-network-map
plan: 02
subsystem: core
tags: [caip-2, caip-19, network-map, asset-helpers, slip44, erc20, token, barrel-export]

# Dependency graph
requires:
  - phase: 231-01
    provides: "CAIP-2/19 parsers, formatters, Zod schemas (Caip2Schema, Caip19Schema, parseCaip2, formatCaip2, parseCaip19, formatCaip19)"
provides:
  - "13-network bidirectional CAIP-2 <-> NetworkType map (CAIP2_TO_NETWORK, NETWORK_TO_CAIP2, networkToCaip2, caip2ToNetwork)"
  - "Native asset CAIP-19 generation with per-chain SLIP-44 coin types (nativeAssetId)"
  - "Token asset CAIP-19 generation with EVM/Solana namespace handling (tokenAssetId)"
  - "Native asset detection (isNativeAsset)"
  - "TokenRefSchema extended with optional assetId (Caip19Schema) and network (NetworkTypeEnum)"
  - "All 15 CAIP symbols importable from @waiaas/core barrel"
affects: [232-asset-identification, 233-policy-migration, 234-price-oracle-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Network map SSoT pattern: single module defines bidirectional CAIP-2/NetworkType mapping, all consumers import from it", "SLIP-44 per-chain coin type lookup for native asset CAIP-19 generation", "EVM address lowercase normalization at CAIP construction time"]

key-files:
  created:
    - packages/core/src/caip/network-map.ts
    - packages/core/src/caip/asset-helpers.ts
  modified:
    - packages/core/src/caip/index.ts
    - packages/core/src/interfaces/x402.types.ts
    - packages/core/src/interfaces/index.ts
    - packages/core/src/interfaces/price-oracle.types.ts
    - packages/core/src/index.ts
    - packages/daemon/src/services/wc-session-service.ts
    - packages/core/src/__tests__/caip.test.ts
    - packages/core/src/__tests__/x402-types.test.ts
    - packages/core/src/__tests__/package-exports.test.ts

key-decisions:
  - "CAIP-2/NetworkType map in network-map.ts is SSoT -- x402.types.ts and wc-session-service.ts import from it"
  - "Polygon uses SLIP-44 966 (POL), NOT 60 (ETH) -- separate native coin identity"
  - "EVM addresses lowercased at CAIP-19 construction time (tokenAssetId); Solana base58 NEVER lowercased"
  - "TokenRefSchema extension is additive (optional fields) -- zero breaking changes"

patterns-established:
  - "SSoT consolidation: duplicate maps deleted from consumer files, replaced with imports from caip/ module"
  - "Backward-compatible re-export: x402.types.ts re-exports from caip/ so existing import paths continue to work"

requirements-completed: [CAIP-06, CAIP-07, CAIP-08, CAIP-09, CAIP-10, TOKN-01]

# Metrics
duration: 5min
completed: 2026-02-22
---

# Phase 231 Plan 02: Network Map + Asset Helpers Summary

**13-network bidirectional CAIP-2 map, SLIP-44 native asset IDs, erc20/token asset helpers, x402/WC consolidation, TokenRef extension**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-22T03:26:52Z
- **Completed:** 2026-02-22T03:32:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- CAIP2_TO_NETWORK / NETWORK_TO_CAIP2 bidirectional maps with all 13 NetworkType values as SSoT
- nativeAssetId() with per-chain SLIP-44 coin types (ETH=60, POL=966, SOL=501)
- tokenAssetId() with EVM erc20 lowercase normalization + Solana token base58 preservation
- x402.types.ts refactored to re-export from caip/ (backward-compatible, zero breaking changes)
- wc-session-service.ts consolidated to use NETWORK_TO_CAIP2 from @waiaas/core (CAIP2_CHAIN_IDS deleted)
- TokenRefSchema extended with optional assetId and network fields for Phase 232 price cache migration
- All 15 CAIP symbols importable from @waiaas/core barrel (schemas, parsers, formatters, maps, helpers)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement network-map.ts, asset-helpers.ts, extend caip/index.ts + tests** - `4a42d4a3` (feat)
2. **Task 2: Integrate with x402, WC, TokenRef, and barrel exports** - `41c63d70` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `packages/core/src/caip/network-map.ts` - 13-network bidirectional CAIP-2 <-> NetworkType map + lookup functions
- `packages/core/src/caip/asset-helpers.ts` - nativeAssetId, tokenAssetId, isNativeAsset helper functions
- `packages/core/src/caip/index.ts` - Extended barrel export with network-map and asset-helpers
- `packages/core/src/interfaces/x402.types.ts` - Replaced local CAIP-2 maps/parser with re-exports from caip/
- `packages/core/src/interfaces/index.ts` - Added caip/ module exports (15 symbols)
- `packages/core/src/interfaces/price-oracle.types.ts` - Extended TokenRefSchema with optional assetId + network
- `packages/core/src/index.ts` - Wired CAIP types and value exports through barrel
- `packages/daemon/src/services/wc-session-service.ts` - Replaced local CAIP2_CHAIN_IDS with imported NETWORK_TO_CAIP2
- `packages/core/src/__tests__/caip.test.ts` - 27 new tests (69 total) for maps, lookups, asset helpers
- `packages/core/src/__tests__/x402-types.test.ts` - Updated parseCaip2 error assertions for Zod messages
- `packages/core/src/__tests__/package-exports.test.ts` - Added CAIP module export verification test

## Decisions Made
- CAIP-2/NetworkType map in network-map.ts is SSoT -- x402.types.ts and wc-session-service.ts import from it instead of maintaining local copies
- Polygon uses SLIP-44 966 (POL), NOT 60 (ETH) -- distinct native coin identity per CAIP-19 spec
- EVM addresses lowercased at CAIP-19 construction time; Solana base58 NEVER lowercased
- TokenRefSchema extension is additive (both fields optional) -- zero breaking changes for existing consumers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete CAIP-2/19 module ready for Phase 232 (asset identification migration)
- TokenRefSchema extended with assetId field ready for price cache migration
- All consumers can import CAIP utilities from @waiaas/core

## Self-Check: PASSED

- [x] packages/core/src/caip/network-map.ts -- FOUND
- [x] packages/core/src/caip/asset-helpers.ts -- FOUND
- [x] packages/core/src/caip/index.ts -- FOUND
- [x] packages/core/src/__tests__/caip.test.ts -- FOUND
- [x] Commit 4a42d4a3 -- FOUND
- [x] Commit 41c63d70 -- FOUND

---
*Phase: 231-core-caip-module-network-map*
*Completed: 2026-02-22*
