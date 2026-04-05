---
phase: 103-mcp-5type-feature-parity
plan: 02
subsystem: mcp
tags: [mcp, tools, tests, contract-call, approve, batch, feature-parity, bug-fix]

requires:
  - phase: 103-01
    provides: "call_contract, approve_token, send_batch MCP tool implementations"
  - phase: 58-63 (v1.3 SDK/MCP)
    provides: "MCP test infrastructure and mock patterns (tools.test.ts)"
provides:
  - "Comprehensive tests for all 10 MCP tools (40 tests total)"
  - "MCPSDK-04 formal revocation in design document 38"
  - "Feature parity principle documented: MCP/SDK/API support same transaction types"
  - "BUG-017 resolved"
affects: [mcp-docs, sdk-parity, admin-docs]

tech-stack:
  added: []
  patterns: ["Same mock ApiClient pattern extended for CONTRACT_CALL/APPROVE/BATCH tool tests"]

key-files:
  modified:
    - packages/mcp/src/__tests__/tools.test.ts
    - .planning/deliverables/38-sdk-mcp-interface.md
    - objectives/bug-reports/v1.4.1-BUG-017-mcp-contract-call-blocked.md

key-decisions:
  - "MCPSDK-04 formally revoked: MCP/SDK/API share identical attack surface, policy engine provides real security"
  - "Feature Parity principle established: MCP/SDK/API must support same transaction types"

patterns-established:
  - "MCP tool test pattern: createMockApiClient + getToolHandler + assert apiClient.post body for all 5 transaction types"

duration: 3min
completed: 2026-02-14
---

# Phase 103 Plan 02: MCP 5-Type Tests + MCPSDK-04 Revocation + BUG-017 Summary

**11 new tests for call_contract/approve_token/send_batch MCP tools, MCPSDK-04 design decision formally revoked with feature parity principle, BUG-017 closed**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-13T15:31:57Z
- **Completed:** 2026-02-13T15:35:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added 11 new test cases: 4 call_contract (EVM params, Solana params, policy rejection, optional fields), 2 approve_token (APPROVE relay, SPENDER_NOT_APPROVED), 2 send_batch (BATCH relay, BATCH_NOT_SUPPORTED), 3 registration tests
- Updated design document 38: MCP tool count 6 -> 10, added MCPSDK-04 revocation decision note, updated feature parity table (section 9.1), updated createMcpServer references
- Closed BUG-017 as RESOLVED with resolution date and method

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tests for call_contract, approve_token, send_batch tools** - `0d36ea1` (test)
2. **Task 2: Update design document 38 and close BUG-017** - `ae22975` (docs)

## Files Created/Modified
- `packages/mcp/src/__tests__/tools.test.ts` - Extended from 29 to 40 tests covering all 10 MCP tools
- `.planning/deliverables/38-sdk-mcp-interface.md` - MCPSDK-04 revocation, tool count 6->10, feature parity table updated
- `objectives/bug-reports/v1.4.1-BUG-017-mcp-contract-call-blocked.md` - Status OPEN -> RESOLVED

## Decisions Made
- MCPSDK-04 formally revoked with explicit justification: MCP/SDK/API share identical prompt injection attack surface; real security is policy engine (CONTRACT_WHITELIST, APPROVED_SPENDERS, default deny) applied uniformly regardless of call path
- Feature Parity principle established: MCP, SDK, and API must support the same transaction types

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 10 MCP tools fully tested (40 tests, all passing)
- Phase 103 complete: MCP 5-type feature parity achieved
- Design document 38 and BUG-017 tracking trail complete
- Ready for next milestone

## Self-Check: PASSED

All 3 files verified present. All 2 commits verified in git log.

---
*Phase: 103-mcp-5type-feature-parity*
*Completed: 2026-02-14*
