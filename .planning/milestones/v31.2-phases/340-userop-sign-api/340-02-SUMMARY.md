---
phase: 340-userop-sign-api
plan: 02
subsystem: api
tags: [connect-info, capability, userop, smart-account, prompt]

requires:
  - phase: 340-userop-sign-api
    provides: sign endpoint, USEROP_BUILD/USEROP_SIGNED audit events
provides:
  - userop capability in connect-info
  - UserOp API guidance in agent prompt
affects: [341-interface-integration, mcp, sdk]

tech-stack:
  added: []
  patterns: [capability-detection]

key-files:
  created:
    - packages/daemon/src/__tests__/connect-info-userop.test.ts
  modified:
    - packages/daemon/src/api/routes/connect-info.ts

key-decisions:
  - "D12: userop capability separate from smart_account -- any Smart Account qualifies vs aaProvider required"

patterns-established:
  - "Capability = feature availability signal: userop signals UserOp Build/Sign API available"

requirements-completed: [CONN-01, CONN-02]

duration: 2min
completed: 2026-03-06
---

# Phase 340 Plan 02: connect-info userop capability Summary

**Added userop capability to connect-info for Smart Account wallets with UserOp API prompt guidance for agent self-discovery**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T09:24:00Z
- **Completed:** 2026-03-06T09:26:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added 'userop' capability that appears when any linked wallet has accountType=smart
- Existing 'smart_account' capability unchanged (requires aaProvider set)
- Prompt includes per-wallet UserOp API URLs for Lite mode Smart Account wallets
- Added UserOp Build/Sign workflow instruction to usage section
- 5 tests, 28 existing connect-info tests pass (no regression)

## Task Commits

1. **Task 1: Add userop capability + prompt guidance** - `e27e5aaa` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/connect-info.ts` - Added userop capability + prompt UserOp API guidance
- `packages/daemon/src/__tests__/connect-info-userop.test.ts` - 5 tests for userop capability

## Decisions Made
- D12: userop capability is separate from smart_account -- any Smart Account wallet qualifies (Lite or Full), while smart_account still requires aaProvider

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 340 complete, ready for Phase 341 (Interface Integration: Admin UI, MCP, SDK, skill files)

---
*Phase: 340-userop-sign-api*
*Completed: 2026-03-06*
