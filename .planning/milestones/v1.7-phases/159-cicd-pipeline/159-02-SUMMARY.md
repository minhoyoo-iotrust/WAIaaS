---
phase: 159-cicd-pipeline
plan: 02
subsystem: infra
tags: [github-actions, ci-cd, nightly, release, docker, npm-publish, solana-validator, anvil, coverage-gate]

# Dependency graph
requires:
  - phase: 159-cicd-pipeline
    plan: 01
    provides: "Composite Action (.github/actions/setup) + coverage-gate.sh + ci.yml"
provides:
  - "Nightly workflow: UTC 02:30 cron, full-suite + local-validator + devnet 3-job 병렬"
  - "Release workflow: test + chain-integration + platform(Docker) + publish-check(npm dry-run) 4-job"
  - "4-stage CI/CD pipeline 완성: push(ci.yml) -> PR(ci.yml) -> nightly -> release"
affects: [docker-deploy, npm-publish, release-process]

# Tech tracking
tech-stack:
  added: [metadaoproject/setup-solana@v1.2, foundry-rs/foundry-toolchain@v1, docker/setup-buildx-action@v3, docker/build-push-action@v6]
  patterns: [nightly-cron-with-manual-dispatch, continue-on-error-devnet, gha-docker-cache, npm-dry-run-publish-check]

key-files:
  created:
    - .github/workflows/nightly.yml
    - .github/workflows/release.yml
  modified: []

key-decisions:
  - "nightly devnet job에 continue-on-error: true 설정으로 devnet 불안정성이 전체 CI를 중단하지 않도록 함"
  - "release Docker 빌드에 GHA cache backend(type=gha, mode=max)로 빌드 시간 최적화"
  - "release publish-check가 core/sdk/cli/mcp 4개 패키지만 검증 (adapter/daemon/admin은 npm 배포 대상 아님)"

patterns-established:
  - "Nightly cron + workflow_dispatch 이중 트리거 (60일 비활성화 방지 겸용)"
  - "Docker health check 패턴: 컨테이너 실행 -> sleep -> curl health -> stop"
  - "npm dry-run 루프 패턴: for pkg in core sdk cli mcp; do cd packages/$pkg && npm publish --dry-run"

# Metrics
duration: 1min
completed: 2026-02-17
---

# Phase 159 Plan 02: Nightly + Release CI/CD Summary

**Nightly(UTC 02:30 full-suite + Solana/Anvil chain + devnet) + Release(test + chain + Docker 빌드/health check + npm dry-run 4패키지) 워크플로우로 4-stage CI/CD 파이프라인 완성**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-16T17:13:02Z
- **Completed:** 2026-02-16T17:14:29Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Nightly workflow로 매일 UTC 02:30에 전체 테스트 스위트(lint+typecheck+unit+integration+security+coverage hard gate) 자동 실행
- Local-validator job에서 Solana test-validator + Anvil 기동 후 chain 테스트 자동 검증
- Release workflow로 릴리스 발행 시 4-job 품질 게이트 (test -> chain-integration + platform(Docker) + publish-check(npm)) 실행
- Docker 이미지 빌드 후 health check까지 자동 검증, GHA cache로 빌드 시간 최적화

## Task Commits

Each task was committed atomically:

1. **Task 1: nightly.yml 워크플로우 생성** - `510a47a` (feat)
2. **Task 2: release.yml 워크플로우 생성** - `5b7cf57` (feat)

## Files Created/Modified
- `.github/workflows/nightly.yml` - Nightly CI: full-suite + local-validator(Solana/Anvil) + devnet(continue-on-error) 3개 독립 job
- `.github/workflows/release.yml` - Release CI: test(hard gate) + chain-integration + platform(Docker 빌드/health check) + publish-check(npm dry-run 4패키지)

## Decisions Made
- nightly devnet job에 continue-on-error: true 설정 -- devnet RPC 불안정성이 야간 CI 전체를 중단하지 않도록 격리
- release Docker 빌드에 GHA cache backend(type=gha, mode=max) -- 빌드 시간 절감 + 릴리스 파이프라인 속도 개선
- release publish-check가 core/sdk/cli/mcp 4개만 검증 -- adapter/daemon/admin은 npm 배포 대상 패키지가 아님

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 4-stage CI/CD pipeline 완성: push CI(ci.yml Stage 1) -> PR CI(ci.yml Stage 2) -> Nightly(nightly.yml) -> Release(release.yml)
- 모든 워크플로우가 Composite Action(.github/actions/setup) 공유, coverage-gate.sh 재사용
- GitHub repository secrets 설정 불필요 (현재 모든 job이 self-contained)

## Self-Check: PASSED

- FOUND: .github/workflows/nightly.yml
- FOUND: .github/workflows/release.yml
- FOUND: 159-02-SUMMARY.md
- FOUND: 510a47a (Task 1 commit)
- FOUND: 5b7cf57 (Task 2 commit)

---
*Phase: 159-cicd-pipeline*
*Completed: 2026-02-17*
