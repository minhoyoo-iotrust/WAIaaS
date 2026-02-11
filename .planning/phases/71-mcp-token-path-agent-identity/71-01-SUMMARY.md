---
phase: 71-mcp-token-path-agent-identity
plan: 01
subsystem: mcp
tags: [mcp, session-manager, agent-identity, token-path, env-vars]

# Dependency graph
requires:
  - phase: 63-mcp-hardening
    provides: SessionManager with renewal/recovery, MCP server with 6 tools + 3 resources
provides:
  - agentId-aware token path routing in SessionManager (mcp-tokens/<agentId>)
  - agentName-aware server naming (waiaas-{agentName}) and description prefix
  - WAIAAS_AGENT_ID / WAIAAS_AGENT_NAME environment variable wiring
  - Backward-compatible fallback to legacy mcp-token path
affects: [72-daemon-agent-registry, mcp-multi-agent]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AgentContext pattern: optional context passed through createMcpServer to all register functions"
    - "withAgentPrefix helper: description prefixing for multi-agent identification"
    - "resolveTokenPath/legacyTokenPath: per-agent file isolation with fallback"

key-files:
  created:
    - packages/mcp/src/__tests__/server.test.ts
  modified:
    - packages/mcp/src/session-manager.ts
    - packages/mcp/src/server.ts
    - packages/mcp/src/index.ts
    - packages/mcp/src/tools/send-token.ts
    - packages/mcp/src/tools/get-balance.ts
    - packages/mcp/src/tools/get-address.ts
    - packages/mcp/src/tools/get-nonce.ts
    - packages/mcp/src/tools/get-transaction.ts
    - packages/mcp/src/tools/list-transactions.ts
    - packages/mcp/src/resources/wallet-balance.ts
    - packages/mcp/src/resources/wallet-address.ts
    - packages/mcp/src/resources/system-status.ts
    - packages/mcp/src/__tests__/session-manager.test.ts

key-decisions:
  - "agentId routes token to mcp-tokens/<agentId> subdirectory, not separate filename in same dir"
  - "Fallback reads legacy mcp-token on ENOENT only (not on other errors)"
  - "withAgentPrefix as exported helper for consistent [agentName] prefix pattern"
  - "AgentContext passed as optional param to all register functions (not global state)"

patterns-established:
  - "AgentContext DI: optional agentContext parameter threaded from createMcpServer through all registrations"
  - "Token path isolation: mcp-tokens/<agentId> directory for multi-agent, mcp-token file for single-agent"

# Metrics
duration: 4min
completed: 2026-02-11
---

# Phase 71 Plan 01: MCP Token Path + Agent Identity Summary

**Per-agent token path isolation (mcp-tokens/<agentId>) with legacy fallback, and agentName-based server naming + description prefix for multi-agent MCP identification**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-11T12:19:48Z
- **Completed:** 2026-02-11T12:24:06Z
- **Tasks:** 2
- **Files modified:** 14 (1 created, 13 modified)

## Accomplishments
- SessionManager routes token read/write to `DATA_DIR/mcp-tokens/<agentId>` when agentId is set (TOKEN-01)
- Backward compatible: no agentId keeps `DATA_DIR/mcp-token` path (TOKEN-02)
- Fallback: new path ENOENT falls back to legacy mcp-token (TOKEN-03)
- Token renewal always writes to agentId-specific path (TOKEN-04)
- Server name becomes `waiaas-{agentName}` when WAIAAS_AGENT_NAME set (MCPS-01)
- All 6 tools + 3 resources get `[agentName]` description prefix (MCPS-03)
- WAIAAS_AGENT_ID and WAIAAS_AGENT_NAME env vars wired in index.ts
- 14 new tests (6 agentId path + 8 server/prefix), 113 total passing

## Task Commits

Each task was committed atomically:

1. **Task 1: SessionManager agentId token path separation + fallback + tests** - `3bbef97` (feat)
2. **Task 2: createMcpServer agentContext + description prefix + env vars** - `382333d` (feat)

## Files Created/Modified
- `packages/mcp/src/session-manager.ts` - agentId field, resolveTokenPath(), legacyTokenPath(), fallback in readMcpToken()
- `packages/mcp/src/server.ts` - AgentContext interface, withAgentPrefix helper, createMcpServer agentContext param
- `packages/mcp/src/index.ts` - WAIAAS_AGENT_ID/WAIAAS_AGENT_NAME env var reading, passed to SessionManager/createMcpServer
- `packages/mcp/src/tools/send-token.ts` - agentContext param + withAgentPrefix
- `packages/mcp/src/tools/get-balance.ts` - agentContext param + withAgentPrefix
- `packages/mcp/src/tools/get-address.ts` - agentContext param + withAgentPrefix
- `packages/mcp/src/tools/get-nonce.ts` - agentContext param + withAgentPrefix
- `packages/mcp/src/tools/get-transaction.ts` - agentContext param + withAgentPrefix
- `packages/mcp/src/tools/list-transactions.ts` - agentContext param + withAgentPrefix
- `packages/mcp/src/resources/wallet-balance.ts` - agentContext param + withAgentPrefix
- `packages/mcp/src/resources/wallet-address.ts` - agentContext param + withAgentPrefix
- `packages/mcp/src/resources/system-status.ts` - agentContext param + withAgentPrefix
- `packages/mcp/src/__tests__/session-manager.test.ts` - 6 new agentId token path tests
- `packages/mcp/src/__tests__/server.test.ts` - 8 new tests (withAgentPrefix + createMcpServer)

## Decisions Made
- agentId routes to `mcp-tokens/<agentId>` subdirectory (not same-dir filename pattern) for clean isolation
- Fallback only on ENOENT (file not found), other errors propagate normally
- `withAgentPrefix` is an exported helper so future tools/resources can reuse it
- AgentContext is threaded as an optional parameter (DI), not stored as global/module state

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- server.test.ts initially used `require()` for mock access which failed in ESM mode. Switched to importing `McpServer` directly and using `vi.mocked()` on the import. Resolved in same commit.
- Unused `MockMcpServer` variable from initial test approach caught by `tsc` build. Removed immediately.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- MCP token path isolation complete, ready for multi-agent daemon registry (Phase 72)
- All existing tests maintain backward compatibility
- No blockers

## Self-Check: PASSED

---
*Phase: 71-mcp-token-path-agent-identity*
*Completed: 2026-02-11*
