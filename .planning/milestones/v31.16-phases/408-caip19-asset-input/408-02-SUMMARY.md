---
phase: 408-caip19-asset-input
plan: 02
subsystem: daemon/api
tags: [caip-19, asset-resolve, middleware, token-registry, transactions]
dependency_graph:
  requires: [parseAssetId, TokenRegistryService, TokenInfo-assetId-only-mode]
  provides: [resolveTokenFromAssetId, transactions-assetId-integration]
  affects: [transactions.ts, server.ts, stages.ts]
tech_stack:
  added: []
  patterns: [middleware-resolve-pattern, registry-lookup]
key_files:
  created:
    - packages/daemon/src/api/middleware/resolve-asset.ts
    - packages/daemon/src/__tests__/resolve-asset.test.ts
  modified:
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/pipeline/stages.ts
decisions:
  - D1: "resolveTokenFromAssetId placed before humanAmount conversion (decimals dependency)"
  - D2: "User-provided values take precedence over registry (no override)"
  - D3: "Native assetId (slip44) rejects with guidance to use TRANSFER type"
  - D4: "Type assertions in stages.ts for optional TokenInfo fields (guaranteed resolved by route entry)"
metrics:
  duration: 5min
  completed: "2026-03-14"
  tests_added: 11
  tests_total: 34
---

# Phase 408 Plan 02: Registry Resolve Middleware + Network Inference + Transactions Integration Summary

resolveTokenFromAssetId middleware for CAIP-19 registry auto-resolve with network inference, integrated into transaction send/simulate routes.

## What Was Done

### Task 1: resolveTokenFromAssetId middleware + tests (TDD)
- Created `resolveTokenFromAssetId()`: parses assetId, validates network consistency, infers network, lookups registry, fills address/decimals/symbol
- Behaviors: passthrough (no assetId), registry match (auto-fill), registry miss (address only), network mismatch error, address cross-validation, native asset guard, Solana token
- 11 tests covering all scenarios with mocked TokenRegistryService
- Commit: `37194f82`

### Task 2: transactions route integration
- Added `tokenRegistryService` to `TransactionRouteDeps` interface
- Injected via server.ts `transactionRoutes()` call
- Send route: assetId resolve for TOKEN_TRANSFER/APPROVE before humanAmount conversion
- Simulate route: same pattern
- stages.ts: type assertions for optional TokenInfo fields (safe - guaranteed resolved by route entry)
- Commit: `777a7fef`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript type errors in stages.ts**
- **Found during:** Task 2
- **Issue:** Making TokenInfoBaseSchema fields optional caused type errors in pipeline stages that expect `{ address: string; decimals: number; symbol: string }`
- **Fix:** Added type assertions at 4 locations in stages.ts (safe because fields are guaranteed resolved before pipeline entry)
- **Files modified:** packages/daemon/src/pipeline/stages.ts
- **Commit:** 777a7fef

## Verification

- `pnpm vitest run packages/daemon/src/__tests__/resolve-asset.test.ts` -- 11 tests passed
- `pnpm turbo run typecheck --filter=@waiaas/daemon` -- clean
- Network mismatch -> VALIDATION_ERROR confirmed
- Network inference from assetId confirmed
- Registry resolve with user-provided value precedence confirmed
