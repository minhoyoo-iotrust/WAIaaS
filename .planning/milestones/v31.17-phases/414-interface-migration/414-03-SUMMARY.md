---
phase: 414-interface-migration
plan: 03
subsystem: admin-ui
tags: [migration, types, openapi, typed-client, wallets]
dependency_graph:
  requires:
    - phase: 414-01
      provides: types.aliases.ts central module, typed-client.ts
    - phase: 414-02
      provides: 17 pages migrated to typed-client
  provides:
    - wallets.tsx fully migrated (largest page)
    - SettingsPanel.tsx and PolymarketSettings.tsx migrated
    - All wallet test files migrated to typed-client mocks
  affects: [admin-ui]
tech-stack:
  added: []
  patterns:
    - "openapi-fetch typed client pattern for all Admin UI pages"
    - "NftListResponse uses items[] + pageKey (not nfts[] + cursor)"
    - "ExternalActionItem uses provider (not actionProvider)"
    - "NftMetadataResponse uses trait_type + rawMetadata (not traitType + metadata)"
key-files:
  modified:
    - packages/admin/src/pages/wallets.tsx
    - packages/admin/src/__tests__/wallets.test.tsx
    - packages/admin/src/__tests__/wallets-coverage.test.tsx
    - packages/admin/src/__tests__/wallets-nft.test.tsx
    - packages/admin/src/__tests__/wallets-rpc-pool.test.tsx
    - packages/admin/src/__tests__/wallets-preset-dropdown.test.tsx
    - packages/admin/src/__tests__/wallets-provider.test.tsx
    - packages/admin/src/__tests__/wallets-external-actions.test.tsx
    - packages/admin/src/components/hyperliquid/SettingsPanel.tsx
    - packages/admin/src/components/polymarket/PolymarketSettings.tsx
key-decisions:
  - "NftItem/NftMetadata fields aligned to generated schema (items not nfts, trait_type not traitType, rawMetadata not metadata)"
  - "ExternalActionItem uses provider field (not actionProvider) matching generated schema"
  - "networkToChain returns 'ethereum' (not 'evm') matching generated TestRpcRequest enum"
  - "ApprovalSettingsInfo and UrlEntry kept as UI-only interfaces (not API response shapes)"
  - "SettingsData remains manual via settings-helpers (TODO Phase 415)"
patterns-established:
  - "Test mock pattern: api.GET returns { data: ... }, path matching uses OpenAPI template paths (/v1/wallets/{id})"
requirements-completed: [MIG-01, MIG-02, MIG-08]
duration: 72min
completed: 2026-03-15
---

# Phase 414 Plan 03: wallets.tsx Migration + Full Verification Summary

**wallets.tsx (3417 lines, 16 interfaces, 37 API calls) fully migrated to typed client with generated types, 7 test files updated, MIG-08 drift test verified**

## Performance

- **Duration:** 72 min
- **Started:** 2026-03-14T19:08:41Z
- **Completed:** 2026-03-14T20:21:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Migrated 16 manual interfaces to generated OpenAPI type aliases in wallets.tsx
- Replaced 37 apiGet/apiPost/apiPut/apiDelete calls with typed api.GET/POST/PUT/DELETE
- Migrated 7 wallet test files (123 tests) to typed-client mock pattern
- Migrated SettingsPanel.tsx and PolymarketSettings.tsx to typed client
- MIG-08 drift test verified: removing publicKey from types.generated.ts causes typecheck failure
- Fixed 4 field-name mismatches caught by type enforcement (NFT items/pageKey, ExternalAction provider, NftMetadata trait_type/rawMetadata)

## Task Commits

Each task was committed atomically:

1. **Task 1: wallets.tsx full migration** - `16b0d98e` (feat)
2. **Task 2: component cleanup + verification** - `bd386bb0` (feat)

## Files Created/Modified
- `packages/admin/src/pages/wallets.tsx` - Migrated 16 interfaces + 37 API calls to typed client
- `packages/admin/src/__tests__/wallets*.test.tsx` (7 files) - Updated mock pattern to typed-client
- `packages/admin/src/components/hyperliquid/SettingsPanel.tsx` - Migrated to typed client
- `packages/admin/src/components/polymarket/PolymarketSettings.tsx` - Migrated to typed client

## Decisions Made
- NftItem/NftMetadata field names aligned to generated schema (was using wrong field names with loose typing)
- ExternalActionItem.provider replaces actionProvider (schema uses `provider`)
- networkToChain return type fixed from `'evm'` to `'ethereum'` (matches generated enum)
- ApprovalSettingsInfo and UrlEntry kept as UI-only interfaces (derived from settings, not direct API response)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed NFT field name mismatches**
- **Found during:** Task 1 (wallets.tsx migration)
- **Issue:** wallets.tsx used `nfts` field and `cursor`/`hasMore` but NftListResponse uses `items`/`pageKey`/`totalCount`
- **Fix:** Updated fetchNfts to use correct field names, updated pagination logic
- **Files modified:** packages/admin/src/pages/wallets.tsx
- **Verification:** Tests pass with corrected field names
- **Committed in:** 16b0d98e

**2. [Rule 1 - Bug] Fixed ExternalActionItem field name**
- **Found during:** Task 1 (wallets.tsx migration)
- **Issue:** Code used `actionProvider` but generated type has `provider`
- **Fix:** Updated all references from `actionProvider` to `provider`
- **Files modified:** packages/admin/src/pages/wallets.tsx
- **Committed in:** 16b0d98e

**3. [Rule 1 - Bug] Fixed NftMetadata field names**
- **Found during:** Task 1 (wallets.tsx migration)
- **Issue:** Code used `traitType` and `metadata` but generated type has `trait_type` and `rawMetadata`
- **Fix:** Updated attribute display and raw metadata access
- **Files modified:** packages/admin/src/pages/wallets.tsx
- **Committed in:** 16b0d98e

**4. [Rule 1 - Bug] Fixed networkToChain return type**
- **Found during:** Task 1 (wallets.tsx migration)
- **Issue:** Returned `'evm'` but TestRpcRequest enum expects `'solana' | 'ethereum'`
- **Fix:** Changed return type and value from `'evm'` to `'ethereum'`
- **Files modified:** packages/admin/src/pages/wallets.tsx
- **Committed in:** 16b0d98e

---

**Total deviations:** 4 auto-fixed (4 Rule 1 bugs)
**Impact on plan:** All auto-fixes are correctness improvements caught by type enforcement. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 414 complete: all 3 plans executed
- Admin UI pages fully migrated to typed client
- Remaining components (hyperliquid data tables, polymarket data tables, currency-select) still use old client -- these are lower-priority and can be addressed in future phases
- SettingsData type remains manual (TODO Phase 415 -- requires named Zod schema for settings response)

---
*Phase: 414-interface-migration*
*Completed: 2026-03-15*
