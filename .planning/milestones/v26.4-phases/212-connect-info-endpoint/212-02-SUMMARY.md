---
phase: 212-connect-info-endpoint
plan: 02
subsystem: api
tags: [hono, session, admin, integration-test, vitest, prompt-builder]

# Dependency graph
requires:
  - phase: 212-connect-info-endpoint
    provides: buildConnectInfoPrompt reusable helper, GET /v1/connect-info endpoint
  - phase: 210-session-model-restructure
    provides: session_wallets junction table, 1:N session-wallet model
provides:
  - Refactored POST /admin/agent-prompt with single multi-wallet session
  - Shared prompt builder usage (buildConnectInfoPrompt) across connect-info + agent-prompt
  - 11 integration tests covering connect-info and agent-prompt endpoints
affects: [213 integration layer, SDK type generation]

# Tech tracking
tech-stack:
  added: []
  patterns: [single multi-wallet session creation in agent-prompt, shared prompt builder reuse]

key-files:
  created:
    - packages/daemon/src/__tests__/connect-info.test.ts
  modified:
    - packages/daemon/src/api/routes/admin.ts

key-decisions:
  - "agent-prompt creates exactly 1 session with N session_wallets rows (not N sessions)"
  - "JWT wlt claim set to first (default) wallet ID"
  - "Session Token and Session ID appended after buildConnectInfoPrompt output for immediate agent use"
  - "Capabilities computed identically to connect-info (transfer/token_transfer/balance/assets + conditional sign/actions/x402)"
  - "Per-wallet policies queried and passed to buildConnectInfoPrompt for consistent prompt format"

patterns-established:
  - "Shared prompt builder: both connect-info and agent-prompt use buildConnectInfoPrompt for consistent AI agent guidance"
  - "Single multi-wallet session pattern: admin endpoints create 1 session linking N wallets via session_wallets"

requirements-completed: [DISC-04]

# Metrics
duration: 6min
completed: 2026-02-21
---

# Phase 212 Plan 02: Agent-Prompt Refactor + Connect-Info Integration Tests Summary

**POST /admin/agent-prompt refactored to single multi-wallet session with shared buildConnectInfoPrompt, plus 11 integration tests covering connect-info and agent-prompt endpoints**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-20T17:24:36Z
- **Completed:** 2026-02-20T17:30:21Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Refactored agent-prompt handler: single session with N session_wallets rows instead of N sessions
- Shared prompt builder (buildConnectInfoPrompt) now used by both connect-info and agent-prompt
- 11 integration tests: session info, wallet scoping, policies, capabilities, x402 config, auth, single session creation, end-to-end flow
- Zero regression in existing session lifecycle and wallet-id-selection tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor POST /admin/agent-prompt to single multi-wallet session + shared prompt builder** - `e039fcb` (feat)
2. **Task 2: Integration tests for connect-info and agent-prompt** - `710e19c` (test)

## Files Created/Modified
- `packages/daemon/src/api/routes/admin.ts` - Refactored agent-prompt handler: single session creation, buildConnectInfoPrompt usage, capability detection, session token appended to prompt
- `packages/daemon/src/__tests__/connect-info.test.ts` - 11 integration tests covering connect-info response structure, session scoping, policies, capabilities, auth enforcement, agent-prompt single session, shared prompt format, end-to-end flow (525 lines)

## Decisions Made
- agent-prompt creates exactly 1 session (not N per-wallet sessions), with N session_wallets rows linking all target wallets
- JWT `wlt` claim contains the first (default) wallet ID, consistent with multi-wallet session model
- Session Token and Session ID are appended after the buildConnectInfoPrompt output text, enabling agents to immediately start using the returned credentials
- Capabilities logic identical between connect-info and agent-prompt: always includes transfer/token_transfer/balance/assets, conditionally adds sign/actions/x402
- Test policy types use actual CHECK constraint values (SPENDING_LIMIT, ALLOWED_TOKENS) not conceptual names (TRANSFER_LIMIT)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed policy type names in test seedPolicy helper**
- **Found during:** Task 2 (integration tests)
- **Issue:** Plan suggested 'TRANSFER_LIMIT' policy type but actual DB CHECK constraint only allows 'SPENDING_LIMIT'
- **Fix:** Changed seedPolicy calls to use valid policy types (SPENDING_LIMIT, ALLOWED_TOKENS)
- **Files modified:** packages/daemon/src/__tests__/connect-info.test.ts
- **Verification:** All 11 tests pass
- **Committed in:** 710e19c (Task 2 commit)

**2. [Rule 1 - Bug] Fixed x402 capability test assertion**
- **Found during:** Task 2 (integration tests)
- **Issue:** Plan assumed x402 disabled by default, but DaemonConfigSchema defaults to x402.enabled=true
- **Fix:** Split into two tests: one verifying x402 present when enabled (default), one creating app with x402 disabled to verify absence
- **Files modified:** packages/daemon/src/__tests__/connect-info.test.ts
- **Verification:** Both x402 tests pass, 11 total tests pass
- **Committed in:** 710e19c (Task 2 commit)

**3. [Rule 1 - Bug] Removed unused variables causing lint errors**
- **Found during:** Task 2 (lint verification)
- **Issue:** Leftover `newSessionId` and `agentPromptSessions` variables in test caused no-unused-vars lint errors
- **Fix:** Replaced with simpler assertion querying newest session's session_wallets count
- **Files modified:** packages/daemon/src/__tests__/connect-info.test.ts
- **Verification:** Zero lint errors, all tests pass
- **Committed in:** 710e19c (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 x Rule 1 bugs)
**Impact on plan:** All auto-fixes necessary for test correctness. No scope creep.

## Issues Encountered
None -- plan executed with minor test data corrections.

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- connect-info and agent-prompt endpoints fully functional with shared prompt builder
- 11 integration tests provide coverage for Phase 213 integration layer work
- All endpoints use consistent multi-wallet session model (session_wallets junction)

## Self-Check: PASSED

- [x] admin.ts exists and modified
- [x] connect-info.test.ts exists and created (525 lines)
- [x] 212-02-SUMMARY.md exists
- [x] Commit e039fcb found (Task 1)
- [x] Commit 710e19c found (Task 2)

---
*Phase: 212-connect-info-endpoint*
*Completed: 2026-02-21*
