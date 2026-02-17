---
phase: 170-deploy-prerelease
plan: 01
subsystem: infra
tags: [npm, publish, release-please, package-metadata, monorepo]

requires:
  - phase: 169-skills-package
    provides: "@waiaas/skills 패키지 빌드 + CLI"
provides:
  - "8개 publishable 패키지 npm publish --dry-run 전수 검증 완료"
  - "release-please extra-files에 skills 패키지 포함"
  - "전 패키지 repository/homepage/publishConfig 메타데이터 완비"
affects: [170-02, 170-03, release]

tech-stack:
  added: []
  patterns: ["publishConfig.access: public for scoped packages", "pnpm pack으로 workspace:* 치환 검증"]

key-files:
  created: []
  modified:
    - "release-please-config.json"
    - "packages/core/package.json"
    - "packages/daemon/package.json"
    - "packages/cli/package.json"
    - "packages/sdk/package.json"
    - "packages/mcp/package.json"
    - "packages/skills/package.json"
    - "packages/admin/package.json"
    - "packages/adapters/solana/package.json"
    - "packages/adapters/evm/package.json"

key-decisions:
  - "publishConfig.access: public 추가 -- scoped 패키지(@waiaas/*)는 기본 restricted이므로 publish 시 필수"
  - "admin 패키지는 private:true 유지 -- daemon의 public/admin/에 번들되므로 별도 publish 불필요"
  - "stale .tsbuildinfo 파일이 turbo 캐시와 결합하여 dist/__tests__ 포함 문제 발견 -- clean build 시 정상"

patterns-established:
  - "npm publish 전 clean build 필수: tsbuildinfo + dist 삭제 후 빌드해야 stale test 파일 제외"
  - "pnpm pack으로 workspace:* -> 실제 버전 치환 검증"

requirements-completed: [DEPLOY-01]

duration: 9min
completed: 2026-02-17
---

# Phase 170 Plan 01: npm publish --dry-run 전수 검증 Summary

**8개 publishable 패키지 npm publish --dry-run 전수 성공, release-please skills 동기화 추가, publishConfig/메타데이터 완비**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-17T06:36:18Z
- **Completed:** 2026-02-17T06:45:53Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- release-please extra-files에 skills 패키지 추가 (버전 동기화 누락 수정)
- 9개 패키지에 repository, homepage, description, publishConfig 메타데이터 추가
- 8개 publishable 패키지 전수 npm publish --dry-run 성공 확인
- admin 패키지 npm pack --dry-run 성공 확인 (private:true)
- pnpm pack으로 workspace:* 의존성이 실제 버전(1.7.0)으로 치환됨 확인

## Task Commits

Each task was committed atomically:

1. **Task 1: release-please 설정 보완 + 패키지 메타데이터 검증/수정** - `543ba8a` (chore)
2. **Task 2: npm publish --dry-run 전수 실행 + 패키지 내용 검증** - 변경 파일 없음 (검증 전용 태스크)

## Files Created/Modified
- `release-please-config.json` - extra-files에 packages/skills/package.json 추가
- `packages/core/package.json` - description, repository, homepage, publishConfig 추가
- `packages/daemon/package.json` - description, repository, homepage, publishConfig 추가
- `packages/cli/package.json` - description, repository, homepage, publishConfig 추가
- `packages/sdk/package.json` - description, repository, homepage, publishConfig 추가
- `packages/mcp/package.json` - description, repository, homepage, publishConfig 추가
- `packages/skills/package.json` - repository, homepage, publishConfig 추가
- `packages/admin/package.json` - description, repository, homepage 추가 (private:true 유지)
- `packages/adapters/solana/package.json` - description, repository, homepage, publishConfig 추가
- `packages/adapters/evm/package.json` - description, repository, homepage, publishConfig 추가

## Decisions Made
- publishConfig.access: public 추가 -- scoped 패키지(@waiaas/*)는 npm 기본값이 restricted이므로 public access 명시 필수
- admin 패키지는 private:true 유지 -- daemon의 public/admin/에 번들되므로 별도 npm publish 불필요
- repository.url은 npm이 자동으로 git+ prefix를 추가함 (npm warn로 표시되나 기능 문제 없음)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] stale .tsbuildinfo 파일로 인한 turbo 캐시 오염**
- **Found during:** Task 2 (npm publish --dry-run 전수 실행)
- **Issue:** 이전 non-build tsc 실행으로 dist/__tests__/ 디렉토리가 생성되었고, turbo 캐시가 이 stale 산출물을 포함한 빌드 결과를 캐싱하여 clean build 후에도 test 파일이 dist에 포함됨
- **Fix:** .tsbuildinfo 파일 삭제 + turbo 캐시 무효화 + 수동 의존성 순서 빌드로 clean dist 생성 확인
- **Files modified:** 없음 (런타임 캐시 정리, .tsbuildinfo는 .gitignore)
- **Verification:** 모든 패키지 dist/__tests__/ 부재 확인, npm pack --dry-run에서 test 파일 미포함 확인

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** turbo 캐시 오염은 CI에서도 발생 가능하므로 향후 CI clean build 시 tsbuildinfo 삭제 권장

## Issues Encountered
- turbo `--force` 플래그가 `dependsOn` 의존성 순서를 무시하여 adapter-solana 빌드 실패 -- 수동 순서 빌드로 해결
- npm warn: repository.url 자동 정규화 (git+ prefix) -- 기능 문제 없음

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 8개 패키지 npm publish 준비 완료
- 170-02 (Docker 빌드 검증) 및 170-03 (CI/CD 파이프라인 검증) 진행 가능

## Self-Check: PASSED

- All 10 modified files exist on disk
- Commit 543ba8a (Task 1) verified in git log
- Task 2 was verification-only (no file changes)

---
*Phase: 170-deploy-prerelease*
*Completed: 2026-02-17*
