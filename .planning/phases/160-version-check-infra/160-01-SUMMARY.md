---
phase: 160-version-check-infra
plan: 01
subsystem: infra
tags: [npm-registry, version-check, background-workers, semver, key-value-store]

# Dependency graph
requires: []
provides:
  - BackgroundWorkers runImmediately option
  - VersionCheckService (npm registry latest version check)
  - config.toml update_check / update_check_interval settings
  - version-check worker registered in daemon Step 6
affects: [161-cli-notification-upgrade, 162-compatibility-docker]

# Tech tracking
tech-stack:
  added: [semver, "@types/semver"]
  patterns: [runImmediately fire-and-forget worker, fail-soft npm fetch]

key-files:
  created:
    - packages/daemon/src/infrastructure/version/version-check-service.ts
    - packages/daemon/src/infrastructure/version/index.ts
    - packages/daemon/src/__tests__/version-check-service.test.ts
  modified:
    - packages/daemon/src/lifecycle/workers.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/infrastructure/config/loader.ts
    - packages/daemon/src/__tests__/lifecycle.test.ts
    - packages/daemon/package.json

key-decisions:
  - "semver 패키지로 버전 비교 (npm registry dist-tags.latest와 현재 버전 비교)"
  - "AbortSignal.timeout(5000)으로 fetch 타임아웃 (Node.js native)"
  - "key_value_store에 version_check_latest, version_check_checked_at 저장 (INSERT OR REPLACE)"

patterns-established:
  - "runImmediately: BackgroundWorkers에서 startAll() 호출 시 즉시 1회 실행 후 interval 반복"
  - "fail-soft version check: 모든 에러를 catch하여 console.warn 후 null 반환"

requirements-completed: [VCHK-01, VCHK-02, VCHK-03, VCHK-04]

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 160 Plan 01: Version Check Infra Summary

**BackgroundWorkers runImmediately 확장 + VersionCheckService npm registry 최신 버전 조회 (semver 비교, key_value_store 저장, fail-soft)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-17T00:08:56Z
- **Completed:** 2026-02-17T00:12:05Z
- **Tasks:** 1
- **Files modified:** 9

## Accomplishments
- BackgroundWorkers에 runImmediately 옵션 추가 (startAll 시 즉시 1회 fire-and-forget 실행, running 플래그로 interval과 겹침 방지)
- VersionCheckService 구현: npm registry에서 @waiaas/cli 최신 버전 조회 -> key_value_store에 저장
- config.toml daemon 섹션에 update_check(bool, 기본 true), update_check_interval(초, 기본 86400) 설정 추가
- 데몬 Step 6에서 update_check=true 시 version-check 워커 등록 (runImmediately: true, 24시간 주기)
- fail-soft: fetch 실패/타임아웃/파싱 에러 시 데몬 정상 동작 보장
- 31개 테스트 통과 (VersionCheckService 11건 + lifecycle 20건)

## Task Commits

Each task was committed atomically:

1. **Task 1: BackgroundWorkers runImmediately + VersionCheckService + config + daemon registration** - `8ad9759` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `packages/daemon/src/infrastructure/version/version-check-service.ts` - npm registry fetch + key_value_store 저장 + getLatest/getCheckedAt 조회
- `packages/daemon/src/infrastructure/version/index.ts` - Barrel export
- `packages/daemon/src/__tests__/version-check-service.test.ts` - 11개 테스트 (성공/실패/타임아웃/파싱/덮어쓰기)
- `packages/daemon/src/lifecycle/workers.ts` - runImmediately 옵션 추가 (WorkerRegistration, register, startAll)
- `packages/daemon/src/lifecycle/daemon.ts` - version-check 워커 등록 (Step 6) + versionCheckService 필드/getter
- `packages/daemon/src/infrastructure/config/loader.ts` - daemon 섹션에 update_check, update_check_interval 추가
- `packages/daemon/src/__tests__/lifecycle.test.ts` - runImmediately 관련 3개 테스트 추가
- `packages/daemon/package.json` - semver 의존성 추가
- `pnpm-lock.yaml` - lockfile 업데이트

## Decisions Made
- semver 패키지를 dependencies로 추가 (devDependencies에 없었음). 런타임 버전 비교에 사용.
- npm registry URL은 `https://registry.npmjs.org/@waiaas/cli` (objectives 문서 참조)
- fetch 타임아웃 5초 (AbortSignal.timeout 사용, Node.js 네이티브)
- User-Agent 헤더에 현재 버전만 포함 (프라이버시 보호)
- versionCheckService를 DaemonLifecycle 클래스 필드로 저장하여 향후 Health API에서 접근 가능

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] handler 반환 타입 불일치 수정**
- **Found during:** Task 1 (tsc --noEmit 검증)
- **Issue:** version-check handler가 `Promise<{ latest, current }>` 반환하여 `() => void | Promise<void>` 타입과 불일치
- **Fix:** `async () => { await this._versionCheckService!.check(); }` 래퍼로 반환값 무시
- **Files modified:** packages/daemon/src/lifecycle/daemon.ts
- **Verification:** tsc --noEmit 통과 (기존 pre-existing 에러 제외)
- **Committed in:** 8ad9759 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** 타입 안전성 확보를 위한 사소한 수정. 스코프 변경 없음.

## Issues Encountered
- pre-existing tsc 에러 1건 (security-test-helpers.ts의 crypto_sign_seed_keypair) -- 본 변경과 무관, 기존 알려진 이슈

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- VersionCheckService가 key_value_store에 최신 버전 정보 저장 -> Plan 02에서 Health API가 이를 읽어서 응답에 포함
- DaemonLifecycle.versionCheckService getter 준비 -> createApp deps로 전달 가능
- BackgroundWorkers runImmediately 패턴 확립 -> 향후 다른 워커에서 동일 패턴 사용 가능

## Self-Check: PASSED

- [x] version-check-service.ts exists
- [x] version/index.ts exists
- [x] version-check-service.test.ts exists
- [x] 160-01-SUMMARY.md exists
- [x] Commit 8ad9759 exists

---
*Phase: 160-version-check-infra*
*Completed: 2026-02-17*
