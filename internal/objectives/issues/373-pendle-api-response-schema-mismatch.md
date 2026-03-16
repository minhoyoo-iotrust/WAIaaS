# #373 — Pendle Yield buy_pt API 응답 스키마 불일치 (array vs object)

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** FIXED

## 설명

Pendle Yield `buy_pt` 액션 실행 시 Pendle API v2 응답이 object 형식인데, WAIaaS Zod 스키마가 array를 기대하여 파싱 실패. Pendle API 응답 형식 변경 대응이 필요하다.

## 에러 메시지

```
ACTION_RESOLVE_FAILED: Expected array, received object (path: [])
```

## 영향 범위

- defi-09 (Pendle Yield UAT) 실행 불가
- MCP `action_pendle_yield_*` 도구 전체 차단

## 테스트 항목

- [ ] Pendle buy_pt dryRun 성공 확인
- [ ] Pendle buy_pt 실제 실행 및 CONFIRMED 확인
