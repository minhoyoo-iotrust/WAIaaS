# #414 — Pendle buy_pt API 응답 스키마 불일치 5회차 재발

- **유형**: BUG
- **심각도**: HIGH
- **영향 시나리오**: defi-09
- **컴포넌트**: `packages/actions/src/providers/pendle/schemas.ts`
- **선행 이슈**: #373 → #398 → #403 → #407 (모두 FIXED, 모두 재발)

## 현상

`POST /v1/actions/pendle_yield/buy_pt?dryRun=true` 호출 시 Zod 검증 에러:
```
Expected array, received object
```
#407에서 `.passthrough()` 추가로 FIXED 처리했으나, 실제 Pendle API 응답에서 여전히 실패.

## 원인

`PendleConvertResponseSchema`(schemas.ts:60-75)의 union 두 분기 모두 실패:
1. `PendleConvertObjectSchema` — 객체 구조가 실제 API 응답과 불일치
2. `z.array(PendleConvertObjectSchema).min(1)` — 응답이 배열이 아니라 객체

#407 수정은 `tx` 객체에 `.passthrough()`만 추가했는데, 이는 extra fields 허용일 뿐 **구조적 불일치를 해결하지 못함**. 실제 Pendle API 응답의 최상위 구조가 스키마 정의와 다를 가능성이 높음.

**핵심 문제**: 테스트가 mock 데이터로만 검증 — mock이 실제 API 응답과 다르므로 테스트는 통과하지만 실 API에서 실패.

## 수정 방향

1. **실제 Pendle API 응답 캡처** — buy_pt 호출 전 raw response를 debug 로그로 기록 (#412와 같은 패턴)
2. 캡처된 실제 응답 기반으로 `PendleConvertObjectSchema` 재정의
3. 테스트에 실제 API 응답 fixture 추가 (mock 기반 테스트의 한계 보완)
4. Pendle API 버전 변경 감지를 위한 스키마 검증 로깅

## 테스트 항목

- [ ] 실제 Pendle API 응답 구조 캡처 및 문서화
- [ ] 캡처된 응답으로 `PendleConvertResponseSchema` 검증 통과
- [ ] buy_pt dryRun 호출 시 정상 시뮬레이션 성공
- [ ] Pendle API 응답 변경 시 명확한 에러 메시지 출력
