---
phase: 63-mcp-server
plan: 01
subsystem: mcp
tags: [mcp, stdio, session-manager, api-client, jwt, model-context-protocol]

# Dependency graph
requires:
  - phase: 61-typescript-sdk
    provides: SDK patterns (HttpClient, WAIaaSError, zero-dep approach)
  - phase: 59-rest-api-expansion
    provides: REST API endpoints (33 routes) that MCP tools proxy to
provides:
  - "@waiaas/mcp package with 6 tools, 3 resources, SessionManager, ApiClient"
  - "stdio transport MCP server for Claude Desktop integration"
  - "JWT token lifecycle management with 60% TTL renewal"
affects: [63-02-mcp-cli-setup, future MCP client integrations]

# Tech tracking
tech-stack:
  added: ["@modelcontextprotocol/sdk ^1.12.0 (resolved 1.26.0)", "@types/node"]
  patterns: ["MCP tool registration via DI (registerXxx(server, apiClient))", "ApiResult discriminated union (ok/error/expired/networkError)", "H-04 isError avoidance for session_expired/networkError"]

key-files:
  created:
    - packages/mcp/package.json
    - packages/mcp/tsconfig.json
    - packages/mcp/vitest.config.ts
    - packages/mcp/src/index.ts
    - packages/mcp/src/server.ts
    - packages/mcp/src/session-manager.ts
    - packages/mcp/src/api-client.ts
    - packages/mcp/src/tools/send-token.ts
    - packages/mcp/src/tools/get-balance.ts
    - packages/mcp/src/tools/get-address.ts
    - packages/mcp/src/tools/list-transactions.ts
    - packages/mcp/src/tools/get-transaction.ts
    - packages/mcp/src/tools/get-nonce.ts
    - packages/mcp/src/resources/wallet-balance.ts
    - packages/mcp/src/resources/wallet-address.ts
    - packages/mcp/src/resources/system-status.ts
    - packages/mcp/src/__tests__/api-client.test.ts
    - packages/mcp/src/__tests__/tools.test.ts
    - packages/mcp/src/__tests__/resources.test.ts
    - packages/mcp/src/__tests__/session-manager.test.ts
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "Import CallToolResult/ReadResourceResult from MCP SDK types.js for type compatibility (avoids index signature mismatch)"
  - "All logging via console.error only (SMGI-D04) -- stdout reserved for stdio JSON-RPC"
  - "ApiResult discriminated union with 4 variants: ok/error/expired/networkError"
  - "H-04: toToolResult never sets isError on session_expired or networkError (prevents Claude Desktop disconnect)"
  - "File > env token priority in SessionManager (SM-04)"
  - "safeSetTimeout wrapper for delays > 2^31-1 ms (SM-08)"
  - "Atomic file write for mcp-token (write .tmp then rename)"

patterns-established:
  - "registerXxx(server, apiClient): DI pattern for MCP tool/resource registration"
  - "toToolResult/toResourceResult: ApiResult-to-MCP format conversion"
  - "SessionManager composition (independent from MCP SDK)"
  - "Degraded mode: MCP server starts even without valid token"

# Metrics
duration: 9min
completed: 2026-02-11
---

# Phase 63 Plan 01: MCP Server + SessionManager + ApiClient Summary

**@waiaas/mcp package with 6 MCP tools, 3 resources, SessionManager (JWT load + 60% TTL renewal), ApiClient (auth proxy), and stdio transport -- 79 tests passing**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-10T23:49:57Z
- **Completed:** 2026-02-10T23:59:13Z
- **Tasks:** 2
- **Files modified:** 21

## Accomplishments
- Created @waiaas/mcp package with @modelcontextprotocol/sdk dependency
- SessionManager loads JWT from file or env, validates exp range (C-03), schedules renewal at 60% TTL
- ApiClient proxies all HTTP calls through SessionManager.getToken() with Bearer auth
- 6 MCP tools: send_token, get_balance, get_address, list_transactions, get_transaction, get_nonce
- 3 MCP resources: waiaas://wallet/balance, waiaas://wallet/address, waiaas://system/status
- H-04 pattern: isError only on actual API errors (not on expired/networkError) to prevent Claude Desktop disconnect
- 79 tests across 4 test files covering all components

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold @waiaas/mcp package + SessionManager + ApiClient** - `83dbbcb` (feat)
2. **Task 2: 6 MCP tools + 3 MCP resources + tests** - `0f21ead` (test)

## Files Created/Modified
- `packages/mcp/package.json` - @waiaas/mcp package definition with MCP SDK dependency
- `packages/mcp/tsconfig.json` - TypeScript config extending base
- `packages/mcp/vitest.config.ts` - Test configuration
- `packages/mcp/src/index.ts` - stdio entrypoint with SIGTERM/SIGINT shutdown
- `packages/mcp/src/server.ts` - createMcpServer factory registering 6 tools + 3 resources
- `packages/mcp/src/session-manager.ts` - JWT token load, validation, renewal scheduling, dispose
- `packages/mcp/src/api-client.ts` - Auth proxy with ApiResult union + toToolResult/toResourceResult helpers
- `packages/mcp/src/tools/send-token.ts` - send_token tool (POST /v1/transactions/send)
- `packages/mcp/src/tools/get-balance.ts` - get_balance tool (GET /v1/wallet/balance)
- `packages/mcp/src/tools/get-address.ts` - get_address tool (GET /v1/wallet/address)
- `packages/mcp/src/tools/list-transactions.ts` - list_transactions tool with cursor/limit pagination
- `packages/mcp/src/tools/get-transaction.ts` - get_transaction tool (GET /v1/transactions/:id)
- `packages/mcp/src/tools/get-nonce.ts` - get_nonce tool (GET /v1/nonce)
- `packages/mcp/src/resources/wallet-balance.ts` - waiaas://wallet/balance resource
- `packages/mcp/src/resources/wallet-address.ts` - waiaas://wallet/address resource
- `packages/mcp/src/resources/system-status.ts` - waiaas://system/status resource
- `packages/mcp/src/__tests__/api-client.test.ts` - 23 tests for ApiClient + toToolResult/toResourceResult
- `packages/mcp/src/__tests__/tools.test.ts` - 23 tests for 6 MCP tools
- `packages/mcp/src/__tests__/resources.test.ts` - 13 tests for 3 MCP resources
- `packages/mcp/src/__tests__/session-manager.test.ts` - 20 tests for SessionManager

## Decisions Made
- Imported `CallToolResult`/`ReadResourceResult` types directly from `@modelcontextprotocol/sdk/types.js` to satisfy MCP SDK's `$loose` index signature requirement (custom interfaces would fail typecheck)
- Used `zod` from MCP SDK peer dependency for tool input schemas (z.string(), z.number(), z.object())
- Added `@types/node` as devDependency (MCP package uses Node.js APIs: fs, process, console)
- Tools/resources created in Task 1 alongside core modules (needed for TypeScript import resolution in server.ts)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @types/node devDependency**
- **Found during:** Task 1 (typecheck)
- **Issue:** TypeScript could not find Node.js types (process, console, fetch, setTimeout)
- **Fix:** Added @types/node to devDependencies
- **Files modified:** packages/mcp/package.json
- **Verification:** `pnpm typecheck --filter @waiaas/mcp` passes
- **Committed in:** 83dbbcb (Task 1 commit)

**2. [Rule 1 - Bug] Fixed MCP SDK type compatibility for return types**
- **Found during:** Task 1 (typecheck)
- **Issue:** Custom ToolResultContent/ResourceResultContent interfaces lacked `[key: string]: unknown` index signature required by MCP SDK's $loose zod schemas
- **Fix:** Imported CallToolResult and ReadResourceResult from @modelcontextprotocol/sdk/types.js instead of custom interfaces
- **Files modified:** packages/mcp/src/api-client.ts
- **Verification:** `pnpm typecheck --filter @waiaas/mcp` passes
- **Committed in:** 83dbbcb (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes required for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP server package complete with full tool/resource coverage
- Ready for 63-02: CLI `mcp setup` command and Claude Desktop config generation
- SessionManager tested with file and env token loading, ready for CLI integration

## Self-Check: PASSED

---
*Phase: 63-mcp-server*
*Completed: 2026-02-11*
