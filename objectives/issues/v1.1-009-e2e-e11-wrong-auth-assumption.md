# BUG-009: E2E E-11 테스트가 잘못된 인증 모델을 전제로 작성됨 (401 vs 404)

## 심각도

**LOW** — 기능 장애 없음. 테스트 코드의 설계 오류로 CI에서 1건 실패.

## 증상

`packages/cli/src/__tests__/e2e-errors.test.ts` E-11 테스트 실패:

```
FAIL  E2E Error Handling > E-11: non-existent agent returns 404
AssertionError: expected 401 to be 404 // Object.is equality
```

## 재현 방법

```bash
pnpm test --filter @waiaas/cli
# → e2e-errors.test.ts E-11 실패
```

## 원인

### 테스트의 잘못된 전제

테스트가 존재하지 않는 에이전트에 대해 404를 기대하지만, 인증 없이 요청함:

```typescript
// packages/cli/src/__tests__/e2e-errors.test.ts:39-43
const res = await fetchApi(harness, '/v1/wallet/balance', {
  headers: { 'X-Agent-Id': 'non-existent-agent-id' },  // ← 이 헤더는 미사용
});
expect(res.status).toBe(404);  // ← 실제로는 401
```

### 실제 인증 모델과의 불일치 (3가지)

**1. `X-Agent-Id` 헤더는 존재하지 않는 인터페이스**

코드베이스 전체에서 `X-Agent-Id` 헤더를 읽는 미들웨어나 라우트 핸들러가 없다. `agentId`는 sessionAuth 미들웨어가 JWT 토큰의 `agt` 클레임에서 추출하여 컨텍스트에 설정한다:

```typescript
// packages/daemon/src/api/middleware/session-auth.ts:66-67
c.set('sessionId' as never, session.id);
c.set('agentId' as never, session.agentId);
```

**2. sessionAuth가 에이전트 조회보다 먼저 실행**

`/v1/wallet/*` 라우트에 sessionAuth 미들웨어가 적용되어 있으므로 (`packages/daemon/src/api/server.ts:150`), 인증이 에이전트 조회보다 선행된다:

```
요청 → sessionAuth(토큰 검증, 401) → 라우트 핸들러(에이전트 조회, 404)
```

세션 토큰 없이는 sessionAuth에서 401로 차단되어 에이전트 조회 단계에 도달할 수 없다.

**3. sessionAuth 기반 라우트에서는 "존재하지 않는 에이전트" 시나리오 자체가 불가**

세션 토큰은 실제 존재하는 에이전트에 대해서만 발급된다 (`POST /v1/sessions`에서 agentId 검증). 따라서 유효한 세션 토큰의 `agt` 클레임이 가리키는 에이전트는 항상 존재한다. "존재하지 않는 에이전트 → 404" 시나리오를 sessionAuth 라우트에서 테스트하는 것 자체가 논리적 모순이다.

## 수정안

테스트 의도("존재하지 않는 에이전트 → 404")를 masterAuth 보호 엔드포인트로 변경:

```typescript
// Before — sessionAuth 라우트에 인증 없이 요청 (잘못된 전제)
const res = await fetchApi(harness, '/v1/wallet/balance', {
  headers: { 'X-Agent-Id': 'non-existent-agent-id' },
});
expect(res.status).toBe(404);

// After — masterAuth 라우트에서 존재하지 않는 에이전트 조회
const res = await fetchApi(harness, '/v1/agents/non-existent-agent-id', {
  headers: { 'X-Master-Password': harness.masterPassword },
});
expect(res.status).toBe(404);
const body = (await res.json()) as { code: string };
expect(body.code).toBe('AGENT_NOT_FOUND');
```

`GET /v1/agents/:id`는 masterAuth로 보호되며, URL 파라미터에서 agentId를 추출하므로 존재하지 않는 에이전트에 대해 정상적으로 404를 반환한다.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 파일 | `packages/cli/src/__tests__/e2e-errors.test.ts` (32-49행) |
| 기능 영향 | **없음** — 테스트 코드만 수정 |
| 프로덕션 영향 | **없음** — 데몬의 인증/라우팅 동작은 정상 |

## 기존 테스트가 통과한 이유

이 테스트는 v1.1(코어 인프라) 단계에서 작성되었으며, v1.2(인증 + 정책 엔진)에서 sessionAuth 미들웨어가 `/v1/wallet/*`에 적용되면서 전제가 깨졌다. v1.2 이후 이 테스트가 실행되지 않았거나, 실패가 간과된 것으로 추정.

---

*발견일: 2026-02-12*
*마일스톤: v1.1 (작성), v1.2 (전제 깨짐)*
*상태: FIXED*
*관련: 설계 문서 52(auth-model-redesign) — sessionAuth 적용 범위 정의*
