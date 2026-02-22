# #147 validate-openapi.ts `@see` 주석 경로 불일치

- **유형:** BUG
- **심각도:** LOW
- **마일스톤:** v2.0 (이연)
- **상태:** OPEN

## 현재 상태

- `validate-openapi.ts` 파일 내 `@see` 주석이 참조하는 파일 경로가 실제 파일 위치와 불일치
- 파일 구조 변경 후 주석이 갱신되지 않은 것으로 추정
- v2.0 Milestone Audit에서 식별, v2.0.5로 이연됨

## 수정 방향

- `validate-openapi.ts`의 `@see` 주석이 참조하는 경로를 실제 파일 위치로 갱신

### 수정 대상 파일

- `validate-openapi.ts` (정확한 위치 확인 필요)

## 출처

- v2.0 Milestone Audit
- `.planning/MILESTONES.md` lines 55

## 테스트 항목

- [ ] `@see` 주석이 참조하는 파일이 실제로 존재하는지 확인
