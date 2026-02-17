# v2.0-064: session-auth 보안 테스트 변수명 오류 — lint 수정 시 사용처 누락

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-02-17
- **마일스톤:** v2.0

## 현상

`session-auth-attacks.security.test.ts`의 SEC-01-04 테스트 1건이 `walletA is not defined` 에러로 실패.

```
× SEC-01-04: cross-wallet session hijacking > prevents wallet-A token from accessing wallet-B data via session isolation
    → walletA is not defined
```

## 원인

PR #2의 lint 수정(커밋 `dcb9c3a`)에서 ESLint `no-unused-vars` 경고를 해결하기 위해 160행의 `walletA`를 `_walletA`로 변경했으나, 168행·179행에서 여전히 `walletA`로 참조하는 사용처를 누락.

```typescript
// 160행: 선언부 — lint 수정으로 _walletA로 변경됨
const { walletId: _walletA, sessionId: sessionA } = seedSecurityTestData(conn.sqlite, {

// 168행: 사용부 — 변경되지 않아 ReferenceError 발생
const tokenA = await signTestToken(jwtManager, sessionA, walletA);

// 179행: 사용부 — 동일
expect(body.walletId).toBe(walletA);
```

## 해결 방안

160행의 `_walletA`를 `walletA`로 원복:

```typescript
const { walletId: walletA, sessionId: sessionA } = seedSecurityTestData(conn.sqlite, {
```

184행의 `_walletA`는 별도 테스트 스코프에서 실제로 미사용이므로 `_walletA` 유지.

## 영향 범위

- SEC-01-04 보안 테스트 1건 실패
- CI 파이프라인: daemon 유닛테스트 단계 실패
- PR #2 (`gsd/v2.0-milestone` → `main`) 머지 차단
