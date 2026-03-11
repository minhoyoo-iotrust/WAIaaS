# #332 .planning 디렉토리 구조 정리

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** OPEN
- **발견일:** 2026-03-11

## 현상

93개 마일스톤(v0.1~v31.8)을 거치며 `.planning/` 디렉토리가 비체계적으로 성장.
2,258 파일, 434 디렉토리, 27MB.

## 문제점

1. **phases/ 마일스톤 소속 불명** — 181개 phase 디렉토리가 플랫하게 나열되어 마일스톤 귀속 관계 파악 불가
2. **구조 마이그레이션 미완료** — v31.9부터 `milestones/v31.9-phases/` 하위 구조 시도했으나 기존 phases/ 1~181은 미이동
3. **milestones/ 내 이질적 항목** — `300-*`, `301-*` phase 디렉토리 2개가 v*- 패턴 아닌 형태로 혼재
4. **거대 루트 파일** — PROJECT.md (172K/1,343줄), MILESTONES.md (132K/2,126줄) 계속 누적 성장
5. **고아 파일** — `v29.0-MILESTONE-AUDIT.md`가 루트에 잔류 (다른 AUDIT은 milestones/ 안)
6. **research/ 네이밍 불일치** — v-prefix, m-prefix, topic-only 접두사 규칙 혼재
7. **deliverables/ 빈 디렉토리** — 미사용

## 정리 방안

- 빈 디렉토리(deliverables/) 삭제
- 고아 파일(v29.0-MILESTONE-AUDIT.md) milestones/로 이동
- milestones/ 내 이질적 phase 디렉토리(300-*, 301-*) 적절한 위치로 이동
- research/ 네이밍 규칙 통일 검토
- phases/ 마일스톤별 그룹핑 또는 아카이브 전략 수립

## 테스트 항목

- 정리 전후 GSD 워크플로우 정상 동작 확인 (config.json 경로 참조)
- `gsd:progress`, `gsd:plan-phase` 등 기존 명령어가 파일 경로 변경에 영향 받지 않는지 검증
