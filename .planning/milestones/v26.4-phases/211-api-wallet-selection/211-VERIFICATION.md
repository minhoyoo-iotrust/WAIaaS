---
phase: 211-api-wallet-selection
verified: 2026-02-21T02:08:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 211: API Wallet Selection Verification Report

**Phase Goal:** 모든 지갑 스코프 API가 선택적 walletId 파라미터를 지원하고, 미지정 시 기본 지갑으로 투명하게 동작하는 상태
**Verified:** 2026-02-21T02:08:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                        | Status     | Evidence                                                                                         |
|----|----------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------------|
| 1  | resolveWalletId 헬퍼가 body > query > defaultWalletId 우선순위로 지갑을 결정한다               | VERIFIED   | `resolve-wallet-id.ts` L38-41: bodyWalletId \|\| query('walletId') \|\| defaultWalletId         |
| 2  | 세션에 연결되지 않은 지갑 접근 시 WALLET_ACCESS_DENIED 에러가 반환된다                          | VERIFIED   | `resolve-wallet-id.ts` L62-64: session_wallets 미존재 시 WAIaaSError('WALLET_ACCESS_DENIED')    |
| 3  | session-auth 미들웨어가 defaultWalletId만 설정하고 walletId는 설정하지 않는다                   | VERIFIED   | `session-auth.ts` L68-69: c.set('sessionId') + c.set('defaultWalletId') only                   |
| 4  | owner-auth 미들웨어가 defaultWalletId를 사용하고 명시적 walletId 파라미터를 우선한다            | VERIFIED   | `owner-auth.ts` L71: (c.get('defaultWalletId' as never) \|\| c.req.param('id'))                 |
| 5  | GET 요청에서 ?walletId= 쿼리 파라미터로 특정 지갑을 지정할 수 있다                               | VERIFIED   | wallet.ts/transactions.ts/wc.ts: resolveWalletId(c, deps.db) reads query automatically         |
| 6  | POST/PUT 요청에서 body walletId 필드로 특정 지갑을 지정할 수 있다                               | VERIFIED   | TxSignRequestSchema, x402 fetch, ActionExecuteRequest에 walletId optional 추가. resolveWalletId(c, db, body.walletId) 호출 |
| 7  | walletId 미지정 시 기본 지갑이 자동 선택되어 기존 코드가 무변경으로 동작한다                       | VERIFIED   | 10개 통합 테스트 통과: 기본 지갑 자동 선택 케이스 포함                                              |
| 8  | 세션 목록/상세 응답에 wallets 배열 + 하위 호환 walletId/walletName 필드가 포함된다               | VERIFIED   | SessionListItemSchema L162-164: walletId + walletName + wallets array. SessionCreateResponseSchema L150-155 동일 |
| 9  | 세션 갱신(renew) 시 session_wallets is_default=true 기반으로 JWT wlt 클레임이 발급된다          | VERIFIED   | `sessions.ts` L542-563: is_default=true 조회 후 wlt: defaultWallet!.walletId 로 JWT 발급        |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact                                                                        | Provides                                              | Status     | Details                                                         |
|---------------------------------------------------------------------------------|-------------------------------------------------------|------------|-----------------------------------------------------------------|
| `packages/daemon/src/api/helpers/resolve-wallet-id.ts`                         | resolveWalletId + verifyWalletAccess 헬퍼              | VERIFIED   | 99 lines, exports both functions, session_wallets 조회 구현     |
| `packages/daemon/src/api/middleware/session-auth.ts`                           | defaultWalletId only 컨텍스트 설정                     | VERIFIED   | c.set('walletId') 제거됨, defaultWalletId만 L69에서 설정        |
| `packages/daemon/src/api/middleware/owner-auth.ts`                             | defaultWalletId 기반 지갑 결정                         | VERIFIED   | L71: defaultWalletId 사용으로 변경됨                            |
| `packages/daemon/src/api/routes/wallet.ts`                                     | GET /wallet/* 4개 엔드포인트 resolveWalletId 사용      | VERIFIED   | L34 import, L224/L240/L354/L483 resolveWalletId 호출            |
| `packages/daemon/src/api/routes/transactions.ts`                               | 5개 엔드포인트 resolveWalletId/verifyWalletAccess 사용 | VERIFIED   | L75 import, L295/L436/L500/L556 resolveWalletId, L754 verifyWalletAccess |
| `packages/daemon/src/api/routes/x402.ts`                                       | POST /x402/fetch body walletId 지원                   | VERIFIED   | L41 import, L129 schema optional walletId, L196 resolveWalletId  |
| `packages/daemon/src/api/routes/actions.ts`                                    | POST /actions/:p/:a body walletId 지원                | VERIFIED   | L52 import, L109 schema optional walletId, L236 resolveWalletId  |
| `packages/daemon/src/api/routes/wc.ts`                                         | WC session routes resolveWalletId 사용                | VERIFIED   | L34 import, L332 getWalletId 헬퍼 → resolveWalletId(c, db)     |
| `packages/daemon/src/api/routes/openapi-schemas.ts`                            | SessionListItemSchema wallets + walletId + walletName | VERIFIED   | L159-175: walletId, walletName, wallets array. TxSignRequestSchema L882 optional walletId |
| `packages/daemon/src/__tests__/resolve-wallet-id.test.ts`                      | resolveWalletId 단위 테스트 7개                        | VERIFIED   | 210 lines, 7 test cases, all passing                            |
| `packages/daemon/src/__tests__/session-auth.test.ts`                           | defaultWalletId only 테스트                            | VERIFIED   | L229: "sets defaultWalletId only", L243: not.toHaveProperty('walletId') |
| `packages/daemon/src/__tests__/wallet-id-selection.test.ts`                    | walletId 선택 통합 테스트 10개                         | VERIFIED   | 449 lines, 10 test cases, all passing                           |
| `packages/daemon/src/__tests__/session-response-compat.test.ts`                | 세션 응답 하위 호환 테스트 6개                          | VERIFIED   | 425 lines, 6 test cases, all passing                            |

---

### Key Link Verification

| From                                           | To                                           | Via                                        | Status  | Details                                                           |
|------------------------------------------------|----------------------------------------------|--------------------------------------------|---------|-------------------------------------------------------------------|
| `resolve-wallet-id.ts`                         | `infrastructure/database/schema.ts`          | sessionWallets 테이블 조회                  | WIRED   | L19 import sessionWallets, L53-60 where clause 조회               |
| `session-auth.ts`                              | `resolve-wallet-id.ts`                       | defaultWalletId context 설정 (헬퍼가 읽음) | WIRED   | session-auth가 defaultWalletId 설정, resolveWalletId가 L41에서 읽음 |
| `transactions.ts`                              | `resolve-wallet-id.ts`                       | resolveWalletId import                     | WIRED   | L75 import, 5개 핸들러에서 호출                                    |
| `wallet.ts`                                    | `resolve-wallet-id.ts`                       | resolveWalletId import                     | WIRED   | L34 import, 4개 핸들러에서 호출                                    |
| `sessions.ts`                                  | `infrastructure/database/schema.ts`          | session_wallets JOIN wallets               | WIRED   | L26 import sessionWallets, L413-419 JOIN 조회                     |
| `sessions.ts`                                  | `infrastructure/jwt/index.ts`                | JWT wlt 클레임에 기본 지갑 설정             | WIRED   | L562-563: wlt: defaultWallet!.walletId 로 JWT payload 구성        |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                     | Status    | Evidence                                                                              |
|-------------|-------------|-----------------------------------------------------------------|-----------|---------------------------------------------------------------------------------------|
| API-01      | 211-01      | walletId 미지정 시 기본 지갑이 자동 선택되어 기존 코드가 무변경으로 동작한다 | SATISFIED | resolveWalletId priority 3 = defaultWalletId. 통합 테스트 "no walletId -- uses default walletA" |
| API-02      | 211-02      | GET 요청에서 ?walletId= 쿼리 파라미터로 특정 지갑을 지정할 수 있다   | SATISFIED | resolveWalletId(c, db): c.req.query('walletId') priority 2. 테스트: "?walletId={walletB} -- selects walletB" |
| API-03      | 211-02      | POST/PUT 요청에서 body walletId 필드로 특정 지갑을 지정할 수 있다   | SATISFIED | TxSignRequestSchema/x402/actions에 walletId optional 추가. resolveWalletId(c, db, body.walletId) |
| API-04      | 211-01      | 세션에 연결되지 않은 지갑 접근 시 WALLET_ACCESS_DENIED 에러가 반환된다 | SATISFIED | session_wallets 미존재 시 WAIaaSError('WALLET_ACCESS_DENIED'). 테스트: "WALLET_ACCESS_DENIED" 케이스 3개 |
| API-05      | 211-03      | 세션 목록/상세 응답에 wallets 배열이 포함된다 (하위 호환 walletId/walletName 유지) | SATISFIED | SessionListItemSchema + SessionCreateResponseSchema 모두 wallets + walletId + walletName 포함 |
| API-06      | 211-03      | 세션 갱신(renew) 시 현재 기본 지갑으로 JWT가 발급된다              | SATISFIED | sessions.ts: is_default=true 조회 → JWT wlt = defaultWallet.walletId. 테스트: "JWT wlt claim for new default wallet" |

No orphaned requirements — all 6 Phase 211 requirements (API-01 through API-06) are accounted for across the three plans.

---

### Anti-Patterns Found

None detected. No TODO/FIXME/placeholder comments in key files. No stub implementations. No empty handlers.

---

### Human Verification Required

None. All critical paths are verifiable programmatically. The following were checked and passed automatically:

- resolveWalletId 3-priority logic: verified via 7 unit tests
- WALLET_ACCESS_DENIED on unlinked wallet: verified via 3 integration tests
- session-auth no longer sets walletId: grep confirmed, test asserts `not.toHaveProperty('walletId')`
- All 14+ endpoints use resolveWalletId: grep confirmed imports and call sites
- Session response backward compat: verified via 6 integration tests
- Session renew JWT wlt claim: verified via integration test + code inspection

---

### Test Run Summary

| Test File                              | Tests | Result  |
|----------------------------------------|-------|---------|
| resolve-wallet-id.test.ts              | 7     | PASSED  |
| wallet-id-selection.test.ts            | 10    | PASSED  |
| session-response-compat.test.ts        | 6     | PASSED  |
| **Total**                              | **23**| **PASSED** |

---

### Commit Verification

| Commit    | Plan | Description                                              |
|-----------|------|----------------------------------------------------------|
| `4b1e6c5` | 01   | feat(211-01): add resolveWalletId helper and remove walletId from session-auth |
| `b423778` | 01   | test(211-01): add resolveWalletId tests and update session-auth tests |
| `5c52176` | 02   | feat(211-02): replace c.get('walletId') with resolveWalletId() across all endpoints |
| `a0493a9` | 02   | test(211-02): add walletId selection integration tests   |
| `7b88221` | 03   | test(211-03): add session response backward compatibility tests |

All 5 commits confirmed in git log.

---

## Summary

Phase 211 goal is fully achieved. All 6 requirements (API-01 through API-06) are satisfied:

1. **resolveWalletId 헬퍼** (`resolve-wallet-id.ts`): Substantive 99-line implementation with 3-priority resolution (body > query > defaultWalletId) and session_wallets junction table access validation. Also exports `verifyWalletAccess` for transaction ownership checks.

2. **Middleware migration**: session-auth sets only `defaultWalletId` (walletId completely removed). owner-auth reads `defaultWalletId` instead of the removed walletId context.

3. **14+ endpoint migration**: All wallet-scoped routes in wallet.ts (4), transactions.ts (5), x402.ts (1), actions.ts (1), wc.ts (4) now use resolveWalletId. No `c.get('walletId')` calls remain in any route file.

4. **OpenAPI schema extension**: TxSignRequestSchema, x402 fetch body, and ActionExecuteRequestSchema each have optional `walletId: z.string().uuid().optional()` fields enabling body-based wallet selection for POST requests.

5. **Session response backward compatibility**: SessionCreateResponseSchema and SessionListItemSchema both include the `wallets` array plus legacy `walletId`/`walletName` fields. Session renew correctly derives JWT `wlt` claim from `session_wallets.is_default=true`.

6. **23 tests pass**: 7 unit tests for resolveWalletId priority logic, 10 integration tests for endpoint-level walletId selection, 6 backward compatibility tests for session responses.

---

_Verified: 2026-02-21T02:08:00Z_
_Verifier: Claude (gsd-verifier)_
