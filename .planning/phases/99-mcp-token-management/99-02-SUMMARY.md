---
phase: 99-mcp-token-management
plan: 02
subsystem: admin-ui
tags: [admin, preact, mcp, claude-desktop, wallet-detail, ui]

# Dependency graph
requires:
  - phase: 99-mcp-token-management
    provides: POST /v1/mcp/tokens endpoint (session + file + config snippet)
  - phase: 70-admin-wallets-sessions
    provides: WalletDetailView, DetailRow, CopyButton, admin API client
provides:
  - MCP Setup section in Admin wallet detail page
  - One-click MCP token provisioning from Admin UI
  - Claude Desktop config JSON display with copy button
affects: [admin-mcp-complete, bug-013-resolved]

# Tech tracking
tech-stack:
  added: []
  patterns: [inline-section-component-in-page, signal-driven-progressive-disclosure]

key-files:
  created: []
  modified:
    - packages/admin/src/api/endpoints.ts
    - packages/admin/src/pages/wallets.tsx

key-decisions:
  - "Inline McpSetupSection in wallets.tsx rather than separate component file (single-use, tightly coupled to wallet detail)"
  - "Progressive disclosure: show Setup MCP button first, then config + re-provision after success"

patterns-established:
  - "API endpoint constants centralized in endpoints.ts for all admin UI API calls"
  - "Signal-driven UI sections: useSignal for loading/result state, conditional render for before/after"

# Metrics
duration: 2min
completed: 2026-02-13
---

# Phase 99 Plan 02: MCP Token Provisioning Admin UI Summary

**MCP Setup section in wallet detail page with one-click token provisioning and copyable Claude Desktop config JSON**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-13T13:25:43Z
- **Completed:** 2026-02-13T13:27:32Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- MCP Setup section added to Admin wallet detail page with one-click provisioning
- Claude Desktop config JSON displayed in styled code block with Copy Config button
- Token path and expiry shown after successful provisioning
- Re-provision button available after initial setup
- Error handling with toast messages for network/auth failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Add MCP_TOKENS endpoint + MCP Setup section to wallet detail** - `72a2407` (feat)

## Files Created/Modified
- `packages/admin/src/api/endpoints.ts` - Added MCP_TOKENS endpoint constant
- `packages/admin/src/pages/wallets.tsx` - Added McpTokenResult interface, mcpLoading/mcpResult signals, handleMcpSetup handler, MCP Setup section UI

## Decisions Made
- Inline MCP Setup section in wallets.tsx rather than creating a separate component file -- it is single-use and tightly coupled to the wallet detail context
- Progressive disclosure pattern: initial state shows description + Setup button, after provisioning shows config + Re-provision button

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TS error in wallets.tsx line 401 (options[0] possibly undefined in WalletListView.handleChainChange) -- confirmed pre-existing, not caused by our changes
- Pre-existing TS error in pipeline/stages.ts line 700 (type comparison) -- not related to our changes

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- BUG-013 (Admin MCP Token Provisioning) fully resolved: API endpoint (Plan 01) + Admin UI (Plan 02)
- Phase 99 complete -- all MCP token management plans executed

## Self-Check: PASSED

All 2 modified files verified present. Commit hash 72a2407 found in git log.

---
*Phase: 99-mcp-token-management*
*Completed: 2026-02-13*
