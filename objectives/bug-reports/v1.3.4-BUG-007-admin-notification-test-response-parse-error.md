# BUG-007: Admin UI 알림 테스트 응답 파싱 오류 (results 래퍼 미처리)

## 심각도

**MEDIUM** — Admin UI에서 Send Test 버튼 클릭 시 "The system is currently locked" 에러 토스트 표시. curl 직접 호출로 우회 가능.

## 증상

Admin UI(`/admin`) → Notifications 페이지 → Send Test 버튼 클릭 시:
- 텔레그램 알림은 실제로 **정상 전송됨**
- UI에 "The system is currently locked" 에러 토스트 표시
- 테스트 결과 목록(채널별 성공/실패) 미표시

## 재현 방법

```bash
# 1. 데몬 시작 (텔레그램 알림 활성화 상태)
waiaas daemon start --data-dir ~/.waiaas --master-password test1234

# 2. curl로 동일 API 호출 → 정상 동작
curl -s -X POST http://127.0.0.1:3100/v1/admin/notifications/test \
  -H "X-Master-Password: test1234" \
  -H "Content-Type: application/json" \
  -d '{"channel": "telegram"}' | jq .
# → {"results":[{"channel":"telegram","success":true}]}

# 3. 브라우저에서 http://127.0.0.1:3100/admin 접속
#    → 마스터 비밀번호 입력 → Notifications 탭 → Send Test 클릭
#    → "The system is currently locked" 에러 토스트
```

## 원인

### 1차 원인: 응답 타입 불일치

`packages/admin/src/pages/notifications.tsx` 87행에서 API 응답을 `TestResult[]`(배열)로 파싱:

```typescript
const results = await apiPost<TestResult[]>(API.ADMIN_NOTIFICATIONS_TEST);
testResults.value = results;
const allSuccess = results.every((r) => r.success);  // ← TypeError 발생
```

실제 서버 응답 (`packages/daemon/src/api/routes/admin.ts` 457행):

```typescript
return c.json({ results }, 200);  // ← { results: [...] } 객체 반환
```

`apiPost`는 `{ results: [...] }` 객체를 반환하는데, 이를 배열로 취급하여 `.every()` 호출 시 `TypeError: results.every is not a function` 발생.

### 2차 원인: 에러 핸들러의 일반 에러 코드 매핑

`packages/daemon/src/api/middleware/error-handler.ts` 51-58행에서 `WAIaaSError`/`ZodError`가 아닌 일반 에러를 `SYSTEM_LOCKED` 코드로 반환:

```typescript
// Generic error -> 500
return c.json({
  code: 'SYSTEM_LOCKED',
  message: err instanceof Error ? err.message : 'Internal server error',
  ...
}, 500);
```

이 경우 에러는 프론트엔드(브라우저)에서 발생하므로 서버의 error-handler와는 무관. Admin UI의 catch 블록에서 `ApiError`가 아닌 `TypeError`가 잡혀 `UNKNOWN` 코드로 처리되고, `getErrorMessage('UNKNOWN')`이 폴백 메시지를 반환해야 하나, 실제로는 catch에서 `SYSTEM_LOCKED`가 아닌 다른 경로로 에러가 표시됨.

정확한 에러 경로: `apiPost`가 서버 응답 200을 정상 수신 → `{ results: [...] }` 객체를 `TestResult[]`로 캐스트 → `results.every()` 호출 시 `TypeError` → catch 블록에서 `ApiError`가 아닌 `TypeError`로 잡힘 → `new ApiError(0, 'UNKNOWN', 'Unknown error')` → `getErrorMessage('UNKNOWN')` → 폴백 메시지 `"An error occurred (UNKNOWN)."` 반환.

> **참고**: 사용자가 보고한 "The system is currently locked" 메시지는 `SYSTEM_LOCKED` 코드의 매핑 메시지(`error-messages.ts:14`)이므로, 서버 측에서 500이 반환되는 경우도 있을 수 있음. 이는 `apiPost` 내부에서 `response.json()` 파싱 후 추가 처리 중 에러가 서버로 전파되는 시나리오를 의미하며, 재현 환경에 따라 에러 경로가 달라질 수 있음.

## 수정안

### `packages/admin/src/pages/notifications.tsx` 87-88행

```typescript
// Before — 서버 응답을 배열로 잘못 파싱
const results = await apiPost<TestResult[]>(API.ADMIN_NOTIFICATIONS_TEST);
testResults.value = results;

// After — { results: [...] } 래퍼 객체를 올바르게 파싱
const body = await apiPost<{ results: TestResult[] }>(API.ADMIN_NOTIFICATIONS_TEST);
const results = body.results;
testResults.value = results;
```

## 영향 범위

| 항목 | 내용 |
|------|------|
| 파일 | `packages/admin/src/pages/notifications.tsx` (87-88행) |
| 기능 영향 | Admin UI 알림 테스트 결과 표시 불가 — 에러 토스트만 표시 |
| 실제 알림 전송 | **영향 없음** — 서버는 정상적으로 알림 전송 후 200 응답 |
| 우회 방법 | curl로 직접 API 호출 |

## 기존 테스트가 통과한 이유

`packages/admin/src/__tests__/notifications.test.tsx` 165행에서 `apiPost` 호출 여부만 검증하고, 반환값 파싱 로직은 미검증:

```typescript
// 현재 테스트 — apiPost 호출 여부만 확인
expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/v1/admin/notifications/test');
```

`apiPost`가 mock되어 있어 실제 `{ results: [...] }` 래퍼 객체가 아닌 mock 반환값이 사용됨. 응답 파싱 → UI 업데이트 → 토스트 표시 경로가 테스트되지 않음.

## 재발 방지 테스트

### 1. 응답 파싱 + UI 업데이트 통합 테스트 (필수)

```typescript
it('Send Test 성공 시 서버 응답의 results 래퍼를 올바르게 파싱한다', async () => {
  // 실제 서버 응답 구조를 mock
  vi.mocked(apiGet).mockResolvedValueOnce({
    enabled: true,
    channels: [{ name: 'telegram', enabled: true }],
  });
  vi.mocked(apiPost).mockResolvedValueOnce({
    results: [{ channel: 'telegram', success: true }],
  });

  render(<NotificationsPage />);
  await waitFor(() => screen.getByText('Send Test'));

  fireEvent.click(screen.getByText('Send Test'));

  // 성공 토스트 표시 확인
  await waitFor(() => {
    expect(screen.getByText('Test sent successfully')).toBeTruthy();
  });

  // 채널별 결과 표시 확인
  expect(screen.getByText('telegram')).toBeTruthy();
});
```

### 2. 실패 케이스 포함 테스트 (권장)

```typescript
it('Send Test 부분 실패 시 warning 토스트를 표시한다', async () => {
  vi.mocked(apiGet).mockResolvedValueOnce({
    enabled: true,
    channels: [
      { name: 'telegram', enabled: true },
      { name: 'discord', enabled: true },
    ],
  });
  vi.mocked(apiPost).mockResolvedValueOnce({
    results: [
      { channel: 'telegram', success: true },
      { channel: 'discord', success: false, error: '401 Unauthorized' },
    ],
  });

  render(<NotificationsPage />);
  await waitFor(() => screen.getByText('Send Test'));

  fireEvent.click(screen.getByText('Send Test'));

  await waitFor(() => {
    expect(screen.getByText('Some channels failed')).toBeTruthy();
  });
});
```

### 3. API 응답 타입 공유 (권장)

BUG-006과 동일 패턴 — 프론트엔드가 서버 응답 구조를 독립적으로 정의하여 불일치 발생. `@waiaas/core`에서 API 응답 타입을 공유하거나, OpenAPI 스키마에서 자동 생성하는 방안 검토:

```typescript
// packages/core/src/types/api-responses.ts
export interface NotificationTestResponse {
  results: Array<{
    channel: string;
    success: boolean;
    error?: string;
  }>;
}
```

---

*발견일: 2026-02-12*
*마일스톤: v1.3.4*
*상태: FIXED*
*관련: BUG-006 (동일 패턴 — 프론트엔드-서버 응답 구조 불일치)*
