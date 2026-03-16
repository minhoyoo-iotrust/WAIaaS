---
phase: 430-as-any-removal
plan: 03
subsystem: infra
tags: [typescript, as-any, network-type, nft-indexer, external-action]

requires:
  - phase: 430-01
    provides: as any removal from core daemon files
  - phase: 430-02
    provides: as any removal from pipeline and hot-reload
provides:
  - zero production as any in daemon package (CAST-12 achieved)
  - typed external-action-pipeline policy evaluate params
  - NetworkType assertions across 9 API route sites
  - typed NFT indexer JSON responses
affects: [431]

tech-stack:
  added: []
  patterns: [in-operator type guard for eip712 property, typed policy evaluate params]

key-files:
  created: []
  modified:
    - packages/daemon/src/pipeline/external-action-pipeline.ts
    - packages/daemon/src/api/routes/actions.ts
    - packages/daemon/src/api/routes/admin-actions.ts
    - packages/daemon/src/infrastructure/action/action-provider-registry.ts
    - packages/daemon/src/api/routes/nfts.ts
    - packages/daemon/src/api/routes/staking.ts
    - packages/daemon/src/api/routes/defi-positions.ts
    - packages/daemon/src/api/routes/tokens.ts
    - packages/daemon/src/api/routes/wallet.ts
    - packages/daemon/src/infrastructure/nft/alchemy-nft-indexer.ts
    - packages/daemon/src/infrastructure/nft/helius-nft-indexer.ts
    - packages/daemon/src/infrastructure/nft/nft-indexer-client.ts

key-decisions:
  - "Policy evaluate extra fields (venue, actionCategory, notionalUsd) cast via explicit typed object instead of as any"
  - "'eip712' in contractCall type guard replaces (contractCall as any).eip712 pattern"
  - "network as NetworkType chosen over runtime validation (DB values are already validated)"

patterns-established:
  - "'prop' in obj type guard: standard pattern for optional property access on union types"
  - "network as NetworkType: standard assertion for DB-sourced network strings"

requirements-completed: [CAST-07, CAST-11, CAST-12, CAST-13]

duration: 14min
completed: 2026-03-16
---

# Phase 430 Plan 03: Final as any Sweep -- External Actions, API Routes, NFT Indexers

**Achieved zero production as any across entire daemon package: external-action-pipeline, 5 API routes, 3 NFT indexers (25 sites removed)**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-16T06:20:00Z
- **Completed:** 2026-03-16T06:34:00Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Removed 4 as any from external-action-pipeline.ts (policy params, chain type, externalId)
- Removed 7 as any from actions.ts (kind routing, ApiDirectResult, eip712 access)
- Replaced 9 network as any with NetworkType assertions across API routes
- Removed 4 as any from NFT indexer files (response.json(), network params)
- Achieved CAST-12: zero production as any in daemon/src/ (verified via grep)

## Task Commits

1. **Task 1: external-action-pipeline + actions + admin-actions + registry** - `f603c5a5` (fix)
2. **Task 2: API routes + NFT indexers + final sweep** - `efb44706` (fix)

## Files Created/Modified
- `packages/daemon/src/pipeline/external-action-pipeline.ts` - typed policy params, ChainType, typed externalId
- `packages/daemon/src/api/routes/actions.ts` - typed kind routing, ApiDirectResult, eip712 guard
- `packages/daemon/src/api/routes/admin-actions.ts` - eip712 in-operator guard
- `packages/daemon/src/infrastructure/action/action-provider-registry.ts` - spread-tag pattern
- `packages/daemon/src/api/routes/nfts.ts` - NetworkType (4 sites)
- `packages/daemon/src/api/routes/staking.ts` - NetworkType (2 sites)
- `packages/daemon/src/api/routes/defi-positions.ts` - NetworkType (1 site)
- `packages/daemon/src/api/routes/tokens.ts` - NetworkType (1 site)
- `packages/daemon/src/api/routes/wallet.ts` - NetworkType (1 site)
- `packages/daemon/src/infrastructure/nft/alchemy-nft-indexer.ts` - typed response
- `packages/daemon/src/infrastructure/nft/helius-nft-indexer.ts` - typed JSON-RPC response
- `packages/daemon/src/infrastructure/nft/nft-indexer-client.ts` - NetworkType (2 sites)

## Decisions Made
- Policy evaluate extra fields cast via explicit typed object literal (keeps fields, removes as any)
- 'eip712' in contractCall guard is safer than (contractCall as any).eip712

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing type error in integration-wiring test mock**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** Mock object for minimalSubscriber missing optional method types (pollAll, checkFinalized, getBlockNumber)
- **Fix:** Added explicit type annotation with optional methods
- **Files modified:** packages/daemon/src/services/incoming/__tests__/integration-wiring.test.ts
- **Committed in:** `2f8024e4`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Pre-existing test type error blocked daemon build. Fix was trivial (type annotation only).

## Issues Encountered
- 15 pre-existing test failures (not caused by this plan) -- x402 route, policy engine, simulate-api tests

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CAST-12 achieved: zero production as any in daemon/src/
- CAST-13 achieved: pnpm turbo run typecheck passes
- Ready for Phase 431: SSoT consolidation

---
*Phase: 430-as-any-removal*
*Completed: 2026-03-16*
