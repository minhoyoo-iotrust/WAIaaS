---
phase: 408-caip19-asset-input
plan: 01
subsystem: core/caip
tags: [caip-19, asset-resolve, schema, token-info]
dependency_graph:
  requires: [caip2-network-map, caip19-parser]
  provides: [parseAssetId, extractNetworkFromAssetId, TokenInfo-assetId-only-mode]
  affects: [transaction.schema.ts, daemon/resolve-asset]
tech_stack:
  added: []
  patterns: [superRefine-cross-field-validation, CAIP-19-parsing]
key_files:
  created:
    - packages/core/src/caip/asset-resolve.ts
    - packages/core/src/__tests__/asset-resolve.test.ts
  modified:
    - packages/core/src/caip/index.ts
    - packages/core/src/index.ts
    - packages/core/src/interfaces/index.ts
    - packages/core/src/schemas/transaction.schema.ts
decisions:
  - D1: "slip44 namespace -> isNative=true, address=null (native asset detection)"
  - D2: "TokenInfoBaseSchema fields all optional, superRefine enforces required-ness based on assetId presence"
metrics:
  duration: 3min
  completed: "2026-03-14"
  tests_added: 13
  tests_total: 852
---

# Phase 408 Plan 01: CAIP-19 Asset Resolve Utility + TokenInfo SuperRefine Summary

parseAssetId utility for CAIP-19 parsing with network resolution + TokenInfo schema extended to assetId-only mode via superRefine cross-field validation.

## What Was Done

### Task 1: CAIP-19 asset resolve utility + tests (TDD)
- Created `parseAssetId()`: parses CAIP-19 string, resolves WAIaaS network via caip2ToNetwork, returns ParsedAssetId (chainId, namespace, address, network, isNative)
- Created `extractNetworkFromAssetId()`: convenience wrapper returning only network
- Re-exported from `caip/index.ts`, `interfaces/index.ts`, `core/index.ts`
- 13 tests: EVM erc20, Polygon erc20, Solana token, native slip44 (ETH/SOL), unknown CAIP-2 error, invalid format, Arbitrum
- Commit: `7b607988`

### Task 2: TokenInfo superRefine assetId-only cross-field validation
- TokenInfoBaseSchema: address, decimals, symbol all `.optional()`
- superRefine rules:
  - No assetId: address/decimals/symbol all required (backward compat)
  - assetId provided: all optional (registry resolve deferred to Plan 02)
  - assetId + address: case-insensitive cross-validation preserved
- All 852 core tests pass (799 existing + 13 new + 40 from other test files)
- Commit: `b6703410`

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `pnpm vitest run packages/core/` -- 45 test files, 852 tests passed
- TokenInfo `{ assetId: "eip155:1/erc20:0xa0b8..." }` alone passes validation
- TokenInfo `{ address: "0x...", decimals: 6, symbol: "USDC" }` legacy passes
- TokenInfo `{}` (no assetId, no address) fails validation
