---
phase: 211-api-wallet-selection
plan: 02
subsystem: api
tags: [hono, resolveWalletId, wallet-selection, openapi, session-wallets]

# Dependency graph
requires:
  - phase: 211-api-wallet-selection
    plan: 01
    provides: resolveWalletId helper, session-auth defaultWalletId-only context, session_wallets access validation
provides:
  - All wallet-scoped endpoints support optional walletId parameter
  - GET endpoints accept ?walletId= query parameter
  - POST/PUT endpoints accept body walletId field (via OpenAPI schema extension)
  - verifyWalletAccess helper for transaction ownership checks
  - 10 integration tests for walletId selection across endpoints
affects: [211-03 MCP/SDK integration, all session-auth dependent routes]

# Tech tracking
tech-stack:
  added: []
  patterns: [resolveWalletId() call pattern for all wallet-scoped endpoints, verifyWalletAccess for tx ownership]

key-files:
  created:
    - packages/daemon/src/__tests__/wallet-id-selection.test.ts
  modified:
    - packages/daemon/src/api/helpers/resolve-wallet-id.ts
    - packages/daemon/src/api/routes/wallet.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/routes/x402.ts
    - packages/daemon/src/api/routes/actions.ts
    - packages/daemon/src/api/routes/wc.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts

key-decisions:
  - "POST body의 walletId를 OpenAPI 스키마에 optional 필드로 추가 (TxSignRequest, x402 fetch, ActionExecuteRequest)"
  - "cancel 핸들러는 resolveWalletId 대신 verifyWalletAccess(sessionId, tx.walletId) 사용 -- tx 소유 지갑이 세션에 연결되어 있는지 확인"
  - "PUT /wallet/default-network은 resolveWalletId(c, deps.db) 호출 -- body 스키마 수정 없이 query walletId 지원"
  - "BetterSQLite3Database 타입 파라미터를 <any>로 확장 -- 다양한 스키마 타입의 db 인스턴스와 호환"

patterns-established:
  - "resolveWalletId(c, deps.db) 패턴: GET 엔드포인트에서 query walletId 자동 읽기"
  - "resolveWalletId(c, deps.db, body.walletId) 패턴: POST 엔드포인트에서 body walletId 전달"
  - "verifyWalletAccess(sessionId, walletId, db) 패턴: tx 소유권 검증 시 사용"

requirements-completed: [API-02, API-03]

# Metrics
duration: 6min
completed: 2026-02-21
---

# Phase 211 Plan 02: Endpoint walletId Selection Summary

**14개 지갑 스코프 엔드포인트에서 c.get('walletId') -> resolveWalletId() 교체 + OpenAPI 스키마 walletId optional 필드 추가 + 10개 통합 테스트**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-20T16:57:12Z
- **Completed:** 2026-02-20T17:03:32Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- wallet.ts 4개 엔드포인트(address/balance/assets/default-network)에서 resolveWalletId 사용
- transactions.ts 5개 엔드포인트(send/sign/list/pending/cancel)에서 resolveWalletId/verifyWalletAccess 사용
- x402.ts, actions.ts, wc.ts 총 6개 엔드포인트에서 resolveWalletId 사용
- TxSignRequestSchema, x402 fetch body, ActionExecuteRequestSchema에 walletId optional 필드 추가
- verifyWalletAccess 헬퍼 추가 (cancel 핸들러의 tx 소유권 검증용)
- 10개 통합 테스트: 기본 지갑 자동 선택, query/body walletId 지정, 미연결 지갑 거부
- 17개 기존 session-lifecycle e2e 테스트 backward compatibility 확인

## Task Commits

Each task was committed atomically:

1. **Task 1: 전 엔드포인트 c.get('walletId') -> resolveWalletId() 교체** - `5c52176` (feat)
2. **Task 2: walletId 선택 통합 테스트** - `a0493a9` (test)

## Files Created/Modified
- `packages/daemon/src/api/helpers/resolve-wallet-id.ts` - verifyWalletAccess 헬퍼 추가, type param <any> 확장
- `packages/daemon/src/api/routes/wallet.ts` - 4개 GET/PUT 핸들러에서 resolveWalletId 사용
- `packages/daemon/src/api/routes/transactions.ts` - 5개 핸들러에서 resolveWalletId/verifyWalletAccess 사용
- `packages/daemon/src/api/routes/x402.ts` - POST /x402/fetch에서 resolveWalletId + body walletId
- `packages/daemon/src/api/routes/actions.ts` - POST /actions/:p/:a에서 resolveWalletId + body walletId
- `packages/daemon/src/api/routes/wc.ts` - 4개 세션 WC 핸들러에서 resolveWalletId 사용
- `packages/daemon/src/api/routes/openapi-schemas.ts` - TxSignRequestSchema에 walletId optional 추가
- `packages/daemon/src/__tests__/wallet-id-selection.test.ts` - 10개 통합 테스트

## Decisions Made
- POST body의 walletId를 OpenAPI 스키마에 optional 필드로 추가 (Hono c.req.valid('json')에서 깔끔하게 접근)
- cancel 핸들러는 resolveWalletId 대신 verifyWalletAccess 사용 (tx.walletId 기준 소유권 검증이 더 정확)
- PUT /wallet/default-network은 body 스키마 수정 없이 resolveWalletId(c, deps.db) 호출 (query fallback)
- BetterSQLite3Database<any> 타입으로 확장하여 typed/untyped DB 인스턴스 호환성 확보

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] BetterSQLite3Database 타입 호환성 문제**
- **Found during:** Task 1
- **Issue:** resolveWalletId의 `BetterSQLite3Database` (unparameterized)가 라우트의 `BetterSQLite3Database<typeof schema>`와 호환되지 않아 typecheck 실패
- **Fix:** 타입 파라미터를 `<any>`로 확장하여 모든 스키마 타입과 호환
- **Files modified:** packages/daemon/src/api/helpers/resolve-wallet-id.ts
- **Verification:** `pnpm turbo run typecheck --filter=@waiaas/daemon` 통과
- **Committed in:** 5c52176 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type compatibility fix necessary for compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 모든 지갑 스코프 REST API 엔드포인트가 resolveWalletId를 사용하여 walletId 선택적 파라미터 지원
- Plan 03에서 MCP/SDK 통합 레이어에도 동일 패턴 적용 가능
- 기존 API 호출은 무변경으로 동작 (기본 지갑 자동 선택)

---
## Self-Check: PASSED

All 8 files verified present. Both commit hashes (5c52176, a0493a9) confirmed in git log.

---
*Phase: 211-api-wallet-selection*
*Completed: 2026-02-21*
