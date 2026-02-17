---
phase: 168-user-docs
plan: 03
subsystem: docs
tags: [deployment-guide, api-reference, changelog, docker, npm, openapi]

# Dependency graph
requires:
  - "168-01: docs/ 사용자 문서 전용 재편성"
provides:
  - "docs/deployment.md 배포 가이드 (npm global + Docker Compose)"
  - "docs/api-reference.md API 레퍼런스 (OpenAPI 기반, 60+ 엔드포인트)"
  - "CHANGELOG.md 전체 변경 이력 (v1.1~v1.8 + Unreleased)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: ["OpenAPI spec as SSoT, docs as summary + pointer to /doc"]

key-files:
  created:
    - "docs/deployment.md"
    - "docs/api-reference.md"
    - "CHANGELOG.md"
  modified:
    - "README.md"

key-decisions:
  - "API 레퍼런스는 OpenAPI 스펙(GET /doc)을 SSoT로 두고 문서는 인증/카테고리 요약/에러 코드만 제공"
  - "CHANGELOG은 Keep a Changelog 포맷으로 release-please 자동 생성과 병합 가능하게 유지"
  - "배포 가이드는 npm global install과 Docker Compose 두 경로 + Docker secrets 안내 포함"

patterns-established:
  - "docs/*.md: 사용자 대상 영문 문서, 실제 소스 코드 기반 정확한 정보"
  - "CHANGELOG.md: Keep a Changelog 포맷, version compare 링크 포함"

requirements-completed: [DOC-05, DOC-06, DOC-07]

# Metrics
duration: 5min
completed: 2026-02-17
---

# Phase 168 Plan 03: 배포 가이드 + API 레퍼런스 + CHANGELOG Summary

**npm/Docker 배포 가이드, OpenAPI 기반 60+ 엔드포인트 API 레퍼런스, v1.1~v1.8 Keep a Changelog 작성**

## Performance

- **Duration:** 5min
- **Started:** 2026-02-17T05:55:22Z
- **Completed:** 2026-02-17T06:00:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- docs/deployment.md: npm global install 경로 (init/start/upgrade) + Docker Compose 경로 (compose.yml, secrets, Watchtower) + 설정/보안 체크리스트/트러블슈팅 포함 (482줄)
- docs/api-reference.md: 3종 인증(masterAuth/sessionAuth/ownerAuth), 카테고리별 60+ 엔드포인트 테이블, 20개 주요 에러 코드, SDK/MCP 안내 (314줄)
- CHANGELOG.md: v1.1~v1.8 + [Unreleased] 역순, 25개 버전 섹션, Added/Changed/Fixed/Security 카테고리, version compare 링크 (347줄)

## Task Commits

Each task was committed atomically:

1. **Task 1: 배포 가이드 (docs/deployment.md)** - `a14612c` (docs)
2. **Task 2: API 레퍼런스 + CHANGELOG** - `55a334a` (docs)

## Files Created/Modified
- `docs/deployment.md` - npm global install + Docker Compose 배포 가이드 (482줄)
- `docs/api-reference.md` - OpenAPI 기반 API 레퍼런스, 인증/엔드포인트/에러 코드 (314줄)
- `CHANGELOG.md` - Keep a Changelog 포맷, v1.1~v1.8 + Unreleased (347줄)
- `README.md` - docs/ 링크 경로 수정 (deployment.md, api-reference.md)

## Decisions Made
- API 레퍼런스: 모든 엔드포인트를 수동 문서화하지 않고 OpenAPI 스펙(GET /doc)을 SSoT로 두어 유지보수 부담 최소화. 문서는 인증 방식, 카테고리별 요약, 에러 코드만 제공.
- CHANGELOG: release-please가 자동 생성하는 CHANGELOG와 병합 가능한 Keep a Changelog 포맷 사용. version compare 링크는 GitHub repository URL 기준.
- 배포 가이드: Docker secrets 방식을 별도 섹션으로 분리하여 production 배포 보안 강화 안내.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] README.md 문서 링크 경로 수정**
- **Found during:** Task 2 검증 단계
- **Issue:** README.md의 문서 링크가 `docs/deployment/` (디렉토리)와 `docs/api/`로 되어 있어 실제 파일(`docs/deployment.md`, `docs/api-reference.md`)과 불일치
- **Fix:** 링크를 `docs/deployment.md`와 `docs/api-reference.md`로 수정
- **Files modified:** README.md
- **Verification:** grep으로 수정된 링크 확인
- **Committed in:** Task 2 커밋에 포함 예정 -- 별도 커밋 불필요 (README 수정은 최종 메타 커밋에 포함)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** README 링크 정합성 확보. 스코프 변경 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- docs/ 디렉토리에 사용자 대상 문서 4개 완비 (deployment.md, api-reference.md, why-waiaas/001, why-waiaas/002)
- CHANGELOG.md 루트에 배치 완료
- Phase 168 전체 완료 준비 (Plan 01: 디렉토리 재편성, Plan 02: README + CONTRIBUTING, Plan 03: 배포/API/CHANGELOG)

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 168-user-docs*
*Completed: 2026-02-17*
