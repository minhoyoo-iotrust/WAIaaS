---
phase: 400
plan: "01"
subsystem: rpc-proxy
tags: [rpc-proxy, hono, sessionAuth, dispatcher]
dependency_graph:
  requires: [399-01, 399-02, 399-03]
  provides: [RpcDispatcher, rpcProxyRoutes, validateAndFillFrom]
  affects: [server.ts, rpc-proxy/index.ts]
tech_stack:
  added: []
  patterns: [dispatcher-pattern, route-factory, from-validation]
key_files:
  created:
    - packages/daemon/src/rpc-proxy/dispatcher.ts
    - packages/daemon/src/api/routes/rpc-proxy.ts
    - packages/daemon/src/__tests__/rpc-proxy/dispatcher.test.ts
  modified:
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/rpc-proxy/index.ts
decisions:
  - CompletionWaiter/SyncPipelineExecutor lazy-init when EventBus available (nullable pattern)
  - RpcDispatcher constructed per-request after infra checks (passthrough + methodHandlers)
  - validateAndFillFrom exported for direct unit testing
  - checkBytecodeSize integrated inline with configurable SettingsService limit
metrics:
  duration: ~5min
  completed: 2026-03-13
---

# Phase 400 Plan 01: RpcDispatcher + Hono Route + sessionAuth Summary

RpcDispatcher orchestrates 3-way method classification (intercept/passthrough/unsupported) with single+batch dispatch, exposed via POST /v1/rpc-evm/:walletId/:chainId with sessionAuth middleware, Content-Type enforcement, and bytecodeSize limit.

## What Was Done

### Task 1: RpcDispatcher + route file + server.ts wiring
- Created `RpcDispatcher` class with `dispatch()` and `dispatchBatch()` methods
- Created `rpc-proxy.ts` Hono route with full pipeline deps wiring
- Added `validateAndFillFrom` helper for SEC-02/SEC-03 from field validation
- Added `checkBytecodeSize` helper for SEC-05 bytecode limit enforcement
- Updated `server.ts` with sessionAuth for `/v1/rpc-evm/*` and route registration
- Updated barrel export with RpcDispatcher

### Task 2: RpcDispatcher unit tests
- 10 tests covering: intercept, passthrough, unsupported, batch, notification filtering, classification, null id

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CompletionWaiter requires non-optional EventBus**
- **Found during:** Task 1
- **Issue:** CompletionWaiter constructor requires `EventBus` (not `EventBus | undefined`)
- **Fix:** Lazy-init CompletionWaiter + SyncPipelineExecutor only when EventBus is available, with null check at dispatch time
- **Files modified:** packages/daemon/src/api/routes/rpc-proxy.ts

**2. [Rule 2 - Critical functionality] from validation + bytecodeSize included proactively**
- **Found during:** Task 1
- **Issue:** Plans 400-02 and 400-03 specify these as separate tasks, but they're needed for correct route behavior
- **Fix:** Included validateAndFillFrom and checkBytecodeSize directly in the route handler
- **Files modified:** packages/daemon/src/api/routes/rpc-proxy.ts

## Verification

- All 10 new dispatcher tests pass
- All 93 existing rpc-proxy tests continue to pass
- No new type errors introduced (pre-existing errors in daemon.ts, completion-waiter.ts unchanged)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1+2 | c15e82ec | feat(400-01): add RpcDispatcher, Hono route, and sessionAuth for EVM RPC proxy |
