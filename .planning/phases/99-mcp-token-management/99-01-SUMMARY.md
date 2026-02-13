---
phase: 99-mcp-token-management
plan: 01
subsystem: api
tags: [mcp, jwt, session, rest-api, openapi, hono, bug-fix]

# Dependency graph
requires:
  - phase: 88-owner-auth-siwe
    provides: masterAuth middleware, session creation logic, JWT signing
provides:
  - POST /v1/mcp/tokens endpoint (session + file + config snippet)
  - McpTokenCreateRequest/Response OpenAPI schemas
  - dataDir dependency in CreateAppDeps
affects: [admin-ui-mcp-panel, cli-mcp-setup-refactor]

# Tech tracking
tech-stack:
  added: []
  patterns: [atomic-file-write-tmp-rename, local-slug-copy-to-avoid-cross-package-dep]

key-files:
  created:
    - packages/daemon/src/api/routes/mcp.ts
    - packages/daemon/src/__tests__/mcp-tokens.test.ts
  modified:
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/api/index.ts
    - packages/daemon/src/lifecycle/daemon.ts

key-decisions:
  - "Local toSlug() copy in mcp.ts instead of shared package dependency (5 lines, not worth cross-package import)"
  - "dataDir passed as optional CreateAppDeps field, MCP routes only registered when dataDir is provided"
  - "WAIAAS_BASE_URL constructed from config daemon port with http://127.0.0.1:{port} pattern"

patterns-established:
  - "Atomic file write pattern: mkdir -> writeFile tmp -> rename (consistent with CLI mcp-setup)"
  - "Claude Desktop config snippet structure: waiaas-{slug} key with command/args/env"

# Metrics
duration: 4min
completed: 2026-02-13
---

# Phase 99 Plan 01: MCP Token Provisioning Endpoint Summary

**POST /v1/mcp/tokens endpoint combining session creation, atomic token file writing, and Claude Desktop config snippet generation behind masterAuth**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-13T13:19:57Z
- **Completed:** 2026-02-13T13:23:37Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- POST /v1/mcp/tokens endpoint creates session + writes token file + returns Claude Desktop config in one request
- Endpoint protected by masterAuth, validates wallet exists, checks session limits
- Token file written atomically (tmp + rename) at DATA_DIR/mcp-tokens/<walletId>
- 6 integration tests covering happy path, auth, error cases, file writing, DB session creation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create POST /v1/mcp/tokens route + wire into server** - `5d7428f` (feat)
2. **Task 2: Add integration tests for POST /v1/mcp/tokens** - `500fbc5` (test)

## Files Created/Modified
- `packages/daemon/src/api/routes/mcp.ts` - POST /mcp/tokens route handler with session creation, atomic file write, config snippet generation
- `packages/daemon/src/api/routes/openapi-schemas.ts` - McpTokenCreateRequest/Response schemas
- `packages/daemon/src/api/server.ts` - Route registration with masterAuth, dataDir in CreateAppDeps
- `packages/daemon/src/api/index.ts` - Barrel export for mcpTokenRoutes
- `packages/daemon/src/lifecycle/daemon.ts` - Pass dataDir to createApp
- `packages/daemon/src/__tests__/mcp-tokens.test.ts` - 6 integration tests

## Decisions Made
- Copied toSlug() locally (5 lines) rather than creating shared utility package dependency -- avoids cross-package import complexity for trivial function
- dataDir is optional in CreateAppDeps; MCP routes only registered when dataDir is provided, matching graceful degradation pattern
- WAIAAS_BASE_URL uses http://127.0.0.1:{port} since daemon always binds to loopback

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TS error in pipeline/stages.ts (line 700, type comparison) -- not related to our changes, confirmed pre-existing

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- POST /v1/mcp/tokens endpoint ready for Admin UI integration (Plan 99-02)
- Existing CLI `waiaas mcp setup` can be refactored to call this endpoint in future

## Self-Check: PASSED

All 7 files verified present. Both commit hashes (5d7428f, 500fbc5) found in git log.

---
*Phase: 99-mcp-token-management*
*Completed: 2026-02-13*
