---
phase: 121-mcp-stability
plan: 01
subsystem: mcp
tags: [mcp, graceful-shutdown, stdin, process-lifecycle, stdio-transport]

# Dependency graph
requires:
  - phase: 63-mcp-hardening
    provides: SessionManager lifecycle (dispose, start, recovery loop)
provides:
  - "createShutdownHandler() — idempotent shutdown with force-exit timeout"
  - "registerShutdownListeners() — stdin end/close + SIGTERM/SIGINT detection"
  - "BUG-020 수정 — 클라이언트 종료 시 MCP 서버 자동 종료"
affects: [mcp-server, desktop-app]

# Tech tracking
tech-stack:
  added: []
  patterns: [shutdown-handler-factory, dependency-injection-for-testing, idempotent-once-guard]

key-files:
  created:
    - packages/mcp/src/__tests__/shutdown.test.ts
  modified:
    - packages/mcp/src/index.ts
    - objectives/issues/v1.4.5-020-mcp-orphan-process-on-client-exit.md
    - objectives/issues/TRACKER.md

key-decisions:
  - "shutdown 로직을 createShutdownHandler() 팩토리로 추출하여 DI 기반 테스트 가능하게 함"
  - "shutdown 핸들러를 server.connect() 이전에 등록 — stdin이 즉시 닫힐 수 있는 경우 대비"
  - "setTimeout().unref()로 force-exit 타이머가 프로세스 종료를 차단하지 않도록 함"

patterns-established:
  - "Shutdown factory pattern: createShutdownHandler(deps, opts) with DI exit function"
  - "Idempotent once guard: shuttingDown boolean prevents duplicate cleanup"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 121 Plan 01: MCP Graceful Shutdown Summary

**stdin end/close 감지 + 3초 force-exit 타임아웃으로 Claude Desktop 종료 시 MCP 고아 프로세스 잔류 방지 (BUG-020)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-14T23:52:36Z
- **Completed:** 2026-02-14T23:54:53Z
- **Tasks:** 1 (TDD: RED -> GREEN)
- **Files modified:** 4

## Accomplishments

- `createShutdownHandler()` 팩토리 함수로 idempotent shutdown 구현 (MCPS-03: 중복 호출 안전)
- `registerShutdownListeners()`로 stdin end/close + SIGTERM/SIGINT 4개 이벤트 감지 (MCPS-01)
- 3초 force-exit 타임아웃으로 server.close() 미완료 시에도 프로세스 종료 보장 (MCPS-02)
- 기존 inline SIGTERM/SIGINT 핸들러 제거, 팩토리 패턴으로 교체
- BUG-020 이슈 RESOLVED 처리, TRACKER.md 갱신

## Task Commits

Each task was committed atomically (TDD RED -> GREEN):

1. **Task 1 (RED): shutdown 동작 테스트** - `5476e90` (test)
2. **Task 1 (GREEN): shutdown + stdin 감지 구현** - `9574884` (feat)

_Note: REFACTOR phase에서 추가 변경 불필요 — 코드가 이미 깔끔함._

## Files Created/Modified

- `packages/mcp/src/__tests__/shutdown.test.ts` - 10개 테스트: createShutdownHandler, registerShutdownListeners, 소스 통합 검증
- `packages/mcp/src/index.ts` - createShutdownHandler() + registerShutdownListeners() 추출, main() 리팩터링
- `objectives/issues/v1.4.5-020-mcp-orphan-process-on-client-exit.md` - 상태 RESOLVED 갱신
- `objectives/issues/TRACKER.md` - 020번 이슈 FIXED 갱신

## Decisions Made

- **shutdown 로직 팩토리 추출:** `createShutdownHandler(deps, opts)` 형태로 추출하여 exit 함수를 DI로 주입, vi.useFakeTimers + vi.advanceTimersByTime으로 force-exit 타임아웃 테스트 가능
- **server.connect 이전 핸들러 등록:** 클라이언트가 연결 직후 즉시 종료하는 경우에도 stdin close를 감지할 수 있도록 connect 이전에 registerShutdownListeners 호출
- **setTimeout().unref():** force-exit 타이머가 프로세스 종료를 차단하지 않도록 unref() 호출 — graceful close가 완료되면 타이머 없이도 종료 가능

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MCP 서버 라이프사이클 안정화 완료
- 전체 MCP 테스트 152개 통과 (회귀 없음)
- BUG-011 init order 테스트도 정상 통과 (connect -> start 순서 유지)

## Self-Check: PASSED

- [x] packages/mcp/src/__tests__/shutdown.test.ts exists
- [x] packages/mcp/src/index.ts exists (modified)
- [x] .planning/phases/121-mcp-stability/121-01-SUMMARY.md exists
- [x] Commit 5476e90 exists (RED)
- [x] Commit 9574884 exists (GREEN)
- [x] must_haves key_links verified: process.stdin.on, setTimeout force exit
- [x] must_haves artifact: describe.*shutdown in test file (2 matches)

---
*Phase: 121-mcp-stability*
*Completed: 2026-02-15*
