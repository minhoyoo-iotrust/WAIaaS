---
phase: 168-user-docs
plan: 01
subsystem: docs
tags: [directory-structure, git-mv, docs-internal, user-docs]

# Dependency graph
requires: []
provides:
  - "docs/ 디렉토리 사용자 문서 전용 재편성"
  - "docs-internal/ 내부 설계 문서 디렉토리 (26개 문서)"
  - "docs/why-waiaas/ 프로젝트 가치 설명 문서 (2개)"
affects: [168-02, 168-03]

# Tech tracking
tech-stack:
  added: []
  patterns: ["docs/ = user docs only, docs-internal/ = internal design docs"]

key-files:
  created:
    - "docs-internal/"
    - "docs/why-waiaas/"
  modified:
    - "objectives/design-verification-report.md"
    - "objectives/v2.0-release.md"
    - "docs-internal/64-extension-test-strategy.md"
    - "docs-internal/69-db-migration-v6-design.md"
    - "docs-internal/70-pipeline-network-resolve-design.md"
    - "docs-internal/71-policy-engine-network-extension-design.md"
    - "docs-internal/72-api-interface-dx-design.md"

key-decisions:
  - "docs-internal/ 내부 설계 문서 간 상호 참조도 함께 업데이트"
  - ".planning/ 내부 참조는 계획 지시대로 업데이트하지 않음"

patterns-established:
  - "docs/ 사용자 문서 전용: 설계 문서 금지, 사용자 대상 문서만 배치"
  - "docs-internal/ 내부 설계 문서 전용: 번호 달린 설계 문서(56-72, v0.4/41-51) 보관"

requirements-completed: [DOC-01, DOC-08]

# Metrics
duration: 5min
completed: 2026-02-17
---

# Phase 168 Plan 01: 문서 디렉토리 재편성 Summary

**설계 문서 26개를 docs-internal/로, why-waiaas/ 2개를 docs/why-waiaas/로 git mv 이동하여 docs/ 사용자 문서 전용 구조 확립**

## Performance

- **Duration:** 5min
- **Started:** 2026-02-17T05:46:53Z
- **Completed:** 2026-02-17T05:52:19Z
- **Tasks:** 2
- **Files modified:** 29

## Accomplishments
- docs/ 내 설계 문서 26개(56-72번, v0.4/41-51번)를 docs-internal/로 이동 -- git 이력 보존
- why-waiaas/ 루트 디렉토리의 영문 문서 2개를 docs/why-waiaas/로 이동 -- git 이력 보존
- objectives/design-verification-report.md 및 docs-internal/ 내 상호 참조 경로 전수 업데이트

## Task Commits

Each task was committed atomically:

1. **Task 1: 설계 문서 docs/ -> docs-internal/ 이동** - `8a4297f` (chore)
2. **Task 2: why-waiaas/ -> docs/why-waiaas/ 이동** - `b2e7882` (chore)

## Files Created/Modified
- `docs-internal/56~72-*.md` - 설계 문서 15개 이동 (56-64, 67-72)
- `docs-internal/v0.4/41~51-*.md` - v0.4 테스트 설계 문서 11개 이동
- `docs/why-waiaas/001-ai-agent-wallet-security-crisis.md` - AI 에이전트 지갑 보안 위기 문서 이동
- `docs/why-waiaas/002-ai-agent-wallet-models-compared.md` - AI 에이전트 지갑 모델 비교 문서 이동
- `objectives/design-verification-report.md` - 파일 경로 참조 docs/ -> docs-internal/ 업데이트
- `objectives/v2.0-release.md` - why-waiaas/ -> docs/why-waiaas/ 참조 업데이트
- `docs-internal/64-extension-test-strategy.md` - 내부 상호 참조 경로 업데이트
- `docs-internal/69-db-migration-v6-design.md` - 참조 기반 경로 업데이트
- `docs-internal/70-pipeline-network-resolve-design.md` - 참조 기반 경로 업데이트
- `docs-internal/71-policy-engine-network-extension-design.md` - 참조 기반 경로 업데이트
- `docs-internal/72-api-interface-dx-design.md` - 참조 기반 경로 업데이트

## Decisions Made
- docs-internal/ 내부 설계 문서 간 상호 참조(참조 기반 헤더, 파일 경로 목록)도 함께 업데이트하여 일관성 확보
- 설계 문서 내 약식 참조(예: "docs/68 섹션 3.1")는 문서 번호 참조이므로 업데이트하지 않음
- .planning/ 내부 참조는 계획 지시에 따라 업데이트하지 않음 (내부 계획 문서 이력)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] docs-internal/ 내부 상호 참조 경로 업데이트**
- **Found during:** Task 1 (설계 문서 이동)
- **Issue:** 이동된 설계 문서들(69, 70, 71, 72, 64)이 다른 설계 문서를 `docs/` 경로로 참조하고 있어 참조가 깨짐
- **Fix:** docs-internal/ 내 5개 파일의 참조 기반 헤더와 파일 경로 목록을 `docs-internal/` 경로로 업데이트
- **Files modified:** docs-internal/64, 69, 70, 71, 72
- **Verification:** grep 확인으로 docs-internal/ 내 `docs/` 경로 파일 참조가 모두 `docs-internal/`로 변환됨
- **Committed in:** 8a4297f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** 설계 문서 간 상호 참조 무결성 유지에 필수적. 스코프 변경 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- docs/ 디렉토리가 사용자 문서 전용으로 비워졌으며 docs/why-waiaas/만 존재
- Plan 02 (README + CONTRIBUTING) 및 Plan 03 (API 레퍼런스 + 배포 가이드)에서 docs/ 하위에 사용자 문서 생성 가능
- docs-internal/에 내부 설계 문서 전체 보존 완료

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 168-user-docs*
*Completed: 2026-02-17*
