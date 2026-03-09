# 292 — E2E Admin UI root path 테스트가 잘못된 경로(/) 사용 — 실제 서빙 경로는 /admin/

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v31.8
- **발견일:** 2026-03-09
- **발견 경로:** 오프체인 E2E 테스트 실행 결과
- **상태:** OPEN

## 증상

`interface-admin-mcp-sdk.e2e.test.ts`의 `serves Admin UI at root path` 테스트가 404로 실패:

```
expected 404 to be 200 // Object.is equality
```

## 원인

테스트가 `fetch(daemon.baseUrl)` (= `GET /`)로 Admin UI 접근을 확인하지만, 서버는 Admin UI를 `/admin/*` 경로에만 서빙한다.

`packages/daemon/src/api/server.ts` 891-910줄:
- 897줄: `app.use('/admin/*', serveStatic(...))`
- 903줄: `app.get('/admin/*', serveStatic({ path: 'index.html' }))`
- 909줄: `app.get('/admin', (c) => c.redirect('/admin/'))`

root path `/`에는 핸들러가 등록되어 있지 않으므로 404가 반환된다.

## 수정 방안

테스트에서 root path `/` 대신 `/admin/`로 요청하도록 수정:

```typescript
// Before
const res = await fetch(daemon.baseUrl);

// After
const res = await fetch(`${daemon.baseUrl}/admin/`);
```

## 영향 범위

- `packages/e2e-tests/src/__tests__/interface-admin-mcp-sdk.e2e.test.ts` — 53-58줄

## 테스트 항목

1. 수정 후 `GET /admin/`이 200 + `text/html` 반환하는지 확인
2. `GET /` 요청 시 적절한 응답(404 또는 redirect)이 오는지 확인
