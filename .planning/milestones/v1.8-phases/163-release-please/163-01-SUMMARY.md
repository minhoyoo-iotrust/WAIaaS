---
phase: 163-release-please
plan: 01
subsystem: infra
tags: [release-please, conventional-commits, github-actions, changelog, ci-cd]

# Dependency graph
requires:
  - phase: 159-ci-cd-pipeline
    provides: "release.yml 워크플로우 (on: release: types: [published] 트리거)"
provides:
  - ".release-please-manifest.json 루트 패키지 버전 매핑"
  - "release-please-config.json 모노레포 단일 버전 릴리스 설정"
  - ".github/workflows/release-please.yml Conventional Commits 자동 Release PR 워크플로우"
affects: [163-release-please, 164-sync-integration]

# Tech tracking
tech-stack:
  added: [google-github-actions/release-please-action@v4]
  patterns: [conventional-commits-to-release, monorepo-single-version-strategy]

key-files:
  created:
    - .release-please-manifest.json
    - release-please-config.json
    - .github/workflows/release-please.yml
  modified: []

key-decisions:
  - "모노레포 단일 버전 전략: 루트 패키지(.)가 9개 서브패키지 버전을 대표"
  - "bump-minor-pre-major: false로 1.x에서도 BREAKING CHANGE가 major 범프"
  - "changelog-sections: feat/fix/perf/refactor만 표시, docs/test/chore/ci는 숨김"

patterns-established:
  - "release-please manifest+config 패턴: 별도 manifest.json으로 현재 버전 추적, config.json으로 릴리스 동작 제어"
  - "extra-files 패턴: 루트 릴리스 시 8개 Node.js 패키지 + python-sdk 버전 동기화"

requirements-completed: [RLSE-01, RLSE-02, RLSE-03, RLSE-07]

# Metrics
duration: 1min
completed: 2026-02-17
---

# Phase 163 Plan 01: release-please 설정 파일 3종 Summary

**release-please manifest + config + GitHub Actions 워크플로우로 Conventional Commits 기반 자동 Release PR/CHANGELOG/태그 파이프라인 구축**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-17T01:07:33Z
- **Completed:** 2026-02-17T01:08:48Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- `.release-please-manifest.json`에 루트 패키지 버전 1.7.0 매핑 생성
- `release-please-config.json`에 node 릴리스 타입, 9개 extra-files, CHANGELOG 섹션 설정
- `.github/workflows/release-please.yml`로 main 푸시 시 release-please-action@v4 자동 실행

## Task Commits

Each task was committed atomically:

1. **Task 1: release-please 설정 파일 3종 생성** - `115e4f9` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `.release-please-manifest.json` - 루트 패키지(.) 현재 버전 1.7.0 매핑
- `release-please-config.json` - release-type: node, 9개 extra-files, CHANGELOG 섹션, bump-minor-pre-major: false
- `.github/workflows/release-please.yml` - main 브랜치 푸시 시 release-please-action@v4 실행, outputs로 release_created/tag_name/version 노출

## Decisions Made
- 모노레포 단일 버전 전략: 루트 패키지(.)가 9개 서브패키지 버전을 대표. Self-Hosted 특성상 전체가 한 세트로 배포되므로 적절
- `bump-minor-pre-major: false`: 1.x 단계에서도 BREAKING CHANGE 커밋 시 major 버전 범프 (RLSE-07 충족)
- `include-v-in-tag: true`: 기존 태그 형식(v1.7.0) 유지
- CHANGELOG 섹션: feat/fix/perf/refactor만 사용자에게 노출, docs/test/chore/ci는 hidden 처리

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- release-please 설정 완료. 163-02에서 release.yml에 deploy job을 추가하여 2-게이트 모델 완성 예정
- release-please.yml의 outputs(release_created, tag_name, version)를 release.yml 트리거에서 활용 가능

## Self-Check: PASSED

- FOUND: .release-please-manifest.json
- FOUND: release-please-config.json
- FOUND: .github/workflows/release-please.yml
- FOUND: .planning/phases/163-release-please/163-01-SUMMARY.md
- FOUND: commit 115e4f9

---
*Phase: 163-release-please*
*Completed: 2026-02-17*
