# 398 — Pendle API 응답 스키마 불일치 회귀 — buy_pt 응답이 array가 아닌 object 반환

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **마일스톤:** (미정)
- **발견일:** 2026-03-19

## 현상

`POST /v1/actions/pendle_yield/buy_pt?dryRun=true`으로 PT 매수 시뮬레이션 시 Zod 스키마 검증 실패:

```
invalid_union: [
  { "Expected array, received object" },
  { "results: Required" }
]
```

Pendle API 응답이 array가 아닌 object 형식인데, WAIaaS 스키마가 array를 기대.

## 관련 이슈

- #373 (FIXED, v32.5): "Pendle Yield buy_pt API 응답 스키마 불일치 (array vs object)"
- 동일 증상 재발 — Pendle API 응답 형식이 다시 변경되었거나 #373 수정이 불완전

## 영향

- Pendle Yield buy_pt/redeem_pt 전체 기능 사용 불가
- defi-09 UAT 시나리오 실행 불가

## 수정 방안

1. Pendle API의 현재 응답 형식 확인 (스키마 변경 이력)
2. Zod 스키마를 union으로 확장하여 array/object 모두 허용하거나, 현재 형식에 맞게 수정

## 수정 대상 파일

- `packages/actions/src/providers/pendle/` — 응답 스키마 확인

## 테스트 항목

1. **유닛 테스트**: Pendle API 실제 응답 형식에 대한 스키마 파싱 성공 검증
2. **통합 테스트**: buy_pt dryRun 성공 확인
