---
phase: 161-cli-upgrade
plan: 03
subsystem: cli
tags: [upgrade, npm, semver, backup, rollback, 7-step-sequence]

# Dependency graph
requires:
  - phase: 161-cli-upgrade
    plan: 02
    provides: "BackupService (createBackup, restoreLatest) for pre-upgrade backup/rollback"
  - phase: 160-version-check-infra
    provides: "VersionCheckService + npm registry fetch 패턴"
provides:
  - "upgradeCommand: waiaas upgrade 7단계 시퀀스 (확인-중지-백업-업데이트-마이그레이션-검증-재시작)"
  - "--check, --to, --rollback, --no-start 4개 옵션"
  - "BackupService barrel export (@waiaas/daemon)"
affects: [162-compat-docker, 163-release-please]

# Tech tracking
tech-stack:
  added: [semver (CLI dependency)]
  patterns: ["7-step upgrade sequence with rollback", "execSync npm install -g for global CLI update"]

key-files:
  created:
    - packages/cli/src/commands/upgrade.ts
    - packages/cli/src/__tests__/upgrade.test.ts
  modified:
    - packages/cli/src/index.ts
    - packages/cli/package.json
    - packages/daemon/src/index.ts

key-decisions:
  - "execSync('npm install -g') 사용 -- 기술 결정 #15에 따라 npm CLI 직접 호출"
  - "Step 5 마이그레이션은 데몬 시작 시 자동 실행에 위임 -- npm i -g 후 구버전 코드에서 마이그레이션 직접 실행 위험"
  - "BackupService를 @waiaas/daemon barrel export에 추가 -- CLI에서 직접 import 가능하도록"

patterns-established:
  - "7-step upgrade: version-check -> stop-daemon -> backup -> npm-update -> migration-defer -> verify -> restart"
  - "process.exit mock 패턴: vi.spyOn(process, 'exit').mockImplementation(throw) -> rejects.toThrow"

requirements-completed: [UPGR-01, UPGR-02, UPGR-05, UPGR-07]

# Metrics
duration: 5min
completed: 2026-02-17
---

# Phase 161 Plan 03: Upgrade Command Summary

**waiaas upgrade 7단계 시퀀스 (확인-중지-백업-업데이트-마이그레이션-검증-재시작) + --check/--to/--rollback/--no-start 옵션, 15개 단위 테스트**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-17T00:35:55Z
- **Completed:** 2026-02-17T00:41:02Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- upgradeCommand 구현: 7단계 시퀀스로 안전한 업그레이드 실행 (버전확인 -> 데몬중지 -> 백업 -> npm업데이트 -> 마이그레이션 -> 검증 -> 재시작)
- 4개 옵션 지원: --check (업데이트 확인만), --to (특정 버전), --rollback (백업 복원), --no-start (재시작 생략)
- BackupService를 @waiaas/daemon barrel export에 추가하여 CLI에서 직접 import 가능
- 15개 단위 테스트 전체 통과 (mock: execSync, fetch, BackupService, process.exit)
- semver 의존성 추가로 npm registry 버전 비교 정확성 확보

## Task Commits

Each task was committed atomically:

1. **Task 1: upgrade 명령 구현 + CLI 등록** - `68bccd7` (feat)
2. **Task 2: upgrade 명령 단위 테스트 15개** - `745a49b` (test)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `packages/cli/src/commands/upgrade.ts` - upgrade 명령 구현 (upgradeCommand, checkMode, rollbackMode, upgradeMode, fetchLatestVersion, stopDaemonIfRunning)
- `packages/cli/src/__tests__/upgrade.test.ts` - 15개 단위 테스트 (--check 3, 7-step 4, --to 2, --rollback 2, --no-start 1, failure 2, daemon-stop 1)
- `packages/cli/src/index.ts` - upgrade 명령 commander 등록 + import 추가
- `packages/cli/package.json` - semver + @types/semver 의존성 추가
- `packages/daemon/src/index.ts` - BackupService barrel export 추가

## Decisions Made
- execSync('npm install -g @waiaas/cli@{version}') 사용: 기술 결정 #15에 따라 child_process로 npm CLI 직접 호출. 업그레이드 후 새 바이너리가 설치되므로 'waiaas start'도 새 버전으로 실행됨
- Step 5 마이그레이션을 데몬 시작에 위임: npm i -g 후 현재 프로세스는 구버전 코드이므로 직접 마이그레이션 실행은 위험. daemon.ts Step 2에서 자동 실행
- BackupService를 @waiaas/daemon 메인 barrel에 추가: plan에서 `import { BackupService } from '@waiaas/daemon'` 패턴을 명시했으나 실제 export가 없어서 추가 (Rule 3 deviation)
- semver을 CLI package.json에 직접 추가: daemon을 통한 간접 의존 대신 명시적 의존성 선언

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] BackupService barrel export 추가**
- **Found during:** Task 1 (upgrade 명령 구현)
- **Issue:** plan에서 `import { BackupService } from '@waiaas/daemon'` 사용을 지시했으나, daemon/src/index.ts에 BackupService가 export되어 있지 않아 TS2305 에러 발생
- **Fix:** packages/daemon/src/index.ts에 `export { BackupService } from './infrastructure/backup/index.js'` 추가
- **Files modified:** packages/daemon/src/index.ts
- **Verification:** `npx tsc -p packages/cli/tsconfig.json --noEmit` 통과
- **Committed in:** 68bccd7 (Task 1 commit)

**2. [Rule 3 - Blocking] semver + @types/semver 의존성 추가**
- **Found during:** Task 1 (upgrade 명령 구현)
- **Issue:** semver 패키지가 CLI package.json에 없어 import 실패 + TS7016 타입 에러
- **Fix:** `pnpm add semver --filter @waiaas/cli` + `pnpm add -D @types/semver --filter @waiaas/cli`
- **Files modified:** packages/cli/package.json, pnpm-lock.yaml
- **Verification:** TypeScript 컴파일 통과
- **Committed in:** 68bccd7 (Task 1 commit)

**3. [Rule 1 - Bug] 미사용 resolvePort 함수 제거**
- **Found during:** Task 1 (upgrade 명령 구현)
- **Issue:** TS6133 'resolvePort' declared but never read -- plan에 resolvePort 사용 언급이 있었으나 실제 upgrade 로직에서는 PID 파일 기반 데몬 중지를 사용하여 불필요
- **Fix:** 미사용 resolvePort 함수 및 DEFAULT_PORT 상수 제거
- **Files modified:** packages/cli/src/commands/upgrade.ts
- **Verification:** TypeScript 컴파일 통과
- **Committed in:** 68bccd7 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** 모두 정상 빌드를 위한 필수 수정. Scope creep 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 161 완료: CLI 알림 (161-01) + BackupService (161-02) + upgrade 명령 (161-03) 모두 구현
- Phase 162 (호환성 + Docker)에서 Docker 환경에서의 업그레이드 통합 가능
- Phase 163 (release-please)에서 자동 버전 범프 시 upgrade --check가 새 버전 감지 가능

## Self-Check: PASSED
