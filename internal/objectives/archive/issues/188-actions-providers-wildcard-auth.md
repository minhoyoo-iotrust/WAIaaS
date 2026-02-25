# #188 — Admin UI Actions 페이지에서 프로바이더가 항상 Inactive로 표시

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **발견일:** 2026-02-25
- **관련 이슈:** #170 (v28.4에서 수정된 dual-auth 미스매치의 잔여 버그)

## 증상

- Admin UI Actions 페이지에서 모든 프로바이더(Jupiter Swap, LI.FI, Lido Staking, Jito Staking)가 Enabled 체크 상태임에도 **Inactive**로 표시됨
- 0x Swap은 Requires API Key로 표시 (별도 분기)
- 솔라나/EVM 메인넷+테스트넷 지갑이 모두 존재하고, 데몬 재시작 후에도 동일

## 근본 원인

`packages/daemon/src/api/server.ts`에서 `/v1/actions/providers` GET 요청에 대해 dual-auth 미들웨어(라인 219, 307)가 정상 설정되어 있지만, **라인 231의 `/v1/actions/*` 와일드카드 sessionAuth가 이를 덮어씀**.

```typescript
// 라인 219-230: dual-auth 미들웨어 (정상 통과)
app.use('/v1/actions/providers', async (c, next) => {
  if (c.req.method === 'GET') {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer wai_sess_')) {
      return sessionAuth(c, next);
    }
    await next();  // masterAuth는 아래 블록에서 처리
    return;
  }
  return sessionAuth(c, next);
});

// 라인 231: 이 와일드카드가 /v1/actions/providers에도 매칭됨!
app.use('/v1/actions/*', sessionAuth);  // ← 버그
```

**실행 순서:**
1. Admin UI가 `GET /v1/actions/providers` 요청 (`X-Master-Password` 헤더, `Authorization` 헤더 없음)
2. 라인 219 미들웨어: Authorization 없으므로 `await next()` → 통과
3. **라인 231 `app.use('/v1/actions/*', sessionAuth)`**: `/v1/actions/providers` 경로가 매칭 → sessionAuth 실행 → `X-Master-Password`는 세션 토큰이 아니므로 **401 INVALID_TOKEN**
4. Admin UI `fetchProviders()`가 catch 블록에서 조용히 실패 → `providers.value = []`
5. `isRegistered()`가 항상 false → 모든 프로바이더 **Inactive**

## 수정 방안

`/v1/actions/*` sessionAuth에서 `GET /v1/actions/providers`를 제외:

```typescript
// 수정 전
app.use('/v1/actions/*', sessionAuth);

// 수정 후
app.use('/v1/actions/*', async (c, next) => {
  // GET /v1/actions/providers는 dual-auth 미들웨어에서 처리
  if (c.req.method === 'GET' && c.req.path.endsWith('/actions/providers')) {
    await next();
    return;
  }
  return sessionAuth(c, next);
});
```

## 영향 범위

- Admin UI Actions 페이지의 프로바이더 상태 표시가 항상 Inactive
- 실제 프로바이더 등록/동작에는 영향 없음 (에이전트의 sessionAuth 경로는 정상)
- API 키 설정, Enable/Disable 토글 등 다른 기능은 Admin Settings API(`/v1/admin/*`)를 사용하므로 정상

## 테스트 항목

1. **단위 테스트**: `GET /v1/actions/providers`에 `X-Master-Password` 헤더로 요청 시 200 + 등록된 프로바이더 목록 반환 확인
2. **단위 테스트**: `GET /v1/actions/providers`에 `Bearer wai_sess_*` 토큰으로 요청 시 200 반환 확인 (기존 기능 유지)
3. **단위 테스트**: `POST /v1/actions/:provider/:action`에 sessionAuth가 여전히 적용되는지 확인
4. **통합 테스트**: Admin UI Actions 페이지에서 Enabled 프로바이더가 Active로 표시되는지 확인
