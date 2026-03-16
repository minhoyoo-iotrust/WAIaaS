---
phase: 437-large-file-split
plan: 02
subsystem: infra
tags: [daemon, lifecycle, typescript, import-type, file-split]

requires:
  - phase: 437-01
    provides: stable migration refactoring pattern

provides:
  - Zero inline import() type annotations in daemon.ts (25+ replaced with static import type)
  - daemon.ts split into 4 files (startup/shutdown/pipeline + class shell)

affects: [438-pipeline-split]

tech-stack:
  added: []
  patterns: [static import type over inline import(), DaemonState interface for extracted modules]

key-files:
  created:
    - packages/daemon/src/lifecycle/daemon-startup.ts
    - packages/daemon/src/lifecycle/daemon-shutdown.ts
    - packages/daemon/src/lifecycle/daemon-pipeline.ts
  modified:
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/__tests__/platform/telegram-bot.platform.test.ts

key-decisions:
  - "Replace inline import() types with static import type statements (DMN-05)"
  - "Use DaemonState interface exposing all fields for extracted modules (DMN-04)"
  - "Extract startup/shutdown/pipeline as standalone functions receiving DaemonState"
  - "Keep acquireDaemonLock as instance method (uses proper-lockfile)"

patterns-established:
  - "Use static import type instead of inline import('...').TypeName for field/return type annotations"
  - "Extract class methods to standalone functions that receive state interface parameter"

requirements-completed: [DMN-01, DMN-02, DMN-03, DMN-04, DMN-05, DMN-06]

duration: 25min
completed: 2026-03-17
---

# Phase 437 Plan 02: daemon.ts Split Summary

**Split daemon.ts (2,412 lines) into 4 files: class shell (327 lines), startup (1,704 lines), shutdown (195 lines), pipeline (321 lines)**

## Performance

- **Duration:** 25 min (includes initial 13min for DMN-05, then 12min for DMN-01-04)
- **Started:** 2026-03-16T18:29:00Z
- **Completed:** 2026-03-17T04:10:00Z
- **Tasks:** 2 of 2 planned
- **Files modified:** 5

## Accomplishments
- Replaced all 25+ inline `import('...').TypeName` annotations with static `import type` statements (DMN-05)
- Created DaemonState interface exposing all 50+ fields for extracted modules (DMN-04)
- Extracted 6-step startup sequence to daemon-startup.ts (1,704 lines) (DMN-01)
- Extracted 10-step shutdown cascade to daemon-shutdown.ts (195 lines) (DMN-02)
- Extracted pipeline re-entry (executeFromStage4/5, handleApprovalApproved) to daemon-pipeline.ts (321 lines) (DMN-03)
- Slimmed daemon.ts to 327 lines: class shell with field declarations, getters, thin wrappers (DMN-04)
- Updated telegram-bot platform test to read from daemon-shutdown.ts
- All 314 test files pass (5040 tests), typecheck and lint clean

## Task Commits

1. **Task 1: Replace inline import() types (DMN-05)** - `07c47025` (refactor)
2. **Task 2: Split daemon.ts into startup/shutdown/pipeline (DMN-01-04, DMN-06)** - `d5e2fffc` (refactor)

## Files Created/Modified
- `packages/daemon/src/lifecycle/daemon.ts` - Class shell with DaemonState interface (327 lines, was 2,412)
- `packages/daemon/src/lifecycle/daemon-startup.ts` - 6-step startup sequence (1,704 lines)
- `packages/daemon/src/lifecycle/daemon-shutdown.ts` - 10-step shutdown cascade (195 lines)
- `packages/daemon/src/lifecycle/daemon-pipeline.ts` - Pipeline re-entry logic (321 lines)
- `packages/daemon/src/__tests__/platform/telegram-bot.platform.test.ts` - Updated source file path

## Decisions Made
- DaemonState interface exposes all fields as public (no private) for extracted module access
- Standalone functions receive DaemonState as first parameter instead of using `this` context
- acquireDaemonLock kept as instance method since proper-lockfile stores release callback on instance
- startWorkers extracted as a local helper within daemon-startup.ts (Step 6 logic)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated telegram-bot platform test**
- **Found during:** Task 2
- **Issue:** Test reads daemon.ts source to verify shutdown cleanup calls; after split, those strings are in daemon-shutdown.ts
- **Fix:** Updated test to read daemon-shutdown.ts and use `.telegramBotService` pattern match
- **Files modified:** telegram-bot.platform.test.ts
- **Commit:** d5e2fffc

## Issues Encountered
None

---
*Phase: 437-large-file-split*
*Completed: 2026-03-17*
