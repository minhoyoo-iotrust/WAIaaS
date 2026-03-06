---
phase: 341-interface-integration
plan: 02
subsystem: api
tags: [mcp, sdk, skill-files, userop, erc-4337, smart-account]

requires:
  - phase: 340-userop-sign-api
    provides: UserOp Build/Sign REST API endpoints
provides:
  - MCP build_userop and sign_userop tools (37 total)
  - SDK buildUserOp() and signUserOp() methods (36 total)
  - Skill file documentation for UserOp API, Lite/Full modes
affects: [mcp, sdk, skill-files]

tech-stack:
  added: []
  patterns: [masterAuth-sdk-pattern]

key-files:
  created:
    - packages/mcp/src/tools/build-userop.ts
    - packages/mcp/src/tools/sign-userop.ts
    - packages/mcp/src/__tests__/userop-tools.test.ts
  modified:
    - packages/mcp/src/server.ts
    - packages/mcp/src/__tests__/server.test.ts
    - packages/sdk/src/client.ts
    - packages/sdk/src/types.ts
    - packages/sdk/src/__tests__/client.test.ts
    - skills/transactions.skill.md
    - skills/wallet.skill.md
    - skills/admin.skill.md

key-decisions:
  - "D15: SDK UserOp methods use masterAuth (not sessionAuth) matching daemon endpoint auth"
  - "D16: MCP tools use snake_case params (call_data, build_id) mapped to camelCase API fields"

patterns-established:
  - "masterAuth SDK methods: throw NO_MASTER_PASSWORD if not configured"

requirements-completed: [INTF-01, INTF-02, INTF-03, SKILL-01, SKILL-02, SKILL-03]

duration: 6min
completed: 2026-03-06
---

# Phase 341 Plan 02: MCP + SDK + Skill Files Summary

**MCP 2 tools (build_userop/sign_userop), SDK 2 methods (buildUserOp/signUserOp), and 3 skill file updates for UserOp API**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-06T09:39:00Z
- **Completed:** 2026-03-06T09:45:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- MCP build_userop tool with full TransactionRequest params and sign_userop with UserOperationV07 fields
- SDK buildUserOp()/signUserOp() with masterAuth and typed params/responses
- transactions.skill.md: complete UserOp Build/Sign API reference with examples
- wallet.skill.md: Lite/Full mode explanation
- admin.skill.md: Lite mode creation guidance

## Task Commits

Each task was committed atomically:

1. **Task 1: MCP build_userop + sign_userop tools** - `22ce828e` (feat)
2. **Task 2: SDK methods + skill files** - `2d46da2d` (feat)

## Files Created/Modified
- `packages/mcp/src/tools/build-userop.ts` - MCP build_userop tool
- `packages/mcp/src/tools/sign-userop.ts` - MCP sign_userop tool
- `packages/mcp/src/__tests__/userop-tools.test.ts` - 4 MCP tool tests
- `packages/mcp/src/server.ts` - Register 2 new tools (35 -> 37)
- `packages/mcp/src/__tests__/server.test.ts` - Update tool count assertion
- `packages/sdk/src/types.ts` - BuildUserOpParams/Response, SignUserOpParams/Response
- `packages/sdk/src/client.ts` - buildUserOp() and signUserOp() methods
- `packages/sdk/src/__tests__/client.test.ts` - 2 new SDK tests
- `skills/transactions.skill.md` - UserOp Build/Sign API section
- `skills/wallet.skill.md` - Smart Account Modes section
- `skills/admin.skill.md` - Lite Mode setup guidance

## Decisions Made
- D15: SDK UserOp methods use masterAuth (not sessionAuth) to match daemon endpoint auth pattern
- D16: MCP tools use snake_case params (standard for MCP) mapped to camelCase API fields

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SDK auth method from sessionAuth to masterAuth**
- **Found during:** Task 2 (SDK methods)
- **Issue:** Initial implementation used authHeaders() (sessionAuth) but UserOp endpoints require masterAuth
- **Fix:** Changed to masterHeaders() with NO_MASTER_PASSWORD guard
- **Files modified:** packages/sdk/src/client.ts
- **Verification:** 180 SDK tests pass
- **Committed in:** 2d46da2d (Task 2 commit)

**2. [Rule 1 - Bug] Updated MCP server.test.ts tool count from 35 to 37**
- **Found during:** Task 1 (MCP tools)
- **Issue:** Existing test asserted 35 tools, now 37
- **Fix:** Updated assertion to 37
- **Files modified:** packages/mcp/src/__tests__/server.test.ts
- **Verification:** 228 MCP tests pass
- **Committed in:** 22ce828e (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for test correctness and proper auth. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 341 complete. All v31.2 milestone interfaces integrated.
- Ready for milestone completion.

---
*Phase: 341-interface-integration*
*Completed: 2026-03-06*
