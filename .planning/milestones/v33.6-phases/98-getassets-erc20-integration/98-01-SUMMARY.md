---
phase: 98-getassets-erc20-integration
plan: 01
subsystem: api
tags: [evm, erc20, getAssets, setAllowedTokens, token-registry, vitest]

# Dependency graph
requires:
  - phase: 97-evm-token-registry
    provides: "TokenRegistryService, tokenRegistry DB table, getAdapterTokenList()"
provides:
  - "EVM getAssets() wired to return ERC-20 token balances from registry + ALLOWED_TOKENS union"
  - "TokenRegistryService shared instance between walletRoutes and tokenRegistryRoutes"
  - "4 integration tests proving getAssets ERC-20 wiring"
affects: [mcp-dx, admin-ui-tokens]

# Tech tracking
tech-stack:
  added: []
  patterns: ["duck-typing 'setAllowedTokens' in adapter for EVM detection", "case-insensitive address dedup with Set<lowercase>"]

key-files:
  created: []
  modified:
    - packages/daemon/src/api/routes/wallet.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/__tests__/token-registry.test.ts

key-decisions:
  - "Duck-typing ('setAllowedTokens' in adapter) to detect EVM adapter avoids importing EvmAdapter into daemon"
  - "Registry tokens take priority over ALLOWED_TOKENS policy tokens (registry has symbol/name/decimals)"
  - "Shared TokenRegistryService instance between walletRoutes and tokenRegistryRoutes in server.ts"

patterns-established:
  - "EVM token wiring pattern: resolve adapter -> wire tokens -> call getAssets"
  - "Address dedup pattern: Set<lowercase> for case-insensitive ERC-20 address comparison"

# Metrics
duration: 4min
completed: 2026-02-13
---

# Phase 98 Plan 01: getAssets ERC-20 Integration Summary

**EVM getAssets() wired to return ERC-20 token balances from token registry + ALLOWED_TOKENS policy union with case-insensitive dedup**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-13T12:57:01Z
- **Completed:** 2026-02-13T13:01:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- BUG-014 fixed: EVM wallets now return ERC-20 token balances from getAssets() endpoint
- Token list merges registry tokens (builtin + custom) with ALLOWED_TOKENS policy tokens, deduplicated by address
- 4 new integration tests prove wiring: registry tokens, policy tokens, deduplication, empty state
- Solana path unaffected (duck-typing guard)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire token registry + ALLOWED_TOKENS into wallet route getAssets** - `37d44a3` (feat)
2. **Task 2: Add integration tests for getAssets ERC-20 wiring** - `9ebe9c3` (test)

## Files Created/Modified
- `packages/daemon/src/api/routes/wallet.ts` - Added ERC-20 token wiring before getAssets() for EVM adapters
- `packages/daemon/src/api/server.ts` - Shared TokenRegistryService instance, injected into walletRoutes deps
- `packages/daemon/src/__tests__/token-registry.test.ts` - 4 new integration tests for getAssets ERC-20 wiring (Suite 3)

## Decisions Made
- Duck-typing (`'setAllowedTokens' in adapter`) to detect EVM adapter -- avoids importing EvmAdapter directly into daemon package
- Registry tokens come first (have full metadata), ALLOWED_TOKENS policy tokens fill in gaps (may only have address)
- Case-insensitive address dedup using `Set<string>` of lowercased addresses

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- getAssets ERC-20 wiring complete, BUG-014 resolved
- Ready for MCP DX improvements or further EVM feature work
- Pre-existing TS error in stages.ts (unrelated) remains

## Self-Check: PASSED

- All 3 modified files exist on disk
- Commits 37d44a3 and 9ebe9c3 verified in git log
- setAllowedTokens pattern found in wallet.ts (2 occurrences)
- tokenRegistryService pattern found in server.ts (4 occurrences)
- 21 tests pass in token-registry.test.ts, 703 tests pass in daemon suite

---
*Phase: 98-getassets-erc20-integration*
*Completed: 2026-02-13*
