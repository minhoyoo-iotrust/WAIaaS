---
phase: 357-e2e-infra
plan: 02
subsystem: testing
tags: [child_process, daemon, push-relay, lifecycle, health-check]

requires:
  - phase: 357-01
    provides: "@waiaas/e2e-tests package structure"

provides:
  - "DaemonManager: fork CLI, health check, clean shutdown"
  - "PushRelayManager: fork push-relay bin, health check, clean shutdown"
  - "Temp dir + config.toml auto-generation for isolated test environments"

affects: [357-03, 358, 359, 360, 362, 363]

tech-stack:
  added: []
  patterns: ["child_process.fork for E2E daemon spawning", "health check polling pattern"]

key-files:
  created:
    - packages/e2e-tests/src/helpers/daemon-lifecycle.ts
    - packages/e2e-tests/src/helpers/push-relay-lifecycle.ts
    - packages/e2e-tests/src/helpers/index.ts
    - packages/e2e-tests/src/__tests__/daemon-lifecycle.test.ts
  modified:
    - packages/e2e-tests/src/index.ts

key-decisions:
  - "child_process.fork instead of spawn for IPC + ESM compatibility"
  - "WAIAAS_CLI_PATH / PUSH_RELAY_BIN_PATH env vars for CI flexibility"
  - "127.0.0.1 hostname (not localhost) to avoid IPv6 issues"
  - "PushRelayManager config includes minimal valid relay config with dummy push credentials"

patterns-established:
  - "DaemonManager/PushRelayManager start/stop pattern for all E2E tests"
  - "Skip test if CLI not built (existsSync check + describe.skipIf)"

requirements-completed: [INFRA-02, INFRA-03]

duration: 5min
completed: 2026-03-09
---

# Phase 357 Plan 02: Daemon/Push Relay Lifecycle Management Summary

**DaemonManager and PushRelayManager that fork CLI/push-relay as child processes with auto-generated temp dirs, config.toml, and health check polling**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T06:22:00Z
- **Completed:** 2026-03-09T06:27:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- DaemonManager starts real daemon via child_process.fork with isolated temp dirs
- Daemon lifecycle test proves start -> health check -> stop works in ~3 seconds
- PushRelayManager implements identical pattern with push-relay specific config
- Both managers support env var overrides for CI environments

## Task Commits

1. **Task 1+2: DaemonManager + PushRelayManager + lifecycle test** - `d56680b9` (feat)

## Files Created/Modified
- `packages/e2e-tests/src/helpers/daemon-lifecycle.ts` - DaemonManager (temp dir, config, fork, health, stop)
- `packages/e2e-tests/src/helpers/push-relay-lifecycle.ts` - PushRelayManager (relay config, fork, health, stop)
- `packages/e2e-tests/src/helpers/index.ts` - Helper re-exports
- `packages/e2e-tests/src/__tests__/daemon-lifecycle.test.ts` - Daemon lifecycle integration test
- `packages/e2e-tests/src/index.ts` - Added helper exports

## Decisions Made
- Used child_process.fork (not spawn) for IPC channel and ESM module support
- PushRelayManager generates minimal valid relay config with dummy Pushwoosh credentials to satisfy Zod validation
- Both managers use SIGTERM -> wait 5s -> SIGKILL for graceful shutdown

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed monorepo path resolution**
- **Found during:** Task 2 (daemon lifecycle test)
- **Issue:** 4-level parent traversal from helpers/ went past packages/ to repo root
- **Fix:** Changed to 3-level traversal: helpers/ -> src/ -> e2e-tests/ -> packages/
- **Files modified:** daemon-lifecycle.ts, push-relay-lifecycle.ts, daemon-lifecycle.test.ts
- **Verification:** Test passes, daemon starts successfully

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential path fix for correct bin resolution. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DaemonManager ready for session/HTTP helper tests (Plan 03)
- Both managers ready for all E2E scenarios in subsequent phases

---
*Phase: 357-e2e-infra*
*Completed: 2026-03-09*
