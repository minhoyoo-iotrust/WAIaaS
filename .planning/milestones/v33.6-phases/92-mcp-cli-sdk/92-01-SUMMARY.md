---
phase: 92-mcp-cli-sdk
plan: 01
subsystem: mcp, cli
tags: [mcp, cli, wallet-terminology, rename, stdio-transport]

# Dependency graph
requires:
  - phase: 91-daemon-api-jwt-config
    provides: daemon/core wallet terminology rename (agentId -> walletId in API, JWT, DB)
provides:
  - MCP server WalletContext interface + withWalletPrefix function
  - MCP entrypoint WAIAAS_WALLET_ID/WAIAAS_WALLET_NAME env vars
  - SessionManager walletId option for token path isolation
  - CLI --wallet flag and /v1/wallets endpoint usage
  - CLI mcp-setup WAIAAS_WALLET_ID config snippet output
affects: [sdk, mcp-tokens, claude-desktop-config]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - packages/mcp/src/server.ts
    - packages/mcp/src/index.ts
    - packages/mcp/src/session-manager.ts
    - packages/mcp/src/tools/send-token.ts
    - packages/mcp/src/tools/get-balance.ts
    - packages/mcp/src/tools/get-address.ts
    - packages/mcp/src/tools/get-assets.ts
    - packages/mcp/src/tools/list-transactions.ts
    - packages/mcp/src/tools/get-transaction.ts
    - packages/mcp/src/tools/get-nonce.ts
    - packages/mcp/src/resources/wallet-balance.ts
    - packages/mcp/src/resources/wallet-address.ts
    - packages/mcp/src/resources/system-status.ts
    - packages/cli/src/index.ts
    - packages/cli/src/commands/mcp-setup.ts
    - packages/cli/src/utils/slug.ts
    - packages/mcp/src/__tests__/server.test.ts
    - packages/mcp/src/__tests__/session-manager.test.ts
    - packages/mcp/src/__tests__/tools.test.ts
    - packages/cli/src/__tests__/mcp-setup.test.ts
    - packages/cli/src/__tests__/slug.test.ts

key-decisions:
  - "AgentContext -> WalletContext, withAgentPrefix -> withWalletPrefix in MCP server"
  - "WAIAAS_AGENT_ID -> WAIAAS_WALLET_ID, WAIAAS_AGENT_NAME -> WAIAAS_WALLET_NAME env vars"
  - "CLI --agent flag -> --wallet, /v1/agents -> /v1/wallets"
  - "slug.ts fallback 'agent' -> 'wallet'"
  - "fetchAgents -> fetchWallets, setupAgent -> setupWallet, AgentInfo -> WalletInfo"

patterns-established: []

# Metrics
duration: 7min
completed: 2026-02-13
---

# Phase 92 Plan 01: MCP + CLI wallet terminology rename Summary

**MCP WalletContext/withWalletPrefix + CLI --wallet flag + WAIAAS_WALLET_ID env var -- complete agent-to-wallet rename across 21 files**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-13T01:31:18Z
- **Completed:** 2026-02-13T01:38:44Z
- **Tasks:** 2
- **Files modified:** 21

## Accomplishments
- Renamed AgentContext to WalletContext and withAgentPrefix to withWalletPrefix in MCP server + all 10 tool/resource registrations
- Updated MCP entrypoint to use WAIAAS_WALLET_ID and WAIAAS_WALLET_NAME env vars
- Updated SessionManager to use walletId option for per-wallet token path isolation
- Renamed CLI --agent flag to --wallet, /v1/agents endpoint to /v1/wallets
- Updated all mcp-setup functions: fetchAgents -> fetchWallets, setupAgent -> setupWallet, AgentInfo -> WalletInfo
- Updated config snippet to output WAIAAS_WALLET_ID and WAIAAS_WALLET_NAME
- Updated slug.ts fallback from 'agent' to 'wallet'
- All 120 MCP tests and 53 CLI tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: MCP server + tools + resources + entrypoint + session-manager rename** - `cc2e77d` (feat)
2. **Task 2: MCP + CLI test files wallet terminology update + test pass** - `09d4cd1` (test)

## Files Created/Modified
- `packages/mcp/src/server.ts` - WalletContext interface + withWalletPrefix function
- `packages/mcp/src/index.ts` - WAIAAS_WALLET_ID/NAME env vars, walletId/walletName usage
- `packages/mcp/src/session-manager.ts` - walletId option for token path isolation
- `packages/mcp/src/tools/send-token.ts` - WalletContext + withWalletPrefix imports
- `packages/mcp/src/tools/get-balance.ts` - WalletContext + withWalletPrefix imports
- `packages/mcp/src/tools/get-address.ts` - WalletContext + withWalletPrefix imports
- `packages/mcp/src/tools/get-assets.ts` - WalletContext + withWalletPrefix imports
- `packages/mcp/src/tools/list-transactions.ts` - WalletContext + withWalletPrefix imports
- `packages/mcp/src/tools/get-transaction.ts` - WalletContext + withWalletPrefix imports
- `packages/mcp/src/tools/get-nonce.ts` - WalletContext + withWalletPrefix imports
- `packages/mcp/src/resources/wallet-balance.ts` - WalletContext + withWalletPrefix imports
- `packages/mcp/src/resources/wallet-address.ts` - WalletContext + withWalletPrefix imports
- `packages/mcp/src/resources/system-status.ts` - WalletContext + withWalletPrefix imports
- `packages/cli/src/index.ts` - --wallet flag replaces --agent
- `packages/cli/src/commands/mcp-setup.ts` - fetchWallets, setupWallet, WAIAAS_WALLET_ID config
- `packages/cli/src/utils/slug.ts` - 'wallet' fallback, wallet terminology in JSDoc
- `packages/mcp/src/__tests__/server.test.ts` - withWalletPrefix, walletName tests
- `packages/mcp/src/__tests__/session-manager.test.ts` - walletId token path tests
- `packages/mcp/src/__tests__/tools.test.ts` - walletId in mock response data
- `packages/cli/src/__tests__/mcp-setup.test.ts` - /v1/wallets, --wallet, WAIAAS_WALLET_ID
- `packages/cli/src/__tests__/slug.test.ts` - 'wallet' fallback, wallets variable names

## Decisions Made
- AgentContext -> WalletContext, withAgentPrefix -> withWalletPrefix in MCP server
- WAIAAS_AGENT_ID -> WAIAAS_WALLET_ID, WAIAAS_AGENT_NAME -> WAIAAS_WALLET_NAME env vars
- CLI --agent flag -> --wallet, /v1/agents -> /v1/wallets API endpoint
- slug.ts fallback changed from 'agent' to 'wallet'
- All internal function/interface renames: fetchAgents -> fetchWallets, setupAgent -> setupWallet, AgentInfo -> WalletInfo

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- MCP and CLI packages fully use wallet terminology
- Ready for 92-02 (SDK wallet terminology rename)
- Zero occurrences of AgentContext, withAgentPrefix, WAIAAS_AGENT_ID, WAIAAS_AGENT_NAME, or fetchAgents in MCP/CLI packages

---
*Phase: 92-mcp-cli-sdk*
*Completed: 2026-02-13*
