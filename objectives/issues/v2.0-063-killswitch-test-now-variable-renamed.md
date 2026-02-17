# v2.0-063: killswitch 보안 테스트 변수명 오류 — lint 수정 시 사용처 누락

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-02-17
- **마일스톤:** v2.0

## 현상

`killswitch-attacks.security.test.ts`의 SEC-03 테스트 23건이 `now is not defined` 에러로 전체 실패.

```
× SEC-03-01: ACTIVATED(SUSPENDED) state blocks protected APIs > GET /v1/wallet/balance returns 503 SYSTEM_LOCKED when kill switch SUSPENDED
    → now is not defined
```

## 원인

PR #2의 lint 수정(커밋 `dcb9c3a`)에서 ESLint `no-unused-vars` 경고를 해결하기 위해 62행의 `now`를 `_now`로 변경했으나, 67행에서 여전히 `now`로 참조하는 사용처를 누락.

```typescript
// 62행: 선언부 — lint 수정으로 _now로 변경됨
const _now = Math.floor(Date.now() / 1000);

// 67행: 사용부 — 변경되지 않아 ReferenceError 발생
.run('kill_switch_state', 'ACTIVE', now);
```

실제로 `now`는 67행에서 사용되므로 `_now`가 아닌 `now`가 올바른 변수명.

## 해결 방안

62행의 `_now`를 `now`로 원복:

```typescript
// before
const _now = Math.floor(Date.now() / 1000);

// after
const now = Math.floor(Date.now() / 1000);
```

353행의 `_now`는 실제로 미사용이므로 `_now` 유지가 올바름.

## 영향 범위

- SEC-03 보안 테스트 23건 전체 실패
- CI 파이프라인: daemon 유닛테스트 단계 실패
- PR #2 (`gsd/v2.0-milestone` → `main`) 머지 차단

## 재발 방지

- 변수명 변경 시 해당 스코프 내 모든 참조를 검색하여 동기화
- CI에서 테스트 실행으로 이미 감지되므로 추가 조치 불필요
