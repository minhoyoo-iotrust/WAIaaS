# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 243 -- Wallet List + Wallet Detail

## Current Position

Milestone: v27.4 Admin UI UX 개선
Phase: 5 of 5 (Phase 243: Wallet List + Wallet Detail) -- COMPLETE
Plan: 2 of 2 in current phase
Status: Phase 243 complete -- all plans done
Last activity: 2026-02-23 -- Completed 243-02 (Wallet Detail 4-Tab Layout)

Progress: [##########] 100%

## Performance Metrics

**Cumulative:** 54 milestones, 238 phases, 512 plans, 1,389 reqs, 4,396+ tests, ~158,416 LOC TS

**v27.3 Velocity:**
- Total plans completed: 7/7
- Average duration: 3.6min
- Total execution time: 0.40 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 235 | 1/1 | 3min | 3min |
| 236 | 3/3 | 13min | 4.3min |
| 237 | 2/2 | 5min | 2.5min |
| 238 | 1/1 | 3min | 3min |
| 239 | 2/2 | -- | -- |
| 240 | 2/2 | 10min | 5min |
| 241 | 2/2 | 6min | 3min |
| 242 | 1/1 | 6min | 6min |
| 243 | 2/2 | 12min | 6min |

## Accumulated Context

### Decisions

- m27-04: 크로스 지갑 admin API 2개 신규 (GET /v1/admin/transactions + GET /v1/admin/incoming)
- m27-04: 필터 상태 URL query params 동기화 (공유/북마크 가능)
- m27-04: 지갑 상세 4탭 구조 (Overview/Transactions/Owner/MCP)
- m27-04: offset/limit 서버사이드 페이지네이션
- 239-01: Inlined EXPLORER_MAP in admin SPA (cannot import @waiaas/core from frontend)
- 239-01: FilterBar URL sync uses hash query params with replaceState
- 239-02: offset/limit pagination for admin cross-wallet endpoints (not cursor)
- 239-02: No default status filter on GET /admin/incoming (admin sees all statuses)
- 239-02: LEFT JOIN wallets for walletName in both cross-wallet endpoints
- 240-01: Custom table instead of Table component for row expansion support
- 240-01: Wallet filter populated dynamically from GET /v1/wallets on mount
- 240-01: 13 network options in filter dropdown matching EXPLORER_MAP networks
- 240-02: Approval count fetched via separate lightweight API call (limit=1+total) not client-side computation
- 240-02: Network column before Status, Tx Hash column after Status in Recent Activity table
- 241-01: apiDelete extended with optional body parameter for DELETE /v1/tokens JSON body requirement
- 241-01: Inlined EVM_NETWORKS constant (10 networks) in tokens.tsx, matching pattern from transactions.tsx
- 241-02: syncUrl=false for notification log FilterBar (tab-routed page uses hash for tab state)
- 241-02: Date filters convert YYYY-MM-DD to Unix seconds (start-of-day for since, end-of-day for until)
- 242-01: Collapsible settings panel (default expanded) in /incoming page
- 242-01: apiPatch helper added for PATCH mutations
- 242-01: monitorIncoming added to WalletCrudResponseSchema
- 242-01: syncUrl=false for /incoming FilterBar (standalone page, no tab routing)
- 243-01: walletColumns moved inside WalletListContent to reference balances signal
- 243-01: syncUrl=false for wallet list FilterBar (tab-routed page uses hash for tab state)
- 243-01: Balance fetch capped at first 50 wallets (BALANCE_FETCH_LIMIT)
- 243-01: No USD in balance column (balance API lacks amountUsd)
- 243-02: 4-tab layout uses local function components via closure for WalletDetailView
- 243-02: Per-wallet transactions endpoint extended with offset query param
- 243-02: USD value added to balance API via price oracle getNativePrice per chain
- 243-02: Transaction filters (status/type) applied client-side on paginated data
- 243-02: Custom table for wallet transactions matching cross-wallet pattern

### Blockers/Concerns

- STO-03: Confirmation Worker RPC 콜백 미주입 (v27.1 known gap, unrelated to v27.4)

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 243-02-PLAN.md -- Phase 243 complete, milestone v27.4 complete
Resume file: None
