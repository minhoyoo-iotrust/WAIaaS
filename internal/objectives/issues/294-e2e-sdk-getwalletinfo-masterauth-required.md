# 294 — E2E SDK getWalletInfo 테스트 실패 — /v1/wallets/:id/networks GET에 masterAuth 불필요하게 적용

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.8
- **발견일:** 2026-03-09
- **발견 경로:** 오프체인 E2E 테스트 실행 결과
- **상태:** FIXED
- **수정일:** 2026-03-09

## 증상

`interface-admin-mcp-sdk.e2e.test.ts`의 `creates SDK client and calls getWalletInfo + getConnectInfo` 테스트가 실패:

```
WAIaaSError: X-Master-Password header is required
```

## 원인

두 가지 문제가 복합되어 있다:

### 1. 서버 미들웨어 모순 (근본 원인)

서버의 미들웨어 설정 (`server.ts` 218-232줄):
- 218줄: `/v1/wallets/:id` 미들웨어에서 `/networks` 포함 경로를 `next()`로 skip (masterAuth 면제 **의도**)
- **232줄**: `/v1/wallets/:id/networks`에 별도 `masterAuthForOwner` 미들웨어 등록 — 218줄의 의도와 **모순**

두 미들웨어가 모두 매칭되며, 218줄에서 skip해도 232줄의 masterAuth가 적용된다.

```
GET /v1/wallets/uuid/networks
  → middleware#218: path includes '/networks' → next() (skip 의도)
  → middleware#232: masterAuthForOwner → FAIL (no X-Master-Password)
```

### 2. 테스트 코드 부차적 문제

테스트가 `getWalletInfo(walletId)`로 호출하지만 SDK 시그니처는 `getWalletInfo()` (인자 없음). 인자는 무시되므로 동작에 영향은 없지만 코드 정확성 면에서 수정 필요.

## 수정 방안 (권장: 서버 dual-auth)

**읽기/쓰기 분리 원칙**에 따라 `/v1/wallets/:id/networks`에 dual-auth 적용:
- `GET` (네트워크 목록 조회): sessionAuth 허용 — 에이전트 SDK 사용 케이스
- `PUT/POST/DELETE` (네트워크 관리): masterAuth 유지 — 관리자 작업

기존 `/v1/wallets/:id/provider` (236-244줄)와 동일한 패턴:

```typescript
// Before (server.ts:232)
app.use('/v1/wallets/:id/networks', masterAuthForOwner);

// After: dual-auth for GET (sessionAuth) vs mutation (masterAuth)
app.use('/v1/wallets/:id/networks', async (c, next) => {
  if (c.req.method === 'GET') {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer wai_sess_')) {
      return sessionAuth(c, next);
    }
  }
  return masterAuthForOwner(c, next);
});
```

테스트 코드도 함께 수정:
```typescript
// Before
const walletInfo = await sdkClient.getWalletInfo(walletId);

// After
const walletInfo = await sdkClient.getWalletInfo();
```

## 영향 범위

- `packages/daemon/src/api/server.ts` — 미들웨어 설정 (218-232줄)
- `packages/e2e-tests/src/__tests__/interface-admin-mcp-sdk.e2e.test.ts` — 171줄

## 테스트 항목

1. SDK `getWalletInfo()`가 sessionAuth만으로 정상 동작하는지 확인
2. `GET /v1/wallets/:id/networks`가 sessionAuth(Bearer 토큰)로 접근 가능한지 확인
3. `PUT /v1/wallets/:id/networks`는 여전히 masterAuth를 요구하는지 확인
4. MCP `get-wallet-info` 도구가 sessionAuth로 정상 동작하는지 확인
5. 기존 masterAuth 기반 호출도 여전히 동작하는지 확인
