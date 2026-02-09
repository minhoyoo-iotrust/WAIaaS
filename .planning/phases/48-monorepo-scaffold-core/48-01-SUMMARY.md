---
phase: 48-monorepo-scaffold-core
plan: 01
subsystem: infra
tags: [pnpm, turborepo, typescript, eslint, prettier, vitest, monorepo, esm]

# Dependency graph
requires: []
provides:
  - "pnpm workspace + Turborepo 모노레포 인프라"
  - "4개 패키지 셸 (@waiaas/core, @waiaas/daemon, @waiaas/adapter-solana, @waiaas/cli)"
  - "공유 tsconfig.base.json (ESM, NodeNext, strict)"
  - "ESLint flat config + Prettier + Vitest workspace"
  - "빌드-테스트-린트 파이프라인 (turbo build/test/lint)"
affects: [48-02, 48-03, 49-sqlite-keystore-config, 50-solana-pipeline-api, 51-cli-e2e]

# Tech tracking
tech-stack:
  added: [pnpm@9.15.4, turbo@2.8.3, typescript@5.9.3, eslint@9.39.2, typescript-eslint@8.54.0, eslint-config-prettier@10.1.8, prettier@3.8.1, vitest@3.2.4, "@vitest/coverage-v8@3.2.4", zod@3.25.76]
  patterns: [pnpm-workspace, turborepo-pipeline, esm-only, typescript-project-references, eslint-flat-config, vitest-workspace]

key-files:
  created:
    - ".nvmrc"
    - ".node-version"
    - "package.json"
    - "pnpm-workspace.yaml"
    - "turbo.json"
    - "tsconfig.base.json"
    - "eslint.config.js"
    - ".prettierrc.json"
    - ".prettierignore"
    - "vitest.workspace.ts"
    - ".gitignore"
    - "pnpm-lock.yaml"
    - "packages/core/package.json"
    - "packages/core/tsconfig.json"
    - "packages/core/src/index.ts"
    - "packages/core/vitest.config.ts"
    - "packages/daemon/package.json"
    - "packages/daemon/tsconfig.json"
    - "packages/daemon/src/index.ts"
    - "packages/daemon/vitest.config.ts"
    - "packages/adapters/solana/package.json"
    - "packages/adapters/solana/tsconfig.json"
    - "packages/adapters/solana/src/index.ts"
    - "packages/adapters/solana/vitest.config.ts"
    - "packages/cli/package.json"
    - "packages/cli/tsconfig.json"
    - "packages/cli/src/index.ts"
    - "packages/cli/vitest.config.ts"
    - "packages/cli/bin/waiaas"
  modified: []

key-decisions:
  - "TD-02 확정: ESLint 9 flat config + typescript-eslint recommended + eslint-config-prettier"
  - "TD-03 확정: Prettier singleQuote, semi, tabWidth=2, trailingComma=all, printWidth=100"
  - "TD-04 확정: Vitest workspace (루트 vitest.workspace.ts + 패키지별 vitest.config.ts)"
  - "TD-05 확정: TypeScript project references (composite: true) + 공유 tsconfig.base.json"
  - "TD-11 확정: tsc only (tsup/unbuild 불필요, ESM 단일 출력)"

patterns-established:
  - "ESM-only: 모든 패키지 type: module, NodeNext resolution, verbatimModuleSyntax"
  - "Turborepo pipeline: build -> test 의존, ^build로 워크스페이스 순서 보장"
  - "Package shell: package.json + tsconfig.json + vitest.config.ts + src/index.ts"
  - "Workspace dependency: workspace:* 프로토콜로 패키지 간 참조"

# Metrics
duration: 4min
completed: 2026-02-10
---

# Phase 48 Plan 01: Monorepo Scaffold Summary

**pnpm workspace + Turborepo 모노레포 4-패키지 스캐폴드 (core, daemon, adapter-solana, cli) with ESLint flat config, Prettier, Vitest workspace, ESM-only TypeScript project references**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-09T15:30:52Z
- **Completed:** 2026-02-09T15:35:16Z
- **Tasks:** 2/2
- **Files created:** 29

## Accomplishments

- pnpm workspace + Turborepo로 4개 패키지가 의존 순서대로 빌드되는 모노레포 인프라 구축
- ESLint 9 flat config + Prettier + Vitest workspace 설정으로 전 패키지 린트/테스트 파이프라인 구성
- Node.js 22 LTS, ESM-only, TypeScript strict + project references 확정
- 루트에서 `pnpm build && pnpm test && pnpm lint` 한 번에 4/4 패키지 성공 검증 완료

## Task Commits

Each task was committed atomically:

1. **Task 1: 모노레포 루트 설정 (pnpm workspace, Turborepo, tsconfig, Node.js 22)** - `877b5ff` (chore)
2. **Task 2: ESLint flat config + Prettier + Vitest workspace + 4개 패키지 셸 생성** - `7fb9038` (feat)

## Files Created/Modified

- `.nvmrc` - Node.js 22 LTS 버전 고정
- `.node-version` - fnm/volta 호환 노드 버전
- `package.json` - 루트 모노레포 설정 (scripts, devDependencies, packageManager)
- `pnpm-workspace.yaml` - packages/* + packages/adapters/* 워크스페이스
- `turbo.json` - Turborepo 파이프라인 (build, test, lint, typecheck, clean)
- `tsconfig.base.json` - 공유 TypeScript 설정 (ES2022, NodeNext, strict, ESM)
- `eslint.config.js` - ESLint 9 flat config (typescript-eslint + prettier)
- `.prettierrc.json` - Prettier 코드 스타일
- `.prettierignore` - Prettier 제외 패턴
- `vitest.workspace.ts` - Vitest workspace 글로브 설정
- `.gitignore` - node_modules, dist, .turbo, coverage 제외
- `pnpm-lock.yaml` - 의존성 lockfile (199 packages)
- `packages/core/` - @waiaas/core 패키지 셸 (zod dependency)
- `packages/daemon/` - @waiaas/daemon 패키지 셸 (core dependency)
- `packages/adapters/solana/` - @waiaas/adapter-solana 패키지 셸 (core dependency)
- `packages/cli/` - @waiaas/cli 패키지 셸 (core + daemon dependency, bin/waiaas)

## Decisions Made

| # | 결정 | 근거 |
|---|------|------|
| TD-02 | ESLint 9 flat config + typescript-eslint recommended + eslint-config-prettier | 최신 ESLint 9 flat config 방식, Prettier 충돌 방지 |
| TD-03 | singleQuote, semi, tabWidth=2, trailingComma=all, printWidth=100 | 프로젝트 표준 코드 스타일 |
| TD-04 | Vitest workspace (루트 + 패키지별 config) | Turborepo test 파이프라인과 자연스러운 연동 |
| TD-05 | TypeScript project references (composite: true) | 모노레포 증분 빌드, 패키지 간 타입 참조 지원 |
| TD-11 | tsc only (빌드 도구 불필요) | ESM 단일 출력이므로 번들러 불필요, 복잡도 최소화 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript project references require composite: true**
- **Found during:** Task 2 (빌드 파이프라인 검증)
- **Issue:** daemon, adapter-solana, cli의 tsconfig.json에서 core를 references로 참조하지만, core의 tsconfig.json에 `composite: true`가 없어 TS6306 에러 발생
- **Fix:** core와 daemon의 tsconfig.json에 `"composite": true` 추가
- **Files modified:** packages/core/tsconfig.json, packages/daemon/tsconfig.json
- **Verification:** `pnpm build` 4/4 성공
- **Committed in:** 7fb9038 (Task 2 commit)

**2. [Rule 3 - Blocking] Vitest exits with code 1 when no test files found**
- **Found during:** Task 2 (테스트 파이프라인 검증)
- **Issue:** 빈 패키지에 테스트 파일이 없어 `vitest run`이 exit code 1 반환
- **Fix:** 모든 패키지의 vitest.config.ts에 `passWithNoTests: true` 추가
- **Files modified:** packages/*/vitest.config.ts (4개)
- **Verification:** `pnpm test` 8/8 성공 (0 tests, 0 failures)
- **Committed in:** 7fb9038 (Task 2 commit)

**3. [Rule 2 - Missing Critical] .gitignore 파일 부재**
- **Found during:** Task 2 (커밋 전 확인)
- **Issue:** 프로젝트에 .gitignore가 없어 node_modules, dist 등이 git에 추적됨
- **Fix:** .gitignore 생성 (node_modules, dist, .turbo, coverage, .env, IDE 파일 제외)
- **Files modified:** .gitignore (신규)
- **Verification:** `git status`에서 node_modules, dist 미추적 확인
- **Committed in:** 7fb9038 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing critical)
**Impact on plan:** All auto-fixes necessary for correct build pipeline operation. No scope creep.

## Issues Encountered

- pnpm이 시스템에 글로벌 설치되지 않아 `npx pnpm`으로 실행. corepack enable은 권한 문제로 실패. 기능에는 영향 없음 (lockfile의 packageManager 필드로 npx가 올바른 버전 자동 사용).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 모노레포 인프라 완성, 이후 모든 코드가 이 구조 위에 작성됨
- 48-02 (Zod 스키마 + Enum SSoT), 48-03 (인터페이스 + 에러 코드)이 packages/core에 바로 추가 가능
- Phase 49 (SQLite + Keystore + Config)는 packages/daemon에 작성
- 차단 요소 없음

## Self-Check: PASSED

---
*Phase: 48-monorepo-scaffold-core*
*Completed: 2026-02-10*
