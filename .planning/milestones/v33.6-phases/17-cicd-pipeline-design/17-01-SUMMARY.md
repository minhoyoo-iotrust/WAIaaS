---
phase: 17-cicd-pipeline-design
plan: 01
subsystem: infra
tags: [github-actions, ci-cd, turborepo, jest, coverage, pipeline]

# Dependency graph
requires:
  - phase: 14-test-foundation
    provides: 6개 테스트 레벨 정의, 커버리지 4-tier, Soft/Hard gate 전략, Jest 30 설정
  - phase: 15-security-test-scenarios
    provides: 71건 보안 시나리오, Security 매 PR 실행 결정
  - phase: 16-blockchain-consistency-verification
    provides: Mock RPC 13 시나리오, Local Validator E2E 5 흐름, Devnet 3건 제한, Enum SSoT 검증
provides:
  - CI/CD 4단계 파이프라인 설계 (Stage 1~4)
  - GitHub Actions 4 YAML + 1 composite action 워크플로우 상세 설계
  - Soft/Hard 커버리지 게이트 전환 메커니즘 + coverage-gate.sh
  - 패키지별 커버리지 임계값 + 전환 우선순위
  - Phase 14~16 결정 14건 정합성 검증표
affects: [v0.4-implementation, github-actions-setup]

# Tech tracking
tech-stack:
  added: [github-actions, ArtiomTr/jest-coverage-report-action@v2, metadaoproject/setup-solana@v1.0, pnpm/action-setup@v4, actions/setup-node@v4, actions/cache@v4, actions/upload-artifact@v4]
  patterns: [4-stage-pipeline, soft-hard-coverage-gate, turborepo-affected, composite-action, fork-pr-security]

key-files:
  created:
    - docs/v0.4/50-cicd-pipeline-coverage-gate.md
  modified: []

key-decisions:
  - "4단계 파이프라인: Stage 1(매 커밋 ~2min), Stage 2(매 PR ~5min), Stage 3(nightly ~10min), Stage 4(릴리스 ~15min)"
  - "GitHub Actions 4 YAML(ci/nightly/release/coverage-report) + 1 composite action(setup) 구조"
  - "coverage-report.yml 분리: fork PR 보안 (GITHUB_TOKEN 쓰기 권한 격리)"
  - "ArtiomTr action 핵심 4패키지만 PR 코멘트, 나머지 3패키지 콘솔 텍스트"
  - "Soft->Hard 전환 우선순위: core(1) -> daemon/keystore(2) -> adapter-solana/sdk(3) -> 나머지(4~6)"
  - "turbo.json 모든 test:* 태스크 cache: false (테스트 결과 캐싱 위험 방지)"

patterns-established:
  - "Pattern: 4단계 파이프라인 (push/PR/schedule/release) -> Turborepo --affected vs 전체 실행"
  - "Pattern: Composite action으로 공통 setup 추출 (pnpm + Node.js + Turbo cache)"
  - "Pattern: Soft/Hard coverage gate with COVERAGE_GATE_MODE env var"

# Metrics
duration: 7min
completed: 2026-02-06
---

# Phase 17 Plan 01: CI/CD 파이프라인 설계 + 커버리지 게이트 Summary

**GitHub Actions 4단계 파이프라인(ci/nightly/release/coverage-report) + Turborepo --affected + Soft/Hard 커버리지 게이트 전환 메커니즘 통합 설계**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-06T14:13:58Z
- **Completed:** 2026-02-06T14:21:02Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- 4단계 파이프라인(매 커밋/매 PR/nightly/릴리스)의 실행 범위, 트리거, 테스트 유형, 예상 시간, 실패 영향이 명확히 구분됨
- GitHub Actions 4개 YAML + 1 composite action의 전체 설계가 YAML 골격과 함께 제시됨 (ci.yml 225줄, nightly.yml 80줄, release.yml 100줄, coverage-report.yml 55줄)
- Phase 14~16의 모든 테스트 레벨/시나리오가 파이프라인 단계에 빠짐없이 매핑됨 (14건 결정 100% 정합)
- Soft/Hard 커버리지 게이트 전환 메커니즘(scripts/coverage-gate.sh + jest.config.ts coverageThreshold)이 구현 가능한 수준으로 상세 기술됨
- 패키지별 커버리지 임계값이 jest.config.ts glob 패턴으로 변환되고, 6단계 전환 우선순위가 제안됨

## Task Commits

Each task was committed atomically:

1. **Task 1: 4단계 파이프라인 + GitHub Actions 워크플로우 설계** - `d0d1250` (feat)
2. **Task 2: 커버리지 게이트 + 리포트 + Pitfalls + 정합성 검증표** - `5288f1f` (feat)

## Files Created/Modified

- `docs/v0.4/50-cicd-pipeline-coverage-gate.md` - CI/CD 파이프라인 설계 + 커버리지 게이트 전략 통합 문서 (1288줄, 13개 섹션)

## Decisions Made

1. **4단계 파이프라인 구조:** Stage 1(push ~2min, lint/typecheck/unit) -> Stage 2(PR ~5min, +integration/e2e/security/enum-verify/coverage-gate) -> Stage 3(nightly ~10min, +local-validator/devnet) -> Stage 4(release ~15min, +platform-cli/docker/full-coverage)
2. **coverage-report.yml 분리:** Fork PR에서 GITHUB_TOKEN 쓰기 권한 격리를 위해 PR 커버리지 코멘트를 별도 워크플로우로 분리
3. **ArtiomTr action 핵심 패키지 선정:** core, daemon, adapter-solana, sdk(4개)만 PR 코멘트, adapter-evm/cli/mcp(3개)는 콘솔 텍스트
4. **Soft->Hard 전환 우선순위:** core(1) -> daemon/keystore+services(2) -> adapter-solana/sdk(3) -> daemon/middleware+routes+db+notifications(4) -> cli/mcp/lifecycle(5) -> adapter-evm(6, EVM 본구현 시)
5. **turbo.json 모든 test 태스크 cache: false:** 테스트 결과 캐싱은 거짓 통과 위험이 있어 항상 재실행

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CI/CD 파이프라인 설계 문서 완료. 구현 단계에서 4개 YAML + 1 composite action + scripts/coverage-gate.sh를 바로 작성 가능
- Phase 17 Plan 01이 유일한 plan이므로 Phase 17 완료
- v0.4 마일스톤의 마지막 Phase 17 완료로, v0.4 테스트 전략 및 계획 수립 마일스톤 전체가 완료됨

## Self-Check: PASSED

---
*Phase: 17-cicd-pipeline-design*
*Completed: 2026-02-06*
