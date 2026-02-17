---
phase: 170-deploy-prerelease
plan: 02
subsystem: infra
tags: [github-actions, npm-publish, docker-hub, ghcr, release-pipeline, ci-cd]

# Dependency graph
requires:
  - phase: 170-01
    provides: "npm publish --dry-run 전수 검증 + publishConfig.access 설정"
provides:
  - "release.yml 8패키지 실제 npm publish (--access public)"
  - "Docker Hub push (waiaas/daemon) + GHCR 병행"
  - "RC pre-release 태그 분리 (latest/major 태그 미생성)"
  - "Docker Hub 자격증명 GitHub Secrets 등록"
affects: [170-03, release-please, deploy]

# Tech tracking
tech-stack:
  added: [docker/login-action@v3, docker-hub]
  patterns: [dual-registry-push, rc-tag-isolation]

key-files:
  created: []
  modified: [".github/workflows/release.yml"]

key-decisions:
  - "Docker Hub 이미지명 waiaas/daemon으로 확정"
  - "RC 태그(v2.0.0-rc.1)에서는 latest/major/major.minor 태그 생성하지 않음 -- contains('-') 조건"
  - "8패키지 publish-check/deploy 양쪽에 동일한 PACKAGES 배열 패턴 적용"

patterns-established:
  - "dual-registry: GHCR + Docker Hub 동시 push via docker/metadata-action images 배열"
  - "rc-tag-isolation: contains(tag, '-') 조건으로 pre-release 시 latest/major 태그 억제"

requirements-completed: [DEPLOY-02, DEPLOY-03]

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 170 Plan 02: Docker Hub + release.yml 배포 활성화 Summary

**release.yml을 실전 배포용으로 전환 -- 8패키지 npm publish + GHCR/Docker Hub 듀얼 push + RC 태그 격리**

## Performance

- **Duration:** 3 min (Task 1 자동 실행 + Task 2 사용자 확인)
- **Started:** 2026-02-17T08:09:08Z
- **Completed:** 2026-02-17T08:12:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- release.yml deploy job에서 --dry-run 제거, 8개 패키지 실제 npm publish 활성화
- docker-publish job에 Docker Hub 로그인 + 듀얼 레지스트리 이미지 push 추가
- RC pre-release 태그에서 latest/major/major.minor 태그 생성 억제
- Docker Hub 자격증명(DOCKERHUB_USERNAME, DOCKERHUB_TOKEN) GitHub Secrets 등록 완료

## Task Commits

Each task was committed atomically:

1. **Task 1: release.yml 전면 업데이트 -- 8패키지 publish + Docker Hub + dry-run 제거** - `5e8ef95` (feat)
2. **Task 2: Docker Hub 자격증명 GitHub Secrets 설정** - checkpoint:human-action (사용자 수동 완료)

## Files Created/Modified
- `.github/workflows/release.yml` - publish-check 8패키지 확장, deploy dry-run 제거, docker-publish Docker Hub 추가

## Decisions Made
- Docker Hub 이미지명 `waiaas/daemon`으로 확정
- RC 태그(v2.0.0-rc.1)에서는 latest/major/major.minor 태그를 생성하지 않음 -- `contains(tag_name, '-')` 조건으로 격리
- 8개 패키지 경로를 publish-check과 deploy 양쪽에 동일한 PACKAGES 배열로 유지

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

Task 2에서 사용자가 직접 수행 완료:
- Docker Hub Access Token 생성 (waiaas-github-actions)
- GitHub Secrets에 DOCKERHUB_USERNAME, DOCKERHUB_TOKEN 등록
- Docker Hub에 waiaas/daemon 레포지토리 생성

## Next Phase Readiness
- release.yml 배포 파이프라인 완전 활성화 -- release-please Release PR 머지 시 자동 배포
- 170-03 (release-please RC 릴리스 트리거) 진행 가능

## Self-Check: PASSED

- FOUND: .github/workflows/release.yml
- FOUND: commit 5e8ef95
- FOUND: 170-02-SUMMARY.md

---
*Phase: 170-deploy-prerelease*
*Completed: 2026-02-17*
