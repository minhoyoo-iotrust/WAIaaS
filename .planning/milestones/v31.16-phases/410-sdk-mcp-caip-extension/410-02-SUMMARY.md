---
phase: 410-sdk-mcp-caip-extension
plan: 02
subsystem: mcp
tags: [caip, mcp, resolve-asset, assetId-only]
dependency_graph:
  requires: [Phase 407, Phase 408]
  provides: [resolve_asset MCP tool, assetId-only send_token/approve_token]
  affects: [packages/mcp]
tech_stack:
  added: []
  patterns: [local-caip19-parser, registry-lookup-fallback]
key_files:
  created:
    - packages/mcp/src/tools/resolve-asset.ts
    - packages/mcp/src/__tests__/resolve-asset.test.ts
  modified:
    - packages/mcp/src/server.ts
    - packages/mcp/src/tools/send-token.ts
    - packages/mcp/src/tools/approve-token.ts
    - packages/mcp/src/tools/get-balance.ts
    - packages/mcp/src/tools/get-assets.ts
    - packages/mcp/src/tools/get-tokens.ts
    - packages/mcp/src/tools/call-contract.ts
    - packages/mcp/src/tools/sign-transaction.ts
    - packages/mcp/src/tools/transfer-nft.ts
    - packages/mcp/src/tools/list-nfts.ts
    - packages/mcp/src/tools/get-nft-metadata.ts
    - packages/mcp/src/tools/simulate-transaction.ts
    - packages/mcp/src/tools/list-incoming-transactions.ts
    - packages/mcp/src/__tests__/tools.test.ts
    - packages/mcp/src/__tests__/server.test.ts
decisions:
  - D6: resolve_asset as non-wallet-scoped global MCP tool (no walletContext needed)
  - D8: Local CAIP-19 parser in MCP (no @waiaas/core dependency -- MCP is standalone)
metrics:
  duration: 362s
  completed: "2026-03-14T15:26:09Z"
---

# Phase 410 Plan 02: MCP resolve_asset + assetId-only Support Summary

resolve_asset MCP tool (CAIP-19 metadata lookup) + send_token/approve_token assetId-only + 12 tools CAIP-2 network description

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | resolve_asset MCP tool | 0d5f4aa6 | New tool with local CAIP-19 parser, registry lookup, 5 test cases |
| 2 | send_token/approve_token assetId-only + CAIP-2 descriptions | f8a992a8 | token fields optional in 2 tools, network description in 12 tools, 2 new tests |

## Verification Results

- `pnpm turbo run typecheck --filter=@waiaas/mcp` -- PASSED
- `pnpm vitest run packages/mcp/src/__tests__/` -- 276 tests, 21 files, ALL PASSED

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Server test tool count**
- **Found during:** Task 2
- **Issue:** server.test.ts expected 58 tools but resolve_asset added a 59th
- **Fix:** Updated count to 59 and added `resolve_asset` to `nonWalletScopedTools` set
- **Files modified:** packages/mcp/src/__tests__/server.test.ts
- **Commit:** f8a992a8

## Key Decisions

1. **Local CAIP-19 parser**: MCP package has no dependency on `@waiaas/core`, so a lightweight local parser (`parseAssetIdLocal`) handles CAIP-19 splitting. Avoids cross-package dependency.
2. **Non-wallet-scoped tool**: `resolve_asset` is registered globally (no `walletContext` prefix) since asset resolution is wallet-independent.
3. **Token field optionality**: `address`, `decimals`, `symbol` changed from required to `.optional()` in both `send_token` and `approve_token` to enable assetId-only mode.

## Self-Check: PASSED

All files found. All commits verified.
