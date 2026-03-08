---
phase: 348-hyperliquid-dex-design
plan: 02
subsystem: design
tags: [hyperliquid, sub-account, policy, mcp, sdk, admin-ui, database, schema]

requires:
  - phase: 348-hyperliquid-dex-design
    provides: HDESIGN-01/02/03 core architecture design
provides:
  - "Sub-account-to-wallet mapping model (1 wallet = 1 master + N sub-accounts)"
  - "Policy engine evaluation criteria for 10 Hyperliquid action types"
  - "22 MCP tools with phase allocation (13 Perp, 5 Spot, 4 Sub-account)"
  - "22 SDK methods with TypeScript signatures"
  - "9 Admin Settings keys with config.toml vs Admin Settings boundary"
  - "Admin UI 5-tab structure design"
  - "connect-info hyperliquid capability"
  - "DB v51 hyperliquid_orders schema"
  - "DB v52 hyperliquid_sub_accounts schema"
affects: [349-core-infra-perp, 350-spot-trading, 351-sub-account]

tech-stack:
  added: []
  patterns: [sub-account-wallet-mapping, margin-based-policy-evaluation, wallet-level-spending-scope]

key-files:
  modified:
    - internal/objectives/m31-04-hyperliquid-ecosystem.md

key-decisions:
  - "Sub-accounts are metadata in hyperliquid_sub_accounts table, not separate WAIaaS wallets"
  - "Policy evaluates Perp on margin (not notional) to avoid leverage over-estimation"
  - "Close/sell/cancel actions are policy-exempt ($0 spending)"
  - "SPENDING_LIMIT aggregates master + all sub-accounts (wallet-level scope)"
  - "DB v51 for orders (Phase 349), v52 for sub-accounts (Phase 351)"
  - "Admin UI uses on-demand Info API fetch, not DB storage for live data"
  - "Query tools bypass pipeline (direct MarketData.info() call)"

patterns-established:
  - "Margin-based policy: Perp spending = size * price / leverage"
  - "Risk exemption: Close/sell/cancel actions have $0 policy evaluation"
  - "Wallet-level aggregation: sub-account spending counts toward master wallet limit"

requirements-completed: [HDESIGN-04, HDESIGN-05, HDESIGN-06, HDESIGN-07]

duration: 2min
completed: 2026-03-08
---

# Phase 348 Plan 02: Sub-account Mapping + Policy + Interface + DB Schema Design Summary

**Sub-account-to-wallet mapping model, margin-based policy evaluation for 10 action types, 22 MCP/SDK interfaces, and DB v51/v52 schema design**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-08T03:32:00Z
- **Completed:** 2026-03-08T03:34:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- HDESIGN-04: 1 wallet = 1 master + N sub-accounts mapping model with vaultAddress propagation
- HDESIGN-07: Policy evaluation criteria (margin vs notional vs exempt) for 10 actions with getSpendingAmount code
- HDESIGN-05: 22 MCP tools + 22 SDK methods + 9 Admin Settings + 5-tab Admin UI + connect-info capability
- HDESIGN-06: DB v51 hyperliquid_orders (21 columns, 5 indexes) + v52 hyperliquid_sub_accounts (UNIQUE constraint)

## Task Commits

1. **Task 1: HDESIGN-04 Sub-account + HDESIGN-07 Policy** - `e3558c0c` (docs)
2. **Task 2: HDESIGN-05 Interfaces + HDESIGN-06 DB schema** - `e220e146` (docs)

## Files Created/Modified
- `internal/objectives/m31-04-hyperliquid-ecosystem.md` - Added HDESIGN-04/05/06/07 design sections

## Decisions Made
- Sub-accounts stored as metadata rows, not separate WAIaaS wallets (no private key needed)
- Perp policy uses margin (size*price/leverage) not notional to avoid leverage over-count
- Close/sell/cancel actions are spending-exempt ($0 evaluation)
- Wallet-level spending scope: master + all sub-accounts combined
- Query tools (hl_get_*) bypass pipeline for direct MarketData read-only access
- Admin UI fetches live data from Info API (on-demand, not stored in DB)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 7 HDESIGN requirements (01-07) fully satisfied
- Phase 348 design document complete -- no design ambiguity for implementation phases
- Ready for Phase 349 (Core Infrastructure + Perp Trading)

---
*Phase: 348-hyperliquid-dex-design*
*Completed: 2026-03-08*
