# #336 Across Bridge status API depositId Zod 타입 불일치

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** FIXED
- **수정일:** 2026-03-11
- **마일스톤:** v31.10
- **발견일:** 2026-03-11
- **발견 경위:** defi-04 Agent UAT 재테스트 (Across Bridge Arb→Base)

## 증상

`POST /v1/actions/across_bridge/status` 호출 시 `ACTION_RESOLVE_FAILED` 에러 반환:

```json
{
  "code": "ACTION_RESOLVE_FAILED",
  "message": "Action resolve failed: [{\"code\":\"invalid_type\",\"expected\":\"number\",\"received\":\"string\",\"path\":[\"depositId\"],\"message\":\"Expected number, received string\"}]"
}
```

## 원인

Across Protocol API의 `/deposit/status` 응답에서 `depositId` 필드가 **문자열**로 반환되는데, `AcrossDepositStatusResponseSchema`는 `z.number()`로 정의되어 있어 Zod 파싱 실패.

- 파일: `packages/actions/src/providers/across/schemas.ts:91`
- 현재: `depositId: z.number().optional()`
- Across API 실제 응답: `"depositId": "12345"` (string)

## 영향

- `across_bridge/status` action이 100% 실패 — 브릿지 fill 상태 추적 불가
- 브릿지 자체(execute)는 정상 동작하나, 상태 모니터링 API가 사용 불가
- `AcrossBridgeStatusTracker`의 `checkStatus()`/`waitForCompletion()` 도 동일 영향

## 수정 방안

`z.number()` → `z.coerce.number()`로 변경하여 문자열→숫자 자동 변환:

```typescript
// packages/actions/src/providers/across/schemas.ts:91
depositId: z.coerce.number().optional(),
```

## 관련 파일

| 파일 | 설명 |
|------|------|
| `packages/actions/src/providers/across/schemas.ts:91` | Zod 스키마 정의 (수정 대상) |
| `packages/actions/src/providers/across/index.ts:472` | `resolveStatus()`에서 `result.depositId` 참조 |
| `packages/actions/src/providers/across/bridge-status-tracker.ts:41` | `mapAcrossStatus()`에서 `response.depositId` 참조 |
| `packages/actions/src/providers/across/__tests__/schemas.test.ts:82` | 테스트에서 `depositId: 42` (number) 사용 — string 케이스 추가 필요 |

## 테스트 항목

- [ ] `AcrossDepositStatusResponseSchema`가 `depositId` 문자열 입력을 number로 파싱하는지 확인
- [ ] `AcrossDepositStatusResponseSchema`가 `depositId` number 입력도 여전히 정상 파싱하는지 확인
- [ ] `across_bridge/status` action이 실제 Across API 응답으로 정상 동작하는지 E2E 확인
- [ ] `AcrossBridgeStatusTracker.checkStatus()`가 정상 상태 반환하는지 단위 테스트
