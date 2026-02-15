# 028: Admin UI 알림 테스트가 SYSTEM_LOCKED 에러로 실패 — 빈 body 파싱 오류

## 심각도

**MEDIUM** — 관리자가 알림 채널 정상 동작 여부를 테스트할 수 없다.

## 증상

- Admin UI Notifications 페이지에서 "Send Test" 버튼 클릭 시 "The system is currently locked" 에러 표시
- 실제로는 Kill Switch가 활성화되지 않았음에도 이 에러가 발생
- 알림 채널 테스트가 불가능

## 원인

### 프론트엔드: body 없이 POST + Content-Type: application/json

```typescript
// notifications.tsx:87
const body = await apiPost<{ results: TestResult[] }>(API.ADMIN_NOTIFICATIONS_TEST);

// client.ts:64-65 — body가 undefined이면 JSON body 미전송
export const apiPost = <T>(path: string, body?: unknown) =>
  apiCall<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

// client.ts:16 — 항상 Content-Type: application/json 설정
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  ...
};
```

결과: `Content-Type: application/json` 헤더는 있지만 body가 없는 POST 요청 전송.

### 백엔드: 빈 body JSON 파싱 실패 → generic error handler가 SYSTEM_LOCKED 반환

Hono 또는 OpenAPI 검증 단계에서 빈 body를 JSON 파싱하려다 에러 발생. 이 에러가 WAIaaSError가 아니므로 generic error handler가 catch-all로 `SYSTEM_LOCKED` 코드를 반환:

```typescript
// error-handler.ts:50-59
return c.json({
  code: 'SYSTEM_LOCKED',  // catch-all — 실제 에러 코드가 아님
  message: err instanceof Error ? err.message : 'Internal server error',
}, 500);
```

핸들러 내부의 `c.req.json().catch(() => ({}))` 방어 코드에 도달하기 전에 에러가 발생하는 것으로 추정.

## 수정안

### 1. 프론트엔드 수정 (즉시)

```typescript
// notifications.tsx — 변경
const body = await apiPost<{ results: TestResult[] }>(API.ADMIN_NOTIFICATIONS_TEST, {});
//                                                                                   ^^
// 빈 객체 전송 → JSON.stringify({}) = '{}' → 유효한 JSON body
```

### 2. 백엔드 수정 (근본)

generic error handler가 모든 미처리 에러를 `SYSTEM_LOCKED`로 반환하는 것은 디버깅을 어렵게 만든다. 실제 에러 코드를 `INTERNAL_ERROR` 등으로 변경하는 것을 검토:

```typescript
// error-handler.ts — 개선 검토
return c.json({
  code: 'INTERNAL_ERROR',  // SYSTEM_LOCKED 대신 범용 코드
  message: err instanceof Error ? err.message : 'Internal server error',
}, 500);
```

단, `INTERNAL_ERROR` 코드 추가는 별도 검토 필요. 이 이슈에서는 프론트엔드 수정(빈 객체 전송)만으로 해결.

## 재발 방지 테스트

### T-1: 빈 body POST 시 정상 응답

`POST /v1/admin/notifications/test`에 `{}` body를 전송하면 200 응답과 `results` 배열이 반환되는지 검증.

### T-2: body 없는 POST 시 에러 메시지 명확성

body 없이 POST 전송 시 `SYSTEM_LOCKED`가 아닌 명확한 에러(예: `ACTION_VALIDATION_FAILED`)가 반환되는지 검증.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 수정 파일 | `packages/admin/src/pages/notifications.tsx` (즉시 수정) |
| 선택 수정 | `packages/daemon/src/api/middleware/error-handler.ts` (catch-all 코드 개선) |
| 테스트 | 2건 추가 |
| 하위호환 | 프론트엔드만 변경, 기존 동작 영향 없음 |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.6*
*상태: OPEN*
*유형: BUG*
*관련: Admin UI 알림 (`packages/admin/src/pages/notifications.tsx`), error-handler catch-all*
