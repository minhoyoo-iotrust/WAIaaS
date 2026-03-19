# 407 — Pendle API 응답 스키마 불일치 4회차 재발 — array vs object

- **유형:** BUG
- **심각도:** HIGH
- **발견일:** 2026-03-19
- **발견 경로:** Agent UAT defi-09 (Pendle Yield Trading PT)
- **상태:** OPEN
- **관련 이슈:** #373, #398, #403 (동일 패턴 반복)

## 증상

`POST /v1/actions/pendle_yield/buy_pt?dryRun=true` 호출 시 Zod 유효성 검증 실패:
```
Expected array, received object
```

## 근본 원인

**기존 수정 코드(union 스키마 + 정규화)는 올바르게 구현되어 있으나, 빌드 산출물이 최신 소스를 반영하지 않거나 다른 코드 경로에서 검증이 실패하는 것으로 추정.**

### 소스 코드 상태 (올바르게 구현됨)

| 파일 | 위치 | 상태 |
|------|------|------|
| `packages/actions/src/providers/pendle/schemas.ts:70-72` | `PendleConvertResponseSchema` | OK — `z.union([Object, z.array(Object).min(1)])` |
| `packages/actions/src/providers/pendle/pendle-api-client.ts:70` | `convert()` 정규화 | OK — `Array.isArray(raw) ? raw[0]! : raw` |
| `packages/actions/src/providers/pendle/__tests__/pendle-api-client.test.ts:211-229` | 배열 정규화 테스트 | OK — #403 수정 테스트 존재 |

### 에러 메시지 분석

에러: `Expected array, received object` — 이것은 **`z.array()` 스키마에 object가 전달된 것**이 아니라, `z.union()` 내부에서 두 분기 모두 실패한 것을 나타냄:
1. 첫 번째 분기 (`PendleConvertObjectSchema`): 실패 시 다음 시도
2. 두 번째 분기 (`z.array(PendleConvertObjectSchema).min(1)`): `Expected array, received object` — object를 array로 파싱하려다 실패

이는 **Pendle API 응답의 object 구조가 `PendleConvertObjectSchema`와 불일치**함을 의미. 즉, 배열/객체 형식 문제가 아니라 **객체 내부 필드가 스키마와 다른 것**이 진짜 원인.

### 이력

| 이슈 | 날짜 | 수정 내용 |
|------|------|-----------|
| #373 | 2026-03-16 | 최초 발견 — object 응답 처리 |
| #398 | 2026-03-19 | 2회차 — array 응답 처리 추가 |
| #403 | 2026-03-19 | 3회차 — union 스키마 + 정규화 |
| #407 | 2026-03-19 | 4회차 — 기존 수정에도 불구하고 재발 |

## 수정 방향

1. **빌드 산출물 확인**: `packages/actions/dist/` 내 컴파일된 JS가 최신 소스를 반영하는지 확인 (`pnpm turbo run build --filter=@waiaas/actions`)
2. **Pendle API 실제 응답 캡처**: 런타임에서 `/v2/sdk/{chainId}/convert` 응답 원문을 로깅하여 실제 필드 구조 확인
3. **`PendleConvertObjectSchema` 필드 검증**: Pendle API가 반환하는 필드가 스키마와 정확히 일치하는지 확인 — 새 필드 추가/기존 필드 제거/타입 변경 가능성
4. **`.passthrough()` 적용 고려**: 외부 API 응답이 빈번히 변경되므로 `PendleConvertObjectSchema.passthrough()`로 알려지지 않은 필드를 허용

## 테스트 항목

- [ ] `pnpm turbo run build` 후 재시도하여 빌드 캐시 문제 배제
- [ ] Pendle API 실제 응답 원문과 `PendleConvertObjectSchema` 필드 대조
- [ ] buy_pt dryRun 호출 시 정상 응답 반환
- [ ] 배열/객체 양쪽 형식 모두 처리 확인
