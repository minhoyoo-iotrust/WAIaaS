---
phase: 159-cicd-pipeline
plan: 01
subsystem: infra
tags: [github-actions, ci-cd, turborepo, vitest-coverage, composite-action, pnpm]

# Dependency graph
requires:
  - phase: 151-test-infrastructure
    provides: "Vitest v8 coverage thresholds + json-summary reporter"
provides:
  - "Composite Action: Node.js 22 + pnpm + Turborepo cache (.github/actions/setup)"
  - "CI workflow: Stage 1 (push --affected) + Stage 2 (PR full suite + coverage)"
  - "coverage-gate.sh: Soft/Hard mode per-package coverage threshold enforcement"
affects: [159-02, nightly, release, docker-ci]

# Tech tracking
tech-stack:
  added: [pnpm/action-setup@v4, actions/setup-node@v4, actions/cache@v4, davelosert/vitest-coverage-report-action@v2]
  patterns: [composite-action-shared-setup, turborepo-affected-ci, coverage-gate-soft-hard, cancel-in-progress-concurrency]

key-files:
  created:
    - .github/actions/setup/action.yml
    - .github/workflows/ci.yml
    - scripts/coverage-gate.sh
  modified: []

key-decisions:
  - "coverage-report를 별도 워크플로우가 아닌 ci.yml Stage 2에 통합 (Research recommendation)"
  - "Stage 1은 --affected, Stage 2는 full suite로 구분"
  - "coverage-gate.sh v1.7 초기는 soft 모드, 이후 hard 전환"

patterns-established:
  - "Composite Action 패턴: 모든 워크플로우가 .github/actions/setup을 공유"
  - "coverage-gate.sh Soft/Hard 모드 + COVERAGE_GATE_<PKG> 환경변수 오버라이드"
  - "cancel-in-progress: 동일 PR 이전 실행 자동 취소"

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 159 Plan 01: CI 기반 인프라 Summary

**GitHub Actions Composite Action(Node.js 22 + pnpm + Turborepo cache) + ci.yml 2-stage 워크플로우 + Soft/Hard 커버리지 게이트 스크립트**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-16T17:08:32Z
- **Completed:** 2026-02-16T17:10:30Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- Composite Action으로 Node.js 22 + pnpm + Turborepo 캐시 + 의존성 설치를 모든 워크플로우가 공유하는 단일 action으로 캡슐화
- ci.yml Stage 1(push)에서 Turborepo --affected로 변경된 패키지만 lint/typecheck/test:unit 실행
- ci.yml Stage 2(PR)에서 full build + test:unit + integration + security + verify:enums + coverage gate + 4개 패키지 coverage report 실행
- coverage-gate.sh가 COVERAGE_GATE_MODE 환경변수로 Soft/Hard 모드 전환 + 패키지별 독립 임계값 검증

## Task Commits

Each task was committed atomically:

1. **Task 1: Composite Action + coverage-gate.sh 생성** - `99e11d8` (chore)
2. **Task 2: ci.yml 워크플로우 생성 (Stage 1 + Stage 2 + Coverage Report)** - `7013aeb` (feat)

## Files Created/Modified
- `.github/actions/setup/action.yml` - Composite Action: pnpm setup + Node.js 22 + Turborepo cache + install
- `.github/workflows/ci.yml` - CI 워크플로우: Stage 1 (push --affected) + Stage 2 (PR full suite + coverage)
- `scripts/coverage-gate.sh` - 커버리지 게이트: 4개 핵심 패키지별 lines 임계값, Soft/Hard 모드

## Decisions Made
- coverage-report를 별도 워크플로우가 아닌 ci.yml Stage 2에 통합 (Research Open Question #1 recommendation 반영 -- 테스트 재실행 없이 같은 job에서 리포트)
- Stage 1은 --affected로 변경된 패키지만 실행, Stage 2는 full suite로 PR merge 전 전체 통과 보장
- v1.7 초기 coverage-gate.sh는 soft 모드 (경고만), 안정화 후 hard 전환 예정

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Composite Action이 159-02 (nightly.yml, release.yml)에서 `uses: ./.github/actions/setup`으로 즉시 재사용 가능
- coverage-gate.sh가 release.yml에서 hard 모드로 사용 가능

## Self-Check: PASSED

- FOUND: .github/actions/setup/action.yml
- FOUND: .github/workflows/ci.yml
- FOUND: scripts/coverage-gate.sh
- FOUND: 159-01-SUMMARY.md
- FOUND: 99e11d8 (Task 1 commit)
- FOUND: 7013aeb (Task 2 commit)

---
*Phase: 159-cicd-pipeline*
*Completed: 2026-02-17*
