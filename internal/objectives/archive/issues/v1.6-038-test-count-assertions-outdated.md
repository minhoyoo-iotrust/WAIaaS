# v1.6-038: v1.6 추가 enum/error code에 대한 테스트 count 미갱신

## 유형: BUG

## 심각도: LOW

## 현상

v1.6 마일스톤에서 새 error code, NotificationEventType, AuditAction이 추가되었으나 해당 count assertion 테스트가 갱신되지 않아 5개 테스트 실패.

## 실패 목록

| 패키지 | 테스트 파일 | 예상 → 실제 | 상태 |
|--------|------------|------------|------|
| @waiaas/core | enums.test.ts | NotificationEventType 21→24 | FIXED |
| @waiaas/core | enums.test.ts | AuditAction 23→25 | FIXED |
| @waiaas/core | errors.test.ts | ERROR_CODES 84→86 | FIXED |
| @waiaas/core | i18n.test.ts | error messages 84→86 | FIXED |
| @waiaas/core | package-exports.test.ts | ERROR_CODES 84→86 | FIXED |
| @waiaas/mcp | server.test.ts | tool count 14→15 | FIXED |
| @waiaas/daemon | api-policies.test.ts | 400 vs 404 (empty rules) | FIXED |

## 수정 내용

모두 해당 테스트 파일의 count 또는 mock 데이터를 갱신하여 수정 완료.

- `packages/core/src/__tests__/enums.test.ts`: 21→24, 23→25
- `packages/core/src/__tests__/errors.test.ts`: 84→86
- `packages/core/src/__tests__/i18n.test.ts`: 84→86
- `packages/core/src/__tests__/package-exports.test.ts`: 84→86
- `packages/mcp/src/__tests__/server.test.ts`: 14→15
- `packages/daemon/src/__tests__/api-policies.test.ts`: empty rules → valid address

## 발견

- v1.6 마일스톤 완료 후 `pnpm test` 실행 시 발견
