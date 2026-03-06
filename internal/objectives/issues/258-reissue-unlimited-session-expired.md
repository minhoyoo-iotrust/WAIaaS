# #258 Admin 세션 Reissue가 무제한 세션을 만료로 판정 — expiresAt=0 가드 누락

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.3
- **상태:** FIXED

## 현상

Admin UI 세션 관리자에서 Reissue 버튼 클릭 시 "Session not found." 에러가 발생한다. 모든 무제한 세션(Expires At: Never)에서 재현된다.

## 원인

`admin.ts:2667`의 만료 검사에서 `expiresAt = 0`(무제한) 케이스를 고려하지 않음:

```typescript
// admin.ts:2667 — BUG
if (expiresAtSec <= nowSec) {  // 0 <= 1772800717 → true → "Session expired"
  throw new WAIaaSError('SESSION_NOT_FOUND', { message: 'Session expired' });
}
```

동일한 패턴이 `sessions.ts:847`의 rotate 라우트에서는 올바르게 처리됨:

```typescript
// sessions.ts:847 — CORRECT
if (expiresAtSec > 0 && expiresAtSec <= nowSec) { ... }
```

## 근본 원인 — 반복 방지 방안

`expiresAt = 0`이 "무제한"을 의미하는 매직 넘버 컨벤션이 코드 전반에 분산되어 있어, 새 코드 작성 시 가드 조건 누락이 반복된다. 재발 방지를 위한 방안:

### 1. 헬퍼 함수 도입 (권장 — 최소 변경)

```typescript
// src/utils/session-helpers.ts
export function isSessionExpired(expiresAtSec: number, nowSec: number): boolean {
  return expiresAtSec > 0 && expiresAtSec <= nowSec;
}

export function isUnlimitedSession(expiresAtSec: number): boolean {
  return expiresAtSec === 0;
}
```

모든 만료 검사 지점을 이 헬퍼로 교체하면, `expiresAt = 0` 시맨틱이 한 곳에서만 관리된다.

### 2. 기존 분산된 만료 검사 통합

현재 `expiresAt` 만료 비교가 최소 6곳에 분산:
- `daemon.ts:1473,1485` — 세션 클린업 워커 (SQL, `expires_at > 0 AND ...` ✅)
- `sessions.ts:427` — 세션 상태 판정 (`expiresAtSec === 0 ? 'ACTIVE' : ...` ✅)
- `sessions.ts:847` — rotate 라우트 (`expiresAtSec > 0 && ...` ✅)
- `admin.ts:2667` — reissue 라우트 (가드 누락 ❌)

헬퍼 함수 도입 후 전체 교체하면 동일 패턴의 누락을 구조적으로 방지할 수 있다.

## 수정 방안

1. `admin.ts:2667` 만료 검사에 `expiresAtSec > 0` 가드 추가
2. `isSessionExpired()` 헬퍼 함수 추출 및 전체 만료 검사 지점 교체
3. 무제한 세션 reissue 테스트 케이스 추가

## 영향 범위

- `packages/daemon/src/api/routes/admin.ts` — reissue 라우트 만료 검사
- (선택) `packages/daemon/src/utils/session-helpers.ts` — 신규 헬퍼
- (선택) `sessions.ts`, `daemon.ts` — 기존 만료 검사를 헬퍼로 교체

## 테스트 항목

- [ ] `expiresAt = 0` (무제한) 세션에 대해 reissue 성공 확인
- [ ] `expiresAt > now` (유효) 세션에 대해 reissue 성공 확인
- [ ] `expiresAt > 0 && expiresAt <= now` (만료) 세션에 대해 SESSION_NOT_FOUND 확인
- [ ] revoked 세션에 대해 SESSION_REVOKED 확인
- [ ] (헬퍼 도입 시) isSessionExpired 단위 테스트: 0, 미래, 과거 값
