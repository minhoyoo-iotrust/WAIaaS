---
phase: 169-skills-package
plan: 01
subsystem: infra
tags: [npm, cli, skills, npx, monorepo]

# Dependency graph
requires: []
provides:
  - "@waiaas/skills npm 패키지 (CLI + 7개 스킬 파일 번들)"
  - "npx @waiaas/skills list/add CLI"
  - "SKILL_REGISTRY 메타데이터 레지스트리"
affects: [169-02, mcp, sdk]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "zero-dependency CLI via process.argv parsing"
    - "import.meta.dirname for package-relative paths"

key-files:
  created:
    - packages/skills/package.json
    - packages/skills/tsconfig.json
    - packages/skills/tsconfig.build.json
    - packages/skills/src/registry.ts
    - packages/skills/src/cli.ts
    - packages/skills/skills/*.skill.md (7 files)
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "zero-dependency CLI: process.argv 직접 파싱, 외부 라이브러리 없이 구현"
  - "@types/node devDependency 추가 (node:path, import.meta.dirname 타입 지원)"
  - "bin 필드 waiaas-skills 키로 npx @waiaas/skills 실행 지원"

patterns-established:
  - "skills 패키지 패턴: registry.ts에 메타데이터, skills/에 원본 파일, CLI로 배포"

requirements-completed: [PKG-01]

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 169 Plan 01: @waiaas/skills 패키지 생성 Summary

**npx @waiaas/skills CLI로 7개 스킬 파일(quickstart~x402) list/add/add all 배포 지원하는 zero-dependency npm 패키지**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-17T06:12:22Z
- **Completed:** 2026-02-17T06:15:00Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- @waiaas/skills 패키지를 모노레포에 생성하고 pnpm workspace에 자동 인식
- SKILL_REGISTRY 7개 항목 (각 스킬 파일의 name/filename/description 메타데이터)
- zero-dependency CLI: list (테이블 출력), add (단일/전체 복사, --force 덮어쓰기), help
- npm publish --dry-run 성공 (16 files, 33.2kB tarball)

## Task Commits

Each task was committed atomically:

1. **Task 1: @waiaas/skills 패키지 scaffolding + 스킬 파일 번들링** - `3a59221` (feat)
2. **Task 2: CLI 구현 (list/add/help 명령) + npm publish dry-run 검증** - `e0410ab` (feat)

## Files Created/Modified
- `packages/skills/package.json` - @waiaas/skills npm 패키지 정의 (bin, files, scripts)
- `packages/skills/tsconfig.json` - TypeScript 설정 (extends tsconfig.base.json)
- `packages/skills/tsconfig.build.json` - 빌드 전용 설정 (테스트 제외)
- `packages/skills/src/registry.ts` - SKILL_REGISTRY 7개 항목 + getSkillsDir() 유틸
- `packages/skills/src/cli.ts` - npx CLI 진입점 (list/add/help, 155 LOC)
- `packages/skills/skills/*.skill.md` - 7개 스킬 파일 번들 복사본
- `pnpm-lock.yaml` - @types/node 의존성 추가 반영

## Decisions Made
- zero-dependency CLI: process.argv 직접 파싱으로 minimist 등 외부 의존성 없이 구현
- @types/node devDependency 추가: node:path, import.meta.dirname 타입 지원 필요
- bin 필드 키를 "waiaas-skills"로 설정하여 npx @waiaas/skills 실행 지원

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @types/node devDependency 누락**
- **Found during:** Task 1 (패키지 scaffolding)
- **Issue:** node:path 모듈과 import.meta.dirname 타입 선언 누락으로 빌드 실패
- **Fix:** package.json에 @types/node ^22.0.0 devDependency 추가
- **Files modified:** packages/skills/package.json, pnpm-lock.yaml
- **Verification:** pnpm --filter @waiaas/skills build 성공
- **Committed in:** 3a59221 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** @types/node는 TypeScript 패키지의 필수 의존성. 스코프 확장 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- @waiaas/skills 패키지 완성, 169-02 (MCP 스킬 리소스 통합) 진행 가능
- npm publish 준비 완료 (dry-run 검증됨)

## Self-Check: PASSED

All 12 created files verified present. Both task commits (3a59221, e0410ab) verified in git log.

---
*Phase: 169-skills-package*
*Completed: 2026-02-17*
