---
phase: 158-platform-test
plan: 01
subsystem: testing
tags: [vitest, platform-test, cli, daemon, lifecycle, signal-handling, pid-management]

requires:
  - phase: 48-51 (v1.1 core infra)
    provides: CLI commands (init/start/stop/status), DaemonLifecycle, registerSignalHandlers

provides:
  - CLI Daemon 플랫폼 테스트 32건 (init 4 + status 5 + signal 5 + start 6 + stop 5 + exit-codes 6 + E2E 1)
  - 프로세스 라이프사이클 품질 검증 (PID 관리, 시그널 핸들링, 그레이스풀 셧다운, 종료 코드)

affects: [159-cicd, deployment, daemon-lifecycle]

tech-stack:
  added: []
  patterns:
    - "initTestDataDir() + startTestDaemon() 격리 harness 패턴"
    - "ExitError 클래스로 process.exit mock 패턴"
    - "process.on spy로 signal handler 캡처 후 수동 트리거 패턴"

key-files:
  created:
    - packages/cli/src/__tests__/platform/init.platform.test.ts
    - packages/cli/src/__tests__/platform/status.platform.test.ts
    - packages/cli/src/__tests__/platform/signal.platform.test.ts
    - packages/cli/src/__tests__/platform/start-stop.platform.test.ts
    - packages/cli/src/__tests__/platform/e2e-flow.platform.test.ts
  modified: []

key-decisions:
  - "158-01: START-05 config.toml 삭제 대신 port만 유지한 minimal config로 기본값 테스트 (EADDRINUSE 방지)"
  - "158-01: EXIT-03 빈 password file로 resolvePassword 에러 트리거 (stdin prompt hang 방지)"
  - "158-01: START-06 DaemonLifecycle.start() 직접 호출로 lock 충돌 검증 (startDaemon의 registerSignalHandlers 부작용 회피)"

patterns-established:
  - "Platform test: 실제 daemon lifecycle을 tmpdir에서 검증하는 통합 테스트 패턴"
  - "Signal test: process.on spy + 수동 handler 트리거로 시그널 핸들링 검증"

duration: 6min
completed: 2026-02-17
---

# Phase 158 Plan 01: CLI Daemon Platform Tests Summary

**CLI 데몬 프로세스 라이프사이클 32건 플랫폼 테스트 -- init/start/stop/status/signal/exit-codes/E2E 전체 검증**

## Performance

- **Duration:** 6min
- **Started:** 2026-02-16T16:39:28Z
- **Completed:** 2026-02-16T16:45:34Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- init 4건: 디렉토리 생성, 재실행 방어, 퍼미션 0o700, config.toml 내용 검증
- status 5건: stopped/running/starting 3상태 + Windows SIGBREAK/경로 구분자 호환
- signal 5건: SIGINT/SIGTERM/이중시그널/uncaughtException/unhandledRejection 핸들링
- start 6건: PID 파일, /health 200, already running, stale PID, 기본값 fallback, daemon.lock 충돌
- stop 5건: not running, stale PID 삭제, SIGTERM 정상 종료, 10-step cascade, force timer
- exit codes 6건: 정상 종료 code 0, 5가지 에러 시나리오 code 1
- E2E 1건: init -> start -> health -> status(running) -> shutdown -> status(stopped) 전체 플로우

## Task Commits

Each task was committed atomically:

1. **Task 1: CLI init/status/signal 플랫폼 테스트 14건** - `35c1be7` (test)
2. **Task 2: CLI start/stop/exit-codes/E2E 플랫폼 테스트 18건** - `83cdc49` (test)

## Files Created
- `packages/cli/src/__tests__/platform/init.platform.test.ts` - init 4건 (127 lines)
- `packages/cli/src/__tests__/platform/status.platform.test.ts` - status 3건 + Windows 2건 (182 lines)
- `packages/cli/src/__tests__/platform/signal.platform.test.ts` - signal 5건 (165 lines)
- `packages/cli/src/__tests__/platform/start-stop.platform.test.ts` - start 6 + stop 5 + exit codes 6 = 17건 (491 lines)
- `packages/cli/src/__tests__/platform/e2e-flow.platform.test.ts` - E2E 1건 (85 lines)

**Total:** 1,050 lines, 32 tests

## Decisions Made
- **START-05 기본값 테스트 방식 변경**: config.toml 삭제 시 default port 3100이 EADDRINUSE 유발. port만 남긴 minimal config로 다른 필드의 Zod 기본값 적용을 검증.
- **EXIT-03 비밀번호 미제공 테스트**: 환경변수 삭제 시 stdin interactive prompt가 hang 유발. 빈 파일을 WAIAAS_MASTER_PASSWORD_FILE로 지정하여 "empty" 에러를 트리거.
- **START-06 lock 충돌 테스트**: startDaemon() 대신 DaemonLifecycle.start() 직접 호출로 registerSignalHandlers 부작용(글로벌 process.on 중복 등록) 회피.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] START-05 EADDRINUSE 크래시 수정**
- **Found during:** Task 2 (start-stop.platform.test.ts)
- **Issue:** config.toml 삭제 시 default port 3100으로 시작하여 기존 프로세스와 포트 충돌, vitest worker OOM 크래시
- **Fix:** config.toml에 free port만 유지하고 나머지 기본값 검증으로 변경
- **Files modified:** start-stop.platform.test.ts
- **Verification:** 17 tests all pass

**2. [Rule 1 - Bug] EXIT-03 stdin hang 수정**
- **Found during:** Task 2 (start-stop.platform.test.ts)
- **Issue:** WAIAAS_MASTER_PASSWORD 삭제 시 resolvePassword()가 interactive stdin prompt로 fallback, 30s timeout
- **Fix:** 빈 password file 생성 후 WAIAAS_MASTER_PASSWORD_FILE 환경변수로 지정하여 에러 트리거
- **Files modified:** start-stop.platform.test.ts
- **Verification:** EXIT-03 즉시 통과 (1ms)

**3. [Rule 1 - Bug] START-06 signal handler 간섭 수정**
- **Found during:** Task 2 (start-stop.platform.test.ts)
- **Issue:** startDaemon()이 registerSignalHandlers를 호출하여 글로벌 process event handler 중복 등록
- **Fix:** DaemonLifecycle.start() 직접 호출로 signal handler 등록 없이 lock 충돌만 검증
- **Files modified:** start-stop.platform.test.ts
- **Verification:** START-06 정상 통과

---

**Total deviations:** 3 auto-fixed (3 Rule 1 - Bug)
**Impact on plan:** 테스트 격리 및 CI 안정성에 필수적인 수정. 기능 범위 변경 없음.

## Issues Encountered
None beyond the auto-fixed test isolation issues documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 158-02 이미 완료 (Docker 18 + Telegram Bot 34 platform tests)
- CLI Daemon 32건 + Docker 18건 + Telegram Bot 34건 = 플랫폼 테스트 84건 완료
- Phase 159 (CI/CD) 진행 준비 완료

## Self-Check: PASSED

- All 5 test files exist
- All 32 tests pass (vitest run)
- Commit 35c1be7 (Task 1) found
- Commit 83cdc49 (Task 2) found
- Existing cli-commands.test.ts (20 tests) unaffected

---
*Phase: 158-platform-test*
*Completed: 2026-02-17*
