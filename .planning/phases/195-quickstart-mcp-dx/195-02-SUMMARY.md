---
phase: 195-quickstart-mcp-dx
plan: 02
subsystem: cli
tags: [mcp, cli, dx, error-messages, session-expiry]

# Dependency graph
requires:
  - phase: 195-quickstart-mcp-dx
    provides: "quickstart command as primary entry point"
provides:
  - "MCP setup error messages with quickstart guidance"
  - "Default session expiry (24h) warning with --expires-in option"
affects: [mcp, cli, skills]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Default-value warning pattern: show guidance only when using defaults"]

key-files:
  created: []
  modified:
    - packages/cli/src/commands/mcp-setup.ts
    - packages/cli/src/__tests__/mcp-setup.test.ts

key-decisions:
  - "Use expiresIn === 86400 comparison for default detection (simple, covers edge case where user explicitly passes 86400)"

patterns-established:
  - "Default-value warning: show helpful guidance when user relies on defaults, suppress when they explicitly set values"

requirements-completed: [DAEMON-04, MCP-01]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 195 Plan 02: MCP Setup Error Message + Expiry Warning Summary

**MCP setup "Run waiaas quickstart first" guidance and 24h default session expiry warning with --expires-in option hint**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T12:54:21Z
- **Completed:** 2026-02-19T12:58:53Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced "Run waiaas init first" with "Run waiaas quickstart first" in both no-wallets error paths (single-wallet and --all flows)
- Added 24h default session expiry warning with --expires-in customization guidance after successful MCP setup
- Warning suppressed when user explicitly sets --expires-in to a non-default value
- Added 4 new tests covering quickstart guidance, default expiry warning, custom expiry suppression, and --all mode expiry warning

## Task Commits

Each task was committed atomically:

1. **Task 1: mcp-setup error message + expiry warning** - `27b7495` (feat)
2. **Task 2: mcp-setup test updates** - `2336233` (test)

## Files Created/Modified
- `packages/cli/src/commands/mcp-setup.ts` - Error messages changed to quickstart guidance, expiry warning added to both flows
- `packages/cli/src/__tests__/mcp-setup.test.ts` - Updated 2 existing tests, added 4 new tests (DAEMON-04, MCP-01 x3)

## Decisions Made
- Used `expiresIn === 86400` for default detection rather than tracking whether opts.expiresIn was undefined. Simpler approach, and the edge case where user explicitly passes 86400 is harmless (they'd still see a helpful message).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused variable lint error**
- **Found during:** Task 2 (test update)
- **Issue:** `init` parameter in custom expiry test fetch mock was defined but never used, causing eslint error
- **Fix:** Removed unused `init` parameter from the mock function signature
- **Files modified:** packages/cli/src/__tests__/mcp-setup.test.ts
- **Verification:** `pnpm turbo run lint --filter=@waiaas/cli` passes with 0 errors
- **Committed in:** 2336233 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor lint fix, no scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP setup now provides clear quickstart guidance and session expiry awareness
- Ready for Phase 196+ plans

## Self-Check: PASSED

- [x] mcp-setup.ts exists and modified
- [x] mcp-setup.test.ts exists and modified
- [x] SUMMARY.md exists
- [x] Commit 27b7495 found
- [x] Commit 2336233 found

---
*Phase: 195-quickstart-mcp-dx*
*Completed: 2026-02-19*
