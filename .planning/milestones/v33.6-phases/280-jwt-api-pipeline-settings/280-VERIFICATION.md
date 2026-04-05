---
phase: 280-jwt-api-pipeline-settings
verified: 2026-02-27T13:00:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 280: JWT/Auth + API Endpoint + Pipeline/Infra + Admin Settings Verification Report

**Phase Goal:** 서버 런타임(인증, API 라우트, 파이프라인, 인프라 서비스) 전체에서 기본 지갑/기본 네트워크 의존이 제거되고, 삭제된 엔드포인트가 404를 반환한다
**Verified:** 2026-02-27T13:00:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | JWT에 wlt claim이 포함되지 않으며, 기존 JWT의 wlt claim은 에러 없이 무시된다 | VERIFIED | `JwtPayload` interface has only `sub/iat/exp` (jwt-secret-manager.ts:28-32). `signToken` emits only `sub` (line 209-211). `verifyToken` returns only `sub/iat/exp` (line 243-246). No `wlt` reference in jwt module. Tests confirm `'wlt' in payload` is false (session-response-compat.test.ts:324). |
| 2 | PATCH /sessions/:id/wallets/:walletId/default, PUT /wallets/:id/default-network, PUT /wallet/default-network 3개 엔드포인트가 404를 반환한다 | VERIFIED | sessions.ts has no `setDefaultWallet` route definition (only 7 routes: create/list/revoke/renew/addWallet/removeWallet/listWallets). wallets.ts has no `default-network` route. wallet.ts has no `default-network` route. No `default-network` pattern found in any API route file. |
| 3 | POST /v1/sessions 요청에서 defaultWalletId 파라미터가 무시되고, GET 응답에서 defaultNetwork/isDefault 필드가 없다 | VERIFIED | sessions.ts `createSessionRoute` handler uses `walletIds/walletId` only, no `defaultWalletId`. Response returns `{ id, token, expiresAt, walletId, wallets }` (line 321-330) with no isDefault/defaultNetwork. OpenAPI schemas have zero `isDefault` or `defaultWalletId` references. |
| 4 | 파이프라인이 wallet.defaultNetwork 없이 동작하고, BalanceMonitor가 전체 네트워크를 순회하여 잔액을 체크한다 | VERIFIED | `PipelineContext.wallet` type is `{ publicKey, chain, environment }` -- no `defaultNetwork` (stages.ts:71). Pipeline uses 3-param `resolveNetwork(requestNetwork, environment, chain)` (pipeline.ts:69-73). BalanceMonitor imports `getNetworksForEnvironment` (balance-monitor-service.ts:20) and iterates `for (const network of networks)` per wallet (line 143). Dedup key uses `walletId:network` pattern (line 158). |
| 5 | rpc.evm_default_network 설정 키가 setting-keys/config loader/hot-reload에서 완전히 제거된다 | VERIFIED | No `evm_default_network` in setting-keys.ts (232 entries, none matching). No `evm_default_network` in loader.ts `DaemonConfigSchema.rpc` (only 10 network-specific keys). No `evm_default_network` in hot-reload.ts (615 lines, zero matches). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/infrastructure/jwt/jwt-secret-manager.ts` | JwtPayload without wlt | VERIFIED | Interface has sub/iat/exp only |
| `packages/daemon/src/api/middleware/session-auth.ts` | No defaultWalletId context | VERIFIED | Sets only `sessionId` (line 68) |
| `packages/daemon/src/api/middleware/owner-auth.ts` | Route param + tx fallback | VERIFIED | Two-pass lookup: wallet ID then transaction ID (lines 79-100) |
| `packages/daemon/src/api/routes/sessions.ts` | No setDefaultWallet, no isDefault | VERIFIED | 7 routes only, no default concept |
| `packages/daemon/src/api/routes/wallets.ts` | No default-network endpoint | VERIFIED | Uses getSingleNetwork, no default-network route |
| `packages/daemon/src/api/routes/wallet.ts` | No default-network endpoint | VERIFIED | Uses getSingleNetwork, throws NETWORK_REQUIRED for EVM |
| `packages/daemon/src/pipeline/stages.ts` | PipelineContext without defaultNetwork | VERIFIED | wallet type: `{ publicKey, chain, environment }` |
| `packages/daemon/src/pipeline/pipeline.ts` | 3-param resolveNetwork | VERIFIED | `resolveNetwork(requestNetwork, environment, chain)` |
| `packages/daemon/src/services/monitoring/balance-monitor-service.ts` | getNetworksForEnvironment iteration | VERIFIED | Iterates all networks per wallet |
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | No evm_default_network | VERIFIED | 232 entries, none matching |
| `packages/daemon/src/infrastructure/config/loader.ts` | No evm_default_network in Zod schema | VERIFIED | rpc section has 10 fields, none is evm_default_network |
| `packages/daemon/src/infrastructure/settings/hot-reload.ts` | No evm_default_network skip logic | VERIFIED | Zero matches in 615 lines |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| session-auth.ts | jwt-secret-manager.ts | verifyToken -> return sub/iat/exp | WIRED | Middleware calls verifyToken, sets sessionId from payload.sub |
| pipeline.ts | network-resolver.ts | 3-param resolveNetwork | WIRED | Imports and calls resolveNetwork(requestNetwork, environment, chain) |
| balance-monitor-service.ts | @waiaas/core | getNetworksForEnvironment | WIRED | Imports and uses for all-network iteration per wallet |
| owner-auth.ts | schema.ts (transactions) | Transaction ID fallback lookup | WIRED | Falls back to transactions table when paramId is not a wallet ID |
| sessions.ts | sessionWallets | session_wallets insert without isDefault | WIRED | Insert uses only sessionId, walletId, createdAt |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUTH-01 | 280-01 | JWT에서 wlt claim 제거 | SATISFIED | JwtPayload has sub/iat/exp only |
| AUTH-02 | 280-01 | session-auth에서 defaultWalletId 제거 | SATISFIED | Sets sessionId only |
| AUTH-03 | 280-01 | 기존 JWT wlt claim 무시 | SATISFIED | jose library ignores extra claims, tests confirm |
| AUTH-04 | 280-01 | owner-auth에서 defaultWalletId 의존 제거 | SATISFIED | Uses route param + tx fallback |
| AUTH-05 | 280-01 | Telegram Bot wlt/is_default 제거 | SATISFIED | Commit ab44bcfe removes from telegram-bot-service.ts |
| API-01 | 280-01 | PATCH /sessions/:id/wallets/:walletId/default 삭제 | SATISFIED | Route does not exist in sessions.ts (tracker shows Pending but code is complete) |
| API-02 | 280-02 | PUT /wallets/:id/default-network 삭제 | SATISFIED | Route does not exist in wallets.ts |
| API-03 | 280-02 | PUT /wallet/default-network 삭제 | SATISFIED | Route does not exist in wallet.ts |
| API-04 | 280-02 | defaultWalletId 파라미터 제거 | SATISFIED | Session create uses walletIds/walletId only |
| API-05 | 280-02 | networks 응답에서 isDefault 제거 | SATISFIED | No isDefault in OpenAPI schemas |
| API-06 | 280-02 | wallet detail에서 defaultNetwork 제거 | SATISFIED | Wallet detail returns network via getSingleNetwork |
| API-07 | 280-02 | connect-info에서 defaultNetwork/isDefault 제거 | SATISFIED | Per commit 38f5586b |
| API-08 | 280-02 | 트랜잭션/액션 3-param resolveNetwork | SATISFIED | Per commit 4a02a602 |
| API-09 | 280-02 | Admin isDefault 정렬/표시 제거 | SATISFIED | Per commit 38f5586b |
| API-10 | 280-02 | OpenAPI 스키마 정리 | SATISFIED | No isDefault/defaultNetwork in openapi-schemas.ts |
| PIPE-01 | 280-03 | daemon.ts getDefaultNetwork 폴백 제거 | SATISFIED | Per commit 9dad9cda |
| PIPE-02 | 280-03 | PipelineContext.wallet.defaultNetwork 제거 | SATISFIED | Type has publicKey/chain/environment only |
| PIPE-03 | 280-03 | notification-service defaultNetwork 제거 | SATISFIED | Per commit 64e2accd |
| PIPE-04 | 280-03 | adapter-pool evm_default_network skip 제거 | SATISFIED | Per commit 64e2accd |
| PIPE-05 | 280-03 | BalanceMonitor getNetworksForEnvironment 순회 | SATISFIED | Iterates all networks with dedup key walletId:network |
| PIPE-06 | 280-03 | WC 페어링 default_network 제거 | SATISFIED | Per commit 38f5586b, uses getSingleNetwork |
| ASET-01 | 280-03 | setting-keys에서 evm_default_network 삭제 | SATISFIED | Not present in SETTING_DEFINITIONS |
| ASET-02 | 280-03 | config loader에서 evm_default_network 삭제 | SATISFIED | Not present in DaemonConfigSchema.rpc |
| ASET-03 | 280-03 | hot-reload에서 evm_default_network 삭제 | SATISFIED | Zero matches in hot-reload.ts |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `__tests__/api-agents.test.ts` | 442 | Test name references "evm_default_network" (stale description) | Info | Cosmetic -- test behavior is correct, just description text is outdated |
| `__tests__/lido-staking-integration.test.ts` | 91 | Settings reader passes `rpc.evm_default_network` key | Info | Key no longer exists in SETTING_DEFINITIONS; ignored by settings reader; test logic works via other means |
| `api/routes/wc.ts` | 332 | Comment references "defaultWalletId" | Info | Comment only -- actual code uses resolveWalletId |

No blockers or warnings found. All 3 items are informational (stale text/comments with no functional impact).

### Human Verification Required

### 1. Deleted Endpoint 404 Behavior

**Test:** Send PATCH /v1/sessions/:id/wallets/:walletId/default, PUT /v1/wallets/:id/default-network, PUT /v1/wallet/default-network requests to running daemon
**Expected:** All 3 return HTTP 404
**Why human:** Route deletion means Hono returns 404 by default, but verifying requires a running server

### 2. Old JWT Backward Compatibility

**Test:** Issue a JWT with an extra `wlt` claim using a previous version, then use it with the current daemon
**Expected:** JWT is accepted without errors; `wlt` claim is silently ignored
**Why human:** Requires actual JWT token generation and validation across versions

### Gaps Summary

No gaps found. All 5 success criteria are verified against the actual codebase. All 24 requirements are satisfied. Three informational anti-patterns exist (stale test descriptions/comments) with zero functional impact.

The REQUIREMENTS.md tracker shows API-01 as "Pending" which is a tracker documentation inconsistency -- the actual code confirms the PATCH /sessions/:id/wallets/:walletId/default route has been deleted from sessions.ts.

---

_Verified: 2026-02-27T13:00:00Z_
_Verifier: Claude (gsd-verifier)_
