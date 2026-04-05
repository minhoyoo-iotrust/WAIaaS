---
phase: 103-mcp-5type-feature-parity
plan: 01
subsystem: mcp
tags: [mcp, tools, contract-call, approve, batch, discriminatedUnion]

requires:
  - phase: 76-81 (v1.4 token/contract extension)
    provides: "CONTRACT_CALL, APPROVE, BATCH transaction types in REST API and pipeline"
  - phase: 58-63 (v1.3 SDK/MCP)
    provides: "MCP server with 7 tools + 3 resources, tool registration pattern"
provides:
  - "call_contract MCP tool for CONTRACT_CALL transactions"
  - "approve_token MCP tool for APPROVE transactions"
  - "send_batch MCP tool for BATCH transactions"
  - "MCP feature parity with REST API and SDK for all 5 transaction types"
affects: [103-02 (tests), mcp-docs, sdk-parity]

tech-stack:
  added: []
  patterns: ["MCP tool per transaction type (pass-through to daemon pipeline validation)"]

key-files:
  created:
    - packages/mcp/src/tools/call-contract.ts
    - packages/mcp/src/tools/approve-token.ts
    - packages/mcp/src/tools/send-batch.ts
  modified:
    - packages/mcp/src/server.ts
    - packages/mcp/src/tools/send-token.ts
    - packages/mcp/src/__tests__/server.test.ts

key-decisions:
  - "z.record(z.unknown()) for batch instructions instead of full union schema (daemon Stage 1 validates)"
  - "Each transaction type gets its own MCP tool (not merged into send_token) for clear Claude Desktop UX"

patterns-established:
  - "MCP tool pass-through pattern: thin Zod schema at MCP layer, real validation in daemon pipeline"

duration: 3min
completed: 2026-02-14
---

# Phase 103 Plan 01: MCP 5-Type Feature Parity Summary

**3 new MCP tools (call_contract, approve_token, send_batch) for full discriminatedUnion 5-type parity with REST API and SDK**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-13T15:27:11Z
- **Completed:** 2026-02-13T15:30:06Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created call_contract tool supporting both EVM (calldata/abi/value) and Solana (programId/instructionData/accounts) params
- Created approve_token tool with spender/token/amount params for ERC-20 approve and SPL delegate
- Created send_batch tool with instructions array (2-20) for Solana atomic batches
- Registered all 3 new tools in server.ts (7 -> 10 tools), updated JSDoc and comments
- Removed MCPSDK-04 restriction comment from send-token.ts
- All 120 MCP tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create call_contract, approve_token, send_batch MCP tool files** - `f0a0fac` (feat)
2. **Task 2: Register new tools in server.ts and clean up send-token.ts comment** - `0c97386` (feat)

## Files Created/Modified
- `packages/mcp/src/tools/call-contract.ts` - call_contract MCP tool for CONTRACT_CALL transactions
- `packages/mcp/src/tools/approve-token.ts` - approve_token MCP tool for APPROVE transactions
- `packages/mcp/src/tools/send-batch.ts` - send_batch MCP tool for BATCH transactions
- `packages/mcp/src/server.ts` - Import + register 3 new tools (7 -> 10), update JSDoc
- `packages/mcp/src/tools/send-token.ts` - Remove MCPSDK-04 restriction, add cross-reference to new tools
- `packages/mcp/src/__tests__/server.test.ts` - Update tool count assertion from 7 to 10

## Decisions Made
- Used `z.record(z.unknown())` for batch instruction items instead of duplicating the full union schema -- the daemon's pipeline Stage 1 performs proper Zod validation, so MCP layer just passes through
- Each transaction type gets its own dedicated MCP tool rather than overloading send_token, for clearer Claude Desktop tool discovery UX

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated server.test.ts tool count assertion**
- **Found during:** Task 2 (server registration)
- **Issue:** server.test.ts asserted `mockTool.toHaveBeenCalledTimes(7)` but now 10 tools registered
- **Fix:** Updated assertion from 7 to 10
- **Files modified:** packages/mcp/src/__tests__/server.test.ts
- **Verification:** All 120 MCP tests pass
- **Committed in:** 0c97386 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test assertion update was necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 10 MCP tools registered and functional
- Ready for 103-02 (tests for the 3 new tools)
- TypeScript compiles cleanly, all 120 existing tests pass

## Self-Check: PASSED

All 6 files verified present. All 2 commits verified in git log.

---
*Phase: 103-mcp-5type-feature-parity*
*Completed: 2026-02-14*
