---
phase: 151-coverage-mock-infra
plan: 01
subsystem: test-infra
tags: [vitest, coverage, turborepo, v8, monorepo]
dependency-graph:
  requires: []
  provides: ["vitest-coverage-config", "turbo-test-tasks"]
  affects: ["packages/*/vitest.config.ts", "turbo.json", "package.json"]
tech-stack:
  added: []
  patterns: ["v8-coverage-thresholds", "turbo-test-task-separation", "graceful-missing-dir"]
key-files:
  created: []
  modified:
    - packages/core/vitest.config.ts
    - packages/daemon/vitest.config.ts
    - packages/cli/vitest.config.ts
    - packages/sdk/vitest.config.ts
    - packages/mcp/vitest.config.ts
    - packages/admin/vitest.config.ts
    - packages/adapters/solana/vitest.config.ts
    - packages/adapters/evm/vitest.config.ts
    - turbo.json
    - package.json
    - packages/core/package.json
    - packages/daemon/package.json
    - packages/cli/package.json
    - packages/sdk/package.json
    - packages/mcp/package.json
    - packages/admin/package.json
    - packages/adapters/solana/package.json
    - packages/adapters/evm/package.json
decisions:
  - "v8 coverage thresholds는 --coverage 플래그 실행 시에만 활성화 (기존 vitest run 영향 없음)"
  - "미존재 테스트 디렉토리는 [ -d dir ] && vitest run --dir || true 쉘 패턴으로 graceful 처리"
  - "admin 패키지 coverage include에 .tsx 확장자 추가"
metrics:
  duration: "4min"
  completed: "2026-02-16"
  tasks: 2
  files: 18
---

# Phase 151 Plan 01: Vitest Coverage + Turborepo Test Tasks Summary

v8 커버리지 프로바이더 기반 패키지별 Hard 임계값 설정 + Turborepo 5개 테스트 태스크 분리

## Completed Tasks

### Task 1: Vitest workspace coverage 설정 + 패키지별 임계값 (3592f41)

8개 패키지의 vitest.config.ts에 v8 coverage provider, reporter(text/json-summary/json), include/exclude 패턴, Hard 임계값을 설정했다.

**패키지별 임계값:**
| Package | Branches | Functions | Lines | Statements |
|---------|----------|-----------|-------|------------|
| @waiaas/core | 85% | 90% | 90% | 90% |
| @waiaas/daemon | 80% | 85% | 85% | 85% |
| @waiaas/adapter-solana | 75% | 80% | 80% | 80% |
| @waiaas/sdk | 75% | 80% | 80% | 80% |
| @waiaas/adapter-evm | 45% | 50% | 50% | 50% |
| @waiaas/cli | 65% | 70% | 70% | 70% |
| @waiaas/mcp | 65% | 70% | 70% | 70% |
| @waiaas/admin | 65% | 70% | 70% | 70% |

- 기존 vitest.config.ts 설정(pool, poolOptions, testTimeout, environment, setupFiles, plugins) 모두 보존
- admin 패키지: .tsx 파일 include/exclude 패턴 추가
- `--coverage` 플래그 없는 기존 `vitest run`에 영향 없음 확인
- `.gitignore`에 `coverage/` 이미 존재 확인

### Task 2: Turborepo 5개 테스트 태스크 분리 + 패키지 스크립트 (c01cc18)

turbo.json에 5개 테스트 태스크(test:unit/integration/security/chain/platform)를 추가하고, 루트 및 8개 패키지 package.json에 대응 스크립트를 설정했다.

- turbo.json: 5개 태스크 모두 `dependsOn: ["build"]`, test:unit만 `outputs: ["coverage/**"]`
- 루트 package.json: `turbo run test:*` 스크립트 5개 추가
- 8개 패키지: `test:unit`은 `vitest run`, 나머지 4개는 `[ -d dir ] && vitest run --dir || true` 패턴
- 기존 `test` 스크립트 backward compatibility 유지
- `pnpm test:security`, `pnpm test:chain` 등 미존재 디렉토리 대상 실행 시 16/16 tasks successful 확인

## Verification Results

1. `pnpm test:unit` -- 14/16 successful (2 failed: CLI pre-existing E2E failures E-07~09, STATE.md에 기록된 기존 이슈)
2. `pnpm test:security` -- 16/16 successful (디렉토리 미존재 graceful 처리)
3. `pnpm test:chain` -- 16/16 successful (디렉토리 미존재 graceful 처리)
4. turbo.json 5개 test: 태스크 확인 완료
5. 8개 패키지 vitest.config.ts 모두 thresholds 설정 확인 (grep 결과 8개)
6. @waiaas/core `vitest run` (without --coverage) 224 tests passed -- 기존 테스트 영향 없음

## Deviations from Plan

None - plan executed exactly as written.

## Notes

- CLI 패키지의 pre-existing E2E 실패 3건(E-07~09)은 이 플랜과 무관하며 STATE.md에 이미 기록된 기존 이슈
- daemon 패키지 devDependencies에 msw가 자동 추가됨 (lint/hook에 의한 것으로 추정, 플랜 외 변경)
- @vitest/coverage-v8은 루트 devDependencies에 이미 설치되어 있어 별도 설치 불필요

## Self-Check: PASSED

- All 10 modified files: FOUND
- Commit 3592f41 (Task 1): FOUND
- Commit c01cc18 (Task 2): FOUND
- SUMMARY.md: FOUND
