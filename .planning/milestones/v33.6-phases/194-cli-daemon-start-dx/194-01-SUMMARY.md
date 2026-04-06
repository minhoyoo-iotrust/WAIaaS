---
phase: 194-cli-daemon-start-dx
plan: 01
subsystem: cli
tags: [commander, createRequire, engines.node, init, dx]

# Dependency graph
requires: []
provides:
  - "Dynamic CLI version from package.json via createRequire"
  - "engines.node >= 22.0.0 constraint"
  - "Init password guidance (WAIAAS_MASTER_PASSWORD)"
  - "Config template with commented [security], [rpc], [notifications] sections"
  - "EACCES/EPERM permission error handling in init"
affects: [cli, daemon-start]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "createRequire for ESM JSON import (avoids resolveJsonModule build issues)"
    - "try/catch with error.code matching for friendly filesystem error messages"

key-files:
  created: []
  modified:
    - packages/cli/src/index.ts
    - packages/cli/package.json
    - packages/cli/src/commands/init.ts
    - packages/cli/src/__tests__/cli-commands.test.ts

key-decisions:
  - "Used createRequire instead of import assertion for package.json (avoids dist/ copy issue in ESM builds)"
  - "EACCES/EPERM errors caught and re-formatted; other errors re-thrown as-is"

patterns-established:
  - "createRequire pattern for reading package.json version in ESM CLI entrypoints"

requirements-completed: [CLI-01, CLI-02, CLI-03, CLI-04, CLI-05]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 194 Plan 01: CLI First Run DX Summary

**Dynamic --version from package.json via createRequire, init password guidance with commented config sections, and EACCES permission error handling**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T12:35:09Z
- **Completed:** 2026-02-19T12:39:32Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `waiaas --version` now outputs actual semver version (2.3.0) instead of hardcoded 0.0.0
- `engines.node >= 22.0.0` declared in package.json for npm install-time validation
- Init completion message includes WAIAAS_MASTER_PASSWORD and WAIAAS_MASTER_PASSWORD_FILE setup instructions
- Config template enriched with commented [security], [rpc], [notifications] section examples
- Permission errors (EACCES/EPERM) produce friendly message with sudo fix suggestion
- 3 new tests added (169 total, all passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: CLI --version dynamic version + engines.node** - `7466309` (feat)
2. **Task 2: init password guidance + config template + permission errors** - `2abdf87` (feat)

## Files Created/Modified
- `packages/cli/src/index.ts` - Added createRequire for dynamic version, replaced hardcoded '0.0.0'
- `packages/cli/package.json` - Added engines.node >= 22.0.0 constraint
- `packages/cli/src/commands/init.ts` - Enhanced DEFAULT_CONFIG with commented sections, password guidance, EACCES handling
- `packages/cli/src/__tests__/cli-commands.test.ts` - Added 3 tests: config template sections, password guidance, permission errors

## Decisions Made
- Used `createRequire` instead of `import ... with { type: 'json' }` for reading package.json version in ESM, avoiding the TypeScript resolveJsonModule + ESM build issue where package.json doesn't get copied to dist/
- EACCES/EPERM errors are caught and reformatted with actionable fix suggestion; other filesystem errors are re-thrown unchanged

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed permission test approach**
- **Found during:** Task 2 (test writing)
- **Issue:** Initial test attempted to mock `mkdirSync` via `vi.spyOn` on ESM node:fs module, which is not configurable
- **Fix:** Used actual filesystem permissions (chmod 0o444 on parent directory) to trigger real EACCES error
- **Files modified:** packages/cli/src/__tests__/cli-commands.test.ts
- **Verification:** All 169 tests pass
- **Committed in:** 2abdf87 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test approach)
**Impact on plan:** Test approach corrected to work with ESM module constraints. No scope creep.

## Issues Encountered
None beyond the test approach adjustment documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CLI first-run DX improvements complete
- Ready for 194-02 (daemon start DX improvements)

## Self-Check: PASSED

All 4 modified files exist. Both task commits (7466309, 2abdf87) verified in git log.

---
*Phase: 194-cli-daemon-start-dx*
*Completed: 2026-02-19*
