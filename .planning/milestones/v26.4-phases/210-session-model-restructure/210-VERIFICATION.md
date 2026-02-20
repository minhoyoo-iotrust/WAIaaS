---
phase: 210-session-model-restructure
verified: 2026-02-21T08:00:00Z
status: passed
score: 5/5 success criteria verified
re_verification: false
gaps: []
human_verification: []
---

# Phase 210: 세션 모델 재구조화 Verification Report

**Phase Goal:** 세션이 여러 지갑을 소유할 수 있는 1:N 관계가 DB와 서비스 레이어에서 완전히 동작하는 상태
**Verified:** 2026-02-21T08:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| #  | Truth | Status | Evidence |
|----|-------|--------|---------|
| 1  | 세션 생성 시 walletIds 복수 파라미터로 여러 지갑을 한 번에 연결할 수 있고, walletId 단수 파라미터도 하위 호환으로 동작한다 | VERIFIED | `sessions.ts:236` — `walletIds ?? (walletId ? [walletId] : [])` 정규화 로직 존재; `session-lifecycle-e2e.test.ts:767` `creates session with walletIds (plural)`, `:786` `creates session with walletId (singular, backward compat)` 테스트 통과 |
| 2  | 세션에 지갑을 동적으로 추가/제거/기본 변경/목록 조회할 수 있는 4개 엔드포인트가 동작한다 | VERIFIED | `sessions.ts` — `addWalletRoute` (POST /sessions/{id}/wallets), `removeWalletRoute` (DELETE /sessions/{id}/wallets/{walletId}), `setDefaultWalletRoute` (PATCH /sessions/{id}/wallets/{walletId}/default), `listSessionWalletsRoute` (GET /sessions/{id}/wallets) 모두 구현. 실제 DB 쿼리 포함. `session-lifecycle-e2e.test.ts:826-1020` 엔드포인트별 테스트 통과 |
| 3  | 기본 지갑 제거 시 CANNOT_REMOVE_DEFAULT_WALLET, 마지막 지갑 제거 시 SESSION_REQUIRES_WALLET 에러가 반환된다 | VERIFIED | `sessions.ts:721` — `isDefault` 확인 후 `CANNOT_REMOVE_DEFAULT_WALLET` throw; `sessions.ts:732` — count <= 1 확인 후 `SESSION_REQUIRES_WALLET` throw; `error-codes.ts:157,164` — 두 에러 코드 정의됨; `session-lifecycle-e2e.test.ts:909,930` 에러 케이스 테스트 존재 |
| 4  | DB v19 마이그레이션이 기존 sessions.wallet_id 데이터를 session_wallets로 무손실 이관하고, 이관 후 모든 세션에 is_default=1 행이 정확히 1개 존재한다 | VERIFIED | `migrate.ts:1318` — version 19 마이그레이션 정의; `migrate.ts:1337-1340` — `INSERT INTO session_wallets ... SELECT id, wallet_id, 1 ... WHERE wallet_id IS NOT NULL` 데이터 이관; `schema-compatibility.test.ts:247,282,318` — 100개 세션 이관 검증, is_default=1 불변량 검증, NULL wallet_id 스킵 검증 테스트 포함 |
| 5  | 지갑 삭제(TERMINATE) 시 해당 지갑이 기본 지갑이면 자동 승격되고, 마지막 지갑이면 세션이 자동 revoke된다 | VERIFIED | `wallets.ts:507-563` — cascade 방어 로직 완전 구현 (Step 1: 연결된 세션 조회, Step 2: per-session promote/revoke 결정, Step 3: junction rows 삭제); `session-wallet-cascade.test.ts:279,364,396` — 자동 승격, 자동 revoke, 다중 세션 시나리오 테스트 7개 |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/daemon/src/infrastructure/database/schema.ts` | VERIFIED | `sessionWallets` 테이블 정의 (L124-140), sessions에서 `walletId` 제거됨 (L98-118), 15개 테이블 |
| `packages/daemon/src/infrastructure/database/migrate.ts` | VERIFIED | `LATEST_SCHEMA_VERSION = 19` (L54), v19 migration 전체 구현 (L1317-1409), 12-step sessions 재생성, transactions FK 재연결 |
| `packages/core/src/errors/error-codes.ts` | VERIFIED | 4개 신규 에러 코드 존재: `WALLET_ACCESS_DENIED` (L143), `WALLET_ALREADY_LINKED` (L150), `CANNOT_REMOVE_DEFAULT_WALLET` (L157), `SESSION_REQUIRES_WALLET` (L164) |
| `packages/core/src/schemas/session.schema.ts` | VERIFIED | `walletId: optional()`, `walletIds: array(uuid).min(1).optional()`, `defaultWalletId: optional()`, `refine()` 검증 존재 |
| `packages/daemon/src/api/routes/sessions.ts` | VERIFIED | `session_wallets` import, 세션 생성 정규화, 4개 CRUD 엔드포인트 구현 (L144-810), 갱신 시 session_wallets에서 default wallet 조회 (L542-552) |
| `packages/daemon/src/api/middleware/session-auth.ts` | VERIFIED | `c.set('defaultWalletId', payload.wlt)` + `c.set('walletId', payload.wlt)` 듀얼 컨텍스트 (L70-71) |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | VERIFIED | `SessionCreateResponse`에 `wallets` 배열 추가, `SessionWalletSchema`, `SessionWalletListSchema`, `SessionDefaultWalletSchema` 정의 |
| `packages/daemon/src/api/routes/wallets.ts` | VERIFIED | `sessionWallets` import + cascade defense 로직 (L507-563): linked sessions 조회 → per-session promote/revoke → junction rows 삭제 |
| `packages/daemon/src/__tests__/session-wallet-cascade.test.ts` | VERIFIED | 602줄, 7개 테스트: auto-promote, preserve-default, auto-revoke, multi-session, sequential-deletion, promotion-order, consistency |
| `packages/daemon/src/infrastructure/database/index.ts` | VERIFIED | `sessionWallets` barrel export 존재 (L14) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `sessions.ts` | `schema.ts` | `import { ..., sessionWallets }` | WIRED | `sessions.ts:26` — `import { wallets, sessions, sessionWallets } from ...schema` |
| `session-auth.ts` | `schema.ts` | session_wallets 조회는 session-auth에서 직접 하지 않음; JWT payload.wlt를 context에 설정 | WIRED | `session-auth.ts:70-71` — defaultWalletId + walletId 듀얼 설정 |
| `sessions.ts` | `error-codes.ts` | `WALLET_ALREADY_LINKED`, `CANNOT_REMOVE_DEFAULT_WALLET`, `SESSION_REQUIRES_WALLET` | WIRED | `sessions.ts:649,721,732` — 신규 에러 코드 실제 throw |
| `wallets.ts` | `schema.ts` | `sessionWallets` cascade defense | WIRED | `wallets.ts:23` — import, `wallets.ts:510-561` — 실제 사용 |
| `migrate.ts` | `schema.ts` | `LATEST_SCHEMA_VERSION = 19` | WIRED | `migrate.ts:54` — version 동기화 확인 |

### Requirements Coverage

| Requirement | Plan | Description | Status | Evidence |
|-------------|------|-------------|--------|---------|
| SESS-01 | 210-02 | 세션 생성 시 여러 지갑을 한 번에 연결할 수 있다 (walletIds 복수) | SATISFIED | `sessions.ts:236` walletIds normalization, session-lifecycle-e2e:767 |
| SESS-02 | 210-02 | 기존 단일 지갑 세션(walletId 단수) 하위 호환 | SATISFIED | `sessions.ts:236` `walletId ? [walletId] : []` fallback, session-lifecycle-e2e:786 |
| SESS-03 | 210-02 | POST /v1/sessions/:id/wallets 동적 지갑 추가 | SATISFIED | `sessions.ts:602-693` addWalletRoute 구현, session-lifecycle-e2e:826 |
| SESS-04 | 210-02 | DELETE /v1/sessions/:id/wallets/:walletId 동적 지갑 제거 | SATISFIED | `sessions.ts:698-747` removeWalletRoute 구현, session-lifecycle-e2e:880 |
| SESS-05 | 210-02 | PATCH /v1/sessions/:id/wallets/:walletId/default 기본 지갑 변경 | SATISFIED | `sessions.ts:752-803` setDefaultWalletRoute 구현, session-lifecycle-e2e:952 |
| SESS-06 | 210-02 | GET /v1/sessions/:id/wallets 연결된 지갑 목록 조회 | SATISFIED | `sessions.ts:808-845` listSessionWalletsRoute 구현, session-lifecycle-e2e:986 |
| SESS-07 | 210-01 | DB v19 마이그레이션 — session_wallets junction 테이블 생성 + 기존 데이터 자동 이관 | SATISFIED | `migrate.ts:1317-1409` v19 migration, schema-compatibility.test.ts:247 |
| SESS-08 | 210-01 | 기본 지갑 제거 시 CANNOT_REMOVE_DEFAULT_WALLET 에러 | SATISFIED | `error-codes.ts:157`, `sessions.ts:721`, session-lifecycle-e2e:909 |
| SESS-09 | 210-01 | 마지막 지갑 제거 시 SESSION_REQUIRES_WALLET 에러 | SATISFIED | `error-codes.ts:164`, `sessions.ts:732`, session-lifecycle-e2e:930 |
| SESS-10 | 210-03 | 지갑 삭제(TERMINATE) 시 자동 승격/세션 자동 revoke | SATISFIED | `wallets.ts:507-563` cascade defense, session-wallet-cascade.test.ts:279-531 |

All 10 requirements (SESS-01 through SESS-10) are SATISFIED. No orphaned requirements detected.

### Anti-Patterns Found

No anti-patterns detected:
- No TODO/FIXME/PLACEHOLDER in modified files
- No stub implementations (all handlers query actual DB)
- No empty return values (`return null`, `return {}`, `return []`) in critical paths
- All 4 CRUD endpoints perform real DB operations and return substantive responses

### Human Verification Required

None required. All success criteria are verifiable programmatically via existing tests.

## Verification Summary

Phase 210 achieved its goal. The 1:N session-wallet relationship is fully operational in both DB and service layers:

**DB Layer (Plan 01):**
- `LATEST_SCHEMA_VERSION = 19` with `session_wallets` junction table defined in both Drizzle schema and DDL
- v19 migration performs 12-step sessions table recreation, data migration with NULL safety, and FK reconnection
- 4 new SESSION error codes exported from `@waiaas/core`
- `CreateSessionRequestSchema` supports both `walletId` (singular, backward compat) and `walletIds` (plural)

**Service Layer (Plan 02):**
- Session creation normalizes `walletIds`/`walletId` parameters and inserts `session_wallets` junction rows
- Session renewal reads `defaultWallet` from `session_wallets` (not from removed `sessions.walletId` column)
- All 4 session-wallet management endpoints fully implemented with real DB queries and error handling
- `session-auth` middleware sets dual context (`defaultWalletId` + `walletId` backward compat) for Phase 211

**Cascade Defense (Plan 03):**
- TERMINATE handler processes `session_wallets` before wallet status change
- Auto-promote: earliest-linked wallet (created_at ASC) becomes new default when default wallet terminates
- Auto-revoke: session is revoked when its last wallet terminates
- 7 edge-case tests verify `is_default` invariant across all deletion scenarios

All 6 commits verified in git history: `a678870`, `cffc76a`, `3891ad6`, `8899349`, `9608028`, `287539f`.

---

_Verified: 2026-02-21T08:00:00Z_
_Verifier: Claude (gsd-verifier)_
