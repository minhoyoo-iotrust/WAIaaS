---
phase: 51-cli-e2e-integration
plan: 01
subsystem: cli
tags: [commander, cli, init, start, stop, status, process-management]

# Dependency graph
requires:
  - phase: 49-daemon-infra
    provides: DaemonLifecycle, startDaemon(), registerSignalHandlers
  - phase: 50-api-solana-pipeline
    provides: HTTP server, health endpoint, createApp
provides:
  - 4 CLI commands (init, start, stop, status) via commander ^13.x
  - resolveDataDir utility (--data-dir / env / default)
  - resolvePassword utility (env / file / interactive)
  - 20 unit tests for CLI commands
affects: [51-02 E2E integration tests, future CLI extensions]

# Tech tracking
tech-stack:
  added: [commander ^13.x]
  patterns: [commander subcommands, PID-based process management, ExitError test pattern]

key-files:
  created:
    - packages/cli/src/commands/init.ts
    - packages/cli/src/commands/start.ts
    - packages/cli/src/commands/stop.ts
    - packages/cli/src/commands/status.ts
    - packages/cli/src/utils/data-dir.ts
    - packages/cli/src/utils/password.ts
    - packages/cli/src/__tests__/cli-commands.test.ts
  modified:
    - packages/cli/src/index.ts
    - packages/cli/package.json
    - packages/cli/tsconfig.json
    - pnpm-lock.yaml
    - packages/core/src/__tests__/enums.test.ts
    - packages/daemon/src/lifecycle/workers.ts

key-decisions:
  - "TD-10 resolved: commander ^13.x for CLI framework"
  - "ExitError throw pattern for testing process.exit calls"
  - "Simple TOML regex port parsing in status command (avoids heavy daemon import)"
  - "Exclude __tests__ from tsc build output via tsconfig exclude"

patterns-established:
  - "CLI command pattern: async function xxxCommand(dataDir: string): Promise<void>"
  - "Password resolution priority: env var > file > interactive prompt"
  - "PID-based daemon management: write PID file on start, read+signal on stop/status"
  - "ExitError class in tests: throw from mocked process.exit to halt execution"

# Metrics
duration: 9min
completed: 2026-02-10
---

# Phase 51 Plan 01: CLI Commands Summary

**4 CLI commands (init/start/stop/status) via commander ^13.x with PID-based process management and 20 unit tests**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-10T03:14:07Z
- **Completed:** 2026-02-10T03:22:54Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Implemented all 4 CLI commands (init, start, stop, status) with shared --data-dir option
- TD-10 design decision resolved: commander ^13.x chosen as CLI framework
- 20 unit tests covering all commands and utility functions
- Total test count: 269 (65 core + 17 adapter + 167 daemon + 20 CLI)
- Fixed 2 pre-existing issues (enum test count, unused variable lint error)

## Task Commits

Each task was committed atomically:

1. **Task 1: CLI framework setup + 4 commands** - `8d0ec8a` (feat)
2. **Task 2: CLI command unit tests** - `ef624bf` (test)

## Files Created/Modified
- `packages/cli/src/index.ts` - CLI entry point with commander program and 4 subcommands
- `packages/cli/src/commands/init.ts` - Creates data dir, subdirs, config.toml (idempotent)
- `packages/cli/src/commands/start.ts` - PID check, password resolution, startDaemon in-process
- `packages/cli/src/commands/stop.ts` - PID file + SIGTERM + SIGKILL timeout (10s)
- `packages/cli/src/commands/status.ts` - PID check + health probe + port resolution
- `packages/cli/src/utils/data-dir.ts` - resolveDataDir (--data-dir / env / ~/.waiaas/)
- `packages/cli/src/utils/password.ts` - resolvePassword (env / file / interactive)
- `packages/cli/src/__tests__/cli-commands.test.ts` - 20 unit tests
- `packages/cli/package.json` - Added commander ^13.x dependency
- `packages/cli/tsconfig.json` - Excluded __tests__ from build
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| TD-10: commander ^13.x | Lightweight, stable, ESM-native, well-documented; 4 commands is within commander's sweet spot |
| ExitError throw pattern | Mocking process.exit as no-op causes test timeout (code continues to stdin prompt); throwing ExitError halts execution and is testable |
| Simple TOML regex for port in status | Avoids importing full config loader (pulls daemon deps); status command only needs port number |
| Exclude __tests__ from tsc build | Tests use vitest globals/types not available in tsc build context; prevents false compilation errors |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing TransactionStatus enum test count**
- **Found during:** Task 2 (full test suite run)
- **Issue:** Test expected 8 TransactionStatus values but PARTIAL_FAILURE was added in phase 49-01, making it 9
- **Fix:** Updated test assertion from 8 to 9
- **Files modified:** `packages/core/src/__tests__/enums.test.ts`
- **Verification:** `pnpm test --filter=@waiaas/core` passes all 65 tests
- **Committed in:** `ef624bf` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed pre-existing unused variable lint error in daemon workers**
- **Found during:** Task 2 (full lint run)
- **Issue:** `_name` variable assigned but never used in `stopAll()` destructuring
- **Fix:** Changed `[_name, timer]` to `[, timer]` (standard JS ignore pattern)
- **Files modified:** `packages/daemon/src/lifecycle/workers.ts`
- **Verification:** `pnpm lint` passes all 4 packages
- **Committed in:** `ef624bf` (Task 2 commit)

**3. [Rule 3 - Blocking] Added __tests__ exclusion to CLI tsconfig**
- **Found during:** Task 2 (build with test file)
- **Issue:** tsc compiled test files, causing unused import errors
- **Fix:** Added `"exclude": ["src/__tests__"]` to CLI tsconfig.json
- **Files modified:** `packages/cli/tsconfig.json`
- **Verification:** `pnpm build --filter=@waiaas/cli` succeeds
- **Committed in:** `ef624bf` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bug, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep. Pre-existing issues would have blocked full test suite and lint passes.

## Issues Encountered
- process.exit mock as no-op caused test timeout: startCommand continued past exit to resolvePassword interactive prompt. Resolved with ExitError throw pattern.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CLI layer complete, ready for E2E integration tests (Plan 51-02)
- All 4 commands functional: init creates data dir, start calls startDaemon, stop manages PID, status probes health
- Full user journey possible: `waiaas init -> waiaas start -> API calls -> waiaas stop`
- No blockers for 51-02

## Self-Check: PASSED

---
*Phase: 51-cli-e2e-integration*
*Completed: 2026-02-10*
