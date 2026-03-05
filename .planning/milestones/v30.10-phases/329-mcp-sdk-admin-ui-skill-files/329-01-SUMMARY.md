---
phase: 329-mcp-sdk-admin-ui-skill-files
plan: 01
subsystem: api
tags: [mcp, erc8128, rfc9421, connect-info, tools]

requires:
  - phase: 328-rest-api-policy-settings
    provides: POST /v1/erc8128/sign and POST /v1/erc8128/verify REST endpoints
provides:
  - MCP erc8128_sign_request tool wrapping POST /v1/erc8128/sign
  - MCP erc8128_verify_signature tool wrapping POST /v1/erc8128/verify
  - connect-info erc8128 capability (dynamic, settings-based)
  - 'erc8128' in SKILL_NAMES for skill resource serving
affects: [mcp, connect-info, skill-resources]

tech-stack:
  added: []
  patterns: [MCP tool wrapping REST API, connect-info settingsService capability check]

key-files:
  created:
    - packages/mcp/src/tools/erc8128-sign-request.ts
    - packages/mcp/src/tools/erc8128-verify-signature.ts
    - packages/mcp/src/__tests__/erc8128-tools.test.ts
  modified:
    - packages/mcp/src/server.ts
    - packages/mcp/src/resources/skills.ts
    - packages/daemon/src/api/routes/connect-info.ts
    - packages/daemon/src/__tests__/connect-info.test.ts

key-decisions:
  - "erc8128 capability uses settingsService.get('erc8128.enabled') pattern (same as signing_sdk)"

patterns-established: []

requirements-completed: [API-03, API-04, INT-01]

duration: 4min
completed: 2026-03-05
---

# Phase 329 Plan 01: MCP ERC-8128 Tools + Connect-Info Summary

**2 MCP tools (erc8128_sign_request + erc8128_verify_signature), connect-info erc8128 capability, 8 skill resources**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-05T06:13:16Z
- **Completed:** 2026-03-05T06:17:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- MCP erc8128_sign_request tool wrapping POST /v1/erc8128/sign with all optional params
- MCP erc8128_verify_signature tool wrapping POST /v1/erc8128/verify with snake_case -> camelCase mapping
- connect-info dynamically includes 'erc8128' capability when erc8128.enabled setting is true
- SKILL_NAMES expanded to 8 entries (added 'erc8128')
- Server registers 32 tools total

## Task Commits

1. **Task 1: MCP tools + server registration + skill resource** - `cfe19bac` (feat)
2. **Task 2: connect-info capability + MCP tool tests** - `789e5d11` (feat)
3. **Fix: server test tool count** - `dd0403d8` (fix)

## Files Created/Modified
- `packages/mcp/src/tools/erc8128-sign-request.ts` - MCP tool wrapping sign endpoint
- `packages/mcp/src/tools/erc8128-verify-signature.ts` - MCP tool wrapping verify endpoint
- `packages/mcp/src/server.ts` - Register 2 new tools (32 total)
- `packages/mcp/src/resources/skills.ts` - Add 'erc8128' to SKILL_NAMES
- `packages/daemon/src/api/routes/connect-info.ts` - erc8128 capability check
- `packages/mcp/src/__tests__/erc8128-tools.test.ts` - 5 tool tests
- `packages/daemon/src/__tests__/connect-info.test.ts` - 2 capability tests

## Decisions Made
- erc8128 capability check uses settingsService pattern (not config), matching signing_sdk approach

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed server test tool count assertion**
- **Found during:** Final verification
- **Issue:** server.test.ts expected 30 tools but we now register 32
- **Fix:** Updated assertion from 30 to 32
- **Files modified:** packages/mcp/src/__tests__/server.test.ts
- **Committed in:** dd0403d8

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary test update for new tools. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP tools and connect-info capability complete
- Ready for SDK and Admin UI integration

---
*Phase: 329-mcp-sdk-admin-ui-skill-files*
*Completed: 2026-03-05*
