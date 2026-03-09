---
phase: 359-offchain-smoke-interface-ops
plan: 02
subsystem: testing
tags: [e2e, notification, token-registry, connect-info, vitest]

requires:
  - phase: 358-offchain-smoke-core
    provides: E2E test patterns (DaemonManager, setupDaemonSession, E2EHttpClient)
provides:
  - 3 operational E2E scenarios (notification-channel, token-registry-crud, connect-info-discovery)
  - deleteWithBody helper for DELETE requests with JSON body
affects: [361-cicd-workflow, 364-scenario-enforcement]

tech-stack:
  added: []
  patterns: [deleteWithBody for HTTP DELETE with body, graceful error acceptance in smoke tests]

key-files:
  created:
    - packages/e2e-tests/src/scenarios/ops-notification-token-connectinfo.ts
    - packages/e2e-tests/src/__tests__/ops-notification-token-connectinfo.e2e.test.ts
  modified: []

key-decisions:
  - "Notification test accepts 200/400/422 for test notification (no channel configured is valid)"
  - "Used raw fetch for DELETE with body since E2EHttpClient.delete does not support body"
  - "Token registry uses ethereum-sepolia network for test token"

patterns-established:
  - "Smoke test: accept multiple status codes for endpoints that may lack configuration"
  - "deleteWithBody: raw fetch wrapper for DELETE methods requiring JSON body"

requirements-completed: [IFACE-04, IFACE-05, IFACE-06]

duration: 3min
completed: 2026-03-09
---

# Phase 359 Plan 02: Notification + Token Registry + Connect-Info E2E Summary

**3 ops E2E scenarios testing notification status/test/log endpoints, token registry CRUD cycle, and connect-info self-discovery**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T07:01:00Z
- **Completed:** 2026-03-09T07:04:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Notification tests smoke-check status/test/log endpoints with graceful error handling
- Token registry tests full CRUD cycle: add custom ERC-20 -> list -> delete -> confirm removal
- Connect-info tests verify session, wallets array, and capabilities/daemon presence
- Added deleteWithBody helper for DELETE requests needing JSON body

## Task Commits

1. **Task 1: Register 3 ops scenarios + create E2E test file** - `9098d0a9` (feat)

## Files Created/Modified
- `packages/e2e-tests/src/scenarios/ops-notification-token-connectinfo.ts` - 3 scenario registrations
- `packages/e2e-tests/src/__tests__/ops-notification-token-connectinfo.e2e.test.ts` - E2E tests (3 describe blocks)

## Decisions Made
- Notification test notification accepts 400/422 as valid (no channel configured is expected in E2E)
- Used raw fetch for DELETE /v1/tokens (requires JSON body, E2EHttpClient.delete doesn't support it)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created deleteWithBody helper for DELETE with JSON body**
- **Found during:** Task 1 (token registry delete test)
- **Issue:** E2EHttpClient.delete does not accept a body parameter, but DELETE /v1/tokens requires { network, address } in body
- **Fix:** Created inline deleteWithBody function using raw fetch
- **Files modified:** packages/e2e-tests/src/__tests__/ops-notification-token-connectinfo.e2e.test.ts
- **Verification:** TypeScript type-check passes
- **Committed in:** 9098d0a9

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor utility addition to work around E2EHttpClient API limitation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All operational E2E scenarios registered and ready for CI/CD integration

---
*Phase: 359-offchain-smoke-interface-ops*
*Completed: 2026-03-09*
