---
phase: 95-package-version-management
plan: 01
subsystem: infra
tags: [version, release, bash, pnpm, monorepo]

# Dependency graph
requires: []
provides:
  - "scripts/tag-release.sh -- semver-validated release tagging + version bump script"
  - "All 9 packages (8 Node.js + 1 Python) at version 1.4.3"
  - "BUG-016 resolved -- Admin UI, OpenAPI, health endpoint show correct version"
affects: [all-packages, admin-dashboard, openapi-doc, health-endpoint]

# Tech tracking
tech-stack:
  added: []
  patterns: ["tag-release.sh for consistent version management across monorepo"]

key-files:
  created:
    - "scripts/tag-release.sh"
  modified:
    - "packages/core/package.json"
    - "packages/daemon/package.json"
    - "packages/admin/package.json"
    - "packages/cli/package.json"
    - "packages/sdk/package.json"
    - "packages/mcp/package.json"
    - "packages/adapters/evm/package.json"
    - "packages/adapters/solana/package.json"
    - "python-sdk/pyproject.toml"
    - "packages/admin/src/__tests__/dashboard.test.tsx"

key-decisions:
  - "Manual version edit for initial bump (not via script) since script creates its own git commit/tag"
  - "Dashboard test mock version synced to actual package version for consistency"

patterns-established:
  - "Release versioning: always use scripts/tag-release.sh vX.Y.Z for releases"
  - "Version source: daemon reads package.json dynamically -- no hardcoded version strings"

# Metrics
duration: 2min
completed: 2026-02-13
---

# Phase 95 Plan 01: Package Version Management Summary

**tag-release.sh script for monorepo-wide semver versioning + all 9 packages bumped to 1.4.3 (BUG-016 fix)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-13T11:52:25Z
- **Completed:** 2026-02-13T11:54:21Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Created `scripts/tag-release.sh` with semver validation, `pnpm -r exec` bulk update, pyproject.toml sed, and git commit+tag
- Updated all 8 Node.js package.json files from 0.0.0 to 1.4.3
- Updated python-sdk/pyproject.toml from 0.1.0 to 1.4.3
- Fixed dashboard test mock version to match actual version (0.1.0 -> 1.4.3)
- Verified daemon's DAEMON_VERSION reads dynamically from package.json -- no code changes needed

## Task Commits

Each task was committed atomically:

1. **Task 1: tag-release.sh script + version bump** - `186c105` (feat)
2. **Task 2: Dashboard test fix + version verification** - `3fe41bb` (fix)

## Files Created/Modified
- `scripts/tag-release.sh` - Release tagging script: semver validation, pnpm bulk version update, pyproject.toml update, git commit+tag
- `packages/core/package.json` - Version 0.0.0 -> 1.4.3
- `packages/daemon/package.json` - Version 0.0.0 -> 1.4.3 (source for DAEMON_VERSION in admin status + OpenAPI)
- `packages/admin/package.json` - Version 0.0.0 -> 1.4.3
- `packages/cli/package.json` - Version 0.0.0 -> 1.4.3
- `packages/sdk/package.json` - Version 0.0.0 -> 1.4.3
- `packages/mcp/package.json` - Version 0.0.0 -> 1.4.3
- `packages/adapters/evm/package.json` - Version 0.0.0 -> 1.4.3
- `packages/adapters/solana/package.json` - Version 0.0.0 -> 1.4.3
- `python-sdk/pyproject.toml` - Version 0.1.0 -> 1.4.3
- `packages/admin/src/__tests__/dashboard.test.tsx` - Mock version 0.1.0 -> 1.4.3

## Decisions Made
- Initial version bump done via manual edits (not via tag-release.sh) because the script creates its own git commit and tag, which conflicts with the GSD per-task commit workflow
- Dashboard test mock version updated to match actual package version for test consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All packages report version 1.4.3 correctly
- `scripts/tag-release.sh` ready for future releases
- BUG-016 resolved
- Ready for Phase 96 (EVM confirmation timeout fix)

## Self-Check: PASSED

- FOUND: scripts/tag-release.sh
- FOUND: 95-01-SUMMARY.md
- FOUND: 186c105 (Task 1 commit)
- FOUND: 3fe41bb (Task 2 commit)

---
*Phase: 95-package-version-management*
*Completed: 2026-02-13*
