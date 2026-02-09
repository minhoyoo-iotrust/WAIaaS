---
phase: 49-daemon-infra
plan: 03
subsystem: infra
tags: [smol-toml, zod, proper-lockfile, daemon-lifecycle, config-loader, signal-handler, background-workers]

# Dependency graph
requires:
  - phase: 48-monorepo-scaffold-core
    provides: "@waiaas/core WAIaaSError, error codes, Zod"
  - phase: 49-daemon-infra plan 01
    provides: "createDatabase(), pushSchema(), closeDatabase(), DatabaseConnection"
  - phase: 49-daemon-infra plan 02
    provides: "LocalKeyStore class with lockAll()"
provides:
  - "loadConfig() with smol-toml parsing, nested section detection, env override, Zod validation"
  - "DaemonConfigSchema: 7-section Zod schema (daemon/keystore/database/rpc/notifications/security/walletconnect)"
  - "DaemonLifecycle: 6-step startup (config+flock/DB/keystore/adapter-stub/http-stub/workers+PID)"
  - "DaemonLifecycle: 10-step graceful shutdown (workers/WAL-TRUNCATE/keystore-lock/DB-close/PID-cleanup)"
  - "BackgroundWorkers: periodic WAL checkpoint (5-min) + session cleanup (1-min)"
  - "registerSignalHandlers: SIGINT/SIGTERM/SIGBREAK wiring"
  - "proper-lockfile exclusive daemon lock preventing multiple instances"
  - "startDaemon() convenience function"
  - "45 tests covering config parsing, env overrides, lifecycle, locking, workers"
affects:
  - "50-solana-transfer (fills in adapter init + HTTP server stubs)"
  - "51-api-daemon (uses DaemonLifecycle, config, workers)"

# Tech tracking
tech-stack:
  added: ["smol-toml ^1.3.0", "proper-lockfile ^4.1.2", "zod ^3.24.0", "@types/proper-lockfile ^4.1.4"]
  patterns: ["loadConfig pipeline: parse -> detectNested -> envOverride -> zodValidate", "withTimeout per-step + overall cap", "proper-lockfile for cross-platform daemon lock"]

key-files:
  created:
    - "packages/daemon/src/infrastructure/config/loader.ts"
    - "packages/daemon/src/infrastructure/config/index.ts"
    - "packages/daemon/src/lifecycle/daemon.ts"
    - "packages/daemon/src/lifecycle/signal-handler.ts"
    - "packages/daemon/src/lifecycle/workers.ts"
    - "packages/daemon/src/lifecycle/index.ts"
    - "packages/daemon/src/__tests__/config-loader.test.ts"
    - "packages/daemon/src/__tests__/lifecycle.test.ts"
  modified:
    - "packages/daemon/package.json"
    - "packages/daemon/src/index.ts"
    - "pnpm-lock.yaml"

key-decisions:
  - "proper-lockfile for cross-platform daemon lock (not native flock or PID-only)"
  - "Dynamic import for proper-lockfile (CJS package in ESM context)"
  - "withTimeout utility using Promise.race with WAIaaSError SYSTEM_LOCKED"
  - "Steps 4+5 stubbed for Phase 50 (adapter init + HTTP server)"
  - "zod added as direct dependency to daemon (not just via @waiaas/core)"
  - "BackgroundWorkers uses real timers with async void IIFE and overlap guard"

patterns-established:
  - "Config pipeline: smol-toml parse -> detectNestedSections -> applyEnvOverrides -> Zod parse"
  - "Env override pattern: WAIAAS_{SECTION}_{KEY} with type coercion (bool/number/array/string)"
  - "Startup sequence: per-step withTimeout + 90s overall cap"
  - "Shutdown cascade: guard flag -> force timer -> workers -> WAL -> keystore -> DB -> PID -> lock"
  - "BackgroundWorkers: register/startAll/stopAll with overlap prevention and drain wait"

# Metrics
duration: 8min
completed: 2026-02-10
---

# Phase 49 Plan 03: Config + Lifecycle Summary

**smol-toml config loader with 7-section Zod schema, env overrides, nested section rejection; DaemonLifecycle 6-step startup / 10-step shutdown with proper-lockfile, BackgroundWorkers, signal handling; 45 tests**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-09T17:10:59Z
- **Completed:** 2026-02-09T17:19:19Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Config loader pipeline: smol-toml parsing -> nested section detection -> WAIAAS_{SECTION}_{KEY} env overrides -> DaemonConfigSchema Zod validation with defaults for all 7 sections
- DaemonLifecycle 6-step startup with per-step timeouts (5s/30s/30s/10s/5s/none) and 90s overall cap; creates DB, pushes schema, initializes keystore, starts workers, writes PID
- DaemonLifecycle 10-step graceful shutdown: stop workers, WAL checkpoint(TRUNCATE), keystore lockAll (sodium_memzero), DB close, PID cleanup, lock release
- proper-lockfile exclusive daemon lock preventing concurrent instances with SYSTEM_LOCKED error
- BackgroundWorkers with WAL checkpoint (5-min PASSIVE) and session cleanup (1-min) periodic tasks, overlap prevention, error isolation
- registerSignalHandlers wires SIGINT/SIGTERM/SIGBREAK + uncaughtException/unhandledRejection
- 45 tests across 2 test files covering config parsing, env overrides, nested rejection, Zod validation, withTimeout, workers, lock contention, PID, shutdown, signal handlers

## Task Commits

Each task was committed atomically:

1. **Task 1: Config loader + DaemonLifecycle + signal handler + BackgroundWorkers** - `6efffd2` (feat)
2. **Task 2: Config + lifecycle tests (45 tests)** - `aafda3b` (test)

## Files Created/Modified

- `packages/daemon/src/infrastructure/config/loader.ts` - loadConfig(), DaemonConfigSchema (7 sections), detectNestedSections, applyEnvOverrides, parseEnvValue
- `packages/daemon/src/infrastructure/config/index.ts` - Config module barrel export
- `packages/daemon/src/lifecycle/daemon.ts` - DaemonLifecycle class (6-step start, 10-step shutdown), acquireDaemonLock, withTimeout
- `packages/daemon/src/lifecycle/signal-handler.ts` - registerSignalHandlers (SIGINT/SIGTERM/SIGBREAK)
- `packages/daemon/src/lifecycle/workers.ts` - BackgroundWorkers class (register/startAll/stopAll)
- `packages/daemon/src/lifecycle/index.ts` - Lifecycle module barrel export
- `packages/daemon/src/index.ts` - Updated with config + lifecycle exports + startDaemon convenience function
- `packages/daemon/package.json` - Added smol-toml, proper-lockfile, zod, @types/proper-lockfile
- `packages/daemon/src/__tests__/config-loader.test.ts` - 28 tests for config loading pipeline
- `packages/daemon/src/__tests__/lifecycle.test.ts` - 17 tests for lifecycle, workers, locking, shutdown
- `pnpm-lock.yaml` - Updated with new dependencies

## Decisions Made

- **proper-lockfile for daemon lock:** Used `proper-lockfile` ^4.1.2 instead of native flock or PID-file-only approach. Provides cross-platform support with stale lock detection and retry mechanisms. Dynamic import used since it's a CJS package in ESM context.
- **withTimeout uses SYSTEM_LOCKED error code:** No STARTUP_TIMEOUT error code exists in the 66-code matrix. Used SYSTEM_LOCKED (httpStatus 503, retryable) with descriptive message including the step-specific error code string.
- **Steps 4+5 stubbed:** Adapter initialization and HTTP server start are stubs for v1.1, to be filled in Phase 50.
- **zod as direct daemon dependency:** Although available via @waiaas/core, the daemon uses Zod directly for its full DaemonConfigSchema, making the dependency explicit.
- **BackgroundWorkers uses async void IIFE with overlap guard:** The async handler pattern required real timers in tests (fake timers don't properly flush microtasks from async IIFE).

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

- **Fake timer incompatibility with async IIFE:** BackgroundWorkers uses `void (async () => { ... })()` in setInterval callbacks. Vitest fake timers (`vi.useFakeTimers`) don't properly flush the microtask queue from these async IIFEs, causing the `running` flag to remain true and skip subsequent invocations. Resolved by using real timers with short intervals (50ms) in worker tests instead.
- **Unused import TS error:** `beforeEach`/`afterEach` imports from vitest were unused after refactoring BackgroundWorkers tests from fake to real timers. Fixed by removing unused imports.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- Phase 49 (daemon-infra) complete: all 3 plans (database, keystore, config+lifecycle) delivered
- DaemonLifecycle.start() Steps 4 (adapter) and 5 (HTTP server) are stubs ready for Phase 50
- BackgroundWorkers framework ready for additional workers in future phases
- All 114 daemon tests passing (37 database + 32 keystore + 28 config + 17 lifecycle)
- Build passes with `pnpm build --filter=@waiaas/daemon`

## Self-Check: PASSED
