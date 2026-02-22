---
phase: 243-wallet-list-wallet-detail
verified: 2026-02-22T16:08:14Z
status: gaps_found
score: 6/7 must-haves verified
re_verification: false
gaps:
  - truth: "Wallet list shows native token balance and USD value for each wallet's default network"
    status: failed
    reason: "The wallet list Balance column stores only { balance, symbol } — discards .usd from the API response. USD value is never rendered in the list column. WLST-03 explicitly requires 'native token balance + USD value'."
    artifacts:
      - path: "packages/admin/src/pages/wallets.tsx"
        issue: "fetchBalances (line 1795) stores only balance+symbol, not usd. The render at line 1858-1861 shows '{bal.balance} {bal.symbol}' with no USD."
    missing:
      - "Store usd field in balances signal: results[w.id] = { balance, symbol, usd: defaultNet.native.usd ?? null }"
      - "Render USD in the Balance column when usd is not null, using formatWithDisplay"
      - "Add displayCurrency/displayRate signals and fetchDisplayCurrency call to WalletListContent"
  - truth: "No type errors in wallets.tsx"
    status: failed
    reason: "Badge component at line 739 receives an unsupported 'style' prop. BadgeProps does not accept style. TypeScript error: TS2322."
    artifacts:
      - path: "packages/admin/src/pages/wallets.tsx"
        issue: "Line 739: <Badge variant=\"success\" style={{ marginLeft: 'var(--space-2)' }}>Default</Badge> — Badge does not accept style prop"
    missing:
      - "Remove style prop from Badge or wrap in a <span style={...}><Badge>Default</Badge></span>"
human_verification:
  - test: "Wallet list balance column shows USD value"
    expected: "Each wallet row shows e.g. '1.5 SOL ($750.00)' in the Balance column when price oracle is configured"
    why_human: "USD display requires a running price oracle — cannot verify programmatically in test environment"
  - test: "Wallet detail Transactions tab ExplorerLink opens correct URL"
    expected: "Clicking a txHash link opens the correct blockchain explorer URL in a new tab"
    why_human: "Browser interaction and network-specific URL correctness requires manual verification"
---

# Phase 243: Wallet List + Wallet Detail Verification Report

**Phase Goal:** 운영자가 지갑 목록에서 검색/필터/잔액으로 원하는 지갑을 빠르게 찾고, 지갑 상세의 4탭 구조에서 트랜잭션/소유자/MCP 정보를 효율적으로 탐색할 수 있다
**Verified:** 2026-02-22T16:08:14Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Wallet list can be filtered in real-time by name or publicKey text search | VERIFIED | SearchInput imported (line 20), `search` signal, `filteredWallets` computed applies `name.toLowerCase().includes(q)` and `publicKey.toLowerCase().includes(q)` (line 1816-1820). Table uses `filteredWallets.value` (line 2033). |
| 2 | Wallet list can be filtered by chain, environment, and status dropdowns | VERIFIED | `WALLET_FILTER_FIELDS` with chain/environment/status (line 1730-1759), FilterBar rendered with `syncUrl={false}` (line 2019-2024), applied in `filteredWallets` computed (line 1822-1825). |
| 3 | Wallet list shows native token balance and USD value for each wallet's default network | FAILED | Balance column shows native token (e.g. "1.5 SOL") but USD is missing. `fetchBalances` discards `.usd` from the API response; `balances` signal stores only `{balance, symbol}`. No `formatWithDisplay` call in the list column. WLST-03 requires both. |
| 4 | Wallet detail page has Overview/Transactions/Owner/MCP tab navigation and renders correct content per tab | VERIFIED | `DETAIL_TABS` (line 232-237), `TabNav` wired at line 1127, `OverviewTab`/`TransactionsTab`/`OwnerTab`/`McpTab` as local closure functions (lines 635, 763, 844, 1019). All 4 tabs rendering verified by 22 passing tests. |
| 5 | Transactions tab supports server-side pagination with Previous/Next controls | VERIFIED | `txPage`, `txTotal`, `TX_PAGE_SIZE=20`, `offset = txPage * TX_PAGE_SIZE` passed in query string (line 436). Previous/Next Buttons with `txHasPrev`/`txHasNext` guards (line 819-836). Route handler at admin.ts line 1570 accepts and uses offset. |
| 6 | Transactions tab shows txHash as ExplorerLink and has status/type filter dropdowns | VERIFIED | `ExplorerLink` imported (line 23) and used at line 805 with `network` and `txHash`. `TX_FILTER_FIELDS` with status/type (line 257-260), FilterBar rendered in TransactionsTab (line 766). |
| 7 | Balance section shows USD value next to native balance using display currency | VERIFIED | `formatWithDisplay(nb.native.usd, displayCurrency.value, displayRate.value)` at line 703, guarded by `nb.native.usd != null`. `fetchDisplayCurrency()` called on mount (line 606). |
| 8 | Balance section has a manual Refresh button that re-fetches balances | VERIFIED | `Button` with `onClick={fetchBalance}` and `loading={balanceLoading.value}` in OverviewTab (line 670-672). Test confirms re-fetch occurs. |

**Score:** 6/8 truths verified (Truth 3 FAILED, implicit truth about type correctness FAILED)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/admin/src/pages/wallets.tsx` | WalletListContent with SearchInput, FilterBar, balance+USD column | PARTIAL | SearchInput and FilterBar present and wired. Balance column present but missing USD. Also has TS type error (line 739). |
| `packages/admin/src/__tests__/wallets.test.tsx` | Tests for search, filter, balance display, 4-tab structure, pagination, ExplorerLink, USD, refresh | VERIFIED | 22 tests pass including all 7 new wallet detail tests and 5 new list tests. |
| `packages/daemon/src/api/routes/admin.ts` | Offset param in per-wallet transactions + usd field in balance API | VERIFIED | `offset` in `adminWalletTransactionsRoute` query schema (line 484) and used in handler (line 1570, 1585). `nativeUsd` via `priceOracle.getNativePrice` (line 1649-1655), included in response (line 1669). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| wallets.tsx | ../components/search-input | import SearchInput | WIRED | Line 20: import; line 2025: rendered with `value` and `onSearch` props |
| wallets.tsx | ../components/filter-bar | import FilterBar | WIRED | Line 21: import; lines 766, 2019: rendered with `fields`, `values`, `onChange`, `syncUrl=false` |
| wallets.tsx | ../utils/display-currency | import fetchDisplayCurrency, formatWithDisplay | WIRED (detail only) | Line 24: import; line 606: `fetchDisplayCurrency()` on mount; line 703: `formatWithDisplay(...)` in OverviewTab. NOT used in WalletListContent balance column. |
| wallets.tsx | ../components/tab-nav | import TabNav | WIRED | Line 18: import; line 1127: `<TabNav tabs={DETAIL_TABS} ...>` and line 2070: `<TabNav tabs={WALLETS_TABS} ...>` |
| wallets.tsx | ../components/explorer-link | import ExplorerLink | WIRED | Line 23: import; line 805: `<ExplorerLink network={tx.network ?? ''} txHash={tx.txHash} />` |
| wallets.tsx | ../components/filter-bar (tx) | FilterBar with txFilters | WIRED | Line 766-770: FilterBar in TransactionsTab with `TX_FILTER_FIELDS` and `txFilters.value` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| WLST-01 | 243-01 | 지갑 이름 또는 공개키로 실시간 검색 필터링할 수 있다 | SATISFIED | SearchInput + filteredWallets computed using name/publicKey includes check |
| WLST-02 | 243-01 | 체인/환경/상태로 지갑 목록을 필터링할 수 있다 | SATISFIED | FilterBar with chain/environment/status, applied client-side in filteredWallets |
| WLST-03 | 243-01 | 지갑 목록에 기본 네트워크 네이티브 토큰 잔액 + USD 가치가 표시된다 | BLOCKED | Native balance shown. USD is NOT shown in the list column. API returns `usd` field but fetchBalances discards it. |
| WDET-01 | 243-02 | 지갑 상세 페이지가 Overview/Transactions/Owner/MCP 4탭 구조로 변경된다 | SATISFIED | DETAIL_TABS + TabNav + 4 local tab components |
| WDET-02 | 243-02 | Transactions 탭이 페이지네이션, txHash 익스플로러 링크, 상태/타입 필터를 지원한다 | SATISFIED | Offset/limit pagination, ExplorerLink, FilterBar with TX_FILTER_FIELDS |
| WDET-03 | 243-02 | 각 네트워크 잔액 옆에 USD 환산 가치가 표시된다 | SATISFIED | formatWithDisplay in OverviewTab when usd != null, priceOracle in balance API |
| WDET-04 | 243-02 | 잔액 섹션에 수동 새로고침 버튼이 있다 | SATISFIED | Refresh Button calling fetchBalance() confirmed by test |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/admin/src/pages/wallets.tsx` | 739 | `<Badge style={...}>` — Badge component does not accept `style` prop; TypeScript error TS2322 | Warning | Does not block runtime (Preact passes unknown props through) but violates type safety and fails `tsc --noEmit` |

Note: The `return null` at lines 636 and 845 are legitimate loading guards, not stubs.

### Human Verification Required

#### 1. Wallet List USD Balance Display

**Test:** Configure a price oracle in a running daemon instance, create a wallet, navigate to the Wallets list page
**Expected:** After native balance loads, USD equivalent appears in the Balance column (e.g., "1.5 SOL ($750.00)")
**Why human:** USD display is currently not implemented in the list — this test is expected to FAIL until the gap is fixed

#### 2. ExplorerLink URL Correctness

**Test:** Create a confirmed transaction on devnet, go to wallet detail Transactions tab, click the txHash ExplorerLink
**Expected:** Opens correct Solscan/Etherscan URL in new tab
**Why human:** Requires live transaction data and browser interaction

### Gaps Summary

**Two gaps block full goal achievement:**

**Gap 1 — WLST-03 USD value missing from wallet list (blocker for requirement):**
The wallet list Balance column shows native token balance (e.g., "1.5 SOL") but omits the USD equivalent. The balance API now returns a `usd` field per network via the price oracle. However, `fetchBalances` in `WalletListContent` (line 1795) stores only `{balance, symbol}` and discards `usd`. The column render (line 1858) shows only native amount. `formatWithDisplay` is imported but not called in the list context. `fetchDisplayCurrency` is not called in `WalletListContent`.

To fix: store `usd` in `balances` signal, add `displayCurrency`/`displayRate` signals and `fetchDisplayCurrency` call to `WalletListContent`, render USD conditionally in the Balance column render function.

**Gap 2 — TypeScript type error in wallets.tsx (line 739):**
`<Badge variant="success" style={{ marginLeft: 'var(--space-2)' }}>Default</Badge>` passes a `style` prop that `BadgeProps` does not declare. This causes TS2322. Fix: wrap the Badge in a `<span style={...}>` or remove the style prop.

These two gaps affect WLST-03 (requirement not met) and type correctness of the artifact.

---

_Verified: 2026-02-22T16:08:14Z_
_Verifier: Claude (gsd-verifier)_
