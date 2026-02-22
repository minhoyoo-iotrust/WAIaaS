---
phase: 241-token-registry-notification-log
verified: 2026-02-23T00:22:45Z
status: gaps_found
score: 5/6 must-haves verified
re_verification: false
gaps:
  - truth: "Operator can add a custom token by entering contract address and having symbol/name/decimals auto-fetched from on-chain metadata"
    status: failed
    reason: "TOKR-02 and ROADMAP success criterion #2 both require on-chain metadata auto-fetch when a contract address is entered. The tokens.tsx form requires manual entry of ALL fields (symbol, name, decimals). No auto-fetch logic exists in the UI or daemon API."
    artifacts:
      - path: "packages/admin/src/pages/tokens.tsx"
        issue: "Add Token form has 4 manual input fields with no auto-fetch on address input. No debounced fetch, no resolveToken call, no metadata population."
      - path: "packages/daemon/src/api/routes/tokens.ts"
        issue: "POST /v1/tokens accepts all fields in body — there is no /v1/tokens/resolve or equivalent endpoint for on-chain metadata lookup."
    missing:
      - "Auto-fetch trigger: onInput on Contract Address field should call a metadata resolution endpoint after debounce"
      - "Daemon endpoint: GET /v1/tokens/resolve?network=&address= (or equivalent) that reads symbol/name/decimals from chain via viem readContract"
      - "UI: Auto-populate Symbol, Name, Decimals inputs from fetched metadata (user can override before submit)"
human_verification:
  - test: "Navigate to Admin UI #/tokens, select a network, click Add Token, enter a known EVM contract address (e.g. 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 USDC on ethereum-mainnet)"
    expected: "Symbol, Name, and Decimals fields should auto-populate from on-chain data after address entry"
    why_human: "Requires actual browser + running daemon connected to a live RPC node to observe the auto-fetch behavior"
---

# Phase 241: Token Registry + Notification Log Verification Report

**Phase Goal:** 운영자가 Admin UI에서 네트워크별 토큰을 조회/추가/삭제할 수 있고, 알림 로그를 이벤트/채널/상태/날짜로 필터링하여 특정 이벤트를 추적할 수 있다
**Verified:** 2026-02-23T00:22:45Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | /tokens page shows builtin + custom tokens with network filter (symbol/name/address/decimals/source badge) | VERIFIED | tokens.tsx: 10-network select, EVM_NETWORKS constant, table with COLUMNS = ['Symbol', 'Name', 'Address', 'Decimals', 'Source', 'Actions'], Badge variant per source |
| 2 | On-chain metadata auto-fetched when contract address entered; confirmed then registered | FAILED | tokens.tsx form has 4 manual inputs with no address-triggered fetch. POST /v1/tokens takes all fields in body. No resolve endpoint exists. |
| 3 | Custom tokens deletable; builtin tokens show non-delete indicator | VERIFIED | tokens.tsx: `token.source === 'custom'` guard on Delete button; builtin rows show `'\u2014'` |
| 4 | Notification log filterable by event type/channel/status/date range; Wallet ID navigates to wallet detail | VERIFIED | FilterBar with 5 fields wired to fetchLogs; walletId renders as `<a href="#/wallets/${id}" class="wallet-link">` |

**Score:** 3/4 ROADMAP truths verified (Success Criterion #2 failed)

### Plan Must-Have Truths

#### Plan 241-01 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin /tokens page shows builtin + custom tokens for selected EVM network with symbol, name, address, decimals, and source badge | VERIFIED | tokens.tsx line 44: COLUMNS array; table renders all fields with Badge |
| 2 | Operator can add a custom token by entering network + contract address + symbol + name + decimals and submitting | VERIFIED (partial) | Form exists with 4 fields and Submit. Manual entry works. But TOKR-02 requires auto-fetch (see gap). |
| 3 | Custom tokens show delete button; builtin tokens show 'Built-in' badge with no delete | VERIFIED | Lines 305-314: conditional render based on `token.source === 'custom'` |
| 4 | Network filter dropdown lists all 10 EVM networks and changing it reloads token list | VERIFIED | EVM_NETWORKS constant (10 entries), useEffect on network.value calls fetchTokens() |

#### Plan 241-02 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Notification log filtered by event type, channel, status, date range (since/until) | VERIFIED | fetchLogs builds URLSearchParams with eventType/channel/status/since/until from filters signal |
| 2 | Wallet ID in notification log rows navigates to wallet detail page | VERIFIED | logColumns walletId render: `<a href="#/wallets/${entry.walletId}" class="wallet-link">` |
| 3 | Notification log API supports eventType and date range (since/until) query params | VERIFIED | admin.ts notificationLogQuerySchema lines 258-260: eventType/since/until optional fields; handler lines 1224-1237: eq/gte/lte conditions |

**Plan Score:** 6/7 plan truths verified (TOKR-02 on-chain auto-fetch gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/admin/src/pages/tokens.tsx` | Token registry page with list, add form, delete, network filter | VERIFIED | 326 lines; full CRUD UI present; wired to apiGet/apiPost/apiDelete |
| `packages/admin/src/__tests__/tokens.test.tsx` | Tests for token registry page (min 50 lines) | VERIFIED | 297 lines; 10 tests; all pass |
| `packages/admin/src/components/layout.tsx` | Updated route + sidebar nav containing "TokensPage" | VERIFIED | Line 10: `import TokensPage`; line 29: `'/tokens': 'Token Registry'`; line 72: route handler; line 62: NAV_ITEMS entry |
| `packages/admin/src/api/endpoints.ts` | TOKENS endpoint exists | VERIFIED | Line 14: `TOKENS: '/v1/tokens'` |
| `packages/daemon/src/api/routes/admin.ts` | Extended notification log schema with eventType, since, until | VERIFIED | Lines 258-260: eventType/since/until in notificationLogQuerySchema; lines 1224-1237: filter conditions using gte/lte |
| `packages/admin/src/pages/notifications.tsx` | FilterBar integration + clickable wallet ID links | VERIFIED | Line 7: FilterBar import; lines 467-473: filters signal; lines 732-737: FilterBar JSX; lines 603-614: wallet-link render |
| `packages/admin/src/__tests__/notifications-filters.test.tsx` | Tests for notification log filters and wallet link (min 40 lines) | VERIFIED | 310 lines; 8 tests; all pass |

### Key Link Verification

#### Plan 241-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| tokens.tsx | /v1/tokens?network= | apiGet for listing | VERIFIED | Line 82: `apiGet<TokensResponse>(\`${API.TOKENS}?network=${encodeURIComponent(network.value)}\`)` |
| tokens.tsx | /v1/tokens | apiPost for add | VERIFIED | Line 126: `apiPost(API.TOKENS, { network, address, symbol, name, decimals })` |
| tokens.tsx | /v1/tokens | apiDelete for remove | VERIFIED | Line 150: `apiDelete(API.TOKENS, { network: network.value, address: tokenAddress })` |
| layout.tsx | tokens.tsx | route registration | VERIFIED | Line 72: `if (path === '/tokens') return <TokensPage />;` |

#### Plan 241-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| notifications.tsx | /v1/admin/notifications/log | apiGet with filter params | VERIFIED | Lines 494-509: URLSearchParams built with eventType/channel/status/since/until; apiGet call |
| notifications.tsx | #/wallets/{walletId} | clickable wallet ID link | VERIFIED | Line 606: `href={\`#/wallets/${entry.walletId}\`}` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TOKR-01 | 241-01 | /tokens 페이지에서 네트워크 필터로 빌트인 + 커스텀 토큰 목록을 조회할 수 있다 | SATISFIED | Network select + apiGet + token table rendering verified |
| TOKR-02 | 241-01 | 컨트랙트 주소 입력 시 온체인 메타데이터 자동 조회 후 커스텀 토큰을 추가할 수 있다 | BLOCKED | Form exists but NO auto-fetch. All fields are manual. No resolve endpoint. |
| TOKR-03 | 241-01 | 커스텀 토큰만 삭제 가능하며 빌트인 토큰은 삭제 불가 표시된다 | SATISFIED | source-conditional Delete button; builtin shows em-dash |
| TOKR-04 | 241-01 | 토큰 테이블이 심볼, 이름, 주소, decimals, source 배지를 표시한다 | SATISFIED | All 5 columns present with Badge component for source |
| NLOG-01 | 241-02 | 알림 로그를 이벤트 타입, 채널, 상태, 날짜 범위로 필터링할 수 있다 | SATISFIED | FilterBar 5 fields wired to fetchLogs with URLSearchParams; API extended |
| NLOG-02 | 241-02 | 알림 로그의 Wallet ID 클릭 시 지갑 상세 페이지로 이동한다 | SATISFIED | wallet-link anchor with #/wallets/{id} href, stopPropagation on click |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | No TODO/FIXME/placeholder/stub patterns detected in key files |

### Test Results

| Test File | Tests | Result |
|-----------|-------|--------|
| `packages/admin/src/__tests__/tokens.test.tsx` | 10 | ALL PASS |
| `packages/admin/src/__tests__/notifications-filters.test.tsx` | 8 | ALL PASS |

### Human Verification Required

#### 1. On-Chain Metadata Auto-Fetch (TOKR-02)

**Test:** Navigate to Admin UI #/tokens, select ethereum-mainnet, click "Add Token", enter a known EVM contract address (e.g., `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` for USDC).
**Expected:** Symbol ("USDC"), Name ("USD Coin"), and Decimals (6) fields should auto-populate from on-chain data.
**Why human:** Requires live browser + running daemon + live RPC node connection. Cannot verify auto-fetch behavior programmatically with grep alone.
**Verdict:** This will FAIL — the feature is not implemented in code. No debounce handler, no resolve endpoint.

### Gaps Summary

**Root cause:** TOKR-02 requires on-chain metadata auto-fetch when a contract address is entered into the Add Token form. This feature was NOT implemented:

1. The daemon has no metadata resolution endpoint (no `GET /v1/tokens/resolve`, no `readContract` call for ERC-20 symbol/name/decimals).
2. The tokens.tsx form has no address input handler that triggers a fetch — all 4 fields (address, symbol, name, decimals) are plain manual inputs.
3. The 241-01-PLAN.md's must_have truth for TOKR-02 was silently downscoped to "manual entry form" without flagging that the REQUIREMENTS.md and ROADMAP success criteria explicitly require auto-fetch.

**What was delivered:** A fully functional manual-entry token CRUD page that satisfies TOKR-01, TOKR-03, TOKR-04. The auto-fetch aspect of TOKR-02 is missing.

**Remaining work to close TOKR-02:**
- Add daemon endpoint: `GET /v1/tokens/resolve?network=&address=` that uses viem `readContract` to fetch ERC-20 `symbol()`, `name()`, `decimals()`.
- Add UI: debounced address input handler in tokens.tsx that calls the resolve endpoint and auto-populates the other fields (user can override before submit).

---

_Verified: 2026-02-23T00:22:45Z_
_Verifier: Claude (gsd-verifier)_
