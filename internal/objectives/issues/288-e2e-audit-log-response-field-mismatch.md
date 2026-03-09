# 288 — E2E audit-log 테스트 응답 필드 불일치 (items vs data)

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v31.8
- **발견일:** 2026-03-09
- **발견 경로:** 로컬 E2E 오프체인 스모크 테스트
- **상태:** FIXED
- **수정일:** 2026-03-09

## 증상

`ops-audit-backup.e2e.test.ts` > `audit-log-existence`에서 2개 테스트 실패:

```
AssertionError: expected undefined to be defined
```

`body.items`가 undefined — 실제 응답에 `items` 키가 존재하지 않음.

## 원인

테스트가 기대하는 응답:
```typescript
{ items: Array<{ id: string; event_type: string }> }
```

실제 `GET /v1/audit-logs` API 응답 (`AuditLogResponseSchema`):
```json
{
  "data": [...],
  "nextCursor": null,
  "hasMore": false,
  "total": 10
}
```

응답 필드명이 `items`가 아닌 `data`임. 테스트 작성 시 API 응답 스키마를 잘못 참조한 것.

## 수정 방안

테스트의 타입과 assertion을 `items` → `data`로 변경:

```typescript
const { status, body } = await session.admin.get<{
  data: Array<{ id: string; event_type: string }>;
  nextCursor: number | null;
  hasMore: boolean;
}>('/v1/audit-logs', adminHeaders());
expect(status).toBe(200);
expect(body.data).toBeDefined();
expect(Array.isArray(body.data)).toBe(true);
expect(body.data.length).toBeGreaterThan(0);
```

## 영향 범위

- `packages/e2e-tests/src/__tests__/ops-audit-backup.e2e.test.ts` — 2곳 수정 (line 48-54, line 58-63)

## 테스트 항목

1. `body.data` 접근 시 배열 반환 확인
2. `limit=5` 쿼리 시 최대 5개 항목 반환 확인
3. 기존 backup-restore 테스트 회귀 없음 확인
