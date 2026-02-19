---
phase: 189-oidc-conversion
plan: 02
subsystem: infra
tags: [oidc, npm, provenance, ci, github-actions, trusted-publishing]

# Dependency graph
requires:
  - phase: 189-oidc-conversion/01
    provides: "npmjs.com Trusted Publisher registration (manual), npm version upgrade step in deploy job"
provides:
  - "OIDC-authenticated npm publish with provenance signing in release.yml deploy job"
  - "NODE_AUTH_TOKEN-free deploy pipeline"
affects: [190-oidc-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: ["OIDC token exchange for npm publish", "npm publish --provenance for Sigstore attestation"]

key-files:
  created: []
  modified: [".github/workflows/release.yml"]

key-decisions:
  - "Job-level permissions (not workflow-level) to limit OIDC scope to deploy job only"
  - "npm publish instead of pnpm publish for reliable OIDC token forwarding"
  - "publish-check job unchanged -- dry-run does not need provenance"

patterns-established:
  - "OIDC publish pattern: permissions.id-token: write + npm publish --provenance --access public"

requirements-completed: [OIDC-02, OIDC-03, OIDC-04, OIDC-05]

# Metrics
duration: 1min
completed: 2026-02-19
---

# Phase 189 Plan 02: OIDC Deploy Conversion Summary

**release.yml deploy job converted from NODE_AUTH_TOKEN to OIDC auth with npm publish --provenance for Sigstore provenance badges**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-19T00:13:11Z
- **Completed:** 2026-02-19T00:14:13Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Deploy job now uses GitHub Actions OIDC token (id-token: write) for npm authentication
- Removed Setup npmrc step and all NODE_AUTH_TOKEN references from deploy job
- Switched from pnpm publish to npm publish --provenance --access public for Sigstore attestation
- Pre-release versions retain --tag rc flag for npm dist-tag management
- publish-check job preserved as-is (dry-run with pnpm, no provenance needed)

## Task Commits

Each task was committed atomically:

1. **Task 1: deploy job OIDC conversion** - `df4187c` (ci)

## Files Created/Modified
- `.github/workflows/release.yml` - Deploy job: added permissions block (id-token: write, contents: read), removed Setup npmrc step and NODE_AUTH_TOKEN env, replaced pnpm publish with npm publish --provenance, updated summary text and job comment

## Decisions Made
- Job-level permissions block chosen over workflow-level to avoid granting OIDC scope to test/platform/publish-check jobs
- npm publish used directly (not pnpm publish) to ensure OIDC token is properly forwarded by npm CLI
- publish-check job left unchanged since dry-run does not trigger OIDC token exchange and does not need --provenance

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. (Note: npmjs.com Trusted Publisher registration is a Phase 189-01 prerequisite, handled separately.)

## Next Phase Readiness
- OIDC deploy workflow is ready for verification via a test release (Phase 190)
- NPM_TOKEN secret should be retained until successful OIDC publish is confirmed
- All 8 packages will get provenance badges on next release

## Self-Check: PASSED

- FOUND: 189-02-SUMMARY.md
- FOUND: df4187c (Task 1 commit)

---
*Phase: 189-oidc-conversion*
*Completed: 2026-02-19*
