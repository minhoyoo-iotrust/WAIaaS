---
phase: 279-db-core-resolution
verified: 2026-02-27T10:30:00Z
status: passed
score: 14/14 must-haves verified
---

# Phase 279: DB + Core Resolution Verification Report

**Phase Goal:** 기본 지갑/기본 네트워크가 데이터 모델과 핵심 해석 규칙에서 완전히 제거되고, 새로운 명시적 해석 규칙이 동작한다
**Verified:** 2026-02-27T10:30:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DB migration v27 removes is_default from session_wallets and default_network from wallets without data loss | VERIFIED | migrate.ts:1818-1899: 12-step table recreation with INSERT...SELECT (all non-default columns copied), FK integrity check post-migration |
| 2 | WalletSchema no longer has defaultNetwork field | VERIFIED | wallet.schema.ts has no `defaultNetwork` field; grep returns 0 matches |
| 3 | CreateSessionRequestSchema no longer has defaultWalletId field | VERIFIED | session.schema.ts has no `defaultWalletId` field; grep returns 0 matches |
| 4 | WALLET_ID_REQUIRED and NETWORK_REQUIRED error codes exist in error-codes.ts | VERIFIED | error-codes.ts:165-171 (WALLET_ID_REQUIRED, SESSION domain, 400) and :330-336 (NETWORK_REQUIRED, TX domain, 400) |
| 5 | CANNOT_REMOVE_DEFAULT_WALLET error code no longer exists | VERIFIED | grep across packages/core/src finds only comments referencing removal, no actual error code entry |
| 6 | getSingleNetwork replaces getDefaultNetwork -- Solana returns network, EVM returns null | VERIFIED | chain.ts:118-124: getSingleNetwork returns NetworkType or null; ENVIRONMENT_SINGLE_NETWORK:90-98 has EVM as null |
| 7 | ENVIRONMENT_SINGLE_NETWORK replaces ENVIRONMENT_DEFAULT_NETWORK -- EVM entries removed | VERIFIED | chain.ts:90-98: ENVIRONMENT_SINGLE_NETWORK with ethereum:* = null; grep for ENVIRONMENT_DEFAULT_NETWORK returns 0 matches |
| 8 | en.ts and ko.ts have messages for new error codes and lack messages for removed code | VERIFIED | en.ts:83 WALLET_ID_REQUIRED, :106 NETWORK_REQUIRED; ko.ts:29 and :52 correspondingly; CANNOT_REMOVE_DEFAULT_WALLET absent from both |
| 9 | resolveWalletId auto-resolves when session has exactly 1 wallet (walletId omitted) | VERIFIED | resolve-wallet-id.ts:46-57: queries session_wallets, returns single wallet when links.length===1 |
| 10 | resolveWalletId throws WALLET_ID_REQUIRED when session has 2+ wallets and walletId omitted | VERIFIED | resolve-wallet-id.ts:59-64: throws WAIaaSError('WALLET_ID_REQUIRED') with count message |
| 11 | resolveWalletId still allows explicit walletId (body or query) with access check | VERIFIED | resolve-wallet-id.ts:42,67-81: bodyWalletId or query param used, then session_wallets junction check |
| 12 | resolveNetwork auto-resolves for Solana when network omitted (getSingleNetwork returns network) | VERIFIED | network-resolver.ts:41: resolved = requestNetwork ?? getSingleNetwork(chain, environment); Solana returns non-null |
| 13 | resolveNetwork throws NETWORK_REQUIRED for EVM when network omitted (getSingleNetwork returns null) | VERIFIED | network-resolver.ts:43-48: if resolved===null throws WAIaaSError('NETWORK_REQUIRED') |
| 14 | resolveNetwork still allows explicit network override for both chains | VERIFIED | network-resolver.ts:41: requestNetwork ?? getSingleNetwork; explicit network takes priority via nullish coalescing |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/infrastructure/database/migrate.ts` | Migration v27 drops is_default and default_network | VERIFIED | version:27 at line 1819, LATEST_SCHEMA_VERSION=27 at line 60, DDL clean |
| `packages/daemon/src/infrastructure/database/schema.ts` | Drizzle schema without defaultNetwork/isDefault | VERIFIED | wallets table has no defaultNetwork, sessionWallets has no isDefault, v29.3 comment added |
| `packages/core/src/enums/chain.ts` | getSingleNetwork + ENVIRONMENT_SINGLE_NETWORK | VERIFIED | Both present, EVM returns null, Solana returns network |
| `packages/core/src/enums/index.ts` | Re-exports getSingleNetwork + ENVIRONMENT_SINGLE_NETWORK | VERIFIED | Lines 18,20 re-export both |
| `packages/core/src/index.ts` | Re-exports from package root | VERIFIED | Lines 21,23 re-export both |
| `packages/core/src/schemas/wallet.schema.ts` | WalletSchema without defaultNetwork | VERIFIED | 19 lines, no defaultNetwork field |
| `packages/core/src/schemas/session.schema.ts` | CreateSessionRequestSchema without defaultWalletId | VERIFIED | Uses walletId + walletIds, no defaultWalletId |
| `packages/core/src/errors/error-codes.ts` | WALLET_ID_REQUIRED + NETWORK_REQUIRED, no CANNOT_REMOVE_DEFAULT_WALLET | VERIFIED | 105 error codes, both new codes present, old code removed |
| `packages/core/src/i18n/en.ts` | English messages for new codes | VERIFIED | WALLET_ID_REQUIRED at :83, NETWORK_REQUIRED at :106 |
| `packages/core/src/i18n/ko.ts` | Korean messages for new codes | VERIFIED | WALLET_ID_REQUIRED at :29, NETWORK_REQUIRED at :52 |
| `packages/daemon/src/api/helpers/resolve-wallet-id.ts` | 2-priority + auto-resolve + WALLET_ID_REQUIRED | VERIFIED | 117 lines, no defaultWalletId reference, session_wallets query for auto-resolve |
| `packages/daemon/src/pipeline/network-resolver.ts` | 2-priority + getSingleNetwork + NETWORK_REQUIRED | VERIFIED | 57 lines, 3-param signature, imports getSingleNetwork from @waiaas/core |
| `packages/daemon/src/__tests__/resolve-wallet-id.test.ts` | Tests for new resolution logic | VERIFIED | 236 lines, tests WALLET_ID_REQUIRED for 0 and 2+ wallets, auto-resolve for 1 wallet |
| `packages/daemon/src/__tests__/network-resolver.test.ts` | Tests for Solana auto-resolve and EVM NETWORK_REQUIRED | VERIFIED | 83 lines, tests NETWORK_REQUIRED for EVM, auto-resolve for Solana, cross-validation errors |
| `packages/daemon/src/__tests__/pipeline-network-resolve.test.ts` | Updated integration tests | VERIFIED | 267 lines, uses getSingleNetwork, 3-param resolveNetwork calls |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| schema.ts | migrate.ts | DDL and migration match -- schema removes columns, migration DDL removes columns | WIRED | Both DDL (lines 65-81, 101-106) and migration v27 (lines 1829-1868) have matching column sets without is_default/default_network |
| chain.ts | enums/index.ts | Re-export getSingleNetwork + ENVIRONMENT_SINGLE_NETWORK | WIRED | index.ts lines 18,20 re-export both symbols |
| error-codes.ts | i18n/en.ts | Error code key parity | WIRED | en.ts has WALLET_ID_REQUIRED and NETWORK_REQUIRED; CANNOT_REMOVE_DEFAULT_WALLET absent from both |
| resolve-wallet-id.ts | schema.ts | session_wallets query to count wallets in session | WIRED | resolve-wallet-id.ts:23 imports sessionWallets, :48-52 queries with eq(sessionWallets.sessionId) |
| network-resolver.ts | chain.ts | Import getSingleNetwork | WIRED | network-resolver.ts:5 imports getSingleNetwork from @waiaas/core, :41 uses it |
| resolve-wallet-id.ts | error-codes.ts | WAIaaSError('WALLET_ID_REQUIRED') | WIRED | resolve-wallet-id.ts:60 throws WAIaaSError('WALLET_ID_REQUIRED') |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DB-01 | 279-01 | session_wallets에서 is_default 컬럼 삭제 | SATISFIED | Migration v27 Part 1, DDL clean, Drizzle schema clean |
| DB-02 | 279-01 | wallets에서 default_network 컬럼 삭제 | SATISFIED | Migration v27 Part 2, DDL clean, Drizzle schema clean |
| DB-03 | 279-01 | default_network CHECK 제약 삭제 | SATISFIED | wallets DDL has no check_default_network constraint |
| DB-04 | 279-01 | 마이그레이션 데이터 손실 없이 처리 | SATISFIED | INSERT...SELECT copies all non-removed columns |
| CORE-01 | 279-01 | WalletSchema에서 defaultNetwork 제거 | SATISFIED | wallet.schema.ts has no defaultNetwork |
| CORE-02 | 279-01 | CreateSessionRequestSchema에서 defaultWalletId 제거 | SATISFIED | session.schema.ts has no defaultWalletId |
| CORE-03 | 279-01 | WALLET_ID_REQUIRED 에러 코드 추가 | SATISFIED | error-codes.ts:165-171 |
| CORE-04 | 279-01 | NETWORK_REQUIRED 에러 코드 추가 | SATISFIED | error-codes.ts:330-336 |
| CORE-05 | 279-01 | CANNOT_REMOVE_DEFAULT_WALLET 삭제 | SATISFIED | grep returns 0 actual entries |
| CORE-06 | 279-01 | getDefaultNetwork -> getSingleNetwork, EVM null | SATISFIED | chain.ts:118-124, EVM returns null |
| CORE-07 | 279-01 | ENVIRONMENT_DEFAULT_NETWORK -> ENVIRONMENT_SINGLE_NETWORK | SATISFIED | chain.ts:90-98, old name absent |
| CORE-08 | 279-01 | i18n 메시지 업데이트 | SATISFIED | en.ts/ko.ts both have new codes, lack old code |
| RSLV-01 | 279-02 | resolveWalletId Priority 3 (JWT 기본 지갑) 제거 | SATISFIED | No defaultWalletId references in resolve-wallet-id.ts |
| RSLV-02 | 279-02 | 세션 지갑 1개일 때 자동 해석 | SATISFIED | resolve-wallet-id.ts:54-57, test coverage in test file |
| RSLV-03 | 279-02 | 세션 지갑 2+일 때 WALLET_ID_REQUIRED | SATISFIED | resolve-wallet-id.ts:60-64, test coverage in test file |
| RSLV-04 | 279-02 | network-resolver Priority 2 (wallet.defaultNetwork) 제거 | SATISFIED | 3-param signature, no walletDefaultNetwork |
| RSLV-05 | 279-02 | Solana network 자동 해석 | SATISFIED | network-resolver.ts:41 via getSingleNetwork, test coverage |
| RSLV-06 | 279-02 | EVM NETWORK_REQUIRED 에러 | SATISFIED | network-resolver.ts:43-48, test coverage |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No anti-patterns detected |

No TODO/FIXME/PLACEHOLDER/stub patterns found in any modified files.

### Human Verification Required

### 1. Migration v27 Data Integrity on Real Database

**Test:** Run migration v27 on a database with existing session_wallets (with is_default values) and wallets (with default_network values), then verify no rows are lost.
**Expected:** All rows preserved in both tables, only is_default and default_network columns removed.
**Why human:** Cannot verify actual SQLite migration execution without a real database with existing data.

### 2. Downstream Compilation

**Test:** Run `pnpm turbo run typecheck` across all packages to verify no unexpected breakages beyond the known Phase 280 callers.
**Expected:** Known failures only in daemon callers of old 4-param resolveNetwork and removed defaultNetwork references.
**Why human:** Phase 280 is expected to fix remaining callers; need to verify the scope matches expectations.

### Gaps Summary

No gaps found. All 14 observable truths verified. All 18 requirements satisfied with concrete codebase evidence. All 6 key links wired. All 4 commits verified in git history. No anti-patterns detected.

Notable: The summaries mention expected downstream typecheck errors in daemon code that references removed fields (defaultNetwork in wallets.ts, daemon.ts, notification-service.ts, pipeline.ts) and old 4-param resolveNetwork callers. These are explicitly scoped for Phase 280 and do not represent Phase 279 gaps.

---

_Verified: 2026-02-27T10:30:00Z_
_Verifier: Claude (gsd-verifier)_
