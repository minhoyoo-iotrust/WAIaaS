---
phase: 351-sub-account
plan: 02
subsystem: defi
tags: [hyperliquid, sub-account, rest-api, mcp, sdk, admin-ui, skill]

requires:
  - phase: 351-sub-account
    plan: 01
    provides: SubAccountService, DB v52, schemas
provides:
  - HyperliquidSubAccountProvider (IActionProvider wrapper, 2 actions)
  - REST GET endpoints for sub-account queries (list, positions)
  - MCP 2 query tools + 2 action tools (auto-registered via mcpExpose)
  - SDK 4 methods (hlCreateSubAccount, hlSubTransfer, hlListSubAccounts, hlGetSubPositions)
  - Admin UI Sub-accounts tab (SubAccountList + SubAccountDetail)
  - connect-info subAccounts capability
affects: [transactions.skill.md, actions.tsx BUILTIN_PROVIDERS]

tech-stack:
  added: []
  patterns: [IActionProvider thin wrapper for service classes, ApiDirectResult for off-chain exchange ops]

key-files:
  created:
    - packages/actions/src/providers/hyperliquid/sub-account-provider.ts
    - packages/admin/src/components/hyperliquid/SubAccountList.tsx
    - packages/admin/src/components/hyperliquid/SubAccountDetail.tsx
  modified:
    - packages/actions/src/index.ts
    - packages/daemon/src/api/routes/hyperliquid.ts
    - packages/mcp/src/tools/hyperliquid.ts
    - packages/sdk/src/client.ts
    - packages/daemon/src/api/routes/connect-info.ts
    - packages/admin/src/pages/hyperliquid.tsx
    - packages/admin/src/pages/actions.tsx
    - skills/transactions.skill.md

key-decisions:
  - "HyperliquidSpotProvider co-registered alongside Perp in shared factory (was exported but never registered -- Rule 1 bug fix)"
  - "SubAccountProvider registered in same hyperliquid_perp factory closure to share ExchangeClient/MarketData/RateLimiter"
  - "Create/transfer use pipeline (IActionProvider) for policy enforcement; list/positions are REST GET queries"

patterns-established:
  - "Thin IActionProvider wrapper pattern: service class holds logic, provider wraps for pipeline policy"
  - "Co-registration of related providers in shared factory function to avoid duplicate client instances"

requirements-completed: [HSUB-01, HSUB-02, HSUB-03, HSUB-04]

duration: 8min
completed: 2026-03-08
---

# Phase 351 Plan 02: Sub-account REST/MCP/SDK/Admin UI Summary

**HyperliquidSubAccountProvider IActionProvider wrapper with REST query endpoints, MCP 4 tools, SDK 4 methods, Admin UI Sub-accounts tab, and connect-info update**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-08T05:18:00Z
- **Completed:** 2026-03-08T05:26:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- HyperliquidSubAccountProvider (IActionProvider) with 2 actions: hl_create_sub_account (medium/DELAY/$0), hl_sub_transfer (medium/DELAY/amount)
- REST GET endpoints: /v1/wallets/:walletId/hyperliquid/sub-accounts, /v1/wallets/:walletId/hyperliquid/sub-accounts/:subAddress/positions
- MCP 2 query tools (waiaas_hl_list_sub_accounts, waiaas_hl_get_sub_positions) + 2 action tools auto-registered via mcpExpose=true
- SDK 4 methods: hlCreateSubAccount, hlSubTransfer, hlListSubAccounts, hlGetSubPositions
- Admin UI Sub-accounts tab with SubAccountList (clickable rows, 10s refresh) and SubAccountDetail (positions table, 10s refresh)
- connect-info hyperliquid.subAccounts capability
- HyperliquidSpotProvider bug fix -- was exported but never registered in registerBuiltInProviders

## Task Commits

1. **Task 1: SubAccountProvider + REST/MCP/SDK + connect-info** - `c9cfff70` (feat)
2. **Task 2: Admin UI Sub-accounts tab + skill file** - `499996d4` (feat)

## Files Created/Modified
- `packages/actions/src/providers/hyperliquid/sub-account-provider.ts` - IActionProvider wrapper with 2 actions
- `packages/actions/src/index.ts` - Co-registered SpotProvider + SubAccountProvider in perp factory
- `packages/daemon/src/api/routes/hyperliquid.ts` - Added 2 GET query endpoints for sub-accounts
- `packages/mcp/src/tools/hyperliquid.ts` - Added 2 query tools (list, positions)
- `packages/sdk/src/client.ts` - Added 4 SDK methods
- `packages/daemon/src/api/routes/connect-info.ts` - Added subAccounts to hyperliquid capability
- `packages/admin/src/components/hyperliquid/SubAccountList.tsx` - Sub-account list with auto-refresh
- `packages/admin/src/components/hyperliquid/SubAccountDetail.tsx` - Sub-account position detail
- `packages/admin/src/pages/hyperliquid.tsx` - Added 'subaccounts' tab with list + detail
- `packages/admin/src/pages/actions.tsx` - Added hyperliquid_sub to BUILTIN_PROVIDERS
- `skills/transactions.skill.md` - Added Sub-account management section with examples

## Decisions Made
- HyperliquidSpotProvider was exported from @waiaas/actions but never registered in registerBuiltInProviders. Co-registered it alongside Perp in the shared factory to fix the bug (Rule 1 auto-fix).
- SubAccountProvider co-registered in same factory closure to share ExchangeClient/MarketData/RateLimiter instances, avoiding duplicate API connections.
- Create/transfer operations routed through IActionProvider pipeline for policy enforcement; list/positions are read-only REST GET queries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] HyperliquidSpotProvider never registered**
- **Found during:** Task 1
- **Issue:** HyperliquidSpotProvider was exported from @waiaas/actions but never called in registerBuiltInProviders, making SDK calls to executeAction('hyperliquid_spot', ...) fail at runtime
- **Fix:** Co-registered SpotProvider inside the hyperliquid_perp factory function alongside PerpProvider and the new SubAccountProvider, sharing ExchangeClient/MarketData/RateLimiter instances
- **Files modified:** packages/actions/src/index.ts
- **Commit:** c9cfff70

## Issues Encountered
None beyond the auto-fixed bug above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 351 is the FINAL phase of milestone v31.4 (Hyperliquid ecosystem integration)
- All 5 phases complete: 347 (design), 348 (design), 349 (core infra + perp), 350 (spot), 351 (sub-accounts)
- Milestone ready for PR to main

## Self-Check: PASSED

All 8 created/modified files verified. All 4 task commits (1f350618, 02b4e2e1, c9cfff70, 499996d4) confirmed in git history.

---
*Phase: 351-sub-account*
*Completed: 2026-03-08*
