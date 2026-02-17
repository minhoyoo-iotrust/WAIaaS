---
phase: 162-compatibility-docker
plan: 02
subsystem: infra
tags: [docker, watchtower, ghcr, oci-labels, ci-cd, github-actions]

# Dependency graph
requires:
  - phase: 162-compatibility-docker plan 01
    provides: "release.yml 4-stage CI/CD 파이프라인"
provides:
  - "Dockerfile OCI 표준 라벨 + Watchtower 호환 라벨"
  - "release.yml docker-publish job (GHCR 3-tier 태깅)"
affects: [163-release-please, 164-sync-integration]

# Tech tracking
tech-stack:
  added: [docker/metadata-action@v5, docker/login-action@v3]
  patterns: [3-tier-docker-tagging, oci-standard-labels, watchtower-auto-update]

key-files:
  modified:
    - Dockerfile
    - .github/workflows/release.yml

key-decisions:
  - "docker/metadata-action@v5로 GitHub Release 태그에서 3-tier 태그 자동 생성"
  - "GHCR(GitHub Container Registry) 사용 -- github.repository 기반 이미지 이름"
  - "docker-publish는 release 이벤트에서만 push (workflow_dispatch 제외)"
  - "Watchtower 라벨을 이미지에 기본 포함하여 사용자 opt-in 간소화"

patterns-established:
  - "OCI 표준 라벨: runner stage FROM 직후에 LABEL 블록 배치"
  - "3-tier Docker 태깅: latest + vX.Y.Z + vX + vX.Y"

requirements-completed: [DOCK-01, DOCK-02]

# Metrics
duration: 1min
completed: 2026-02-17
---

# Phase 162 Plan 02: Docker Watchtower + GHCR 3-tier 태깅 Summary

**Dockerfile에 OCI 표준 + Watchtower 라벨 추가, release.yml에 GHCR docker-publish job 구성 (latest/semver/major/minor 4개 태그)**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-17T00:51:50Z
- **Completed:** 2026-02-17T00:53:14Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Dockerfile runner stage에 OCI 표준 라벨 6개 + Watchtower enable 라벨 추가
- release.yml에 docker-publish job 추가 -- 모든 품질 게이트(test, platform, chain-integration) 통과 후 GHCR에 3-tier 태그로 빌드+푸시
- docker/metadata-action@v5를 활용하여 GitHub Release 태그에서 latest, vX.Y.Z, vX, vX.Y 태그 자동 생성

## Task Commits

Each task was committed atomically:

1. **Task 1: Dockerfile Watchtower 라벨 + OCI 표준 라벨 추가** - `64d3c1d` (feat)
2. **Task 2: release.yml Docker push job + 3-tier 태깅** - `a60db52` (feat)

## Files Created/Modified
- `Dockerfile` - OCI 표준 라벨 6개 (title, description, url, source, vendor, licenses) + Watchtower enable 라벨 추가
- `.github/workflows/release.yml` - docker-publish job 추가 (GHCR login, metadata-action, build-push-action)

## Decisions Made
- docker/metadata-action@v5 사용 -- GitHub Release 태그에서 자동으로 3-tier 태그 생성 (수동 태그 관리 불필요)
- GHCR(GitHub Container Registry) 선택 -- GitHub 생태계 통합, github.repository 기반 이미지 이름
- docker-publish는 release 이벤트에서만 push -- workflow_dispatch에서는 Docker 푸시 건너뜀 (테스트 목적)
- Watchtower 라벨을 이미지에 기본 포함 -- 사용자가 별도 라벨 없이 Watchtower 자동 업데이트 사용 가능

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 162 완료 -- Dockerfile 라벨 + GHCR 3-tier 태깅 인프라 완성
- Phase 163 (release-please) 준비 완료 -- release.yml에 docker-publish job이 추가되어 release-please 통합 시 자동 Docker 배포 가능

## Self-Check: PASSED

- FOUND: Dockerfile
- FOUND: .github/workflows/release.yml
- FOUND: 162-02-SUMMARY.md
- FOUND: commit 64d3c1d (Task 1)
- FOUND: commit a60db52 (Task 2)

---
*Phase: 162-compatibility-docker*
*Completed: 2026-02-17*
